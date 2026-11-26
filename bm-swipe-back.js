(function () {
  'use strict';
  if (window.__bmSwipeBack) return;
  window.__bmSwipeBack = true;

  var EDGE = 28, MIN_DX = 10, MAX_DY = 70, COOLDOWN = 600;
  var EASE = 'cubic-bezier(.32,.72,0,1)';
  var inFrame = window.parent !== window;
  var st = null, lastFire = 0, hint = null;

  var layers = [], uid = 0, zomb = [], skip = [], pend = [], later = [];
  function drain() {
    while (!skip.length && pend.length) { try { history.pushState({ bmLayer: pend.shift() }, ''); } catch (e) {} }
    while (!skip.length && !pend.length && later.length) later.shift()();
  }
  function drop(id, then) {
    if (history.state && history.state.bmLayer === id) {
      skip.push(then || null);
      try { history.back(); } catch (e) { skip.pop(); if (then) then(); }
    } else { zomb.push(id); if (then) then(); }
  }
  function settle() {
    var s = history.state && history.state.bmLayer, zi = s ? zomb.indexOf(s) : -1;
    if (zi < 0) return;
    zomb.splice(zi, 1); skip.push(null);
    try { history.back(); } catch (e) { skip.pop(); }
  }
  var api = window.bmLayer = {
    open: function (close) {
      var id = ++uid;
      layers.push({ id: id, close: close });
      if (skip.length) pend.push(id);
      else { try { history.pushState({ bmLayer: id }, ''); } catch (e) {} }
      return id;
    },
    closed: function (id, then) {
      var i = layers.length - 1;
      while (i >= 0 && layers[i].id !== id) i--;
      if (i < 0) { if (then) then(); return; }
      layers.splice(i, 1);
      var pi = pend.indexOf(id);
      if (pi >= 0) { pend.splice(pi, 1); if (then) then(); return; }
      if (skip.length) { later.push(function () { drop(id, then); }); return; }
      drop(id, then);
    },
    after: function (fn) {
      Promise.resolve().then(function () { if (skip.length || pend.length) later.push(fn); else fn(); });
    },
    watch: function (el, cls, close) {
      if (!el) return;
      var id = 0;
      function sync() {
        var on = el.classList.contains(cls);
        if (on && !id) {
          id = api.open(function () { id = 0; if (close) close(); else el.classList.remove(cls); });
        } else if (!on && id) {
          var x = id; id = 0; api.closed(x);
        }
      }
      new MutationObserver(sync).observe(el, { attributes: true, attributeFilter: ['class'] });
      sync();
    },
    views: function (cfg) {
      var els = [].slice.call(document.querySelectorAll(cfg.sel || '.view')), id = 0;
      function active() { for (var i = 0; i < els.length; i++) if (els[i].classList.contains('active')) return els[i]; return null; }
      function leave() {
        id = 0; arm();
        var cur = active(), name = cur && cfg.backs[cur.id.replace(/^view-/, '')], btn = name && document.getElementById(name);
        if (btn) btn.click();
      }
      function arm() { id = api.open(leave); }
      function sync() {
        var a = active(), away = !!a && a.id !== cfg.home;
        if (away && !id) arm();
        else if (!away && id) { var x = id; id = 0; api.closed(x); }
      }
      els.forEach(function (e) { new MutationObserver(sync).observe(e, { attributes: true, attributeFilter: ['class'] }); });
      sync();
    },
    count: function () { return layers.length; }
  };
  window.addEventListener('popstate', function () {
    if (skip.length) { var cb = skip.shift(); if (cb) cb(); if (!skip.length) settle(); drain(); return; }
    var l = layers.pop();
    if (l) { try { l.close(); } catch (e) {} }
    settle();
  });

  function innerLayerOpen() {
    if (layers.length) return true;
    try { if (typeof window.__bmCanBack === 'function') return !!window.__bmCanBack(); } catch (e) {}
    return false;
  }
  function layerFrame() {
    try {
      var fe = window.frameElement;
      if (fe && /^(dashHub|recapHub)$/.test(fe.id) && fe.classList.contains('on')) return fe;
    } catch (e) {}
    return null;
  }
  function hasAppHistory() {
    try {
      if (history.state && typeof history.state === 'object' && Object.keys(history.state).length) return true;
      return history.length > 1 && !!document.referrer && new URL(document.referrer).origin === location.origin;
    } catch (e) { return false; }
  }
  function modeNow() {
    if (innerLayerOpen()) return 'hint';
    if (layerFrame()) return 'frame';
    if (inFrame) return 'hint';
    if (history.state && typeof history.state === 'object' && Object.keys(history.state).length) return 'hint';
    if (hasAppHistory()) return 'page';
    return null;
  }
  function ensureHint() {
    if (hint) return hint;
    hint = document.createElement('div');
    hint.setAttribute('aria-hidden', 'true');
    hint.style.cssText = 'position:fixed;left:0;top:50%;width:40px;height:40px;margin-top:-20px;border-radius:50%;' +
      'background:rgba(0,0,0,.55);color:#fff;display:flex;align-items:center;justify-content:center;' +
      '-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);' +
      'z-index:2147483647;pointer-events:none;opacity:0;transform:translateX(-48px);will-change:transform,opacity;';
    hint.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>';
    (document.body || document.documentElement).appendChild(hint);
    return hint;
  }
  function showHint(p) {
    var h = ensureHint();
    h.style.transition = 'none';
    h.style.opacity = String(Math.min(1, p * 1.4));
    h.style.transform = 'translateX(' + (-48 + 64 * Math.min(1, p)) + 'px) scale(' + (0.8 + 0.2 * Math.min(1, p)) + ')';
  }
  function hideHint() {
    if (!hint) return;
    hint.style.transition = 'opacity .2s ease, transform .25s ' + EASE;
    hint.style.opacity = '0';
    hint.style.transform = 'translateX(-48px)';
  }
  function parentRoot(el) { try { return el && el.ownerDocument !== document ? el.ownerDocument.documentElement : null; } catch (e) { return null; } }
  function moveEl(el, x, anim, done) {
    var pr = parentRoot(el);
    if (pr) {
      pr.classList.toggle('bm-dragging', !anim);
      pr.style.setProperty('--bm-pull', String(Math.max(0, Math.min(1, x / (window.innerWidth || 375)))));
      if (anim && x === 0) setTimeout(function () { pr.style.removeProperty('--bm-pull'); }, anim + 20);
    }
    el.style.transition = anim ? 'transform ' + anim + 'ms ' + EASE + ', box-shadow ' + anim + 'ms ' + EASE : 'none';
    el.style.transform = 'translate3d(' + x + 'px,0,0)';
    el.style.boxShadow = x > 0 ? '-12px 0 32px rgba(0,0,0,.28)' : '';
    if (done) setTimeout(done, anim + 20);
  }
  function resetEl(el) { if (!el) return; el.style.transition = ''; el.style.transform = ''; el.style.boxShadow = ''; el.style.willChange = ''; var pr = parentRoot(el); if (pr) { pr.classList.remove('bm-dragging'); pr.style.removeProperty('--bm-pull'); } }

  function goBack(mode) {
    lastFire = Date.now();
    if (mode === 'frame') {

      try { var ps = window.parent.history.state; if (!(ps && (ps.bmHub || ps.bmRecap))) { window.parent.postMessage({ type: 'bm-nav', to: 'profile', from: window.frameElement.id }, location.origin); return; } } catch (e) {}
    }
    if (mode === 'page') { window.__bmSwipeNav = true; try { sessionStorage.setItem('bm-swipe-nav', '1'); } catch (e) {} }
    history.back();
  }
  document.addEventListener('touchstart', function (e) {
    st = null;
    if (e.touches.length !== 1) return;
    var t = e.touches[0];
    if (t.clientX > EDGE || Date.now() - lastFire < COOLDOWN) return;
    var mode = modeNow();
    if (!mode) return;
    var el = mode === 'frame' ? layerFrame() : mode === 'page' ? document.documentElement : null;
    st = { mode: mode, el: el, x0: t.clientX, y0: t.clientY, dx: 0, lock: false, t: Date.now(), vx: 0, lx: t.clientX, lt: Date.now() };
  }, { passive: true });

  document.addEventListener('touchmove', function (e) {
    if (!st) return;
    var t = e.touches[0];
    var dx = t.clientX - st.x0, dy = Math.abs(t.clientY - st.y0);
    if (!st.lock) {
      if (dy > MAX_DY || (dy > 12 && dy > dx)) { cancel(); return; }
      if (dx < MIN_DX) return;
      st.lock = true;
      if (st.el) st.el.style.willChange = 'transform';
    }
    var now = Date.now();
    st.vx = (t.clientX - st.lx) / Math.max(1, now - st.lt); st.lx = t.clientX; st.lt = now;
    st.dx = Math.max(0, dx);
    if (st.el) moveEl(st.el, st.dx, 0);
    else showHint(st.dx / 80);
  }, { passive: true });

  function cancel() {
    if (!st) return;
    var s = st; st = null;
    hideHint();
    if (s.el && s.lock) moveEl(s.el, 0, 260, function () { resetEl(s.el); });
  }

  document.addEventListener('touchend', function () {
    if (!st) return;
    var s = st; st = null;
    if (!s.lock) return;
    var w = window.innerWidth || 375;
    var commit = s.el ? (s.dx > w * 0.33 || (s.vx > 0.45 && s.dx > 40)) : s.dx >= 72;
    hideHint();
    if (!commit) { if (s.el) moveEl(s.el, 0, 260, function () { resetEl(s.el); }); return; }
    if (!s.el) { goBack(); return; }

    var left = Math.max(120, Math.min(320, (w - s.dx) / Math.max(0.6, s.vx)));
    moveEl(s.el, w, left, function () {
      goBack(s.mode);
      if (s.mode === 'frame') {
        setTimeout(function () { s.el.style.transition = ''; s.el.style.transform = ''; s.el.style.boxShadow = ''; }, 250);
        setTimeout(function () { resetEl(s.el); }, 650);
      }
      else setTimeout(function () { resetEl(s.el); }, 700);
    });
  }, { passive: true });

  document.addEventListener('touchcancel', cancel, { passive: true });
  window.addEventListener('pageshow', function () { resetEl(document.documentElement); });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape' || e.defaultPrevented || e.isComposing) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    var el = document.activeElement;
    var tag = el && el.tagName;
    var typing = el && (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable);
    if (typing) { el.blur(); return; }
    if (Date.now() - lastFire < 250) return;
    if (!modeNow()) return;
    e.preventDefault();
    goBack();
  });
})();
