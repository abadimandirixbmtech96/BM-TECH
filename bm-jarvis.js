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
  var inHub = window.name === 'bm-dash-hub' || window.name === 'bm-recap-hub';   // lapisan di halaman Profil                        // Dashboard yang tertanam di halaman Profil (aplikasi terpasang)
  if (window.BMJarvis || (window.parent !== window && !inHub) || /\/jarvis-ai\.html$/.test(location.pathname)) return;   // tidak di dalam iframe editor/panel lain
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
  var curAC = null, curCtl = null, userStop = false;
  var busy = false, listening = false, wakeOn = false, voiceOut = true, rec = null, wakeRec = null, sheetOpen = false;

  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) {} return null; }
  voiceOut = ls(LS_VOICE) !== '0';
  wakeOn = ls(LS_WAKE) === '1' && !!SR;

  var LANGS = { id: 'id-ID', en: 'en-US', ms: 'ms-MY', zh: 'zh-CN', hi: 'hi-IN', es: 'es-ES', ar: 'ar-SA', fr: 'fr-FR', pt: 'pt-BR', ru: 'ru-RU', ja: 'ja-JP' };
  function speechLang() { return LANGS[ls('bm-lang')] || 'id-ID'; }

  /* ---------- gaya ---------- */
  var css = '\
#bmj-fab{position:fixed;right:16px;bottom:calc(96px + env(safe-area-inset-bottom,0px));touch-action:none;z-index:2000;width:58px;height:58px;padding:0;border-radius:50%;border:1px solid rgba(var(--accent-rgb,240,165,41),.45);background:radial-gradient(circle,rgba(16,16,18,.97) 0 56%,rgba(26,26,30,.9) 100%);color:var(--accent-yellow,#F0A529);display:flex;align-items:center;justify-content:center;box-shadow:0 8px 24px rgba(0,0,0,.38),0 0 20px rgba(var(--accent-rgb,240,165,41),.32);cursor:pointer;-webkit-tap-highlight-color:transparent;-webkit-user-select:none;user-select:none;transition:transform .22s cubic-bezier(.2,.8,.2,1),opacity .2s}\
#bmj-fab:active{transform:scale(.9)}#bmj-fab svg{width:100%;height:100%;overflow:visible;pointer-events:none}#bmj-fab circle{fill:none;stroke:currentColor}\
#bmj-fab .bmj-r{transform-box:fill-box;transform-origin:center;animation:bmjSpin 18s linear infinite}#bmj-fab .bmj-r2{animation-duration:8s;animation-direction:reverse}\
#bmj-fab .bmj-tk{stroke-width:2.4;stroke-dasharray:1 5.3;opacity:.55}#bmj-fab .bmj-a2{stroke-width:3.2;stroke-dasharray:34 14.7;stroke-linecap:round}#bmj-fab .bmj-th{stroke-width:1;opacity:.35}\
#bmj-fab .bmj-core{fill:currentColor;stroke:none;transform-box:fill-box;transform-origin:center;animation:bmjCore 2.6s ease-in-out infinite;filter:drop-shadow(0 0 4px currentColor)}\
#bmj-fab.bmj-busy .bmj-r{animation-duration:2.4s}#bmj-fab.bmj-busy .bmj-r2{animation-duration:1.4s}\
#bmj-fab.bmj-open,html.bm-layer-on #bmj-fab{opacity:0;transform:scale(.6);pointer-events:none}\
@keyframes bmjSpin{to{transform:rotate(360deg)}}@keyframes bmjCore{50%{opacity:.6;transform:scale(.8)}}\
@media (prefers-reduced-motion:reduce){#bmj-fab .bmj-r,#bmj-fab .bmj-core{animation:none}}\
#bmj-fab.bmj-hot{animation:bmjPulse 1.2s infinite}\
@keyframes bmjPulse{0%{box-shadow:0 0 0 0 rgba(var(--accent-rgb,240,165,41),.6)}100%{box-shadow:0 0 0 18px rgba(var(--accent-rgb,240,165,41),0)}}\
#bmj-ov{position:fixed;inset:0;z-index:2001;background:rgba(0,0,0,.5);opacity:0;pointer-events:none;transition:opacity .2s}\
#bmj-ov.bmj-on{opacity:1;pointer-events:auto}\
#bmj-sheet{position:fixed;left:0;right:0;bottom:0;z-index:2002;max-height:88vh;height:88vh;display:flex;flex-direction:column;background:var(--bmj-bg);color:var(--bmj-tx);border-radius:22px 22px 0 0;border:1px solid var(--bmj-bd);transform:translateY(105%);transition:transform .28s cubic-bezier(.2,.8,.2,1);font-family:inherit;max-width:720px;margin:0 auto;padding-bottom:env(safe-area-inset-bottom,0px)}\
#bmj-sheet.bmj-on{transform:translateY(0)}\
.bmj-h{display:flex;align-items:center;gap:8px;padding:14px 14px 10px}\
.bmj-h b{flex:1;font-size:16px;letter-spacing:.14em}.bmj-h b i{font-style:normal;color:var(--accent-yellow,#F0A529)}\
.bmj-ib{width:34px;height:34px;border-radius:50%;border:1px solid var(--bmj-bd);background:var(--bmj-pill);color:var(--bmj-mu);display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:11px;font-weight:700}\
.bmj-ib.bmj-on{color:var(--on-accent,#1C1B19);background:var(--accent-yellow,#F0A529)}\
.bmj-ib svg{width:17px;height:17px}\
#bmj-log{flex:1;overflow-y:auto;padding:4px 14px 8px;display:flex;flex-direction:column;gap:10px;-webkit-overflow-scrolling:touch}\
.bmj-m{max-width:86%;padding:9px 13px;border-radius:16px;font-size:14px;line-height:1.5;white-space:pre-wrap;word-break:break-word}\
.bmj-u{align-self:flex-end;background:var(--accent-yellow,#F0A529);color:var(--on-accent,#1C1B19);border-bottom-right-radius:5px}\
.bmj-a{align-self:flex-start;background:var(--bmj-pill);border-bottom-left-radius:5px}\
.bmj-s{align-self:center;font-size:12px;color:var(--bmj-mu);text-align:center}\
/* kartu jawaban + progres */\
.bmj-r{align-self:stretch;max-width:100%;display:flex;flex-direction:column;gap:8px}\
.bmj-steps{border:1px solid var(--bmj-bd);border-radius:14px;background:var(--bmj-pill);overflow:hidden;font-size:13px}\
.bmj-sh{display:flex;align-items:center;gap:9px;padding:9px 12px;cursor:pointer;-webkit-tap-highlight-color:transparent}\
.bmj-sh .bmj-t{flex:1;min-width:0}.bmj-sh .bmj-c{opacity:.55;font-size:11px;transition:transform .2s}.bmj-steps.bmj-open .bmj-c{transform:rotate(180deg)}\
.bmj-sl{display:grid;grid-template-rows:0fr;transition:grid-template-rows .3s cubic-bezier(.2,.8,.2,1)}.bmj-steps.bmj-open .bmj-sl,.bmj-steps.bmj-live .bmj-sl{grid-template-rows:1fr}\
.bmj-si{overflow:hidden;min-height:0;display:flex;flex-direction:column;gap:7px;padding:0 12px}.bmj-si::after{content:"";height:3px;flex:none}\
.bmj-st{display:flex;gap:9px;align-items:flex-start;line-height:1.35;animation:bmjIn .25s ease}\
.bmj-st .bmj-x{flex:1;min-width:0}.bmj-st .bmj-x small{display:block;color:var(--bmj-mu);font-size:12px;margin-top:1px}\
@keyframes bmjIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}\
.bmj-ic{flex:0 0 16px;width:16px;height:16px;margin-top:1px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800}\
.bmj-ic.bmj-run{border:2px solid rgba(var(--accent-rgb,240,165,41),.25);border-top-color:var(--accent-yellow,#F0A529);border-radius:50%;animation:bmjSpin .7s linear infinite}\
.bmj-ic.bmj-ok{color:#2fb36b}.bmj-ic.bmj-err{color:#e5484d}\
@keyframes bmjSpin{to{transform:rotate(360deg)}}\
.bmj-ans{background:var(--bmj-pill);border-radius:16px;border-bottom-left-radius:5px;padding:11px 13px;font-size:14px;line-height:1.55;word-break:break-word}\
.bmj-ans>*:first-child{margin-top:0}.bmj-ans>*:last-child{margin-bottom:0}\
.bmj-ans h3{font-size:15px;margin:10px 0 6px;font-weight:800}\
.bmj-ans p{margin:6px 0}.bmj-ans ul,.bmj-ans ol{margin:6px 0;padding-left:20px}.bmj-ans li{margin:2px 0}\
.bmj-tw{margin:9px -4px;border:1px solid var(--bmj-bd);border-radius:11px;overflow:auto;max-height:340px;-webkit-overflow-scrolling:touch}\
.bmj-tw table{border-collapse:collapse;width:100%;font-size:12.5px;white-space:nowrap}\
.bmj-tw th{position:sticky;top:0;background:rgba(var(--accent-rgb,240,165,41),.92);color:var(--on-accent,#1C1B19);text-align:left;font-weight:800;padding:7px 10px}\
.bmj-tw td{padding:6px 10px;border-top:1px solid var(--bmj-bd)}\
.bmj-tw tr:nth-child(even) td{background:rgba(127,127,127,.07)}\
.bmj-tw .bmj-n{text-align:right;font-variant-numeric:tabular-nums}\
.bmj-acts{display:flex;gap:8px;flex-wrap:wrap}\
.bmj-acts button{display:inline-flex;align-items:center;gap:6px;padding:8px 14px;border-radius:999px;border:1px solid var(--bmj-bd);background:var(--bmj-pill);color:inherit;font:inherit;font-size:13px;font-weight:700;cursor:pointer}\
.bmj-acts button.bmj-pri{background:var(--accent-yellow,#F0A529);color:var(--on-accent,#1C1B19);border-color:transparent}.bmj-acts button:disabled{opacity:.55}\
.bmj-acts svg{width:15px;height:15px}\
.bmj-p{align-self:stretch;border:1px solid rgba(var(--accent-rgb,240,165,41),.6);border-radius:14px;padding:11px 12px;font-size:13px;background:rgba(var(--accent-rgb,240,165,41),.08)}\
.bmj-p b{display:block;margin-bottom:6px;font-size:13.5px}\
.bmj-p dl{margin:0 0 9px;display:grid;grid-template-columns:auto 1fr;gap:3px 10px}.bmj-p dt{color:var(--bmj-mu)}.bmj-p dd{margin:0;word-break:break-word}\
.bmj-pb{display:flex;gap:8px}.bmj-pb button{flex:1;padding:9px;border-radius:11px;border:1px solid var(--bmj-bd);background:var(--bmj-pill);color:inherit;font:inherit;font-weight:700;cursor:pointer}\
.bmj-pb button.bmj-ok{background:var(--accent-yellow,#F0A529);color:var(--on-accent,#1C1B19);border-color:transparent}.bmj-pb button:disabled{opacity:.5}\
.bmj-f{display:flex;align-items:center;gap:8px;padding:10px 12px 12px}\
#bmj-in{flex:1;min-width:0;border-radius:22px;border:1px solid var(--bmj-bd);background:var(--bmj-pill);color:inherit;font:inherit;font-size:16px;padding:10px 15px;outline:none}\
#bmj-mic{width:44px;height:44px;flex:0 0 44px;border-radius:50%;border:0;background:var(--accent-yellow,#F0A529);color:var(--on-accent,#1C1B19);display:flex;align-items:center;justify-content:center;cursor:pointer}\
#bmj-mic svg{width:22px;height:22px}#bmj-mic.bmj-rec{animation:bmjPulse 1s infinite;background:#e5484d;color:#fff}\
#bmj-send{width:40px;height:40px;flex:0 0 40px;border-radius:50%;border:1px solid var(--bmj-bd);background:transparent;color:var(--accent-yellow,#F0A529);display:flex;align-items:center;justify-content:center;cursor:pointer}\
#bmj-send svg{width:19px;height:19px}\
.bmj-chips{display:flex;gap:7px;flex-wrap:wrap;justify-content:center;padding:2px 0}\
.bmj-chips button{padding:7px 12px;border-radius:999px;border:1px solid var(--bmj-bd);background:transparent;color:inherit;font:inherit;font-size:12.5px;cursor:pointer}\
/* animasi halus */\
#bmj-log{scroll-behavior:smooth}\
.bmj-m,.bmj-r,.bmj-p,.bmj-chips{animation:bmjIn .32s cubic-bezier(.2,.8,.2,1) both}\
.bmj-u{animation-name:bmjPop}@keyframes bmjPop{from{opacity:0;transform:translateY(8px) scale(.96)}to{opacity:1;transform:none}}\
.bmj-caret{display:inline-block;width:2px;height:1.05em;margin-left:1px;vertical-align:text-bottom;background:var(--accent-yellow,#F0A529);animation:bmjBlink .9s steps(1) infinite}\
@keyframes bmjBlink{50%{opacity:0}}\
.bmj-fade{animation:bmjIn .45s cubic-bezier(.2,.8,.2,1) both}\
.bmj-tw tbody tr{transition:opacity .35s ease,transform .35s ease}.bmj-tw tbody tr.bmj-hid{opacity:0;transform:translateY(6px)}\
.bmj-tw{transition:opacity .3s ease}\
.bmj-sh{transition:background .2s}.bmj-sh:active{background:rgba(127,127,127,.12)}\
.bmj-acts button{transition:transform .12s,opacity .2s}.bmj-acts button:active{transform:scale(.95)}\
#bmj-send{transition:transform .12s,background .2s,color .2s}#bmj-send:active{transform:scale(.9)}#bmj-send.bmj-stop{background:var(--accent-yellow,#F0A529);color:var(--on-accent,#1C1B19);border-color:transparent}\
@media (prefers-reduced-motion:reduce){.bmj-m,.bmj-r,.bmj-p,.bmj-chips,.bmj-fade,.bmj-st{animation:none!important}#bmj-log{scroll-behavior:auto}}\
/* kartu rekap (sama dengan tabel aplikasi) */\
.bmj-rep{border:1px solid var(--bmj-bd);border-radius:14px;overflow:hidden;background:var(--bmj-pill)}\
.bmj-rh{padding:10px 12px 8px}.bmj-rh b{display:block;font-size:14px}.bmj-rh span{font-size:12px;color:var(--bmj-mu)}\
.bmj-rep .bmj-tw{margin:0;border:0;border-radius:0;border-top:1px solid var(--bmj-bd);max-height:380px}\
.bmj-rep td.bmj-w{white-space:normal;min-width:150px;max-width:260px}.bmj-rep td.bmj-nw{white-space:nowrap}\
.bmj-rt{display:flex;gap:14px;flex-wrap:wrap;padding:9px 12px;border-top:1px solid var(--bmj-bd);font-size:13px;font-weight:800}\
#bmj-sheet{--bmj-bg:#121214;--bmj-tx:#f2f2f2;--bmj-mu:#8d8d93;--bmj-pill:rgba(255,255,255,.08);--bmj-bd:rgba(255,255,255,.13);font-family:var(--bm-font,inherit);color-scheme:dark}\
#bmj-sheet.bmj-lt{--bmj-bg:#ffffff;--bmj-tx:#161616;--bmj-mu:#6b6b70;--bmj-pill:rgba(0,0,0,.055);--bmj-bd:rgba(0,0,0,.12);color-scheme:light}\
#bmj-sheet button,#bmj-sheet input{font-family:inherit}#bmj-in::placeholder{color:var(--bmj-mu)}';

  var ICON_HUD = '<svg viewBox="-50 -50 100 100" aria-hidden="true"><g class="bmj-r"><circle r="39" class="bmj-tk"/></g><g class="bmj-r bmj-r2"><circle r="31" class="bmj-a2"/></g><circle r="22" class="bmj-th"/><circle r="9" class="bmj-core"/></svg>';
  var ICON_BOT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.2"/><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21"/></svg>';
  var ICON_MIC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>';
  var ICON_SEND = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2 11 13M22 2l-7 20-4-9-9-4z"/></svg>';
  var ICON_SPK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4zM15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/></svg>';
  var ICON_PDF = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M7 11l5 5 5-5M4 20h16"/></svg>';
  var ICON_STOP = '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6.5" y="6.5" width="11" height="11" rx="2.5"/></svg>';
  var ICON_COPY = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h8"/></svg>';

  var el = {};
  function mk(tag, id, cls, html) { var e = document.createElement(tag); if (id) e.id = id; if (cls) e.className = cls; if (html) e.innerHTML = html; return e; }   // html hanya utk ikon/markup statis kita sendiri
  function tx(tag, cls, text) { var e = mk(tag, '', cls); e.textContent = text; return e; }

  /* ---------- kerangka ---------- */
  function build() {
    var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    el.fab = mk('button', 'bmj-fab', '', ICON_HUD); el.fab.setAttribute('aria-label', 'Buka Jarvis'); el.fab.type = 'button';
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
    var drag = null, moved = false, justDragged = false;
    el.fab.addEventListener('pointerdown', function (e) { if (e.button) return; var r = el.fab.getBoundingClientRect(); drag = { dx: e.clientX - r.left, dy: e.clientY - r.top, sx: e.clientX, sy: e.clientY, id: e.pointerId }; moved = false; });
    el.fab.addEventListener('pointermove', function (e) {
      if (!drag) return;
      if (!moved && Math.abs(e.clientX - drag.sx) + Math.abs(e.clientY - drag.sy) < 10) return;
      if (!moved) { moved = true; try { el.fab.setPointerCapture(drag.id); } catch (x) {} }
      var x = Math.max(4, Math.min(innerWidth - 62, e.clientX - drag.dx)), y = Math.max(4, Math.min(innerHeight - 62, e.clientY - drag.dy));
      el.fab.style.left = x + 'px'; el.fab.style.top = y + 'px'; el.fab.style.right = 'auto'; el.fab.style.bottom = 'auto';
    });
    el.fab.addEventListener('pointerup', function () {
      if (drag && moved) { var r = el.fab.getBoundingClientRect(); ls('bm-jarvis-pos', JSON.stringify({ x: Math.round(r.left), y: Math.round(r.top) })); justDragged = true; setTimeout(function () { justDragged = false; }, 350); }
      drag = null;
    });
    el.fab.addEventListener('pointercancel', function () { drag = null; });
    el.fab.addEventListener('click', function (e) { e.preventDefault(); if (justDragged) return; if (sheetOpen) closeSheet(); else openSheet(); });
    el.ov.onclick = function () { if (Date.now() - openedAt < 400) return; closeSheet(); };   // abaikan ketukan yang sama dengan ketukan pembuka
    el.close.onclick = closeSheet;
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && sheetOpen) closeSheet(); });
    el.send.onclick = function () { if (busy) stopAll(); else submit(el.in.value); };
    el.in.onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); if (!busy) submit(el.in.value); } };
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
    function fill(list) { box.textContent = ''; list.slice(0, 4).forEach(function (q) { var b = mk('button'); b.textContent = q; b.onclick = function () { box.remove(); submit(q); }; box.appendChild(b); }); }
    var LOKAL = ['Rangkum transaksi minggu ini', 'Grafik omzet bulan ini', 'Siapa yang masih berhutang?', 'Barang warung yang perlu dibeli', 'Customer yang barangnya masih ditinggal', 'Catatan bulan ini yang harganya kosong', 'Bandingkan omzet bengkel dan warung bulan ini', 'Total harga Buku Besar bulan ini'];
    fill(LOKAL.map(function (x) { return [Math.random(), x]; }).sort(function (a, b) { return a[0] - b[0]; }).map(function (x) { return x[1]; }));   // saran berganti setiap kali dibuka
    el.log.appendChild(box);
    token().then(function (tk) { if (!tk) return null; return fetch(API + '?saran=1', { headers: { Authorization: 'Bearer ' + tk } }).then(function (r) { return r.json(); }); })
      .then(function (j) { if (j && Array.isArray(j.saran) && j.saran.length && box.isConnected) fill(j.saran); }, function () {});
  }
  function paintToggles() {
    el.spk.classList.toggle('bmj-on', voiceOut); el.wake.classList.toggle('bmj-on', wakeOn);
    el.spk.style.display = canSpeak ? '' : 'none';
    el.fab.classList.toggle('bmj-hot', wakeOn && !sheetOpen);
  }
  var openedAt = 0;
  /* tema panel ikut pengaturan dashboard (bm-theme: light/dark) di semua halaman */
  function isLight() { try { var t = localStorage.getItem('bm-theme'); if (t === 'light') return true; if (t === 'dark') return false; } catch (e) {} return !!(document.body && document.body.classList.contains('theme-light')); }
  function paintTheme() { if (el.sheet) el.sheet.classList.toggle('bmj-lt', isLight()); }
  window.addEventListener('storage', function (e) { if (!e.key || e.key === 'bm-theme') paintTheme(); });
  function openSheet() { paintTheme(); sheetOpen = true; openedAt = Date.now(); el.fab.classList.add('bmj-open'); el.fab.setAttribute('aria-expanded', 'true'); el.ov.classList.add('bmj-on'); el.sheet.classList.add('bmj-on'); paintToggles(); setTimeout(function () { el.log.scrollTop = el.log.scrollHeight; }, 50); }
  function closeSheet() { sheetOpen = false; el.fab.classList.remove('bmj-open'); el.fab.setAttribute('aria-expanded', 'false'); el.ov.classList.remove('bmj-on'); el.sheet.classList.remove('bmj-on'); stopListen(); stopSpeak(); paintToggles(); try { el.fab.focus({ preventScroll: true }); } catch (e) {} }
  function setSendMode(on) { if (el.fab) el.fab.classList.toggle('bmj-busy', !!on); if (!el.send) return; el.send.classList.toggle('bmj-stop', on); el.send.innerHTML = on ? ICON_STOP : ICON_SEND; el.send.setAttribute('aria-label', on ? 'Hentikan' : 'Kirim'); }
  function stopAll() { userStop = true; if (curAC) { try { curAC.abort(); } catch (e) {} } if (curCtl) curCtl.skip = true; stopSpeak(); }
  function nearBottom() { return el.log.scrollHeight - el.log.scrollTop - el.log.clientHeight < 120; }
  function toBottom(instant) { if (instant) { var b = el.log.style.scrollBehavior; el.log.style.scrollBehavior = 'auto'; el.log.scrollTop = el.log.scrollHeight; el.log.style.scrollBehavior = b; } else el.log.scrollTo({ top: el.log.scrollHeight, behavior: 'smooth' }); }

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
          for (var k = 0; k < b.head.length; k++) { var v = (r[k] == null ? '' : r[k]).replace(/\*\*/g, ''); rr.appendChild(tx('td', /^(Rp\s?)?-?[\d.,]+%?$/.test(v) ? 'bmj-n' : '', v)); }
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

  /* ---------- efek mengetik (teks) + muncul bertahap (baris tabel) ---------- */
  var REDUCED = false; try { REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}
  function textNodes(root) { var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null), out = [], n; while ((n = w.nextNode())) out.push(n); return out; }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function frame() { return new Promise(function (r) { requestAnimationFrame(r); }); }
  async function typeInto(box, ctl) {
    var kids = [].slice.call(box.children);
    var plan = kids.map(function (k) {
      if (k.classList.contains('bmj-tw')) { var trs = [].slice.call(k.querySelectorAll('tbody tr')); return { t: 'tbl', el: k, trs: trs }; }
      var nodes = textNodes(k); return { t: 'txt', el: k, nodes: nodes, full: nodes.map(function (n) { return n.data; }) };
    });
    var total = plan.reduce(function (a, b) { return a + (b.full ? b.full.join('').length : 0); }, 0);
    if (REDUCED || total + plan.length === 0) return;
    plan.forEach(function (b) { b.el.style.display = 'none'; if (b.t === 'txt') b.nodes.forEach(function (n) { n.data = ''; }); else b.trs.forEach(function (tr) { tr.classList.add('bmj-hid'); }); });
    var cps = Math.min(150, Math.max(55, total / 2.6)); if (total / cps > 4.5) cps = total / 4.5;     // 2-4,5 dtk, tidak terlalu lambat
    var caret = mk('span', '', 'bmj-caret'), last = performance.now();
    function finishAll() { plan.forEach(function (b) { b.el.style.display = ''; if (b.t === 'txt') b.nodes.forEach(function (n, i) { n.data = b.full[i]; }); else b.trs.forEach(function (tr) { tr.classList.remove('bmj-hid'); }); }); if (caret.parentNode) caret.remove(); }
    for (var bi = 0; bi < plan.length; bi++) {
      if (ctl.skip) { finishAll(); return; }
      var b = plan[bi]; b.el.style.display = ''; b.el.classList.add('bmj-fade');
      if (b.t === 'tbl') {
        var near = nearBottom(), step = Math.max(30, Math.min(70, 900 / Math.max(1, b.trs.length)));
        for (var r = 0; r < b.trs.length; r++) { if (ctl.skip) { finishAll(); return; } if (r < 40) { b.trs[r].classList.remove('bmj-hid'); await sleep(step); } else b.trs[r].classList.remove('bmj-hid'); if (near && r % 3 === 0) toBottom(true); }
        continue;
      }
      for (var ni = 0; ni < b.nodes.length; ni++) {
        var node = b.nodes[ni], full = b.full[ni], pos = 0;
        if (!full) continue;
        node.parentNode.insertBefore(caret, node.nextSibling);
        while (pos < full.length) {
          if (ctl.skip) { finishAll(); return; }
          await frame(); var now = performance.now(), dt = Math.min(64, now - last); last = now;
          pos = Math.min(full.length, pos + Math.max(1, Math.round(cps * dt / 1000)));
          node.data = full.slice(0, pos);
          if (nearBottom()) toBottom(true);
        }
      }
      if (caret.parentNode) caret.remove();
    }
    if (caret.parentNode) caret.remove();
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

  /* ---------- kartu rekap: tabel sama dengan aplikasi ---------- */
  var MONEYCOL = /^(harga|price|total|total tagihan|dibayar|sisa|sisa tagihan)$/i, WIDECOL = /^(keterangan|remarks|barang|item|nama barang)$/i;
  function renderReport(rep) {
    var card = mk('div', '', 'bmj-rep bmj-fade'), h = mk('div', '', 'bmj-rh');
    h.appendChild(tx('b', '', rep.title));
    h.appendChild(tx('span', '', rep.folder + ' · ' + rep.periode + ' · ' + rep.total_baris + ' baris' + (rep.truncated ? ' (400 pertama)' : '')));
    card.appendChild(h);
    var w = mk('div', '', 'bmj-tw'), tb = mk('table'), th = mk('thead'), tr = mk('tr');
    rep.columns.forEach(function (c) { tr.appendChild(tx('th', '', c)); }); th.appendChild(tr); tb.appendChild(th);
    var tbd = mk('tbody');
    if (!rep.rows.length) { var e = mk('tr'), td = tx('td', '', 'Tidak ada data pada periode / filter ini.'); td.colSpan = rep.columns.length; e.appendChild(td); tbd.appendChild(e); }
    rep.rows.forEach(function (r) {
      var row = mk('tr');
      rep.columns.forEach(function (c, k) { var v = r[k] == null ? '' : String(r[k]); row.appendChild(tx('td', MONEYCOL.test(c) ? 'bmj-n' : WIDECOL.test(c) ? 'bmj-w' : 'bmj-nw', v)); });
      tbd.appendChild(row);
    });
    tb.appendChild(tbd); w.appendChild(tb); card.appendChild(w);
    if (rep.totals && rep.totals.length) { var t = mk('div', '', 'bmj-rt'); rep.totals.forEach(function (x) { t.appendChild(tx('span', '', x.label + ': Rp' + x.nilai)); }); card.appendChild(t); }
    return card;
  }
  function reportPlain(rep) { return [rep.title, rep.columns.join('\t')].concat(rep.rows.map(function (r) { return r.join('\t'); })).concat((rep.totals || []).map(function (x) { return x.label + ': Rp' + x.nilai; })).join('\n'); }
  /* PDF gaya aplikasi: judul "Rekap Amin - Pekan 1 Nov 2026", header emas teks putih, baris belang, kolom & urutan sama */
  async function makeReportPdf(rep, blocks) {
    var JsPDF = await ensurePdfLibs();
    var land = rep.orientation === 'landscape';
    var doc = new JsPDF({ orientation: land ? 'landscape' : 'portrait', unit: 'pt', format: 'a4' });
    var W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 30, y = 40;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.setTextColor(25, 25, 25); doc.text(pdfText(rep.title), M, y); y += 14;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(125);
    doc.text(pdfText(rep.folder + '  |  ' + rep.periode + '  |  ' + rep.total_baris + ' baris  |  dicetak ' + stamp().replace('T', ' ') + ' WIB'), M, y); y += 12;
    var sum = (blocks || []).filter(function (b) { return b.t === 'p' || b.t === 'ul'; });
    if (sum.length) {
      doc.setFontSize(8.5); doc.setTextColor(70);
      sum.forEach(function (b) { (b.t === 'ul' ? b.items.map(function (x) { return '\u2022 ' + x; }) : [b.text]).forEach(function (t) { var l = doc.splitTextToSize(pdfText(t), W - 2 * M); doc.text(l, M, y + 8); y += l.length * 11; }); });
      y += 4;
    }
    var num = function (k) { return MONEYCOL.test(k); };
    var styles = {}; rep.columns.forEach(function (c, i) {
      if (/^no$/i.test(c)) styles[i] = { cellWidth: 24 }; else if (/^(tanggal|date)$/i.test(c)) styles[i] = { cellWidth: 56 }; else if (/^(jam|time)$/i.test(c)) styles[i] = { cellWidth: 30 };
      else if (/^(pj)$/i.test(c)) styles[i] = { cellWidth: 46 }; else if (/^(customer|nama|buyer|seller|jenis)$/i.test(c)) styles[i] = { cellWidth: 54 };
      else if (/^(barang keluar|stok barang|metode|bukti|proof)$/i.test(c)) styles[i] = { cellWidth: 44 }; else if (num(c)) styles[i] = { cellWidth: 56, halign: 'right' };
    });
    doc.autoTable({ startY: y + 6, head: [rep.columns.map(pdfText)], body: rep.rows.map(function (r) { return rep.columns.map(function (_, k) { return pdfText(r[k]); }); }), theme: 'striped', margin: { left: M, right: M, bottom: 40 },
      styles: { font: 'helvetica', fontSize: 7.5, cellPadding: { top: 5, bottom: 5, left: 4, right: 4 }, textColor: [90, 90, 90], lineWidth: 0, valign: 'top' },
      headStyles: { fillColor: [221, 163, 45], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.5 }, alternateRowStyles: { fillColor: [245, 245, 245] }, columnStyles: styles });
    var fy = doc.lastAutoTable.finalY + 16;
    if (rep.totals && rep.totals.length) { if (fy > H - 50) { doc.addPage(); fy = 50; } doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(25, 25, 25); doc.text(pdfText(rep.totals.map(function (x) { return x.label + ': Rp' + x.nilai; }).join('     ')), W - M, fy, { align: 'right' }); }
    var n = doc.internal.getNumberOfPages();
    for (var i = 1; i <= n; i++) { doc.setPage(i); doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(150); doc.text('Dibuat oleh Jarvis - BM-TECH', M, H - 20); doc.text('Halaman ' + i + ' / ' + n, W - M, H - 20, { align: 'right' }); }
    var slug = pdfText(rep.title).replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'Rekap';
    doc.save(slug + '.pdf');
  }

  /* ---------- kartu progres ---------- */
  function newReply() {
    var wrap = mk('div', '', 'bmj-r');
    var steps = mk('div', '', 'bmj-steps bmj-live');
    var head = mk('div', '', 'bmj-sh'), spin = mk('span', '', 'bmj-ic bmj-run'), ht = tx('span', 'bmj-t', 'Memulai…'), ch = tx('span', 'bmj-c', '▼');
    head.append(spin, ht, ch);
    var slw = mk('div', '', 'bmj-sl'), list = mk('div', '', 'bmj-si'); slw.appendChild(list);
    steps.append(head, slw); wrap.appendChild(steps);
    head.onclick = function () { if (!steps.classList.contains('bmj-live')) steps.classList.toggle('bmj-open'); };
    el.log.appendChild(wrap); toBottom();
    return { wrap: wrap, steps: steps, head: head, spin: spin, ht: ht, list: list, rows: {}, count: 0, t0: Date.now(), last: Date.now() };
  }
  function setStatus(R, text) { R.ht.textContent = text; R.last = Date.now(); }
  function onStep(R, ev) {
    R.last = Date.now();
    var row = R.rows[ev.id];
    if (!row) {
      var r = mk('div', '', 'bmj-st'), ic = mk('span', '', 'bmj-ic bmj-run'), x = mk('div', '', 'bmj-x'), t = tx('div', '', ev.text), sub = mk('small');
      x.append(t, sub); r.append(ic, x); R.list.appendChild(r); row = R.rows[ev.id] = { ic: ic, t: t, sub: sub }; R.count++;
    }
    if (ev.state === 'run') { row.t.textContent = ev.text; setStatus(R, ev.text + '…'); }
    else { row.ic.className = 'bmj-ic bmj-' + ev.state; row.ic.textContent = ev.state === 'ok' ? '✓' : '✗'; row.sub.textContent = ev.text; setStatus(R, ev.text); }
    toBottom();
  }
  function finishSteps(R, ok) {
    R.steps.classList.remove('bmj-live'); R.spin.className = 'bmj-ic ' + (ok ? 'bmj-ok' : 'bmj-err'); R.spin.textContent = ok ? '✓' : '✗';
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
    rec.onend = function () { listening = false; el.mic.classList.remove('bmj-rec'); rec = null; var t = (finalText || el.in.value || '').trim(); if (t) submit(t); else resumeWake(); };
    try { rec.start(); listening = true; el.mic.classList.add('bmj-rec'); el.in.placeholder = 'Mendengarkan…'; } catch (e) { listening = false; }
  }
  function stopListen() { if (rec) { try { rec.stop(); } catch (e) {} } listening = false; el.mic && el.mic.classList.remove('bmj-rec'); if (el.in) el.in.placeholder = 'Ketik atau bicara…'; }

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
  function spokenOf(blocks, reps) {
    var p = blocks.filter(function (b) { return b.t === 'p'; })[0];
    var s = p ? String(p.text).replace(/\*\*/g, '') : '';
    if (!s) { var h = blocks[0]; s = h && h.text ? String(h.text).replace(/\*\*/g, '') : ''; }
    if ((reps && reps.length) || blocks.some(function (b) { return b.t === 'table'; })) s += ' Tabel lengkapnya saya tampilkan di layar.';
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
  var SB_URL = 'https://zgzmbneqqzxnptbmlhsz.supabase.co', SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpnem1ibmVxcXp4bnB0Ym1saHN6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc3OTU0ODksImV4cCI6MjEwMzM3MTQ4OX0.MQOtu5Pg2PtxIu18joKDd0dOA17cPEazmlL0Xl3Vz7E';
  function storedToken() {
    try {
      var s = JSON.parse(localStorage.getItem('bmtech-auth') || 'null'); if (s && s.currentSession) s = s.currentSession;
      if (s && s.access_token && (!s.expires_at || s.expires_at * 1000 > Date.now() + 30000)) return s.access_token;
    } catch (e) {}
    return '';
  }
  async function token() {
    if (typeof supabaseClient !== 'undefined' && supabaseClient && supabaseClient.auth) {
      try { var r = await supabaseClient.auth.getSession(); if (r && r.data && r.data.session) return r.data.session.access_token; } catch (e) {}
    }
    return storedToken();   // halaman tanpa klien Supabase: sesi disegarkan oleh halaman lain yang punya klien
  }
  // Tombol hanya untuk admin. Hasil dicek di server (is_admin) dan diingat 10 menit per akun di sesi ini.
  function adminCheck(tk) {
    var uid = '';
    try { var p = tk.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'); while (p.length % 4) p += '='; uid = JSON.parse(atob(p)).sub || ''; } catch (e) {}
    var key = 'bm-jarvis-adm:' + uid, c = null;
    try { c = JSON.parse(sessionStorage.getItem(key) || 'null'); } catch (e) {}
    if (c && Date.now() - c.t < 600000) return Promise.resolve(c.v);
    return fetch(SB_URL + '/rest/v1/rpc/is_admin', { method: 'POST', headers: { apikey: SB_KEY, Authorization: 'Bearer ' + tk, 'Content-Type': 'application/json' }, body: '{}' })
      .then(function (r) { return r.ok ? r.json().then(function (v) { v = v === true; try { sessionStorage.setItem(key, JSON.stringify({ t: Date.now(), v: v })); } catch (e) {} return v; }) : false; })   // hanya jawaban server yang sah yang diingat; token kedaluwarsa tidak boleh mengunci tombol
      .catch(function () { return c ? c.v : false; });
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
    var ac = curAC = new AbortController(), timer = setTimeout(function () { ac.abort(); }, 90000), r;
    try { r = await fetch(API, { method: 'POST', signal: ac.signal, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tk }, body: JSON.stringify(Object.assign({ stream: true }, payload)) }); }
    catch (e) { clearTimeout(timer); if (userStop) throw e; throw new Error(e.name === 'AbortError' ? 'Server terlalu lama menjawab (>90 dtk). Ketik /tes untuk diagnosa.' : 'Tidak bisa menghubungi server Jarvis (' + (e.message || 'jaringan') + '). Ketik /tes untuk diagnosa.'); }
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
      if (got.type === 'error') { var er = new Error(got.error || 'Jarvis gagal.'); er.extra = got; throw er; }
      return got;
    } finally { clearTimeout(timer); }
  }

  var RESUME_RE = /^\s*(ya\s+)?(tolong\s+)?(lanjut(kan|in)?|terus(kan|in)?|ulang(i)?|coba\s+lagi|gas|oke?\s+lanjut|sambung(kan)?)\W*$/i, pend = {};
  function panelModel() {   // pilihan penyedia/model dibagi dengan halaman Jarvis AI lewat localStorage
    function g(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }
    var provs = ['gemini']; try { var a = JSON.parse(g('bm-jarvis-providers') || 'null'); if (Array.isArray(a) && a.length) provs = a.filter(function (x) { return /^(gemini|claude|openai|meta)$/.test(x); }); if (!provs.length) provs = ['gemini']; } catch (e) {}
    var m = /^(gemini|claude|openai|meta)\|(.+)$/.exec(g('bm-jarvis-sel')), o = { providers: provs };
    if (m && provs.indexOf(m[1]) >= 0 && /^[A-Za-z0-9][A-Za-z0-9._:\-\/]{1,79}$/.test(m[2])) { o.provider = m[1]; o.model = m[2]; }
    var keys = {}; ['gemini', 'claude', 'openai', 'meta'].forEach(function (p) { var k = g('bm-jarvis-key-' + p); if (k) keys[p] = k; });   // kunci API pribadi di HP ini
    o.keys = keys;
    return o;
  }
  async function submit(text) {
    text = String(text || '').trim().slice(0, 1500);
    if (!text || busy) return;
    if (text.toLowerCase() === '/tes') { el.in.value = ''; return diagnose(); }
    busy = true; userStop = false; el.in.value = ''; setSendMode(true); stopListen(); pauseWake();
    var chips = el.log.querySelector('.bmj-chips'); if (chips) chips.remove();
    say('u', text);
    var orig = text, send = text, resume = null, rmodel = '', pd = pend.x;
    if (pd && RESUME_RE.test(text)) { orig = pd.text; send = pd.text.slice(0, 1150) + '\n(Lanjutkan permintaan ini dari titik terakhir; percobaan sebelumnya gagal: ' + pd.err + ')'; resume = pd.resume || null; rmodel = pd.model || ''; }
    delete pend.x;
    var R = newReply();
    var tick = setInterval(function () {                                   // tanda hidup: pengguna tahu AI masih bekerja
      var idle = Math.round((Date.now() - R.last) / 1000);
      if (idle >= 8) R.ht.textContent = 'Masih bekerja… (' + Math.round((Date.now() - R.t0) / 1000) + ' dtk)';
    }, 1500);
    try {
      var pm = panelModel(), acc = { actions: [], proposals: [], notas: [], reports: [], visuals: [] }, tries = 0, fin;
      for (;;) {
        try {
          fin = await stream({ message: send, history: history.slice(-10), providers: pm.providers, provider: pm.provider, model: pm.model, keys: pm.keys, resume: resume || undefined, resume_model: rmodel || undefined }, function (ev) {
            if (ev.type === 'status') setStatus(R, ev.text);
            else if (ev.type === 'step') onStep(R, ev);
          });
          break;
        } catch (e2) {
          var x = e2.extra || {};
          ['actions', 'proposals', 'notas', 'reports', 'visuals'].forEach(function (k) { if (x.partial && x.partial[k]) acc[k] = acc[k].concat(x.partial[k]); });
          if (x.resume) { resume = x.resume; rmodel = x.resume_model || rmodel; }
          if (x.auto && !userStop && tries < 5) {       // waktu server habis / batas langkah: lanjut sendiri
            tries++; onStep(R, { id: 'au' + tries, state: 'run', text: 'Melanjutkan otomatis' }); onStep(R, { id: 'au' + tries, state: 'ok', text: 'Bagian ' + (tries + 1) });
            await new Promise(function (rs) { setTimeout(rs, 500); }); if (userStop) throw e2; continue;
          }
          e2.extra = Object.assign({}, x, { partial: acc, resume: resume, resume_model: rmodel }); throw e2;
        }
      }
      ['actions', 'proposals', 'notas', 'reports', 'visuals'].forEach(function (k) { fin[k] = acc[k].concat(fin[k] || []); });
      clearInterval(tick); finishSteps(R, true);
      var reply = fin.reply || '…', blocks = parseBlocks(reply), reps = fin.reports || [];
      var ans = mk('div', '', 'bmj-ans'); renderBlocks(ans, blocks); R.wrap.appendChild(ans);
      var ctl = curCtl = { skip: false }; ans.onclick = function () { ctl.skip = true; };      // ketuk jawaban = lewati animasi
      speak(spokenOf(blocks, reps), resumeWake);                                              // suara jalan bersamaan dengan efek mengetik
      toBottom(true);
      await typeInto(ans, ctl);
      reps.forEach(function (r) { R.wrap.appendChild(renderReport(r)); });
      (fin.visuals || []).forEach(function (v) { ensureVisual().then(function () { R.wrap.appendChild(window.BMVisual.render(v)); toBottom(); }, function () { say('s', 'Modul grafik gagal dimuat.'); }); });
      (fin.notas || []).forEach(function (n) { ensureNota().then(function () { R.wrap.appendChild(window.BMNota.render(n)); toBottom(); }, function () { say('s', 'Modul nota gagal dimuat.'); }); });
      var hasTable = blocks.some(function (b) { return b.t === 'table'; });
      var report = reps.length || hasTable || /rangkum|ringkas|rekap|laporan|pdf|summary/i.test(text) || blocks.length >= 4;
      var acts = mk('div', '', 'bmj-acts bmj-fade');
      if (report) {
        var targets = reps.length ? reps : [null];
        targets.forEach(function (rp) {
          var bp = mk('button', '', 'bmj-pri', ICON_PDF + '<span></span>'), lab = bp.querySelector('span');
          var name = targets.length > 1 && rp ? 'PDF: ' + rp.title.slice(0, 22) : 'Unduh PDF'; lab.textContent = name;
          bp.onclick = async function () {
            bp.disabled = true; lab.textContent = 'Membuat PDF…';
            try { if (rp) await makeReportPdf(rp, blocks); else await makePdf(blocks, text); lab.textContent = 'PDF tersimpan ✓'; }
            catch (e) { lab.textContent = name; say('s', 'Gagal membuat PDF: ' + (e.message || e)); }
            setTimeout(function () { bp.disabled = false; lab.textContent = name; }, 2500);
          };
          acts.appendChild(bp);
        });
      }
      var bc = mk('button', '', '', ICON_COPY + '<span>Salin</span>');
      bc.onclick = function () { var t = reps.length ? reps.map(reportPlain).join('\n\n') : plainOf(blocks); (navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { bc.querySelector('span').textContent = 'Tersalin ✓'; }, function () { bc.querySelector('span').textContent = 'Gagal'; }); setTimeout(function () { bc.querySelector('span').textContent = 'Salin'; }, 1800); };
      acts.appendChild(bc); R.wrap.appendChild(acts);
      history.push({ role: 'user', text: orig }, { role: 'model', text: reply.slice(0, 1000) + (fin.visuals || []).map(function (v) { return '\n[Visual "' + v.judul + '" sudah ditampilkan sistem]'; }).join('') + reps.map(function (r) { return '\n[Tabel "' + r.title + '" (' + r.total_baris + ' baris) sudah ditampilkan sistem]'; }).join('') });
      if (history.length > 20) history = history.slice(-20);
      (fin.actions || []).forEach(runAction);
      (fin.proposals || []).forEach(showProposal);
      toBottom();
    } catch (e) {
      finishSteps(R, false);
      var stopped = userStop, ex = e.extra || {}; userStop = false;
      var em = stopped ? 'Dihentikan.' : (e.message || 'Jarvis gagal.');
      if (!stopped) {
        pend.x = { text: orig, err: String(em).slice(0, 120), resume: ex.resume, model: ex.resume_model };
        history.push({ role: 'user', text: orig }, { role: 'model', text: '[Permintaan di atas GAGAL di tengah jalan: ' + String(em).slice(0, 120) + '. Jika admin menjawab "lanjut", kerjakan permintaan itu sampai selesai, jangan tanya ulang.]' });
        if (history.length > 20) history = history.slice(-20);
        em += '\nKetik "lanjut" untuk meneruskan.';
      }
      R.wrap.appendChild(tx('div', 'bmj-m bmj-s', em)); resumeWake();
      var pt = ex.partial || {};
      (pt.reports || []).forEach(function (r) { R.wrap.appendChild(renderReport(r)); });
      (pt.visuals || []).forEach(function (v) { ensureVisual().then(function () { R.wrap.appendChild(window.BMVisual.render(v)); }); });
      (pt.actions || []).forEach(runAction); (pt.proposals || []).forEach(showProposal); toBottom();
    } finally { clearInterval(tick); busy = false; curAC = null; curCtl = null; setSendMode(false); }
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

  function ensureVisual() {
    if (window.BMVisual) return Promise.resolve();
    return new Promise(function (ok, no) { var sc = document.createElement('script'); sc.src = '/bm-visual.js'; sc.onload = ok; sc.onerror = no; document.head.appendChild(sc); });
  }
  function ensureNota() {
    if (window.BMNota) return Promise.resolve();
    return new Promise(function (ok, no) { var sc = document.createElement('script'); sc.src = '/bm-nota.js'; sc.onload = ok; sc.onerror = no; document.head.appendChild(sc); });
  }
  /* ---------- aksi tampilan (tidak mengubah data) ---------- */
  function applySetting(a) {
    var T = window.BMTheme, v = a.value, b = document.body;
    if (a.key === 'tema') {
      var light = v === 'toggle' ? !b.classList.contains('theme-light') : v === 'light';
      b.classList.toggle('theme-light', light); try { localStorage.setItem('bm-theme', light ? 'light' : 'dark'); } catch (e) {}
      var cb = document.getElementById('themeCheckbox'); if (cb) cb.checked = !light;
      say('s', 'Tema ' + (light ? 'terang' : 'gelap') + ' dipasang.');
    } else if (a.key === 'tebal') {
      b.classList.toggle('font-bold-mode', v === 'on'); try { if (v === 'on') localStorage.setItem('bm-font-bold', 'on'); else localStorage.removeItem('bm-font-bold'); } catch (e) {}
      say('s', 'Teks tebal ' + (v === 'on' ? 'aktif' : 'mati') + '.');
    } else if (a.key === 'font' && T) { T.setFont(v); say('s', 'Font diganti: ' + v + '.'); }
    else if (a.key === 'warna' && T) { T.saveAccent(v); say('s', 'Warna aksen diganti: ' + v + '.'); }
    else if (a.key === 'bahasa') { try { localStorage.setItem('bm-lang', v); } catch (e) {} say('s', 'Bahasa disimpan; memuat ulang…'); setTimeout(function () { location.reload(); }, 600); }
  }
  function deepFolder() {   // ?jv_folder=ID dari halaman Jarvis AI -> pilih folder begitu data dashboard siap
    var m = /[?&]jv_folder=([0-9a-f\-]{36})/i.exec(location.search); if (!m) return;
    var id = m[1], n = 0, iv = setInterval(function () {
      n++;
      if (typeof selectCategory === 'function' && typeof categoriesData !== 'undefined' && categoriesData.some(function (c) { return c.id === id; })) { clearInterval(iv); try { selectCategory(id); } catch (e) {} try { history.replaceState(null, '', location.pathname); } catch (e) {} }
      else if (n > 40) clearInterval(iv);
    }, 400);
  }
  // Di luar dashboard (editor, kasir, profil, ...): pindah ke alamat yang dikirim server (daftar putih).
  var ON_DASH = /\/dashboard-admin\.html$/.test(location.pathname);
  function navTo(url) {
    if (!/^\/[a-z0-9\-]+\.html(\?[A-Za-z0-9_=&%.\-]*)?$/.test(url || '')) return false;
    setTimeout(function () { (inHub ? window.parent : window).location.href = url; }, 500);
    return true;
  }
  function runAction(a) {
    try {
      if (!ON_DASH && (a.type === 'open_folder' || a.type === 'open_editor' || a.type === 'open_note')) {
        closeSheet(); if (!navTo(a.url)) say('s', 'Perintah itu hanya bisa dijalankan dari Dashboard.'); return;
      }
      if (a.type === 'open_folder') {
        closeSheet();
        if (typeof selectCategory === 'function' && typeof categoriesData !== 'undefined' && categoriesData.some(function (c) { return c.id === a.folder_id; })) selectCategory(a.folder_id);
        else if (typeof loadNotesForCategory === 'function') loadNotesForCategory(a.folder_id);
      } else if (a.type === 'open_editor') {
        closeSheet();
        if (typeof openEditor === 'function') openEditor(a.note_id, { folder: a.folder_id || undefined, rec: a.rec || undefined });
        else say('s', 'Editor belum siap, coba lagi sebentar.');
      } else if (a.type === 'open_note') {
        closeSheet();
        var inView = typeof notesData !== 'undefined' && notesData.some(function (n) { return n.id === a.note_id; });
        if (inView && typeof openNoteDetail === 'function') openNoteDetail(a.note_id);
        else if (typeof openEditor === 'function') openEditor(a.note_id, a.folder_id ? { folder: a.folder_id } : {});
      } else if (a.type === 'goto') {
        closeSheet(); say('s', 'Membuka ' + (a.name || 'halaman') + '…');
        if (ON_DASH && String(a.url || '').indexOf('/dashboard-admin.html') === 0) return;   // sudah di Dashboard
        navTo(a.url);
      } else if (a.type === 'setting') {
        applySetting(a);
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
    var row = mk('div', '', 'bmj-pb'), no = mk('button'), ok = mk('button', '', 'bmj-ok');
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
    deepFolder();
    var building = false;
    function tryBuild() {   // hanya muncul untuk admin yang sudah login (server tetap cek admin di setiap permintaan)
      if (el.fab || building) return Promise.resolve(false);
      building = true;
      return token().then(function (tk) { return tk ? adminCheck(tk) : false; })
        .then(function (ok) { building = false; if (ok && !el.fab) { build(); return true; } return false; }, function () { building = false; return false; });
    }
    tryBuild();
    /* Token bisa belum segar saat halaman dibuka (disegarkan klien Supabase beberapa detik kemudian, di tab yang sama
       sehingga event storage tidak terpicu). Coba lagi berkala sampai tombol muncul, tanpa perlu memuat ulang halaman. */
    var tries = 0;
    (function again() { if (el.fab) return; tries++; setTimeout(function () { if (el.fab) return; if (document.visibilityState === 'visible') tryBuild(); again(); }, tries < 20 ? 2000 : 30000); })();
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible' && !el.fab) tryBuild(); });
    window.addEventListener('focus', function () { if (!el.fab) tryBuild(); });
    refreshHook = tryBuild;
    if (typeof supabaseClient !== 'undefined' && supabaseClient && supabaseClient.auth) { try { supabaseClient.auth.onAuthStateChange(function (ev, ses) { if (ses && !el.fab) tryBuild(); }); } catch (e) {} }
    window.addEventListener('storage', function (e) { if (e.key === 'bmtech-auth' && !el.fab) tryBuild(); });
  }
  var refreshHook = null;
  window.BMJarvis = { open: function () { if (el.sheet) openSheet(); }, ask: function (t) { if (el.sheet) { openSheet(); submit(t); } }, refresh: function () { if (refreshHook && !el.fab) refreshHook(); } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
