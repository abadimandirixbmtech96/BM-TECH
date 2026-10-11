// Vercel Serverless Function: POST /api/upload-bukti
// Menerima foto JPEG mentah dari editor, meneruskannya ke ImgBB memakai API key
// yang tersimpan di Environment Variable Vercel (IMGBB_API_KEY), sehingga key
// tidak pernah terlihat di kode sisi klien. Hanya pengguna yang sudah login
// ke Supabase (token Bearer valid) yang boleh mengunggah.

const SUPABASE_URL = 'https://zgzmbneqqzxnptbmlhsz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpnem1ibmVxcXp4bnB0Ym1saHN6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc3OTU0ODksImV4cCI6MjEwMzM3MTQ4OX0.MQOtu5Pg2PtxIu18joKDd0dOA17cPEazmlL0Xl3Vz7E';
const MAX_BYTES = 3 * 1024 * 1024; // batas aman (Vercel maks 4,5 MB per request)

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BYTES) { reject(Object.assign(new Error('Foto terlalu besar'), { status: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'Method not allowed' }); }

  const apiKey = process.env.IMGBB_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'IMGBB_API_KEY belum diatur di Vercel' });

  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return res.status(401).json({ error: 'Belum login' });

  try {
    const who = await fetch(SUPABASE_URL + '/auth/v1/user', {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + token }
    });
    if (!who.ok) return res.status(401).json({ error: 'Sesi login tidak valid' });

    const body = Buffer.isBuffer(req.body) && req.body.length ? req.body : await readBody(req);
    if (!body.length) return res.status(400).json({ error: 'Foto kosong' });
    const isJpeg = body[0] === 0xff && body[1] === 0xd8;
    if (!isJpeg) return res.status(415).json({ error: 'Hanya JPEG yang diterima' });

    const form = new URLSearchParams();
    form.set('image', body.toString('base64'));
    const up = await fetch('https://api.imgbb.com/1/upload?key=' + encodeURIComponent(apiKey), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form
    });
    const json = await up.json().catch(() => null);
    if (!up.ok || !json || !json.success || !json.data) {
      return res.status(502).json({ error: (json && json.error && json.error.message) || 'ImgBB menolak unggahan' });
    }
    return res.status(200).json({ url: json.data.url || json.data.display_url });
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message || 'Gagal mengunggah' });
  }
};

// Harus SETELAH module.exports di atas (kalau sebelumnya, ikut tertimpa).
module.exports.config = { api: { bodyParser: false } };
