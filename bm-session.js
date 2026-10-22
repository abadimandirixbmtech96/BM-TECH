/*
 * BM-TECH: modul sesi bersama untuk halaman Profil dan Dashboard (satu struktur, satu logika).
 *
 *  BMSession.afterAdminReady(client, session, { popup: true|false })
 *     - mencatat login perangkat ini ke tabel login_log (sekali per login) + detak "terakhir aktif" tiap 120 detik
 *     - bila popup = true: menampilkan pengumuman aktif yang belum dilihat akun ini (sekali per akun, tombol X)
 *  BMSession.stop()
 *     - menghentikan detak dan menghapus penanda login perangkat ini (panggil saat Keluar)
 *
 * Aturan aman:
 *  - Semua kegagalan jaringan/izin ditelan diam-diam: modul ini tidak boleh mengganggu halaman.
 *  - Tidak berjalan di dalam iframe (editor / panel), hanya di jendela utama dan di Dashboard yang tertanam di Profil (name=bm-dash-hub; tanpa pencatatan login ganda).
 *  - Tidak memakai kunci service_role. Semua akses lewat sesi admin + RLS di server.
 */
(function () {
  'use strict';
  if (window.BMSession) return;

  var BEAT_MS = 120000;
  var K_ID = 'bm-login-id';
  var K_WHO = 'bm-login-email';
  var beatTimer = null;
  var beatClient = null;
  var annStarted = false;

  function ssGet(k) { try { return sessionStorage.getItem(k) || ''; } catch (e) { return ''; } }
  function ssSet(k, v) { try { sessionStorage.setItem(k, v); } catch (e) {} }
  function ssDel(k) { try { sessionStorage.removeItem(k); } catch (e) {} }
  function isTop() { return window.parent === window; }
  function lower(s) { return String(s || '').trim().toLowerCase(); }

  /* ---------- identifikasi perangkat ---------- */
  function m1(ua, re) { var m = ua.match(re); return m ? m[1] : ''; }
  function dotted(v) { return String(v || '').replace(/_/g, '.'); }
  function major(v) { return String(v || '').split('.')[0]; }

  function parseUA(ua) {
    var r = { b: 'Browser', bv: '', en: '', os: 'Perangkat', osv: '', dt: 'Komputer', md: '' };
    /* browser (urutan penting: Edge/Opera/Samsung membawa kata "Chrome" juga) */
    if (/Edg(e|A|iOS)?\//.test(ua)) { r.b = 'Edge'; r.bv = m1(ua, /Edg(?:e|A|iOS)?\/([\d.]+)/); }
    else if (/OPR\/|OPT\//.test(ua)) { r.b = 'Opera'; r.bv = m1(ua, /OP[RT]\/([\d.]+)/); }
    else if (/SamsungBrowser\//.test(ua)) { r.b = 'Samsung Internet'; r.bv = m1(ua, /SamsungBrowser\/([\d.]+)/); }
    else if (/Firefox\/|FxiOS\//.test(ua)) { r.b = 'Firefox'; r.bv = m1(ua, /(?:Firefox|FxiOS)\/([\d.]+)/); }
    else if (/CriOS\//.test(ua)) { r.b = 'Chrome'; r.bv = m1(ua, /CriOS\/([\d.]+)/); }
    else if (/Chrome\//.test(ua)) { r.b = 'Chrome'; r.bv = m1(ua, /Chrome\/([\d.]+)/); }
    else if (/Safari\//.test(ua)) { r.b = 'Safari'; r.bv = m1(ua, /Version\/([\d.]+)/); }
    /* mesin render */
    r.en = /Firefox\/|FxiOS\//.test(ua) && !/iPhone|iPad/.test(ua) ? 'Gecko'
      : /iPhone|iPad|iPod/.test(ua) ? 'WebKit'
      : /Chrome\/|CriOS\/|Edg/.test(ua) ? 'Blink'
      : /AppleWebKit\//.test(ua) ? 'WebKit' : '';
    /* sistem operasi + jenis perangkat */
    if (/iPhone|iPod/.test(ua)) { r.os = 'iOS'; r.osv = dotted(m1(ua, /OS (\d+[_\d]*)/)); r.dt = 'Ponsel'; r.md = 'iPhone'; }
    else if (/iPad/.test(ua)) { r.os = 'iPadOS'; r.osv = dotted(m1(ua, /OS (\d+[_\d]*)/)); r.dt = 'Tablet'; r.md = 'iPad'; }
    else if (/Android/.test(ua)) {
      r.os = 'Android'; r.osv = m1(ua, /Android ([\d.]+)/);
      r.dt = /Mobile/.test(ua) ? 'Ponsel' : 'Tablet';
      var md = m1(ua, /;\s*([^;)]+?)\s+Build\//) || m1(ua, /Android [\d.]+;\s*([^;)]+?)\s*\)/);
      r.md = md && md !== 'K' ? md : '';
    }
    else if (/Windows/.test(ua)) { r.os = 'Windows'; r.osv = /Windows NT 10/.test(ua) ? '10/11' : dotted(m1(ua, /Windows NT ([\d.]+)/)); }
    else if (/Mac OS X|Macintosh/.test(ua)) { r.os = 'macOS'; r.osv = dotted(m1(ua, /Mac OS X (\d+[_.\d]*)/)); }
    else if (/CrOS/.test(ua)) { r.os = 'ChromeOS'; }
    else if (/Linux/.test(ua)) { r.os = 'Linux'; }
    return r;
  }

  function deviceName() {
    try {
      var u = parseUA(navigator.userAgent || '');
      var out = u.b + (u.bv ? ' ' + major(u.bv) : '') + ' · ' + u.os + (u.osv ? ' ' + (u.os === 'Windows' || u.os === 'macOS' ? u.osv : major(u.osv)) : '');
      if (u.md && u.os === 'Android') out += ' · ' + u.md;
      return out.slice(0, 100);
    } catch (e) { return 'Browser'; }
  }

  function wt(p, ms) { return Promise.race([p, new Promise(function (r) { setTimeout(function () { r(null); }, ms); })]); }

  /* Detail lengkap perangkat (dikirim ke login_log.info). Hanya informasi yang dibuka browser sendiri; IP dicatat server. */
  async function collectInfo() {
    var ua = navigator.userAgent || '';
    var u = parseUA(ua), o = {};
    try {
      var d = navigator.userAgentData;
      if (d && d.getHighEntropyValues) {
        var h = await wt(d.getHighEntropyValues(['platformVersion', 'architecture', 'bitness', 'model', 'uaFullVersion', 'fullVersionList', 'platform']), 1200);
        if (h) {
          if (h.model) u.md = h.model;
          if (h.architecture) o.ar = h.architecture + (h.bitness ? ' ' + h.bitness + '-bit' : '');
          if (h.uaFullVersion && u.b === 'Chrome') u.bv = h.uaFullVersion;
          if (h.platformVersion) {
            if (u.os === 'Windows') u.osv = parseInt(major(h.platformVersion), 10) >= 13 ? '11' : '10';
            else if (u.os === 'macOS' || u.os === 'Android' || u.os === 'ChromeOS') u.osv = h.platformVersion;
          }
          if (h.fullVersionList) {
            var fv = h.fullVersionList.filter(function (x) { return !/Not.?A.?Brand/i.test(x.brand); }).map(function (x) { return x.brand + ' ' + x.version; });
            if (fv.length) o.br = fv.join(', ').slice(0, 160);
          }
        }
      }
    } catch (e) {}
    try { if (navigator.brave && navigator.brave.isBrave && (await wt(navigator.brave.isBrave(), 600))) u.b = 'Brave'; } catch (e) {}
    o.b = u.b; o.bv = u.bv; o.en = u.en; o.os = u.os; o.osv = u.osv; o.dt = u.dt; o.md = u.md;
    try { o.sc = screen.width + '×' + screen.height + ' @' + (window.devicePixelRatio || 1) + 'x'; } catch (e) {}
    try { o.vp = window.innerWidth + '×' + window.innerHeight; } catch (e) {}
    try { o.lg = (navigator.languages && navigator.languages.length ? navigator.languages.slice(0, 3).join(', ') : navigator.language) || ''; } catch (e) {}
    try { o.tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) {}
    try { if (navigator.hardwareConcurrency) o.cpu = navigator.hardwareConcurrency; } catch (e) {}
    try { if (navigator.deviceMemory) o.mem = navigator.deviceMemory; } catch (e) {}
    try { o.tp = navigator.maxTouchPoints || 0; } catch (e) {}
    try { var cn = navigator.connection; if (cn && cn.effectiveType) o.net = cn.effectiveType + (cn.saveData ? ' (hemat data)' : ''); } catch (e) {}
    try { o.pwa = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true ? 'Aplikasi terpasang' : 'Browser'; } catch (e) {}
    try { o.th = window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'Gelap' : 'Terang'; } catch (e) {}
    o.ua = ua.slice(0, 320);
    Object.keys(o).forEach(function (k) { if (o[k] === '' || o[k] == null) delete o[k]; });
    return o;
  }

  /* ---------- pencatat login + detak ---------- */
  function beat() {
    var id = ssGet(K_ID);
    if (!beatClient || !id) return;
    try {
      Promise.resolve(beatClient.from('login_log').update({ last_seen: new Date().toISOString() }).eq('id', id))
        .then(function () {}, function () {});
    } catch (e) {}
  }

  async function track(client, email) {
    try {
      email = lower(email);
      var id = ssGet(K_ID), who = ssGet(K_WHO);
      if (!id || who !== email) {
        var info = null;
        try { info = await wt(collectInfo(), 2500); } catch (e) { info = null; }
        var r = await client.from('login_log').insert({ device: deviceName(), info: info }).select('id').single();
        if (r && r.data && r.data.id) { ssSet(K_ID, String(r.data.id)); ssSet(K_WHO, email); }
      }
      beatClient = client;
      if (!beatTimer) {
        beatTimer = setInterval(beat, BEAT_MS);
        document.addEventListener('visibilitychange', function () { if (!document.hidden) beat(); });
      }
      beat();
    } catch (e) { /* abaikan */ }
  }

  /* ---------- popup pengumuman (ala iklan, tombol X) ---------- */
  var KINDS = {
    update: { t: 'Update', c: '#3b82f6', ic: '<path d="M12 19V5M5 12l7-7 7 7"/>' },
    fix: { t: 'Perbaikan', c: '#22c55e', ic: '<path d="M5 12.5l4.5 4.5L19 7.5"/>' },
    info: { t: 'Info', c: '#f5a524', ic: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>' }
  };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function injectCss() {
    if (document.getElementById('bms-css')) return;
    var st = document.createElement('style');
    st.id = 'bms-css';
    st.textContent =
      '.bms-ov{position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;padding:20px;background:rgba(0,0,0,.55);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px)}' +
      '.bms-card{position:relative;width:100%;max-width:340px;border-radius:24px;padding:28px 22px 22px;text-align:center;background:#1c1c1e;color:#f2f2f7;box-shadow:0 20px 50px rgba(0,0,0,.45);font-family:inherit}' +
      '.bms-light .bms-card{background:#fff;color:#111}' +
      '.bms-x{position:absolute;top:10px;right:10px;width:32px;height:32px;border:0;border-radius:50%;display:grid;place-items:center;cursor:pointer;background:rgba(127,127,127,.18);color:inherit}' +
      '.bms-x svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}' +
      '.bms-big{width:64px;height:64px;border-radius:20px;margin:0 auto 14px;display:grid;place-items:center}' +
      '.bms-big svg{width:30px;height:30px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}' +
      '.bms-kt{font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;margin-bottom:6px}' +
      '.bms-card h3{margin:0 0 8px;font-size:19px;line-height:1.25;word-break:break-word}' +
      '.bms-card p{margin:0;font-size:14px;line-height:1.5;opacity:.75;white-space:pre-line;word-break:break-word}';
    document.head.appendChild(st);
  }

  function showCard(a, onClose) {
    injectCss();
    var k = KINDS[a.kind] || KINDS.info;
    var ov = document.createElement('div');
    ov.className = 'bms-ov' + (document.body.classList.contains('theme-light') ? ' bms-light' : '');
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-modal', 'true');
    ov.innerHTML =
      '<div class="bms-card">' +
        '<button class="bms-x" type="button" aria-label="Tutup"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button>' +
        '<div class="bms-big" style="background:' + k.c + '29;color:' + k.c + '"><svg viewBox="0 0 24 24">' + k.ic + '</svg></div>' +
        '<div class="bms-kt" style="color:' + k.c + '">' + k.t + (a.version ? ' · v' + esc(a.version) : '') + '</div>' +
        '<h3 data-no-i18n>' + esc(a.title) + '</h3><p data-no-i18n>' + esc(a.message) + '</p>' +
      '</div>';
    var done = false;
    function close() {
      if (done) return; done = true;
      document.removeEventListener('keydown', onKey);
      if (ov.parentNode) ov.parentNode.removeChild(ov);
      onClose();
    }
    function onKey(e) { if (e.key === 'Escape') close(); }
    ov.querySelector('.bms-x').addEventListener('click', close);
    document.addEventListener('keydown', onKey);
    document.body.appendChild(ov);
  }

  async function announce(client, email) {
    if (annStarted) return;
    annStarted = true;
    try {
      email = lower(email);
      var rr = await client.from('admin_roles').select('role').eq('email', email).maybeSingle();
      var group = rr && rr.data && rr.data.role === 'owner' ? 'Owner' : 'Admin';
      var q = await Promise.all([
        client.from('announcements').select('*').eq('status', 'aktif').order('created_at', { ascending: false }),
        client.from('announcement_seen').select('announcement_id')
      ]);
      if (q[0].error || q[1].error) return;
      var seen = {};
      (q[1].data || []).forEach(function (r) { seen[String(r.announcement_id)] = true; });
      var now = Date.now();
      var queue = (q[0].data || []).filter(function (a) {
        if (seen[String(a.id)]) return false;
        if (a.expires_at && Date.parse(a.expires_at) <= now) return false;
        var t = Array.isArray(a.targets) ? a.targets.map(String) : ['Owner', 'Admin'];
        return t.indexOf(group) !== -1;
      }).slice(0, 3);

      (function next() {
        var a = queue.shift();
        if (!a) return;
        showCard(a, function () {
          try {
            Promise.resolve(client.from('announcement_seen').insert({ announcement_id: a.id, email: email }))
              .then(function () {}, function () {});
          } catch (e) {}
          setTimeout(next, 250);
        });
      })();
    } catch (e) { /* abaikan */ }
  }

  /* ---------- izin per role: sembunyikan tombol yang tidak boleh dipakai ----------
     Penjaga sebenarnya ada di database (RLS + has_perm). Ini hanya merapikan tampilan.
     Bila izin gagal dibaca (offline dll.), tombol TIDAK disembunyikan; server tetap menolak yang tidak berhak. */
  var PERM_KEYS = ['tulis', 'hapus', 'pulih', 'ekspor'];
  var PERM_CACHE = 'bm-perms';

  function injectPermCss() {
    if (document.getElementById('bms-perm-css')) return;
    var st = document.createElement('style');
    st.id = 'bms-perm-css';
    st.textContent =
      'body.bm-no-hapus #btnSelDelete,body.bm-no-hapus .folder-menu-item[data-menu-action="delete"]{display:none !important}' +
      'body.bm-no-tulis #btnComposePencil,body.bm-no-tulis #btnSelPin,body.bm-no-tulis #btnSelMove,body.bm-no-tulis #btnCreateCategory,body.bm-no-tulis #btnNoteDetailEdit,body.bm-no-tulis .folder-menu-item[data-menu-action="edit"]{display:none !important}' +
      'body.bm-no-pulih #btnOpenTrash,body.bm-no-pulih #btnTrashEmptyAll{display:none !important}' +
      'body.bm-no-ekspor #btnShareExportCsv,body.bm-no-ekspor #rowBackupAll{display:none !important}';
    document.head.appendChild(st);
  }

  function setPermClasses(p) {
    PERM_KEYS.forEach(function (k) { document.body.classList.toggle('bm-no-' + k, p[k] === false); });
  }

  async function applyPerms(client, email) {
    try {
      injectPermCss();
      email = lower(email);
      try {
        var c = JSON.parse(localStorage.getItem(PERM_CACHE) || 'null');
        if (c && c.email === email) setPermClasses(c);   /* tampil benar sejak awal, tanpa berkedip */
      } catch (e) {}
      var res = await Promise.all(PERM_KEYS.map(function (k) { return client.rpc('has_perm', { f: k }); }));
      var p = { email: email }, anyOk = false;
      PERM_KEYS.forEach(function (k, i) {
        var r = res[i];
        if (r && !r.error && typeof r.data === 'boolean') { p[k] = r.data; anyOk = true; } else { p[k] = true; }
      });
      setPermClasses(p);
      if (anyOk) { try { localStorage.setItem(PERM_CACHE, JSON.stringify(p)); } catch (e) {} }
    } catch (e) { /* abaikan */ }
  }

  /* ---------- API publik ---------- */
  function afterAdminReady(client, session, opts) {
    try {
      var inHub = window.name === 'bm-dash-hub';   /* Dashboard yang berjalan di dalam Profil (tanpa reload) */
      if ((!isTop() && !inHub) || !client || !session || !session.user) return;
      var email = lower(session.user.email);
      if (isTop()) track(client, email);
      if (opts && opts.perms) applyPerms(client, email);
      if (opts && opts.popup) announce(client, email);
    } catch (e) { /* abaikan */ }
  }

  function stop() {
    if (beatTimer) { clearInterval(beatTimer); beatTimer = null; }
    beatClient = null;
    ssDel(K_ID);
    ssDel(K_WHO);
    try { localStorage.removeItem(PERM_CACHE); } catch (e) {}
  }

  window.BMSession = { afterAdminReady: afterAdminReady, track: track, stop: stop, deviceName: deviceName, collectInfo: collectInfo, parseUA: parseUA };
})();
