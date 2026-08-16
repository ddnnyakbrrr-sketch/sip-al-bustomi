# Rencana Backend — Fungsi yang Belum Ada di Code.gs

Dokumen ini membandingkan **25 aksi** yang sudah ada di `Code.gs` dengan kebutuhan
**36 modul** frontend, lalu mendaftar apa saja yang masih kurang.

Status per 4 Agustus 2026. Belum ada kode yang ditulis — menunggu persetujuan.

---

## Ringkasan

| | Jumlah |
|---|---|
| Aksi yang sudah ada | 25 |
| Aksi yang masih kurang | **43** (42 entri; no. 31 memuat dua fungsi) |
| Sheet baru yang dibutuhkan | **3** |
| Kolom yang perlu ditambahkan ke sheet lama | **4 kelompok** |

Sebaran kekurangannya timpang: dari 25 aksi yang ada, hanya **6 yang membaca data**
(`getDashboardKepsek`, `getUsers`, `getSiswaPending`, `getTagihanMenunggak`,
`getDataAnak`, `getTagihanWaliMurid`). Padahal hampir semua modul perlu membaca
daftar sebelum bisa menampilkan apa pun. **Kekurangan terbesar ada di sisi baca,
bukan sisi tulis.**

---

## Yang sudah ada (25 aksi)

Supaya jelas apa yang tidak perlu dibuat lagi:

`login` · `verifyToken` · `getDashboardKepsek` · `approveAkun` · `approvePengumuman`
· `approveTransaksi` · `approveSiswa` · `crudBiaya` · `getUsers` · `resetPin`
· `createAccount` · `inputSiswa` · `getSiswaPending` · `createPengumuman`
· `approvePengumumanTagihanKTU` · `getTagihanMenunggak` · `catatPembayaran`
· `catatTransaksi` · `usulanBiaya` · `absenGuru` · `simpanRPP` · `inputNilai`
· `getDataAnak` · `getTagihanWaliMurid` · `uploadBuktiBayar`

---

# PRIORITAS 1 — Sudah ada pasangan modulnya, sering dipakai

13 aksi. Ini yang membuka jalan paling banyak modul sekaligus.

### 1. `tolakAkun(userId, token)` ✅ sudah Anda setujui
- **Modul:** 4.2 Approve Akun
- **Parameter:** `userId`
- **Kerjanya:** hapus baris dari sheet `Users`, catat ke `Approval_Log` dan `Log_Aktivitas`
- **Peran:** kepsek
- **Catatan:** tanpa ini tombol Tolak di Modul 4.2 mati. Kode sudah saya siapkan.

### 2. `getKelas(token)`
- **Modul:** 6.4 Data Master, 6.5 Input Siswa, 6.6 Jadwal, 7.1 Data Anak, Guru RPP, Guru Input Nilai, 4.5 Data Siswa Pending
- **Parameter:** —
- **Kerjanya:** ambil seluruh baris sheet `Kelas`
- **Peran:** semua yang sudah login
- **Catatan:** dipakai 7 modul. Salah satu yang paling sering dibutuhkan.

### 3. `getMapel(token)`
- **Modul:** 6.4, 6.6, 7.1, Guru RPP, Guru Input Nilai
- **Parameter:** —
- **Kerjanya:** ambil seluruh baris sheet `Mata_Pelajaran`
- **Peran:** semua yang sudah login

### 4. `crudKelas(aksi, data, token)`
- **Modul:** 6.4 Data Master tab Kelas
- **Parameter:** `aksi` = `create`/`update`/`delete`, `data` = `{ id, nama, tingkat }`
- **Kerjanya:** tambah, ubah, atau hapus baris `Kelas`
- **Peran:** ktu
- **Catatan:** bentuknya meniru `crudBiaya` yang sudah ada.

