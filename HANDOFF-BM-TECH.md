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
