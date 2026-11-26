# Serah terima proyek BM-TECH

Dibuat 13 Nov 2026, dini hari WIB. Tempel atau lampirkan file ini di awal obrolan baru supaya Claude langsung paham konteksnya. Boleh juga disimpan di root repo sebagai `CLAUDE.md`.

---

## 1. Tentang pemilik dan cara kerjanya (WAJIB dipatuhi)

- **Nama: Rizky.** Pemilik bengkel BM-TECH. Bukan programmer. Claude yang memutuskan semua hal teknis; Rizky memutuskan isi bisnisnya.
- **Gaya jawaban**
  - Langsung ke kode atau hasil, tanpa sapaan dan basa-basi.
  - Bahasa Indonesia, tanpa emoji.
  - Ringkas: apa yang berubah, apa yang perlu ia lakukan.
- **"Buat selalu yang terbaik."** Kalau ada ide brilian, tambahkan saja, lalu sebutkan.
- **Diskusi dulu bila ia minta.** Kalau ia bilang "diskusi dulu", jangan eksekusi. Kumpulkan pertanyaan, susun rencana bernomor, tunggu "gas" atau "lanjut".
- **Hati-hati dengan data asli.** Data terpenting ada di Dashboard Admin dan Buku Besar (tabel `notes`). Jangan pernah menghapus atau mengubahnya tanpa izin eksplisit.
- **Jangan kirim ulang file SQL yang sudah dijalankan.** Bikin penuh memori.
- **Cara deploy oleh Rizky**
  1. Ganti file di root repo GitHub (file `api/*.js` ke folder `api`).
  2. Redeploy di Vercel.
  3. Buka ulang PWA.
- **Setiap ada perubahan:** naikkan versi `CACHE_NAME` di `sw.js`. Sekarang `bmtech-shell-v42`.
- **Uji sebelum kirim:** Playwright plus Postgres lokal. Jangan kirim file yang belum diuji.
- **Kalau ia mengoreksi** ("kata lu tadi...", "kan gw udah bilang"): cek ulang dengan data, akui singkat, perbaiki. Jangan berkelit.
- Ia sering mengirim tangkapan layar HP. Itu bukti bug, jadi baca teliti.

---

## 2. Gambaran sistem

Satu software, beberapa aplikasi, satu database Supabase (project id `zgzmbneqqzxnptbmlhsz`). Hosting di Vercel sebagai PWA.

| Aplikasi | File | Isi |
|---|---|---|
| Pintu masuk | `admin-login.html` → `my-profile-bm.html` | Login sekali, lalu ke Profil BM. Dari Profil semua aplikasi terbuka: Dashboard, Warung, Jarvis, Rekap Gaji. Login sesudahnya diarahkan ke Profil (`DASHBOARD_URL = my-profile-bm.html`). |
| Dashboard Admin / Buku Besar | `dashboard-admin.html`, `editor-data-administrator.html` | **Khusus barang keluar-masuk dari customer bengkel.** Data di tabel `notes`, folder "BUKU BESAR", schema `admin-data-v1`. |
| Buku lain | `editor-data-hutang-piutang.html`, `editor-data-kasbon.html`, `editor-data-warung.html`, `editor-data-operasional.html` | Kasbon = buku karyawan. Hutang Piutang = buku customer. Jangan digabung. |
| Dashboard Warung (kasir) | `dashboard-shop.html` + `bm-shop-sync.js` | **Khusus barang keluar-masuk warung**: jual (nota J-), beli/restok (M-), stok, retur. Header "Buku Warung BM TECH". |
| Jarvis AI | `jarvis-ai.html` (halaman penuh), `bm-jarvis.js` (tombol bulat melayang di semua halaman), `api/jarvis.js` (server) | Agen serbaguna multifungsi. |

**Omzet bersih** = total uang masuk = kolom Harga Buku Besar (barang + jasa) + penjualan warung (J- dikurangi retur). Salinan hutang B- di kasir tetap ada, tetapi tidak dihitung supaya tidak dobel.

---

## 3. Struktur data penting

### Buku Besar (record dalam `notes.content.records[]`)
- `pj`, `customer`, `barang` (teks bebas, barang yang dibawa customer), `harga` (barang + jasa, angka)
- `barangKeluar` (dibawa) dan `stokBarang` (ditinggal). Isinya "Tidak ada", "B&J", atau nama barang. **Keduanya sering tertinggal kosong.**
- `keterangan`, `bukti` (foto), `metode` (cash/transfer/campur)
- `ambilDari` / `pickups`: baris "Ambil barang"
- **Baru:** `warung: [{id, nama, qty}]`, yaitu barang dari stok warung yang dipakai untuk customer.

### Kasir (Supabase, semua tabel `shop_*`)
- **Tabel:** `pihak`, `shop_barang`, `shop_nota` + `shop_nota_baris`, `shop_retur` + `shop_retur_baris`, `shop_bayar`, `shop_stok` (penyesuaian stok), `shop_log`, `shop_staf`, `shop_counter`, `shop_batch`, `shop_jenis` (jenis kustom `k_xxx`).
- **Jenis barang:**
  - bawaan: `piston`, `bearing`, `stang`, `umum`
  - kustom: kode `k_...`, misalnya `k_baut`
- **Penamaan piston:** `nama_dasar` + " OS 50" atau " STD", contoh "Blade OS 50". `atribut = {os, seri, jenis, versi}`.
- **Ukuran OS:** STD, 25, 50, 75, 100, 125, 150, 175, 200. **Maksimal OS 200 untuk semua model** (ditegaskan Rizky).
- **Kode pabrik NPP:** `AKH-KWB-C` = keluarga mesin `AKH-KWB` + huruf ukuran. A=STD, B=25, C=50, D=75, E=100, F=125, G=150, H=175, I=200. Cukup satu kotak di-scan, ukuran lain model yang sama ikut dikenali.
- **Sinkron:**
  - `commit(c)` membandingkan data lama dan baru (diff), lalu mengirim paket perubahan ke RPC `shop_terapkan(batch)`. Paket bersifat atomik dan idempoten (id paket).
  - Data dimuat lewat `shop_ambil_semua()`.
  - Offline disimpan di outbox localStorage `bm_shop_outbox_v1`.
- **Hapus apa pun yang sudah tersimpan wajib lewat puzzle geser.** Barang yang pernah ada di nota atau dipakai bengkel hanya dinonaktifkan, tidak dihapus.

### Jarvis
- `jarvis_brain`: "Otak", pengetahuan yang ditambahkan admin.
- `jarvis_memori`: memori yang ditulis Jarvis sendiri (jenis: pelajaran, fakta, preferensi).
- `jarvis_log`: catatan pemakaian.

---

## 4. Migrasi database yang SUDAH dijalankan di produksi (jangan dikirim ulang)

1. `supabase/shop_setup.sql`: tabel, view, trigger kasir.
2. `supabase/shop_salin_piutang.sql`: salinan hutang ke kasir (B-).
3. `supabase/shop_kasir_api.sql`: `shop_ambil_semua`, `shop_terapkan`, tabel `shop_jenis`, constraint jenis kustom.
4. `supabase/shop_jarvis.sql`: `shop_cocok_kata`, `shop_sebutan_jenis`, `shop_j_barang` (mengembalikan `id`), `shop_j_hutang`, `shop_j_penjualan` (dengan `per_hari`), `shop_j_cocok`, `shop_j_barang_mirip`, `shop_pakai_bengkel`.
5. `supabase/jarvis_memori.sql`: tabel memori dan dua isi awal:
   - fakta: OS maksimal 200
   - pelajaran: cari di kasir_barang dan cari_otak sebelum bilang "tidak ada"

`shop_pakai_bengkel(rec_id, items, tgl, ket)`: memotong stok warung dari Buku Besar. Penanda baris stoknya `catatan = 'bengkel:<id record>'`. Dipanggil ulang = diganti. `items` kosong = stok dikembalikan.

---

## 5. Fitur yang sudah jadi (status 13 Nov 2026)

