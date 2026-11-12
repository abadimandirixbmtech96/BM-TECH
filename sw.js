// Service Worker BM-TECH: aplikasi tetap terbuka cepat walau sinyal lemot atau mati.
//
// 1. Tampilan aplikasi (HTML/JS/ikon/pustaka CDN): diambil dari cache dulu supaya langsung tampil,
//    lalu diperbarui diam-diam di belakang. Versi baru dipakai pada pembukaan berikutnya.
// 2. Data Supabase (hanya BACA: GET tabel + RPC baca yang terdaftar): coba jaringan dulu.
//    Kalau gagal / terlalu lama, pakai salinan terakhir yang pernah berhasil. Halaman diberi tahu
//    lewat pesan 'bm-data' supaya bisa menampilkan penanda "data terakhir".
// 3. Penulisan data (insert/update/delete/RPC tulis) TIDAK pernah disentuh: selalu langsung ke server.
// 4. Salinan data dihapus saat keluar akun (logout) atau login baru, supaya akun lain tidak melihatnya.

const CACHE_NAME = 'bmtech-shell-v43'; // dinaikkan: offline-first + cache data terakhir
const DATA_CACHE = 'bmtech-data-v1';   // tidak ikut dihapus saat versi naik
const DATA_ORIGIN = 'https://bm-data.invalid';
const NET_WAIT_MS = 2500;              // lebih dari ini dengan salinan tersedia = pakai salinan dulu
const NET_WAIT_SLOW_MS = 700;          // sesudah jaringan terbukti lemot: tunggu sebentar saja
let slowUntil = 0;                     // selama jendela ini permintaan berikutnya tidak menunggu lama lagi

const PAGES = [
  '/admin-login.html', '/my-profile-bm.html', '/dashboard-admin.html', '/dashboard-shop.html',
  '/jarvis-ai.html', '/analisa.html', '/daftar-nomor-hp.html', '/system-management.html',
  '/editor-data-administrator.html', '/editor-data-warung.html', '/editor-data-hutang-piutang.html',
  '/editor-data-kasbon.html', '/editor-data-operasional.html', '/editor-folder.html', '/folder-baru.html',
  '/karyawan-login.html', '/karyawan-tracking.html', '/customer-login.html', '/customer-tracking.html',
  '/calculator.html', '/salary-recap.html', '/panduan.html', '/buku-warung.html'
];
const ASSETS = [
  '/bm-app.js', '/bm-theme.js', '/bm-lang.js', '/bm-swipe-back.js', '/bm-session.js', '/bm-jarvis.js',
  '/bm-visual.js', '/bm-warung-pick.js', '/bm-shop-sync.js', '/bm-nota.js',
  '/manifest.json', '/manifest-admin.json', '/manifest-customer.json', '/manifest-calculator.json',
  '/icons/icon-192.png', '/icons/icon-512.png', '/icons/apple-touch-icon.png',
  '/icons/apple-touch-icon-152.png', '/icons/apple-touch-icon-167.png',
  '/icons/favicon-32.png', '/icons/favicon-16.png',
  '/background-admin.jpg', '/logo-login.jpg', '/dashboard-bm-tech.jpg', '/banner-dashboard-trader.png',
  '/beep-berhasil.wav', '/beep-gagal.wav'
];
const CDN = [
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js'
];

// RPC yang hanya membaca data (aman disalin untuk offline). RPC lain = menulis, tidak disentuh.
const READ_RPC = new Set([
  'is_admin', 'is_karyawan', 'is_customer', 'get_customer_username', 'has_perm', 'shop_boleh',
  'shop_ambil_semua', 'weekly_summary', 'system_health', 'announcement_seen_counts', 'dev_logs'
]);

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => Promise.allSettled(
      PAGES.concat(ASSETS).map((u) => cache.add(new Request(u, { cache: 'reload' })))
        .concat(CDN.map((u) => cache.add(u)))
    )).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME && k !== DATA_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  const d = event.data || {};
  if (d.type === 'bm-clear-data') event.waitUntil(caches.delete(DATA_CACHE));
});

/* ---------- utilitas ---------- */
const stripKey = (url) => new Request(url.origin + url.pathname);

function putShell(key, response) {
  if (!response || !response.ok || response.type === 'opaque') return Promise.resolve();
  const clone = response.clone();
  return caches.open(CACHE_NAME).then((c) => c.put(key, clone)).catch(() => {});
}

// Ambil dari cache dulu (instan), perbarui di belakang. Tanpa cache: jaringan.
function staleWhileRevalidate(event, key, fallback) {
  const net = fetch(event.request).then((r) => { if (r.ok) event.waitUntil(putShell(key, r.clone())); return r; });
  event.respondWith(
    caches.match(key).then((cached) => {
      if (cached) { event.waitUntil(net.catch(() => {})); return cached; }
      return net.catch(() => (fallback ? fallback() : Response.error()));
    })
  );
}