### 5. `crudMapel(aksi, data, token)`
- **Modul:** 6.4 Data Master tab Mata Pelajaran
- **Parameter:** `aksi` = `create`/`update`/`delete`, `data` = `{ id, nama, kode }`
- **Kerjanya:** tambah, ubah, atau hapus baris `Mata_Pelajaran`
- **Peran:** ktu

### 6. `getBiaya(token)`
- **Modul:** 4.4 Kelola Biaya, 5.2 Pengumuman Tagihan, 5.3 Pencatatan Pembayaran, 5.6 Usulan Biaya, 7.3 Tagihan
- **Parameter:** —
- **Kerjanya:** ambil seluruh baris sheet `Biaya`
- **Peran:** kepsek, bendahara, ktu, walimurid
- **Catatan:** `crudBiaya` sudah bisa menulis, tapi belum ada cara membacanya.

### 7. `getSiswa(token, filter)`
- **Modul:** 6.4, 6.5, 5.2, 5.3, 4.5, Guru Input Nilai, Guru Pengumuman Khusus
- **Parameter:** `filter` opsional = `{ id_kelas, id_wali_murid, status_data }`
- **Kerjanya:** ambil baris `Siswa`, disaring bila filter diisi
- **Peran:** kepsek, ktu, bendahara, guru
- **Catatan:** `getSiswaPending` hanya mengambil yang `pending`. Modul lain butuh semuanya.

### 8. `getPengumuman(token, filter)`
- **Modul:** 4.3 Approve Pengumuman, 6.2 Pengumuman Global, 7.2 Pesan Wali Kelas, 7.4 Pengumuman, Guru Pengumuman Khusus
- **Parameter:** `filter` opsional = `{ tipe, status, id_penerima_siswa, dari_id_user }`
- **Kerjanya:** ambil baris `Pengumuman`, disaring bila filter diisi
- **Peran:** semua
- **Catatan:** wali murid hanya boleh menerima yang `approved` — penyaringannya **wajib di backend**, jangan diserahkan ke frontend.

### 9. `getTransaksi(token, filter)`
- **Modul:** 5.1 Dashboard, 5.4 Manajemen Kas, 5.5 Laporan Keuangan, Approval Tagihan KTU, Approve Keuangan Kepsek
- **Parameter:** `filter` opsional = `{ tipe, status_approval, tgl_mulai, tgl_akhir }`
- **Kerjanya:** ambil baris `Transaksi_Keuangan`, disaring bila filter diisi
- **Peran:** kepsek, bendahara, ktu

### 10. `getTagihan(token, filter)`
- **Modul:** 5.2, 5.5, 7.3 Tagihan
- **Parameter:** `filter` opsional = `{ id_siswa, status_bayar, tgl_mulai, tgl_akhir }`
- **Kerjanya:** ambil baris `Tagihan_Siswa`, disaring bila filter diisi
- **Peran:** kepsek, bendahara, walimurid
- **Catatan:** `getTagihanMenunggak` hanya yang lewat jatuh tempo, `getTagihanWaliMurid` hanya milik satu wali.

### 11. `updateSiswa(idSiswa, data, token)`
- **Modul:** 6.4 Data Master tab Siswa
- **Parameter:** `idSiswa`, `data` = `{ id_kelas, id_wali_murid }`
- **Kerjanya:** ubah kolom tertentu pada satu baris `Siswa`
- **Peran:** ktu
- **Catatan:** dipakai dropdown penetapan kelas dan wali murid.

### 12. `updateUser(userId, data, token)`
- **Modul:** 6.4 Data Master tab Guru, Bendahara, Wali Murid
- **Parameter:** `userId`, `data` = `{ aktif, id_mapel, id_kelas_wali }`
- **Kerjanya:** ubah kolom tertentu pada satu baris `Users`
- **Peran:** ktu
- **Catatan:** ⚠️ kolom `id_mapel` dan `id_kelas_wali` **belum ada** di sheet `Users` — ada di sheet `Guru` yang terpisah. Perlu keputusan: pakai sheet `Guru`, atau tambah kolom di `Users`.