### Dashboard Warung
- Sinkron ke database dan login lewat Profil BM.
- Tema, warna aksen, dan huruf mengikuti pengaturan dashboard (pakai `bm-theme.js`).
- Puzzle verifikasi untuk semua penghapusan.
- "Hapus semua barang" ada di Pengaturan (admin saja, dengan puzzle).
- Jenis kustom (baut, blok, dan lain-lain), masing-masing dengan tombol impor, kosongkan, dan hapus.
- Scan kotak:
  - kode keluarga mesin dikenali dari satu scan,
  - huruf A sampai I menunjukkan ukuran,
  - mode isi stok: +1 tiap kotak di-scan.
- **Impor CSV:** format `nama_piston,os,harga` sudah benar, sudah diuji dengan file harga milik Rizky (262 barang, 100% cocok). Yang masuk hanya baris yang ada di file; tidak ada ukuran yang ditambahkan sendiri. Baris "200+" dilewati.

### Buku Besar (editor)
- Kolom "Barang dari Warung": cari "mio", ketuk ukuran OS, dan stok warung otomatis berkurang saat disimpan. Diedit atau dihapus, stoknya dikembalikan. Kalau offline, masuk antrean `bm-warung-antre-v1`.
- Kartu "Belum Lengkap" bisa diketuk untuk memfilter data yang kosong, beserta kolom apa yang kosong.

### Jarvis
- **Membaca semua buku:** rekap, Buku Besar, hutang, kasbon, katalog kasir (harga dan stok), Otak.
- **Alat tulis kasir** (berupa usulan, lalu admin menekan Setuju): `kasir_isi_stok`, `kasir_ubah_harga`, `kasir_barang_baru`.
- **Memori diri dan refleksi:**
  - memori: `ingat_sendiri`, `baca_memori`, `lupakan_memori`
  - introspeksi: `refleksi`, terdeteksi otomatis bila admin mengoreksi
  - menunya ada di Pengaturan → Memori Jarvis.
- **Obrolan ringan** ("hai", "woyy") dijawab cepat tanpa membuka data.
- **Periksa ulang:** jawaban berbasis data dicek ulang sebelum dikirim.
- **Coba ulang otomatis** bila timeout atau gangguan, lalu pindah model.
- **Visual** (semua bisa diunduh PNG):
  - `omzet_gabungan`, grafik otomatis
  - `buat_grafik` (garis/batang), `kartu_angka`
  - `buat_gambar` (SVG/canvas di iframe sandbox tanpa internet)
- `cek_data`: cari kolom kosong, misalnya dibawa/ditinggal kosong, harga kosong, keterangan kosong.
- Saran pertanyaan berganti-ganti: `GET /api/jarvis?saran=1`.
- **Kunci API dan model:**
  - Kunci API per penyedia disimpan di HP (`localStorage bm-jarvis-key-<penyedia>`); kunci Vercel jadi cadangan.
  - Daftar model diambil dari penyedia (`list_models`).
  - Tombol "Uji model terpilih" (`test_model`) menguji tanpa cadangan.
- **Bukti model:** di bawah kartu langkah tampil "Dijawab oleh <penyedia> · <model> ✓ dikonfirmasi server". Kalau model pilihan gagal, tampil oranye beserta alasannya.
- Versi server: `jarvis-v21-bukti-model-2026-11-12`.

---

## 6. Yang masih terbuka / perlu ditanyakan ke Rizky

1. **RX-K "200+" Rp220.000:** dilewati saat impor, atau dibuat barang sendiri "RX-K OS 200+"? (belum dijawab)
2. **Urutan impor ulang data warung oleh Rizky:**
   1. Pengaturan → Hapus semua barang (puzzle).
   2. Impor CSV.

   Belum dikonfirmasi sudah dilakukan atau belum.
3. **Model GPT 5.5 Pro:** Rizky curiga jawaban masih dari Gemini. Minta ia menekan "Uji model terpilih" dan lihat baris "Dijawab oleh". Kalau gagal, baca alasannya (kunci salah, model tidak ada di akunnya, dan sebagainya).
4. **Kebijakan keamanan:** penghapusan massal langsung ke database produksi ditolak oleh pengaman. Hapus data lewat tombol aplikasi, dengan puzzle.

---

## 7. Catatan teknis untuk Claude berikutnya

- **Kode front-end:** HTML satu file per halaman, vanilla JS, tanpa build. `dashboard-shop.html` sangat padat (gaya minified). Edit dengan penggantian string yang tepat.
- **Kelas CSS Jarvis** di `bm-jarvis.js` semuanya berawalan `bmj-`, supaya tidak bentrok dengan halaman. Jangan pakai nama kelas generik.
- **Server Jarvis** (`api/jarvis.js`, CommonJS, NDJSON streaming):
  - alat didaftarkan di map `TOOLS`; label langkah di `stepLabel` / `stepDone`; aturan perilaku di `systemPrompt`
  - usulan ditandatangani HMAC, lalu `execProposal`; operasi kasir lewat `execKasir`
- **Uji lokal:**
  - Postgres 16 di `/var/tmp/bmpg`, port 54329. File stub: `stub.sql` (`auth.uid`, `is_admin`) dan `stub2.sql` (`notes`/`folders`).
  - Uji Playwright membajak supabase-js dengan route interception.
  - Sandbox tidak bisa menjangkau REST Supabase produksi; hanya lewat alat MCP Supabase.
- **Kunci localStorage:**
  - tema: `bm-theme`, `bm-accent`, `bm-font`, `bm-font-bold`
  - sesi: `bmtech-auth`
  - Jarvis: `bm-jarvis-key-*`, `bm-jarvis-models-*`

---

## 8. Tambahan 13 Nov 2026: suara natural Jarvis (Edge TTS)

- **`api/tts.py`**: fungsi Python di Vercel, memakai pustaka `edge-tts` (versinya diatur di `requirements.txt`).
  - `POST` dengan `{text, voice, rate, pitch}` → MP3
  - `GET ?voices=1` → semua suara Microsoft
  - `GET ?tes=1` → versi
  - Hanya admin (token dicek ke Supabase + `is_admin`).
- **Kalau suara Edge berhenti berfungsi** (Microsoft mengubah aturan): naikkan versi `edge-tts` di `requirements.txt`, lalu Redeploy.
- **`bm-voice.js`**: pemutar per kalimat, dipakai halaman Jarvis dan tombol melayang.
  - Kalimat berikutnya disiapkan sambil kalimat sekarang diputar.
  - Rupiah dibaca lengkap.
  - Cadangan otomatis ke suara HP selama 2 menit bila Edge gagal; alasan gagalnya tampil di lembar pengaturan.
- **Lembar "Suara Jarvis"** (Jarvis → Pengaturan → Pilihan suara):
  - mesin Edge atau Suara HP
  - suara dipakai + tombol Coba
  - kecepatan dan nada
  - semua suara per bahasa (Indonesia, Jawa, Sunda, Melayu di atas), dengan cari, filter Pria/Wanita/Multibahasa, dan coba dengar
  - pengaturan tersimpan di `localStorage bm-voice-v1`
- Versi cache sekarang `bmtech-shell-v45`.

### 8b. Tambahan 13 Nov 2026: baca semua + penanda + tombol putar
- Jawaban Jarvis dibacakan seluruhnya (judul, paragraf, tiap poin; tabel diringkas "Tabel N baris").
- Bagian yang sedang dibaca diberi latar aksen dan garis kiri (`.bmj-rd`).
- Speaker aktif: ketuk paragraf/poin mana pun untuk membaca ulang mulai dari situ.
- Tombol putar kecil di samping Salin: putar ulang dari awal / berhenti. Tetap jalan walau speaker mati.
- `BMVoice.speak(array, { onSeg })`: array bagian, onSeg(i) saat bagian ke-i mulai dibaca.
- Simbol teks (centang, silang, segitiga, panah) diganti ikon SVG di jarvis-ai.html, bm-jarvis.js, bm-voice.js.
- sw.js: bmtech-shell-v47.