function jwtSub(req) {
  try {
    const h = req.headers.get('authorization') || '';
    const p = JSON.parse(atob(h.replace(/^Bearer\s+/i, '').split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return p && p.sub ? String(p.sub) : '';
  } catch (e) { return ''; }
}

async function sha(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).slice(0, 12).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function dataKey(req, url) {
  let k = DATA_ORIGIN + '/' + req.method + url.pathname + url.search;
  const acc = req.headers.get('accept') || '';
  const pref = req.headers.get('prefer') || '';
  if (/vnd\.pgrst\.object/.test(acc)) k += '#one';
  if (/count=/.test(pref)) k += '#cnt';
  if (req.method === 'POST') k += '#' + await sha(await req.clone().text());
  return new Request(k);
}

async function notify(clientId, msg) {
  try {
    if (clientId) { const c = await self.clients.get(clientId); if (c) { c.postMessage(msg); return; } }
    const all = await self.clients.matchAll({ type: 'window' });
    all.forEach((c) => c.postMessage(msg));
  } catch (e) {}
}

async function saveData(key, res, sub) {
  const body = await res.clone().blob();
  const h = new Headers(res.headers);
  h.set('x-bm-sub', sub);
  h.set('x-bm-at', String(Date.now()));
  const c = await caches.open(DATA_CACHE);
  await c.put(key, new Response(body, { status: res.status, statusText: res.statusText, headers: h }));
}

async function readData(key, sub) {
  const c = await caches.open(DATA_CACHE);
  const r = await c.match(key);
  if (!r) return null;
  const owner = r.headers.get('x-bm-sub') || '';
  if (sub && owner && sub !== owner) return null;   // salinan milik akun lain
  return r;
}

function handleData(event, url) {
  const req = event.request;
  const sub = jwtSub(req);
  event.respondWith((async () => {
    const key = await dataKey(req, url);
    const cached = await readData(key, sub);
    const at = cached ? Number(cached.headers.get('x-bm-at')) || 0 : 0;

    const net = fetch(req).then(async (res) => {
      if (res.ok) {
        // Token sudah kedaluwarsa (offline lama) → tidak ada sub; jangan simpan atas nama siapa pun
        if (sub) event.waitUntil(saveData(key, res, sub).catch(() => {}));
        notify(event.clientId, { type: 'bm-data', stale: false });
      }
      return res;
    });

    if (!cached) return net;

    const wait = Date.now() < slowUntil ? NET_WAIT_SLOW_MS : NET_WAIT_MS;
    const timer = new Promise((resolve) => setTimeout(() => resolve('slow'), wait));
    let res;
    try { res = await Promise.race([net, timer]); } catch (e) { res = 'fail'; }

    if (res instanceof Response && (res.ok || (res.status < 500 && res.status !== 401))) { if (res.ok) slowUntil = 0; return res; }
    slowUntil = Date.now() + 20000;

    if (res === 'slow') {
      // Jaringan masih jalan di belakang; kalau berhasil, halaman diberi tahu ada data lebih baru
      event.waitUntil(net.then((r) => { if (r.ok) notify(event.clientId, { type: 'bm-data', fresh: true }); }).catch(() => {}));
    }
    notify(event.clientId, { type: 'bm-data', stale: true, at: at, reason: res === 'slow' ? 'slow' : 'offline' });
    return cached;
  })());
}

/* ---------- lalu lintas ---------- */
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Supabase
  if (url.hostname.endsWith('.supabase.co')) {
    // Keluar akun / login baru: buang salinan data lama (request tetap jalan normal ke server)
    if (url.pathname === '/auth/v1/logout' ||
        (url.pathname === '/auth/v1/token' && url.searchParams.get('grant_type') !== 'refresh_token')) {
      event.waitUntil(caches.delete(DATA_CACHE));
      return;
    }
    if (url.pathname.startsWith('/rest/v1/rpc/')) {
      if (req.method === 'POST' && READ_RPC.has(url.pathname.slice(13))) handleData(event, url);
      return;
    }
    if (req.method === 'GET' && url.pathname.startsWith('/rest/v1/')) { handleData(event, url); return; }
    if (req.method === 'GET' && url.pathname.startsWith('/storage/v1/object/public/')) {
      event.respondWith(caches.match(req).then((c) => c || fetch(req).then((r) => { if (r.ok) { const cl = r.clone(); caches.open(DATA_CACHE).then((x) => x.put(req, cl)); } return r; })));
      return;
    }
    return;
  }

  if (req.method !== 'GET') return;

  // Google Apps Script (Rekap Gaji): jangan disentuh
  if (url.hostname === 'script.google.com' || url.hostname.endsWith('.googleusercontent.com')) return;

  if (url.origin === self.location.origin) {
    if (url.pathname.startsWith('/api/')) return;   // server Jarvis & unggah: selalu langsung
    if (req.mode === 'navigate') {
      // Kunci tanpa query string (?id=...&_t=...) supaya satu halaman = satu salinan
      let path = url.pathname === '/' ? '/admin-login.html' : url.pathname;
      if (/^\/role-customer-/.test(path)) path = '/customer-tracking.html';
      if (/^\/role-karyawan-/.test(path)) path = '/karyawan-tracking.html';
      staleWhileRevalidate(event, new Request(url.origin + path), () => caches.match('/admin-login.html'));
      return;
    }
    staleWhileRevalidate(event, stripKey(url));
    return;
  }

  // Pustaka CDN: cache dulu, jarang berubah (font Google dibiarkan ke browser: tidak ada di connect-src CSP)
  if (/^(cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com)$/.test(url.hostname)) {
    event.respondWith(
      caches.match(req).then((cached) => cached || fetch(req).then((r) => {
        if (r.ok || r.type === 'opaque') { const cl = r.clone(); caches.open(CACHE_NAME).then((c) => c.put(req, cl)); }
        return r;
      }))
    );
  }
});
