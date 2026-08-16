# Struktur Database Google Sheet — SIP Al Bustomi

Dokumen ini adalah acuan baku struktur spreadsheet yang dipakai sebagai database aplikasi.
Total: **17 sheet (tab)**. Urutan kolom pada baris 1 setiap sheet WAJIB sama persis dengan daftar di bawah.

---

## 1. Users

Baris 1 (header):

```
id | nama | email | pin | role | subrole | aktif | token | token_expired
```

Jumlah kolom: 9 (A–I)

---

## 2. Siswa

Baris 1 (header):

```
id | nis | nama | id_kelas | id_wali_murid | status_data | diinput_oleh | tgl_input
```

Jumlah kolom: 8 (A–H)

---

## 3. Guru

Baris 1 (header):

```
id_user | jenis | id_mapel | id_kelas_wali
```

Jumlah kolom: 4 (A–D)

Nilai `jenis`: `mapel` / `walikelas`

---

## 4. Mata_Pelajaran

Baris 1 (header):

```
id | nama | kode
```

Jumlah kolom: 3 (A–C)

---

## 5. Kelas

Baris 1 (header):

```
id | nama | tingkat
```

Jumlah kolom: 3 (A–C)

---

## 6. Tahun_Ajaran

Baris 1 (header):

```
id | tahun | status_aktif
```

Jumlah kolom: 3 (A–C)

---

## 7. RPP

Baris 1 (header):

```
id | id_guru | id_mapel | id_kelas | tgl | materi | metode | media | file_url
```

Jumlah kolom: 9 (A–I)

---

## 8. Absensi_Mengajar

Baris 1 (header):

```
id | id_guru | tgl | jam_masuk | jam_keluar | status
```

Jumlah kolom: 6 (A–F)

---

## 9. Nilai

Baris 1 (header):

```
id | id_siswa | id_mapel | id_guru | jenis | nilai | tgl
```

Jumlah kolom: 7 (A–G)

Nilai `jenis`: `harian` / `ujian` / `hafalan`

---

## 10. Pengumuman

Baris 1 (header):

```
id | dari_id_user | dari_nama | tipe | id_penerima_siswa | konten | status | tgl | approved_by
```

Jumlah kolom: 9 (A–I)

Nilai `tipe`: `global` / `khusus` / `tagihan`
Nilai `status`: `pending` / `pending_KTU` / `pending_Kepsek` / `approved` / `rejected`

---

## 11. Biaya

Baris 1 (header):

```
id | nama_biaya | nominal_default | dibuat_oleh | status_aktif | tgl_dibuat
```

Jumlah kolom: 6 (A–F)

---

## 12. Tagihan_Siswa

Baris 1 (header):

```
id | id_siswa | id_biaya | nominal | jatuh_tempo | status_bayar | tgl_bayar | bukti_url
```

Jumlah kolom: 8 (A–H)

---

## 13. Transaksi_Keuangan

Baris 1 (header):

```
id | tipe | jumlah | deskripsi | id_pengaju | status_approval | approved_by | tgl
```

Jumlah kolom: 8 (A–H)

Nilai `tipe`: `pemasukan` / `pengeluaran`

---

## 14. Approval_Log

Baris 1 (header):

```
id | tipe | id_item | status | oleh | catatan | timestamp
```

Jumlah kolom: 7 (A–G)

Nilai `tipe`: `akun` / `pengumuman` / `biaya` / `transaksi` / `siswa`

---

## 15. Jadwal_Pelajaran

Baris 1 (header):

```
id | id_kelas | id_mapel | id_guru | hari | jam_mulai | jam_selesai | tahun_ajaran
```

Jumlah kolom: 8 (A–H)

---

## 16. Event

Baris 1 (header):

```
id | nama_event | tgl_mulai | tgl_selesai | deskripsi | dibuat_oleh | status_approval
```

Jumlah kolom: 7 (A–G)

---

## 17. Log_Aktivitas

Baris 1 (header):

```
id | id_user | nama_user | role | aksi | deskripsi | timestamp
```

Jumlah kolom: 7 (A–G)

---

## Rekap Jumlah Kolom

| No | Nama Sheet          | Jumlah Kolom |
|----|---------------------|--------------|
| 1  | Users               | 9            |
| 2  | Siswa               | 8            |
| 3  | Guru                | 4            |
| 4  | Mata_Pelajaran      | 3            |
| 5  | Kelas               | 3            |
| 6  | Tahun_Ajaran        | 3            |
| 7  | RPP                 | 9            |
| 8  | Absensi_Mengajar    | 6            |
| 9  | Nilai               | 7            |
| 10 | Pengumuman          | 9            |
| 11 | Biaya               | 6            |
| 12 | Tagihan_Siswa       | 8            |
| 13 | Transaksi_Keuangan  | 8            |
| 14 | Approval_Log        | 7            |
| 15 | Jadwal_Pelajaran    | 8            |
| 16 | Event               | 7            |
| 17 | Log_Aktivitas       | 7            |