### 13. `getLog(token, batas)`
- **Modul:** 4.1 Monitoring (daftar aktivitas terbaru)
- **Parameter:** `batas` = jumlah baris terakhir, bawaan 5
- **Kerjanya:** ambil baris terakhir `Log_Aktivitas`, terbaru di atas
- **Peran:** kepsek
- **Catatan:** `getDashboardKepsek` hanya mengembalikan angka ringkasan, bukan daftar aktivitasnya.

---

# PRIORITAS 2 — Modul sudah jadi, backendnya nol

18 aksi. Modul-modul ini **tidak bisa dipindahkan sama sekali** sebelum aksinya ada.

## 2A. Jadwal Pelajaran (Modul 6.6, 7.1, Guru Dashboard)

### 14. `getJadwal(token, filter)`
- **Parameter:** `filter` = `{ id_kelas, id_guru, hari, tahun_ajaran }`
- **Kerjanya:** ambil baris `Jadwal_Pelajaran`, disaring
- **Peran:** semua

### 15. `simpanJadwal(data, token)`
- **Parameter:** `data` = `{ id?, id_kelas, id_mapel, id_guru, hari, jam_mulai, jam_selesai, tahun_ajaran }`
- **Kerjanya:** tambah baris baru bila `id` kosong, perbarui bila `id` ada
- **Peran:** ktu
- **Catatan:** ⚠️ **deteksi bentrok harus ikut pindah ke backend.** Kalau hanya dijaga di frontend, dua KTU yang menyimpan bersamaan tetap bisa membuat jadwal bentrok.

### 16. `hapusJadwal(idJadwal, token)`
- **Parameter:** `idJadwal`
- **Kerjanya:** hapus satu baris `Jadwal_Pelajaran`
- **Peran:** ktu

## 2B. Tahun Ajaran (Modul 6.6, Konfigurasi)

### 17. `getTahunAjaran(token)`
- **Parameter:** —
- **Kerjanya:** ambil seluruh baris `Tahun_Ajaran`
- **Peran:** semua

### 18. `setTahunAjaranAktif(idTahun, token)`
- **Parameter:** `idTahun`
- **Kerjanya:** set `status_aktif = TRUE` pada satu baris, `FALSE` pada semua baris lain
- **Peran:** kepsek

## 2C. Event (Modul 6.7)

### 19. `getEvent(token, status)`
- **Parameter:** `status` opsional = `pending`/`approved`/`rejected`
- **Kerjanya:** ambil baris `Event`, disaring status
- **Peran:** semua

### 20. `simpanEvent(data, token)`
- **Parameter:** `data` = `{ nama_event, jenis, tgl_mulai, tgl_selesai, deskripsi, target }`
- **Kerjanya:** tambah baris `Event` dengan `status_approval = pending`
- **Peran:** ktu
- **Catatan:** ⚠️ sheet `Event` **tidak punya kolom `jenis` dan `target`** yang dipakai modulnya.

### 21. `batalEvent(idEvent, token)`
- **Parameter:** `idEvent`
- **Kerjanya:** hapus baris `Event` yang masih `pending`
- **Peran:** ktu

### 22. `approveEvent(idEvent, status, token)`
- **Parameter:** `idEvent`, `status` = `approved`/`rejected`
- **Kerjanya:** ubah `status_approval`
- **Peran:** kepsek
- **Catatan:** modul Kepsek untuk menyetujui event **belum dibuat di frontend**. Aksinya boleh ditunda sampai modulnya ada.

## 2D. Arsip Digital (Modul 6.8) — perlu sheet baru

### 23. `getArsip(token, filter)`
- **Parameter:** `filter` = `{ kategori, cari }`
- **Kerjanya:** ambil baris sheet **`Arsip`**
- **Peran:** sesuai kolom `akses`

