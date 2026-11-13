// Service Worker BM-TECH: aplikasi tetap terbuka cepat walau sinyal lemot atau mati.
//
// 1. Tampilan aplikasi (HTML/JS/ikon/pustaka CDN): diambil dari cache dulu supaya langsung tampil,
//    lalu diperbarui diam-diam di belakang. Versi baru dipakai pada pembukaan berikutnya.
// 2. Data Supabase (hanya BACA: GET tabel + RPC baca yang terdaftar): coba jaringan dulu.
//    Kalau gagal / terlalu lama, pakai salinan terakhir yang pernah berhasil. Halaman diberi tahu
//    lewat pesan 'bm-data' supaya bisa menampilkan penanda "data terakhir".
// 3. Penulisan data (insert/update/delete/RPC tulis) TIDAK pernah disentuh: selalu langsung ke server.
// 4. Salinan data dihapus saat keluar akun (logout) atau login baru, supaya akun lain tidak melihatnya.

const CACHE_NAME = 'bmtech-shell-v47'; // dinaikkan: suara natural Jarvis (Edge TTS) + pengaturan suara
const DATA_CACHE = 'bmtech-data-v1';   // tidak ikut dihapus saat versi naik
const DATA_ORIGIN = 'https://bm-data.invalid';
const NET_WAIT_MS = 2500;              // lebih dari ini dengan salinan tersedia = pakai salinan dulu
const NET_WAIT_SLOW_MS = 700;          // sesudah jaringan terbukti lemot: tunggu sebentar saja
let slowUntil = 0;
let lastWrite = 0;                     // waktu penulisan data terakhir dari perangkat ini                     // selama jendela ini permintaan berikutnya tidak menunggu lama lagi

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
  '/bm-visual.js', '/bm-voice.js', '/bm-warung-pick.js', '/bm-shop-sync.js', '/bm-nota.js',
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
  if (d.type === 'bm-sync' && typeof d.base === 'string' && /^https:\/\/[a-z0-9]+\.supabase\.co$/.test(d.base)) {
    event.waitUntil(syncMirror(d.base, String(d.apikey || ''), String(d.token || ''), event.source && event.source.id));
  }
});

/* =====================================================================
   SALINAN PENUH (mirror): saat online, semua tabel yang dipakai aplikasi diunduh ke HP.
   Saat offline/lemot, permintaan baca apa pun (filter, urutan, satu baris, hitung) dijawab
   dari salinan ini, jadi data yang belum pernah dibuka pun tetap tersedia.
   ===================================================================== */
const MIRROR = DATA_ORIGIN + '/mirror/';
const PAGE = 1000;
// [tabel, batas baris (0 = semua), urutan untuk tabel log]
const MIRROR_TABLES = [
  ['notes', 0], ['folders', 0], ['trash_items', 0], ['pending_items', 0], ['customers', 0], ['karyawan', 0],
  ['admin_roles', 0], ['role_permissions', 0], ['announcements', 0], ['announcement_seen', 0], ['app_settings', 0],
  ['jarvis_brain', 0], ['jarvis_memori', 0], ['shop_barang', 0], ['shop_v_stok', 0],
  ['perm_history', 200, 'id.desc'], ['login_log', 300, 'last_seen.desc'], ['activity_log', 500, 'created_at.desc']
];
let mirrorBusy = false;

function subOfToken(t) {
  try { const p = JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); return p && p.sub ? String(p.sub) : ''; } catch (e) { return ''; }
}

async function fetchTable(base, headers, table, limit, order) {
  const rows = [];
  let ordered = order || 'id.asc', tried = false;
  for (let from = 0; from < 200000; from += PAGE) {
    const to = from + PAGE - 1;
    const q = base + '/rest/v1/' + table + '?select=*' + (ordered ? '&order=' + ordered : '');
    const r = await fetch(q, { headers: Object.assign({ Range: from + '-' + to, 'Range-Unit': 'items' }, headers), cache: 'no-store' });
    if (r.status === 400 && ordered && !order && !tried) { ordered = ''; tried = true; from -= PAGE; continue; }   // tabel tanpa kolom id
    if (!r.ok && r.status !== 206) throw new Error(table + ' ' + r.status);
    const page = await r.json();
    if (!Array.isArray(page)) throw new Error(table + ' bukan daftar');
    rows.push.apply(rows, page);
    if (page.length < PAGE || (limit && rows.length >= limit)) break;
  }
  return limit ? rows.slice(0, limit) : rows;
}

