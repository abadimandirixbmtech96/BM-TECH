// /api/share/[id].js
// Serverless function (Vercel) — bikin preview link WA/sosmed jadi DINAMIS
// (judul & deskripsi ikut nama tabel/folder aslinya), karena crawler
// WhatsApp/Facebook/dll cuma baca meta tag statis, nggak eksekusi JavaScript.
//
// Alurnya: orang buka link https://<domain>/api/share/<note_id>
//   -> function ini query Supabase ambil judul note + nama foldernya
//   -> balikin HTML kecil isinya meta tag OG yang udah keisi data asli
//   -> begitu manusia beneran buka link-nya (bukan crawler), langsung
//      di-redirect ke index.html?note=<note_id> (app aslinya)

const SUPABASE_URL = 'https://zgzmbneqqzxnptbmlhsz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpnem1ibmVxcXp4bnB0Ym1saHN6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc3OTU0ODksImV4cCI6MjEwMzM3MTQ4OX0.MQOtu5Pg2PtxIu18joKDd0dOA17cPEazmlL0Xl3Vz7E';
const SITE_URL = 'https://dashboard-bm-tech.vercel.app';
const DEFAULT_IMAGE = `${SITE_URL}/logo-login.jpg`;
const DEFAULT_TITLE = 'BM-TECH Notes';
const DEFAULT_DESC = 'Lihat data & tabel workshop BM-TECH.';

function escapeHtmlAttr(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function fetchJson(url) {
  const resp = await fetch(url, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`
    }
  });
  if (!resp.ok) return null;
  const data = await resp.json();
  return Array.isArray(data) && data.length > 0 ? data[0] : null;
}

module.exports = async (req, res) => {
  const { id } = req.query;

  let title = DEFAULT_TITLE;
  let description = DEFAULT_DESC;

  if (id) {
    try {
      const note = await fetchJson(
        `${SUPABASE_URL}/rest/v1/notes?id=eq.${encodeURIComponent(id)}&select=title,folder_id`
      );

      if (note) {
        const noteTitle = note.title || 'Untitled';
        title = noteTitle;
        description = `Tabel "${noteTitle}" — BM-TECH Notes`;

        if (note.folder_id) {
          const folder = await fetchJson(
            `${SUPABASE_URL}/rest/v1/folders?id=eq.${encodeURIComponent(note.folder_id)}&select=name`
          );
          if (folder && folder.name) {
            description = `Folder "${folder.name}" · Tabel "${noteTitle}"`;
          }
        }
      }
    } catch (err) {
      console.error('Gagal ambil data note buat share preview:', err);
      // biarin fallback ke title/description default, jangan sampai request-nya gagal total
    }
  }

  const redirectUrl = id
    ? `${SITE_URL}/index.html?note=${encodeURIComponent(id)}`
    : `${SITE_URL}/index.html`;

  const safeTitle = escapeHtmlAttr(title);
  const safeDesc = escapeHtmlAttr(description);
  const safeRedirect = escapeHtmlAttr(redirectUrl);

  const html = `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${safeTitle}</title>

<meta property="og:type" content="website">
<meta property="og:title" content="${safeTitle}">
<meta property="og:description" content="${safeDesc}">
<meta property="og:image" content="${DEFAULT_IMAGE}">
<meta property="og:url" content="${SITE_URL}/api/share/${escapeHtmlAttr(id || '')}">

<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${safeTitle}">
<meta name="twitter:description" content="${safeDesc}">
<meta name="twitter:image" content="${DEFAULT_IMAGE}">

<meta http-equiv="refresh" content="0; url=${safeRedirect}">
<script>window.location.replace(${JSON.stringify(redirectUrl)});</script>
</head>
<body>
<p>Membuka tabel... kalau tidak otomatis pindah, <a href="${safeRedirect}">klik di sini</a>.</p>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=600');
  res.status(200).send(html);
};
  
