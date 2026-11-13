/*!
 * bm-visual.js — tampilan visual jawaban Jarvis: grafik (garis/batang), kartu angka, dan gambar dari kode.
 * Dipakai jarvis-ai.html dan bm-jarvis.js:  BMVisual.render(visual) -> elemen siap tempel.
 *  - Grafik & kartu digambar sendiri dengan DOM/SVG (tanpa innerHTML dari data).
 *  - Gambar dari kode (SVG atau kode canvas buatan AI) dijalankan di iframe sandbox tanpa akses
 *    ke halaman, cookie, maupun internet (CSP default-src 'none').
 *  - Semua bisa diunduh sebagai PNG.
 */
(function () {
  'use strict';
  if (window.BMVisual) return;
  var NS = 'http://www.w3.org/2000/svg';
  /* warna seri: pertama = warna aksen pengaturan; sisanya dipilih yang jelas berbeda dari aksen */
  function hexRgb(h) { h = String(h || '').trim(); var m = /^#?([0-9a-f]{6})$/i.exec(h); if (!m) return null; var n = parseInt(m[1], 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
  function palette() {
    var acc = '#F0A529'; try { var v = getComputedStyle(document.documentElement).getPropertyValue('--accent-yellow').trim() || getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(); if (hexRgb(v)) acc = v; } catch (e) {}
    var a = hexRgb(acc), far = function (c) { var b = hexRgb(c); return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) > 150; };
    return [acc].concat(['#3b82f6', '#22a06b', '#e5484d', '#8b5cf6', '#14b8a6', '#F0A529', '#64748b'].filter(far));
  }

  var css = '.bmv{flex:none;min-width:0;border:1px solid var(--bmv-bd,rgba(127,127,127,.25));border-radius:14px;overflow:hidden;background:var(--bmv-bg,rgba(127,127,127,.06));margin:2px 0}' +
    '.bmv-h{display:flex;align-items:flex-start;gap:8px;padding:10px 12px 4px}.bmv-h b{flex:1;min-width:0;font-size:14px;line-height:1.3;overflow-wrap:anywhere}.bmv-h small{display:block;font-weight:400;opacity:.65;font-size:12px;margin-top:2px}' +
    '.bmv-dl{flex:none;border:1px solid var(--bmv-bd,rgba(127,127,127,.3));background:transparent;color:inherit;border-radius:999px;padding:5px 11px;font:inherit;font-size:12px;font-weight:700;cursor:pointer}' +
    '.bmv-c{padding:4px 6px 8px;overflow:hidden}.bmv-c svg{display:block;width:100%;height:auto;overflow:visible}' +
    '.bmv-lg{display:flex;flex-wrap:wrap;gap:4px 12px;padding:0 12px 10px;font-size:12px}.bmv-lg i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:5px;vertical-align:-1px}' +
    '.bmv-tip{position:absolute;pointer-events:none;background:rgba(20,20,22,.92);color:#fff;font-size:12px;line-height:1.35;padding:5px 8px;border-radius:8px;white-space:nowrap;max-width:min(260px,90%);overflow:hidden;text-overflow:ellipsis;transform:translate(-50%,-115%);z-index:3}' +
    '.bmv-k{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(140px,100%),1fr));gap:8px;padding:6px 12px 12px}' +
    '.bmv-k div{border:1px solid var(--bmv-bd,rgba(127,127,127,.22));border-radius:12px;padding:9px 10px}.bmv-k span{display:block;font-size:12px;opacity:.7;overflow-wrap:anywhere}' +
    '.bmv-k b{display:block;font-size:clamp(15px,4.2vw,19px);margin-top:2px;font-variant-numeric:tabular-nums;overflow-wrap:anywhere;line-height:1.25}.bmv-k small{display:block;font-size:11.5px;opacity:.65;margin-top:2px}' +

    '.bmd{max-width:560px}.bmd-top{display:flex;align-items:center;gap:11px;padding:11px 12px 8px}.bmd-ic{flex:none;width:40px;height:44px;border-radius:9px;display:flex;align-items:flex-end;justify-content:center;padding-bottom:5px;font-size:10px;font-weight:800;letter-spacing:.3px;color:#fff;background:#64748b}' +
    '.bmd-ic[data-k=pdf]{background:#e5484d}.bmd-ic[data-k=xlsx]{background:#22a06b}.bmd-ic[data-k=docx]{background:#3b82f6}.bmd-ic[data-k=csv]{background:#14b8a6}.bmd-ic[data-k=html]{background:#f97316}.bmd-ic[data-k=md]{background:#8b5cf6}' +
    '.bmd-t{min-width:0;flex:1}.bmd-t b{display:block;font-size:14.5px;line-height:1.3;overflow-wrap:anywhere}.bmd-t small{display:block;font-size:12px;opacity:.65;margin-top:1px;overflow-wrap:anywhere}' +
    '.bmd-pv{position:relative;margin:0 12px;border:1px solid var(--bmv-bd,rgba(127,127,127,.22));border-radius:10px;background:#fff;color:#1c1b19;overflow:hidden;max-height:190px;transition:max-height .25s}' +
    '.bmd.open .bmd-pv{max-height:min(70vh,640px);overflow:auto}.bmd-pv:after{content:"";position:absolute;left:0;right:0;bottom:0;height:46px;background:linear-gradient(transparent,#fff);pointer-events:none}.bmd.open .bmd-pv:after{display:none}' +
    '.bmd-pg{padding:14px 15px;font:13px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}.bmd-pg h1{font-size:17px;margin:0 0 8px}.bmd-pg h2{font-size:14.5px;margin:12px 0 5px}.bmd-pg h3{font-size:13px;margin:10px 0 4px}.bmd-pg p{margin:0 0 7px;overflow-wrap:anywhere}' +
    '.bmd-pg ul,.bmd-pg ol{margin:0 0 7px;padding-left:20px}.bmd-pg li{overflow-wrap:anywhere}.bmd-pg hr{border:0;border-top:1px solid #ddd;margin:8px 0}.bmd-tw{overflow-x:auto;margin:0 0 8px}.bmd-pg table{border-collapse:collapse;font-size:11.5px;min-width:100%}' +
    '.bmd-pg th{background:var(--accent-yellow,#F0A529);color:#1c1b19;text-align:left;font-weight:700}.bmd-pg th,.bmd-pg td{border:1px solid #ddd;padding:4px 7px;vertical-align:top}.bmd-pg td.n{text-align:right;white-space:nowrap}.bmd-pg tbody tr:nth-child(even){background:#f7f5f0}' +
    '.bmd-bar{display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:10px 12px 12px}.bmd-b{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--bmv-bd,rgba(127,127,127,.32));background:transparent;color:inherit;border-radius:999px;padding:7px 13px;font:inherit;font-size:13px;font-weight:700;cursor:pointer}' +
    '.bmd-b.p{background:var(--accent-yellow,#F0A529);border-color:transparent;color:var(--on-accent,#1c1b19)}.bmd-b:disabled{opacity:.55;cursor:default}.bmd-b svg{width:16px;height:16px;flex:none}' +
    '.bmd-sel{border:1px solid var(--bmv-bd,rgba(127,127,127,.32));background:transparent;color:inherit;border-radius:999px;padding:7px 10px;font:inherit;font-size:13px;font-weight:700;max-width:130px}.bmd-sel option{color:#1c1b19}' +
    '.bmd-er{flex:1 0 100%;font-size:12px;color:#e5484d;overflow-wrap:anywhere}' +
    '.bmv-f{display:block;width:100%;border:0;background:#fff;border-top:1px solid var(--bmv-bd,rgba(127,127,127,.2))}';
  function addCss() { if (document.getElementById('bmv-css')) return; var s = document.createElement('style'); s.id = 'bmv-css'; s.textContent = css; document.head.appendChild(s); }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function sv(tag, at) { var e = document.createElementNS(NS, tag); for (var k in at) e.setAttribute(k, at[k]); return e; }
  function rupiah(n) { return 'Rp' + Math.round(n).toLocaleString('id-ID'); }
  function short(n, rp) {
    var a = Math.abs(n), s = a >= 1e9 ? (n / 1e9).toFixed(1).replace('.0', '') + ' M' : a >= 1e6 ? (n / 1e6).toFixed(1).replace('.0', '') + ' jt' : a >= 1e3 ? (n / 1e3).toFixed(0) + ' rb' : String(Math.round(n * 100) / 100);
    return (rp ? 'Rp' : '') + s.replace('.', ',');
  }
  function fmt(n, rp) { return rp ? rupiah(n) : (Math.round(n * 100) / 100).toLocaleString('id-ID'); }
  function nice(max) { if (max <= 0) return 1; var p = Math.pow(10, Math.floor(Math.log10(max))), f = max / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p; }
  function head(v, onDl) {
    var h = el('div', 'bmv-h'), t = el('b', '', v.judul || 'Grafik');
    if (v.sub) t.appendChild(el('small', '', v.sub));
    var b = el('button', 'bmv-dl', 'Unduh PNG'); b.type = 'button'; b.onclick = onDl;
    h.append(t, b); return h;
  }
  function download(url, name) { var a = document.createElement('a'); a.href = url; a.download = (String(name || 'jarvis').replace(/[^\w\- ]+/g, '').trim() || 'jarvis') + '.png'; document.body.appendChild(a); a.click(); a.remove(); }
  /* SVG -> PNG: warna variabel CSS diganti nilai nyata supaya ikut tergambar */
  function svgToPng(svg, w, h, bg, name) {
    var c = svg.cloneNode(true);
    c.setAttribute('xmlns', NS); c.setAttribute('width', w); c.setAttribute('height', h);
    var txt = new XMLSerializer().serializeToString(c).replace(/currentColor/g, bg === '#ffffff' ? '#222' : '#eee');
    var img = new Image();
    img.onload = function () { var k = 2, cv = document.createElement('canvas'); cv.width = w * k; cv.height = h * k; var x = cv.getContext('2d'); x.scale(k, k); x.fillStyle = bg; x.fillRect(0, 0, w, h); x.drawImage(img, 0, 0, w, h); download(cv.toDataURL('image/png'), name); };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(txt);
  }
  function isDark() { try { var c = getComputedStyle(document.body).backgroundColor.match(/\d+/g); if (c) return (+c[0] * 0.299 + +c[1] * 0.587 + +c[2] * 0.114) < 128; } catch (e) {} return false; }

  /* ---------- grafik garis / batang ----------
   * Digambar ulang sesuai lebar layar (HP atau desktop): ukuran huruf tetap terbaca, label tidak terpotong.
   * Label panjang: dimiringkan, dilewati sebagian (deret waktu), atau grafik batang dibuat mendatar (nama panjang). */
  var MC = null;
  function measurer(fs) {
    if (!MC) MC = document.createElement('canvas').getContext('2d');
    var fam = 'system-ui, sans-serif'; try { fam = getComputedStyle(document.body).fontFamily || fam; } catch (e) {}
    MC.font = fs + 'px ' + fam; return function (t) { return MC.measureText(String(t)).width; };
  }
  function fitText(t, maxW, mw) { t = String(t); if (mw(t) <= maxW) return t; while (t.length > 1 && mw(t + '…') > maxW) t = t.slice(0, -1); return t + '…'; }
  function chart(v) {
    var PAL = palette(), labels = (v.label || []).map(String), seri = (v.seri || []).filter(function (s) { return s && Array.isArray(s.nilai); }), rp = v.satuan === 'rp', n = labels.length;
    var all = []; seri.forEach(function (s) { s.nilai.forEach(function (x) { if (isFinite(+x)) all.push(+x); }); });
    /* sumbu Y dengan angka bulat (0, 1 jt, 2 jt ...), bukan 1,3 jt / 3,8 jt */
    var hiV = Math.max.apply(null, all.concat([0])), loV = Math.min.apply(null, all.concat([0]));
    var tstep = nice(((hiV - loV) || 4) / 4) || 1, mx = Math.max(tstep, Math.ceil(hiV / tstep - 1e-9) * tstep), mn = loV < 0 ? -Math.ceil(-loV / tstep - 1e-9) * tstep : 0;
    var box = el('div', 'bmv'), body = el('div', 'bmv-c'), cur = null, hits = [], geo = null;
    body.style.position = 'relative';
    box.appendChild(head(v, function () { if (cur) svgToPng(cur.svg, cur.W, cur.H, isDark() ? '#151517' : '#ffffff', v.judul); }));
    box.appendChild(body);
    if (seri.length > 1 || (seri[0] && seri[0].nama)) {
      var lg = el('div', 'bmv-lg');
      seri.forEach(function (s, si) { var it = el('span'), sw = el('i'); sw.style.background = PAL[si % PAL.length]; it.append(sw, document.createTextNode(s.nama || ('Seri ' + (si + 1)))); lg.appendChild(it); });
      box.appendChild(lg);
    }
    var tip = el('div', 'bmv-tip'); tip.hidden = true;

    function build(W) {
      var small = W < 480, fs = small ? 11 : 12, mw = measurer(fs), H0 = small ? 230 : 290, R = 10, T = 16;
      var ticks = []; for (var g = mn; g <= mx + tstep / 2; g += tstep) ticks.push(Math.round(g / tstep) * tstep);
      var tickW = Math.max.apply(null, ticks.map(function (t) { return mw(short(t, rp)); }));
      var maxLw = Math.max.apply(null, labels.map(mw).concat([0]));
      var bar = v.jenis === 'batang';
      var svg = sv('svg', { viewBox: '0 0 ' + W + ' ' + H0, width: W, height: H0, role: 'img', 'aria-label': v.judul || 'Grafik', 'font-family': 'inherit', 'font-size': String(fs) });
      hits = [];
      /* --- batang mendatar: nama kategori panjang --- */
      var L0 = Math.ceil(tickW) + 10, slot0 = (W - L0 - R) / Math.max(n, 1);
      if (bar && n <= 16 && maxLw > Math.max(64, slot0 * 1.6)) {
        var rowH = Math.max(fs + 14, 24 * seri.length), lw = Math.min(maxLw, W * (small ? 0.42 : 0.32)) + 14, vw = Math.max.apply(null, all.map(function (x) { return mw(short(x, rp)); }).concat([20])) + 8;
        var x0 = lw, iw2 = Math.max(60, W - lw - vw - R), H = T + n * rowH + 8;
        svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H); svg.setAttribute('height', H);
        var xs = function (val) { return x0 + (val - mn) / (mx - mn || 1) * iw2; };
        svg.appendChild(sv('line', { x1: xs(Math.max(mn, 0)), x2: xs(Math.max(mn, 0)), y1: T - 4, y2: H - 6, stroke: 'currentColor', 'stroke-opacity': .3 }));
        labels.forEach(function (lb, i) {
          var yc = T + i * rowH + rowH / 2, t = sv('text', { x: lw - 8, y: yc + fs * 0.35, 'text-anchor': 'end', fill: 'currentColor', 'fill-opacity': .8 });
          t.textContent = fitText(lb, lw - 9, mw); if (t.textContent !== lb) t.appendChild(sv('title', {})).textContent = lb; svg.appendChild(t);
          var bh = Math.min(18, (rowH - 6) / seri.length);
          seri.forEach(function (s, si) {
            var val = +s.nilai[i] || 0, a = xs(Math.min(val, 0) < 0 ? val : Math.max(mn, 0)), b = xs(Math.max(val, 0)), y = yc - bh * seri.length / 2 + bh * si;
            svg.appendChild(sv('rect', { x: Math.min(a, b), y: y + .5, width: Math.max(1, Math.abs(b - a)), height: bh - 1, rx: 3, fill: PAL[si % PAL.length] }));
            var vt = sv('text', { x: Math.max(a, b) + 5, y: y + bh / 2 + fs * 0.35 - .5, fill: 'currentColor', 'fill-opacity': .75, 'font-size': String(fs - 1) }); vt.textContent = short(val, rp); svg.appendChild(vt);
            hits.push({ x: Math.max(a, b), y: y, t: lb + ' · ' + (s.nama ? s.nama + ': ' : '') + fmt(val, rp), row: true });
          });
        });
        geo = { W: W, H: H, rowH: rowH, T: T, horiz: true }; return { svg: svg, W: W, H: H };
      }
      /* --- grafik tegak --- */
      var L = L0, iw = W - L - R, slot = iw / Math.max(n, 1), gap = 8, mode, step = 1, B, maxRot = 0;
      if (maxLw + gap <= slot) mode = 'all';
      else if (bar && slot * 0.707 >= fs + 2 && n <= 31) {          // miring 45 derajat: jarak antar label cukup, tidak saling tindih
        mode = 'rot'; maxRot = Math.min(maxLw, H0 * 0.42);
        L = Math.max(L0, Math.ceil(maxRot * 0.707 - (W - L0 - R) / Math.max(n, 1) / 2 + fs * 0.4 + 4)); iw = W - L - R; slot = iw / Math.max(n, 1);
      }
      else { mode = 'skip'; step = Math.ceil((maxLw + gap) / slot); }
      B = mode === 'rot' ? Math.ceil(maxRot * 0.72 + fs + 10) : fs + 16;
      var H = H0 + (mode === 'rot' ? Math.max(0, B - 30) : 0), ih = H - T - B;
      svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H); svg.setAttribute('height', H);
      var y = function (val) { return T + ih - (val - mn) / (mx - mn || 1) * ih; };
      ticks.forEach(function (val, g) {
        var yy = y(val);
        svg.appendChild(sv('line', { x1: L, x2: W - R, y1: yy, y2: yy, stroke: 'currentColor', 'stroke-opacity': val ? .12 : .35 }));
        var tl = sv('text', { x: L - 6, y: yy + fs * 0.35, 'text-anchor': 'end', fill: 'currentColor', 'fill-opacity': .65 }); tl.textContent = short(val, rp); svg.appendChild(tl);
      });
      labels.forEach(function (lb, i) {
        var cx = L + slot * (i + .5), t;
        if (mode === 'rot') {
          t = sv('text', { x: cx, y: H - B + fs + 2, 'text-anchor': 'end', 'data-rot': '1', fill: 'currentColor', 'fill-opacity': .75, transform: 'rotate(-45 ' + cx + ' ' + (H - B + fs + 2) + ')' });
          t.textContent = fitText(lb, maxRot, mw);
        } else {
          if (mode === 'skip' && i !== n - 1 && (i % step || n - 1 - i < step)) return;   // label terakhir selalu tampil
          var half = mw(lb) / 2, ax = 'middle', xx = cx;
          if (cx - half < 2) { ax = 'start'; xx = Math.max(2, cx - slot / 2); } else if (cx + half > W - 2) { ax = 'end'; xx = Math.min(W - 2, cx + slot / 2); }
          t = sv('text', { x: xx, y: H - B + fs + 6, 'text-anchor': ax, fill: 'currentColor', 'fill-opacity': .75 }); t.textContent = lb;
        }
        if (t.textContent !== lb) t.appendChild(sv('title', {})).textContent = lb;
        svg.appendChild(t);
      });
      if (bar) {
        var bw = Math.max(3, Math.min(46, slot * .74 / Math.max(seri.length, 1))), showVal = seri.length === 1 && n <= 24;
        var valW = Math.max.apply(null, all.map(function (x) { return measurer(fs - 1)(short(x, rp)); }).concat([0]));
        seri.forEach(function (s, si) {
          s.nilai.forEach(function (x, i) {
            x = +x || 0; var x0 = L + slot * (i + .5) - bw * seri.length / 2 + bw * si, y0 = y(Math.max(x, 0)), y1 = y(Math.min(x, 0));
            svg.appendChild(sv('rect', { x: x0 + .5, y: y0, width: bw - 1, height: Math.max(1, y1 - y0), rx: Math.min(4, bw / 3), fill: PAL[si % PAL.length] }));
            if (showVal && valW <= slot - 2 && x) { var vt = sv('text', { x: x0 + bw / 2, y: y0 - 4, 'text-anchor': 'middle', fill: 'currentColor', 'fill-opacity': .7, 'font-size': String(fs - 1) }); vt.textContent = short(x, rp); svg.appendChild(vt); }
            hits.push({ x: x0 + bw / 2, y: y0, t: labels[i] + ' · ' + (s.nama ? s.nama + ': ' : '') + fmt(x, rp) });
          });
        });
      } else {
        seri.forEach(function (s, si) {
          var pts = s.nilai.map(function (x, i) { return [L + slot * (i + .5), y(+x || 0), +x || 0, i]; });
          if (seri.length === 1 && pts.length > 1) {
            var base = y(Math.max(mn, 0));
            svg.appendChild(sv('path', { d: 'M' + pts[0][0] + ',' + base + ' ' + pts.map(function (p) { return 'L' + p[0] + ',' + p[1]; }).join(' ') + ' L' + pts[pts.length - 1][0] + ',' + base + 'Z', fill: PAL[0], 'fill-opacity': .12 }));
          }
          svg.appendChild(sv('path', { d: pts.map(function (p, k) { return (k ? 'L' : 'M') + p[0] + ',' + p[1]; }).join(' '), fill: 'none', stroke: PAL[si % PAL.length], 'stroke-width': small ? 2.2 : 2.5, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
          pts.forEach(function (p) {
            if (slot >= 7) svg.appendChild(sv('circle', { cx: p[0], cy: p[1], r: small ? 2.8 : 3.2, fill: PAL[si % PAL.length] }));
            hits.push({ x: p[0], y: p[1], t: labels[p[3]] + ' · ' + (s.nama ? s.nama + ': ' : '') + fmt(p[2], rp) });
          });
        });
      }
      geo = { W: W, H: H, slot: slot }; return { svg: svg, W: W, H: H };
    }
    function draw() {
      var w = Math.floor(body.clientWidth - 12);
      if (!(w > 0)) w = Math.min(640, Math.max(260, (window.innerWidth || 360) - 48));
      w = Math.max(240, Math.min(1100, w));
      if (cur && Math.abs(cur.W - w) < 6) return;
      var nx = build(w);
      nx.svg.style.width = '100%'; nx.svg.style.height = 'auto';
      if (cur) body.replaceChild(nx.svg, cur.svg); else body.insertBefore(nx.svg, body.firstChild);
      cur = nx; tip.hidden = true;
      nx.svg.addEventListener('pointermove', near); nx.svg.addEventListener('pointerdown', near); nx.svg.addEventListener('pointerleave', function () { tip.hidden = true; });
    }
    body.appendChild(tip);
    /* sentuh/arahkan: nilai titik terdekat; kotak keterangan dijaga tetap di dalam grafik */
    function near(ev) {
      if (!cur) return;
      var r = cur.svg.getBoundingClientRect(), k = r.width / cur.W, sx = (ev.clientX - r.left) / k, sy = (ev.clientY - r.top) / k, best = null, bd = 1e9;
      hits.forEach(function (h) { var d = geo.horiz ? Math.abs(h.y + 8 - sy) : Math.abs(h.x - sx); if (d < bd) { bd = d; best = h; } });
      if (!best || bd > (geo.horiz ? geo.rowH : geo.slot)) { tip.hidden = true; return; }
      tip.hidden = false; tip.textContent = best.t;
      var tw = tip.offsetWidth, bw = body.clientWidth, px = best.x * k + 6, py = best.y * k + 4;
      px = Math.max(tw / 2 + 4, Math.min(bw - tw / 2 - 4, px));
      tip.style.left = px + 'px'; tip.style.top = Math.max(tip.offsetHeight + 6, py) + 'px';
    }
    draw();
    if (window.ResizeObserver) { var ro = new ResizeObserver(function () { if (box.isConnected) draw(); }); ro.observe(body); }
    else window.addEventListener('resize', draw);
    setTimeout(draw, 0);
    return box;
  }

  /* ---------- kartu angka ---------- */
  function cards(v) {
    var box = el('div', 'bmv'), g = el('div', 'bmv-k');
    (v.kartu || []).slice(0, 8).forEach(function (k) { var d = el('div'); d.append(el('span', '', k.label || ''), el('b', '', String(k.nilai == null ? '' : k.nilai))); if (k.ket) d.appendChild(el('small', '', k.ket)); g.appendChild(d); });
    var h = el('div', 'bmv-h'); h.appendChild(el('b', '', v.judul || 'Ringkasan')); box.append(h, g); return box;
  }

  /* ---------- gambar dari kode (sandbox) ---------- */
  function drawing(v) {
    var box = el('div', 'bmv'), f = document.createElement('iframe');
    f.className = 'bmv-f'; f.setAttribute('sandbox', 'allow-scripts'); f.setAttribute('referrerpolicy', 'no-referrer'); f.title = v.judul || 'Gambar';
    var W = Math.max(120, Math.min(1200, +v.lebar || 640)), H = Math.max(80, Math.min(1200, +v.tinggi || 400));
    var csp = "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:\">";
    var bridge = '<script>(function(){var s0=document.querySelector("svg");if(s0&&!s0.getAttribute("viewBox")){var w0=parseFloat(s0.getAttribute("width"))||' + W + ',h0=parseFloat(s0.getAttribute("height"))||' + H + ';s0.setAttribute("viewBox","0 0 "+w0+" "+h0);s0.setAttribute("width","100%");s0.removeAttribute("height")}function png(){var c=document.querySelector("canvas");if(c){try{return c.toDataURL("image/png")}catch(e){}}var s=document.querySelector("svg");if(!s)return Promise.resolve("");' +
      'var w=s.viewBox&&s.viewBox.baseVal&&s.viewBox.baseVal.width||s.clientWidth||' + W + ',h=s.viewBox&&s.viewBox.baseVal&&s.viewBox.baseVal.height||s.clientHeight||' + H + ';' +
      'return new Promise(function(ok){var i=new Image();i.onload=function(){var k=2,c=document.createElement("canvas");c.width=w*k;c.height=h*k;var x=c.getContext("2d");x.fillStyle="#fff";x.fillRect(0,0,c.width,c.height);x.drawImage(i,0,0,c.width,c.height);ok(c.toDataURL("image/png"))};i.onerror=function(){ok("")};' +
      'var t=new XMLSerializer().serializeToString(s);if(t.indexOf("xmlns=")<0)t=t.replace("<svg","<svg xmlns=\\"http://www.w3.org/2000/svg\\"");i.src="data:image/svg+xml;charset=utf-8,"+encodeURIComponent(t)})}' +
      'addEventListener("message",function(e){if(e.data&&e.data.bmv==="png"){Promise.resolve(png()).then(function(u){parent.postMessage({bmv:"png",url:u},"*")})}});' +
      'function fit(){parent.postMessage({bmv:"h",h:Math.min(1400,document.documentElement.scrollHeight)},"*")}addEventListener("load",fit);setTimeout(fit,300);setTimeout(fit,1200)})()<\/script>';
    var bodyHtml;
    if (v.mode === 'canvas') {
      bodyHtml = '<canvas id="c" width="' + W + '" height="' + H + '" style="max-width:100%;height:auto;display:block;margin:auto"></canvas><script>(function(){var canvas=document.getElementById("c"),ctx=canvas.getContext("2d"),W=' + W + ',H=' + H + ';try{' +
        String(v.kode || '').replace(/<\/script/gi, '<\\/script') + '\n}catch(e){ctx.fillStyle="#c00";ctx.font="14px sans-serif";ctx.fillText("Kode gambar galat: "+e.message,10,24)}})()<\/script>';
    } else {
      bodyHtml = String(v.svg || '').replace(/<\/?(iframe|object|embed|link|meta|base|form)\b[^>]*>/gi, '');
    }
    f.srcdoc = '<!doctype html><html><head><meta charset="utf-8">' + csp + '<style>html,body{margin:0;background:#fff;color:#111;font-family:system-ui,sans-serif}svg{max-width:100%;height:auto;display:block;margin:auto}</style></head><body>' + bodyHtml + bridge + '</body></html>';
    f.style.height = Math.min(H + 16, 520) + 'px';
    var pending = false;
    function onMsg(e) {
      if (e.source !== f.contentWindow || !e.data) return;
      if (e.data.bmv === 'h' && e.data.h > 40) f.style.height = Math.min(e.data.h + 4, 900) + 'px';
      if (e.data.bmv === 'png' && pending) { pending = false; if (/^data:image\/png;base64,/.test(e.data.url || '')) download(e.data.url, v.judul); }
    }
    window.addEventListener('message', onMsg);
    box.appendChild(head(v, function () { pending = true; try { f.contentWindow.postMessage({ bmv: 'png' }, '*'); } catch (e) {} }));
    box.appendChild(f);
    return box;
  }


  /* ---------- dokumen: kartu file + pratinjau; file dibuat di HP lewat bm-dokumen.js (tidak disimpan di server) ---------- */
  var DOKICON = { download: 'M12 4v10m0 0l-4-4m4 4l4-4M5 19h14', share: 'M12 15V4m0 0L8 8m4-4l4 4M6 12v7h12v-7', pen: 'M4 20h4L19 9l-4-4L4 16v4zM13 7l4 4', open: 'M6 9l6 6 6-6', close: 'M6 15l6-6 6 6' };
  function ico(k) { var s = sv('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }); s.appendChild(sv('path', { d: DOKICON[k] })); return s; }
  var dokLoad = null;
  function ensureDok() {
    if (window.BMDok) return Promise.resolve();
    if (!dokLoad) dokLoad = new Promise(function (ok, no) { var sc = document.createElement('script'); sc.src = '/bm-dokumen.js'; sc.onload = ok; sc.onerror = function () { dokLoad = null; no(new Error('Modul dokumen belum termuat. Unggah bm-dokumen.js lalu buka ulang aplikasi.')); }; document.head.appendChild(sc); });
    return dokLoad;
  }
  function plainT(s) { return String(s == null ? '' : s).replace(/\*\*/g, ''); }
  function richT(parent, text) {   // **tebal** tanpa innerHTML
    String(text == null ? '' : text).split('**').forEach(function (p, i) { if (!p) return; parent.appendChild(i % 2 ? el('b', '', p) : document.createTextNode(p)); });
  }
  function numLike(x) { return /^(Rp\s?)?-?[\d.,]+%?$/.test(String(x)); }
  function docPreview(v) {
    var pg = el('div', 'bmd-pg'), first = (v.bagian || [])[0];
    pg.appendChild(el('h1', '', v.judul));
    (v.bagian || []).forEach(function (b) {
      if (b === first && b.t === 'h' && plainT(b.teks) === plainT(v.judul)) return;
      if (b.t === 'h' || b.t === 'h2') { var h = el(b.t === 'h' ? 'h2' : 'h3'); richT(h, b.teks); pg.appendChild(h); }
      else if (b.t === 'p') String(b.teks).split(/\n+/).forEach(function (l) { var p = el('p'); richT(p, l); pg.appendChild(p); });
      else if (b.t === 'ul' || b.t === 'ol') { var ul = el(b.t); b.items.forEach(function (x) { var li = el('li'); richT(li, x); ul.appendChild(li); }); pg.appendChild(ul); }
      else if (b.t === 'hr') pg.appendChild(el('hr'));
      else if (b.t === 'tb') {
        if (b.nama) pg.appendChild(el('h3', '', b.nama));
        var w = el('div', 'bmd-tw'), tb = el('table'), th = el('thead'), tr = el('tr');
        b.kolom.forEach(function (c) { tr.appendChild(el('th', '', plainT(c))); }); th.appendChild(tr); tb.appendChild(th);
        var bd = el('tbody'); b.baris.forEach(function (r) { var row = el('tr'); b.kolom.forEach(function (_, i) { var x = r[i]; row.appendChild(el('td', numLike(x) ? 'n' : '', typeof x === 'number' ? x.toLocaleString('id-ID') : plainT(x))); }); bd.appendChild(row); });
        tb.appendChild(bd); w.appendChild(tb); pg.appendChild(w);
      }
    });
    return pg;
  }
  function dokumen(v) {
    var card = el('div', 'bmv bmd'), fm = (v.format || 'pdf'), fk = fm;
    var tbs = (v.bagian || []).filter(function (b) { return b.t === 'tb'; }), nb = tbs.reduce(function (n, b) { return n + b.baris.length; }, 0);
    var top = el('div', 'bmd-top'), ic = el('div', 'bmd-ic', fk.toUpperCase().slice(0, 4)); ic.dataset.k = fk;
    var t = el('div', 'bmd-t'), nm = el('b', '', v.judul), sub = el('small', '', '');
    function subTxt() { sub.textContent = fk.toUpperCase() + (tbs.length ? ' \u00b7 ' + tbs.length + ' tabel, ' + nb + ' baris' : ' \u00b7 ' + (v.bagian || []).length + ' bagian') + (v.versi > 1 ? ' · versi ' + v.versi : ''); ic.dataset.k = fk; ic.textContent = fk.toUpperCase().slice(0, 4); }
    subTxt(); t.append(nm, sub); top.append(ic, t); card.appendChild(top);
    var pv = el('div', 'bmd-pv'); pv.appendChild(docPreview(v)); card.appendChild(pv);
    var bar = el('div', 'bmd-bar'), err = el('div', 'bmd-er'); err.style.display = 'none';
    function showErr(e) { err.textContent = (e && e.message) || String(e || 'Gagal membuat file'); err.style.display = ''; }
    function run(btn, label, fn) {
      btn.onclick = function () { err.style.display = 'none'; var old = btn.lastChild.textContent; btn.disabled = true; btn.lastChild.textContent = 'Menyiapkan…';
        ensureDok().then(fn).then(function () { btn.lastChild.textContent = 'Selesai'; setTimeout(function () { btn.lastChild.textContent = old; btn.disabled = false; }, 1400); }, function (e) { btn.lastChild.textContent = old; btn.disabled = false; if (!(e && e.name === 'AbortError')) showErr(e); }); };
    }
    function btn(cls, icon, text) { var b = el('button', 'bmd-b ' + cls); b.type = 'button'; b.appendChild(ico(icon)); b.appendChild(el('span', '', text)); return b; }
    var dl = btn('p', 'download', 'Unduh'); run(dl, '', function () { return window.BMDok.download(v, fk); });
    var sel = el('select', 'bmd-sel'); sel.setAttribute('aria-label', 'Format file');
    [['pdf', 'PDF'], ['xlsx', 'Excel'], ['docx', 'Word'], ['csv', 'CSV'], ['html', 'HTML'], ['md', 'Markdown'], ['txt', 'Teks']].forEach(function (f) { var o = el('option', '', f[1]); o.value = f[0]; if (f[0] === fk) o.selected = true; sel.appendChild(o); });
    sel.onchange = function () { fk = sel.value; subTxt(); };
    var sh = btn('', 'share', 'Bagikan'); run(sh, '', function () { return window.BMDok.share(v, fk); });
    var op = btn('', 'open', 'Buka'); op.onclick = function () { var o = card.classList.toggle('open'); op.replaceChildren(ico(o ? 'close' : 'open'), el('span', '', o ? 'Tutup' : 'Buka')); };
    var rv = btn('', 'pen', 'Revisi'); rv.onclick = function () { try { window.dispatchEvent(new CustomEvent('bm-doc-revisi', { detail: { judul: v.judul, versi: (v.versi || 1) + 1 } })); } catch (e) {} };
    bar.append(dl, sel, sh, op, rv, err); card.appendChild(bar);
    return card;
  }
  window.BMVisual = {
    render: function (v) {
      addCss();
      if (!v || typeof v !== 'object') return el('div');
      if (v.tipe === 'grafik') return chart(v);
      if (v.tipe === 'kartu') return cards(v);
      if (v.tipe === 'gambar') return drawing(v);
      if (v.tipe === 'dokumen') return dokumen(v);
      return el('div');
    }
  };
})();
