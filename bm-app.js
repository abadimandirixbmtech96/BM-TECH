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
    var wrapped = function (url, k, opts) { return patchClient(create.apply(this, arguments), opts); };
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
    pill.addEventListener('click', function () {
      if (!pill.classList.contains('mini')) return;
      pill.classList.remove('mini'); clearTimeout(pillTimer);
      pillTimer = setTimeout(function () { pill.classList.add('mini'); }, 3500);
    });
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
    pill.classList.remove('mini');
    if (autoHide) pillTimer = setTimeout(hide, autoHide);
    else if (!btn) pillTimer = setTimeout(function () { pill.classList.add('mini'); }, 4000);   // menyusut jadi titik kecil
  }
  function hide() { if (pill) pill.classList.remove('on'); }
  function render() {
    if (!navigator.onLine) {
      show('off', 'Offline' + (state.at ? ' · data ' + hhmm(state.at) : ' · data tersimpan'));
    } else if (state.fresh) {
      show('fresh', 'Data terbaru siap', 'Muat');
    } else if (state.stale) {
      show('slow', 'Sinyal lemot · data ' + (state.at ? hhmm(state.at) : 'tersimpan'));
    } else hide();
  }
  function fire(win) {
    var ev;
    try { ev = new win.CustomEvent('bm:refresh', { cancelable: true }); } catch (e) { ev = win.document.createEvent('CustomEvent'); ev.initCustomEvent('bm:refresh', false, true, null); }
    var handled = !win.dispatchEvent(ev);
    for (var i = 0; i < win.frames.length; i++) { try { if (fire(win.frames[i])) handled = true; } catch (e) {} }
    return handled;
  }
  function refresh() {
    state.fresh = false; state.stale = false; state.at = 0; hide();
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
    else show('ok', 'Kembali online', null, 2200);
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
    '.bm-net.mini{padding:6px;gap:0;cursor:pointer}.bm-net.mini .bm-net-txt{max-width:0;padding:0}',
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
  w.addEventListener('pagereveal', function (e) {
    try {
      if (!e.viewTransition) return;
      var act = w.navigation && w.navigation.activation;
      if (act && act.navigationType === 'traverse' && act.from && act.entry && act.entry.index < act.from.index) e.viewTransition.types.add('back');
    } catch (err) {}
  });
  w.addEventListener('pageswap', function (e) {
    try {
      if (!e.viewTransition) return;
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

  w.BMApp = {
    patchClient: patchClient,
    patchLib: patchLib,
    refresh: refresh,
    _onData: onData,
    offlineSession: false,
    clearOfflineData: function () {
      try { if (navigator.serviceWorker && navigator.serviceWorker.controller) navigator.serviceWorker.controller.postMessage({ type: 'bm-clear-data' }); } catch (e) {}
    }
  };
})(window, document);
