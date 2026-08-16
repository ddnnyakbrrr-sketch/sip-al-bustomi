# Panduan Membangun & Menerbitkan SIP Al Bustomi

Dokumen ini menjelaskan cara menyiapkan, menjalankan, dan menerbitkan aplikasi
SIP Al Bustomi dari nol sampai bisa dipakai pengguna sungguhan.

Berkas yang terlibat:

| Berkas | Isi | Ukuran |
|---|---|---|
| `index.html` | Seluruh aplikasi: HTML, CSS, dan JavaScript dalam satu berkas | ~433 KB |
| `Code.gs` | Backend Google Apps Script (25 aksi + 16 helper internal) | ~43 KB |
| `STRUKTUR_DATABASE.md` | Acuan baku 17 sheet beserta kolomnya | ~4 KB |

---

## 0. Baca ini dulu — status aplikasi saat ini

Ada dua hal yang sudah selesai dan **satu jembatan yang belum tersambung**:

- ✅ **`index.html` sudah lengkap.** 30 modul untuk 4 role, berjalan penuh
  dengan data di **localStorage peramban**. Bisa dipakai dan didemokan hari ini juga.
- ✅ **`Code.gs` sudah lengkap.** 25 aksi backend siap dipasang ke Google Sheet.
- ⚠️ **Keduanya belum saling terhubung.** Di `index.html` ada fungsi `callAPI()`
  yang masih kosong:

  ```javascript
  async function callAPI(action, data = {}) {
    // Akan diisi nanti
  }
  ```

  Aplikasi tidak pernah memanggil backend sama sekali. Semua data disimpan
  di peramban masing-masing pengguna.

**Artinya ada dua jalur pemakaian:**

| Jalur | Untuk apa | Usaha |
|---|---|---|
| **A. Mode localStorage** | Demo, pelatihan staf, uji coba fitur, presentasi | Sudah siap — tinggal buka |
| **B. Mode Google Sheet** | Dipakai betulan, data terpusat, banyak pengguna | Masih perlu penggarapan — lihat Bagian 5 |

Mulailah dari Jalur A. Kerjakan Jalur B kalau memang sudah mau dipakai serius.

---

# JALUR A — Menjalankan aplikasi hari ini

## A1. Cara tercepat: buka langsung

Klik ganda `index.html`. Selesai. Aplikasi terbuka di peramban.

Akun bawaan untuk mencoba. PIN awalnya diatur saat Anda menjalankan
`buatAkunPertama()` di Apps Script — **ganti sebelum dipakai sungguhan**:

| Email | Role |
|---|---|
| `kepsek@sip.sch.id` | Kepala Sekolah |
| `bendahara@sip.sch.id` | Bendahara |
| `ktu@sip.sch.id` | KTU |
| `wali@sip.sch.id` | Guru Wali Kelas |
| `ortu@sip.sch.id` | Wali Murid |

> **Catatan:** membuka lewat `file://` membuat data tersimpan per berkas.
> Untuk pengujian yang lebih mendekati aslinya, pakai server lokal di bawah.

## A2. Server lokal (disarankan untuk pengujian)

Buka Terminal, masuk ke folder proyek, lalu:

```bash
python3 -m http.server 8899
```

Buka `http://localhost:8899` di peramban. Hentikan dengan `Ctrl+C`.

## A3. Menerbitkan ke internet (masih mode localStorage)

Karena aplikasinya cuma satu berkas statis, hosting-nya gampang dan gratis.

### Pilihan 1 — GitHub Pages

```bash
cd "/Users/dennyakbar/SIP Al-Bustomi"
git init
git add index.html
git commit -m "SIP Al Bustomi"
git branch -M main
git remote add origin https://github.com/NAMA-ANDA/sip-albustomi.git
git push -u origin main
```

Lalu di GitHub: **Settings → Pages → Source: main / (root) → Save**.
Beberapa menit kemudian alamatnya jadi
`https://NAMA-ANDA.github.io/sip-albustomi/`.

### Pilihan 2 — Netlify Drop (paling cepat, tanpa akun pun bisa)