async function syncMirror(base, apikey, token, clientId) {
  const sub = subOfToken(token);
  if (!sub || !apikey || mirrorBusy) return;
  mirrorBusy = true;
  const headers = { apikey: apikey, Authorization: 'Bearer ' + token, Accept: 'application/json' };
  let ok = 0, fail = 0;
  try {
    const c = await caches.open(DATA_CACHE);
    for (const [table, limit, order] of MIRROR_TABLES) {
      try {
        const rows = await fetchTable(base, headers, table, limit, order);
        await c.put(new Request(MIRROR + table), new Response(JSON.stringify(rows), {
          headers: { 'content-type': 'application/json', 'x-bm-sub': sub, 'x-bm-at': String(Date.now()), 'x-bm-rows': String(rows.length) }
        }));
        ok++;
      } catch (e) { fail++; }   // tabel tanpa izin (RLS) atau gagal: lewati, yang lain tetap jalan
    }
  } finally { mirrorBusy = false; }
  const msg = { type: 'bm-mirror', ok: ok, fail: fail, at: Date.now() };
  try { (await self.clients.matchAll({ type: 'window' })).forEach((cl) => cl.postMessage(msg)); } catch (e) {}
}

async function mirrorMeta(url, sub) {
  const m = url.pathname.match(/^\/rest\/v1\/([a-z_0-9]+)$/);
  if (!m) return null;
  const r = await (await caches.open(DATA_CACHE)).match(new Request(MIRROR + m[1]));
  if (!r) return null;
  const owner = r.headers.get('x-bm-sub') || '';
  if (sub && owner && sub !== owner) return null;
  return { table: m[1], res: r, at: Number(r.headers.get('x-bm-at')) || 0 };
}