## 9. Tambahan 13 Nov 2026 (v23): lampiran, perintah "/", halaman pengaturan, memori pribadi
- Migrasi: supabase/jarvis_v23.sql (memori pribadi, tabel jarvis_skill). Dijalankan admin sendiri di Supabase SQL Editor (MCP ditolak classifier). TIDAK ada bucket Storage.
- Memori: kolom `pribadi` (baru = true, data lama = false/bersama). RLS: baca memori sendiri + memori bersama; tulis hanya atas nama sendiri. Otak (jarvis_brain) dan skill tetap bersama.
- Skill "/": bawaan (SK_BAWAAN di jarvis-ai.html) + buatan admin (tabel jarvis_skill). `{isi}` = teks setelah nama skill. Kelola di Pengaturan > Skill perintah cepat, atau "Tambah skill baru" di daftar "/".
- Lampiran (tombol +: Kamera, Foto dan video, File). TIDAK ada file yang disimpan di Supabase/Vercel (hemat kuota free tier):
  - foto/PDF kecil (<= 2,5 MB, total 3 MB per pesan; foto diperkecil 1600 px JPEG) dikirim base64 di pesan (`lampiran[].data`). Selama sesi, HP menyimpannya di memori (attMem) supaya pertanyaan lanjutan tetap bisa melihatnya; tidak masuk localStorage.
  - video, suara, dan file besar dititip ke Gemini File API lewat api/lampiran.js (potongan 4 MB, aksi mulai/kirim/cek) -> `lampiran[].uri`. Gemini menghapus sendiri setelah 48 jam. Butuh kunci Gemini (HP atau env); hanya model Gemini yang bisa membacanya, jadi server mendahulukan Gemini.
  - Word/Excel/PowerPoint/teks dibaca di HP (unzip + DecompressionStream), hanya teksnya dikirim (`dokumen`).
  - Server: data/uri divalidasi (jenis diizinkan, alamat harus generativelanguage.googleapis.com/v1beta/files/...). Claude: image/document; OpenAI: image_url/file. Maks 4 media terbaru per permintaan.
