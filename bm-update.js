/* BM-TECH: pemberitahuan "ada versi baru". Jika service worker baru mengambil alih saat halaman ini masih berjalan
   dengan kode lama, tampilkan pita kecil di bawah supaya pengguna menutup/membuka ulang aplikasi.
   Tidak pernah memuat ulang sendiri (supaya data yang sedang diisi tidak terganggu). */
(function(){
  try {
    if (window.top !== window) return;                       // hanya jendela utama (editor di dalam dashboard cukup lewat dashboard)
    if (!('serviceWorker' in navigator) || !navigator.serviceWorker.controller) return;   // pemasangan pertama: tidak ada versi lama
    var shown = false;
    navigator.serviceWorker.addEventListener('controllerchange', function(){
      if (shown) return; shown = true;
      function show(){
        var d = document.createElement('div');
        d.id = 'bmUpdateBar';
        d.setAttribute('style', 'position:fixed;left:10px;right:10px;bottom:calc(10px + env(safe-area-inset-bottom,0px));z-index:2147483000;background:#1e3a8a;color:#fff;border-radius:12px;padding:11px 14px;font:600 13px/1.35 system-ui,sans-serif;display:flex;align-items:center;gap:10px;box-shadow:0 6px 22px rgba(0,0,0,.35)');
        var t = document.createElement('span'); t.style.flex = '1';
        t.textContent = 'Ada versi baru aplikasi. Data aman. Selesaikan dulu yang sedang diisi, lalu muat ulang.';
        var b = document.createElement('button');
        b.textContent = 'Muat ulang';
        b.setAttribute('style', 'background:#fff;color:#1e3a8a;border:0;border-radius:9px;padding:8px 12px;font:700 13px system-ui,sans-serif');
        b.onclick = function(){ location.reload(); };
        var x = document.createElement('button');
        x.textContent = '×'; x.setAttribute('aria-label', 'Tutup');
        x.setAttribute('style', 'background:transparent;color:#fff;border:0;font:700 20px system-ui,sans-serif;padding:0 4px');
        x.onclick = function(){ d.remove(); };
        d.appendChild(t); d.appendChild(b); d.appendChild(x);
        document.body.appendChild(d);
      }
      if (document.body) show(); else document.addEventListener('DOMContentLoaded', show);
    });
  } catch (e) {}
})();
