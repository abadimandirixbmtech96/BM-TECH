/*
 * BM-TECH: gestur geser dari tepi kiri layar = "kembali" (untuk iPhone/iPad yang tidak punya tombol back).
 *
 * Cara kerja: gestur memanggil history.back(), yaitu jalur yang sama dengan tombol back Android,
 * sehingga dashboard menutup lapisan paling atas (panel editor, sheet, layar Settings, dst.) satu per satu.
 *
 * Aturan aman:
 * - Hanya aktif kalau ADA yang bisa ditutup. Di dashboard: lewat window.__bmCanBack() yang disediakan
 *   dashboard. Di halaman yang dibuka sebagai panel (di dalam iframe): selalu aktif.
 *   Halaman yang dibuka sendiri (bukan panel) tidak dibajak, supaya tidak keluar aplikasi tanpa sengaja.
 * - Mulai dari tepi kiri (24px), geser ke kanan minimal 72px, hampir lurus mendatar.
 * - Kalau sistem (Safari) mengambil alih gestur dan mengirim touchcancel, kita tidak melakukan apa-apa.
 */
(function () {
  'use strict';
  if (window.__bmSwipeBack) return;
  window.__bmSwipeBack = true;

  var EDGE = 24, TRIGGER = 72, MAX_DY = 60, COOLDOWN = 700;
  var inFrame = window.parent !== window;
  var startX = 0, startY = 0, active = false, lastFire = 0, hint = null;

  function canGoBack() {
    try {
      if (typeof window.__bmCanBack === 'function') return !!window.__bmCanBack();
    } catch (e) {}
    return inFrame;
  }

  function ensureHint() {
    if (hint) return hint;
    hint = document.createElement('div');
    hint.setAttribute('aria-hidden', 'true');
    hint.style.cssText = 'position:fixed;left:0;top:50%;width:40px;height:40px;margin-top:-20px;border-radius:50%;' +
      'background:rgba(0,0,0,.55);color:#fff;display:flex;align-items:center;justify-content:center;' +
      'z-index:2147483647;pointer-events:none;opacity:0;transform:translateX(-48px);will-change:transform,opacity;';
    hint.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>';
    (document.body || document.documentElement).appendChild(hint);
    return hint;
  }
  function showHint(p) {
    var h = ensureHint();
    h.style.transition = 'none';
    h.style.opacity = String(Math.min(1, p * 1.4));
    h.style.transform = 'translateX(' + (-48 + 64 * Math.min(1, p)) + 'px)';
  }
  function hideHint() {
    if (!hint) return;
    hint.style.transition = 'opacity .18s ease, transform .18s ease';
    hint.style.opacity = '0';
    hint.style.transform = 'translateX(-48px)';
  }

  document.addEventListener('touchstart', function (e) {
    active = false;
    if (e.touches.length !== 1) return;
    var t = e.touches[0];
    if (t.clientX > EDGE) return;
    if (Date.now() - lastFire < COOLDOWN) return;
    if (!canGoBack()) return;
    startX = t.clientX; startY = t.clientY; active = true;
  }, { passive: true });

  document.addEventListener('touchmove', function (e) {
    if (!active) return;
    var t = e.touches[0];
    var dx = t.clientX - startX, dy = Math.abs(t.clientY - startY);
    if (dy > MAX_DY && dy > dx) { active = false; hideHint(); return; }
    if (dx > 6) showHint(dx / TRIGGER);
  }, { passive: true });

  document.addEventListener('touchend', function (e) {
    if (!active) return;
    active = false;
    var t = e.changedTouches[0];
    var dx = t.clientX - startX, dy = Math.abs(t.clientY - startY);
    hideHint();
    if (dx >= TRIGGER && dy <= MAX_DY && canGoBack()) {
      lastFire = Date.now();
      history.back();
    }
  }, { passive: true });

  document.addEventListener('touchcancel', function () { active = false; hideHint(); }, { passive: true });
})();
