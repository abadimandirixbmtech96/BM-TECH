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
    '.bmv-h{display:flex;align-items:flex-start;gap:8px;padding:10px 12px 4px}.bmv-h b{flex:1;font-size:14px;line-height:1.3}.bmv-h small{display:block;font-weight:400;opacity:.65;font-size:12px;margin-top:2px}' +
    '.bmv-dl{flex:none;border:1px solid var(--bmv-bd,rgba(127,127,127,.3));background:transparent;color:inherit;border-radius:999px;padding:5px 11px;font:inherit;font-size:12px;font-weight:700;cursor:pointer}' +
    '.bmv-c{padding:4px 6px 8px}.bmv-c svg{display:block;width:100%;height:auto;overflow:visible}' +
    '.bmv-lg{display:flex;flex-wrap:wrap;gap:4px 12px;padding:0 12px 10px;font-size:12px}.bmv-lg i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:5px;vertical-align:-1px}' +
    '.bmv-tip{position:absolute;pointer-events:none;background:rgba(20,20,22,.92);color:#fff;font-size:12px;padding:5px 8px;border-radius:8px;white-space:nowrap;transform:translate(-50%,-115%);z-index:3}' +
    '.bmv-k{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px;padding:6px 12px 12px}' +
    '.bmv-k div{border:1px solid var(--bmv-bd,rgba(127,127,127,.22));border-radius:12px;padding:9px 10px}.bmv-k span{display:block;font-size:12px;opacity:.7}' +
    '.bmv-k b{display:block;font-size:17px;margin-top:2px;font-variant-numeric:tabular-nums;word-break:break-word}.bmv-k small{display:block;font-size:11.5px;opacity:.65;margin-top:2px}' +
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

  /* ---------- grafik garis / batang ---------- */
  function chart(v) {
    var PAL = palette(), labels = (v.label || []).map(String), seri = (v.seri || []).filter(function (s) { return s && Array.isArray(s.nilai); }), rp = v.satuan === 'rp';
    var W = 640, H = 300, L = 62, R = 14, T = 14, B = 46, iw = W - L - R, ih = H - T - B, n = labels.length;
    var all = []; seri.forEach(function (s) { s.nilai.forEach(function (x) { if (isFinite(+x)) all.push(+x); }); });
    var mx = nice(Math.max.apply(null, all.concat([0]))), mn = Math.min.apply(null, all.concat([0])); mn = mn < 0 ? -nice(-mn) : 0;
    var y = function (val) { return T + ih - (val - mn) / (mx - mn || 1) * ih; };
    var svg = sv('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': v.judul || 'Grafik', 'font-family': 'inherit', 'font-size': '12' });
    for (var g = 0; g <= 4; g++) {
      var val = mn + (mx - mn) * g / 4, yy = y(val);
      svg.appendChild(sv('line', { x1: L, x2: W - R, y1: yy, y2: yy, stroke: 'currentColor', 'stroke-opacity': g ? .12 : .35 }));
      var tl = sv('text', { x: L - 8, y: yy + 4, 'text-anchor': 'end', fill: 'currentColor', 'fill-opacity': .65 }); tl.textContent = short(val, rp); svg.appendChild(tl);
    }
    var step = Math.max(1, Math.ceil(n / 8)), slot = iw / Math.max(n, 1);
    labels.forEach(function (lb, i) {
      if (i % step && i !== n - 1) return;
      var t = sv('text', { x: L + slot * (i + .5), y: H - B + 18, 'text-anchor': 'middle', fill: 'currentColor', 'fill-opacity': .7 }); t.textContent = lb.length > 10 ? lb.slice(0, 9) + '…' : lb; svg.appendChild(t);
    });
    var hits = [];
    if (v.jenis === 'batang') {
      var bw = Math.max(3, Math.min(42, slot * .8 / Math.max(seri.length, 1)));
      seri.forEach(function (s, si) {
        s.nilai.forEach(function (x, i) {
          x = +x || 0; var x0 = L + slot * (i + .5) - bw * seri.length / 2 + bw * si, y0 = y(Math.max(x, 0)), y1 = y(Math.min(x, 0));
          var r = sv('rect', { x: x0 + .5, y: y0, width: bw - 1, height: Math.max(1, y1 - y0), rx: 3, fill: PAL[si % PAL.length] }); svg.appendChild(r);
          hits.push({ x: x0 + bw / 2, y: y0, t: labels[i] + ' · ' + (s.nama ? s.nama + ': ' : '') + fmt(x, rp) });
        });
      });
    } else {
      seri.forEach(function (s, si) {
        var pts = s.nilai.map(function (x, i) { return [L + slot * (i + .5), y(+x || 0), +x || 0, i]; });
        if (seri.length === 1 && pts.length > 1) {
          var area = 'M' + pts[0][0] + ',' + y(Math.max(mn, 0)) + ' ' + pts.map(function (p) { return 'L' + p[0] + ',' + p[1]; }).join(' ') + ' L' + pts[pts.length - 1][0] + ',' + y(Math.max(mn, 0)) + 'Z';
          svg.appendChild(sv('path', { d: area, fill: PAL[0], 'fill-opacity': .12 }));
        }
        svg.appendChild(sv('path', { d: pts.map(function (p, k) { return (k ? 'L' : 'M') + p[0] + ',' + p[1]; }).join(' '), fill: 'none', stroke: PAL[si % PAL.length], 'stroke-width': 2.5, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
        pts.forEach(function (p) {
          if (pts.length <= 40) svg.appendChild(sv('circle', { cx: p[0], cy: p[1], r: 3.2, fill: PAL[si % PAL.length] }));
          hits.push({ x: p[0], y: p[1], t: labels[p[3]] + ' · ' + (s.nama ? s.nama + ': ' : '') + fmt(p[2], rp) });
        });
      });
    }
    var box = el('div', 'bmv'), body = el('div', 'bmv-c'); body.style.position = 'relative';
    box.appendChild(head(v, function () { svgToPng(svg, W, H, isDark() ? '#151517' : '#ffffff', v.judul); }));
    body.appendChild(svg); box.appendChild(body);
    if (seri.length > 1 || (seri[0] && seri[0].nama)) {
      var lg = el('div', 'bmv-lg');
      seri.forEach(function (s, si) { var it = el('span'), sw = el('i'); sw.style.background = PAL[si % PAL.length]; it.append(sw, document.createTextNode(s.nama || ('Seri ' + (si + 1)))); lg.appendChild(it); });
      box.appendChild(lg);
    }
    /* sentuh/arahkan: tampilkan nilai titik terdekat */
    var tip = el('div', 'bmv-tip'); tip.hidden = true; body.appendChild(tip);
    function near(ev) {
      var r = svg.getBoundingClientRect(), sx = (ev.clientX - r.left) / r.width * W, best = null, bd = 1e9;
      hits.forEach(function (h) { var d = Math.abs(h.x - sx); if (d < bd) { bd = d; best = h; } });
      if (!best || bd > slot) { tip.hidden = true; return; }
      tip.hidden = false; tip.textContent = best.t; tip.style.left = (best.x / W * r.width + 6) + 'px'; tip.style.top = (best.y / H * r.height + 4) + 'px';
    }
    svg.addEventListener('pointermove', near); svg.addEventListener('pointerdown', near); svg.addEventListener('pointerleave', function () { tip.hidden = true; });
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
    var bridge = '<script>(function(){function png(){var c=document.querySelector("canvas");if(c){try{return c.toDataURL("image/png")}catch(e){}}var s=document.querySelector("svg");if(!s)return Promise.resolve("");' +
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

  window.BMVisual = {
    render: function (v) {
      addCss();
      if (!v || typeof v !== 'object') return el('div');
      if (v.tipe === 'grafik') return chart(v);
      if (v.tipe === 'kartu') return cards(v);
      if (v.tipe === 'gambar') return drawing(v);
      return el('div');
    }
  };
})();
