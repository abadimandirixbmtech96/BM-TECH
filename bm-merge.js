// BM-TECH: penggabungan otomatis (3 arah) saat dua perangkat/admin mengubah note yang sama.
// Dipakai editor-data-*.html menggantikan pop-up "TIMPA atau MUAT ULANG", supaya TIDAK ADA perubahan yang hilang.
//
// Tiga pihak:  base  = isi note saat terakhir kali sinkron dengan server (kondisi awal bersama)
//              mine  = isi yang sedang disimpan perangkat ini
//              theirs = isi terbaru di server (hasil simpan perangkat lain)
// Aturan, per data (record) menurut id:
//   - hanya satu pihak yang mengubah isian  -> perubahan itu dipakai
//   - dua pihak mengubah isian BERBEDA       -> keduanya dipakai
//   - dua pihak mengubah isian yang SAMA     -> yang menyimpan belakangan (mine) dipakai
//   - isian berupa daftar (bukti foto, dsb)  -> digabung: tambahan kedua pihak dipertahankan
//   - data baru dari salah satu pihak        -> selalu dipertahankan
//   - data dihapus satu pihak                -> ikut terhapus hanya kalau pihak lain tidak mengubahnya
(function (root) {
  'use strict';

  function stable(v) {
    if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
    if (v && typeof v === 'object') {
      return '{' + Object.keys(v).sort().filter(k => v[k] !== undefined).map(k => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
    }
    return JSON.stringify(v === undefined ? null : v);
  }
  const same = (a, b) => stable(a) === stable(b);
  const clone = o => (o === undefined ? undefined : JSON.parse(JSON.stringify(o)));

  function mergeField(bv, mv, tv) {
    if (same(mv, bv)) return tv;      // saya tidak mengubah -> ikut server
    if (same(tv, bv)) return mv;      // server tidak berubah -> punya saya
    if (same(mv, tv)) return mv;
    if (Array.isArray(mv) && Array.isArray(tv) && (bv === undefined || Array.isArray(bv))) {
      const bs = new Set((bv || []).map(stable));
      const ms = new Set(mv.map(stable));
      const ts = new Set(tv.map(stable));
      const out = tv.filter(x => !(bs.has(stable(x)) && !ms.has(stable(x))));   // yang saya hapus ikut hilang
      mv.forEach(x => { const k = stable(x); if (!ts.has(k) && !bs.has(k)) out.push(x); });   // yang saya tambah dipertahankan
      return out;
    }
    return mv;                         // isian sama diubah dua pihak: yang menyimpan belakangan menang
  }

  function mergeRecord(b, m, t) {
    const keys = new Set([...Object.keys(b || {}), ...Object.keys(m || {}), ...Object.keys(t || {})]);
    const out = {};
    keys.forEach(k => {
      const v = mergeField(b ? b[k] : undefined, m ? m[k] : undefined, t ? t[k] : undefined);
      if (v !== undefined) out[k] = v;
    });
    return out;
  }

  const idx = list => {
    const m = new Map();
    (Array.isArray(list) ? list : []).forEach(r => { if (r && r.id !== undefined && r.id !== null) m.set(r.id, r); });
    return m;
  };

  function mergeList(base, mine, theirs) {
    const bm = idx(base), mm = idx(mine), tm = idx(theirs);
    const out = [];
    (Array.isArray(theirs) ? theirs : []).forEach(t => {
      if (!t || t.id === undefined || t.id === null) { out.push(t); return; }
      const b = bm.get(t.id), m = mm.get(t.id);
      if (m) out.push(mergeRecord(b, m, t));
      else if (b) { if (!same(t, b)) out.push(t); }   // saya hapus; server mengubahnya -> pertahankan
      else out.push(t);                                // data baru dari server
    });
    (Array.isArray(mine) ? mine : []).forEach(m => {
      if (!m || m.id === undefined || m.id === null) return;
      if (tm.has(m.id)) return;                        // sudah ditangani di atas
      const b = bm.get(m.id);
      if (b && same(m, b)) return;                     // server menghapus, saya tidak mengubah -> ikut terhapus
      out.push(m);                                     // data baru dari saya (atau saya ubah setelah server hapus)
    });
    return out;
  }

  // snapshot {title, content:{records, trash, legacy}} yang bebas dari referensi ke data hidup
  function snapFromNote(note, schema) {
    const c = (note && note.content) || {};
    const ok = c.schema === schema;
    return {
      title: (note && note.title) || '',
      content: { records: ok && Array.isArray(c.records) ? clone(c.records) : [], trash: ok && Array.isArray(c.trash) ? clone(c.trash) : [], legacy: ok ? clone(c.legacy || null) : null }
    };
  }
  function snapFromPayload(p) {
    const c = p.content || {};
    return { title: p.title || '', content: { records: clone(c.records || []), trash: clone(c.trash || []), legacy: clone(c.legacy || null) } };
  }

  // base/mine/theirs berbentuk {title, content:{records, trash, legacy, schema?, ...}}
  function merge(base, mine, theirs) {
    const b = base || { title: '', content: { records: [], trash: [], legacy: null } };
    const bc = b.content || {}, mc = mine.content || {}, tc = theirs.content || {};
    const records = mergeList(bc.records, mc.records, tc.records);
    const trash = mergeList(bc.trash, mc.trash, tc.trash);
    // satu data tidak boleh ada di dua daftar: ikuti penempatan terakhir dari saya, kalau tidak ada ikut server
    const inTrash = new Set(trash.map(r => r && r.id));
    const mineTrash = idx(mc.trash), mineRecs = idx(mc.records);
    const finalRecords = records.filter(r => {
      if (!r || !inTrash.has(r.id)) return true;
      if (mineTrash.has(r.id)) return false;
      return true;
    });
    const recIds = new Set(finalRecords.map(r => r && r.id));
    const finalTrash = trash.filter(r => !(r && recIds.has(r.id) && (mineRecs.has(r.id) || !mineTrash.has(r.id))));
    const content = Object.assign({}, tc, mc, {
      records: finalRecords,
      trash: finalTrash,
      legacy: same(mc.legacy, bc.legacy) ? (tc.legacy === undefined ? null : tc.legacy) : mc.legacy
    });
    const title = same(mine.title, b.title) ? theirs.title : mine.title;
    return { title, content };
  }

  // Isi ulang array hidup SEKALIGUS mempertahankan objek lama (layar detail yang sedang terbuka tetap menunjuk objek yang sama)
  function syncArray(target, source) {
    const old = new Map();
    target.forEach(o => { if (o && o.id !== undefined) old.set(o.id, o); });
    const next = source.map(s => {
      const o = s && old.get(s.id);
      if (!o) return s;
      Object.keys(o).forEach(k => { if (!(k in s)) delete o[k]; });
      Object.assign(o, s);
      return o;
    });
    target.length = 0;
    next.forEach(o => target.push(o));
  }

  root.BMMerge = { merge, mergeList, mergeRecord, snapFromNote, snapFromPayload, syncArray, same, clone };
})(typeof window !== 'undefined' ? window : this);
