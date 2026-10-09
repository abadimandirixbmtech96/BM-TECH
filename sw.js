// Service Worker BM-TECH
// Tujuannya CUMA satu: bikin file HTML/JS/CSS aplikasi ini ("app shell")
// tetap bisa dibuka walau internet mati total. Data (Supabase) TIDAK
// disentuh sama sekali di sini — itu urusan logic offline-draft di
// masing-masing halaman (autosave lokal, dsb).

const CACHE_NAME = 'bmtech-shell-v6'; // dinaikkan: lengkapi halaman offline, perbaiki cache editor & pembaruan JS

const APP_SHELL = [
  '/dashboard-admin.html',
  '/analisa.html',
  '/daftar-nomor-hp.html',
  '/system-management.html',
  '/admin-login.html',
  '/editor-data-administrator.html',
  '/editor-data-warung.html',
  '/editor-data-hutang-piutang.html',
  '/editor-data-kasbon.html',
  '/editor-folder.html',
  '/folder-baru.html',
  '/karyawan-login.html',
  '/karyawan-tracking.html',
  '/customer-login.html',
  '/customer-tracking.html',
  '/calculator.html',
  '/bm-theme.js',
  '/bm-lang.js',
  '/bm-swipe-back.js',
  '/manifest.json',
  '/manifest-admin.json',
  '/manifest-customer.json',
  '/manifest-calculator.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png',
  '/icons/apple-touch-icon-152.png',
  '/icons/apple-touch-icon-167.png',
  '/icons/favicon-32.png',
  '/icons/favicon-16.png',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => Promise.allSettled(APP_SHELL.map((url) => cache.add(url))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // JANGAN sentuh request ke Supabase (API/auth/realtime/storage) sama
  // sekali — itu harus selalu langsung ke server asli atau gagal dengan
  // benar, biar logic offline-draft di aplikasi yang nanganin, bukan
  // service worker ini. Kalau ini dicache, bisa bahaya (data basi/salah).
  if (url.hostname.endsWith('.supabase.co')) {
    return;
  }

  // Halaman HTML: coba jaringan dulu (selalu versi terbaru kalau online), fallback ke cache kalau offline.
  // Kunci cache = alamat TANPA query string. Editor dibuka dengan ?id=...&_t=... yang selalu berbeda;
  // tanpa normalisasi, tiap pembukaan menambah satu salinan halaman ke cache dan saat offline tidak ada yang cocok.
  if (event.request.mode === 'navigate') {
    const pageKey = new Request(url.origin + url.pathname);
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok && url.origin === self.location.origin) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(pageKey, clone));
          }
          return response;
        })
        .catch(() =>
          caches.match(pageKey).then((cached) => cached || caches.match('/admin-login.html'))
        )
    );
    return;
  }

  // Skrip/gaya/manifest milik kita sendiri: jaringan dulu supaya pembaruan langsung sampai, cache sebagai cadangan offline.
  if (url.origin === self.location.origin && /\.(js|css|json)$/.test(url.pathname)) {
    const assetKey = new Request(url.origin + url.pathname);
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(assetKey, clone));
          }
          return response;
        })
        .catch(() => caches.match(assetKey).then((cached) => cached || Response.error()))
    );
    return;
  }

  // Aset lain (script CDN, icon, dst): cache-first — cepat &
  // tetap jalan walau offline, karena jarang berubah.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return response;
      });
    })
  );
});