### 24. `simpanArsip(data, token)`
- **Parameter:** `data` = `{ judul, kategori, nama_file, ukuran, akses, keterangan }`
- **Kerjanya:** tambah baris `Arsip`
- **Peran:** ktu

### 25. `hapusArsip(idArsip, token)`
- **Parameter:** `idArsip`
- **Kerjanya:** hapus satu baris `Arsip`
- **Peran:** ktu

## 2E. Permohonan Perubahan Data Wali Murid (Modul 6.9, 7.5) — perlu sheet baru

### 26. `getPermohonanWali(token, filter)`
- **Parameter:** `filter` = `{ status, id_user }`
- **Kerjanya:** ambil baris sheet **`Permohonan_Wali`**
- **Peran:** ktu (semua), walimurid (miliknya sendiri)

### 27. `ajukanPerubahanWali(data, token)`
- **Parameter:** `data` = `{ email_baru, no_hp_baru, alamat_baru }`
- **Kerjanya:** tambah baris `Permohonan_Wali` berstatus `pending`; nilai lamanya diambil backend dari `Users`, bukan dikirim frontend
- **Peran:** walimurid

### 28. `prosesPermohonanWali(idPermohonan, status, token)`
- **Parameter:** `idPermohonan`, `status` = `approved`/`rejected`
- **Kerjanya:** ubah status; bila `approved`, perbarui juga kolom terkait di `Users`
- **Peran:** ktu
- **Catatan:** ⚠️ pengecekan email kembar **wajib di backend**, seperti yang sudah berlaku di frontend.

## 2F. Profil Wali Murid (Modul 7.5)

### 29. `gantiPin(pinLama, pinBaru, token)`
- **Parameter:** `pinLama`, `pinBaru`
- **Kerjanya:** cocokkan hash `pinLama`, lalu simpan hash `pinBaru`
- **Peran:** semua yang sudah login
- **Catatan:** berbeda dari `resetPin` yang sudah ada — itu untuk Kepsek mereset PIN orang lain.

## 2G. Rantai Approval Keuangan (Approval Tagihan KTU, Approve Keuangan Kepsek)

### 30. `approvePembayaranKTU(transaksiId, status, token)`
- **Parameter:** `transaksiId`, `status` = `approved`/`rejected`
- **Kerjanya:** `pending_KTU` → `pending_Kepsek` bila disetujui, `rejected` bila ditolak
- **Peran:** ktu
- **Catatan:** `approvePengumumanTagihanKTU` hanya menangani **pengumuman**, bukan pembayaran.

### 31. `getKonfigurasi(token)` + `simpanKonfigurasi(kunci, nilai, token)` — perlu sheet baru
- **Modul:** Konfigurasi Umum
- **Parameter:** `kunci`, `nilai`
- **Kerjanya:** baca/tulis sheet **`Konfigurasi`** berisi `threshold_keuangan` dan `logo_url`
- **Peran:** kepsek
- **Catatan:** ⚠️ `BATAS_PENGELUARAN` di `Code.gs` masih konstanta. Kalau threshold jadi bisa diatur, `catatTransaksi()` harus membacanya dari sheet.

---

# PRIORITAS 3 — Modul Guru dan pelengkap

11 aksi. Modul Guru sudah jadi seluruhnya di frontend, tapi hanya 3 aksinya yang
ada di backend (`absenGuru`, `simpanRPP`, `inputNilai`) — semuanya sisi tulis,
tidak satu pun sisi baca.

### 32. `getAbsensiGuru(token, filter)`
- **Modul:** Guru Absensi Mengajar (riwayat 7 hari), 4.7 Laporan Kinerja
- **Parameter:** `filter` = `{ id_guru, tgl_mulai, tgl_akhir }`
- **Kerjanya:** ambil baris `Absensi_Mengajar`
- **Peran:** guru (miliknya), kepsek (semua)
- **Catatan:** Guru juga perlu tahu apakah hari ini sudah check-in — bisa dilayani aksi ini dengan filter tanggal hari ini.

