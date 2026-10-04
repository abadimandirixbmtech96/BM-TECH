/*!
 * bm-theme.js — tema per-device untuk BM-TECH (warna sistem, font, font custom)
 * Dipakai oleh dashboard-admin.html dan system-management.html.
 * Semua pengaturan tersimpan lokal di perangkat: localStorage untuk pilihan,
 * IndexedDB untuk file font custom. Tidak ada yang dikirim ke server.
 *
 * Muat di <head> secara sinkron supaya warna & font terpasang sebelum halaman tampil:
 *   <script src="/bm-theme.js"></script>
 */
(function (w, d) {
  'use strict';

  var K = {
    accent: 'bm-accent',
    font: 'bm-font',
    bold: 'bm-font-bold',
    custom: 'bm-font-custom-name',
    theme: 'bm-theme',
    lang: 'bm-lang'
  };
  var DEFAULT_ACCENT = '#F0A529';
  var FAMILY = 'BMCustom';
  var DB = 'bm-fonts', STORE = 'fonts', REC = 'custom';
  var MAX_FONT_BYTES = 10 * 1024 * 1024;
  var BASE = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

  /* Harus sama dengan kelas font-* di CSS dashboard-admin.html */
  var STACKS = {
    default: "'Inter', " + BASE,
    rounded: "ui-rounded, 'SF Pro Rounded', 'Baloo 2', 'Segoe UI', sans-serif",
    humanis: "Verdana, Tahoma, Geneva, sans-serif",
    kompak: "'Arial Narrow', 'Segoe UI', Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', Times, serif",
    klasik: "'Times New Roman', Times, Georgia, serif",
    mono: "'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace",
    custom: "'" + FAMILY + "', 'Inter', " + BASE
  };

  var root = d.documentElement;

  /* ---------- Storage ---------- */
  function get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function del(k) { try { localStorage.removeItem(k); } catch (e) {} }
  function fail(code) { var e = new Error(code); e.code = code; return e; }

  /* ---------- Warna ---------- */
  function normalizeHex(v) {
    v = String(v || '').trim();
    if (v.charAt(0) !== '#') v = '#' + v;
    if (/^#[0-9a-fA-F]{3}$/.test(v)) v = '#' + v[1] + v[1] + v[2] + v[2] + v[3] + v[3];
    return /^#[0-9a-fA-F]{6}$/.test(v) ? v.toUpperCase() : null;
  }
  function rgbOf(hex) {
    return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
  }
  function luminance(hex) {
    var c = rgbOf(hex).map(function (v) {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  function contrast(a, b) {
    var la = luminance(a), lb = luminance(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  }
  function onAccent(hex) {
    return contrast(hex, '#1C1B19') >= contrast(hex, '#FFFFFF') ? '#1C1B19' : '#FFFFFF';
  }

  function setThemeColor(hex) {
    var m = d.querySelector('meta[name="theme-color"]');
    if (!m) {
      m = d.createElement('meta');
      m.name = 'theme-color';
      (d.head || root).appendChild(m);
    }
    m.content = hex;
  }

  function getAccent() { return normalizeHex(get(K.accent)) || DEFAULT_ACCENT; }

  function applyAccent(hex) {
    var c = rgbOf(hex), s = root.style;
    var glow = 'rgba(' + c.join(', ') + ', 0.28)';
    s.setProperty('--accent', hex);
    s.setProperty('--accent-yellow', hex);
    s.setProperty('--accent-rgb', c.join(', '));
    s.setProperty('--accent-glow', glow);
    s.setProperty('--accent-yellow-glow', glow);
    s.setProperty('--on-accent', onAccent(hex));
    setThemeColor(hex);
  }

  function saveAccent(hex) {
    hex = normalizeHex(hex);
    if (!hex) return null;
    if (hex === DEFAULT_ACCENT) del(K.accent); else set(K.accent, hex);
    applyAccent(hex);
    return hex;
  }

  /* ---------- Font ---------- */
  function hasCustom() { return !!get(K.custom); }
  function customName() { return get(K.custom) || ''; }

  function getFont() {
    var f = get(K.font);
    if (f === 'custom') return hasCustom() ? 'custom' : 'default';
    return (f && STACKS[f]) ? f : 'default';
  }
  function applyFont(id) {
    root.style.setProperty('--bm-font', STACKS[id] || STACKS.default);
  }
  function setFont(id) {
    if (!STACKS[id] || (id === 'custom' && !hasCustom())) id = 'default';
    if (id === 'default') del(K.font); else set(K.font, id);
    applyFont(id);
    return id;
  }

  /* ---------- Font custom (IndexedDB) ---------- */
  function idb(mode, fn) {
    return new Promise(function (resolve, reject) {
      var rq;
      try { rq = indexedDB.open(DB, 1); } catch (e) { reject(e); return; }
      rq.onupgradeneeded = function () {
        if (!rq.result.objectStoreNames.contains(STORE)) rq.result.createObjectStore(STORE);
      };
      rq.onerror = function () { reject(rq.error); };
      rq.onsuccess = function () {
        var db = rq.result, out;
        try {
          var tx = db.transaction(STORE, mode);
          out = fn(tx.objectStore(STORE));
          tx.oncomplete = function () { db.close(); resolve(out && out.result); };
          tx.onerror = tx.onabort = function () { db.close(); reject(tx.error); };
        } catch (e) { db.close(); reject(e); }
      };
    });
  }

  function persist() {
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {}
  }

  var face = null;       /* FontFace custom yang sedang aktif */
  var ensuring = null;

  function activate(f) {
    if (face && face !== f) { try { d.fonts.delete(face); } catch (e) {} }
    d.fonts.add(f);
    face = f;
  }

  /* Hasil: 'ok' | 'none' (belum ada) | 'missing' (file hilang dari penyimpanan) | 'error' */
  function ensureCustom() {
    if (face) return Promise.resolve('ok');
    if (!hasCustom()) return Promise.resolve('none');
    if (ensuring) return ensuring;
    function attempt() {
      return idb('readonly', function (s) { return s.get(REC); }).then(function (rec) {
        if (!rec || !rec.data) return 'missing';
        return new FontFace(FAMILY, rec.data.slice(0)).load().then(function (f) {
          activate(f);
          persist();
          return 'ok';
        });
      });
    }
    ensuring = attempt()
      .catch(function () {
        return new Promise(function (r) { setTimeout(r, 250); }).then(attempt);
      })
      .catch(function () { return 'error'; })
      .then(function (status) { ensuring = null; return status; });
    return ensuring;
  }

  function readFile(file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(r.result); };
      r.onerror = function () { reject(fail('read')); };
      r.readAsArrayBuffer(file);
    });
  }

  /* Reject dengan error.code: 'format' | 'size' | 'read' | 'invalid' | 'storage' */
  function saveCustom(file) {
    if (!file) return Promise.reject(fail('read'));
    if (!/\.(ttf|otf|woff2?)$/i.test(file.name)) return Promise.reject(fail('format'));
    if (file.size > MAX_FONT_BYTES) return Promise.reject(fail('size'));
    return readFile(file).then(function (buf) {
      return new FontFace(FAMILY, buf.slice(0)).load()
        .catch(function () { throw fail('invalid'); })
        .then(function (loaded) {
          return idb('readwrite', function (s) {
            return s.put({ name: file.name, data: buf, saved: Date.now() }, REC);
          }).catch(function () { throw fail('storage'); })
            .then(function () { activate(loaded); });
        });
    }).then(function () {
      set(K.custom, file.name);
      persist();
      return file.name;
    });
  }

  function removeCustom() {
    return idb('readwrite', function (s) { return s.delete(REC); })
      .catch(function () {})
      .then(function () {
        del(K.custom);
        if (face) { try { d.fonts.delete(face); } catch (e) {} face = null; }
        if (get(K.font) === 'custom') { del(K.font); applyFont('default'); }
      });
  }

  /* ---------- Init: pasang secepat mungkin ---------- */
  applyAccent(getAccent());
  applyFont(getFont());

  /* Cegah "kedip" font bawaan sebelum font custom selesai dimuat (maks. 1 detik) */
  if (getFont() === 'custom') {
    var st = d.createElement('style');
    st.textContent = 'html.bm-font-wait body{opacity:0}';
    (d.head || root).appendChild(st);
    root.classList.add('bm-font-wait');
    var release = function () { root.classList.remove('bm-font-wait'); };
    ensureCustom().then(release, release);
    setTimeout(release, 1000);
  }

  /* Kembali lewat tombol back sistem (bfcache) dengan pengaturan yang sudah berubah → muat ulang */
  function signature() {
    return [K.accent, K.font, K.bold, K.custom, K.theme].map(get).join('|');
  }
  var bootSignature = signature();
  w.addEventListener('pageshow', function (e) {
    if (!e.persisted || signature() === bootSignature) return;
    setTimeout(function () {
      try {
        var s = d.getElementById('settingsScreen');
        if (s && s.classList.contains('open')) sessionStorage.setItem('bm-return-settings', '1');
      } catch (err) {}
      location.reload();
    }, 0);
  });

  w.BMTheme = {
    KEYS: K,
    DEFAULT_ACCENT: DEFAULT_ACCENT,
    STACKS: STACKS,
    MAX_FONT_BYTES: MAX_FONT_BYTES,
    get: get, set: set, del: del,
    normalizeHex: normalizeHex,
    contrast: contrast,
    getAccent: getAccent,
    saveAccent: saveAccent,
    getFont: getFont,
    setFont: setFont,
    hasCustom: hasCustom,
    customName: customName,
    ensureCustom: ensureCustom,
    saveCustom: saveCustom,
    removeCustom: removeCustom
  };
})(window, document);
