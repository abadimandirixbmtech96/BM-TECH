/*!
 * bm-app.js: lapisan "rasa aplikasi" bersama untuk semua halaman BM-TECH.
 *
 * Pasang SETELAH tag supabase-js (kalau halaman memakainya), atau di <head> untuk halaman tanpa Supabase.
 *
 *  1. Sesi offline: kalau token login sudah kedaluwarsa dan perbaruannya gagal karena jaringan,
 *     getSession() tetap mengembalikan sesi terakhir yang tersimpan, jadi halaman tidak terlempar ke login.
 *     Data dibaca dari salinan terakhir oleh service worker (sw.js). Sesi yang benar-benar keluar tetap keluar.
 *  2. Penanda kecil di atas layar: "Offline", "Sinyal lemot", "Data terbaru siap", "Kembali online".
 *  3. Perpindahan halaman halus (View Transitions), sentuhan tanpa jeda, tanpa tarik-untuk-reload.
 *  4. Mendaftarkan service worker di semua halaman.
 *
 * Event untuk halaman: window 'bm:refresh' (diminta memuat ulang data tanpa reload halaman).
 * Bila halaman menangani dan memanggil e.preventDefault(), halaman tidak dimuat ulang.
 */
(function (w, d) {
  'use strict';
  if (w.BMApp) return;

  var sbInfo = null;   // alamat + kunci publik Supabase halaman ini (untuk unduh salinan penuh)

  /* ---------- 1. Sesi offline ---------- */
  function isNetErr(err) {
    if (!err) return false;
    if (!navigator.onLine) return true;
    var n = String(err.name || ''), m = String(err.message || '');
    return n === 'AuthRetryableFetchError' || err.status === 0 || /fetch|network|load failed|timeout/i.test(m);
  }
  function storedSession(key) {
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return null;
      var s = JSON.parse(raw);
      if (s && s.currentSession) s = s.currentSession;
      return s && s.access_token && s.user ? s : null;
    } catch (e) { return null; }
  }
  function patchClient(client, opts) {
    try {
      if (!client || !client.auth || client.auth.__bmPatched) return client;
      var auth = client.auth;
      var key = (opts && opts.auth && opts.auth.storageKey) || auth.storageKey;
      var orig = auth.getSession.bind(auth);
      auth.getSession = function () {
        var s0 = key && storedSession(key);
        var expired = s0 && s0.expires_at && s0.expires_at * 1000 < Date.now() + 30000;
        // Offline + token kedaluwarsa: supabase-js akan mencoba perbarui token sampai ~30 detik. Jangan tunggu.
        if (expired && !navigator.onLine) { BMApp.offlineSession = true; return Promise.resolve({ data: { session: s0 }, error: null }); }
        var p = orig();
        if (expired) {
          p = Promise.race([p, new Promise(function (res) {
            setTimeout(function () { BMApp.offlineSession = true; res({ data: { session: s0 }, error: null }); }, 3500);
          })]);
        }
        return p.then(function (r) {
          var has = r && r.data && r.data.session;
          if (!has && r && r.error && isNetErr(r.error)) {
            var s = key && storedSession(key);
            if (s) { BMApp.offlineSession = true; return { data: { session: s }, error: null }; }
          }
          return r;
        }, function (err) {
          var s = isNetErr(err) && key && storedSession(key);
          if (s) { BMApp.offlineSession = true; return { data: { session: s }, error: null }; }
          throw err;
        });
      };
      auth.__bmPatched = true;
    } catch (e) {}
    return client;
  }
  function patchLib() {
    var lib = w.supabase;
    if (!lib || typeof lib.createClient !== 'function' || lib.__bmPatched) return;
    var create = lib.createClient;
    var wrapped = function (url, k, opts) {
      if (!sbInfo && typeof url === 'string' && typeof k === 'string') sbInfo = { url: url.replace(/\/+$/, ''), key: k, storageKey: (opts && opts.auth && opts.auth.storageKey) || '' };
      return patchClient(create.apply(this, arguments), opts);
    };
    try { lib.createClient = wrapped; } catch (e) {}
    if (lib.createClient !== wrapped) {
      var copy = {};
      Object.keys(lib).forEach(function (p) { try { copy[p] = lib[p]; } catch (e) {} });
      copy.createClient = wrapped;
      lib = copy;
      try { w.supabase = copy; } catch (e) {}
    }
    try { lib.__bmPatched = true; } catch (e) {}
  }
  patchLib();

  /* ---------- 2. Penanda status jaringan / data ---------- */
  var pill = null, pillTimer = null, state = { stale: false, fresh: false, at: 0 };
  function hhmm(t) {
    if (!t) return '';
    var x = new Date(t), now = new Date();
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    var same = x.toDateString() === now.toDateString();
    return (same ? '' : p(x.getDate()) + '/' + p(x.getMonth() + 1) + ' ') + p(x.getHours()) + '.' + p(x.getMinutes());
  }
  function ensurePill() {
    if (pill || !d.body) return pill;
    pill = d.createElement('div');
    pill.className = 'bm-net';
    pill.setAttribute('role', 'status');
    pill.setAttribute('aria-live', 'polite');
    pill.setAttribute('data-no-i18n', '');
    pill.innerHTML = '<span class="bm-net-dot"></span><span class="bm-net-txt"></span><button type="button" class="bm-net-btn" hidden></button>';
    pill.querySelector('.bm-net-btn').addEventListener('click', function (e) { e.stopPropagation(); refresh(); });
    pill.addEventListener('click', hide);
    d.body.appendChild(pill);
    return pill;
  }
  function show(kind, text, btn, autoHide) {
    if (!ensurePill()) return;
    clearTimeout(pillTimer);
    pill.setAttribute('data-kind', kind);
    pill.querySelector('.bm-net-txt').textContent = text;
    var b = pill.querySelector('.bm-net-btn');
    b.hidden = !btn; if (btn) b.textContent = btn;
    pill.classList.add('on');
    pillTimer = setTimeout(hide, autoHide || 2600);   // selalu hilang sendiri, tidak pernah menutupi layar terus-menerus
  }
  function hide() { if (pill) pill.classList.remove('on'); }
  /* Tiap keadaan hanya diberitahukan SEKALI (bukan tiap permintaan data), lalu hilang sendiri. */
  var lastKind = '', lastAuto = 0;
  function render() {
    var kind = !navigator.onLine ? 'off' : state.fresh ? 'fresh' : state.stale ? 'slow' : '';
    if (kind === lastKind) return;
    lastKind = kind;
    if (kind === 'off') show('off', 'Offline · memakai data tersimpan', null, 3000);
    else if (kind === 'slow') show('slow', 'Sinyal lemot · memakai data tersimpan', null, 2600);
    else if (kind === 'fresh') {
      // Data baru sudah datang: halaman yang bisa menyegarkan diri langsung memakainya, tanpa perlu diketuk
      state.fresh = false; state.stale = false; lastKind = '';
      if (Date.now() - lastAuto < 45000) return;          // jangan menyegarkan berulang-ulang saat sinyal naik-turun
      lastAuto = Date.now();
      if (fire(w, true)) show('ok', 'Data diperbarui', null, 1800);
      else show('fresh', 'Data terbaru siap', 'Muat', 6000);
    } else hide();
  }
  function fire(win, silent) {
    var ev;
    try { ev = new win.CustomEvent('bm:refresh', { cancelable: true, detail: { silent: !!silent } }); } catch (e) { ev = win.document.createEvent('CustomEvent'); ev.initCustomEvent('bm:refresh', false, true, { silent: !!silent }); }
    var handled = !win.dispatchEvent(ev);
    for (var i = 0; i < win.frames.length; i++) { try { if (fire(win.frames[i], silent)) handled = true; } catch (e) {} }
    return handled;
  }
  function refresh() {
    state.fresh = false; state.stale = false; state.at = 0; lastKind = ''; hide();
    if (!fire(w)) location.reload();
  }
  var IS_TOP = (function () { try { return w.top === w || !w.top.BMApp; } catch (e) { return true; } })();
  function onData(m) {
    if (!IS_TOP) { try { w.top.BMApp._onData(m); return; } catch (e) {} }
    if (m.stale) { state.stale = true; if (m.at && (!state.at || m.at < state.at)) state.at = m.at; }
    else if (m.fresh) { if (state.stale) state.fresh = true; }
    else return;
    render();
  }
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', function (e) {
      var m = e.data || {};
      if (m.type === 'bm-data') onData(m);
    });
  }
  w.addEventListener('offline', function () { if (IS_TOP) render(); });
  w.addEventListener('online', function () {
    if (!IS_TOP) return;
    if (state.stale) { state.fresh = true; render(); }
    else { lastKind = ''; show('ok', 'Kembali online', null, 2000); }
  });

  /* ---------- 3. Rasa aplikasi ---------- */
  var css = [
    '@view-transition{navigation:auto}',
    '::view-transition-old(root){animation:bmVtOut .2s cubic-bezier(.32,.72,0,1) both}',
    '::view-transition-new(root){animation:bmVtIn .32s cubic-bezier(.32,.72,0,1) both}',
    'html:active-view-transition-type(back)::view-transition-old(root){animation-name:bmVtOutB}',
    'html:active-view-transition-type(back)::view-transition-new(root){animation-name:bmVtInB}',
    '@keyframes bmVtIn{from{opacity:0;transform:translateX(28px)}}',
    '@keyframes bmVtOut{to{opacity:0;transform:translateX(-14px)}}',
    '@keyframes bmVtInB{from{opacity:0;transform:translateX(-28px)}}',
    '@keyframes bmVtOutB{to{opacity:0;transform:translateX(14px)}}',
    'html{-webkit-tap-highlight-color:transparent;-webkit-text-size-adjust:100%;text-size-adjust:100%}',
    'html,body{overscroll-behavior-y:contain}',
    'a,button,input,select,textarea,label,summary,[role=button],[onclick]{touch-action:manipulation}',
    'button,[role=button]{-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}',
    'img{-webkit-user-drag:none}',
    /* penanda status */
    '.bm-net{position:fixed;left:50%;top:calc(env(safe-area-inset-top,0px) + 8px);z-index:2147483000;display:flex;align-items:center;gap:8px;max-width:calc(100vw - 32px);padding:7px 8px 7px 12px;border-radius:999px;background:rgba(28,28,30,.86);color:#f5f5f7;font:600 12.5px/1.2 -apple-system,BlinkMacSystemFont,"Inter","Segoe UI",Roboto,sans-serif;letter-spacing:.01em;box-shadow:0 8px 28px rgba(0,0,0,.28),inset 0 0 0 .5px rgba(255,255,255,.12);-webkit-backdrop-filter:saturate(180%) blur(20px);backdrop-filter:saturate(180%) blur(20px);transform:translate(-50%,-140%);opacity:0;pointer-events:none;transition:transform .45s cubic-bezier(.32,.72,0,1),opacity .3s ease}',
    '.bm-net.on{transform:translate(-50%,0);opacity:1;pointer-events:auto}',
    '.bm-net-txt{transition:max-width .4s cubic-bezier(.32,.72,0,1)}',
    '.bm-net-dot{width:7px;height:7px;border-radius:50%;flex:none;background:#8e8e93}',
    '.bm-net[data-kind=off] .bm-net-dot{background:#ff453a}',
    '.bm-net[data-kind=slow] .bm-net-dot{background:#ffd60a}',
    '.bm-net[data-kind=fresh] .bm-net-dot,.bm-net[data-kind=ok] .bm-net-dot{background:#30d158}',
    '.bm-net-txt{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding-right:4px;max-width:70vw}',
    '.bm-net-btn{border:0;border-radius:999px;padding:5px 11px;background:var(--accent,#F0A529);color:#111;font:inherit;cursor:pointer}',
    '.bm-net-btn:active{opacity:.75}',
    '.bm-spin svg,.bm-spin>i{animation:bmSpin .8s linear infinite}@keyframes bmSpin{to{transform:rotate(360deg)}}',
    '@media (prefers-reduced-motion:reduce){::view-transition-old(root),::view-transition-new(root){animation:none}.bm-net{transition:none}}'
  ].join('\n');
  function injectCss() {
    if (d.getElementById('bm-app-css')) return;
    var st = d.createElement('style');
    st.id = 'bm-app-css';
    st.textContent = css;
    (d.head || d.documentElement).appendChild(st);
  }
  injectCss();

  // Arah animasi: kembali (tombol back / history.back) = geser dari kiri
  // Animasi perpindahan yang dibatalkan (pindah halaman cepat/redirect) bukan error: jangan sampai memunculkan alert
  w.addEventListener('unhandledrejection', function (e) {
    var r = e.reason, m = String((r && (r.message || r.name)) || r || '');
    if (/transition was (aborted|skipped)|ViewTransition|view transition/i.test(m)) { e.preventDefault(); if (e.stopImmediatePropagation) e.stopImmediatePropagation(); }
  });
  function quiet(vt) { try { ['ready', 'finished', 'updateCallbackDone'].forEach(function (k) { if (vt[k] && vt[k].catch) vt[k].catch(function () {}); }); } catch (e) {} }
  w.addEventListener('pagereveal', function (e) {
    try {
      if (!e.viewTransition) return;
      quiet(e.viewTransition);
      try { if (sessionStorage.getItem('bm-swipe-nav')) { sessionStorage.removeItem('bm-swipe-nav'); e.viewTransition.skipTransition(); return; } } catch (x) {}
      var act = w.navigation && w.navigation.activation;
      if (act && act.navigationType === 'traverse' && act.from && act.entry && act.entry.index < act.from.index) e.viewTransition.types.add('back');
    } catch (err) {}
  });
  w.addEventListener('pageswap', function (e) {
    try {
      if (!e.viewTransition) return;
      quiet(e.viewTransition);
      if (w.__bmSwipeNav) { e.viewTransition.skipTransition(); return; }   // sudah dianimasikan oleh gestur geser
      var a = e.activation;
      if (a && a.navigationType === 'traverse' && a.from && a.entry && a.entry.index < a.from.index) e.viewTransition.types.add('back');
    } catch (err) {}
  });

  // Kembali dari bfcache dengan status jaringan berbeda
  w.addEventListener('pageshow', function (e) { if (e.persisted && IS_TOP) render(); });

  function onReady() { if (IS_TOP && !navigator.onLine) render(); }
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', onReady); else onReady();

  /* ---------- 4. Service worker ---------- */
  if ('serviceWorker' in navigator && w.top === w) {
    var reg = function () { navigator.serviceWorker.register('/sw.js').catch(function () {}); };
    if (d.readyState === 'complete') reg(); else w.addEventListener('load', reg);
  }

  /* ---------- 5. Salinan penuh data di HP ----------
     Admin yang login: semua tabel diunduh ke HP (paling sering tiap 10 menit, dan setiap kembali online),
     supaya saat offline seluruh data tetap bisa dibuka, termasuk catatan yang belum pernah dibuka. */
  var MIRROR_EVERY = 10 * 60 * 1000;
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function syncMirror(force) {
    try {
      if (!IS_TOP || !navigator.onLine || !sbInfo || !navigator.serviceWorker || !navigator.serviceWorker.controller) return;
      if (!lsGet('bm-admin-ok')) return;
      var s = storedSession(sbInfo.storageKey || 'bmtech-auth');
      if (!s || !s.expires_at || s.expires_at * 1000 < Date.now() + 60000) return;
      var last = Number(lsGet('bm-mirror-req') || 0);
      if (!force && Date.now() - last < MIRROR_EVERY) return;
      lsSet('bm-mirror-req', String(Date.now()));
      navigator.serviceWorker.controller.postMessage({ type: 'bm-sync', base: sbInfo.url, apikey: sbInfo.key, token: s.access_token });
    } catch (e) {}
  }
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', function (e) {
      var m = e.data || {};
      if (m.type === 'bm-mirror' && m.ok) lsSet('bm-mirror-at', String(m.at || Date.now()));
    });
    navigator.serviceWorker.addEventListener('controllerchange', function () { setTimeout(function () { syncMirror(false); }, 3000); });
  }
  w.addEventListener('load', function () { setTimeout(function () { syncMirror(false); }, 4000); });
  w.addEventListener('online', function () { setTimeout(function () { syncMirror(true); }, 2500); });
  setInterval(function () { if (!d.hidden) syncMirror(false); }, 60000);

  /* Halaman login tanpa sesi = sudah keluar: buang salinan data & tampilan milik akun sebelumnya */
  if (/\/(admin|karyawan|customer)-login\.html$/.test(location.pathname)) {
    var clearIfLoggedOut = function () {
      if (storedSession('bmtech-auth')) return;
      try { localStorage.removeItem('bm-profile-snap-v1'); localStorage.removeItem('bm-mirror-req'); localStorage.removeItem('bm-mirror-at'); } catch (e) {}
      try { if (navigator.serviceWorker && navigator.serviceWorker.controller) navigator.serviceWorker.controller.postMessage({ type: 'bm-clear-data' }); } catch (e) {}
    };
    if (d.readyState === 'complete') clearIfLoggedOut(); else w.addEventListener('load', clearIfLoggedOut);
  }

  w.BMApp = {
    patchClient: patchClient,
    patchLib: patchLib,
    refresh: refresh,
    syncNow: function () { syncMirror(true); },
    lastSync: function () { return Number(lsGet('bm-mirror-at') || 0); },
    _onData: onData,
    offlineSession: false,
    clearOfflineData: function () {
      try { if (navigator.serviceWorker && navigator.serviceWorker.controller) navigator.serviceWorker.controller.postMessage({ type: 'bm-clear-data' }); } catch (e) {}
    }
  };
})(window, document);