### 33. `getRPP(token, filter)`
- **Modul:** Guru RPP (riwayat), 4.7 Laporan Kinerja
- **Parameter:** `filter` = `{ id_guru, tgl_mulai, tgl_akhir }`
- **Kerjanya:** ambil baris `RPP`
- **Peran:** guru (miliknya), kepsek (semua)

### 34. `getNilai(token, filter)`
- **Modul:** Guru Input Nilai (kolom "Nilai Terakhir"), 7.1 Data Anak, 4.7 Laporan Kinerja
- **Parameter:** `filter` = `{ id_siswa, id_mapel, id_guru, jenis }`
- **Kerjanya:** ambil baris `Nilai`
- **Peran:** guru, kepsek, walimurid (anaknya saja)

### 35. `inputNilaiBanyak(daftar, token)`
- **Modul:** Guru Input Nilai
- **Parameter:** `daftar` = larik `{ id_siswa, nilai }` + `id_mapel`, `jenis`
- **Kerjanya:** simpan banyak nilai sekaligus dalam satu panggilan
- **Peran:** guru
- **Catatan:** `inputNilai` yang ada hanya satu nilai per panggilan. Satu kelas 30 siswa berarti 30 panggilan × 3 detik = **90 detik**. Versi borongan ini wajib, bukan pilihan.

### 36. `getJadwalHariIni(token)`
- **Modul:** Guru Dashboard
- **Parameter:** —
- **Kerjanya:** ambil jadwal guru yang login untuk nama hari ini
- **Peran:** guru
- **Catatan:** bisa juga dilayani `getJadwal` dengan filter `id_guru` + `hari`. Aksi tersendiri hanya bila ingin lebih ringkas.

### 37. `getAbsensiSiswa(token, idSiswa)`
- **Modul:** 7.1 Data Anak (Absensi 7 Hari Terakhir)
- **Parameter:** `idSiswa`
- **Kerjanya:** ambil kehadiran siswa
- **Peran:** walimurid (anaknya), guru, kepsek
- **Catatan:** ⚠️ sheet `Absensi_Mengajar` **tidak punya kolom `id_siswa`** — isinya absensi guru. Perlu keputusan: tambah kolom, atau buat sheet `Absensi_Siswa` tersendiri.

### 38. `getUsulanBiaya(token, filter)`
- **Modul:** 5.6 Usulan Biaya (riwayat)
- **Parameter:** `filter` = `{ status }`
- **Kerjanya:** ambil usulan dari `Approval_Log` bertipe `biaya`
- **Peran:** bendahara, kepsek

### 39. `approveUsulanBiaya(idUsulan, status, token)`
- **Modul:** belum ada modul Kepsek untuk ini
- **Parameter:** `idUsulan`, `status`
- **Kerjanya:** setujui usulan; bila disetujui, perbarui nominal di sheet `Biaya`
- **Peran:** kepsek
- **Catatan:** frontend belum punya layarnya. Boleh ditunda.

### 40. `batalPengumuman(idPengumuman, token)`
- **Modul:** 6.2 Pengumuman Global (batalkan kiriman sendiri)
- **Parameter:** `idPengumuman`
- **Kerjanya:** hapus pengumuman yang masih `pending` milik pengirimnya
- **Peran:** ktu, guru

### 41. `batalTransaksi(idTransaksi, token)`
- **Modul:** 5.4 Manajemen Kas
- **Parameter:** `idTransaksi`
- **Kerjanya:** hapus transaksi yang masih `pending_Kepsek`
- **Peran:** bendahara

### 42. `getLaporanKinerja(token, filter)`
- **Modul:** 4.7 Laporan Kinerja
- **Parameter:** `filter` = `{ id_guru, tgl_mulai, tgl_akhir }`
- **Kerjanya:** rekap absensi, RPP, dan rata-rata nilai per guru
- **Peran:** kepsek
- **Catatan:** bisa juga disusun di frontend dari aksi 32, 33, 34. Aksi tersendiri lebih hemat — satu panggilan, bukan tiga.

