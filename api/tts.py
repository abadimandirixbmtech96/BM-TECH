"""
BM-TECH Jarvis: suara natural (Microsoft Edge "Baca Nyaring") lewat pustaka edge-tts.

  POST /api/tts            body {text, voice, rate, pitch} -> audio/mpeg (MP3)
  GET  /api/tts?voices=1   -> daftar SEMUA suara yang tersedia

Hanya admin BM-TECH yang sudah login (token Supabase diperiksa ke server Supabase + RPC is_admin).
Teks tidak disimpan; MP3 hanya diingat sebentar di memori fungsi (teks + suara yang sama = lebih cepat).
Layanan Microsoft ini tidak resmi untuk pengembang: bila gagal, aplikasi otomatis memakai suara bawaan HP.
Bila Microsoft mengubah aturannya, cukup naikkan versi edge-tts di requirements.txt lalu Redeploy.
"""
import asyncio
import json
import re
import time
import urllib.request
from collections import OrderedDict
from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs, urlparse

import edge_tts

VERSION = "bm-tts-v1-2026-11-13"
SUPABASE_URL = "https://zgzmbneqqzxnptbmlhsz.supabase.co"
SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpnem1ibmVxcXp4bnB0Ym1saHN6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc3OTU0ODksImV4cCI6MjEwMzM3MTQ4OX0.MQOtu5Pg2PtxIu18joKDd0dOA17cPEazmlL0Xl3Vz7E"

MAX_TEXT = 1500
VOICE_RE = re.compile(r"^[a-z]{2,3}-[A-Za-z0-9]{2,8}(-[A-Za-z0-9]{2,8})?-[A-Za-z0-9]+(Multilingual)?Neural$")
ADMIN_CACHE = {}          # token -> (waktu, boleh)
AUDIO_CACHE = OrderedDict()  # (voice, rate, pitch, text) -> mp3
AUDIO_CACHE_MAX = 60
VOICES = {"t": 0, "data": None}


def _json(handler, code, obj):
    body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
    handler.send_response(code)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Cache-Control", "no-store")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def _http_json(url, token, data=None):
    req = urllib.request.Request(url, data=data, method="POST" if data is not None else "GET")
    req.add_header("apikey", SUPABASE_ANON_KEY)
    req.add_header("Authorization", "Bearer " + token)
    req.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(req, timeout=8) as r:
        return json.loads(r.read().decode("utf-8") or "null")


def is_admin(token):
    if not token or len(token) > 4000:
        return False
    hit = ADMIN_CACHE.get(token)
    if hit and time.time() - hit[0] < 300:
        return hit[1]
    try:
        user = _http_json(SUPABASE_URL + "/auth/v1/user", token)
        ok = bool(user and user.get("id")) and _http_json(SUPABASE_URL + "/rest/v1/rpc/is_admin", token, b"{}") is True
    except Exception:
        return False
    if len(ADMIN_CACHE) > 200:
        ADMIN_CACHE.clear()
    ADMIN_CACHE[token] = (time.time(), ok)
    return ok


def clamp_pct(v, lo, hi):
    try:
        n = int(round(float(v)))
    except Exception:
        n = 0
    return max(lo, min(hi, n))


async def _synth(text, voice, rate, pitch):
    com = edge_tts.Communicate(text, voice, rate=rate, pitch=pitch, connect_timeout=8, receive_timeout=20)
    out = bytearray()
    async for chunk in com.stream():
        if chunk.get("type") == "audio" and chunk.get("data"):
            out.extend(chunk["data"])
    return bytes(out)


def _voice_row(v):
    tag = v.get("VoiceTag") or {}
    short = v.get("ShortName") or ""
    nama = short.split("-")[-1].replace("MultilingualNeural", " Multibahasa").replace("Neural", "").strip()
    return {
        "id": short,
        "nama": nama or short,
        "locale": v.get("Locale") or "-".join(short.split("-")[:2]),
        "gender": v.get("Gender") or "",
        "gaya": ", ".join((tag.get("VoicePersonalities") or [])[:3]),
    }


class handler(BaseHTTPRequestHandler):
    def _token(self):
        a = self.headers.get("Authorization") or ""
        return a[7:].strip() if a.lower().startswith("bearer ") else ""

    def do_GET(self):
        q = parse_qs(urlparse(self.path).query)
        if "tes" in q:
            return _json(self, 200, {"ok": True, "versi": VERSION, "edge_tts": getattr(edge_tts, "__version__", "?")})
        if not is_admin(self._token()):
            return _json(self, 401, {"error": "Masuk sebagai admin dulu"})
        if "voices" in q:
            if not VOICES["data"] or time.time() - VOICES["t"] > 6 * 3600:
                try:
                    data = asyncio.run(edge_tts.list_voices())
                except Exception as e:
                    return _json(self, 502, {"error": "Daftar suara Microsoft gagal dimuat: " + str(e)[:160]})
                VOICES["data"] = sorted((_voice_row(v) for v in data if v.get("ShortName")), key=lambda x: (x["locale"], x["nama"]))
                VOICES["t"] = time.time()
            return _json(self, 200, {"ok": True, "jumlah": len(VOICES["data"]), "suara": VOICES["data"]})
        return _json(self, 400, {"error": "Permintaan tidak dikenal"})

    def do_POST(self):
        if not is_admin(self._token()):
            return _json(self, 401, {"error": "Masuk sebagai admin dulu"})
        try:
            n = int(self.headers.get("Content-Length") or 0)
            body = json.loads(self.rfile.read(min(n, 20000)).decode("utf-8") or "{}") if n else {}
        except Exception:
            return _json(self, 400, {"error": "Data tidak terbaca"})
        text = re.sub(r"\s+", " ", str(body.get("text") or "")).strip()
        voice = str(body.get("voice") or "id-ID-ArdiNeural")
        if not text:
            return _json(self, 400, {"error": "Teks kosong"})
        if len(text) > MAX_TEXT:
            return _json(self, 400, {"error": "Teks terlalu panjang (maks %d huruf per potong)" % MAX_TEXT})
        if not VOICE_RE.match(voice):
            return _json(self, 400, {"error": "Nama suara tidak sah"})
        rate = clamp_pct(body.get("rate"), -50, 100)
        pitch = clamp_pct(body.get("pitch"), -30, 30)
        rate_s, pitch_s = ("%+d%%" % rate), ("%+dHz" % pitch)
        key = (voice, rate_s, pitch_s, text)
        mp3 = AUDIO_CACHE.get(key)
        if mp3 is None:
            last = None
            for _ in range(2):   # gangguan sesaat: coba sekali lagi
                try:
                    mp3 = asyncio.run(_synth(text, voice, rate_s, pitch_s))
                    if mp3:
                        break
                    last = "tidak ada suara yang dikirim"
                except Exception as e:
                    last = type(e).__name__ + ": " + str(e)[:160]
                    mp3 = None
            if not mp3:
                return _json(self, 502, {"error": "Layanan suara Microsoft gagal: " + (last or "tanpa alasan")})
            AUDIO_CACHE[key] = mp3
            while len(AUDIO_CACHE) > AUDIO_CACHE_MAX:
                AUDIO_CACHE.popitem(last=False)
        else:
            AUDIO_CACHE.move_to_end(key)
        self.send_response(200)
        self.send_header("Content-Type", "audio/mpeg")
        self.send_header("Cache-Control", "private, max-age=86400")
        self.send_header("Content-Length", str(len(mp3)))
        self.send_header("X-Voice", voice)
        self.end_headers()
        self.wfile.write(mp3)