Buka [app.netlify.com/drop](https://app.netlify.com/drop), seret folder proyek
ke jendela peramban. Langsung dapat alamat.

### Pilihan 3 — Hosting cPanel pesantren

Unggah `index.html` ke folder `public_html` lewat File Manager atau FTP.

> **Ingat:** di mode ini setiap pengguna punya datanya sendiri di peramban
> masing-masing. Data KTU tidak terlihat oleh Kepala Sekolah. Ini wajar untuk
> demo, tapi jelas bukan untuk pemakaian sungguhan.

---

# JALUR B — Menyambungkan ke Google Sheet

## 1. Membuat spreadsheet dan 17 sheet-nya

### 1.1 Buat spreadsheet baru

Buka [sheets.new](https://sheets.new), beri nama misalnya
**"Database SIP Al Bustomi"**.

### 1.2 Buat 17 tab beserta headernya

Membuat 17 tab satu per satu itu melelahkan dan rawan salah ketik — padahal
`Code.gs` akan menolak bekerja kalau ada satu saja nama kolom yang meleset.
Pakai skrip pembuat berikut supaya persis.

Di spreadsheet: **Ekstensi → Apps Script**. Hapus isi editor, tempel kode ini,
simpan, lalu jalankan fungsi `buatSemuaSheet` sekali saja:

```javascript
/**
 * Skrip sekali pakai untuk membuat 17 sheet SIP Al Bustomi.
 * Jalankan SEKALI, lalu berkas ini boleh dihapus.
 * Sheet yang sudah ada tidak akan disentuh.
 */
function buatSemuaSheet() {
  var struktur = {
    'Users':              ['id','nama','email','pin','role','subrole','aktif','token','token_expired'],
    'Siswa':              ['id','nis','nama','id_kelas','id_wali_murid','status_data','diinput_oleh','tgl_input'],
    'Guru':               ['id_user','jenis','id_mapel','id_kelas_wali'],
    'Mata_Pelajaran':     ['id','nama','kode'],
    'Kelas':              ['id','nama','tingkat'],
    'Tahun_Ajaran':       ['id','tahun','status_aktif'],
    'RPP':                ['id','id_guru','id_mapel','id_kelas','tgl','materi','metode','media','file_url'],
    'Absensi_Mengajar':   ['id','id_guru','tgl','jam_masuk','jam_keluar','status'],
    'Nilai':              ['id','id_siswa','id_mapel','id_guru','jenis','nilai','tgl'],
    'Pengumuman':         ['id','dari_id_user','dari_nama','tipe','id_penerima_siswa','konten','status','tgl','approved_by'],
    'Biaya':              ['id','nama_biaya','nominal_default','dibuat_oleh','status_aktif','tgl_dibuat'],
    'Tagihan_Siswa':      ['id','id_siswa','id_biaya','nominal','jatuh_tempo','status_bayar','tgl_bayar','bukti_url'],
    'Transaksi_Keuangan': ['id','tipe','jumlah','deskripsi','id_pengaju','status_approval','approved_by','tgl'],
    'Approval_Log':       ['id','tipe','id_item','status','oleh','catatan','timestamp'],
    'Jadwal_Pelajaran':   ['id','id_kelas','id_mapel','id_guru','hari','jam_mulai','jam_selesai','tahun_ajaran'],
    'Event':              ['id','nama_event','tgl_mulai','tgl_selesai','deskripsi','dibuat_oleh','status_approval'],
    'Log_Aktivitas':      ['id','id_user','nama_user','role','aksi','deskripsi','timestamp']
  };

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var dibuat = [];

  Object.keys(struktur).forEach(function (nama) {
    if (ss.getSheetByName(nama)) return;           // jangan timpa yang sudah ada
    var sh = ss.insertSheet(nama);
    var header = struktur[nama];
    sh.getRange(1, 1, 1, header.length).setValues([header]);
    sh.getRange(1, 1, 1, header.length)
      .setFontWeight('bold')
      .setBackground('#2D6A4F')
      .setFontColor('#FFFFFF');
    sh.setFrozenRows(1);
    dibuat.push(nama);
  });

  // Buang sheet kosong bawaan bila masih ada
  var bawaan = ss.getSheetByName('Sheet1') || ss.getSheetByName('Sheet 1');
  if (bawaan && ss.getSheets().length > 1) ss.deleteSheet(bawaan);

  SpreadsheetApp.getUi().alert(
    dibuat.length ? 'Selesai. Sheet dibuat: ' + dibuat.join(', ')
                  : 'Semua sheet sudah ada, tidak ada yang dibuat.'
  );
}
```

Setelah jalan, periksa: harus ada **17 tab**, masing-masing dengan baris header
berlatar hijau tosca. Bandingkan dengan `STRUKTUR_DATABASE.md` untuk memastikan.

## 2. Memasang Code.gs

### 2.1 Tempel kodenya

Masih di **Ekstensi → Apps Script** pada spreadsheet yang sama:

1. Ganti isi berkas `Code.gs` di editor dengan seluruh isi `Code.gs` milik Anda
2. Simpan (`Ctrl+S` / `Cmd+S`)

> **Penting:** skrip harus dibuat lewat menu Ekstensi **dari dalam spreadsheet**,
> bukan lewat script.google.com. Sebab `Code.gs` memakai
> `SpreadsheetApp.getActiveSpreadsheet()`, yang hanya menemukan spreadsheet
> kalau skripnya menempel padanya.

### 2.2 Isi konfigurasi folder bukti bayar

Di baris 26 `Code.gs` ada:

```javascript
var ID_FOLDER_BUKTI_BAYAR = 'GANTI_DENGAN_ID_FOLDER_DRIVE';
```

Buat satu folder di Google Drive (misalnya "Bukti Bayar SIP"), buka folder itu,
lalu ambil ID-nya dari alamat peramban:

```
https://drive.google.com/drive/folders/1a2B3cD4eF5gH6iJ7kL8mN9oP
                                        └──────── ini ID-nya ────────┘
```

Ganti nilainya, lalu simpan.

### 2.3 Membuat akun pertama

Ini bagian yang sering bikin bingung: **PIN di sheet `Users` harus berupa hash
SHA-256, bukan angka biasa.** Fungsi `login()` membandingkan
`_hashPin(pin)` dengan isi kolom `pin`. Kalau Anda ketik PIN mentah langsung ke
sheet, login akan selalu gagal.

Tempel fungsi bantu ini ke editor Apps Script, jalankan sekali, lalu hapus:

```javascript
/**
 * Buat akun Kepala Sekolah pertama dengan PIN yang sudah di-hash.
 * Jalankan SEKALI, lalu hapus fungsi ini.
 */
function buatAkunPertama() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Users');

  sh.appendRow([
    1,                        // id
    'Kepala Sekolah',         // nama
    'kepsek@sip.sch.id',      // email
    _hashPin('GANTI_PIN_INI'),  // pin  ← WAJIB lewat _hashPin, jangan pakai angka berurutan
    'kepsek',                 // role
    '',                       // subrole
    true,                     // aktif
    '',                       // token
    ''                        // token_expired
  ]);

  Logger.log('Akun dibuat untuk kepsek@sip.sch.id. Catat PIN yang Anda pakai di atas.');
}
```

Ganti PIN-nya jadi sesuatu yang lain sebelum dipakai sungguhan. Akun berikutnya
(Bendahara, KTU, Guru, Wali Murid) tidak perlu dibuat manual — begitu Kepala
Sekolah bisa masuk, akun lain didaftarkan lewat Modul 6.3 Pendaftaran Akun.

> **Kalau lupa dan terlanjur mengetik PIN biasa:** jalankan fungsi di atas untuk
> menimpa, atau isi ulang kolom `pin` dengan hasil `_hashPin('pin-anda')`.

### 2.4 Menerbitkan sebagai Web App

1. Di editor Apps Script, klik **Deploy → New deployment**
2. Klik ikon roda gigi di sebelah "Select type" → pilih **Web app**
3. Isi:
   - **Description**: `SIP Al Bustomi v1`
   - **Execute as**: **Me** (akun Anda)
   - **Who has access**: **Anyone**
4. Klik **Deploy**
5. Google minta izin — klik **Authorize access**, pilih akun Anda
6. Muncul peringatan "Google hasn't verified this app". Klik **Advanced** →
   **Go to (nama proyek) (unsafe)** → **Allow**. Ini wajar untuk skrip pribadi.
7. Salin **Web app URL**, bentuknya:

```
https://script.google.com/macros/s/AKfycb....../exec
```

> **"Who has access: Anyone" itu aman?** Yang terbuka hanyalah pintunya. Setiap
> aksi kecuali `login` diperiksa tokennya oleh `doPost`, dan token hanya terbit
> setelah email + PIN benar. Tanpa token, semua permintaan ditolak.

### 2.5 Menguji backend

Sebelum menyentuh `index.html`, pastikan backend-nya hidup. Di Terminal:

```bash
curl -L -X POST "TEMPEL_URL_EXEC_ANDA_DI_SINI" -H "Content-Type: application/json" -d '{"action":"login","email":"kepsek@sip.sch.id","pin":"PIN_ANDA"}'
```

Hasil yang benar:

```json
{"status":"success","data":{"token":"a1b2c3...","nama":"Kepala Sekolah","role":"kepsek","subrole":""},"message":"Login berhasil"}
```

Kalau yang keluar halaman HTML atau "Halaman Tidak Ditemukan", berarti
deployment-nya belum benar — lihat bagian Masalah Umum di bawah.

## 3. Setiap kali Code.gs diubah — WAJIB deploy ulang

Ini penyebab kebingungan nomor satu. Menyimpan kode **tidak** memperbarui
Web App yang sudah terbit.

**Deploy → Manage deployments → ikon pensil → Version: New version → Deploy**

URL `/exec` tetap sama. Kalau Anda pilih "New deployment" (bukan new version),
URL-nya berganti dan `index.html` harus ikut diperbarui.

---

## 4. Menyambungkan index.html ke backend

### 4.1 Ganti API_URL

Di `index.html`, cari baris:

```javascript
const API_URL = 'https://script.google.com/macros/s/AKfycbwC4FHUVw89g9_T0Ex.../exec';
```

Ganti dengan URL `/exec` hasil deployment Anda.

### 4.2 Isi fungsi callAPI

Ganti fungsi kosong itu dengan:

```javascript
async function callAPI(action, data = {}) {
  const sesi = getSession();

  const muatan = Object.assign({ action: action }, data);
  if (sesi && sesi.token) muatan.token = sesi.token;

  try {
    const respons = await fetch(API_URL, {
      method: 'POST',
      // text/plain dipakai dengan sengaja: application/json memicu preflight
      // OPTIONS yang tidak dilayani Apps Script sehingga kena blokir CORS.
      // doPost tetap membaca isinya dengan JSON.parse, jadi tidak masalah.
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(muatan),
      redirect: 'follow'
    });

    const hasil = await respons.json();

    // Token kedaluwarsa setelah 24 jam, pengguna diminta masuk lagi
    if (hasil.status === 'error' && /token/i.test(hasil.message || '')) {
      showNotif('Sesi berakhir, silakan masuk kembali', 'error');
      logout();
      return null;
    }

    return hasil;

  } catch (e) {
    showNotif('Gagal menghubungi server. Periksa koneksi internet.', 'error');
    return null;
  }
}
```

**Dua detail yang menentukan berhasil-tidaknya:**

1. **`Content-Type: text/plain`** — bukan kelalaian. Dengan `application/json`,
   peramban mengirim permintaan pendahuluan `OPTIONS` lebih dulu; Apps Script
   tidak melayani `OPTIONS`, jadi permintaannya diblokir CORS. Dengan
   `text/plain`, peramban langsung mengirim `POST`. `doPost` tetap membacanya
   dengan `JSON.parse(e.postData.contents)`, jadi isinya sama saja.

2. **`redirect: 'follow'`** — Apps Script selalu mengalihkan `/exec` ke
   `googleusercontent.com`. Tanpa ini, jawabannya tidak pernah sampai.

### 4.3 Simpan token saat login

`Code.gs` mengembalikan token saat login, dan `doPost` menolak semua aksi lain
tanpa token. Jadi `doLogin()` perlu menyimpannya ke session:

```javascript
async function doLogin() {
  const email = document.getElementById('login-email').value.trim();
  const pin = document.getElementById('login-pin').value.trim();

  if (!email || !pin) {
    alert('Email dan PIN harus diisi');
    return;
  }

  const hasil = await callAPI('login', { email: email, pin: pin });
  if (!hasil) return;

  if (hasil.status !== 'success') {
    alert(hasil.message || 'Email atau PIN salah');
    return;
  }

  sessionStorage.setItem('sip_session', JSON.stringify({
    id: hasil.data.id,
    nama: hasil.data.nama,
    role: hasil.data.role,
    subrole: hasil.data.subrole || null,
    token: hasil.data.token        // ← dipakai callAPI() untuk aksi berikutnya
  }));

  showPage('dashboard-page');
  renderDashboard();
}
```

> Perhatikan: `login()` di `Code.gs` saat ini mengembalikan `token`, `nama`,
> `role`, dan `subrole` — **tanpa `id`**. Padahal seluruh modul frontend memakai
> `sesi.id` untuk menyaring data (misalnya `_anakSaya()` di Modul 7.1).
> Tambahkan `id: user.id` ke objek yang dikembalikan `login()` di `Code.gs`,
> lalu deploy ulang.

---

## 5. Sisa pekerjaan yang harus jujur disebut

Mengisi `callAPI()` **belum** membuat aplikasi memakai Google Sheet. Ketiga puluh
modul masih membaca dan menulis ke `localStorage` lewat `_bacaArr()` dan
`localStorage.setItem()`. Ada tiga pekerjaan tersisa:

### 5.1 Kolom sheet lebih sempit daripada data aplikasi

Beberapa data yang dipakai aplikasi tidak punya tempat di sheet:

| Data | Di aplikasi | Di sheet | Selisih |
|---|---|---|---|
| Siswa | 29 field (tempat lahir, nama ayah, penghasilan, dll.) | 8 kolom | **21 kolom kurang** |
| Users | ada `no_hp`, `alamat` (dipakai Modul 6.9 & 7.5) | tidak ada | 2 kolom kurang |
| Pengumuman | ada `judul`, `target`, `dari_role`, `id_penerima_list` | tidak ada | 4 kolom kurang |
| Transaksi | ada `id_siswa`, `id_biaya`, `bukti`, `keterangan` | tidak ada | 4 kolom kurang |

Dua penyimpanan malah **belum punya sheet sama sekali**:

- `sip_arsip` → Modul 6.8 Arsip Digital
- `sip_permohonan_wali` → Modul 6.9 & 7.5 permohonan perubahan data

Jadi sebelum migrasi: tambahkan kolom yang kurang dan buat 2 sheet baru,
lalu perbarui `STRUKTUR_DATABASE.md` supaya tetap jadi acuan yang benar.

### 5.2 Backend belum punya aksi untuk semua modul

`Code.gs` menyediakan 25 aksi. Modul-modul berikut sudah jadi di frontend tapi
belum punya pasangan aksi di backend:

| Modul | Aksi yang perlu dibuat |
|---|---|
| 6.6 Jadwal Pelajaran | simpan, ubah, hapus, ambil jadwal per kelas |
| 6.7 Event | simpan event, ambil daftar, batalkan |
| 6.8 Arsip | unggah dokumen, ambil daftar, hapus |
| 6.9 Approve Data Wali Murid | ambil permohonan, setujui, tolak |
| 7.5 Profil | ajukan perubahan data, ganti PIN |
| Approval Tagihan (KTU) | setujui/tolak pembayaran — untuk pengumuman tagihan sudah ada `approvePengumumanTagihanKTU` |
| Approve Keuangan (Kepsek) | sebagian tertutup `approveTransaksi`, perlu dicek kesesuaian statusnya |

Semuanya perlu ditambahkan ke `Code.gs` beserta `case`-nya di `doPost`.

### 5.3 Mengganti localStorage dengan panggilan API

Setiap modul perlu diubah dari

```javascript
const daftar = _bacaArr('sip_siswa');          // sinkron, langsung jadi
```

menjadi

```javascript
const hasil = await callAPI('getSiswaPending'); // asinkron, perlu await
const daftar = hasil && hasil.data ? hasil.data : [];
```

Konsekuensinya: fungsi modul jadi `async`, dan `loadModule()` harus ikut
menunggu hasilnya. Ini pekerjaan paling besar dari ketiganya.

**Saran urutan pengerjaan:** mulai dari login, lalu satu modul yang paling
sederhana (misalnya 4.2 Approve Akun) sampai betul-betul jalan ujung ke ujung.
Setelah polanya mapan, modul berikutnya tinggal mengikuti.

---

## 6. Masalah umum dan penyelesaiannya

| Gejala | Sebab | Penyelesaian |
|---|---|---|
| POST membalas HTML "Halaman Tidak Ditemukan" | URL memakai `/dev`, bukan `/exec`; atau akses belum "Anyone" | Deploy ulang dengan **Who has access: Anyone**, salin URL `/exec` |
| `Sheet "Users" tidak ditemukan` | Skrip tidak menempel pada spreadsheet, atau nama tab salah ketik | Buat skrip lewat **Ekstensi → Apps Script dari dalam spreadsheet**; periksa ejaan tab (`Mata_Pelajaran`, bukan `Mata Pelajaran`) |
| `Kolom "xxx" tidak ada di sheet` | Header baris 1 tidak persis sama | Samakan dengan `STRUKTUR_DATABASE.md`, huruf kecil semua, pakai garis bawah |
| Login selalu "Email atau PIN salah" padahal benar | PIN di sheet ditulis apa adanya, belum di-hash | Isi ulang kolom `pin` dengan `_hashPin('pin-anda')` |
| "Akun belum diaktifkan oleh Kepala Sekolah" | Kolom `aktif` kosong atau `FALSE` | Isi `TRUE` |
| Error CORS di Console peramban | `Content-Type` memakai `application/json` | Pakai `text/plain;charset=utf-8` seperti pada 4.2 |
| Jawaban tidak pernah sampai, `fetch` menggantung | Pengalihan Apps Script tidak diikuti | Tambahkan `redirect: 'follow'` |
| Perubahan `Code.gs` tidak terasa | Belum deploy ulang | **Manage deployments → pensil → New version → Deploy** |
| Semua aksi ditolak "Token tidak valid" | Token tidak tersimpan atau sudah lewat 24 jam | Pastikan `doLogin()` menyimpan `token` ke session (lihat 4.3); masuk ulang |
| Data hilang saat ganti peramban | Masih mode localStorage | Wajar — selesaikan Bagian 5 untuk memusatkan data |

---

## 7. Sebelum dipakai sungguhan

- [ ] Ganti semua PIN bawaan dengan PIN masing-masing pengguna (jangan angka berurutan)
- [ ] Hapus lima akun contoh kalau tidak dipakai
- [ ] Isi `ID_FOLDER_BUKTI_BAYAR` dengan folder Drive milik pesantren
- [ ] Batasi akses spreadsheet — hanya pengelola yang boleh membukanya langsung
- [ ] Nyalakan riwayat versi spreadsheet sebagai cadangan
- [ ] Uji seluruh 30 modul dengan data sungguhan
- [ ] Coba di ponsel — aplikasi ini sudah diuji dari lebar 320px sampai 1440px
- [ ] Siapkan rencana cadangan: unduh salinan spreadsheet secara berkala

---

## Lampiran — 25 aksi yang tersedia di Code.gs

Semua dipanggil dengan `POST` ke URL `/exec`, badan permintaan berupa JSON
berisi `action`, `token` (kecuali `login`), dan parameternya.

| Action | Parameter | Keterangan |
|---|---|---|
| `login` | `email`, `pin` | Satu-satunya aksi tanpa token |
| `verifyToken` | `token` | Periksa token masih berlaku |
| `getDashboardKepsek` | — | Ringkasan angka untuk Kepala Sekolah |
| `approveAkun` | `userId` | Aktifkan akun |
| `approvePengumuman` | `pengumumanId`, `status` | Setujui/tolak pengumuman |
| `approveTransaksi` | `transaksiId`, `status` | Setujui/tolak transaksi |
| `approveSiswa` | `siswaId`, `status` | Verifikasi data siswa |
| `crudBiaya` | `aksiBiaya`, `data` | Tambah/ubah/nonaktifkan biaya |
| `getUsers` | — | Daftar seluruh pengguna |
| `resetPin` | `userId` | Buat PIN baru |
| `createAccount` | `nama`, `email`, `pin`, `role`, `subrole` | Daftarkan akun |
| `inputSiswa` | `data` | Simpan data siswa |
| `getSiswaPending` | — | Siswa menunggu verifikasi |
| `createPengumuman` | `data` | Buat pengumuman |
| `approvePengumumanTagihanKTU` | `pengumumanId` | Persetujuan KTU |
| `getTagihanMenunggak` | — | Daftar tunggakan |
| `catatPembayaran` | `tagihanId`, `buktiUrl` | Catat pembayaran |
| `catatTransaksi` | `data` | Catat kas masuk/keluar |
| `usulanBiaya` | `idBiaya`, `nominalBaru` | Usulkan perubahan biaya |
| `absenGuru` | `idGuru`, `jenis` | Absen masuk/keluar |
| `simpanRPP` | `data` | Simpan RPP |
| `inputNilai` | `data` | Simpan nilai siswa |
| `getDataAnak` | `idWaliMurid` | Data anak wali murid |
| `getTagihanWaliMurid` | `idWaliMurid` | Tagihan anak |
| `uploadBuktiBayar` | `tagihanId`, `fileBase64` | Unggah bukti ke Drive |

Bentuk jawaban selalu sama:

```json
{ "status": "success" | "error", "data": ..., "message": "..." }
```

Aturan bawaan yang perlu diketahui:

- Token berlaku **24 jam** (`MASA_TOKEN_JAM`)
- Pengeluaran di atas **Rp 1.000.000** wajib disetujui Kepala Sekolah
  (`BATAS_PENGELUARAN`)
- Setiap aksi tercatat di sheet `Log_Aktivitas`
- Setiap persetujuan tercatat di sheet `Approval_Log`
