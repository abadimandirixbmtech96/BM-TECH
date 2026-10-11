// Vercel Serverless Function: GET /api/img?u=<url gambar ImgBB>
// Beberapa provider/DNS memblokir i.ibb.co (muncul ERR_CERT_AUTHORITY_INVALID di HP).
// Fungsi ini mengambil gambar dari server Vercel lalu meneruskannya ke browser, jadi
// tampil walau i.ibb.co diblokir. Hanya URL ImgBB berbentuk https://i.ibb.co/<id>/<nama>
// yang dilayani (bukan proxy bebas).

const ALLOWED = /^https:\/\/i\.ibb\.co\/[A-Za-z0-9_-]+\/[A-Za-z0-9._-]+$/;
const MAX_BYTES = 4 * 1024 * 1024;

module.exports = async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.setHeader('Allow', 'GET, HEAD'); return res.status(405).end(); }
  const u = typeof req.query.u === 'string' ? req.query.u : '';
  if (!ALLOWED.test(u)) return res.status(400).json({ error: 'URL tidak diizinkan' });
  try {
    const up = await fetch(u, { redirect: 'error' });
    if (!up.ok) return res.status(up.status === 404 ? 404 : 502).json({ error: 'Gambar tidak tersedia' });
    const type = up.headers.get('content-type') || '';
    if (!type.startsWith('image/')) return res.status(502).json({ error: 'Bukan gambar' });
    const buf = Buffer.from(await up.arrayBuffer());
    if (buf.length > MAX_BYTES) return res.status(502).json({ error: 'Gambar terlalu besar' });
    res.setHeader('Content-Type', type);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'public, max-age=31536000, s-maxage=31536000, immutable'); // file ImgBB tidak berubah
    return res.status(200).send(buf);
  } catch (err) {
    return res.status(502).json({ error: 'Gagal mengambil gambar' });
  }
};
