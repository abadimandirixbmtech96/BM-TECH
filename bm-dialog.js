// BM-TECH: pop-up sendiri (bahasa Indonesia) pengganti alert()/confirm() bawaan browser
// yang judulnya berbahasa Inggris ("... says", "Leave site?") dan tidak bisa diubah.
//   alert('teks')                      -> pop-up dengan satu tombol "Mengerti" (tidak memblokir kode setelahnya)
//   await bmConfirm('teks', {ok, cancel, title, danger})  -> true bila dipilih tombol utama
(function (w) {
  'use strict';
  if (w.__bmDialogReady) return;
  w.__bmDialogReady = true;

  const css = `
  .bmd-ov{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(20,16,8,.55);-webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px);opacity:0;transition:opacity .18s ease;font-family:inherit}
  .bmd-ov.show{opacity:1}
  .bmd-card{width:100%;max-width:360px;background:#FBF7EE;color:#2A2216;border-radius:22px;padding:22px 20px 16px;box-shadow:0 18px 50px rgba(0,0,0,.35);transform:translateY(10px) scale(.97);transition:transform .2s cubic-bezier(.2,.9,.3,1.2)}
  .bmd-ov.show .bmd-card{transform:none}
  .bmd-ico{width:44px;height:44px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:#FCE9C4;color:#B57A0A;margin:0 auto 10px}
  .bmd-ico.err{background:#F9D9D6;color:#B3261E}
  .bmd-ico svg{width:24px;height:24px}
  .bmd-title{margin:0 0 6px;text-align:center;font-size:18px;font-weight:800}
  .bmd-text{margin:0 0 16px;text-align:center;font-size:14.5px;line-height:1.5;white-space:pre-wrap;overflow-wrap:anywhere;color:#4A3F2C;max-height:50vh;overflow:auto}
  .bmd-row{display:flex;gap:10px}
  .bmd-btn{flex:1;border:0;border-radius:14px;padding:12px 10px;font:inherit;font-size:15px;font-weight:700;cursor:pointer;background:#F0A529;color:#1C1B19}
  .bmd-btn.sec{background:#EDE5D3;color:#4A3F2C}
  .bmd-btn.danger{background:#C24444;color:#fff}
  .bmd-btn:active{transform:scale(.97)}
  @media (prefers-color-scheme: dark){
    .bmd-card{background:#2B2620;color:#F4EEDF}
    .bmd-text{color:#D9D0BD}
    .bmd-btn.sec{background:#3C352B;color:#E7DFCB}
    .bmd-ico{background:#4A3A18;color:#F5B84A}
    .bmd-ico.err{background:#4D2522;color:#FF9A92}
  }`;
  const st = document.createElement('style');
  st.textContent = css;
  (document.head || document.documentElement).appendChild(st);

  const ICON_INFO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>';
  const ICON_ERR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';

  const queue = [];
  let showing = false;

  function pump() {
    if (showing || !queue.length) return;
    showing = true;
    const job = queue.shift();
    const ov = document.createElement('div');
    ov.className = 'bmd-ov';
    ov.setAttribute('role', 'alertdialog');
    ov.setAttribute('aria-modal', 'true');
    const card = document.createElement('div');
    card.className = 'bmd-card';
    const ico = document.createElement('div');
    ico.className = 'bmd-ico' + (job.error ? ' err' : '');
    ico.innerHTML = job.error ? ICON_ERR : ICON_INFO;
    const h = document.createElement('h3');
    h.className = 'bmd-title';
    h.textContent = job.title;
    const p = document.createElement('p');
    p.className = 'bmd-text';
    p.textContent = job.text;
    const row = document.createElement('div');
    row.className = 'bmd-row';
    function done(v) {
      document.removeEventListener('keydown', onKey, true);
      ov.classList.remove('show');
      setTimeout(() => { ov.remove(); showing = false; job.resolve(v); pump(); }, 160);
    }
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(false); }
    }
    if (job.confirm) {
      const b1 = document.createElement('button');
      b1.className = 'bmd-btn sec'; b1.type = 'button'; b1.textContent = job.cancel;
      b1.addEventListener('click', () => done(false));
      row.appendChild(b1);
    }
    const b2 = document.createElement('button');
    b2.className = 'bmd-btn' + (job.danger ? ' danger' : ''); b2.type = 'button'; b2.textContent = job.ok;
    b2.addEventListener('click', () => done(true));
    row.appendChild(b2);
    card.append(ico, h, p, row);
    ov.appendChild(card);
    document.body.appendChild(ov);
    document.addEventListener('keydown', onKey, true);
    try { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); } catch (e) {}   // tutup keyboard
    requestAnimationFrame(() => { ov.classList.add('show'); try { b2.focus({ preventScroll: true }); } catch (e) {} });
  }

  function guessTitle(text) {
    return /^\s*(gagal|terjadi error|error|tidak bisa|tidak dapat)/i.test(text) ? 'Gagal' : 'Perhatian';
  }

  w.__nativeAlert = w.__nativeAlert || w.alert.bind(w);
  w.alert = function (msg) {
    const text = String(msg == null ? '' : msg).trim();
    if (!document.body) { w.__nativeAlert(text); return; }
    const title = guessTitle(text);
    queue.push({ text, title, error: title === 'Gagal', ok: 'Mengerti', resolve: () => {} });
    pump();
  };

  w.bmConfirm = function (msg, opts) {
    opts = opts || {};
    const text = String(msg == null ? '' : msg).trim();
    if (!document.body) return Promise.resolve(w.confirm(text));
    return new Promise(resolve => {
      queue.push({ text, confirm: true, title: opts.title || 'Konfirmasi', ok: opts.ok || 'Ya', cancel: opts.cancel || 'Batal', danger: !!opts.danger, error: false, resolve });
      pump();
    });
  };
})(window);
