/*!
 * bm-voice.js — suara Jarvis.
 *  - Mesin "Edge (natural)": suara neural Microsoft lewat /api/tts (semua suara/bahasa bisa dipilih).
 *  - Mesin "Suara HP": speechSynthesis bawaan browser. Juga jadi CADANGAN otomatis bila Edge gagal.
 *  - Jawaban dipecah per kalimat: kalimat pertama langsung diputar, kalimat berikutnya disiapkan sambil berjalan.
 *  - Lembar pengaturan rapi: mesin, suara terpilih, kecepatan, nada, daftar semua suara per bahasa + coba dengar.
 *
 *   BMVoice.init({ token: async () => 'jwt' })
 *   BMVoice.speak(text, { done })   BMVoice.stop()   BMVoice.openSettings()   BMVoice.speaking()
 *   Pengaturan disimpan di localStorage 'bm-voice-v1' (dipakai halaman Jarvis & tombol Jarvis melayang).
 */
(function () {
  'use strict';
  if (window.BMVoice) return;
  var API = '/api/tts', K_SET = 'bm-voice-v1', K_LIST = 'bm-voice-list-v1';
  var DEF = { engine: 'edge', voice: 'id-ID-ArdiNeural', rate: 0, pitch: 0 };
  var CFG = { token: function () { return Promise.resolve(''); } };
  var canHp = 'speechSynthesis' in window;
  var state = { run: 0, audio: null, ctrl: [], urls: [], playing: false };
  var health = { downUntil: 0, lastErr: '', lastAt: 0, lastOk: 0 };

  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} return null; }
  function settings() { var s = {}; try { s = JSON.parse(ls(K_SET) || '{}') || {}; } catch (e) {} return Object.assign({}, DEF, s); }
  function save(s) { ls(K_SET, JSON.stringify({ engine: s.engine, voice: s.voice, rate: s.rate, pitch: s.pitch })); }
  var IC = {
    play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" fill="currentColor"/></svg>',
    stop: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6.5" y="6.5" width="11" height="11" rx="2" fill="currentColor"/></svg>',
    x: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
    chev: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
  };
  function setBtn(b, icon, label) { b.innerHTML = IC[icon] + (label ? '<span>' + label + '</span>' : ''); }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function localeOf(id) { var p = String(id || '').split('-'); return p.length >= 3 && p[1].length === 4 ? p.slice(0, 3).join('-') : p.slice(0, 2).join('-'); }

  /* ---------- teks -> ucapan ---------- */
  var SAT = ['', 'satu', 'dua', 'tiga', 'empat', 'lima', 'enam', 'tujuh', 'delapan', 'sembilan', 'sepuluh', 'sebelas'];
  function terbilang(n) {
    n = Math.floor(Math.abs(n));
    if (n < 12) return SAT[n];
    if (n < 20) return terbilang(n - 10) + ' belas';
    if (n < 100) return terbilang(Math.floor(n / 10)) + ' puluh' + (n % 10 ? ' ' + terbilang(n % 10) : '');
    if (n < 200) return 'seratus' + (n - 100 ? ' ' + terbilang(n - 100) : '');
    if (n < 1000) return terbilang(Math.floor(n / 100)) + ' ratus' + (n % 100 ? ' ' + terbilang(n % 100) : '');
    if (n < 2000) return 'seribu' + (n - 1000 ? ' ' + terbilang(n - 1000) : '');
    if (n < 1e6) return terbilang(Math.floor(n / 1000)) + ' ribu' + (n % 1000 ? ' ' + terbilang(n % 1000) : '');
    if (n < 1e9) return terbilang(Math.floor(n / 1e6)) + ' juta' + (n % 1e6 ? ' ' + terbilang(n % 1e6) : '');
    if (n < 1e12) return terbilang(Math.floor(n / 1e9)) + ' miliar' + (n % 1e9 ? ' ' + terbilang(n % 1e9) : '');
    return String(n);
  }
  function clean(text, indo) {
    var t = String(text || '')
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/https?:\/\/\S+/g, ' tautan ')
      .replace(/^\s*\|.*\|\s*$/gm, ' ')                       // baris tabel
      .replace(/^\s{0,3}(#{1,6}|[-*•]|\d+[.)])\s+/gm, '')      // judul & butir daftar
      .replace(/[*_`~#>|]+/g, ' ')
      .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, ' ')
      .replace(/[→⇒]/g, indo ? ' menjadi ' : ' to ').replace(/[✓✔]/g, ' ').replace(/[✗✘]/g, ' ');
    if (indo) {
      t = t.replace(/Rp\.?\s?(-?)(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?/gi, function (m, neg, a) { var n = Number(a.replace(/\./g, '')); return (neg ? 'minus ' : '') + (n === 0 ? 'nol' : terbilang(n)) + ' rupiah'; })
        .replace(/(\d)\s?%/g, '$1 persen')
        .replace(/\bdtk\b/gi, 'detik').replace(/\bpcs\b/gi, 'pis').replace(/\bdll\b/gi, 'dan lain-lain').replace(/\bdsb\b/gi, 'dan sebagainya')
        .replace(/\bs\/d\b/gi, 'sampai').replace(/\byg\b/gi, 'yang').replace(/\bOS\s?(\d{2,3})\b/g, 'O S $1').replace(/\bSTD\b/g, 'standar');
    }
    return t.replace(/\s+/g, ' ').trim();
  }
  function chunks(text, rest) {
    var parts = text.match(/[^.!?…]+[.!?…]+["')\]]*\s*|[^.!?…]+$/g) || [text], out = [], cur = '';
    parts.forEach(function (p) {
      p = p.trim(); if (!p) return;
      while (p.length > 260) { var cut = p.lastIndexOf(', ', 240); if (cut < 80) cut = p.lastIndexOf(' ', 240); if (cut < 40) cut = 240; out.push((cur ? cur + ' ' : '') + p.slice(0, cut + 1).trim()); cur = ''; p = p.slice(cut + 1).trim(); }
      var lim = (out.length || rest) ? 240 : 110;   // potongan pertama pendek supaya suara cepat mulai
      if (cur && (cur + ' ' + p).length > lim) { out.push(cur); cur = p; } else cur = cur ? cur + ' ' + p : p;
    });
    if (cur) out.push(cur);
    return rest ? out : out.slice(0, 24);
  }

  /* ---------- suara HP ---------- */
  function hpSpeak(text, lang, rate, done) {
    if (!canHp || !text) { done && done(); return; }
    try {
      var u = new SpeechSynthesisUtterance(text); u.lang = lang || 'id-ID'; u.rate = Math.max(.5, Math.min(2, 1.03 * (1 + (rate || 0) / 100)));
      var vs = speechSynthesis.getVoices(), low = u.lang.toLowerCase(), pre = low.slice(0, 2);
      var v = vs.filter(function (x) { return x.lang && x.lang.toLowerCase().replace('_', '-') === low; })[0] || vs.filter(function (x) { return x.lang && x.lang.toLowerCase().slice(0, 2) === pre; })[0];
      if (v) u.voice = v;
      u.onend = u.onerror = function () { done && done(); };
      speechSynthesis.speak(u);
    } catch (e) { done && done(); }
  }

  /* ---------- suara Edge ---------- */
  async function fetchMp3(text, s, ctrl) {
    var tk = await CFG.token();
    var to = setTimeout(function () { try { ctrl.abort(); } catch (e) {} }, 15000);
    try {
      var r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (tk || '') }, body: JSON.stringify({ text: text, voice: s.voice, rate: s.rate, pitch: s.pitch }), signal: ctrl.signal });
      if (!r.ok) { var j = await r.json().catch(function () { return {}; }); throw new Error(j.error || ('HTTP ' + r.status)); }
      var b = await r.blob(); if (!b.size) throw new Error('suara kosong');
      return URL.createObjectURL(b);
    } finally { clearTimeout(to); }
  }
  function stop() {
    state.run++;
    state.ctrl.forEach(function (c) { try { c.abort(); } catch (e) {} }); state.ctrl = [];
    if (state.audio) { try { state.audio.pause(); state.audio.removeAttribute('src'); state.audio.load(); } catch (e) {} }
    state.urls.forEach(function (u) { try { URL.revokeObjectURL(u); } catch (e) {} }); state.urls = [];
    if (canHp) try { speechSynthesis.cancel(); } catch (e) {}
    state.playing = false;
  }
  /* text: string, atau array bagian (paragraf). opts.onSeg(i) dipanggil saat bagian ke-i mulai dibaca. */
  function speak(text, opts) {
    opts = opts || {}; stop();
    var s = Object.assign(settings(), opts.override || {}), loc = localeOf(s.voice), indo = /^id/i.test(loc);
    var done = opts.done || function () {}, run = state.run, list = [];
    if (Array.isArray(text)) {
      text.forEach(function (sg, si) { chunks(clean(String(sg || ''), indo), list.length > 0).forEach(function (c) { list.push({ t: c, seg: si }); }); });
      list = list.slice(0, 160);
    } else chunks(clean(String(text || ''), indo)).forEach(function (c) { list.push({ t: c, seg: 0 }); });
    if (!list.length) { done(); return; }
    var finish = function () { if (run === state.run) { state.playing = false; done(); } };
    var lastSeg = -1, mark = function (i) { if (opts.onSeg && list[i].seg !== lastSeg) { lastSeg = list[i].seg; try { opts.onSeg(lastSeg); } catch (e) {} } };
    state.playing = true;
    var hpFrom = function (i) {                                   // suara HP, per kalimat supaya penanda tetap jalan
      if (run !== state.run) return;
      if (i >= list.length) return finish();
      mark(i); hpSpeak(list[i].t, loc, s.rate, function () { if (run === state.run) setTimeout(function () { hpFrom(i + 1); }, 0); });
    };
    if (s.engine !== 'edge' || (Date.now() < health.downUntil && !opts.override)) return hpFrom(0);
    var jobs = [];
    function job(i) {
      if (i >= list.length) return null;
      if (!jobs[i]) { var c = new AbortController(); state.ctrl.push(c); jobs[i] = fetchMp3(list[i].t, s, c).then(function (u) { state.urls.push(u); return u; }); jobs[i].catch(function () {}); }
      return jobs[i];
    }
    if (!state.audio) state.audio = new Audio();
    var au = state.audio;
    (function play(i) {
      if (run !== state.run) return;
      if (i >= list.length) return finish();
      job(i); job(i + 1); job(i + 2);                             // siapkan kalimat berikutnya sambil berjalan
      jobs[i].then(function (url) {
        if (run !== state.run) return;
        health.lastOk = Date.now();
        au.onended = function () { play(i + 1); };
        au.onerror = function () { health.lastErr = 'MP3 tidak bisa diputar'; health.lastAt = Date.now(); hpFrom(i); };
        au.src = url; mark(i);
        var p = au.play(); if (p && p.catch) p.catch(function (e) { health.lastErr = 'Pemutar diblokir browser: ' + (e && e.message || e); health.lastAt = Date.now(); hpFrom(i); });
      }, function (e) {
        if (run !== state.run) return;
        health.lastErr = String((e && e.message) || e).slice(0, 160); health.lastAt = Date.now();
        if (!opts.override) health.downUntil = Date.now() + 120000;   // 2 menit pakai suara HP, lalu dicoba lagi
        if (opts.onError) opts.onError(health.lastErr);
        hpFrom(i);
      });
    })(0);
  }

  /* ---------- daftar suara ---------- */
  async function voiceList(force) {
    if (!force) { try { var c = JSON.parse(ls(K_LIST) || 'null'); if (c && Array.isArray(c.data) && Date.now() - c.t < 864e5) return c.data; } catch (e) {} }
    var tk = await CFG.token();
    var r = await fetch(API + '?voices=1', { headers: { Authorization: 'Bearer ' + (tk || '') } });
    var j = await r.json().catch(function () { return {}; });
    if (!r.ok || !Array.isArray(j.suara)) throw new Error(j.error || ('HTTP ' + r.status));
    ls(K_LIST, JSON.stringify({ t: Date.now(), data: j.suara }));
    return j.suara;
  }
  var DN = null; try { DN = new Intl.DisplayNames(['id'], { type: 'language' }); } catch (e) {}
  var RN = null; try { RN = new Intl.DisplayNames(['id'], { type: 'region' }); } catch (e) {}
  function langName(loc) {
    var p = String(loc).split('-'), l = p[0], reg = p[p.length - 1];
    var a = ''; try { a = DN ? DN.of(l) : l; } catch (e) { a = l; }
    var b = ''; try { b = RN && /^[A-Z]{2}$/.test(reg) ? RN.of(reg) : ''; } catch (e) {}
    a = a ? a.charAt(0).toUpperCase() + a.slice(1) : l;
    return b ? a + ' (' + b + ')' : a;
  }
  var SAMPLE = {
    id: 'Halo, saya Jarvis. Siap membantu catatan bengkel hari ini. Total omzet Rp1.250.000.',
    jv: 'Halo, aku Jarvis. Siap mbantu nyathet bengkel dina iki.',
    su: 'Halo, abdi Jarvis. Siap ngabantosan nyatet bengkel dinten ieu.',
    ms: 'Helo, saya Jarvis. Sedia membantu catatan bengkel hari ini.',
    en: "Hello, I'm Jarvis. Ready to help with today's workshop records.",
    ja: 'こんにちは、ジャービスです。今日の記録をお手伝いします。',
    zh: '你好，我是贾维斯。今天的记录交给我吧。',
    ar: 'مرحبا، أنا جارفيس. جاهز للمساعدة اليوم.',
    ko: '안녕하세요, 자비스입니다. 오늘 기록을 도와드릴게요.'
  };
  function sampleFor(v) { var l = String(v.locale || v.id).split('-')[0]; if (/Multilingual/i.test(v.id)) return SAMPLE.id; return SAMPLE[l] || SAMPLE.en; }
  function genderTxt(g) { return /^male$/i.test(g) ? 'Pria' : /^female$/i.test(g) ? 'Wanita' : (g || ''); }
  var GAYA = { Friendly: 'ramah', Positive: 'positif', Warm: 'hangat', Confident: 'percaya diri', Caring: 'peduli', Calm: 'tenang', Cheerful: 'ceria', Authentic: 'alami', Bright: 'cerah', Clear: 'jernih', Expressive: 'ekspresif', Rational: 'rasional', Considerate: 'penuh perhatian', Comfort: 'menenangkan', Pleasant: 'menyenangkan', Lively: 'lincah', Passion: 'bersemangat', Sincere: 'tulus', Upbeat: 'bersemangat', Honest: 'jujur', Reliable: 'andal', Approachable: 'mudah didekati', Casual: 'santai', Engaging: 'memikat', Soft: 'lembut', Professional: 'profesional', Gentle: 'lembut', Thoughtful: 'bijak' };
  function gayaTxt(s) { return String(s || '').split(/\s*,\s*/).filter(Boolean).map(function (x) { return GAYA[x] || x.toLowerCase(); }).join(', '); }

  /* ---------- lembar pengaturan ---------- */
  var css = '' +
    '.bmvo-ov{position:fixed;inset:0;z-index:2147483600;background:rgba(0,0,0,.45);display:flex;align-items:flex-end;justify-content:center;opacity:0;transition:opacity .2s}' +
    '.bmvo-ov.on{opacity:1}' +
    '.bmvo *{box-sizing:border-box}.bmvo{--bg:#141416;--card:#1d1d20;--tx:#f2f2f3;--mu:#9a9aa2;--bd:rgba(255,255,255,.1);--ac:var(--accent,var(--accent-yellow,#F0A529));' +
    'width:100%;max-width:560px;max-height:92vh;max-height:92dvh;display:flex;flex-direction:column;background:var(--bg);color:var(--tx);border-radius:22px 22px 0 0;box-shadow:0 -10px 40px rgba(0,0,0,.35);' +
    'font-family:var(--bm-font,system-ui,-apple-system,"Segoe UI",sans-serif);transform:translateY(24px);transition:transform .22s cubic-bezier(.2,.8,.2,1);color-scheme:dark}' +
    '.bmvo-ov.on .bmvo{transform:none}.bmvo.lt{--bg:#f5f5f7;--card:#fff;--tx:#151517;--mu:#6c6c74;--bd:rgba(0,0,0,.09);color-scheme:light}' +
    '.bmvo-hd{display:flex;align-items:center;gap:10px;padding:14px 16px 10px}.bmvo-hd b{flex:1;font-size:18px;letter-spacing:.2px}' +
    '.bmvo button svg{display:block;flex:none}.bmvo-x svg{width:18px;height:18px;margin:auto}.bmvo-play{display:inline-flex;align-items:center;gap:6px}.bmvo-play svg{width:15px;height:15px}.bmvo-pv svg{width:14px;height:14px;margin:auto}.bmvo-gh i svg{width:16px;height:16px;display:block}' +
    '.bmvo-x{width:38px;height:38px;border-radius:50%;border:1px solid var(--bd);background:var(--card);color:var(--tx);font-size:18px;cursor:pointer}' +
    '.bmvo-bd{overflow:auto;padding:0 16px calc(18px + env(safe-area-inset-bottom));display:grid;grid-template-columns:minmax(0,1fr);gap:12px;overscroll-behavior:contain}' +
    '.bmvo-c{min-width:0;box-sizing:border-box;background:var(--card);border:1px solid var(--bd);border-radius:16px;padding:12px 14px}' +
    '.bmvo-t{font-size:12px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;color:var(--mu);margin:0 0 8px}' +
    '.bmvo-seg{display:grid;grid-template-columns:1fr 1fr;gap:6px;background:var(--bg);border-radius:12px;padding:4px}' +
    '.bmvo-seg button{border:0;border-radius:9px;padding:10px 6px;background:transparent;color:var(--tx);font:inherit;font-size:14px;font-weight:600;cursor:pointer}' +
    '.bmvo-seg button small{display:block;font-weight:400;font-size:11.5px;color:var(--mu);margin-top:1px}' +
    '.bmvo-seg button.on{background:var(--ac);color:#1a1205}.bmvo-seg button.on small{color:rgba(26,18,5,.75)}' +
    '.bmvo-st{font-size:12.5px;color:var(--mu);margin-top:8px;line-height:1.4}.bmvo-st.w{color:#e8590c}' +
    '.bmvo-cur{display:flex;align-items:center;gap:12px}.bmvo-av{width:44px;height:44px;border-radius:50%;flex:none;display:grid;place-items:center;font-weight:800;font-size:17px;background:rgba(127,127,127,.15);color:var(--ac)}' +
    '.bmvo-cur>div:not(.bmvo-av){flex:1;min-width:0}.bmvo-cur b{display:block;font-size:16px}.bmvo-cur span{display:block;font-size:12.5px;color:var(--mu);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '.bmvo-play{flex:none;height:38px;padding:0 14px;border-radius:999px;border:0;background:var(--ac);color:#1a1205;font:inherit;font-weight:700;font-size:14px;cursor:pointer}' +
    '.bmvo-rg{display:grid;gap:12px}.bmvo-rg label{display:grid;gap:6px;font-size:14px}.bmvo-rg label span{display:flex;justify-content:space-between}.bmvo-rg label em{font-style:normal;color:var(--mu);font-size:13px}' +
    '.bmvo-rg input[type=range]{width:100%;accent-color:var(--ac);height:28px}' +
    '.bmvo-q{width:100%;box-sizing:border-box;border:1px solid var(--bd);background:var(--bg);color:var(--tx);border-radius:12px;padding:11px 12px;font:inherit;font-size:15px;outline:none}' +
    '.bmvo-q:focus{border-color:var(--ac)}' +
    '.bmvo-ch{display:flex;gap:6px;flex-wrap:wrap;margin:10px 0 2px}.bmvo-ch button{border:1px solid var(--bd);background:transparent;color:var(--tx);border-radius:999px;padding:6px 12px;font:inherit;font-size:13px;cursor:pointer}' +
    '.bmvo-ch button.on{background:var(--tx);color:var(--bg);border-color:var(--tx)}' +
    '.bmvo-cnt{font-size:12px;color:var(--mu);margin:8px 2px 0}' +
    '.bmvo-g{border-top:1px solid var(--bd)}.bmvo-g:first-child{border-top:0}' +
    '.bmvo-gh{width:100%;display:flex;align-items:center;gap:8px;border:0;background:transparent;color:var(--tx);padding:12px 2px;font:inherit;font-size:14.5px;font-weight:650;cursor:pointer;text-align:left}' +
    '.bmvo-gh span{flex:1}.bmvo-gh small{color:var(--mu);font-weight:400;font-size:12.5px}.bmvo-gh i{font-style:normal;color:var(--mu);transition:transform .18s}.bmvo-g.op .bmvo-gh i{transform:rotate(90deg)}' +
    '.bmvo-v{display:flex;align-items:center;gap:10px;padding:8px 2px 8px 6px;border-radius:12px;cursor:pointer}' +
    '.bmvo-v:hover{background:rgba(127,127,127,.07)}.bmvo-v.on{background:rgba(127,127,127,.12)}' +
    '.bmvo-rd{width:18px;height:18px;border-radius:50%;border:2px solid var(--mu);flex:none;box-sizing:border-box}.bmvo-v.on .bmvo-rd{border:5px solid var(--ac)}' +
    '.bmvo-v>div{flex:1;min-width:0}.bmvo-v b{display:block;font-size:14.5px;font-weight:600}.bmvo-v span{display:block;font-size:12px;color:var(--mu);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '.bmvo-pv{flex:none;width:36px;height:36px;border-radius:50%;border:1px solid var(--bd);background:transparent;color:var(--tx);cursor:pointer;font-size:13px}' +
    '.bmvo-pv.run{border-color:var(--ac);color:var(--ac)}' +
    '.bmvo-em{color:var(--mu);font-size:13.5px;padding:10px 2px}.bmvo-rt{border:1px solid var(--bd);background:transparent;color:var(--tx);border-radius:10px;padding:8px 12px;font:inherit;cursor:pointer;margin-top:8px}';
  function addCss() { if (document.getElementById('bmvo-css')) return; var s = el('style'); s.id = 'bmvo-css'; s.textContent = css; document.head.appendChild(s); }
  function isLight() {
    try { var t = localStorage.getItem('bm-theme'); if (t === 'light') return true; if (t === 'dark') return false; } catch (e) {}
    return !!(document.body && document.body.classList.contains('theme-light')) || document.documentElement.getAttribute('data-theme') === 'light';
  }

  function openSettings() {
    addCss();
    var old = document.querySelector('.bmvo-ov'); if (old) old.remove();
    var s = settings(), ov = el('div', 'bmvo-ov'), box = el('div', 'bmvo' + (isLight() ? ' lt' : ''));
    box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', 'Suara Jarvis');
    var hd = el('div', 'bmvo-hd'), x = el('button', 'bmvo-x'); setBtn(x, 'x'); x.type = 'button'; x.setAttribute('aria-label', 'Tutup');
    hd.append(el('b', '', 'Suara Jarvis'), x);
    var bd = el('div', 'bmvo-bd');
    box.append(hd, bd); ov.appendChild(box); document.body.appendChild(ov);
    requestAnimationFrame(function () { ov.classList.add('on'); });
    var all = null;
    function close() { stop(); ov.classList.remove('on'); setTimeout(function () { ov.remove(); }, 200); document.removeEventListener('keydown', onKey); }
    function onKey(e) { if (e.key === 'Escape') close(); }
    document.addEventListener('keydown', onKey);
    x.onclick = close; ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    function put() { save(s); }

    /* 1. mesin */
    var c1 = el('div', 'bmvo-c'), seg = el('div', 'bmvo-seg'), bE = el('button'), bH = el('button'), st = el('div', 'bmvo-st');
    bE.type = bH.type = 'button';
    bE.append(document.createTextNode('Edge'), el('small', '', 'natural · perlu internet'));
    bH.append(document.createTextNode('Suara HP'), el('small', '', 'bawaan · tanpa internet'));
    seg.append(bE, bH); c1.append(el('p', 'bmvo-t', 'Mesin suara'), seg, st);
    function paintEng() {
      bE.classList.toggle('on', s.engine === 'edge'); bH.classList.toggle('on', s.engine !== 'edge');
      st.classList.toggle('w', !!health.lastErr && health.lastAt > health.lastOk);
      st.textContent = s.engine !== 'edge' ? 'Memakai suara bawaan HP. Kualitas tergantung HP.'
        : health.lastErr && health.lastAt > health.lastOk ? 'Terakhir gagal (' + new Date(health.lastAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) + '): ' + health.lastErr + '. Sementara memakai suara HP, dicoba lagi otomatis.'
        : 'Suara natural Microsoft Edge. Bila gagal, otomatis memakai suara HP.';
    }
    bE.onclick = function () { s.engine = 'edge'; health.downUntil = 0; put(); paintEng(); };
    bH.onclick = function () { s.engine = 'hp'; put(); paintEng(); };
    paintEng(); bd.appendChild(c1);

    /* 2. suara terpilih + coba */
    var c2 = el('div', 'bmvo-c'), cur = el('div', 'bmvo-cur'), av = el('div', 'bmvo-av'), info = el('div'), nm = el('b'), meta = el('span'), play = el('button', 'bmvo-play'); setBtn(play, 'play', 'Coba');
    play.type = 'button'; info.append(nm, meta); cur.append(av, info, play); c2.append(el('p', 'bmvo-t', 'Suara dipakai'), cur);
    function curVoice() { return (all || []).filter(function (v) { return v.id === s.voice; })[0] || { id: s.voice, nama: s.voice.split('-').pop().replace(/MultilingualNeural|Neural/, ''), locale: localeOf(s.voice), gender: '' }; }
    function paintCur() { var v = curVoice(); av.textContent = (v.nama || '?').charAt(0).toUpperCase(); nm.textContent = v.nama; meta.textContent = [langName(v.locale), genderTxt(v.gender), gayaTxt(v.gaya)].filter(Boolean).join(' · '); }
    var previewBtn = null;
    function idle(b) { if (b === play) setBtn(b, 'play', 'Coba'); else setBtn(b, 'play'); }
    function preview(v, btn) {
      if (previewBtn === btn && state.playing) { stop(); btn.classList.remove('run'); idle(btn); previewBtn = null; return; }
      if (previewBtn) { previewBtn.classList.remove('run'); idle(previewBtn); }
      previewBtn = btn; btn.classList.add('run'); if (btn === play) setBtn(btn, 'stop', 'Stop'); else setBtn(btn, 'stop');
      speak(sampleFor(v), { override: { engine: s.engine, voice: v.id, rate: s.rate, pitch: s.pitch }, onError: function () { paintEng(); }, done: function () { if (previewBtn === btn) { btn.classList.remove('run'); idle(btn); previewBtn = null; } paintEng(); } });
    }
    play.onclick = function () { preview(curVoice(), play); };
    paintCur(); bd.appendChild(c2);

    /* 3. kecepatan & nada */
    var c3 = el('div', 'bmvo-c'), rg = el('div', 'bmvo-rg');
    function slider(label, key, min, max, step, fmt) {
      var l = el('label'), top = el('span'), val = el('em'), r = el('input'); r.type = 'range'; r.min = min; r.max = max; r.step = step; r.value = s[key];
      top.append(document.createTextNode(label), val); l.append(top, r);
      var paint = function () { val.textContent = fmt(+r.value); };
      r.oninput = function () { s[key] = +r.value; paint(); }; r.onchange = put; paint(); return l;
    }
    rg.append(slider('Kecepatan', 'rate', -50, 50, 5, function (v) { return v === 0 ? 'Normal' : (v > 0 ? '+' : '') + v + '%'; }),
      slider('Nada', 'pitch', -20, 20, 2, function (v) { return v === 0 ? 'Normal' : (v > 0 ? 'Lebih tinggi ' : 'Lebih rendah ') + Math.abs(v); }));
    c3.append(el('p', 'bmvo-t', 'Kecepatan dan nada'), rg); bd.appendChild(c3);

    /* 4. semua suara */
    var c4 = el('div', 'bmvo-c'), q = el('input', 'bmvo-q'), chips = el('div', 'bmvo-ch'), cnt = el('div', 'bmvo-cnt'), listEl = el('div');
    q.type = 'search'; q.placeholder = 'Cari nama suara atau bahasa'; q.autocomplete = 'off';
    var FIL = [['all', 'Semua'], ['m', 'Pria'], ['f', 'Wanita'], ['multi', 'Multibahasa']], fil = 'all', open = {};
    FIL.forEach(function (f) { var b = el('button', '', f[1]); b.type = 'button'; b.onclick = function () { fil = f[0]; paintList(); }; b.dataset.f = f[0]; chips.appendChild(b); });
    c4.append(el('p', 'bmvo-t', 'Pilih suara'), q, chips, cnt, listEl); bd.appendChild(c4);
    var PRIO = { 'id-ID': 0, 'jv-ID': 1, 'su-ID': 2, 'ms-MY': 3, 'en-US': 4, 'en-GB': 5 };
    function row(v) {
      var r = el('div', 'bmvo-v' + (v.id === s.voice ? ' on' : '')), rd = el('i', 'bmvo-rd'), d = el('div'), pv = el('button', 'bmvo-pv'); setBtn(pv, 'play');
      pv.type = 'button'; pv.setAttribute('aria-label', 'Coba dengar ' + v.nama);
      d.append(el('b', '', v.nama), el('span', '', [genderTxt(v.gender), gayaTxt(v.gaya)].filter(Boolean).join(' · ') || v.id));
      r.append(rd, d, pv); r.setAttribute('role', 'radio'); r.setAttribute('aria-checked', v.id === s.voice ? 'true' : 'false'); r.tabIndex = 0;
      r.onclick = function (e) { if (pv.contains(e.target)) return; s.voice = v.id; put(); paintCur(); listEl.querySelectorAll('.bmvo-v.on').forEach(function (z) { z.classList.remove('on'); z.setAttribute('aria-checked', 'false'); }); r.classList.add('on'); r.setAttribute('aria-checked', 'true'); };
      r.onkeydown = function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); r.click(); } };
      pv.onclick = function (e) { e.stopPropagation(); e.preventDefault(); preview(v, pv); };
      return r;
    }
    function paintList() {
      chips.querySelectorAll('button').forEach(function (b) { b.classList.toggle('on', b.dataset.f === fil); });
      listEl.textContent = '';
      if (!all) return;
      var term = q.value.trim().toLowerCase();
      var vs = all.filter(function (v) {
        if (fil === 'm' && !/^male$/i.test(v.gender)) return false;
        if (fil === 'f' && !/^female$/i.test(v.gender)) return false;
        if (fil === 'multi' && !/Multilingual/i.test(v.id)) return false;
        if (!term) return true;
        return (v.nama + ' ' + v.id + ' ' + langName(v.locale) + ' ' + genderTxt(v.gender)).toLowerCase().indexOf(term) >= 0;
      });
      var g = {}; vs.forEach(function (v) { (g[v.locale] = g[v.locale] || []).push(v); });
      var locs = Object.keys(g).sort(function (a, b) { var pa = a in PRIO ? PRIO[a] : 99, pb = b in PRIO ? PRIO[b] : 99; return pa - pb || langName(a).localeCompare(langName(b), 'id'); });
      cnt.textContent = vs.length + ' suara · ' + locs.length + ' bahasa';
      if (!vs.length) { listEl.appendChild(el('div', 'bmvo-em', 'Tidak ada suara yang cocok.')); return; }
      locs.forEach(function (loc) {
        var grp = el('div', 'bmvo-g'), h = el('button', 'bmvo-gh'), body = el('div'); h.type = 'button';
        var isOpen = open[loc] !== undefined ? open[loc] : (!!term || loc === localeOf(s.voice) || loc === 'id-ID');
        h.append(el('span', '', langName(loc)), el('small', '', g[loc].length + ' suara'), (function () { var ic = el('i'); ic.innerHTML = IC.chev; return ic; })());
        grp.append(h, body); if (isOpen) { grp.classList.add('op'); g[loc].forEach(function (v) { body.appendChild(row(v)); }); }
        h.onclick = function () { open[loc] = !grp.classList.contains('op'); paintList(); };
        listEl.appendChild(grp);
      });
    }
    var qt = 0; q.oninput = function () { clearTimeout(qt); qt = setTimeout(paintList, 120); };
    function load(force) {
      listEl.textContent = ''; listEl.appendChild(el('div', 'bmvo-em', 'Memuat daftar suara…'));
      voiceList(force).then(function (d) { all = d; paintCur(); paintList(); }, function (e) {
        listEl.textContent = ''; listEl.appendChild(el('div', 'bmvo-em', 'Daftar suara gagal dimuat: ' + ((e && e.message) || e)));
        var rt = el('button', 'bmvo-rt', 'Coba lagi'); rt.type = 'button'; rt.onclick = function () { load(true); }; listEl.appendChild(rt);
      });
    }
    paintList(); load(false);
    return { close: close };
  }

  window.BMVoice = {
    init: function (o) { if (o && typeof o.token === 'function') CFG.token = function () { return Promise.resolve(o.token()).catch(function () { return ''; }); }; },
    speak: speak, stop: stop, openSettings: openSettings,
    speaking: function () { return state.playing; },
    settings: settings, health: function () { return Object.assign({}, health); },
    _clean: clean, _chunks: chunks, _terbilang: terbilang
  };
})();
