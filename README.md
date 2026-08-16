# SIP Al-Bustomi

Sistem Informasi Sekolah berbasis web. Satu berkas `index.html` di sisi pengguna,
Google Apps Script + Google Sheet sebagai backend-nya.

## ⚠️ Baca dulu sebelum dipakai

Repositori ini **publik**. Artinya alamat backend (`API_URL` di dalam `index.html`)
bisa dibaca siapa saja — dan itu memang tidak bisa disembunyikan pada aplikasi yang
berjalan di peramban.

Yang melindungi data Anda hanyalah **PIN tiap pengguna**. Karena itu:

- **Ganti PIN semua akun** lewat menu Profil → Ganti PIN. Jangan pakai angka
  berurutan seperti `123456`.
- Jangan menaruh data pribadi santri yang sensitif selama masih tahap uji coba.
- Kalau alamat backend perlu diganti, jalankan *Deploy ulang* di Apps Script
  sehingga URL lama tidak berlaku lagi, lalu perbarui `API_URL`.

## Peran pengguna

| Peran | Kewenangan utama |
|---|---|
| Kepala Sekolah | Menyetujui akun, pengumuman, keuangan, event, dan usulan biaya |
| KTU | Data master, data siswa, jadwal, event, arsip |
| Bendahara | Tagihan, pembayaran, kas, laporan keuangan |
| Guru | Absensi mengajar, RPP, input nilai |
| Wali Murid | Data anak, tagihan, pengumuman, pesan wali kelas |

## Modul yang sudah tersambung ke Google Sheet

Data pada modul berikut benar-benar datang dari server:

- **Approve Akun**, **Approve Event**, **Approve Usulan Biaya** (Kepala Sekolah)
- **Data Master** (KTU) — `getDataMaster`
- **Dashboard Bendahara** — `getTransaksi` + `getTagihan` + `getSiswa` + `getBiaya`
- **Input Nilai** (Guru) — `getBekalInputNilai`, disimpan lewat `inputNilaiBanyak`
- **Data Anak** (Wali Murid) — `getBekalDataAnak`
- **Tagihan** (Wali Murid) — `getTagihanWaliMurid` + `getDataAnak`

Modul yang **belum** tersambung menandai dirinya sendiri di layar dengan pita
*"Data contoh, belum tersambung server"*, supaya angka demo tidak pernah disangka
angka sungguhan.

## Cara kerja lapisan API

Menambah modul baru cukup tiga langkah, tanpa menyentuh `loadModule()`:

```js
// 1. Fungsi modulnya mengembalikan wadah kosong
function modulAnu() {
  return '<h1 class="module-title">Anu</h1>' +
         '<div id="isi-anu" data-muat="anu"></div>';
}

// 2. Daftarkan pemuatnya
PEMUAT.anu = function() {
  return _muatModul('isi-anu', [['getAnu']], function(d) {
    _srvIsi(d[0]);            // titipkan hasil server
    return _htmlIsiAnu();     // gambar dari data itu
  }, 'anu', 4);
};

// 3. Aksi tulis memakai _kirimAksi supaya tombolnya sibuk
await _kirimAksi('id-tombol', 'simpanAnu', { data: muatan }, 'anu', 'Menyimpan');
```

Bila server tidak menjawab, `_muatModul()` menampilkan kartu gagal beserta tombol
**Coba Lagi** — bukan data lama dari peramban.

## Menjalankan secara lokal

```bash
python3 -m http.server 8899
```

Lalu buka `http://localhost:8899`.

## Berkas

| Berkas | Isi |
|---|---|
| `index.html` | Seluruh antarmuka dan logika sisi pengguna |
| `Code.gs` | Backend Apps Script (login, RBAC, CRUD, laporan) |
| `PANDUAN_DEPLOY.md` | Langkah pemasangan dari nol |
| `RENCANA_BACKEND.md` | Rancangan API dan alur data |
| `STRUKTUR_DATABASE.md` | Susunan sheet dan kolomnya |