/* --- penjawab mini ala PostgREST untuk salinan penuh --- */
function splitTop(str) {   // pisah koma di luar tanda kurung/kutip
  const out = []; let depth = 0, q = false, cur = '';
  for (const ch of str) {
    if (ch === '"') q = !q;
    if (!q && ch === '(') depth++;
    if (!q && ch === ')') depth--;
    if (!q && depth === 0 && ch === ',') { out.push(cur); cur = ''; } else cur += ch;
  }
  out.push(cur); return out;
}
function unq(v) { v = String(v).trim(); return v.length > 1 && v[0] === '"' && v[v.length - 1] === '"' ? v.slice(1, -1).replace(/\\"/g, '"') : v; }
function cmpVal(a, b) {
  if (a === null || a === undefined) return b === null || b === undefined ? 0 : -1;
  if (b === null || b === undefined) return 1;
  const na = typeof a === 'number' ? a : Number(a), nb = Number(b);
  if (typeof a === 'number' && !isNaN(nb)) return na - nb;
  if (typeof a === 'boolean') return String(a).localeCompare(String(b));
  const da = Date.parse(a), db = Date.parse(b);
  if (/^\d{4}-\d{2}-\d{2}/.test(String(a)) && /^\d{4}-\d{2}-\d{2}/.test(String(b)) && !isNaN(da) && !isNaN(db)) return da - db;
  return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
}
function likeRe(pat, ci) { return new RegExp('^' + pat.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/[*%]/g, '.*').replace(/_/g, '.') + '$', ci ? 'i' : ''); }
function makeTest(col, expr) {
  if (!/^[a-z_][a-z0-9_]*$/i.test(col)) return null;   // kolom JSON (->) dsb: tidak didukung
  let neg = false;
  if (expr.startsWith('not.')) { neg = true; expr = expr.slice(4); }
  const dot = expr.indexOf('.');
  if (dot < 0) return null;
  const op = expr.slice(0, dot), raw = expr.slice(dot + 1);
  let t;
  if (op === 'eq') t = (v) => v !== null && v !== undefined && String(v) === unq(raw);
  else if (op === 'neq') t = (v) => v === null || v === undefined || String(v) !== unq(raw);
  else if (op === 'gt') t = (v) => v != null && cmpVal(v, unq(raw)) > 0;
  else if (op === 'gte') t = (v) => v != null && cmpVal(v, unq(raw)) >= 0;
  else if (op === 'lt') t = (v) => v != null && cmpVal(v, unq(raw)) < 0;
  else if (op === 'lte') t = (v) => v != null && cmpVal(v, unq(raw)) <= 0;
  else if (op === 'like' || op === 'ilike') { const re = likeRe(unq(raw), op === 'ilike'); t = (v) => v != null && re.test(String(v)); }
  else if (op === 'is') { const w = raw.toLowerCase(); t = (v) => w === 'null' ? v === null || v === undefined : String(v) === w; }
  else if (op === 'in') {
    if (raw[0] !== '(' || raw[raw.length - 1] !== ')') return null;
    const set = new Set(splitTop(raw.slice(1, -1)).map(unq));
    t = (v) => v !== null && v !== undefined && set.has(String(v));
  } else return null;
  return neg ? (r) => !t(r[col]) : (r) => t(r[col]);
}
async function answerFromMirror(req, url, meta) {
  let rows = await meta.res.clone().json();
  if (!Array.isArray(rows)) return null;
  let cols = null, order = [], limit = null, offset = 0;
  const tests = [];
  for (const [k, v] of url.searchParams) {
    if (k === 'select') {
      if (/[()!:]/.test(v)) return null;                      // relasi/alias: tidak didukung
      const list = v.split(',').map((x) => x.trim()).filter(Boolean);
      cols = list.includes('*') ? null : list;
    } else if (k === 'order') {
      for (const part of v.split(',')) {
        const seg = part.split('.');
        if (!/^[a-z_][a-z0-9_]*$/i.test(seg[0])) return null;
        order.push({ c: seg[0], desc: seg.includes('desc'), nf: seg.includes('nullsfirst') ? true : seg.includes('nullslast') ? false : null });
      }
    } else if (k === 'limit') limit = parseInt(v, 10);
    else if (k === 'offset') offset = parseInt(v, 10) || 0;
    else if (k === 'or' || k === 'and' || k === 'columns' || k === 'on_conflict') return null;
    else { const t = makeTest(k, v); if (!t) return null; tests.push(t); }
  }
  rows = rows.filter((r) => tests.every((t) => t(r)));
  if (order.length) rows.sort((a, b) => {
    for (const o of order) {
      const x = a[o.c], y = b[o.c];
      const xn = x === null || x === undefined, yn = y === null || y === undefined;
      if (xn || yn) { if (xn && yn) continue; const nf = o.nf === null ? o.desc : o.nf; return (xn ? -1 : 1) * (nf ? 1 : -1); }
      const d = cmpVal(x, y); if (d) return o.desc ? -d : d;
    }
    return 0;
  });
  const total = rows.length;
  const range = req.headers.get('range');
  if (range && /^\d+-\d+$/.test(range)) { const [a, b] = range.split('-').map(Number); offset = a; limit = b - a + 1; }
  rows = rows.slice(offset, limit != null && !isNaN(limit) ? offset + limit : undefined);
  if (cols) rows = rows.map((r) => { const o = {}; cols.forEach((c) => { o[c] = r[c] === undefined ? null : r[c]; }); return o; });
  const h = { 'content-type': 'application/json; charset=utf-8', 'x-bm-at': String(meta.at), 'x-bm-mirror': '1' };
  const wantCount = /count=/.test(req.headers.get('prefer') || '');
  h['content-range'] = (rows.length ? offset + '-' + (offset + rows.length - 1) : '*') + '/' + (wantCount ? total : '*');
  if (/vnd\.pgrst\.object/.test(req.headers.get('accept') || '')) {
    if (rows.length !== 1) return new Response(JSON.stringify({ code: 'PGRST116', details: 'The result contains ' + rows.length + ' rows', hint: null, message: 'JSON object requested, multiple (or no) rows returned' }), { status: 406, headers: h });
    return new Response(req.method === 'HEAD' ? null : JSON.stringify(rows[0]), { status: 200, headers: h });
  }
  return new Response(req.method === 'HEAD' ? null : JSON.stringify(rows), { status: 200, headers: h });
}

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

    const meta = (req.method === 'GET' || req.method === 'HEAD') ? await mirrorMeta(url, sub).catch(() => null) : null;
    if (!cached && !meta) return net;
    // Salinan yang baru saja diperbarui (<15 dtk): langsung dipakai. Mencegah muat-ulang beruntun saat sinyal lemot.
    if (cached && Date.now() < slowUntil && Date.now() - at < 15000 && lastWrite < at) { event.waitUntil(net.catch(() => {})); return cached; }

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
    // Pilih salinan paling baru: jawaban persis yang pernah tersimpan, atau salinan penuh tabel
    if (meta && (!cached || meta.at > at)) {
      const m = await answerFromMirror(req, url, meta).catch(() => null);
      if (m) { notify(event.clientId, { type: 'bm-data', stale: true, at: meta.at, reason: res === 'slow' ? 'slow' : 'offline' }); return m; }
    }
    if (!cached) { if (res instanceof Response) return res; return net; }
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
      else lastWrite = Date.now();
      return;
    }
    if (url.pathname.startsWith('/rest/v1/') && req.method !== 'GET' && req.method !== 'HEAD') { lastWrite = Date.now(); return; }
    if ((req.method === 'GET' || req.method === 'HEAD') && url.pathname.startsWith('/rest/v1/')) { handleData(event, url); return; }
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