---

# Perubahan struktur data yang menjadi prasyarat

Ini bukan pilihan. Tanpa ini, sebagian aksi di atas tidak punya tempat menyimpan.

## Sheet baru yang harus dibuat (3)

| Sheet | Kolom | Untuk modul |
|---|---|---|
| **`Arsip`** | `id, judul, kategori, nama_file, ukuran, akses, keterangan, diupload_oleh, tgl_upload` | 6.8 |
| **`Permohonan_Wali`** | `id, id_user, nama, email_lama, email_baru, no_hp_lama, no_hp_baru, alamat_lama, alamat_baru, status, tgl_permohonan, approved_by, tgl_approve` | 6.9, 7.5 |
| **`Konfigurasi`** | `kunci, nilai` | Konfigurasi Umum |

## Kolom yang perlu ditambahkan ke sheet lama (4 kelompok)

| Sheet | Kolom yang kurang | Dipakai modul |
|---|---|---|
| **`Users`** | `no_hp`, `alamat` | 6.9, 7.5 |
| **`Siswa`** | 21 kolom biodata (tempat lahir, tanggal lahir, jenis kelamin, agama, kewarganegaraan, alamat, nama & pekerjaan & penghasilan ayah-ibu, jumlah saudara, dll.) | 6.5, 4.5, 7.1 |
| **`Pengumuman`** | `judul`, `target`, `dari_role`, `id_penerima_list` | 6.2, 5.2, 7.4 |
| **`Transaksi_Keuangan`** | `id_siswa`, `id_biaya`, `bukti`, `keterangan` | 5.3, Approval Tagihan, Approve Keuangan |
| **`Event`** | `jenis`, `target` | 6.7 |
| **`Absensi_Mengajar`** | `id_siswa` — atau buat sheet `Absensi_Siswa` sendiri | 7.1 |

Sheet `Siswa` yang paling parah: **8 kolom sekarang, aplikasi menyimpan 29 field.**
Kalau tidak ditambah, memindahkan Modul 6.5 akan membuang 21 field data siswa.

---

# Catatan kinerja yang perlu diantisipasi

Satu panggilan Apps Script memakan **3–4 detik**. Beberapa layar butuh banyak data:

| Layar | Data yang dibutuhkan | Bila satu aksi per data |
|---|---|---|
| 6.4 Data Master | users, siswa, kelas, mapel | ~14 detik |
| 7.1 Data Anak | siswa, kelas, jadwal, mapel, absensi, nilai | ~21 detik |
| Guru Input Nilai | mapel, kelas, siswa, nilai | ~14 detik |

**Saran:** buat aksi gabungan per layar, misalnya `getDataMaster(token)` yang
mengembalikan keempat daftar sekaligus dalam satu panggilan. Kalau tidak, layar
seperti Data Anak akan terasa menggantung sangat lama.

Aksi gabungan yang layak dipertimbangkan (di luar 42 di atas):
`getDataMaster`, `getBekalDataAnak`, `getBekalInputNilai`.

---

# Urutan pengerjaan yang saya sarankan

1. **Prasyarat struktur** — buat 3 sheet baru, tambah kolom yang kurang
2. **Prioritas 1** — 13 aksi; setelah ini Modul 4.2, 4.4, 6.4 bisa dipindahkan
3. **Prioritas 2** — 18 aksi; membuka 6.6, 6.7, 6.8, 6.9, 7.5, dan rantai approval
4. **Prioritas 3** — 11 aksi; menutup role Guru dan laporan
5. **Aksi gabungan** — setelah semuanya jalan, baru dioptimalkan kecepatannya

Setiap batch perlu **deploy ulang** (Kelola deployment → Versi baru).
