// Service Worker BM-TECH
// Tujuannya CUMA satu: bikin file HTML/JS/CSS aplikasi ini ("app shell")
// tetap bisa dibuka walau internet mati total. Data (Supabase) TIDAK
// disentuh sama sekali di sini — itu urusan logic offline-draft di
// masing-masing halaman (autosave lokal, dsb).

const CACHE_NAME = 'bmtech-shell-v1';

const APP_SHELL = [
  '/',
  '/index.html',
  '/dashboard-admin.html',
  '/admin-login.html',
  '/editor-data-administrator.html',
  '/calculator.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
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

  // Navigasi ke halaman HTML: coba jaringan dulu (biar selalu dapat versi
  // terbaru kalau online), fallback ke cache kalau offline.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        })
        .catch(() =>
          caches.match(event.request).then((cached) => cached || caches.match('/index.html'))
        )
    );
    return;
  }

  // Aset statis lain (script CDN, icon, dst): cache-first — cepat &
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
