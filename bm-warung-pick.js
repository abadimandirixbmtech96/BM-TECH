/*!
 * bm-warung-pick.js — "Barang dari warung" di editor Buku Besar.
 * Pilih barang dari katalog Dashboard Warung (piston per ukuran OS, laher, stang, dll) dengan sekali ketuk.
 * Saat catatan disimpan, stok warung otomatis berkurang lewat RPC shop_pakai_bengkel (satu set baris stok
 * per catatan: disimpan ulang = diganti, bukan ditambah; catatan dihapus = stok kembali).
 * Uang tidak dihitung di warung (sudah masuk Harga Buku Besar), jadi omzet gabungan tidak dobel.
 *
 *   BMWarungPick.init({ client, toast })
 *   var p = BMWarungPick.mount(el)      -> p.get() / p.set(list) / p.reset()
 *   BMWarungPick.sync(record)           -> potong stok sesuai record.warung
 *   BMWarungPick.unsync(recordId)       -> kembalikan stok (catatan dihapus)
 *   BMWarungPick.text(list)             -> "Nouvo/Mio OS 50 x1, Laher 6202 x2"
 */
(function () {
  'use strict';
  if (window.BMWarungPick) return;
  var CFG = { client: null, toast: function () {} }, CAT = null, CAT_AT = 0, LOADING = null;
  var K_CAT = 'bm-warung-katalog-v1', K_Q = 'bm-warung-antre-v1';
  var OSO = ['STD', '25', '50', '75', '100', '125', '150', '175', '200'];

  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} return null; }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function nk(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }
  function osOf(x) { var o = String(((x.atribut || {}).os) || '').toUpperCase().replace(/^OS\s*/, ''); return o === '0' ? 'STD' : o; }
  function wib(iso) { var d = iso ? new Date(iso) : new Date(); return new Date(d.getTime() + 7 * 3600e3).toISOString().slice(0, 10); }

  var css = '.wp{display:grid;gap:8px}.wp-sel{display:flex;flex-wrap:wrap;gap:6px}.wp-sel:empty{display:none}' +
    '.wp-chip{display:inline-flex;align-items:center;gap:4px;padding:4px 4px 4px 10px;border-radius:999px;background:rgba(var(--accent-rgb,240,165,41),.16);border:1px solid rgba(var(--accent-rgb,240,165,41),.5);font-size:13px;font-weight:600}' +
    '.wp-chip button{width:26px;height:26px;border-radius:50%;border:0;background:rgba(127,127,127,.16);color:inherit;font:inherit;font-weight:800;cursor:pointer;line-height:1}' +
    '.wp-in{width:100%;box-sizing:border-box}.wp-res{display:grid;gap:6px;max-height:280px;overflow:auto}.wp-res:empty{display:none}' +
    '.wp-g{border:1px solid rgba(127,127,127,.25);border-radius:12px;padding:8px 10px}.wp-g b{display:block;font-size:13px;margin-bottom:6px}' +
    '.wp-os{display:flex;flex-wrap:wrap;gap:6px}.wp-os button,.wp-row{border:1px solid rgba(127,127,127,.3);background:transparent;color:inherit;border-radius:10px;padding:7px 10px;font:inherit;font-size:13px;cursor:pointer;text-align:left}' +
    '.wp-os button small,.wp-row small{display:block;font-size:11px;opacity:.65}.wp-os button:active,.wp-row:active{transform:scale(.96)}' +
    '.wp-note{font-size:12px;opacity:.7;margin:0}';
  function addCss() { if (document.getElementById('wp-css')) return; var s = el('style'); s.id = 'wp-css'; s.textContent = css; document.head.appendChild(s); }

  /* ---------- katalog ---------- */
  function catalog(force) {
    if (CAT && !force && Date.now() - CAT_AT < 300000) return Promise.resolve(CAT);
    if (!CAT) { try { var c = JSON.parse(ls(K_CAT) || 'null'); if (c && Array.isArray(c.items)) { CAT = c.items; CAT_AT = 0; } } catch (e) {} }
    if (LOADING) return LOADING;
    var cl = CFG.client; if (!cl) return Promise.resolve(CAT || []);
    LOADING = Promise.all([
      cl.from('shop_barang').select('id,nama,nama_dasar,jenis,atribut,satuan,harga_jual').eq('arsip', false).limit(3000),
      cl.from('shop_v_stok').select('barang_id,stok').limit(3000)
    ]).then(function (r) {
      LOADING = null;
      if (r[0].error) throw r[0].error;
      var st = {}; (r[1].data || []).forEach(function (s) { st[s.barang_id] = Number(s.stok) || 0; });
      CAT = (r[0].data || []).map(function (x) { return { id: x.id, nama: x.nama, base: x.nama_dasar || x.nama, jenis: x.jenis, os: osOf(x), satuan: x.satuan || 'pcs', harga: Number(x.harga_jual) || 0, stok: st[x.id] || 0 }; });
      CAT_AT = Date.now(); ls(K_CAT, JSON.stringify({ t: CAT_AT, items: CAT }));
      return CAT;
    }, function () { LOADING = null; return CAT || []; });
    return LOADING;
  }
  function search(q) {
    var w = nk(q).split(' ').filter(Boolean); if (!w.length || !CAT) return [];
    var sebut = { piston: 'piston seher', bearing: 'laher bearing', stang: 'stang seher conrod' };
    return CAT.filter(function (x) {
      var t = ' ' + nk((sebut[x.jenis] || '') + ' ' + x.nama + ' ' + x.base) + ' ';
      return w.every(function (k) { return /^\d+$/.test(k) ? t.indexOf(' ' + k + ' ') >= 0 : t.indexOf(' ' + k) >= 0; });
    });
  }

  /* ---------- komponen pilih ---------- */
  function mount(root) {
    addCss(); root.textContent = '';
    var box = el('div', 'wp'), sel = el('div', 'wp-sel'), inp = el('input', 'wp-in'), res = el('div', 'wp-res');
    inp.type = 'text'; inp.autocomplete = 'off'; inp.placeholder = 'Cari barang warung: mio, blade 50, laher 6202';
    var note = el('p', 'wp-note', 'Opsional. Stok Dashboard Warung otomatis berkurang saat catatan disimpan. Harga tetap ditulis di kolom Harga.');
    box.append(sel, inp, res, note); root.appendChild(box);
    var list = [];
    function paintSel() {
      sel.textContent = '';
      list.forEach(function (it, i) {
        var c = el('span', 'wp-chip'), lab = el('span', '', it.nama + ' ×' + it.qty), mn = el('button', '', '−'), pl = el('button', '', '+'), rm = el('button', '', '×');
        [mn, pl, rm].forEach(function (b) { b.type = 'button'; });
        mn.setAttribute('aria-label', 'Kurangi'); pl.setAttribute('aria-label', 'Tambah'); rm.setAttribute('aria-label', 'Hapus');
        mn.onclick = function () { if (it.qty > 1) it.qty--; else list.splice(i, 1); paintSel(); };
        pl.onclick = function () { it.qty++; paintSel(); };
        rm.onclick = function () { list.splice(i, 1); paintSel(); };
        c.append(lab, mn, pl, rm); sel.appendChild(c);
      });
    }
    function add(x) {
      var f = list.filter(function (z) { return z.id === x.id; })[0];
      if (f) f.qty++; else list.push({ id: x.id, nama: x.nama, qty: 1 });
      paintSel(); inp.value = ''; res.textContent = ''; inp.focus();
    }
    function paintRes() {
      res.textContent = '';
      var q = inp.value; if (nk(q).length < 2) return;
      if (!CAT) { res.appendChild(el('p', 'wp-note', 'Memuat katalog warung…')); return; }
      var hit = search(q);
      if (!hit.length) { res.appendChild(el('p', 'wp-note', 'Tidak ada di katalog warung.')); return; }
      var groups = {}, order = [];
      hit.forEach(function (x) { var k = x.jenis === 'piston' ? 'p:' + x.base : 'x:' + x.id; if (!groups[k]) { groups[k] = []; order.push(k); } groups[k].push(x); });
      order.slice(0, 8).forEach(function (k) {
        var g = groups[k];
        if (k.charAt(0) === 'p') {
          var card = el('div', 'wp-g'), row = el('div', 'wp-os');
          card.appendChild(el('b', '', 'Piston ' + g[0].base));
          g.sort(function (a, b) { return OSO.indexOf(a.os) - OSO.indexOf(b.os); }).forEach(function (x) {
            var b = el('button'); b.type = 'button'; b.append(document.createTextNode(x.os === 'STD' ? 'STD' : 'OS ' + (x.os || '?')), el('small', '', 'stok ' + x.stok));
            b.onclick = function () { add(x); }; row.appendChild(b);
          });
          card.appendChild(row); res.appendChild(card);
        } else {
          var x = g[0], b = el('button', 'wp-row'); b.type = 'button'; b.append(document.createTextNode(x.nama), el('small', '', 'stok ' + x.stok + ' ' + x.satuan));
          b.onclick = function () { add(x); }; res.appendChild(b);
        }
      });
    }
    inp.addEventListener('input', paintRes);
    inp.addEventListener('focus', function () { catalog().then(paintRes); });
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); var f = res.querySelector('button'); if (f) f.click(); } });
    return {
      get: function () { return list.map(function (x) { return { id: x.id, nama: x.nama, qty: x.qty }; }); },
      set: function (l) { list = (Array.isArray(l) ? l : []).filter(function (x) { return x && x.id && x.qty > 0; }).map(function (x) { return { id: x.id, nama: String(x.nama || ''), qty: +x.qty || 1 }; }); paintSel(); inp.value = ''; res.textContent = ''; },
      reset: function () { list = []; paintSel(); inp.value = ''; res.textContent = ''; }
    };
  }

  /* ---------- potong stok (dengan antrean saat offline) ---------- */
  function queue() { try { return JSON.parse(ls(K_Q) || '{}') || {}; } catch (e) { return {}; } }
  function send(p) {
    var cl = CFG.client; if (!cl) return Promise.reject(new Error('Belum terhubung'));
    return cl.rpc('shop_pakai_bengkel', p).then(function (r) { if (r.error) throw r.error; return r.data; });
  }
  function flush() {
    var q = queue(), ids = Object.keys(q); if (!ids.length) return Promise.resolve();
    return ids.reduce(function (pr, id) { return pr.then(function () { return send(q[id]).then(function () { var n = queue(); delete n[id]; ls(K_Q, JSON.stringify(n)); }); }); }, Promise.resolve()).catch(function () {});
  }
  function push(p) {
    var q = queue(); q[p.rec_id] = p; ls(K_Q, JSON.stringify(q));
    return send(p).then(function (d) { var n = queue(); delete n[p.rec_id]; ls(K_Q, JSON.stringify(n)); CAT_AT = 0; flush(); return d; },
      function (e) { CFG.toast('Stok warung belum terpotong (' + ((e && e.message) || 'offline') + '). Dicoba lagi otomatis.'); });
  }
  function sync(rec) {
    if (!rec || !rec.id) return Promise.resolve();
    if (!Array.isArray(rec.warung)) return Promise.resolve();   // catatan yang tidak pernah memakai barang warung: tidak ada yang dipotong
    var items = rec.warung.filter(function (x) { return x && x.id && x.qty > 0; });
    return push({ rec_id: String(rec.id), items: items, tgl: wib(rec.created_at), ket: String(rec.customer || '').slice(0, 60) });
  }
  function unsync(id) { return id ? push({ rec_id: String(id), items: [], tgl: wib(), ket: '' }) : Promise.resolve(); }
  window.addEventListener('online', flush);

  window.BMWarungPick = {
    init: function (o) { CFG.client = o && o.client || null; CFG.toast = (o && o.toast) || CFG.toast; setTimeout(flush, 1500); },
    mount: mount, sync: sync, unsync: unsync, catalog: catalog,
    text: function (l) { return (l || []).map(function (x) { return x.nama + ' ×' + x.qty; }).join(', '); }
  };
})();
