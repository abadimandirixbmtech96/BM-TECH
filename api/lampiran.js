// =====================================================================
// BM-TECH: titip lampiran besar (video, suara, PDF/foto besar) ke Google Gemini File API.
// TIDAK disimpan di Supabase atau Vercel: file hanya diteruskan per potongan (4 MB) ke Gemini,
// dan Gemini menghapusnya sendiri setelah 48 jam. Hanya admin yang boleh memakai.
//   POST /api/lampiran?aksi=mulai  JSON { mime, nama, ukuran, keys }  -> { url }
//   POST /api/lampiran?aksi=kirim  biner (header x-upload-url, x-offset, x-akhir) -> { file } saat akhir
//   POST /api/lampiran?aksi=cek    JSON { name, keys } -> { state, uri }
// =====================================================================
const VERSION = 'bm-lampiran-v1-2026-11-13';
const SUPABASE_URL = 'https://zgzmbneqqzxnptbmlhsz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpnem1ibmVxcXp4bnB0Ym1saHN6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc3OTU0ODksImV4cCI6MjEwMzM3MTQ4OX0.MQOtu5Pg2PtxIu18joKDd0dOA17cPEazmlL0Xl3Vz7E';
const GEM = 'https://generativelanguage.googleapis.com/';
const MIME_OK = /^(image\/(png|jpeg|webp|gif|heic|heif)|video\/(mp4|webm|quicktime|3gpp|x-matroska|mpeg|x-msvideo)|audio\/(mpeg|mp4|aac|ogg|wav|webm|flac|amr|3gpp)|application\/pdf)$/;
const MAX_FILE = 50 * 1024 * 1024, MAX_CHUNK = 4 * 1024 * 1024 + 1024;
const ADMIN = new Map();   // token -> waktu kedaluwarsa cache (hanya hasil OK)

async function isAdmin(token) {
  const c = ADMIN.get(token); if (c && c > Date.now()) return true;
  const h = { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
  const u = await fetch(SUPABASE_URL + '/auth/v1/user', { headers: h }); if (!u.ok) return false;
  const r = await fetch(SUPABASE_URL + '/rest/v1/rpc/is_admin', { method: 'POST', headers: h, body: '{}' }); if (!r.ok) return false;
  const ok = (await r.json().catch(() => false)) === true;
  if (ok) { ADMIN.set(token, Date.now() + 5 * 60e3); if (ADMIN.size > 200) ADMIN.delete(ADMIN.keys().next().value); }
  return ok;
}
function readBody(req, max) {
  if (Buffer.isBuffer(req.body)) return Promise.resolve(req.body);
  return new Promise((ok, no) => {
    const parts = []; let n = 0;
    req.on('data', (c) => { n += c.length; if (n > max) { no(new Error('terlalu besar')); req.destroy(); } else parts.push(c); });
    req.on('end', () => ok(Buffer.concat(parts))); req.on('error', no);
  });
}
const keyOf = (keys) => String((keys && keys.gemini) || process.env.GEMINI_API_KEY || '');
const send = (res, code, o) => { res.statusCode = code; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(o)); };

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const u = new URL(req.url, 'http://x'), aksi = u.searchParams.get('aksi');
    if (req.method === 'GET') return send(res, 200, { ok: true, versi: VERSION });
    if (req.method !== 'POST') return send(res, 405, { error: 'Metode tidak diizinkan' });
    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!token || !(await isAdmin(token))) return send(res, 401, { error: 'Hanya admin' });

    if (aksi === 'kirim') {
      const url = String(req.headers['x-upload-url'] || ''), off = Number(req.headers['x-offset']), akhir = req.headers['x-akhir'] === '1';
      if (!url.startsWith(GEM + 'upload/') || !(off >= 0)) return send(res, 400, { error: 'Permintaan unggah tidak sah' });
      const buf = await readBody(req, MAX_CHUNK);
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Length': String(buf.length), 'X-Goog-Upload-Offset': String(off), 'X-Goog-Upload-Command': akhir ? 'upload, finalize' : 'upload' }, body: buf });
      if (!r.ok) return send(res, 502, { error: 'Gemini menolak potongan file (' + r.status + ')' });
      if (!akhir) return send(res, 200, { ok: true, diterima: off + buf.length });
      const j = await r.json().catch(() => null), f = j && j.file;
      if (!f || !f.uri) return send(res, 502, { error: 'Gemini tidak mengembalikan file' });
      return send(res, 200, { ok: true, file: { name: f.name, uri: f.uri, mime: f.mimeType, state: f.state || 'ACTIVE' } });
    }
    const b = JSON.parse((await readBody(req, 64 * 1024)).toString('utf8') || '{}');
    const key = keyOf(b.keys);
    if (!key) return send(res, 400, { error: 'Kunci Gemini belum diisi (Pengaturan > Penyedia dan model AI). File besar dan video butuh Gemini.' });
    if (aksi === 'mulai') {
      const mime = String(b.mime || ''), size = Number(b.ukuran) || 0, nama = String(b.nama || 'lampiran').slice(0, 60);
      if (!MIME_OK.test(mime)) return send(res, 400, { error: 'Jenis file belum didukung' });
      if (!(size > 0) || size > MAX_FILE) return send(res, 400, { error: 'Ukuran file maksimal 50 MB' });
      const r = await fetch(GEM + 'upload/v1beta/files', { method: 'POST', headers: { 'x-goog-api-key': key, 'X-Goog-Upload-Protocol': 'resumable', 'X-Goog-Upload-Command': 'start', 'X-Goog-Upload-Header-Content-Length': String(size), 'X-Goog-Upload-Header-Content-Type': mime, 'Content-Type': 'application/json' }, body: JSON.stringify({ file: { display_name: nama } }) });
      const url = r.headers.get('x-goog-upload-url');
      if (!r.ok || !url) return send(res, 502, { error: r.status === 400 || r.status === 403 ? 'Kunci Gemini ditolak (' + r.status + ')' : 'Gemini tidak bisa menerima file (' + r.status + ')' });
      return send(res, 200, { ok: true, url, potong: 4 * 1024 * 1024 });
    }
    if (aksi === 'cek') {
      const name = String(b.name || '');
      if (!/^files\/[a-z0-9-]{1,80}$/.test(name)) return send(res, 400, { error: 'Nama file tidak sah' });
      const r = await fetch(GEM + 'v1beta/' + name, { headers: { 'x-goog-api-key': key } });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j) return send(res, 502, { error: 'Status file tidak terbaca (' + r.status + ')' });
      return send(res, 200, { ok: true, state: j.state || 'ACTIVE', uri: j.uri, mime: j.mimeType });
    }
    return send(res, 400, { error: 'Aksi tidak dikenal' });
  } catch (e) {
    return send(res, 500, { error: 'Unggah gagal: ' + String((e && e.message) || e).slice(0, 160) });
  }
};
