/* BM-TECH Kasir <-> Supabase
 * Versi: shop-sync-v1-2026-11-11
 *
 * Cara kerja:
 * - Data kasir dimuat dari database lewat RPC shop_ambil_semua (RLS tetap berlaku).
 * - Setiap commit() di dashboard-shop.html dibandingkan dengan data sebelumnya,
 *   lalu dikirim sebagai satu paket ke RPC shop_terapkan (semua atau tidak sama sekali).
 * - Paket punya id. Kiriman ulang (sinyal putus) tidak membuat data dobel.
 * - Offline: paket disimpan di antrean HP dan dikirim saat sinyal kembali.
 * - Data demo lama (bm_warung_v2) tidak disentuh.
 */
(function () {
  'use strict';

  var SB_URL = 'https://zgzmbneqqzxnptbmlhsz.supabase.co';
  var SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpnem1ibmVxcXp4bnB0Ym1saHN6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc3OTU0ODksImV4cCI6MjEwMzM3MTQ4OX0.MQOtu5Pg2PtxIu18joKDd0dOA17cPEazmlL0Xl3Vz7E';
  var K_CACHE = 'bm_shop_db_cache_v1';
  var K_OUT = 'bm_shop_outbox_v1';
  var K_REJ = 'bm_shop_rejected_v1';
  var POLL_MS = 45000;

  var app = null, client = null, userId = null;
  var outbox = [], cache = null;
  var mode = 'mulai';          // mulai | siap | kirim | offline | login | akses
  var isAdmin = false, lastSync = 0, lastErr = '';
  var flushing = false, pulling = false, commitSeq = 0, pendingData = null, started = false;

  function ls(k, v) {
    try {
      if (v === undefined) { var s = localStorage.getItem(k); return s ? JSON.parse(s) : null; }
      if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v));
      return true;
    } catch (e) { return v === undefined ? null : false; }
  }
  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    var b = crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
    var h = Array.prototype.map.call(b, function (x) { return (x + 256).toString(16).slice(1); }).join('');
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
  }
  var J = function (o) { return JSON.stringify(o); };
  var num = function (v) { return v == null || v === '' ? 0 : +v; };
  function toast(m) { try { app && app.toast(m); } catch (e) {} }

  /* ---------------- Server -> bentuk data kasir ---------------- */
  function lineD(l) {
    var o = { i: l.barang_id || null, name: l.nama, unit: l.satuan || 'pcs', q: num(l.qty), p: num(l.harga) };
    if (l.modal != null) o.c = num(l.modal);
    return o;
  }
  function toD(s) {
    var items = (s.barang || []).map(function (x) {
      return { id: x.id, kind: x.jenis || 'umum', base: x.nama_dasar || x.nama, a: x.atribut || {}, name: x.nama,
        cat: x.kategori || '', unit: x.satuan || 'pcs', buy: num(x.harga_beli), sell: num(x.harga_jual),
        min: num(x.stok_min), arch: !!x.arsip, codes: (x.kode || []).map(String), pc: x.kode_pabrik || '' };
    });
    var im = {}; items.forEach(function (x) { im[x.id] = x; });
    var parties = (s.pihak || []).map(function (p) {
      return { id: p.id, k: p.jenis === 'pemasok' ? 's' : 'c', name: p.nama, phone: p.telp || '', ts: Date.parse(p.created_at) || 0 };
    });
    var notas = (s.nota || []).map(function (n) {
      return { id: n.id, no: n.nomor, kode: n.kode, t: n.tipe === 'beli' ? 'in' : 'out', d: n.tanggal, ts: num(n.urut),
        partyId: n.pihak_id || null, lines: (n.baris || []).map(lineD), dp: num(n.uang_muka), note: n.catatan || '',
        void: !!n.batal, src: n.sumber || 'kasir' };
    });
    var rets = (s.retur || []).map(function (r) {
      return { id: r.id, notaId: r.nota_id, d: r.tanggal, ts: num(r.urut), lines: (r.baris || []).map(lineD),
        refund: num(r.refund), note: r.catatan || '' };
    });
    var pays = (s.bayar || []).map(function (b) {
      return { id: b.id, partyId: b.pihak_id, notaId: b.nota_id || null, a: num(b.jumlah), d: b.tanggal, ts: num(b.urut),
        note: b.catatan || '', m: b.metode || 'tunai' };
    });
    var adj = (s.stok || []).map(function (a) {
      var x = im[a.barang_id] || {};
      return { id: a.id, i: a.barang_id, name: x.name || '', unit: x.unit || '', delta: num(a.delta),
        c: a.modal == null ? null : num(a.modal), reason: a.alasan || '', d: a.tanggal, ts: num(a.urut), note: a.catatan || '' };
    });
    var seq = { out: 0, in: 0 };
    notas.forEach(function (n) { if (n.src === 'kasir' && (n.no || 0) > seq[n.t]) seq[n.t] = n.no; });
    return { v: 2, items: items, parties: parties, notas: notas, rets: rets, pays: pays, adj: adj, seq: seq };
  }

  /* ---------------- Bentuk data kasir -> baris database ---------------- */
  function itemRow(x) {
    return { id: x.id, jenis: x.kind || 'umum', nama_dasar: x.base || x.name, atribut: x.a || {}, nama: x.name,
      kategori: x.cat || '', satuan: x.unit || 'pcs', harga_jual: +x.sell || 0, harga_beli: +x.buy || 0,
      stok_min: +x.min || 0, kode: (x.codes || []).map(String), kode_pabrik: x.pc || '', arsip: !!x.arch };
  }
  function partyRow(p) { return { id: p.id, jenis: p.k === 's' ? 'pemasok' : 'customer', nama: String(p.name || '').trim(), telp: p.phone || '' }; }
  function lineRow(l) {
    return { barang_id: l.i || null, nama: l.name, satuan: l.unit || 'pcs', qty: +l.q, harga: +l.p || 0, modal: l.c == null ? null : +l.c };
  }
  function notaHead(n) {
    return { tanggal: n.d, pihak_id: n.partyId || null, uang_muka: +n.dp || 0, catatan: n.note || '', batal: !!n.void };
  }
  function notaRow(n) {
    var h = notaHead(n);
    h.id = n.id; h.tipe = n.t === 'in' ? 'beli' : 'jual'; h.urut = +n.ts || Date.now();
    h.lines = (n.lines || []).map(lineRow);
    return h;
  }
  function retRow(r) {
    return { id: r.id, nota_id: r.notaId, tanggal: r.d, refund: +r.refund || 0, catatan: r.note || '', urut: +r.ts || Date.now(),
      lines: (r.lines || []).map(lineRow) };
  }
  function payRow(p) {
    return { id: p.id, pihak_id: p.partyId, nota_id: p.notaId || null, jumlah: +p.a, tanggal: p.d, metode: p.m || 'tunai',
      catatan: p.note || '', urut: +p.ts || Date.now() };
  }
  function adjRow(a) {
    return { id: a.id, barang_id: a.i, delta: +a.delta, modal: a.c == null ? null : +a.c, alasan: a.reason || '', tanggal: a.d,
      catatan: a.note || '', urut: +a.ts || Date.now() };
  }

  /* ---------------- Bandingkan data lama dan baru ---------------- */
  function byId(a) { var m = {}; (a || []).forEach(function (x) { m[x.id] = x; }); return m; }
  function diff(A, B) {
    var ops = [], dels = [], baru = [];
    var bad = function (m) { return { blocked: m }; };
    var i, k;

    var pA = byId(A.parties), pB = byId(B.parties);
    for (k in pB) if (!pA[k] || J(partyRow(pA[k])) !== J(partyRow(pB[k]))) ops.push({ op: 'party_upsert', row: partyRow(pB[k]) });
    for (k in pA) if (!pB[k]) dels.push({ op: 'party_delete', id: k, _o: 5 });

    var iA = byId(A.items), iB = byId(B.items);
    for (k in iB) if (!iA[k] || J(itemRow(iA[k])) !== J(itemRow(iB[k]))) ops.push({ op: 'item_upsert', row: itemRow(iB[k]) });
    for (k in iA) if (!iB[k]) dels.push({ op: 'item_delete', id: k, _o: 4 });

    var nA = byId(A.notas), nB = byId(B.notas);
    for (k in nA) if (!nB[k]) return bad('Nota tidak bisa dihapus, batalkan saja');
    for (k in nB) {
      var o = nA[k], n = nB[k];
      if (!o) { ops.push({ op: 'nota_upsert', row: notaRow(n) }); baru.push(k); continue; }
      var hd = J(notaHead(o)) !== J(notaHead(n));
      var ld = J((o.lines || []).map(lineRow)) !== J((n.lines || []).map(lineRow));
      if (!hd && !ld) continue;
      if (o.src === 'bengkel') return bad('Salinan dari Hutang Piutang tidak bisa diubah di kasir');
      ops.push({ op: 'nota_upsert', row: notaRow(n), ganti_baris: ld });
    }

    var rA = byId(A.rets), rB = byId(B.rets);
    for (k in rB) {
      if (!rA[k]) {
        var nn = nB[rB[k].notaId];
        if (nn && nn.src === 'bengkel') return bad('Salinan dari Hutang Piutang tidak bisa diretur di kasir');
        ops.push({ op: 'ret_insert', row: retRow(rB[k]) });
      } else if (J(retRow(rA[k])) !== J(retRow(rB[k]))) return bad('Retur yang sudah tersimpan tidak bisa diubah');
    }
    for (k in rA) if (!rB[k]) dels.push({ op: 'ret_delete', id: k, _o: 2 });

    var yA = byId(A.pays), yB = byId(B.pays);
    for (k in yB) {
      if (!yA[k]) ops.push({ op: 'pay_insert', row: payRow(yB[k]) });
      else if (J(payRow(yA[k])) !== J(payRow(yB[k]))) return bad('Pembayaran yang sudah tersimpan tidak bisa diubah');
    }
    for (k in yA) if (!yB[k]) dels.push({ op: 'pay_delete', id: k, _o: 1 });

    var aA = byId(A.adj), aB = byId(B.adj);
    for (k in aB) {
      if (!aA[k]) ops.push({ op: 'adj_insert', row: adjRow(aB[k]) });
      else if (J(adjRow(aA[k])) !== J(adjRow(aB[k]))) return bad('Penyesuaian stok yang sudah tersimpan tidak bisa diubah');
    }
    for (k in aA) if (!aB[k]) dels.push({ op: 'adj_delete', id: k, _o: 3 });

    // Urutan: pihak, barang, nota, retur, bayar, stok; lalu hapus dari yang paling bergantung.
    var ord = { party_upsert: 1, item_upsert: 2, nota_upsert: 3, ret_insert: 4, pay_insert: 5, adj_insert: 6 };
    ops.sort(function (x, y) { return ord[x.op] - ord[y.op]; });
    dels.sort(function (x, y) { return x._o - y._o; });
    dels.forEach(function (d) { delete d._o; });
    for (i = 0; i < dels.length; i++) ops.push(dels[i]);
    return { ops: ops, baru: baru };
  }

  /* ---------------- Antrean dan pengiriman ---------------- */
  function saveOut() { ls(K_OUT, outbox); }
  function saveCache(d) { cache = { v: 1, uid: userId, at: Date.now(), data: d }; ls(K_CACHE, cache); }
  function myOut() { return outbox.filter(function (b) { return !b.uid || b.uid === userId; }); }

  function classify(res) {
    var e = res.error || {}, st = res.status || 0, code = String(e.code || '');
    if (code === '42501') return 'akses';
    if (st === 401 || /^PGRST30/.test(code) || /jwt/i.test(e.message || '')) return 'login';
    if (st === 0 || st >= 500 || !code) return 'net';
    return 'tolak';
  }
  function friendly(e) {
    var m = String((e && e.message) || 'tidak diketahui'), c = String((e && e.code) || '');
    if (c === '23505' && /pihak_nama_unik/.test(m)) return 'Nama pelanggan itu sudah ada';
    if (c === '23505') return 'Data yang sama sudah ada';
    if (c === '23503') return 'Data masih dipakai di nota, retur, atau pembayaran';
    if (c === '23514') return 'Isian tidak valid';
    return m;
  }
  function logReject(b, e) {
    var arr = ls(K_REJ) || [];
    arr.push({ at: new Date().toISOString(), uid: userId, batch: b, error: { code: e && e.code, message: e && e.message } });
    if (arr.length > 50) arr = arr.slice(-50);
    ls(K_REJ, arr);
  }
  function applyResult(data) {
    var h = (data && data.hasil) || [];
    if (!h.length || !app) return;
    var D = app.get(), changed = false;
    h.forEach(function (x) {
      var n = D.notas.find(function (z) { return z.id === x.nota; });
      if (n && (n.kode !== x.kode || n.no !== x.nomor)) { n.kode = x.kode; n.no = x.nomor; changed = true; }
    });
    if (changed) { app.set(D); saveCache(D); app.refresh(); }
  }

  async function flush() {
    if (flushing || !client || !userId) return;
    flushing = true; var ditolak = false;
    try {
      var list = myOut();
      while (list.length) {
        var b = list[0];
        setMode('kirim');
        var res = await client.rpc('shop_terapkan', { batch: { id: b.id, ops: b.ops } });
        if (res.error) {
          var kind = classify(res);
          lastErr = friendly(res.error);
          if (kind === 'net') { setMode('offline'); return; }
          if (kind === 'login') { setMode('login'); return; }
          if (kind === 'akses') { setMode('akses'); return; }
          ditolak = true; logReject(b, res.error);
          toast('Ditolak database: ' + lastErr);
        } else {
          applyResult(res.data);
        }
        outbox = outbox.filter(function (z) { return z.id !== b.id; }); saveOut();
        list = myOut();
      }
      setMode('siap');
    } finally {
      flushing = false; badge();
    }
    if (ditolak) await pull(true);
  }

  async function pull(force) {
    if (pulling || !client || !userId) return;
    if (myOut().length) return flush();
    pulling = true; var seq0 = commitSeq;
    try {
      var res = await client.rpc('shop_ambil_semua');
      if (res.error) {
        var kind = classify(res); lastErr = friendly(res.error);
        setMode(kind === 'tolak' ? 'offline' : kind);
        return;
      }
      var s = res.data || {};
      isAdmin = !!s.admin;
      if (!s.boleh) { setMode('akses'); return; }
      lastSync = Date.now(); setMode('siap');
      if (seq0 !== commitSeq || myOut().length) return;   // ada perubahan baru selama memuat
      var nd = toD(s), cur = app.get();
      if (J(nd) === J(cur)) { saveCache(cur); return; }
      if (!force && app.pages() > 0) { pendingData = nd; return; }   // jangan ganggu form yang sedang dibuka
      pendingData = null; app.set(nd); saveCache(nd); app.refresh();
    } finally {
      pulling = false; badge();
    }
  }

  /* ---------------- Status di layar ---------------- */
  var badgeEl = null;
  function setMode(m) { mode = m; badge(); }
  function statusText() {
    var n = myOut().length;
    switch (mode) {
      case 'mulai': return 'Memuat data...';
      case 'kirim': return 'Menyimpan ke database...';
      case 'offline': return n ? 'Offline, ' + n + ' perubahan menunggu' : 'Offline, memakai data terakhir';
      case 'login': return 'Belum masuk. Ketuk untuk masuk';
      case 'akses': return 'Akun ini belum punya akses kasir';
      default: return n ? n + ' perubahan menunggu' : 'Tersambung';
    }
  }
  function shortText() {
    var n = myOut().length;
    switch (mode) {
      case 'mulai': return 'Memuat';
      case 'kirim': return 'Menyimpan';
      case 'offline': return n ? 'Offline · ' + n : 'Offline';
      case 'login': return 'Belum masuk';
      case 'akses': return 'Tanpa akses';
      default: return n ? n + ' menunggu' : 'Online';
    }
  }
  function onBadge() {
    if (mode === 'login') { location.href = 'admin-login.html'; return; }
    if (mode === 'akses') { toast('Minta admin menambahkan akun ini ke daftar kasir'); return; }
    toast(statusText()); syncNow();
  }
  // Status ditampilkan di tempat label "Demo" pada header, agar tidak menutupi apa pun.
  function badge() {
    if (!badgeEl) {
      var css = document.createElement('style');
      css.textContent = '.bm-sync{cursor:pointer;color:var(--mu);border-color:currentColor}'
        + '.bm-sync[data-m=siap]{color:#16a34a}'
        + '.bm-sync[data-m=kirim],.bm-sync[data-m=mulai]{color:var(--acx,#9a5b00)}'
        + '.bm-sync[data-m=login],.bm-sync[data-m=akses]{color:var(--er,#dc2626)}'
        + '@media (prefers-color-scheme:dark){:root:not([data-theme=light]) .bm-sync[data-m=siap]{color:#4ade80}}'
        + ':root[data-theme=dark] .bm-sync[data-m=siap]{color:#4ade80}'
        + '#bm-sync-f{position:fixed;right:16px;top:calc(env(safe-area-inset-top,0px) + 8px);z-index:60;background:var(--sf,#fff)}';
      document.head.appendChild(css);
      badgeEl = document.querySelector('.app .demo');
      if (!badgeEl) {
        badgeEl = document.createElement('i'); badgeEl.id = 'bm-sync-f'; badgeEl.className = 'tag';
        document.body.appendChild(badgeEl);
      }
      badgeEl.classList.remove('mu'); badgeEl.classList.add('bm-sync');
      badgeEl.setAttribute('role', 'button'); badgeEl.setAttribute('tabindex', '0');
      badgeEl.setAttribute('aria-live', 'polite');
      badgeEl.addEventListener('click', onBadge);
      badgeEl.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onBadge(); } });
    }
    badgeEl.dataset.m = mode;
    badgeEl.textContent = shortText();
    badgeEl.title = statusText();
    badgeEl.setAttribute('aria-label', 'Status database: ' + statusText());
  }

  function syncNow() {
    if (!client) return;
    if (myOut().length) flush(); else pull();
  }

  /* ---------------- API untuk dashboard-shop.html ---------------- */
  window.BMShopSync = {
    version: 'shop-sync-v1-2026-11-11',
    cached: function () {
      cache = ls(K_CACHE); outbox = ls(K_OUT) || [];
      return cache && cache.data ? cache.data : null;
    },
    commit: function (prev, next) {
      if (mode === 'login') { toast('Masuk dulu agar data bisa disimpan'); return false; }
      if (mode === 'akses') { toast('Akun ini belum punya akses kasir'); return false; }
      if (mode === 'mulai' && !cache) { toast('Data masih dimuat, coba lagi sebentar'); return false; }
      var d = diff(prev, next);
      if (d.blocked) { toast(d.blocked); return false; }
      if (!d.ops.length) return true;
      d.baru.forEach(function (id) {
        var n = next.notas.find(function (z) { return z.id === id; });
        if (n) { n.no = null; n.kode = null; n.src = 'kasir'; }
      });
      commitSeq++;
      outbox.push({ id: uuid(), uid: userId, at: Date.now(), ops: d.ops });
      saveOut();
      return true;
    },
    saved: function (D) { saveCache(D); badge(); setTimeout(flush, 0); },
    start: function (bridge) {
      if (started) return; started = true; app = bridge;
      badge();
      window.addEventListener('online', syncNow);
      window.addEventListener('offline', function () { setMode('offline'); });
      document.addEventListener('visibilitychange', function () { if (!document.hidden) syncNow(); });
      setInterval(function () {
        if (document.hidden) return;
        if (pendingData && app.pages() === 0 && !myOut().length) {
          var nd = pendingData; pendingData = null; app.set(nd); saveCache(nd); app.refresh(); return;
        }
        syncNow();
      }, POLL_MS);
      init();
    },
    status: function () {
      return { mode: mode, text: statusText(), pending: myOut().length, admin: isAdmin, lastSync: lastSync, error: lastErr };
    },
    syncNow: syncNow,
    uuid: uuid,
    _diff: diff, _toD: toD
  };

  async function init() {
    if (!window.supabase || !supabase.createClient) { setMode('offline'); lastErr = 'Pustaka Supabase belum termuat'; return; }
    client = supabase.createClient(SB_URL, SB_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, storage: window.localStorage, storageKey: 'bmtech-auth' }
    });
    var r = await client.auth.getSession();
    var session = r && r.data && r.data.session;
    if (!session) { setMode('login'); return; }
    userId = session.user && session.user.id;
    if (cache && cache.uid && cache.uid !== userId) {
      cache = null; ls(K_CACHE, null);
      app.set(app.blank()); app.refresh();
    }
    if (!navigator.onLine) { setMode('offline'); return; }
    if (myOut().length) await flush();
    await pull(true);
  }
})();
