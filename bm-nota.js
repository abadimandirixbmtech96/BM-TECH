/*!
 * bm-nota.js — penggambar NOTA KONTAN dengan kode (canvas), tanpa AI gambar.
 * Dipakai panel Jarvis (dashboard) dan halaman jarvis-ai.html.
 *   BMNota.draw(data)   -> Promise<HTMLCanvasElement>
 *   BMNota.render(data) -> HTMLElement (gambar + tombol Unduh / Bagikan / Salin)
 * data = { pelanggan, tanggal:'YYYY-MM-DD', nomor, items:[{nama,banyak,harga,jumlah}], total, cap }
 * Semua teks digambar sebagai piksel, tidak ada innerHTML dari data.
 */
(function (w, d) {
  'use strict';
  if (w.BMNota) return;
  var W = 900, H = 1200;
  var INK = '#1f2a55', PRINT = '#4a4a50', LINE = '#55555b';
  var HAND = '600 %spx Caveat, "Segoe Print", "Bradley Hand", "Comic Sans MS", cursive';
  var fontP = null;

  function loadFont() {
    if (fontP) return fontP;
    fontP = new Promise(function (ok) {
      try {
        if (!d.getElementById('bm-nota-font')) {
          var l = d.createElement('link'); l.id = 'bm-nota-font'; l.rel = 'stylesheet';
          l.href = 'https://fonts.googleapis.com/css2?family=Caveat:wght@600&display=swap'; d.head.appendChild(l);
        }
        var t = setTimeout(ok, 3000);
        (d.fonts && d.fonts.load ? d.fonts.load('600 30px Caveat', '0123Aa') : Promise.resolve()).then(function () { clearTimeout(t); ok(); }, function () { clearTimeout(t); ok(); });
      } catch (e) { ok(); }
    });
    return fontP;
  }
  function seeded(str) { var h = 2166136261; str = String(str); for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return function () { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 10000) / 10000; }; }
  function idr(n) { return String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
  function dmy(s) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || '')); return m ? m[3] + '/' + m[2] + '/' + m[1] : ''; }

  function hand(ctx, text, x, y, maxW, size, rnd, align) {   // tulisan tangan: tiap kata sedikit miring/naik-turun, otomatis mengecil bila kepanjangan
    text = String(text == null ? '' : text); if (!text) return;
    var s = size; ctx.font = HAND.replace('%s', s);
    while (s > 16 && ctx.measureText(text).width > maxW) { s -= 1; ctx.font = HAND.replace('%s', s); }
    var words = text.split(/(\s+)/), total = ctx.measureText(text).width, cx = align === 'right' ? x - total : align === 'center' ? x - total / 2 : x;
    ctx.fillStyle = INK; ctx.textBaseline = 'alphabetic';
    words.forEach(function (wd) {
      var wW = ctx.measureText(wd).width;
      if (/\S/.test(wd)) { ctx.save(); ctx.translate(cx, y + (rnd() - 0.5) * 3); ctx.rotate((rnd() - 0.5) * 0.045); ctx.globalAlpha = 0.9 + rnd() * 0.1; ctx.fillText(wd, 0, 0); ctx.restore(); }
      cx += wW;
    });
  }
  function dotted(ctx, x1, x2, y, dbl) {
    ctx.save(); ctx.strokeStyle = '#6a6a70'; ctx.lineWidth = 2; ctx.setLineDash([2, 3.2]); ctx.beginPath(); ctx.moveTo(x1, y); ctx.lineTo(x2, y); ctx.stroke();
    if (dbl) { ctx.beginPath(); ctx.moveTo(x1, y + 5); ctx.lineTo(x2, y + 5); ctx.stroke(); }
    ctx.restore();
  }
  function label(ctx, t, x, y, size, weight, align) { ctx.save(); ctx.fillStyle = PRINT; ctx.font = (weight || 500) + ' ' + size + 'px Inter, Arial, sans-serif'; ctx.textAlign = align || 'left'; ctx.fillText(t, x, y); ctx.restore(); }

  function arcText(ctx, text, cx, cy, r, mid, inward) {   // teks mengikuti lingkaran (untuk cap)
    var n = text.length, span = Math.min(Math.PI * 1.15, n * 0.115);
    for (var i = 0; i < n; i++) {
      var f = n === 1 ? 0.5 : i / (n - 1), a = inward ? mid + span / 2 - span * f : mid - span / 2 + span * f;
      ctx.save(); ctx.translate(cx + Math.cos(a) * r, cy + Math.sin(a) * r); ctx.rotate(a + (inward ? -Math.PI / 2 : Math.PI / 2)); ctx.textAlign = 'center'; ctx.fillText(text[i], 0, 0); ctx.restore();
    }
  }
  function stamp(ctx, cx, cy) {
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(-0.34); ctx.translate(-cx, -cy);
    ctx.globalAlpha = 0.72; ctx.strokeStyle = '#6a3fb5'; ctx.fillStyle = '#6a3fb5';
    ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(cx, cy, 108, 0, 7); ctx.stroke();
    ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, 98, 0, 7); ctx.stroke(); ctx.beginPath(); ctx.arc(cx, cy, 60, 0, 7); ctx.stroke();
    ctx.font = '700 15px Arial, sans-serif';
    arcText(ctx, 'BENGKEL LAS DAN BUBUT', cx, cy, 82, -Math.PI / 2, false);
    arcText(ctx, 'JL. PLB-JAMBI KM.178', cx, cy, 90, Math.PI / 2, true);
    ctx.textAlign = 'center'; ctx.font = '800 21px Arial, sans-serif'; ctx.fillText('ABADI', cx, cy - 4); ctx.fillText('MANDIRI', cx, cy + 20);
    ctx.font = '700 16px Arial'; ctx.fillText('★', cx - 98, cy + 5); ctx.fillText('★', cx + 98, cy + 5);
    ctx.restore();
  }

  function draw(data) {
    data = data || {};
    return loadFont().then(function () {
      var c = d.createElement('canvas'); c.width = W * 2; c.height = H * 2;   // 2x supaya tajam di layar HP
      var ctx = c.getContext('2d'); ctx.scale(2, 2);
      var rnd = seeded([data.pelanggan, data.tanggal, data.nomor, (data.items || []).length, data.total].join('|'));
      // kertas
      var g = ctx.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#f8f8fa'); g.addColorStop(1, '#eeeef2'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      for (var i = 0; i < 1400; i++) { ctx.fillStyle = 'rgba(' + (120 + rnd() * 60) + ',' + (120 + rnd() * 60) + ',' + (130 + rnd() * 60) + ',' + (0.02 + rnd() * 0.035) + ')'; ctx.fillRect(rnd() * W, rnd() * H, 1 + rnd() * 2, 1 + rnd() * 2); }
      // kepala nota
      dotted(ctx, 470, 830, 118);
      label(ctx, 'Tuan', 395, 178, 30, 500); ctx.fillStyle = LINE; ctx.fillRect(395, 186, 56, 2); label(ctx, 'Toko', 395, 222, 30, 500);
      dotted(ctx, 480, 830, 184); dotted(ctx, 480, 830, 228); dotted(ctx, 590, 830, 270, true);
      label(ctx, 'NOTA NO.', 60, 312, 50, 800); dotted(ctx, 250, 520, 304);
      // tabel
      var L = 60, R = 830, T = 322, HB = 372, X1 = 200, X2 = 530, X3 = 660, RB = 925, N = 12, rh = (RB - HB) / N;
      ctx.strokeStyle = LINE; ctx.lineWidth = 2.6;
      ctx.beginPath(); ctx.moveTo(L, T); ctx.lineTo(R, T); ctx.stroke();
      ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(L, HB); ctx.lineTo(R, HB); ctx.stroke();
      ctx.lineWidth = 2.6; [X1, X2, X3].forEach(function (x) { ctx.beginPath(); ctx.moveTo(x, T); ctx.lineTo(x, RB); ctx.stroke(); });
      ctx.lineWidth = 1.5; for (var r = 1; r <= N; r++) { var yy = HB + rh * r; ctx.beginPath(); ctx.moveTo(L, yy); ctx.lineTo(R, yy); ctx.stroke(); }
      ctx.lineWidth = 2.6; ctx.beginPath(); ctx.moveTo(L, RB); ctx.lineTo(R, RB); ctx.stroke();
      label(ctx, 'BANYAKNYA', (L + X1) / 2, 358, 19, 600, 'center'); label(ctx, 'NAMA BARANG', (X1 + X2) / 2, 352, 22, 600, 'center'); label(ctx, 'HARGA', (X2 + X3) / 2, 352, 22, 600, 'center'); label(ctx, 'JUMLAH', (X3 + R) / 2, 346, 22, 600, 'center');
      // kaki
      label(ctx, 'Jumlah Rp.', 590, 978, 26, 500, 'right'); ctx.fillStyle = LINE; ctx.fillRect(600, 982, 230, 2.4); ctx.fillRect(600, 988, 230, 1.6);
      label(ctx, 'Tanda Terima', 195, 1062, 26, 500, 'center'); label(ctx, 'Hormat kami,', 600, 1050, 26, 500, 'center');
      // isian tulisan tangan
      hand(ctx, dmy(data.tanggal), 480, 112, 340, 44, rnd);
      hand(ctx, data.pelanggan, 495, 176, 330, 44, rnd);
      hand(ctx, data.nomor, 262, 300, 250, 40, rnd);
      var items = (data.items || []).slice(0, N);
      items.forEach(function (it, k) {
        var base = HB + rh * (k + 1) - 9;
        if (it.banyak) hand(ctx, it.banyak, (L + X1) / 2, base, X1 - L - 16, 36, rnd, 'center');
        hand(ctx, it.nama, X1 + 14, base, X2 - X1 - 26, 38, rnd);
        if (it.harga != null) hand(ctx, idr(it.harga), X3 - 12, base, X3 - X2 - 20, 34, rnd, 'right');
        if (it.jumlah != null) hand(ctx, idr(it.jumlah), X3 + 18, base, R - X3 - 28, 38, rnd);
      });
      if (data.total != null) hand(ctx, idr(data.total), 612, 974, 214, 46, rnd);
      if (data.cap) stamp(ctx, 330, 790);
      return c;
    });
  }

  function css() {
    if (d.getElementById('bm-nota-css')) return;
    var s = d.createElement('style'); s.id = 'bm-nota-css';
    s.textContent = '.bmn{display:flex;flex-direction:column;gap:10px;animation:bmjIn .4s ease both}.bmn img{width:100%;max-width:420px;border-radius:14px;box-shadow:0 8px 28px rgba(0,0,0,.28);background:#f3f3f6;display:block}.bmn-ph{width:100%;max-width:420px;aspect-ratio:3/4;border-radius:14px;background:rgba(127,127,127,.15);display:flex;align-items:center;justify-content:center;font-size:13px;opacity:.7}.bmn-a{display:flex;gap:8px;flex-wrap:wrap}.bmn-a button{display:inline-flex;align-items:center;gap:6px;padding:9px 14px;border-radius:999px;border:1px solid var(--border,rgba(127,127,127,.3));background:var(--surface2,rgba(127,127,127,.15));color:var(--text,inherit);font:inherit;font-size:13px;font-weight:600;cursor:pointer}.bmn-a button.pri{background:var(--text,#111);color:var(--bg,#fff);border-color:transparent}.bmn-a button:disabled{opacity:.55}';
    d.head.appendChild(s);
  }
  function fname(data) { return 'nota-' + String(data.pelanggan || 'baru').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) + '-' + String(data.tanggal || '').replace(/-/g, '') + '.png'; }

  function render(data) {
    css();
    var box = d.createElement('div'); box.className = 'bmn';
    var ph = d.createElement('div'); ph.className = 'bmn-ph'; ph.textContent = 'Menggambar nota…'; box.appendChild(ph);
    var acts = d.createElement('div'); acts.className = 'bmn-a';
    function btn(t, pri, fn) { var b = d.createElement('button'); b.textContent = t; if (pri) b.className = 'pri'; b.disabled = true; b.onclick = function () { fn(b); }; acts.appendChild(b); return b; }
    var canvas = null, blob = null;
    function done(b, txt, back) { var o = b.textContent; b.textContent = txt; setTimeout(function () { b.textContent = back || o; }, 1800); }
    var bDl = btn('Unduh gambar', true, function (b) {
      if (!blob) return; var a = d.createElement('a'); a.href = URL.createObjectURL(blob); a.download = fname(data); d.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000); done(b, 'Tersimpan');
    });
    var bSh = btn('Bagikan', false, function (b) {
      if (!blob) return;
      var f = new File([blob], fname(data), { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [f] })) navigator.share({ files: [f], title: 'Nota ' + (data.pelanggan || '') }).catch(function () {});
      else done(b, 'Tidak didukung');
    });
    var bCp = btn('Salin gambar', false, function (b) {
      if (!blob || !navigator.clipboard || !w.ClipboardItem) return done(b, 'Tidak didukung');
      navigator.clipboard.write([new w.ClipboardItem({ 'image/png': blob })]).then(function () { done(b, 'Tersalin'); }, function () { done(b, 'Gagal'); });
    });
    draw(data).then(function (c) {
      canvas = c;
      c.toBlob(function (bl) {
        blob = bl;
        var img = d.createElement('img'); img.alt = 'Nota ' + (data.pelanggan || ''); img.src = c.toDataURL('image/png'); ph.replaceWith(img);
        [bDl, bSh, bCp].forEach(function (b) { b.disabled = false; });
      }, 'image/png');
    }).catch(function () { ph.textContent = 'Gagal menggambar nota'; });
    box.appendChild(acts);
    return box;
  }
  w.BMNota = { draw: draw, render: render };
})(window, document);
