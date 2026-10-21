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
 *  - Tidak berjalan di dalam iframe (editor / panel), hanya di jendela utama.
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

  /* Nama perangkat singkat untuk log: "Chrome · Android" */
  function deviceName() {
    var ua = navigator.userAgent || '';
    var os = /iPhone/.test(ua) ? 'iPhone'
      : /iPad/.test(ua) ? 'iPad'
      : /Android/.test(ua) ? 'Android'
      : /Windows/.test(ua) ? 'Windows'
      : /Mac OS X|Macintosh/.test(ua) ? 'Mac'
      : /Linux/.test(ua) ? 'Linux' : 'Perangkat';
    var br = /Edg\//.test(ua) ? 'Edge'
      : /OPR\/|Opera/.test(ua) ? 'Opera'
      : /Firefox|FxiOS/.test(ua) ? 'Firefox'
      : /CriOS|Chrome\//.test(ua) ? 'Chrome'
      : /Safari\//.test(ua) ? 'Safari' : 'Browser';
    return (br + ' · ' + os).slice(0, 60);
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
        var r = await client.from('login_log').insert({ device: deviceName() }).select('id').single();
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

  /* ---------- API publik ---------- */
  function afterAdminReady(client, session, opts) {
    try {
      if (!isTop() || !client || !session || !session.user) return;
      var email = lower(session.user.email);
      track(client, email);
      if (opts && opts.popup) announce(client, email);
    } catch (e) { /* abaikan */ }
  }

  function stop() {
    if (beatTimer) { clearInterval(beatTimer); beatTimer = null; }
    beatClient = null;
    ssDel(K_ID);
    ssDel(K_WHO);
  }

  window.BMSession = { afterAdminReady: afterAdminReady, track: track, stop: stop, deviceName: deviceName };
})();
