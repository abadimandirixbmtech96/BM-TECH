/*!
 * bm-jarvis.js — asisten AI "Jarvis" (suara + teks) untuk dashboard-admin.html
 *
 * Muat SETELAH klien Supabase dibuat:   <script src="/bm-jarvis.js" defer></script>
 *
 *  - Tombol melayang (bisa digeser) -> panel chat. Mic = bicara; ketik = teks.
 *  - Semua "otak" ada di server (/api/jarvis). Di sini TIDAK ada kunci Gemini.
 *  - Progres langsung: tiap langkah ("Mencari…", "12 data ditemukan") tampil saat server bekerja.
 *  - Jawaban berformat (judul, butir, tabel) + tombol Unduh PDF / Salin.
 *  - Jarvis hanya MENGUSULKAN perubahan data; admin wajib menekan "Setuju" di layar.
 *  - Semua teks dirender lewat textContent / DOM (tanpa innerHTML dari data) -> aman dari XSS.
 */
(function () {
  'use strict';
  var inHub = window.name === 'bm-dash-hub';                        // Dashboard yang tertanam di halaman Profil (aplikasi terpasang)
  if (window.BMJarvis || (window.parent !== window && !inHub)) return;   // tidak di dalam iframe editor/panel lain
  /* di dalam Profil, Dashboard dimuat tersembunyi di belakang layar: Jarvis (terutama mikrofon) hanya aktif saat Dashboard terlihat */
  function isActive() {
    if (!inHub) return document.visibilityState === 'visible';
    try { var f = window.frameElement; return document.visibilityState === 'visible' && !!f && f.getAttribute('aria-hidden') !== 'true'; } catch (e) { return false; }
  }

  var API = '/api/jarvis';
  var LS_VOICE = 'bm-jarvis-voice', LS_WAKE = 'bm-jarvis-wake';
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  var canSpeak = 'speechSynthesis' in window;
  var history = [];
  var busy = false, listening = false, wakeOn = false, voiceOut = true, rec = null, wakeRec = null, sheetOpen = false;

  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) {} return null; }
  voiceOut = ls(LS_VOICE) !== '0';
  wakeOn = ls(LS_WAKE) === '1' && !!SR;

  var LANGS = { id: 'id-ID', en: 'en-US', ms: 'ms-MY', zh: 'zh-CN', hi: 'hi-IN', es: 'es-ES', ar: 'ar-SA', fr: 'fr-FR', pt: 'pt-BR', ru: 'ru-RU', ja: 'ja-JP' };
  function speechLang() { return LANGS[ls('bm-lang')] || 'id-ID'; }

  /* ---------- gaya ---------- */
  var css = '\
#bmj-fab{position:fixed;right:16px;bottom:calc(96px + env(safe-area-inset-bottom,0px));touch-action:none;z-index:2000;width:52px;height:52px;border-radius:50%;border:1px solid rgba(var(--accent-rgb,240,165,41),.55);background:radial-gradient(circle at 30% 30%,rgba(var(--accent-rgb,240,165,41),.35),rgba(18,18,20,.92));color:var(--accent-yellow,#F0A529);display:flex;align-items:center;justify-content:center;box-shadow:0 6px 22px rgba(0,0,0,.45),0 0 18px var(--accent-yellow-glow,rgba(240,165,41,.28));cursor:pointer;-webkit-tap-highlight-color:transparent;transition:transform .15s}\
#bmj-fab:active{transform:scale(.9)}#bmj-fab svg{width:26px;height:26px}\
#bmj-fab.bmj-hot{animation:bmjPulse 1.2s infinite}\
@keyframes bmjPulse{0%{box-shadow:0 0 0 0 rgba(var(--accent-rgb,240,165,41),.6)}100%{box-shadow:0 0 0 18px rgba(var(--accent-rgb,240,165,41),0)}}\
#bmj-ov{position:fixed;inset:0;z-index:2001;background:rgba(0,0,0,.5);opacity:0;pointer-events:none;transition:opacity .2s}\
#bmj-ov.on{opacity:1;pointer-events:auto}\
#bmj-sheet{position:fixed;left:0;right:0;bottom:0;z-index:2002;max-height:88vh;height:88vh;display:flex;flex-direction:column;background:var(--card-surface-dark,#121214);color:var(--text-primary,#fff);border-radius:22px 22px 0 0;border:1px solid var(--card-border-dark,rgba(255,255,255,.08));transform:translateY(105%);transition:transform .28s cubic-bezier(.2,.8,.2,1);font-family:inherit;max-width:720px;margin:0 auto;padding-bottom:env(safe-area-inset-bottom,0px)}\
#bmj-sheet.on{transform:translateY(0)}\
.bmj-h{display:flex;align-items:center;gap:8px;padding:14px 14px 10px}\
.bmj-h b{flex:1;font-size:16px;letter-spacing:.14em}.bmj-h b i{font-style:normal;color:var(--accent-yellow,#F0A529)}\
.bmj-ib{width:34px;height:34px;border-radius:50%;border:1px solid var(--glass-pill-border,rgba(255,255,255,.12));background:var(--glass-pill-bg,rgba(255,255,255,.09));color:var(--text-secondary,#aaa);display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:11px;font-weight:700}\
.bmj-ib.on{color:var(--on-accent,#1C1B19);background:var(--accent-yellow,#F0A529)}\
.bmj-ib svg{width:17px;height:17px}\
#bmj-log{flex:1;overflow-y:auto;padding:4px 14px 8px;display:flex;flex-direction:column;gap:10px;-webkit-overflow-scrolling:touch}\
.bmj-m{max-width:86%;padding:9px 13px;border-radius:16px;font-size:14px;line-height:1.5;white-space:pre-wrap;word-break:break-word}\
.bmj-u{align-self:flex-end;background:var(--accent-yellow,#F0A529);color:var(--on-accent,#1C1B19);border-bottom-right-radius:5px}\
.bmj-a{align-self:flex-start;background:var(--glass-pill-bg,rgba(255,255,255,.09));border-bottom-left-radius:5px}\
.bmj-s{align-self:center;font-size:12px;color:var(--text-secondary,#8a8a90);text-align:center}\
/* kartu jawaban + progres */\
.bmj-r{align-self:stretch;max-width:100%;display:flex;flex-direction:column;gap:8px}\
.bmj-steps{border:1px solid var(--glass-pill-border,rgba(255,255,255,.12));border-radius:14px;background:var(--glass-pill-bg,rgba(255,255,255,.05));overflow:hidden;font-size:13px}\
.bmj-sh{display:flex;align-items:center;gap:9px;padding:9px 12px;cursor:pointer;-webkit-tap-highlight-color:transparent}\
.bmj-sh .t{flex:1;min-width:0}.bmj-sh .c{opacity:.55;font-size:11px;transition:transform .2s}.bmj-steps.open .c{transform:rotate(180deg)}\
.bmj-sl{display:none;padding:0 12px 9px 12px;flex-direction:column;gap:7px}.bmj-steps.open .bmj-sl,.bmj-steps.live .bmj-sl{display:flex}\
.bmj-st{display:flex;gap:9px;align-items:flex-start;line-height:1.35;animation:bmjIn .25s ease}\
.bmj-st .x{flex:1;min-width:0}.bmj-st .x small{display:block;color:var(--text-secondary,#8a8a90);font-size:12px;margin-top:1px}\
@keyframes bmjIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}\
.bmj-ic{flex:0 0 16px;width:16px;height:16px;margin-top:1px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800}\
.bmj-ic.run{border:2px solid rgba(var(--accent-rgb,240,165,41),.25);border-top-color:var(--accent-yellow,#F0A529);border-radius:50%;animation:bmjSpin .7s linear infinite}\
.bmj-ic.ok{color:#2fb36b}.bmj-ic.err{color:#e5484d}\
@keyframes bmjSpin{to{transform:rotate(360deg)}}\
.bmj-ans{background:var(--glass-pill-bg,rgba(255,255,255,.09));border-radius:16px;border-bottom-left-radius:5px;padding:11px 13px;font-size:14px;line-height:1.55;word-break:break-word}\
.bmj-ans>*:first-child{margin-top:0}.bmj-ans>*:last-child{margin-bottom:0}\
.bmj-ans h3{font-size:15px;margin:10px 0 6px;font-weight:800}\
.bmj-ans p{margin:6px 0}.bmj-ans ul,.bmj-ans ol{margin:6px 0;padding-left:20px}.bmj-ans li{margin:2px 0}\
.bmj-tw{margin:9px -4px;border:1px solid var(--glass-pill-border,rgba(255,255,255,.14));border-radius:11px;overflow:auto;max-height:340px;-webkit-overflow-scrolling:touch}\
.bmj-tw table{border-collapse:collapse;width:100%;font-size:12.5px;white-space:nowrap}\
.bmj-tw th{position:sticky;top:0;background:rgba(var(--accent-rgb,240,165,41),.92);color:var(--on-accent,#1C1B19);text-align:left;font-weight:800;padding:7px 10px}\
.bmj-tw td{padding:6px 10px;border-top:1px solid var(--glass-pill-border,rgba(255,255,255,.1))}\
.bmj-tw tr:nth-child(even) td{background:rgba(127,127,127,.07)}\
.bmj-tw .n{text-align:right;font-variant-numeric:tabular-nums}\
.bmj-acts{display:flex;gap:8px;flex-wrap:wrap}\
.bmj-acts button{display:inline-flex;align-items:center;gap:6px;padding:8px 14px;border-radius:999px;border:1px solid var(--glass-pill-border,rgba(255,255,255,.16));background:var(--glass-pill-bg,rgba(255,255,255,.09));color:inherit;font:inherit;font-size:13px;font-weight:700;cursor:pointer}\
.bmj-acts button.pri{background:var(--accent-yellow,#F0A529);color:var(--on-accent,#1C1B19);border-color:transparent}.bmj-acts button:disabled{opacity:.55}\
.bmj-acts svg{width:15px;height:15px}\
.bmj-p{align-self:stretch;border:1px solid rgba(var(--accent-rgb,240,165,41),.6);border-radius:14px;padding:11px 12px;font-size:13px;background:rgba(var(--accent-rgb,240,165,41),.08)}\
.bmj-p b{display:block;margin-bottom:6px;font-size:13.5px}\
.bmj-p dl{margin:0 0 9px;display:grid;grid-template-columns:auto 1fr;gap:3px 10px}.bmj-p dt{color:var(--text-secondary,#8a8a90)}.bmj-p dd{margin:0;word-break:break-word}\
.bmj-pb{display:flex;gap:8px}.bmj-pb button{flex:1;padding:9px;border-radius:11px;border:1px solid var(--glass-pill-border,rgba(255,255,255,.14));background:var(--glass-pill-bg,rgba(255,255,255,.09));color:inherit;font:inherit;font-weight:700;cursor:pointer}\
.bmj-pb button.ok{background:var(--accent-yellow,#F0A529);color:var(--on-accent,#1C1B19);border-color:transparent}.bmj-pb button:disabled{opacity:.5}\
.bmj-f{display:flex;align-items:center;gap:8px;padding:10px 12px 12px}\
#bmj-in{flex:1;min-width:0;border-radius:22px;border:1px solid var(--glass-pill-border,rgba(255,255,255,.14));background:var(--glass-pill-bg,rgba(255,255,255,.07));color:inherit;font:inherit;font-size:16px;padding:10px 15px;outline:none}\
#bmj-mic{width:44px;height:44px;flex:0 0 44px;border-radius:50%;border:0;background:var(--accent-yellow,#F0A529);color:var(--on-accent,#1C1B19);display:flex;align-items:center;justify-content:center;cursor:pointer}\
#bmj-mic svg{width:22px;height:22px}#bmj-mic.rec{animation:bmjPulse 1s infinite;background:#e5484d;color:#fff}\
#bmj-send{width:40px;height:40px;flex:0 0 40px;border-radius:50%;border:1px solid var(--glass-pill-border,rgba(255,255,255,.14));background:transparent;color:var(--accent-yellow,#F0A529);display:flex;align-items:center;justify-content:center;cursor:pointer}\
#bmj-send svg{width:19px;height:19px}\
.bmj-chips{display:flex;gap:7px;flex-wrap:wrap;justify-content:center;padding:2px 0}\
.bmj-chips button{padding:7px 12px;border-radius:999px;border:1px solid var(--glass-pill-border,rgba(255,255,255,.16));background:transparent;color:inherit;font:inherit;font-size:12.5px;cursor:pointer}\
body.theme-light #bmj-sheet{background:#fff;color:#111}body.theme-light .bmj-a,body.theme-light .bmj-ans{background:rgba(0,0,0,.07)}body.theme-light #bmj-in{color:#111}';

  var ICON_BOT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.2"/><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21"/></svg>';
  var ICON_MIC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>';
  var ICON_SEND = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2 11 13M22 2l-7 20-4-9-9-4z"/></svg>';
  var ICON_SPK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4zM15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/></svg>';
  var ICON_PDF = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M7 11l5 5 5-5M4 20h16"/></svg>';
  var ICON_COPY = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h8"/></svg>';

  var el = {};
  function mk(tag, id, cls, html) { var e = document.createElement(tag); if (id) e.id = id; if (cls) e.className = cls; if (html) e.innerHTML = html; return e; }   // html hanya utk ikon/markup statis kita sendiri
  function tx(tag, cls, text) { var e = mk(tag, '', cls); e.textContent = text; return e; }

  /* ---------- kerangka ---------- */
  function build() {
    var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    el.fab = mk('button', 'bmj-fab', '', ICON_BOT); el.fab.setAttribute('aria-label', 'Jarvis');
    el.ov = mk('div', 'bmj-ov');
    el.sheet = mk('div', 'bmj-sheet');
    var h = mk('div', '', 'bmj-h');
    var t = mk('b', '', '', 'JARV<i>I</i>S');
    el.spk = mk('button', '', 'bmj-ib', ICON_SPK); el.spk.title = 'Suara jawaban';
    el.wake = mk('button', '', 'bmj-ib', 'HAI'); el.wake.title = 'Mode "Hai Jarvis" (mendengarkan terus)';
    el.close = mk('button', '', 'bmj-ib', '✕'); el.close.title = 'Tutup';
    h.append(t, el.spk, el.wake, el.close);
    el.log = mk('div', 'bmj-log'); el.log.setAttribute('aria-live', 'polite');
    var f = mk('div', '', 'bmj-f');
    el.in = mk('input', 'bmj-in'); el.in.type = 'text'; el.in.placeholder = 'Ketik atau bicara…'; el.in.autocomplete = 'off'; el.in.maxLength = 1500; el.in.enterKeyHint = 'send';
    el.mic = mk('button', 'bmj-mic', '', ICON_MIC); el.mic.setAttribute('aria-label', 'Bicara');
    el.send = mk('button', 'bmj-send', '', ICON_SEND); el.send.setAttribute('aria-label', 'Kirim');
    f.append(el.in, el.send, el.mic);
    el.sheet.append(h, el.log, f);
    document.body.append(el.fab, el.ov, el.sheet);

    /* tombol bisa digeser (tahan & seret); posisi diingat per perangkat */
    try { var pos = JSON.parse(ls('bm-jarvis-pos') || 'null'); if (pos) { el.fab.style.left = Math.min(pos.x, innerWidth - 56) + 'px'; el.fab.style.top = Math.min(pos.y, innerHeight - 56) + 'px'; el.fab.style.right = 'auto'; el.fab.style.bottom = 'auto'; } } catch (e) {}
    var drag = null, moved = false;
    el.fab.addEventListener('pointerdown', function (e) { var r = el.fab.getBoundingClientRect(); drag = { dx: e.clientX - r.left, dy: e.clientY - r.top, sx: e.clientX, sy: e.clientY }; moved = false; try { el.fab.setPointerCapture(e.pointerId); } catch (x) {} });
    el.fab.addEventListener('pointermove', function (e) {
      if (!drag) return;
      if (!moved && Math.abs(e.clientX - drag.sx) + Math.abs(e.clientY - drag.sy) < 8) return;
      moved = true;
      var x = Math.max(4, Math.min(innerWidth - 56, e.clientX - drag.dx)), y = Math.max(4, Math.min(innerHeight - 56, e.clientY - drag.dy));
      el.fab.style.left = x + 'px'; el.fab.style.top = y + 'px'; el.fab.style.right = 'auto'; el.fab.style.bottom = 'auto';
    });
    el.fab.addEventListener('pointerup', function () {
      if (drag && moved) { var r = el.fab.getBoundingClientRect(); ls('bm-jarvis-pos', JSON.stringify({ x: Math.round(r.left), y: Math.round(r.top) })); }
      else if (drag) openSheet();
      drag = null;
    });
    el.fab.addEventListener('pointercancel', function () { drag = null; });
    el.ov.onclick = el.close.onclick = closeSheet;
    el.send.onclick = function () { submit(el.in.value); };
    el.in.onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); submit(el.in.value); } };
    el.mic.onclick = function () { listening ? stopListen() : startListen(); };
    el.spk.onclick = function () { voiceOut = !voiceOut; ls(LS_VOICE, voiceOut ? '1' : '0'); if (!voiceOut) stopSpeak(); paintToggles(); };
    el.wake.onclick = function () {
      if (!SR) { say('s', 'Browser ini tidak mendukung pengenalan suara. Pakai Chrome/Edge/Safari terbaru.'); return; }
      wakeOn = !wakeOn; ls(LS_WAKE, wakeOn ? '1' : '0'); paintToggles();
      if (wakeOn) { say('s', 'Mode "Hai Jarvis" aktif selama halaman ini terbuka di layar. Ucapkan: "Jarvis, buka buku besar".'); startWake(); } else stopWake();
    };
    if (!SR) el.mic.style.opacity = '.45';
    paintToggles();
    welcome();
    if (wakeOn) startWake();
  }
  function welcome() {
    say('s', 'Halo, saya Jarvis. Saya membaca seluruh catatan bengkel dan setiap perubahan data meminta persetujuanmu dulu.');
    var box = mk('div', '', 'bmj-chips');
    ['Rangkum transaksi minggu ini', 'Siapa customer terbanyak?', 'Total harga Buku Besar bulan ini', 'Buka buku besar'].forEach(function (q) {
      var b = mk('button'); b.textContent = q; b.onclick = function () { box.remove(); submit(q); }; box.appendChild(b);
    });
    el.log.appendChild(box);
  }
  function paintToggles() {
    el.spk.classList.toggle('on', voiceOut); el.wake.classList.toggle('on', wakeOn);
    el.spk.style.display = canSpeak ? '' : 'none';
    el.fab.classList.toggle('bmj-hot', wakeOn && !sheetOpen);
  }
  function openSheet() { sheetOpen = true; el.ov.classList.add('on'); el.sheet.classList.add('on'); paintToggles(); setTimeout(function () { el.log.scrollTop = el.log.scrollHeight; }, 50); }
  function closeSheet() { sheetOpen = false; el.ov.classList.remove('on'); el.sheet.classList.remove('on'); stopListen(); stopSpeak(); paintToggles(); }
  function toBottom() { el.log.scrollTop = el.log.scrollHeight; }

  function say(kind, text) {
    var d = mk('div', '', 'bmj-m ' + (kind === 'u' ? 'bmj-u' : kind === 'a' ? 'bmj-a' : 'bmj-s'));
    d.textContent = text; el.log.appendChild(d); toBottom(); return d;
  }

  /* ---------- penampil jawaban berformat (judul, butir, tabel) ---------- */
  function inline(parent, text) {
    String(text).split(/(\*\*[^*]+\*\*)/).forEach(function (part) {
      if (!part) return;
      if (/^\*\*[^*]+\*\*$/.test(part)) parent.appendChild(tx('b', '', part.slice(2, -2)));
      else parent.appendChild(document.createTextNode(part.replace(/`/g, '')));
    });
  }
  function splitRow(line) { var c = line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|'); return c.map(function (x) { return x.trim(); }); }
  function parseBlocks(text) {
    var lines = String(text || '').replace(/\r/g, '').split('\n'), out = [], i = 0, m;
    while (i < lines.length) {
      var ln = lines[i];
      if (!ln.trim()) { i++; continue; }
      if (/^\s*\|.*\|\s*$/.test(ln)) {
        var rows = [];
        while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) { if (!/^[\s|:\-]+$/.test(lines[i])) rows.push(splitRow(lines[i])); i++; }
        if (rows.length) out.push({ t: 'table', head: rows[0], rows: rows.slice(1) });
        continue;
      }
      if ((m = ln.match(/^\s*#{1,4}\s+(.*)$/))) { out.push({ t: 'h', text: m[1] }); i++; continue; }
      if (/^\s*[-*•]\s+/.test(ln)) { var it = []; while (i < lines.length && /^\s*[-*•]\s+/.test(lines[i])) { it.push(lines[i].replace(/^\s*[-*•]\s+/, '')); i++; } out.push({ t: 'ul', items: it }); continue; }
      if (/^\s*\d+[.)]\s+/.test(ln)) { var io = []; while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) { io.push(lines[i].replace(/^\s*\d+[.)]\s+/, '')); i++; } out.push({ t: 'ol', items: io }); continue; }
      var para = [];
      while (i < lines.length && lines[i].trim() && !/^\s*(\||#{1,4}\s|[-*•]\s|\d+[.)]\s)/.test(lines[i])) { para.push(lines[i].trim()); i++; }
      out.push({ t: 'p', text: para.join(' ') });
    }
    return out;
  }
  function renderBlocks(box, blocks) {
    blocks.forEach(function (b) {
      if (b.t === 'h') { var h = mk('h3'); inline(h, b.text); box.appendChild(h); }
      else if (b.t === 'p') { var p = mk('p'); inline(p, b.text); box.appendChild(p); }
      else if (b.t === 'ul' || b.t === 'ol') { var l = mk(b.t); b.items.forEach(function (x) { var li = mk('li'); inline(li, x); l.appendChild(li); }); box.appendChild(l); }
      else if (b.t === 'table') {
        var w = mk('div', '', 'bmj-tw'), tb = mk('table'), th = mk('thead'), tr = mk('tr');
        b.head.forEach(function (c) { tr.appendChild(tx('th', '', c.replace(/\*\*/g, ''))); }); th.appendChild(tr); tb.appendChild(th);
        var tbd = mk('tbody');
        b.rows.forEach(function (r) {
          var rr = mk('tr');
          for (var k = 0; k < b.head.length; k++) { var v = (r[k] == null ? '' : r[k]).replace(/\*\*/g, ''); rr.appendChild(tx('td', /^(Rp\s?)?-?[\d.,]+%?$/.test(v) ? 'n' : '', v)); }
          tbd.appendChild(rr);
        });
        tb.appendChild(tbd); w.appendChild(tb); box.appendChild(w);
      }
    });
  }
  function plainOf(blocks) {
    return blocks.map(function (b) {
      if (b.t === 'table') return [b.head.join('\t')].concat(b.rows.map(function (r) { return r.join('\t'); })).join('\n').replace(/\*\*/g, '');
      if (b.t === 'ul' || b.t === 'ol') return b.items.map(function (x, i) { return (b.t === 'ol' ? (i + 1) + '. ' : '- ') + x; }).join('\n').replace(/\*\*/g, '');
      return String(b.text).replace(/\*\*/g, '');
    }).join('\n\n');
  }

  /* ---------- PDF (jsPDF + autoTable; sudah dimuat dashboard dari cdnjs) ---------- */
  function loadScript(src) {
    return new Promise(function (ok, no) { var s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = function () { no(new Error('gagal memuat ' + src)); }; document.head.appendChild(s); });
  }
  async function ensurePdfLibs() {
    if (!(window.jspdf && window.jspdf.jsPDF)) await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
    var d = new window.jspdf.jsPDF();
    if (typeof d.autoTable !== 'function') await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js');
    return window.jspdf.jsPDF;
  }
  function pdfText(s) {   // font bawaan PDF hanya Latin-1: ganti tanda kutip/ellipsis, buang karakter di luar itu
    return String(s == null ? '' : s).replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/…/g, '...').replace(/[–—]/g, '-').replace(/\*\*/g, '').replace(/[^\x09\x0A\x20-\x7E -ÿ•]/g, '');
  }
  function stamp() { var d = new Date(Date.now() + 7 * 3600e3); return d.toISOString().slice(0, 16); }
  async function makePdf(blocks, question) {
    var JsPDF = await ensurePdfLibs();
    var wide = blocks.some(function (b) { return b.t === 'table' && b.head.length > 5; });
    var doc = new JsPDF({ orientation: wide ? 'landscape' : 'portrait', unit: 'pt', format: 'a4' });
    var W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 40, y = 0;
    var title = (blocks.filter(function (b) { return b.t === 'h'; })[0] || {}).text || question || 'Laporan';
    doc.setFillColor(240, 165, 41); doc.rect(0, 0, W, 6, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.setTextColor(28, 27, 25); doc.text('BM-TECH', M, 44);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(110); doc.text('Laporan Jarvis  |  ' + stamp().replace('T', ' ') + ' WIB', M, 58);
    doc.setDrawColor(220); doc.line(M, 68, W - M, 68);
    y = 92; doc.setTextColor(28, 27, 25); doc.setFont('helvetica', 'bold'); doc.setFontSize(14);
    var tl = doc.splitTextToSize(pdfText(title), W - 2 * M); doc.text(tl, M, y); y += tl.length * 17 + 4;
    if (question && pdfText(question) !== pdfText(title)) { doc.setFont('helvetica', 'italic'); doc.setFontSize(9); doc.setTextColor(120); var ql = doc.splitTextToSize('Permintaan: ' + pdfText(question), W - 2 * M); doc.text(ql, M, y); y += ql.length * 12 + 6; }
    function room(n) { if (y + n > H - 50) { doc.addPage(); y = 50; } }
    blocks.forEach(function (b, bi) {
      doc.setTextColor(28, 27, 25);
      if (b.t === 'h') { if (b.text === title && bi === blocks.indexOf(blocks.filter(function (x) { return x.t === 'h'; })[0])) return; room(30); doc.setFont('helvetica', 'bold'); doc.setFontSize(12); var l = doc.splitTextToSize(pdfText(b.text), W - 2 * M); doc.text(l, M, y + 10); y += l.length * 15 + 8; }
      else if (b.t === 'p') { doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5); var l2 = doc.splitTextToSize(pdfText(b.text), W - 2 * M); room(l2.length * 14 + 6); doc.text(l2, M, y + 10); y += l2.length * 14 + 6; }
      else if (b.t === 'ul' || b.t === 'ol') { doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5); b.items.forEach(function (x, i) { var l3 = doc.splitTextToSize(pdfText(x), W - 2 * M - 16); room(l3.length * 14 + 2); doc.text(b.t === 'ol' ? (i + 1) + '.' : '•', M + 2, y + 10); doc.text(l3, M + 16, y + 10); y += l3.length * 14 + 2; }); y += 4; }
      else if (b.t === 'table') {
        room(60);
        doc.autoTable({ startY: y + 4, head: [b.head.map(pdfText)], body: b.rows.map(function (r) { return b.head.map(function (_, k) { return pdfText(r[k]); }); }), theme: 'grid', margin: { left: M, right: M, bottom: 50 },
          styles: { font: 'helvetica', fontSize: 9, cellPadding: 4, lineColor: [225, 225, 225], textColor: [28, 27, 25] }, headStyles: { fillColor: [240, 165, 41], textColor: [28, 27, 25], fontStyle: 'bold' }, alternateRowStyles: { fillColor: [247, 245, 240] },
          didParseCell: function (d) { if (d.section === 'body' && /^(Rp\s?)?-?[\d.,]+%?$/.test(String(d.cell.raw))) d.cell.styles.halign = 'right'; } });
        y = doc.lastAutoTable.finalY + 10;
      }
    });
    var n = doc.internal.getNumberOfPages();
    for (var i = 1; i <= n; i++) { doc.setPage(i); doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(140); doc.text('Dibuat oleh Jarvis - BM-TECH', M, H - 24); doc.text('Halaman ' + i + ' / ' + n, W - M, H - 24, { align: 'right' }); }
    doc.save('BM-TECH-Jarvis-' + stamp().replace(/[-:T]/g, '').slice(0, 12) + '.pdf');
  }

  /* ---------- kartu progres ---------- */
  function newReply() {
    var wrap = mk('div', '', 'bmj-r');
    var steps = mk('div', '', 'bmj-steps live');
    var head = mk('div', '', 'bmj-sh'), spin = mk('span', '', 'bmj-ic run'), ht = tx('span', 't', 'Memulai…'), ch = tx('span', 'c', '▼');
    head.append(spin, ht, ch);
    var list = mk('div', '', 'bmj-sl');
    steps.append(head, list); wrap.appendChild(steps);
    head.onclick = function () { if (!steps.classList.contains('live')) steps.classList.toggle('open'); };
    el.log.appendChild(wrap); toBottom();
    return { wrap: wrap, steps: steps, head: head, spin: spin, ht: ht, list: list, rows: {}, count: 0, t0: Date.now(), last: Date.now() };
  }
  function setStatus(R, text) { R.ht.textContent = text; R.last = Date.now(); }
  function onStep(R, ev) {
    R.last = Date.now();
    var row = R.rows[ev.id];
    if (!row) {
      var r = mk('div', '', 'bmj-st'), ic = mk('span', '', 'bmj-ic run'), x = mk('div', '', 'x'), t = tx('div', '', ev.text), sub = mk('small');
      x.append(t, sub); r.append(ic, x); R.list.appendChild(r); row = R.rows[ev.id] = { ic: ic, t: t, sub: sub }; R.count++;
    }
    if (ev.state === 'run') { row.t.textContent = ev.text; setStatus(R, ev.text + '…'); }
    else { row.ic.className = 'bmj-ic ' + ev.state; row.ic.textContent = ev.state === 'ok' ? '✓' : '✗'; row.sub.textContent = ev.text; setStatus(R, ev.text); }
    toBottom();
  }
  function finishSteps(R, ok) {
    R.steps.classList.remove('live'); R.spin.className = 'bmj-ic ' + (ok ? 'ok' : 'err'); R.spin.textContent = ok ? '✓' : '✗';
    var sec = Math.max(1, Math.round((Date.now() - R.t0) / 1000));
    if (!R.count) { R.steps.style.display = 'none'; return; }
    R.ht.textContent = (ok ? 'Selesai' : 'Terhenti') + ' · ' + R.count + ' langkah · ' + sec + ' dtk';
  }

  /* ---------- suara masuk ---------- */
  function mkRec(continuous) {
    var r = new SR(); r.lang = speechLang(); r.interimResults = !continuous; r.continuous = !!continuous; r.maxAlternatives = 1; return r;
  }
  function startListen() {
    if (!SR) { say('s', 'Browser ini tidak mendukung pengenalan suara — silakan ketik.'); return; }
    if (busy) return;
    stopSpeak(); pauseWake();
    rec = mkRec(false);
    var finalText = '';
    rec.onresult = function (e) {
      var s = ''; for (var i = 0; i < e.results.length; i++) { s += e.results[i][0].transcript; if (e.results[i].isFinal) finalText = s; }
      el.in.value = s;
    };
    rec.onerror = function (e) { if (e.error === 'not-allowed' || e.error === 'service-not-allowed') say('s', 'Izin mikrofon ditolak. Aktifkan di pengaturan situs browser.'); };
    rec.onend = function () { listening = false; el.mic.classList.remove('rec'); rec = null; var t = (finalText || el.in.value || '').trim(); if (t) submit(t); else resumeWake(); };
    try { rec.start(); listening = true; el.mic.classList.add('rec'); el.in.placeholder = 'Mendengarkan…'; } catch (e) { listening = false; }
  }
  function stopListen() { if (rec) { try { rec.stop(); } catch (e) {} } listening = false; el.mic && el.mic.classList.remove('rec'); if (el.in) el.in.placeholder = 'Ketik atau bicara…'; }

  /* ---------- mode "Hai Jarvis" ---------- */
  var wakePaused = false, wakeStopped = true;
  function startWake() {
    if (!SR || !wakeOn || !isActive()) return;
    wakeStopped = false; wakePaused = false;
    if (wakeRec) return;
    wakeRec = mkRec(true);
    wakeRec.onresult = function (e) {
      for (var i = e.resultIndex; i < e.results.length; i++) {
        if (!e.results[i].isFinal) continue;
        var t = e.results[i][0].transcript.trim(), m = t.match(/\b(?:hai |hey |hei |hi |ok |oke )?(?:jarvis|jarwis|jarpis|harvis)\b[\s,.:!?-]*(.*)$/i);
        if (!m) continue;
        openSheet();
        if (m[1] && m[1].trim().length > 1) { el.in.value = m[1].trim(); submit(m[1].trim()); }
        else { say('s', 'Ya? Silakan bicara…'); setTimeout(startListen, 150); }
      }
    };
    wakeRec.onerror = function (e) { if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { wakeOn = false; ls(LS_WAKE, '0'); paintToggles(); wakeStopped = true; } };
    wakeRec.onend = function () { wakeRec = null; if (wakeOn && !wakeStopped && !wakePaused && isActive()) setTimeout(startWake, 400); };
    try { wakeRec.start(); } catch (e) { wakeRec = null; }
  }
  function stopWake() { wakeStopped = true; if (wakeRec) { try { wakeRec.abort(); } catch (e) {} wakeRec = null; } paintToggles(); }
  function pauseWake() { wakePaused = true; if (wakeRec) { try { wakeRec.abort(); } catch (e) {} } }
  function resumeWake() { wakePaused = false; if (wakeOn && !wakeRec) setTimeout(startWake, 500); }
  setInterval(function () {                                   // sinkronkan mikrofon dengan keterlihatan layar (Profil <-> Dashboard)
    if (!wakeOn || busy || listening || wakePaused) return;
    if (isActive() && !wakeRec) startWake(); else if (!isActive() && wakeRec) { try { wakeRec.abort(); } catch (e) {} }
  }, 1500);
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') { if (wakeOn && !wakeRec && !busy && !listening) startWake(); } else if (wakeRec) { try { wakeRec.abort(); } catch (e) {} } });

  /* ---------- suara keluar: hanya ringkasan 1-2 kalimat, tabel tidak dibacakan ---------- */
  function stopSpeak() { if (canSpeak) try { speechSynthesis.cancel(); } catch (e) {} }
  function spokenOf(blocks) {
    var p = blocks.filter(function (b) { return b.t === 'p'; })[0];
    var s = p ? String(p.text).replace(/\*\*/g, '') : '';
    if (!s) { var h = blocks[0]; s = h && h.text ? String(h.text).replace(/\*\*/g, '') : ''; }
    if (blocks.some(function (b) { return b.t === 'table'; })) s += ' Rinciannya saya tampilkan di layar.';
    return s.slice(0, 320);
  }
  function speak(text, done) {
    if (!canSpeak || !voiceOut || !text) { done && done(); return; }
    try {
      stopSpeak();
      var u = new SpeechSynthesisUtterance(text.replace(/\s+/g, ' ')); u.lang = speechLang(); u.rate = 1.03;
      var vs = speechSynthesis.getVoices(), pre = u.lang.slice(0, 2);
      var v = vs.filter(function (x) { return x.lang && x.lang.toLowerCase().indexOf(u.lang.toLowerCase()) === 0; })[0] || vs.filter(function (x) { return x.lang && x.lang.slice(0, 2) === pre; })[0];
      if (v) u.voice = v;
      u.onend = u.onerror = function () { done && done(); };
      speechSynthesis.speak(u);
    } catch (e) { done && done(); }
  }

  /* ---------- komunikasi dengan server ---------- */
  async function token() {
    try { var r = await supabaseClient.auth.getSession(); return r && r.data && r.data.session ? r.data.session.access_token : ''; } catch (e) { return ''; }
  }
  async function post(payload) {          // untuk persetujuan (JSON biasa)
    var tk = await token();
    if (!tk) throw new Error('Sesi login habis. Muat ulang halaman dan login lagi.');
    var ac = new AbortController(), to = setTimeout(function () { ac.abort(); }, 60000), r;
    try { r = await fetch(API, { method: 'POST', signal: ac.signal, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tk }, body: JSON.stringify(payload) }); }
    catch (e) { throw new Error(e.name === 'AbortError' ? 'Server terlalu lama menjawab (>60 dtk). Ketik /tes untuk diagnosa.' : 'Tidak bisa menghubungi server Jarvis (' + (e.message || 'jaringan') + '). Ketik /tes untuk diagnosa.'); }
    finally { clearTimeout(to); }
    var j = await r.json().catch(function () { return {}; });
    if (!r.ok) throw new Error(j.error || ('Gagal (' + r.status + ')'));
    return j;
  }
  /* percakapan: aliran NDJSON (langkah demi langkah). onEvent dipanggil untuk tiap baris. */
  async function stream(payload, onEvent) {
    var tk = await token();
    if (!tk) throw new Error('Sesi login habis. Muat ulang halaman dan login lagi.');
    var ac = new AbortController(), timer = setTimeout(function () { ac.abort(); }, 90000), r;
    try { r = await fetch(API, { method: 'POST', signal: ac.signal, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tk }, body: JSON.stringify(Object.assign({ stream: true }, payload)) }); }
    catch (e) { clearTimeout(timer); throw new Error(e.name === 'AbortError' ? 'Server terlalu lama menjawab (>90 dtk). Ketik /tes untuk diagnosa.' : 'Tidak bisa menghubungi server Jarvis (' + (e.message || 'jaringan') + '). Ketik /tes untuk diagnosa.'); }
    try {
      if (!r.ok) { var j = await r.json().catch(function () { return {}; }); throw new Error(j.error || ('Gagal (' + r.status + ')')); }
      var got = null, buf = '', dec = new TextDecoder();
      function line(l) { l = l.trim(); if (!l) return; var ev; try { ev = JSON.parse(l); } catch (e) { return; } if (ev.type === 'final' || ev.type === 'error') got = ev; onEvent(ev); }
      if (r.body && r.body.getReader) {
        var rd = r.body.getReader();
        for (;;) { var c = await rd.read(); if (c.done) break; buf += dec.decode(c.value, { stream: true }); var p; while ((p = buf.indexOf('\n')) >= 0) { line(buf.slice(0, p)); buf = buf.slice(p + 1); } }
        line(buf);
      } else { (await r.text()).split('\n').forEach(line); }
      if (!got) throw new Error('Koneksi terputus sebelum jawaban selesai. Coba lagi.');
      if (got.type === 'error') throw new Error(got.error || 'Jarvis gagal.');
      return got;
    } finally { clearTimeout(timer); }
  }

  async function submit(text) {
    text = String(text || '').trim().slice(0, 1500);
    if (!text || busy) return;
    if (text.toLowerCase() === '/tes') { el.in.value = ''; return diagnose(); }
    busy = true; el.in.value = ''; el.send.disabled = true; stopListen(); pauseWake();
    var chips = el.log.querySelector('.bmj-chips'); if (chips) chips.remove();
    say('u', text);
    var R = newReply();
    var tick = setInterval(function () {                                   // tanda hidup: pengguna tahu AI masih bekerja
      var idle = Math.round((Date.now() - R.last) / 1000);
      if (idle >= 8) R.ht.textContent = 'Masih bekerja… (' + Math.round((Date.now() - R.t0) / 1000) + ' dtk)';
    }, 1500);
    try {
      var fin = await stream({ message: text, history: history.slice(-10) }, function (ev) {
        if (ev.type === 'status') setStatus(R, ev.text);
        else if (ev.type === 'step') onStep(R, ev);
      });
      finishSteps(R, true);
      var reply = fin.reply || '…', blocks = parseBlocks(reply);
      var ans = mk('div', '', 'bmj-ans'); renderBlocks(ans, blocks); R.wrap.appendChild(ans);
      var hasTable = blocks.some(function (b) { return b.t === 'table'; });
      var report = hasTable || /rangkum|ringkas|rekap|laporan|pdf|summary/i.test(text) || blocks.length >= 4;
      var acts = mk('div', '', 'bmj-acts');
      if (report) {
        var bp = mk('button', '', 'pri', ICON_PDF + '<span>Unduh PDF</span>');
        bp.onclick = async function () {
          bp.disabled = true; var lab = bp.querySelector('span'); lab.textContent = 'Membuat PDF…';
          try { await makePdf(blocks, text); lab.textContent = 'PDF tersimpan'; }
          catch (e) { lab.textContent = 'Unduh PDF'; say('s', 'Gagal membuat PDF: ' + (e.message || e)); }
          setTimeout(function () { bp.disabled = false; lab.textContent = 'Unduh PDF'; }, 2500);
        };
        acts.appendChild(bp);
      }
      var bc = mk('button', '', '', ICON_COPY + '<span>Salin</span>');
      bc.onclick = function () { var t = plainOf(blocks); (navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { bc.querySelector('span').textContent = 'Tersalin'; }, function () { bc.querySelector('span').textContent = 'Gagal'; }); setTimeout(function () { bc.querySelector('span').textContent = 'Salin'; }, 1800); };
      acts.appendChild(bc); R.wrap.appendChild(acts);
      history.push({ role: 'user', text: text }, { role: 'model', text: reply.slice(0, 1200) });
      if (history.length > 20) history = history.slice(-20);
      (fin.actions || []).forEach(runAction);
      (fin.proposals || []).forEach(showProposal);
      toBottom();
      speak(spokenOf(blocks), resumeWake);
    } catch (e) {
      finishSteps(R, false);
      R.wrap.appendChild(tx('div', 'bmj-m bmj-s', e.message || 'Jarvis gagal.')); resumeWake(); toBottom();
    } finally { clearInterval(tick); busy = false; el.send.disabled = false; }
  }

  async function diagnose() {
    var w = say('s', 'Mendiagnosa…'); busy = true;
    try {
      var tk = await token(); if (!tk) throw new Error('Tidak ada sesi login');
      var r = await fetch(API, { headers: { Authorization: 'Bearer ' + tk } });
      var txt = await r.text(), j = null; try { j = JSON.parse(txt); } catch (e) {}
      if (!j) { w.textContent = 'Server membalas HTTP ' + r.status + ' tapi bukan JSON. Kemungkinan /api/jarvis belum ter-deploy (cek file ada di folder api/ lalu Redeploy).'; return; }
      if (j.error) { w.textContent = 'HTTP ' + r.status + ': ' + j.error; return; }
      w.textContent = 'Server Jarvis aktif (' + (j.versi || 'VERSI LAMA — belum ter-deploy') + ').\n' + (j.data ? (j.data.error ? 'Baca data GAGAL: ' + j.data.error : 'Data terbaca: ' + j.data.note_terbaca + ' note, ' + j.data.baris_terbaca + ' baris (baris berisi "Arifin": ' + j.data.baris_berisi_arifin + ')') + '\n' : 'Pembaca data: tidak ada (kode lama)\n') + j.hasil.map(function (h) { return (h.ok ? '✓ ' : '✗ ') + h.model + ' (' + h.ms + ' ms)' + (h.error ? '\n   ' + h.error : ''); }).join('\n');
    } catch (e) { w.textContent = 'Gagal menghubungi /api/jarvis: ' + e.message + '. Server belum bisa dijangkau — pastikan file api/jarvis.js sudah ter-deploy.'; }
    finally { busy = false; }
  }

  /* ---------- aksi tampilan (tidak mengubah data) ---------- */
  function runAction(a) {
    try {
      if (a.type === 'open_folder') {
        closeSheet();
        if (typeof selectCategory === 'function' && typeof categoriesData !== 'undefined' && categoriesData.some(function (c) { return c.id === a.folder_id; })) selectCategory(a.folder_id);
        else if (typeof loadNotesForCategory === 'function') loadNotesForCategory(a.folder_id);
      } else if (a.type === 'open_note') {
        closeSheet();
        var inView = typeof notesData !== 'undefined' && notesData.some(function (n) { return n.id === a.note_id; });
        if (inView && typeof openNoteDetail === 'function') openNoteDetail(a.note_id);
        else if (typeof openEditor === 'function') openEditor(a.note_id);
      } else if (a.type === 'open_page') {
        closeSheet();
        var btn = /^btn[A-Za-z]+$/.test(a.button || '') ? document.getElementById(a.button) : null;
        if (btn) setTimeout(function () { btn.click(); }, 280);
        else say('s', 'Halaman itu belum bisa dibuka dari sini.');
      }
    } catch (e) { say('s', 'Gagal membuka tampilan: ' + e.message); }
  }

  /* ---------- kartu persetujuan ---------- */
  function showProposal(p) {
    var box = mk('div', '', 'bmj-p');
    var b = mk('b'); b.textContent = p.ringkas || 'Usulan perubahan'; box.appendChild(b);
    var dl = mk('dl');
    Object.keys(p.detail || {}).forEach(function (k) { var dt = mk('dt'), dd = mk('dd'); dt.textContent = k; dd.textContent = String(p.detail[k]); dl.append(dt, dd); });
    box.appendChild(dl);
    if (p.abaikan_kolom && p.abaikan_kolom.length) { var w = mk('div', '', 'bmj-s'); w.textContent = 'Kolom tidak dikenali (dilewati): ' + p.abaikan_kolom.join(', '); box.appendChild(w); }
    var row = mk('div', '', 'bmj-pb'), no = mk('button'), ok = mk('button', '', 'ok');
    no.textContent = 'Batal'; ok.textContent = 'Setuju & simpan';
    no.onclick = function () { box.remove(); say('s', 'Usulan dibatalkan.'); };
    ok.onclick = async function () {
      ok.disabled = no.disabled = true; ok.textContent = 'Menyimpan…';
      try {
        var j = await post({ approve: p.token });
        box.remove(); say('s', '✓ ' + (j.message || 'Tersimpan.'));
        try { if (typeof reloadActiveNotes === 'function') reloadActiveNotes(); } catch (e) {}
        speak(j.message || 'Tersimpan.');
      } catch (e) { ok.disabled = no.disabled = false; ok.textContent = 'Setuju & simpan'; say('s', 'Gagal: ' + e.message); }
    };
    row.append(no, ok); box.appendChild(row);
    el.log.appendChild(box); toBottom();
  }

  function init() {
    if (typeof supabaseClient === 'undefined') return;
    function tryBuild() { return token().then(function (tk) { if (tk && !el.fab) { build(); return true; } return false; }); }   // hanya muncul bila sudah login (server tetap cek admin)
    tryBuild();
    try { supabaseClient.auth.onAuthStateChange(function (ev, ses) { if (ses && !el.fab) tryBuild(); }); } catch (e) {}
  }
  window.BMJarvis = { open: function () { openSheet(); }, ask: function (t) { openSheet(); submit(t); } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
