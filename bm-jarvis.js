/*!
 * bm-jarvis.js — asisten AI "Jarvis" (suara + teks) untuk dashboard-admin.html
 *
 * Muat SETELAH klien Supabase dibuat:   <script src="/bm-jarvis.js" defer></script>
 *
 *  - Tombol melayang (kiri bawah) -> panel chat. Mic = bicara; ketik = teks.
 *  - Semua "otak" ada di server (/api/jarvis). Di sini TIDAK ada kunci Gemini.
 *  - Jarvis hanya MENGUSULKAN perubahan data; admin wajib menekan "Setuju" di layar.
 *  - Mode "Hai Jarvis" (opsional, default mati): mendengarkan terus selama halaman terbuka & di depan layar.
 *  - Teks pengguna dirender dengan textContent (tanpa innerHTML) -> aman dari XSS.
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

  /* ---------- UI ---------- */
  var css = '\
#bmj-fab{position:fixed;right:16px;bottom:calc(96px + env(safe-area-inset-bottom,0px));touch-action:none;z-index:2000;width:52px;height:52px;border-radius:50%;border:1px solid rgba(var(--accent-rgb,240,165,41),.55);background:radial-gradient(circle at 30% 30%,rgba(var(--accent-rgb,240,165,41),.35),rgba(18,18,20,.92));color:var(--accent-yellow,#F0A529);display:flex;align-items:center;justify-content:center;box-shadow:0 6px 22px rgba(0,0,0,.45),0 0 18px var(--accent-yellow-glow,rgba(240,165,41,.28));cursor:pointer;-webkit-tap-highlight-color:transparent;transition:transform .15s}\
#bmj-fab:active{transform:scale(.9)}#bmj-fab svg{width:26px;height:26px}\
#bmj-fab.bmj-hot{animation:bmjPulse 1.2s infinite}\
@keyframes bmjPulse{0%{box-shadow:0 0 0 0 rgba(var(--accent-rgb,240,165,41),.6)}100%{box-shadow:0 0 0 18px rgba(var(--accent-rgb,240,165,41),0)}}\
#bmj-ov{position:fixed;inset:0;z-index:2001;background:rgba(0,0,0,.5);opacity:0;pointer-events:none;transition:opacity .2s}\
#bmj-ov.on{opacity:1;pointer-events:auto}\
#bmj-sheet{position:fixed;left:0;right:0;bottom:0;z-index:2002;max-height:82vh;height:82vh;display:flex;flex-direction:column;background:var(--card-surface-dark,#121214);color:var(--text-primary,#fff);border-radius:22px 22px 0 0;border:1px solid var(--card-border-dark,rgba(255,255,255,.08));transform:translateY(105%);transition:transform .28s cubic-bezier(.2,.8,.2,1);font-family:inherit;max-width:640px;margin:0 auto;padding-bottom:env(safe-area-inset-bottom,0px)}\
#bmj-sheet.on{transform:translateY(0)}\
.bmj-h{display:flex;align-items:center;gap:8px;padding:14px 14px 10px}\
.bmj-h b{flex:1;font-size:16px;letter-spacing:.14em}.bmj-h b i{font-style:normal;color:var(--accent-yellow,#F0A529)}\
.bmj-ib{width:34px;height:34px;border-radius:50%;border:1px solid var(--glass-pill-border,rgba(255,255,255,.12));background:var(--glass-pill-bg,rgba(255,255,255,.09));color:var(--text-secondary,#aaa);display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:11px;font-weight:700}\
.bmj-ib.on{color:var(--on-accent,#1C1B19);background:var(--accent-yellow,#F0A529)}\
.bmj-ib svg{width:17px;height:17px}\
#bmj-log{flex:1;overflow-y:auto;padding:4px 14px 8px;display:flex;flex-direction:column;gap:9px;-webkit-overflow-scrolling:touch}\
.bmj-m{max-width:86%;padding:9px 13px;border-radius:16px;font-size:14px;line-height:1.45;white-space:pre-wrap;word-break:break-word}\
.bmj-u{align-self:flex-end;background:var(--accent-yellow,#F0A529);color:var(--on-accent,#1C1B19);border-bottom-right-radius:5px}\
.bmj-a{align-self:flex-start;background:var(--glass-pill-bg,rgba(255,255,255,.09));border-bottom-left-radius:5px}\
.bmj-s{align-self:center;font-size:12px;color:var(--text-secondary,#8a8a90);text-align:center}\
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
.bmj-dots{display:inline-flex;gap:4px}.bmj-dots i{width:6px;height:6px;border-radius:50%;background:currentColor;opacity:.4;animation:bmjD 1s infinite}.bmj-dots i:nth-child(2){animation-delay:.15s}.bmj-dots i:nth-child(3){animation-delay:.3s}\
@keyframes bmjD{50%{opacity:1;transform:translateY(-3px)}}\
body.theme-light #bmj-sheet{background:#fff;color:#111}body.theme-light .bmj-a{background:rgba(0,0,0,.07)}body.theme-light #bmj-in{color:#111}';

  var ICON_BOT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.2"/><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21"/></svg>';
  var ICON_MIC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>';
  var ICON_SEND = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2 11 13M22 2l-7 20-4-9-9-4z"/></svg>';
  var ICON_SPK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4zM15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/></svg>';

  var el = {};
  function mk(tag, id, cls, html) { var e = document.createElement(tag); if (id) e.id = id; if (cls) e.className = cls; if (html) e.innerHTML = html; return e; }   // html hanya utk ikon/markup statis kita sendiri

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
    el.log = mk('div', 'bmj-log');
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
    say('s', 'Halo. Coba: "buka buku besar", "cari Puji Bengkel", "tambah data di buku besar". Perubahan data selalu minta persetujuanmu dulu.');
    if (wakeOn) startWake();
  }
  function paintToggles() {
    el.spk.classList.toggle('on', voiceOut); el.wake.classList.toggle('on', wakeOn);
    el.spk.style.display = canSpeak ? '' : 'none';
    el.fab.classList.toggle('bmj-hot', wakeOn && !sheetOpen);
  }
  function openSheet() { sheetOpen = true; el.ov.classList.add('on'); el.sheet.classList.add('on'); paintToggles(); setTimeout(function () { el.log.scrollTop = el.log.scrollHeight; }, 50); }
  function closeSheet() { sheetOpen = false; el.ov.classList.remove('on'); el.sheet.classList.remove('on'); stopListen(); stopSpeak(); paintToggles(); }

  function say(kind, text) {
    var d = mk('div', '', 'bmj-m ' + (kind === 'u' ? 'bmj-u' : kind === 'a' ? 'bmj-a' : 'bmj-s'));
    d.textContent = text; el.log.appendChild(d); el.log.scrollTop = el.log.scrollHeight; return d;
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

  /* ---------- suara keluar ---------- */
  function stopSpeak() { if (canSpeak) try { speechSynthesis.cancel(); } catch (e) {} }
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

  /* ---------- kirim ke server ---------- */
  async function token() {
    try { var r = await supabaseClient.auth.getSession(); return r && r.data && r.data.session ? r.data.session.access_token : ''; } catch (e) { return ''; }
  }
  async function post(payload) {
    var tk = await token();
    if (!tk) throw new Error('Sesi login habis. Muat ulang halaman dan login lagi.');
    var ac = new AbortController(), to = setTimeout(function () { ac.abort(); }, 60000);
    var r;
    try { r = await fetch(API, { method: 'POST', signal: ac.signal, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tk }, body: JSON.stringify(payload) }); }
    catch (e) { throw new Error(e.name === 'AbortError' ? 'Server terlalu lama menjawab (>60 dtk). Ketik /tes untuk diagnosa.' : 'Tidak bisa menghubungi server Jarvis (' + (e.message || 'jaringan') + '). Ketik /tes untuk diagnosa.'); }
    finally { clearTimeout(to); }
    var j = await r.json().catch(function () { return {}; });
    if (!r.ok) throw new Error(j.error || ('Gagal (' + r.status + ')'));
    return j;
  }
  async function submit(text) {
    text = String(text || '').trim().slice(0, 1500);
    if (!text || busy) return;
    if (text.toLowerCase() === '/tes') { el.in.value = ''; return diagnose(); }
    busy = true; el.in.value = ''; el.send.disabled = true; stopListen(); pauseWake();
    say('u', text);
    var wait = say('a', ''); wait.innerHTML = '<span class="bmj-dots"><i></i><i></i><i></i></span>';
    try {
      var j = await post({ message: text, history: history.slice(-10) });
      wait.textContent = j.reply || '…';
      history.push({ role: 'user', text: text }, { role: 'model', text: j.reply || '' });
      if (history.length > 20) history = history.slice(-20);
      (j.actions || []).forEach(runAction);
      (j.proposals || []).forEach(showProposal);
      el.log.scrollTop = el.log.scrollHeight;
      speak(j.reply, resumeWake);
    } catch (e) {
      wait.textContent = e.message || 'Jarvis gagal.'; wait.className = 'bmj-m bmj-s'; resumeWake();
    } finally { busy = false; el.send.disabled = false; }
  }

  async function diagnose() {
    var w = say('s', 'Mendiagnosa…'); busy = true;
    try {
      var tk = await token(); if (!tk) throw new Error('Tidak ada sesi login');
      var r = await fetch(API, { headers: { Authorization: 'Bearer ' + tk } });
      var txt = await r.text(), j = null; try { j = JSON.parse(txt); } catch (e) {}
      if (!j) { w.textContent = 'Server membalas HTTP ' + r.status + ' tapi bukan JSON. Kemungkinan /api/jarvis belum ter-deploy (cek file ada di folder api/ lalu Redeploy).'; return; }
      if (j.error) { w.textContent = 'HTTP ' + r.status + ': ' + j.error; return; }
      w.textContent = 'Server Jarvis aktif.\n' + j.hasil.map(function (h) { return (h.ok ? '✓ ' : '✗ ') + h.model + ' (' + h.ms + ' ms)' + (h.error ? '\n   ' + h.error : ''); }).join('\n');
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
    el.log.appendChild(box); el.log.scrollTop = el.log.scrollHeight;
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