- Pengaturan = halaman penuh (#pg) dengan grup dan garis pembatas; terhubung ke tombol kembali HP (history.pushState). Pilihan suara: BMVoice.openSettings({ page: true }).
- Kolom input mengapung (.comp absolute, tanpa latar); padding bawah daftar pesan mengikuti tinggi kolom input (ResizeObserver).
- Tombol aksi jawaban: ikon saja (Salin, Bagikan, Unduh PDF, Dengarkan).
- Grafik (bm-visual.js): digambar ulang sesuai lebar layar; label panjang dimiringkan / dilewati / batang mendatar; sumbu Y angka bulat; keterangan sentuh tidak keluar kotak.
- sw.js: bmtech-shell-v49. vercel.json: api/lampiran.js maxDuration 60. Versi server: jarvis-v23-lampiran-2026-11-13.

## 10. Dokumen balik dari Jarvis (14 Nov 2026, v24)
- Alat baru `buat_dokumen` (api/jarvis.js): model mengisi spesifikasi { judul, format, nama_file, versi, bagian[] } dengan bagian tipe judul/sub/teks/butir/nomor/tabel/garis. Server hanya menormalkan dan membatasi (maks sekitar 45.000 huruf, 120 bagian, 500 baris per tabel, 14 kolom) lalu mengirimnya ke layar sebagai visual `tipe:'dokumen'` (jalur yang sama dengan grafik/kartu). TIDAK ada file yang dibuat atau disimpan di server maupun database.
- File dibuat di HP oleh `bm-dokumen.js` (dimuat malas oleh bm-visual.js saat tombol ditekan): PDF (jsPDF + autoTable dari cdnjs, sama seperti Unduh PDF lama), XLSX dan DOCX (ZIP tanpa kompresi + XML Office, tanpa pustaka), CSV (titik koma + BOM), TXT, MD, HTML. Excel: "Rp1.250.000" dan angka murni jadi angka sungguhan, satu tabel = satu sheet, teks di sheet Ringkasan; teks yang diawali "=" aman (tersimpan sebagai teks).
- Kartu file (bm-visual.js `dokumen()`): ikon format, pratinjau isi (DOM, tanpa innerHTML), tombol Unduh, pilihan format lain, Bagikan (Web Share file), Buka/Tutup pratinjau, Revisi.
- Riwayat: spesifikasi dokumen disimpan di `c.msgs[].vis` (localStorage, bukan database), jadi kartu muncul lagi saat obrolan dibuka dan file dibuat ulang saat diunduh.
- Revisi: tombol Revisi mengirim event `bm-doc-revisi` -> kolom input terisi "Revisi dokumen ... (versi N): ". Isi dokumen sebelumnya dikirim ke model lewat catatan `[DOKUMEN ... Isi bagian: {...}]` di riwayat (server memotong riwayat model 1.500 huruf, kecuali yang memuat [DOKUMEN : 9.000). Nama file mendapat akhiran -vN bila versi > 1.
- sw.js: v51 (gaya polos untuk rekap teks; tabel tanpa kolom dibaca toleran), `/bm-dokumen.js` masuk daftar ASSETS. File baru: bm-dokumen.js (folder utama).
- Diuji: Playwright (kartu, pratinjau, tujuh format, unduh, revisi, riwayat), validasi XLSX (openpyxl), DOCX (python-docx) dan render LibreOffice, uji server 16 butir. PDF diuji dengan jsPDF tiruan karena cdnjs tidak terjangkau dari sandbox.

## 11. Penyedia AI gratis tambahan dan jawaban kosong (13 Nov 2026, v25)
- Penyedia baru di `PROVIDERS` (api/jarvis.js) dan `PROV` (jarvis-ai.html): `zai` (GLM-4.7-Flash), `cloudflare` (gpt-oss-120b, SEA-LION), `groq`, `openrouter` (model :free), `nvidia`. Semua format OpenAI. Kunci Cloudflare berformat `ACCOUNT_ID:TOKEN` (dipisah di `cfParts`, alamat memuat Account ID, token jadi Bearer); kunci dicek lewat `accounts/{id}/tokens/verify`. Id model boleh berawalan `@` (`@cf/...`), regex MODEL_ID_RE dan MODEL_RE sudah disesuaikan.
- `batasToken` (Groq 8.000/menit): bila perkiraan permintaan (prompt + 36 alat + riwayat, sekitar 9.500 token) melebihi 85% jatah, penyedia dilewati dengan catatan, bukan dicoba lalu gagal. Jadi Groq praktis hanya untuk permintaan kecil (tanpa alat) sampai ada mode "penulis/pemeriksa".
- Jawaban kosong setelah alat dijalankan: sekali lagi diminta menulis jawaban akhir (tanpa alat, penyedia lain boleh mengambil alih) sebelum jatuh ke "Maaf, saya tidak mendapat jawaban". Pemeriksaan ulang dilewati bila jawabannya pesan cadangan itu.
- Rantai cadangan: urutan penyedia yang dicentang di Pengaturan; kunci yang disimpan otomatis mencentang penyedianya. 429 pada penyedia non-Gemini mendinginkan seluruh penyedia itu.
- Belum dibuat: `/rekap-gaji` berbasis kode (aturan Kamis-Rabu sudah ada di api/jarvis.js dan aplikasi), mode Teliti (pemeriksa beda penyedia + validator angka), penyamaran data, mode Rapat.
- sw.js v52.

## 12. Coba ulang otomatis + UI abu-abu (sw v53)
- jarvis-ai.html & bm-jarvis.js: gangguan penyedia (overloaded/429/5xx) dicoba ulang otomatis sampai 3x (jeda 2,5/5/9 dtk) dengan langkah "Penyedia sibuk, mencoba lagi otomatis"; error kunci/login tidak diulang.
- Highlight baca-suara, seleksi teks, tombol stop kirim, dan tombol stop di bar aksi: abu-abu netral.
- Tombol "Jawab ulang" (hanya di jawaban terakhir); bubble user punya Salin dan Edit (edit menghapus pesan itu dan sesudahnya, teks kembali ke kolom tulis). Hanya di jarvis-ai.html.
- NVIDIA ditunda.

## 13. Insiden hilang data Buku Besar 15 Nov 2026 dan perbaikannya (sw v56)
- Penyebab: editor-data-*.html menampilkan layar setelah 6 detik (`is-loading` dilepas timer) walau catatan belum selesai dimuat dari server (sinyal lemot). Saat itu `records` masih kosong dan `lastKnownUpdatedAt` null. Pengguna menambah satu data -> `saveNoteToDatabase` mengirim update TANPA kunci `updated_at` dan judul cadangan 'Untitled' -> seluruh catatan tertimpa. Jalur kedua: catatan dibuka offline dari draf HP tanpa titik awal (base/updated_at), lalu saat online disimpan tanpa kunci.
- Perbaikan di kelima editor (administrator, operasional, kasbon, hutang-piutang, warung), pola sama:
  - `serverSynced`: false sampai catatan benar-benar terbaca dari server. Selama false tidak ada simpan ke server (`saveNoteToDatabase`, `runAutosave`, `scheduleAutosave`, `reconcileLinks`).
  - Kunci versi selalu dipakai (`.eq('updated_at', lastKnownUpdatedAt)`); tanpa itu simpan ditolak. Judul cadangan memakai judul server (`baseSnap.title`), tidak lagi sembarang 'Untitled'.
  - Draf HP selalu ditulis dulu (juga saat muat gagal). Draf menyimpan `base` dan `lastKnown`; saat belum termuat, draf digabung per id dengan draf lama (tidak menimpa). Draf baru dihapus setelah benar-benar tersimpan (dan tidak dihapus bila ada ketikan baru selama menyimpan).
  - Muat dari server dibatasi 15 detik dan dicoba ulang otomatis (jeda naik sampai 20 dtk) sampai berhasil; spanduk kuning menjelaskan keadaannya. Setelah termuat, draf digabung (BMMerge) lalu disimpan dengan kunci.
  - `bmWouldShrink()`: simpan yang mengurangi jumlah data tanpa masuk Sampah ditahan, lalu muat ulang dan gabung (maks 3x). Server menolak hal yang sama lewat trigger `a_notes_guard` (error `BM_GUARD`), lihat guard-data.sql.
  - Catatan baru memakai id dari HP (`bmUuid`) sehingga simpan ulang setelah jawaban server hilang tidak membuat catatan ganda (error 23505 dilanjutkan sebagai pembaruan).
  - Bentrok: isi server berjenis lain tidak pernah ditimpa; tabel manual lama (columns/rows) dipertahankan sebagai `legacy`.
- editor-folder.html `persist()`: baca-ubah-simpan dengan kunci `updated_at` dan ulang sampai 6x.
- SQL (dijalankan pengguna di SQL Editor, bukan oleh Claude): backup-otomatis.sql (riwayat versi tiap simpan `notes_history`, snapshot tiap 3 jam `backup_snapshots`, pembersihan harian, tampilan `backup_status`), guard-data.sql (trigger `a_notes_guard`), pulihkan.sql (daftar versi lama dan cara memulihkan).
- dashboard-admin.html: kartu tugas dan status LUNAS/SEBAGIAN/BELUM dari rencana task (hutang ungu, piutang biru; merah-kuning-hijau hanya berarti status bayar).
- Uji: Playwright 6 skenario x 5 editor (server lambat, offline lalu online, muat gagal, dua HP bersamaan, penghapusan massal, catatan baru ganda). Kode lama gagal di skenario yang sama (menimpa jadi 1 data "Untitled").

## 14. Cadangan di Profil BM + Google Drive (sw v58)
- Lokasi: my-profile-bm.html, pintasan "Cadangan" di beranda Profil untuk SEMUA admin yang login (bukan hanya Developer). Pengingat cadangan manual (chip hari) dan baris "Cadangan manual terakhir" hanya untuk Developer/Owner.
- RPC `backup_list()`, `backup_get(p_at)`, `backup_now()` dijaga `is_admin()` (admin aktif di admin_roles + admin_emails). Akun customer/karyawan BUKAN admin sehingga tidak bisa mengunduh. Jangan diganti menjadi sekadar `authenticated`: data cadangan memuat semua tabel (gaji, customer).
- `dev_backup_*` (versi lama, khusus Developer) masih ada untuk kompatibilitas; boleh di-drop setelah semua perangkat memakai sw v58.
- Titik cadangan otomatis di Supabase: snapshot tiap 2 jam (`bm_backup_snapshot`, hanya tabel yang berubah). `do_backup_prune`: semua snapshot 7 hari terakhir, ditambah SNAPSHOT TERBARU tiap tabel selamanya (supaya tabel yang jarang berubah tidak hilang dari cadangan titik waktu).
- Jangka panjang di Google Drive: Apps Script (akun pemilik) memanggil `backup_export(token)` tiap 2 jam, simpan `backup-bm-tech-<yyyy-MM-dd_HH-mm>.json` di folder "BM-TECH Backup". Retensi di Drive: semua file 3 hari terakhir, lalu 1 file terbaru per hari sampai 90 hari, sisanya dibuang. Gagal = email ke akun Apps Script. `backup_export` hanya boleh dipanggil anon (lewat token di tabel `backup_secret`); token tidak boleh masuk chat/repo.
- Mengganti isi skrip Apps Script: jalankan SQL pembuat skrip (token disisipkan otomatis dari `backup_secret`), salin hasilnya, tempel ke Kode.gs, simpan, jalankan `mulai` sekali.
- Uji: scratchpad/uji56/profil.js (Playwright, RPC dipalsukan; argumen `nodev` = admin biasa tanpa Developer/Owner).

## 15. Analisa: Bersih Cash & Bersih Transfer (sw v59)
- Hero Analisa punya 6 slide: Ringkasan, Kasbon, Operasional, Bersih, **Bersih Cash**, **Bersih Transfer**.
- Bersih Cash (uang laci) = Cash masuk − Kasbon − Operasional cash. Bersih Transfer = Transfer masuk − Operasional transfer.
- Kasbon dianggap keluar dari laci. Operasional: porsi transfer keluar dari rekening; cash, campur, dan metode belum dipilih dianggap keluar dari laci.
- Transaksi Buku Besar tanpa metode bayar tidak masuk Cash maupun Transfer (ada catatan di keterangan slide). "Bersih" lama tetap = semua pemasukan − Kasbon − Operasional.
- Operasional metode campur tanpa rincian bayarCash/bayarTransfer sekarang dianggap belum dipilih (sebelumnya semua dihitung transfer).
- Pembayaran kasbon (dibayar) belum dihitung sebagai uang masuk karena tidak ada tanggal pelunasan.
- Teks WhatsApp ikut memuat Bersih Cash dan Bersih Transfer.

## 16. Analisa: tab Pilih Hari (sw v60)
- Tab baru "Pilih Hari" (period `hari`) di samping Hari Ini: input tanggal, rentang 00:00–23:59:59 hari itu, tidak boleh memilih tanggal setelah hari ini.
- Semua tampilan mode harian (grafik per transaksi, kartu Bersih Cash/Transfer, pembanding hari sebelumnya, teks WhatsApp) memakai helper `isDayMode()` yang berlaku untuk `day` dan `hari`.

## 17. Editor Data Administrator: detail selalu bisa diedit (sw v61)
- Halaman Detail langsung dalam mode edit (tombol Edit disembunyikan; Hapus dan Tutup tetap). Semua pilihan (Metode Bayar, "Harga ini untuk barang yang mana?", dll) langsung tampil.
- Perubahan yang belum disimpan dijaga: Kembali, Tutup, panah kiri/kanan, dan lompat ke data terhubung menampilkan peringatan "Perubahan belum disimpan" (Tetap di sini / Keluar tanpa simpan).
- Draf edit disimpan di localStorage (`admdash_editdraft_<note>_<record>`), dipulihkan saat detail dibuka lagi bila data asli belum berubah; dibuang saat Simpan / Batalkan Perubahan.
- Kartu "Barang masih ditinggal / Belum dibayar": keterangan otomatis TIDAK menimpa keterangan yang sudah ditulis, teks kartu ditambahkan di belakang (`Keterangan lama · Ambil barang (...)`); pindah tombol mengganti teks kartu sebelumnya.
- Tombol "Bayar saja": tulisan "Bayar duluan" hanya untuk barang yang masih ditinggal. Barang yang sudah dibawa memakai "Bayar (...)"; link disimpan dengan `taken: true`, tampil "Bayar:" di Terhubung.
- Kartu saran juga muncul di Detail (satu elemen `#pickupCard` dipindah antara form Tambah Data dan `#detPickupSlot` oleh `pkSetCtx()`; peta kolom `PK()` memilih input form atau input Detail). Di Detail kartu hanya menawarkan titipan yang LEBIH LAMA dari data ini dan tidak menawarkan data itu sendiri. Hanya untuk data yang belum punya `ambilDari`; data yang sudah terhubung tidak diubah dari kartu. Saat Simpan, `resolvePickupLinks()` mengisi `ambilDari` (+ stokCarry, ownPaid) dan penandaan di data titipan lama berjalan lewat reconcileLinks seperti Tambah Data.

- (sw v63) Di Detail, tombol Simpan Perubahan / Batalkan Perubahan hanya tampil bila ada perubahan (`syncDetailActions`, cek tiap 250 ms lewat `isDetailDirty`). Detail yang baru dibuka hanya menampilkan Hapus dan Tutup.

## 18. Editor Data Administrator: kolom melebar & tanggal/waktu sendiri (sw v64)
- Kolom Barang dan Jumlah, Barang Keluar, Barang Ditinggal (Tambah Data dan Detail) kini `<textarea class="grow" data-oneline>`: tinggi mengikuti isi (`autoGrow`, dicek tiap 300 ms). Baris baru dari tempelan diubah jadi spasi dan Enter tetap pindah ke kolom berikut. Keterangan juga melebar otomatis.
- Pengaturan > "Atur tanggal & waktu sendiri" (localStorage `admdash_custom_time`, per HP, default mati). Saat menyala, form Tambah Data memakai `#inputWaktuCustom` (datetime-local, tidak boleh melewati sekarang) menggantikan Tanggal/Waktu Auto. `created_at` = pilihan itu dengan detik dari jam sekarang. Nomor urut mengikuti urutan tanggal, jadi nomor data lain bisa bergeser. Detail/edit tetap tidak boleh mengubah created_at.

## 19. Detail: pilihan "Harga ini untuk barang yang mana?" langsung & wajib (sw v65)
- `updateDetScope()` menghitung tampil/tidaknya `#detScopeWrap` LANGSUNG dari isi form Detail (barang dibawa + barang ditinggal + Harga angka, belum terhubung/ambil kartu). Dicek tiap 250 ms, saat dibuka, dan setelah draf dipulihkan.
- Opsi awal "Pilih dulu…" (kosong), kotak merah selama kosong. Simpan diblokir dengan pesan "Pilih dulu" sampai dipilih (Semua / Dibawa saja / Ditinggal saja). Tambah Data sudah wajib lewat popup konfirmasi sejak dulu.

## 20. Status simpan saat sinyal lambat/offline (sw v66)
- `Menyimpan...` kini sticky (dulu hilang 1,4 dtk sehingga layar kosong sambil menunggu). Setelah 4 dtk: "Sinyal lambat: N data masih dikirim, aman di HP. Jangan tutup dulu". Offline/gagal: "N data belum terkirim ke server (aman di HP)". `unsyncedCount()` membandingkan records/trash dengan `baseSnap`.
- Update utama ke server dibungkus `bmWithTimeout(25000)`; timeout = gagal, dicoba lagi otomatis (jalur gabung menangani bila ternyata sudah masuk). "Tersimpan di server" tampil 2,4 dtk.

## 21. Pita "ada versi baru" + Pulihkan data hilang (sw v67)
- `bm-update.js` (dimuat di dashboard-admin, 5 editor, analisa): bila service worker baru mengambil alih saat halaman masih kode lama (`controllerchange` dengan `controller` sudah ada sebelumnya), tampil pita biru "Ada versi baru... Muat ulang". Tidak pernah muat ulang otomatis. Hanya di jendela utama (bukan iframe). HP dengan versi < v67 belum punya pita ini; baru berlaku setelah v67 terpasang.
- Profil BM > Cadangan > "Pulihkan data yang hilang": RPC `note_versions(p_limit)` (daftar riwayat dari `notes_history`, hanya admin) dan `note_restore_missing(p_id)` (hanya MENAMBAH data dari versi lama yang id-nya tidak ada di records maupun trash catatan sekarang; tidak menimpa; bila catatan sudah dihapus, catatan dibuat ulang dari riwayat). Dua ketukan untuk konfirmasi.
- Uji: scratchpad/uji56/upd.js, profil2.js.
- (sw v68) Pulihkan data hilang dibatasi Owner/Developer (UI `#rvWrap` + RPC cek `is_owner() or is_dev_admin()`), `note_restore_missing(p_id, p_apply)`: ketukan pertama `p_apply=false` hanya menghitung, ketukan kedua `true` memulihkan dan dicatat di `activity_log`. Admin biasa tidak melihat bagiannya.

## 22. Kesehatan Sistem lengkap (sw v69)
- my-profile-bm.html > Alat Developer > Kesehatan: setelah daftar lama, memanggil RPC baru `system_health_detail()` (hanya `is_dev_admin()`). Menampilkan: grafik lingkaran pemakaian database (kelompok tabel vs batas 500 MB, gaya penyimpanan HP), grafik lingkaran + rincian per folder (isi catatan + riwayat versi, jumlah catatan/data/sampah, terakhir berubah, label terbanyak/sedikit), koneksi aktif, cache hit, riwayat versi, titik cadangan, file Storage, 12 tabel terbesar. Bila RPC belum ada: pesan "belum diaktifkan", daftar lama tetap tampil.
- Uji: scratchpad/uji56/kes.js.

## 23. Kesehatan untuk semua admin + PWA BM Warung (sw v70)
- Pintasan "Kesehatan" di Profil BM kini untuk SEMUA admin (bukan hanya Developer). RPC `system_health` dan `system_health_detail` dijaga `is_admin()` (bukan `is_dev_admin()`). Isinya hanya ukuran/jumlah, bukan isi data.
- PWA terpisah "BM Warung": `manifest-shop.json` (id/start_url `/dashboard-shop.html`, tema gelap), ikon `icons/icon-shop-*.png`, `apple-touch-icon-shop.png`, tag manifest/ikon/apple di `dashboard-shop.html`, pendaftaran `/sw.js` dan `bm-update.js` di halaman itu. Semua aset masuk precache `sw.js`. Dipasang lewat menu browser "Tambahkan ke layar utama" saat membuka `/dashboard-shop.html` (ikon dan nama terpisah dari BM-TECH Admin).

## 24. Rombak Dashboard Warung (dashboard-shop.html, sw v71)
- Font: Instrument Sans tertanam (woff 400/700, ada fitur tnum). Tidak lagi mengikuti `bm-font` Dashboard/perangkat. `button,input,select,textarea{font:inherit}`, `font-variant-numeric:tabular-nums`, `font-synthesis:none`.
- Navigasi: 5 tab Beranda, Barang, Nota, Hutang, **Lainnya** (menggantikan Laporan). Tombol gear permanen di header dihapus. Lainnya = Laporan (Rekap stok, Penjualan, Terlaris, Pembelian), Barang (Jenis, Impor, Isi stok), Data (Backup, Ekspor), Aplikasi > Pengaturan (Tampilan, Suara scan, status Database, Hapus semua barang).
- Beranda: 4 kartu ringkas (Omzet, Nota, Stok habis, Total hutang) + 4 grup pintasan (Penjualan, Stok, Keuangan, Laporan; `sc()`/`scg()`) lalu daftar Stok habis, Hutang terbesar, Nota terakhir. Baris "Rekap stok" lepas dihapus.
- Mode demo dihapus: tag "Demo", teks "Mode demo", aksi `rfpick`/`rs` (pulihkan file / hapus data lokal). Sisa data lokal lama `bm_warung_v1/v2` dibuang otomatis begitu perangkat punya salinan database (`BMShopSync.cached()`). Data di database TIDAK disentuh (10 nota di shop_nota adalah salinan asli dari Hutang Piutang).
- Status koneksi: pita `.bm-net` (Online/Offline/Data diperbarui) disembunyikan di halaman ini (`bm:refresh` tetap ditangani BMShopSync secara senyap). Chip di header (`#bm-sync-f`, bm-shop-sync.js `badge()`) hanya muncul bila ada perubahan belum terkirim, belum masuk, atau tanpa akses.
- Uji: scratchpad/uji56/shop.js.

## 25. Dashboard Warung: keluarga kode piston, PDF, animasi (sw v72)
- Keluarga kode piston: `FAMRE` menerima 2-4 segmen (AKH-KWB-C, AKY-4Y2-1630-C); keluarga = semua sebelum huruf ukuran terakhir. Bila keluarga dipakai beberapa model (RX-K dan RXS satu kode 4Y2) `suggestFromCode` mengembalikan `amb:true`, tidak auto-link, `famPick` menampilkan semua model pada ukuran cocok. `codeOsWarn` memperingatkan bila huruf ukuran tidak sama dengan OS barang (scpick dan lnkpick). Anchor OCR menerima 4 segmen dan huruf A-I.
- Ekspor PDF tanpa pustaka (`pdfBuild`, Helvetica, tabel multi halaman, landscape untuk transaksi): Lainnya > Data (Transaksi PDF, Stok PDF) dan tombol PDF di Rekap stok.
- Animasi: `stagger()` memberi baris/kartu muncul berurutan (via countUp), transisi tekan, fade halaman; tetap patuh prefers-reduced-motion.
- DB: 10 nota uji (shop_nota) dihapus; cadangan di tabel zz_backup_shop_nota_uji dan zz_backup_shop_nota_baris_uji (boleh di-drop nanti).
- Data janggal belum diubah: RX-K OS 175 berkode -D (seharusnya OS 75), RX-K OS 75 kode kosong.

## 26. Dashboard Warung: animasi penuh + adaptif perangkat (sw v73)
- Blok CSS/JS "Animasi penuh + adaptif" di dashboard-shop.html: tab bergeser sesuai arah (--sl), ripple (pointerdown), kartu muncul saat tergulir (IntersectionObserver, cadangan 2,5 dtk), dialog/toast pegas, shimmer `.skl`, focus-visible, target sentuh 44px (pointer:coarse), scrollbar halus (pointer:fine).
- Breakpoint: <360px (HP sempit), landscape tinggi <480px (nav ringkas), >=760px (halaman jadi panel tengah dengan blur), >=1100px (nav jadi rel kiri vertikal). Semua patuh prefers-reduced-motion. Diuji 320, 390, 820, 1366, 844x390.

## 27. Dashboard Warung: perbaikan bentrok kelas + pengaturan Animasi (sw v74)
- Bug: kelas baru `.rv` dan `.in` bentrok dengan kelas lama (`.r.rv` baris, `.in` input) sehingga seksi Laporan berantakan. Diganti `.rvl`/`.rvi`. Aturan: sebelum menambah nama kelas, grep dulu di dashboard-shop.html.
- Animasi: Chrome Android membaca "hapus animasi" sistem sebagai prefers-reduced-motion sehingga semua animasi mati. Sekarang ada Pengaturan > Animasi (Hidup / Ikuti HP / Mati), simpan di localStorage `bm_mo`, bawaan Hidup; atribut `data-mo` di <html> diset awal di head. `reduce()` membaca pengaturan ini.

## 28. Dashboard Warung: menu bawah tenggelam (sw v75)
- Gejala di HP pengguna (zoom halaman Chrome sekitar 119%): menu bawah turun keluar layar dan melebar.
- Perbaikan: nav tidak lagi memakai left:50% + translateX(-50%) + width vw; sekarang left/right 12px + margin auto + max-width 440px. Pengaman `navFix()` mengukur nav terhadap visualViewport dan menaikkan lewat `--navfix` bila tenggelam (tidak jalan saat mengetik; dipanggil saat muat, resize, ganti tab). body tidak lagi min-height 100dvh, scroll-behavior smooth dihapus, animasi tab hanya fade + naik 8px.
- Tes `uji56/qa.js`: 3 ukuran (346x705 meniru zoom 119%, 412, 360), terang/gelap, 5 tab + Rekap + Jual, cek tanpa geser samping, nav utuh, simulasi nav tenggelam 62px pulih.

## 29. Dashboard Warung: senter scanner (sw v76)
- Pengaturan > Senter scanner: Manual / Otomatis / Selalu (localStorage `bm_torch`: man/auto/on, bawaan Manual). Tombol petir di pojok kanan atas kamera scan (`#tch`, aksi `tch`), tersembunyi bila track kamera tidak punya capability `torch` (mis. iPhone Safari).
- Otomatis: tiap 700 ms ukur kecerahan frame (canvas 32x24); nyala bila luma < 50, mati bila > 175, jeda minimal 2,5 dtk; setelah pengguna mengetuk tombol, otomatis berhenti mengatur selama sesi scan itu. Selalu: nyala begitu kamera terbuka. Senter mati sendiri saat kamera ditutup (track dihentikan).
- Tes `uji56/torch.js` memakai getUserMedia tiruan (canvas.captureStream + capability torch).

## 30. Dashboard Warung: Isi stok cepat (sw v77)
- Halaman `pgQuick` (`openQuick`, aksi `qk`): kamera tetap terbuka, tiap scan menambah stok (jumlah per scan 1/5/10/12), semua jalur scan lama dipakai ulang (`SC.ctx='stock'`, `SC.quick=true`; `skBump` mengarah ke `qkBump`). Tidak ada perpindahan halaman setelah scan; kode tak dikenal / keluarga ambigu muncul di panel `#scr` di bawah kamera.
- Manual di halaman yang sama: kolom `#scm` mencari nama atau kode (`qkSearch`, tap hasil = +1) dan Enter / tombol cari menjalankan `scgo`.
- Daftar "Sudah discan" memakai `skRow` (− / + / +5 / +10 / ketik angka), disimpan lewat `skSave` yang sama dengan Isi stok biasa (satu penyesuaian per barang, alasan "Isi stok").
- Draft otomatis disimpan di localStorage `bm_qk_draft` dan dipulihkan saat halaman dibuka lagi; dihapus saat Simpan atau Kosongkan.
- Pintu masuk: tile Beranda > Stok (6 tile sekarang), Isi stok > Scan cepat, Lainnya > Barang. Tes `uji56/quick.js`.

## 31. Impor laher: "Pakai apa adanya" (sw v78)
- Baris laher yang serinya tidak cocok pola angka (mis. "BEAT GENIO") kini punya tombol Pakai apa adanya (`imloose`): teks yang diketik dipakai sebagai seri tanpa pemeriksaan pola (`raw.loose` dibaca `imVal`). Tombol Cek lagi tetap memeriksa pola ketat. Tes `uji56/imp.js`.

## 32. Anti data palsu, scanner gaya iPhone, ekspor kode mesin, tanpa komentar (sw v79)
- DB `shop_terapkan` (migrasi shop_terapkan_item_patch_kolom): op `item_upsert` boleh membawa `ubah` (daftar kolom). Bila barang sudah ada, hanya kolom itu yang ditulis; tanpa `ubah` perilaku lama (tulis semua). `bm-shop-sync.js` mengirim `ubah` untuk barang yang sudah ada, supaya HP dengan data basi tidak menimpa harga/nama yang diubah HP lain. Diuji dalam transaksi yang dibatalkan.
- `BMShopSync.peek()` mengambil data server terbaru tanpa menerapkan. `skSave` (Isi stok ketik angka akhir) memeriksa dulu; bila stok di server beda, muncul peringatan dan selisih dihitung dari stok server.
- Scan: QR harus di dalam bingkai (`inAim`), terbaca sama 3 kali dan minimal 250 ms. OCR 3 kali (2 bila kodenya cocok persis). Hanya kode yang cocok persis (`findByCode`, laher seri persis `ocExact`) yang otomatis; tebakan keluarga kode atau tebakan dari tulisan memunculkan kartu `scConfirm` (Ya / Bukan -> `scnot` -> pilihan lain). Kode tidak pernah ditempel otomatis.
- Draft Isi stok cepat (`bm_qk_draft`) menyimpan tambahan `{d:{id:+n}}`, bukan angka akhir; draft format lama dibuang.
- `pq('1.000')` = 1000.
- Bingkai scanner: luar bingkai digelapkan (box-shadow), sudut putih bernapas, sudut kunci hijau saat terkunci.
- Tidak berkedip: `paint(p,first)` hanya menjalankan animasi berurutan saat halaman pertama dibuka. Barang: grup membuka dengan animasi tinggi (grid rows); baris punya efek tekan; filter Barang/Nota memakai `swapIn`.
- Lainnya > Data > Kode mesin (`pgKode`, CSV/PDF).
- Semua komentar di dashboard-shop.html, bm-shop-sync.js, sw.js dihapus atas permintaan pemilik (catatan sejarah versi ada di HANDOFF ini). Tes: `uji56/scan2.js` + semua tes lama.

## 33. Tanpa kedip (v80)
- `morph()`/`mkids()`/`mattr()` di dashboard-shop.html: `render(false)` dan `paint()` (selain pembukaan pertama) menambal DOM di tempat, bukan `innerHTML`. Chip filter (Barang, Nota, Pengaturan, dll.) tidak dibuat ulang sehingga transisi warna/pegas jalan dan tidak berkedip. Input yang sedang fokus tidak disentuh.
- sw.js CACHE_NAME v80.

## 34. Dashboard Admin + Buku Operasional per pekan (sw v81)
- Buku Operasional: 1 pekan (Kamis–Rabu) = 1 catatan. `editor-data-operasional.html`: `opWeekStart`, `opNoteWeek` (pekan dari data paling awal, lalu tanggal di judul, lalu created_at), `findWeekNote`, `adoptNoteId`. Dibuka tanpa id: otomatis memakai catatan pekan ini. Simpan pertama (insert): dicek lagi; kalau catatan pekan sudah dibuat HP lain, data digabung lewat `handleSaveConflict` dengan base kosong (tidak ada catatan ganda). Judul catatan baru = `OPERASIONAL <tanggal Kamis>`. Daftar di editor diberi pemisah per hari (`.day-sep`), teks hero = rentang pekan.
- Dashboard: detail catatan Operasional memakai pemilih hari (ALL + Kamis–Rabu) seperti rekap karyawan (`detailWeekAnchor`), dan pada ALL ada pemisah per hari di Kartu dan Tabel (`.nd-daysep`).
- Tugas "Data belum lengkap": Metode tidak diwajibkan untuk data sebelum 11 Okt 2026 (`METODE_WAJIB_SEJAK`, `metodeLama`); Harga ✓ tetap membebaskan Metode. Data nyata: 394 → sekitar 82 (311 hanya kurang Metode, semuanya data lama 12 Sep–10 Okt).
- Bagikan dalam tampilan Kartu (HP): PDF A4 tegak 2 kolom (`exportCardsPdf`, gambar langsung jsPDF, teks bisa dipilih, `pdfSafe` untuk huruf WinAnsi) dan gambar PNG lebar 1080 per halaman (`exportCardsImage`, canvas). Mengikuti hari yang dipilih. Lembar "File siap" (`offerFiles`): Bagikan (Web Share files) / Simpan. Tampilan Tabel tetap memakai ekspor tabel lama.
- Kartu detail: judul kartu = customer → nama → item (sebelumnya kartu Operasional berjudul nomor "001").
- Laci folder: buka/tutup folder dan tahun beranimasi (WAAPI tinggi + isi muncul berurutan, `accGrow/accShrink`), gulir otomatis bila isi terhalang (`accEnsureVisible`). Animasi CSS lama `folderAccIn` (berulang tiap render) dihapus.

## 35. Pencarian dashboard admin: semua baris cocok (sw v82)
- Bug: pencarian hanya menampilkan baris cocok PERTAMA per catatan (mis. "Joko" dengan 2+ data di tanggal yang sama hanya muncul satu). `findMatchInContent` diganti `findAllMatchesInContent` (semua baris), `computeSearchMatches` membuat satu entri per baris cocok.
- Pencocokan per baris dengan kata kunci terpisah spasi (semua kata harus ada di salah satu kolom baris itu): "joko 12-11" atau "joko piston" mempersempit hasil. Judul catatan yang cocok tanpa baris cocok tetap satu kartu.
- Kartu hasil per baris: `data-rec-id` tiap baris (editor membuka baris yang tepat), badge = tanggal + jam baris. Render dibatasi 150 kartu dengan keterangan bila lebih. "Found N" menghitung semua kartu.
- Tes: `uji57/srch.js` (+ adm.js, ops.js lulus).

## 36. Standar editor + tanpa komentar (sw v83)
- Pengaman salah-editor diseragamkan di kelima editor data (administrator, kasbon, hutang-piutang, warung, operasional): peta `otherEditors` per skema (`warung-data-v1`, `kasbon-data-v1`, `hutangpiutang-data-v1`, `admin-data-v1`, `operasional-data-v1`, `custom-data-v1`) lalu `bmRedirect`. Sebelumnya administrator tidak mengalihkan catatan hutang-piutang/custom, kasbon/hutang-piutang tidak mengalihkan operasional/custom, dan warung hanya mengalihkan kasbon, sehingga catatan bisa tertimpa format yang salah.
- Semua komentar (JS, CSS, HTML) dihapus dari 6 editor dan dashboard-admin.html. Aturan tetap: JANGAN menulis komentar/teks panduan di kode.
- Tes: `uji57/guard.js` (30 kombinasi editor x skema), `cmp.js` (CSS/DOM identik), token JS identik, adm.js, ops.js, srch.js.

## 37. Navigasi dashboard-shop liquid glass (sw v84)
- Bar bawah `nav#nv` (dashboard-shop.html) memakai lensa kaca yang bisa diketuk dan digeser (`NG`, `ngInit/ngLayout/ngSync`, `ngMap`, filter SVG `#lensF`). Lapisan kaca dipisah dari nav (`u.gb`, `u.gl`) karena backdrop-filter pada induk memblokir backdrop-filter lensa. Lensa `u.lens` memakai distorsi SVG hanya di Chromium non-iOS (kelas `ngsvg`), selain itu kaca biasa.
- Tab dipilih dari posisi jari saat dilepas (`ngIdx(NG.tx)`), dipindah lewat `setTab`; pointer capture di nav, jadi pilihan lewat keyboard tetap lewat klik tombol. Layar 1100px ke atas tetap bar vertikal lama (kelas `ng` tidak dipasang). Pengaturan animasi "mati" membuat lensa langsung pindah tanpa fisika.
- Efek riak pada tombol nav dihapus (diganti lensa).
- Tes: `uji58/glass.js` (ketuk, geser, keyboard, desktop, terang/gelap) + flick.js.

## 38. Laporan Stok masuk per tanggal (dashboard-shop, tanpa bump sw)
- Laporan "Pembelian stok" diganti "Stok masuk" (`pgRepBuy`, `rcvDays`): per tanggal (`.dsep`), memuat nota pembelian (`rcvCard`) DAN penyesuaian stok bernilai positif (`D.adj` delta>0 dengan reason Isi stok, Stok awal, Stok masuk, Impor data, dst; `rcvAdjCard`, dikelompokkan per alasan). Tiap barang menampilkan stok sebelum > sesudah (`rcvBA` memakai `events/step`). Koreksi kurang (Rusak, dst) tidak ikut.
- Pintu masuk: Beranda > Laporan > Stok masuk, Lainnya > Laporan > Stok masuk, dan halaman Rekap stok > Laporan.
- Cocokkan nota toko (`pgRcv`) hanya untuk nota pembelian: centang barang + total di nota toko, status Sesuai/Selisih/Dicek n/m/Belum dicek (`rcvState`). Disimpan di localStorage `bm-rcv` per id nota, tidak ikut sinkron database.
- Ekspor CSV (`csvRcv`) dan PDF landscape (`pdfRcv`); `pdfBuild` menerima baris pemisah `{sep, rt}`.
- Tes: `uji58/rcv.js`.

## 39. Stok masuk: filter, halaman, hapus, urungkan (dashboard-shop, tanpa bump sw)
- State `SM` (periode `p` termasuk `rng` dengan `from`/`to` lewat `dateBtn` + `HOOK.smf/smt`, sumber `s`, halaman `pg`, mode pilih `mode`, pilihan `sel`). 10 tanggal per halaman (`SMZ`). CSV dan PDF mengikuti filter yang aktif.
- Mode Pilih: hanya catatan stok manual (`D.adj` delta>0) yang bisa dipilih per baris, per grup, atau per hari; `smDel` memberi peringatan bila stok jadi minus. Nota pembelian tidak ikut.
- Halaman Hapus barang (`pgDelItems`, `dsList`, `dsDel`): pilih per barang atau per jenis; barang yang pernah dipakai (`kUsed`) hanya dinonaktifkan. Pintu: Jenis barang dan Rekap stok.
- Urungkan/Ulangi (`UH`, `uhRun`, localStorage `bm-uh`, maksimal 20 langkah): menyimpan catatan yang dihapus (`di` barang, `da` adj, `ar` barang dinonaktifkan), bukan snapshot seluruh data, sehingga transaksi baru tidak ikut tertimpa; aman untuk sinkron (adj_insert/adj_delete, item_upsert/item_delete). Hanya admin yang boleh menghapus dan mengulang.
- Tes: `uji59/hapus.js`.

## 40. Galeri Bukti + navigasi Profil liquid glass (sw v86)
- `galeri-bm.html` = halaman mandiri "Galeri Bukti" (tombol "Galeri" di Profil BM tetap: `SHORTCUTS` a:'galeri', `location.href`). Tidak menyimpan gambar apa pun; hanya membaca foto bukti yang sudah ada di data.
- Sumber: tabel `notes` pada folder Buku Besar (`admin-data-v1`, customer/barang/pj) dan folder Operasional (`operasional-data-v1`, buyer/item/seller). Hanya record dengan `bukti` terisi. Tanggal/jam dari `created_at` record. Foto ibb lewat `/api/img?u=` (fungsi `buktiSrc` sama dengan editor).
- Tampilan: tile per foto dikelompokkan per tanggal (header tanggal bisa diketuk = filter hari itu), chip sumber (Semua/Buku Besar/Operasional), strip tanggal (60 hari terbaru + tombol kalender untuk tanggal lain), pencarian bawah multi-kata (nama, barang, PJ, keterangan, harga, tanggal, jam), muat bertahap 60 foto (tombol + otomatis saat scroll).
- Penampil: geser/zoom/ketuk dua kali, panel data (nama, barang, PJ/seller, keterangan, harga, metode, sumber, No), tombol "Buka data" ke editor (`?id=&folder=&rec=`), Salin data, Foto asli. Tombol back sistem menutup penampil (`layer()` + `__bmCanBack`).
- Gerbang admin sama dengan daftar-nomor-hp (`bm-admin-ok` optimistis, `is_admin`).
- Navigasi bawah `my-profile-bm.html` (`#nav`) memakai modul liquid glass yang sama dengan dashboard-shop (lensa displacement SVG hanya Chromium non-iOS, fisika pegas, lepas = pindah tab dari posisi jari, nonaktif di layar >=1100px). Tab tetap tombol `.tab-btn` dengan kelas `active`; `on` = penanda lensa. Pindah tab dari kode (`goTab`) disinkronkan lewat MutationObserver.
- Tes: `uji61/gal.js`, `uji61/nav.js`.

## 41. Warung per catatan: Harga otomatis, barang dan jasa dipisah (tanpa bump sw sendiri)
- Harga di editor admin = jasa + barang. Memilih barang di "Barang dari Warung" mengisi kolom Harga otomatis sebesar jumlah x harga barang. Jasa yang sudah ditambahkan di Harga tidak hilang saat barang atau jumlah diubah (Harga = Harga lama - barang lama + barang baru). Bila Harga berisi teks (bukan angka), Harga tidak ditimpa.
- Di bawah kolom Harga (form tambah dan edit detail) tampil rincian "Barang Rp X" dan, bila ada jasa, " · Jasa & lainnya Rp Y". Detail catatan memakai teks yang sama (`BMWarungPick.ringkas`).
- Catatan menyimpan `warung: [{id,nama,qty,harga}]`; `harga` adalah harga jual saat disimpan, jadi harga lama tidak bergeser bila harga Warung diganti. Catatan lama tanpa harga memakai harga jual Warung saat ini.
- `bm-warung-pick.js`: `mount(root, {onChange, onLoad})`; `onChange` dipanggil saat pengguna menambah, menghapus, atau mengubah jumlah; `onLoad` saat `set`/`reset`. Metode `total()` tersedia. Pengikat Harga ada di `mountWarungHarga` pada `editor-data-administrator.html`.
- Analisa membaca `warung` dari catatan (`warungItems`), bukan dari `shop_stok`. Warung = jumlah x harga tersimpan; BERSIH TOTAL = Pemasukan - Kasbon - Operasional - Warung. Bersih Cash dan Bersih Transfer tidak diubah. Panel Terpakai dari catatan, Stok Masuk dari `shop_stok` (alasan "Isi stok").
- Tes: `work65/e2e.js` (editor), `work65/ana.js` (Analisa).

## 42. Login dan tracking customer dan karyawan dihapus (sw v87)
- Dihapus dari repo: `customer-login.html`, `customer-tracking.html`, `karyawan-login.html`, `karyawan-tracking.html`, `manifest-customer.json`; rute `/role-customer-*` dan `/role-karyawan-*` di `vercel.json`; entri cache dan pengalihan di `sw.js`; tabel `customers` dan `karyawan` dari daftar mirror `sw.js`; menu Settings "Kelola Customer" dan "Kelola Karyawan" beserta layar, formulir, gaya, dan kodenya di `dashboard-admin.html`.
- Tidak disentuh: data catatan, folder, filter `owner_username` (tetap aman), field "Customer" di editor (itu nama pelanggan bengkel), dan label "Akun Karyawan" pada daftar folder PJ.
- Sisi Supabase sudah dibersihkan (26 Nov 2026): empat edge function lama dihapus manual oleh pemilik, akun login karyawan dihapus, lalu migrasi `hapus_peran_customer_karyawan` menghapus tabel `customers` dan `karyawan`, fungsi `is_customer`, `is_karyawan`, `get_customer_username`, `get_my_ledger_history`, dan kebijakan peran customer/karyawan. Kebijakan baca `folders` dan `notes` kini khusus admin (`Admin baca folder`, `Admin baca notes`). Fungsi backup melewati tabel yang tidak ada. `admin-manage` sengaja dipertahankan karena dipakai halaman Profil.
- Penyebutan halaman customer dan karyawan di bagian HANDOFF yang lebih lama bersifat riwayat.
- Upload lewat "Add files via upload" tidak menghapus file lama: kelima file di atas harus dihapus manual di GitHub.


## 43. Tombol kembali universal, Pengaturan dan Sampah gabungan di My Profile (sw v88)
- `bm-swipe-back.js` kini menyediakan `window.bmLayer` (tumpukan layer berbasis history): `open(closeFn)`, `closed(id, then)`, `after(fn)`, `watch(el, cls, closeFn)`, `views({home, backs})`, `count()`. Back/gesture sistem menutup layer paling atas dulu, baru keluar halaman. Layer yang ditutup bersamaan atau tidak di puncak riwayat dibereskan otomatis (antrean `skip`, `later`, `zomb`).
- Skrip berstatus `defer` jalan setelah HTML selesai; kode yang memakai `bmLayer` di halaman defer dibungkus `DOMContentLoaded`. My Profile memuat skripnya tanpa defer.
- Enam editor (administrator, kasbon, hutang-piutang, operasional, warung, folder) memakai `bmLayer.views` untuk Add, Detail, Settings, Trash dan `bmLayer.watch` untuk semua overlay.
- `my-profile-bm.html`: halaman Pengaturan (tema gelap, Daftar Nomor Customer, Manajemen Sistem, info) dan Sampah gabungan (catatan, folder, record dari semua editor; pulihkan, hapus permanen, kosongkan). Tombol Cadangan manual dihapus.
- `dashboard-admin.html`: Settings, Haptic, tombol Kasir dan layar Sampah dihapus; fungsi pindah ke sampah tetap.
- `system-management.html`, `daftar-nomor-hp.html`: tombol kembali ke My Profile; `analisa.html`, `folder-baru.html`, `panduan.html`, `salary-recap.html`: kembali memakai riwayat bila berasal dari halaman sendiri; sheet dan dialog salary-recap jadi layer.
- Uji kegagalan yang sudah ada sebelum perubahan ini: `ana.js` "panel detail stok masuk 480.000".
