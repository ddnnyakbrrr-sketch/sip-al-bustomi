/**
 * ============================================================================
 *  SIP AL BUSTOMI — BACKEND GOOGLE APPS SCRIPT
 * ----------------------------------------------------------------------------
 *  Script ini membaca & menulis ke Google Sheet yang SUDAH ADA
 *  (lihat STRUKTUR_DATABASE.md — 17 sheet).
 *  Script TIDAK PERNAH membuat sheet baru. Jika sheet tidak ditemukan,
 *  script mengembalikan error.
 *
 *  Format respons seluruh fungsi:
 *      { status: "success" | "error", data: ..., message: "..." }
 * ============================================================================
 */


/* ============================ KONFIGURASI ================================= */

// Masa berlaku token setelah login (jam)
var MASA_TOKEN_JAM = 24;

// Batas nominal pengeluaran. Di atas nilai ini, transaksi wajib approval Kepsek.
var BATAS_PENGELUARAN = 1000000;

// ID folder Google Drive untuk menyimpan file bukti pembayaran dari wali murid.
// WAJIB diganti dengan ID folder milik pesantren sebelum dipakai.
var ID_FOLDER_BUKTI_BAYAR = '1OVYot5Zjx9HXOibgQ5_LH-cRi96wmfzB';


/* ====================== HELPER INTERNAL (bukan fitur) =====================
 * Fungsi berawalan "_" adalah alat bantu internal. Tidak di-route di doPost.
 * Dibuat karena aturan wajib: hash PIN, cek token, dan log di setiap aksi.
 * ========================================================================== */

/** Ambil objek spreadsheet aktif. */
function _ss() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

/**
 * Baca satu sheet menjadi objek tabel { sheet, header, baris }.
 * Melempar error kalau sheet-nya tidak ada (script tidak boleh membuat sheet).
 */
function _tabel(namaSheet) {
  var sh = _ss().getSheetByName(namaSheet);
  if (!sh) throw new Error('Sheet "' + namaSheet + '" tidak ditemukan pada spreadsheet.');
  var nilai = sh.getDataRange().getValues();
  return {
    sheet: sh,
    header: nilai.length ? nilai[0] : [],
    baris: nilai.length > 1 ? nilai.slice(1) : []
  };
}

/** Cari indeks kolom berdasarkan nama header. */
function _kol(t, namaKolom) {
  var i = t.header.indexOf(namaKolom);
  if (i === -1) throw new Error('Kolom "' + namaKolom + '" tidak ada di sheet "' + t.sheet.getName() + '".');
  return i;
}

/** Ambil nilai sel pada baris data ke-n (0 = baris data pertama). */
function _nilai(t, n, namaKolom) {
  return t.baris[n][_kol(t, namaKolom)];
}

/** Tulis satu sel pada baris data ke-n. +2 karena baris 1 adalah header. */
function _tulis(t, n, namaKolom, isi) {
  t.sheet.getRange(n + 2, _kol(t, namaKolom) + 1).setValue(isi);
  t.baris[n][_kol(t, namaKolom)] = isi;
}

/** Tambah satu baris baru mengikuti urutan header sheet. */
function _tambah(t, obj) {
  var baris = t.header.map(function (h) {
    return Object.prototype.hasOwnProperty.call(obj, h) ? obj[h] : '';
  });
  t.sheet.appendRow(baris);
  return baris;
}

/** Buat ID baru = ID numerik terbesar + 1. */
function _idBaru(t, kolomId) {
  var i = _kol(t, kolomId || 'id');
  var maks = 0;
  t.baris.forEach(function (r) {
    var n = parseInt(r[i], 10);
    if (!isNaN(n) && n > maks) maks = n;
  });
  return maks + 1;
}

/** Cari indeks baris data yang kolomnya bernilai tertentu. -1 kalau tidak ketemu. */
function _cari(t, namaKolom, nilai) {
  var i = _kol(t, namaKolom);
  for (var n = 0; n < t.baris.length; n++) {
    if (String(t.baris[n][i]) === String(nilai)) return n;
  }
  return -1;
}

/** Hash PIN dengan SHA-256, hasil berupa string heksadesimal. */
function _hashPin(pin) {
  var byteArr = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(pin),
    Utilities.Charset.UTF_8
  );
  return byteArr.map(function (b) {
    return ('0' + (b & 0xFF).toString(16)).slice(-2);
  }).join('');
}

/** Bentuk respons standar aplikasi. */
function _respon(status, data, message) {
  return { status: status, data: (data === undefined ? null : data), message: message || '' };
}

/** Konversi nilai sel menjadi boolean (sheet bisa berisi TRUE/"true"/"ya"/1). */
function _bool(v) {
  if (v === true) return true;
  var s = String(v).trim().toLowerCase();
  return s === 'true' || s === 'ya' || s === '1';
}

/** Bandingkan dua tanggal, hanya bagian tanggalnya (abaikan jam). */
function _tanggalSama(a, b) {
  var d1 = new Date(a), d2 = new Date(b);
  if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return false;
  return d1.getFullYear() === d2.getFullYear()
      && d1.getMonth() === d2.getMonth()
      && d1.getDate() === d2.getDate();
}

/** Format jam HH:mm:ss sesuai zona waktu spreadsheet. */
function _jamSekarang() {
  return Utilities.formatDate(new Date(), _ss().getSpreadsheetTimeZone(), 'HH:mm:ss');
}

/**
 * Ubah isi sel jam menjadi teks "HH:mm".
 *
 * Google Sheet menyimpan "07:00" sebagai NILAI WAKTU, yaitu pecahan hari
 * sejak 30 Desember 1899. Apps Script membacanya kembali sebagai objek Date,
 * sehingga tanpa penormalan ini:
 *   - jamnya tampil sebagai "1899-12-29T23:42:40.000Z" di layar,
 *   - pengurutan berdasarkan jam_mulai jadi ngawur,
 *   - pengecekan jadwal bentrok membandingkan "07:00" dengan
 *     "Sat Dec 30 1899 ..." sehingga tidak pernah benar.
 *
 * Teks yang sudah berbentuk jam dibiarkan, hanya dirapikan jadi dua digit.
 */
function _jam(v) {
  if (v === null || v === undefined || v === '') return '';

  if (Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime())) {
    return Utilities.formatDate(v, _ss().getSpreadsheetTimeZone(), 'HH:mm');
  }

  var s = String(v).trim();
  var m = s.match(/^(\d{1,2}):(\d{2})/);
  if (m) return ('0' + m[1]).slice(-2) + ':' + m[2];
  return s;
}

/** Rapikan kolom jam pada sekumpulan objek jadwal. */
function _rapikanJam(daftar) {
  return daftar.map(function (j) {
    j.jam_mulai = _jam(j.jam_mulai);
    j.jam_selesai = _jam(j.jam_selesai);
    return j;
  });
}

/**
 * Catat aktivitas ke sheet Log_Aktivitas.
 * Dibungkus try/catch supaya kegagalan mencatat log tidak membatalkan aksi utama.
 */
function _log(user, aksi, deskripsi) {
  try {
    var t = _tabel('Log_Aktivitas');
    _tambah(t, {
      id: _idBaru(t),
      id_user: user ? user.id : '',
      nama_user: user ? user.nama : '-',
      role: user ? user.role : '-',
      aksi: aksi,
      deskripsi: deskripsi,
      timestamp: new Date()
    });
  } catch (err) {
    // Sengaja dibiarkan: log gagal tidak boleh menggagalkan transaksi utama.
  }
}

/** Catat jejak persetujuan ke sheet Approval_Log. */
function _logApproval(tipe, idItem, status, oleh, catatan) {
  var t = _tabel('Approval_Log');
  _tambah(t, {
    id: _idBaru(t),
    tipe: tipe,
    id_item: idItem,
    status: status,
    oleh: oleh,
    catatan: catatan || '',
    timestamp: new Date()
  });
}

/**
 * Verifikasi token + batasi role.
 * Mengembalikan { ok:true, user } atau { ok:false, respon }.
 */
function _wajibRole(token, daftarRole) {
  var user = verifyToken(token);
  if (!user) {
    return { ok: false, respon: _respon('error', null, 'Token tidak valid atau sudah kedaluwarsa') };
  }
  if (daftarRole && daftarRole.length) {
    var role = String(user.role).trim().toLowerCase();
    if (daftarRole.indexOf(role) === -1) {
      _log(user, 'AKSES_DITOLAK', 'Role "' + user.role + '" mencoba aksi khusus role: ' + daftarRole.join('/'));
      return { ok: false, respon: _respon('error', null, 'Akses ditolak. Aksi ini hanya untuk role: ' + daftarRole.join('/')) };
    }
  }
  return { ok: true, user: user };
}

/**
 * Ubah seluruh baris sebuah tabel menjadi larik objek berkunci nama header.
 * Dipakai semua fungsi get* supaya pemetaannya tidak ditulis berulang.
 */
function _semuaObjek(t) {
  return t.baris.map(function (r) {
    var o = {};
    t.header.forEach(function (h, i) { o[h] = r[i]; });
    return o;
  });
}

/**
 * Cocokkan objek dengan penyaring sederhana { kolom: nilai }.
 * Kunci yang nilainya kosong diabaikan, jadi penyaring boleh dikirim sebagian.
 */
function _cocok(obj, filter) {
  if (!filter) return true;
  for (var k in filter) {
    if (!Object.prototype.hasOwnProperty.call(filter, k)) continue;
    var f = filter[k];
    if (f === '' || f === null || f === undefined) continue;
    if (String(obj[k]) !== String(f)) return false;
  }
  return true;
}

/** Periksa apakah sebuah tanggal berada dalam rentang. Batas kosong = bebas. */
function _dalamRentang(nilaiTgl, mulai, akhir) {
  if (!mulai && !akhir) return true;
  var t = new Date(nilaiTgl);
  if (isNaN(t.getTime())) return false;
  if (mulai) {
    var a = new Date(String(mulai) + 'T00:00:00');
    if (!isNaN(a.getTime()) && t < a) return false;
  }
  if (akhir) {
    var b = new Date(String(akhir) + 'T23:59:59');
    if (!isNaN(b.getTime()) && t > b) return false;
  }
  return true;
}

/**
 * Baca satu nilai dari sheet Konfigurasi. Bila sheet atau kuncinya belum ada,
 * nilai bawaan yang dipakai, sehingga aplikasi tetap jalan tanpa konfigurasi.
 */
function _konfigurasi(kunci, bawaan) {
  try {
    var t = _tabel('Konfigurasi');
    var n = _cari(t, 'kunci', kunci);
    if (n === -1) return bawaan;
    var v = _nilai(t, n, 'nilai');
    return (v === '' || v === null || v === undefined) ? bawaan : v;
  } catch (err) {
    return bawaan;
  }
}

/** Batas pengeluaran yang sedang berlaku, dibaca dari sheet Konfigurasi. */
function _batasPengeluaran() {
  var n = Number(_konfigurasi('threshold_keuangan', BATAS_PENGELUARAN));
  return (!isNaN(n) && n > 0) ? n : BATAS_PENGELUARAN;
}


/* ============================ A. doPost =================================== */

/**
 * Pintu masuk tunggal seluruh permintaan dari frontend.
 * Menerima parameter: action, token, dan data lainnya.
 * Semua action selain "login" wajib menyertakan token yang masih berlaku.
 */
function doPost(e) {
  var hasil;
  try {
    // Terima body JSON maupun form-encoded
    var p = {};
    if (e && e.postData && e.postData.contents) {
      try { p = JSON.parse(e.postData.contents); } catch (err) { p = e.parameter || {}; }
    } else if (e && e.parameter) {
      p = e.parameter;
    }

    var action = p.action;
    var token = p.token;
    var data = p.data || p;

    if (!action) {
      hasil = _respon('error', null, 'Parameter "action" wajib diisi');
    } else if (action !== 'login' && !verifyToken(token)) {
      // Aturan: setiap aksi wajib memeriksa token, kecuali login.
      hasil = _respon('error', null, 'Token tidak valid atau sudah kedaluwarsa');
    } else {
      switch (action) {

        case 'login':
          hasil = login(p.email, p.pin);
          break;

        case 'verifyToken':
          var u = verifyToken(token);
          hasil = u ? _respon('success', u, 'Token valid')
                    : _respon('error', null, 'Token tidak valid');
          break;

        case 'getDashboardKepsek':
          hasil = getDashboardKepsek();
          // Fungsi ini tanpa parameter token, jadi log dicatat dari sini
          _log(verifyToken(token), 'LIHAT_DASHBOARD', 'Membuka dashboard Kepala Sekolah');
          break;

        case 'approveAkun':
          hasil = approveAkun(p.userId, token);
          break;

        case 'approvePengumuman':
          hasil = approvePengumuman(p.pengumumanId, p.status, token);
          break;

        case 'approveTransaksi':
          hasil = approveTransaksi(p.transaksiId, p.status, token);
          break;

        case 'approveSiswa':
          hasil = approveSiswa(p.siswaId, p.status, token);
          break;

        case 'crudBiaya':
          hasil = crudBiaya(p.aksiBiaya, data, token);
          break;

        case 'getUsers':
          hasil = getUsers(token);
          break;

        case 'resetPin':
          hasil = resetPin(p.userId, token);
          break;

        case 'createAccount':
          hasil = createAccount(p.nama, p.email, p.pin, p.role, p.subrole, token);
          break;

        case 'inputSiswa':
          hasil = inputSiswa(data, token);
          break;

        case 'getSiswaPending':
          hasil = getSiswaPending(token);
          break;

        case 'createPengumuman':
          hasil = createPengumuman(data, token);
          break;

        case 'approvePengumumanTagihanKTU':
          hasil = approvePengumumanTagihanKTU(p.pengumumanId, token);
          break;

        case 'getTagihanMenunggak':
          hasil = getTagihanMenunggak();
          // Fungsi ini tanpa parameter token, jadi log dicatat dari sini
          _log(verifyToken(token), 'LIHAT_TAGIHAN_MENUNGGAK', 'Melihat daftar tagihan menunggak');
          break;

        case 'catatPembayaran':
          hasil = catatPembayaran(p.tagihanId, p.buktiUrl, token);
          break;

        case 'catatTransaksi':
          hasil = catatTransaksi(data, token);
          break;

        case 'usulanBiaya':
          hasil = usulanBiaya(p.idBiaya, p.nominalBaru, token);
          break;

        case 'absenGuru':
          hasil = absenGuru(p.idGuru, p.jenis, token);
          break;

        case 'simpanRPP':
          hasil = simpanRPP(data, token);
          break;

        case 'inputNilai':
          hasil = inputNilai(data, token);
          break;

        case 'getDataAnak':
          hasil = getDataAnak(p.idWaliMurid, token);
          break;

        case 'getTagihanWaliMurid':
          hasil = getTagihanWaliMurid(p.idWaliMurid, token);
          break;

        case 'uploadBuktiBayar':
          hasil = uploadBuktiBayar(p.tagihanId, p.fileBase64, token);
          break;

        /* ---------------- PRIORITAS 1 — 13 aksi tambahan ---------------- */

        case 'tolakAkun':
          hasil = tolakAkun(p.userId, token);
          break;

        case 'getKelas':
          hasil = getKelas(token);
          break;

        case 'getMapel':
          hasil = getMapel(token);
          break;

        case 'crudKelas':
          hasil = crudKelas(p.aksiKelas, data, token);
          break;

        case 'crudMapel':
          hasil = crudMapel(p.aksiMapel, data, token);
          break;

        case 'getBiaya':
          hasil = getBiaya(token);
          break;

        case 'getSiswa':
          hasil = getSiswa(p.filter, token);
          break;

        case 'getPengumuman':
          hasil = getPengumuman(p.filter, token);
          break;

        case 'getTransaksi':
          hasil = getTransaksi(p.filter, token);
          break;

        case 'getTagihan':
          hasil = getTagihan(p.filter, token);
          break;

        case 'updateSiswa':
          hasil = updateSiswa(p.idSiswa, data, token);
          break;

        case 'updateUser':
          hasil = updateUser(p.userId, data, token);
          break;

        case 'getLog':
          hasil = getLog(p.batas, token);
          break;

        /* ---------------- PRIORITAS 2 — 18 aksi tambahan ---------------- */

        case 'getJadwal':
          hasil = getJadwal(p.filter, token);
          break;

        case 'simpanJadwal':
          hasil = simpanJadwal(data, token);
          break;

        case 'hapusJadwal':
          hasil = hapusJadwal(p.idJadwal, token);
          break;

        case 'getTahunAjaran':
          hasil = getTahunAjaran(token);
          break;

        case 'setTahunAjaranAktif':
          hasil = setTahunAjaranAktif(p.idTahun, token);
          break;

        case 'getEvent':
          hasil = getEvent(p.filter, token);
          break;

        case 'simpanEvent':
          hasil = simpanEvent(data, token);
          break;

        case 'batalEvent':
          hasil = batalEvent(p.idEvent, token);
          break;

        case 'approveEvent':
          hasil = approveEvent(p.idEvent, p.status, token);
          break;

        case 'getArsip':
          hasil = getArsip(p.filter, token);
          break;

        case 'simpanArsip':
          hasil = simpanArsip(data, token);
          break;

        case 'hapusArsip':
          hasil = hapusArsip(p.idArsip, token);
          break;

        case 'getPermohonanWali':
          hasil = getPermohonanWali(p.filter, token);
          break;

        case 'ajukanPerubahanWali':
          hasil = ajukanPerubahanWali(data, token);
          break;

        case 'prosesPermohonanWali':
          hasil = prosesPermohonanWali(p.idPermohonan, p.status, token);
          break;

        case 'gantiPin':
          hasil = gantiPin(p.pinLama, p.pinBaru, token);
          break;

        case 'approvePembayaranKTU':
          hasil = approvePembayaranKTU(p.transaksiId, p.status, token);
          break;

        case 'getKonfigurasi':
          hasil = getKonfigurasi(token);
          break;

        case 'simpanKonfigurasi':
          hasil = simpanKonfigurasi(p.kunci, p.nilai, token);
          break;

        /* ---------------- PRIORITAS 3 — 11 aksi tambahan ---------------- */

        case 'getAbsensiGuru':
          hasil = getAbsensiGuru(p.filter, token);
          break;

        case 'getRPP':
          hasil = getRPP(p.filter, token);
          break;

        case 'getNilai':
          hasil = getNilai(p.filter, token);
          break;

        case 'inputNilaiBanyak':
          hasil = inputNilaiBanyak(data, token);
          break;

        case 'getJadwalHariIni':
          hasil = getJadwalHariIni(token);
          break;

        case 'getAbsensiSiswa':
          hasil = getAbsensiSiswa(p.filter, token);
          break;

        case 'getUsulanBiaya':
          hasil = getUsulanBiaya(p.filter, token);
          break;

        case 'approveUsulanBiaya':
          hasil = approveUsulanBiaya(p.idUsulan, p.status, p.nominalBaru, token);
          break;

        case 'batalPengumuman':
          hasil = batalPengumuman(p.idPengumuman, token);
          break;

        case 'batalTransaksi':
          hasil = batalTransaksi(p.idTransaksi, token);
          break;

        case 'getLaporanKinerja':
          hasil = getLaporanKinerja(p.filter, token);
          break;

        case 'getDataMaster':
          hasil = getDataMaster(token);
          break;

        case 'getBekalDataAnak':
          hasil = getBekalDataAnak(token);
          break;

        case 'getBekalInputNilai':
          hasil = getBekalInputNilai(token);
          break;

        default:
          hasil = _respon('error', null, 'Action "' + action + '" tidak dikenali');
      }
    }
  } catch (err) {
    hasil = _respon('error', null, 'Terjadi kesalahan server: ' + err.message);
  }

  return ContentService
    .createTextOutput(JSON.stringify(hasil))
    .setMimeType(ContentService.MimeType.JSON);
}


/* ============================ B. login ==================================== */

/**
 * Login dengan email + PIN.
 * PIN dibandingkan dalam bentuk hash SHA-256.
 * Bila cocok, token baru dibuat dan berlaku 24 jam.
 */
function login(email, pin) {
  if (!email || !pin) {
    _log(null, 'LOGIN_GAGAL', 'Email atau PIN kosong');
    return _respon('error', null, 'Email atau PIN salah');
  }

  var t = _tabel('Users');
  var n = _cari(t, 'email', String(email).trim());

  if (n === -1) {
    _log(null, 'LOGIN_GAGAL', 'Email tidak terdaftar: ' + email);
    return _respon('error', null, 'Email atau PIN salah');
  }

  if (String(_nilai(t, n, 'pin')) !== _hashPin(pin)) {
    _log(null, 'LOGIN_GAGAL', 'PIN salah untuk email: ' + email);
    return _respon('error', null, 'Email atau PIN salah');
  }

  if (!_bool(_nilai(t, n, 'aktif'))) {
    _log(null, 'LOGIN_GAGAL', 'Akun belum aktif: ' + email);
    return _respon('error', null, 'Akun belum diaktifkan oleh Kepala Sekolah');
  }

  // Token = UUID + timestamp, berlaku 24 jam ke depan
  var token = Utilities.getUuid() + '-' + new Date().getTime();
  var kadaluarsa = new Date(new Date().getTime() + MASA_TOKEN_JAM * 60 * 60 * 1000);
  _tulis(t, n, 'token', token);
  _tulis(t, n, 'token_expired', kadaluarsa);

  var user = {
    id: _nilai(t, n, 'id'),
    nama: _nilai(t, n, 'nama'),
    role: _nilai(t, n, 'role'),
    subrole: _nilai(t, n, 'subrole')
  };

  _log(user, 'LOGIN', 'Login berhasil');

  return _respon('success', {
    token: token,
    id: user.id,
    nama: user.nama,
    role: user.role,
    subrole: user.subrole || ''
  }, 'Login berhasil');
}


/* ========================= C. verifyToken ================================= */

/**
 * Cek token di sheet Users dan pastikan belum kedaluwarsa.
 * Mengembalikan objek user (tanpa PIN) bila valid, atau null bila tidak.
 * Catatan: fungsi ini sengaja mengembalikan objek/null (bukan format respons),
 * karena dipakai sebagai penjaga di seluruh fungsi lain.
 */
function verifyToken(token) {
  if (!token) return null;

  var t = _tabel('Users');
  var n = _cari(t, 'token', token);
  if (n === -1) return null;

  var kadaluarsa = _nilai(t, n, 'token_expired');
  if (!kadaluarsa) return null;
  if (new Date(kadaluarsa).getTime() <= new Date().getTime()) return null;

  return {
    id: _nilai(t, n, 'id'),
    nama: _nilai(t, n, 'nama'),
    email: _nilai(t, n, 'email'),
    role: _nilai(t, n, 'role'),
    subrole: _nilai(t, n, 'subrole'),
    aktif: _bool(_nilai(t, n, 'aktif'))
  };
}


/* ====================== D. getDashboardKepsek ============================= */

/**
 * Ringkasan angka untuk dashboard Kepala Sekolah.
 * Token sudah diverifikasi lebih dulu oleh doPost.
 */
function getDashboardKepsek() {
  var hariIni = new Date();

  // Guru hadir hari ini (baris absensi bertanggal hari ini)
  var tAbsen = _tabel('Absensi_Mengajar');
  var kTgl = _kol(tAbsen, 'tgl');
  var guruHadir = 0;
  tAbsen.baris.forEach(function (r) {
    if (_tanggalSama(r[kTgl], hariIni)) guruHadir++;
  });

  // Akun pending = user dengan kolom aktif belum true
  var tUser = _tabel('Users');
  var kAktif = _kol(tUser, 'aktif');
  var akunPending = 0;
  tUser.baris.forEach(function (r) {
    if (!_bool(r[kAktif])) akunPending++;
  });

  // Pengumuman pending = status diawali "pending"
  var tPeng = _tabel('Pengumuman');
  var kStatus = _kol(tPeng, 'status');
  var pengumumanPending = 0;
  tPeng.baris.forEach(function (r) {
    if (String(r[kStatus]).toLowerCase().indexOf('pending') === 0) pengumumanPending++;
  });

  // Siswa pending = status_data bernilai "pending"
  var tSiswa = _tabel('Siswa');
  var kSd = _kol(tSiswa, 'status_data');
  var siswaPending = 0;
  tSiswa.baris.forEach(function (r) {
    if (String(r[kSd]).toLowerCase() === 'pending') siswaPending++;
  });

  return _respon('success', {
    guru_hadir_hari_ini: guruHadir,
    akun_pending: akunPending,
    pengumuman_pending: pengumumanPending,
    siswa_pending: siswaPending
  }, 'Data dashboard berhasil diambil');
}


/* =========================== E. approveAkun =============================== */

/** Kepala Sekolah mengaktifkan akun user (aktif = true). */
function approveAkun(userId, token) {
  var cek = _wajibRole(token, ['kepsek']);
  if (!cek.ok) return cek.respon;

  var t = _tabel('Users');
  var n = _cari(t, 'id', userId);
  if (n === -1) {
    _log(cek.user, 'APPROVE_AKUN_GAGAL', 'User id ' + userId + ' tidak ditemukan');
    return _respon('error', null, 'User tidak ditemukan');
  }

  _tulis(t, n, 'aktif', true);
  _logApproval('akun', userId, 'approved', cek.user.id, 'Akun diaktifkan oleh Kepala Sekolah');
  _log(cek.user, 'APPROVE_AKUN', 'Mengaktifkan akun: ' + _nilai(t, n, 'nama'));

  return _respon('success', { id: userId, aktif: true }, 'Akun berhasil diaktifkan');
}


/* ======================== F. approvePengumuman ============================ */

/** Kepala Sekolah menyetujui / menolak pengumuman. */
function approvePengumuman(pengumumanId, status, token) {
  var cek = _wajibRole(token, ['kepsek']);
  if (!cek.ok) return cek.respon;

  var statusBaru = String(status).toLowerCase();
  if (statusBaru !== 'approved' && statusBaru !== 'rejected') {
    return _respon('error', null, 'Status harus "approved" atau "rejected"');
  }

  var t = _tabel('Pengumuman');
  var n = _cari(t, 'id', pengumumanId);
  if (n === -1) {
    _log(cek.user, 'APPROVE_PENGUMUMAN_GAGAL', 'Pengumuman id ' + pengumumanId + ' tidak ditemukan');
    return _respon('error', null, 'Pengumuman tidak ditemukan');
  }

  _tulis(t, n, 'status', statusBaru);
  _tulis(t, n, 'approved_by', cek.user.id);
  _logApproval('pengumuman', pengumumanId, statusBaru, cek.user.id, 'Keputusan Kepala Sekolah');
  _log(cek.user, 'APPROVE_PENGUMUMAN', 'Pengumuman id ' + pengumumanId + ' menjadi ' + statusBaru);

  return _respon('success', { id: pengumumanId, status: statusBaru }, 'Status pengumuman diperbarui');
}


/* ======================== G. approveTransaksi ============================= */

/** Kepala Sekolah menyetujui / menolak transaksi keuangan. */
function approveTransaksi(transaksiId, status, token) {
  var cek = _wajibRole(token, ['kepsek']);
  if (!cek.ok) return cek.respon;

  var statusBaru = String(status).toLowerCase();
  if (statusBaru !== 'approved' && statusBaru !== 'rejected') {
    return _respon('error', null, 'Status harus "approved" atau "rejected"');
  }

  var t = _tabel('Transaksi_Keuangan');
  var n = _cari(t, 'id', transaksiId);
  if (n === -1) {
    _log(cek.user, 'APPROVE_TRANSAKSI_GAGAL', 'Transaksi id ' + transaksiId + ' tidak ditemukan');
    return _respon('error', null, 'Transaksi tidak ditemukan');
  }

  _tulis(t, n, 'status_approval', statusBaru);
  _tulis(t, n, 'approved_by', cek.user.id);
  _logApproval('transaksi', transaksiId, statusBaru, cek.user.id, 'Keputusan Kepala Sekolah');
  _log(cek.user, 'APPROVE_TRANSAKSI', 'Transaksi id ' + transaksiId + ' menjadi ' + statusBaru);

  return _respon('success', { id: transaksiId, status_approval: statusBaru }, 'Status transaksi diperbarui');
}


/* ========================== H. approveSiswa =============================== */

/** Kepala Sekolah menyetujui / menolak data siswa yang diinput KTU. */
function approveSiswa(siswaId, status, token) {
  var cek = _wajibRole(token, ['kepsek']);
  if (!cek.ok) return cek.respon;

  var statusBaru = String(status).toLowerCase();
  if (statusBaru !== 'approved' && statusBaru !== 'rejected') {
    return _respon('error', null, 'Status harus "approved" atau "rejected"');
  }

  var t = _tabel('Siswa');
  var n = _cari(t, 'id', siswaId);
  if (n === -1) {
    _log(cek.user, 'APPROVE_SISWA_GAGAL', 'Siswa id ' + siswaId + ' tidak ditemukan');
    return _respon('error', null, 'Siswa tidak ditemukan');
  }

  _tulis(t, n, 'status_data', statusBaru);
  _logApproval('siswa', siswaId, statusBaru, cek.user.id, 'Keputusan Kepala Sekolah');
  _log(cek.user, 'APPROVE_SISWA', 'Data siswa ' + _nilai(t, n, 'nama') + ' menjadi ' + statusBaru);

  return _respon('success', { id: siswaId, status_data: statusBaru }, 'Status data siswa diperbarui');
}


/* =========================== I. crudBiaya ================================= */

/**
 * Kelola master biaya (khusus Kepala Sekolah).
 * action: create / update / delete
 *  - create : tambah biaya baru
 *  - update : ubah nominal biaya
 *  - delete : nonaktifkan biaya (status_aktif = false), data tidak dihapus
 */
function crudBiaya(action, data, token) {
  var cek = _wajibRole(token, ['kepsek']);
  if (!cek.ok) return cek.respon;

  var t = _tabel('Biaya');
  var aksi = String(action).toLowerCase();
  data = data || {};

  if (aksi === 'create') {
    if (!data.nama_biaya || data.nominal_default === undefined) {
      return _respon('error', null, 'nama_biaya dan nominal_default wajib diisi');
    }
    var idBaru = _idBaru(t);
    _tambah(t, {
      id: idBaru,
      nama_biaya: data.nama_biaya,
      nominal_default: Number(data.nominal_default),
      dibuat_oleh: cek.user.id,
      status_aktif: true,
      tgl_dibuat: new Date()
    });
    _log(cek.user, 'BIAYA_CREATE', 'Menambah biaya "' + data.nama_biaya + '" sebesar ' + data.nominal_default);
    return _respon('success', { id: idBaru }, 'Biaya baru berhasil ditambahkan');
  }

  if (aksi === 'update') {
    var nU = _cari(t, 'id', data.id);
    if (nU === -1) return _respon('error', null, 'Biaya tidak ditemukan');
    var lama = _nilai(t, nU, 'nominal_default');
    _tulis(t, nU, 'nominal_default', Number(data.nominal_default));
    _log(cek.user, 'BIAYA_UPDATE', 'Nominal biaya id ' + data.id + ' diubah dari ' + lama + ' ke ' + data.nominal_default);
    return _respon('success', { id: data.id, nominal_default: Number(data.nominal_default) }, 'Nominal biaya berhasil diubah');
  }

  if (aksi === 'delete') {
    var nD = _cari(t, 'id', data.id);
    if (nD === -1) return _respon('error', null, 'Biaya tidak ditemukan');
    _tulis(t, nD, 'status_aktif', false);
    _log(cek.user, 'BIAYA_DELETE', 'Menonaktifkan biaya id ' + data.id);
    return _respon('success', { id: data.id, status_aktif: false }, 'Biaya berhasil dinonaktifkan');
  }

  return _respon('error', null, 'Action biaya tidak dikenali. Gunakan create/update/delete');
}


/* ============================ J. getUsers ================================= */

/** Ambil seluruh user untuk Kepala Sekolah. Kolom PIN tidak ikut dikirim. */
function getUsers(token) {
  // KTU ikut dibolehkan karena Modul Data Master miliknya membutuhkan daftar ini
  var cek = _wajibRole(token, ['kepsek', 'ktu']);
  if (!cek.ok) return cek.respon;

  // Penugasan guru disimpan di sheet Guru yang terpisah, bukan di Users.
  // Isinya dipetakan dulu agar penggabungannya tidak menelusuri berulang.
  var petaGuru = {};
  try {
    var tG = _tabel('Guru');
    var gUser = _kol(tG, 'id_user');
    var gJenis = _kol(tG, 'jenis');
    var gMapel = _kol(tG, 'id_mapel');
    var gKelas = _kol(tG, 'id_kelas_wali');
    tG.baris.forEach(function (r) {
      petaGuru[String(r[gUser])] = {
        jenis: r[gJenis],
        id_mapel: r[gMapel],
        id_kelas_wali: r[gKelas]
      };
    });
  } catch (err) {
    // Sheet Guru belum ada atau kolomnya belum lengkap: daftar tetap dikirim
  }

  var t = _tabel('Users');
  var punyaHp = t.header.indexOf('no_hp') !== -1;
  var punyaAlamat = t.header.indexOf('alamat') !== -1;

  var daftar = t.baris.map(function (r) {
    var id = r[_kol(t, 'id')];
    var g = petaGuru[String(id)] || {};

    return {
      id: id,
      nama: r[_kol(t, 'nama')],
      email: r[_kol(t, 'email')],
      role: r[_kol(t, 'role')],
      subrole: r[_kol(t, 'subrole')],
      aktif: _bool(r[_kol(t, 'aktif')]),
      no_hp: punyaHp ? r[_kol(t, 'no_hp')] : '',
      alamat: punyaAlamat ? r[_kol(t, 'alamat')] : '',
      // Dari sheet Guru, kosong untuk role selain guru
      jenis_guru: g.jenis || '',
      id_mapel: (g.id_mapel === undefined ? '' : g.id_mapel),
      id_kelas_wali: (g.id_kelas_wali === undefined ? '' : g.id_kelas_wali)
    };
  });

  _log(cek.user, 'LIHAT_USERS', 'Melihat daftar user (' + daftar.length + ' akun)');
  return _respon('success', daftar, 'Daftar user berhasil diambil');
}


/* ============================ K. resetPin ================================= */

/**
 * Reset PIN user menjadi 6 digit acak.
 * PIN asli dikembalikan sekali saja agar bisa dikirim ke email user.
 * Yang tersimpan di sheet hanya hash-nya.
 */
function resetPin(userId, token) {
  var cek = _wajibRole(token, ['kepsek']);
  if (!cek.ok) return cek.respon;

  var t = _tabel('Users');
  var n = _cari(t, 'id', userId);
  if (n === -1) {
    _log(cek.user, 'RESET_PIN_GAGAL', 'User id ' + userId + ' tidak ditemukan');
    return _respon('error', null, 'User tidak ditemukan');
  }

  // PIN acak 6 digit (100000 - 999999)
  var pinBaru = String(Math.floor(100000 + Math.random() * 900000));
  _tulis(t, n, 'pin', _hashPin(pinBaru));

  // Token lama dihapus agar sesi lama tidak bisa dipakai lagi
  _tulis(t, n, 'token', '');
  _tulis(t, n, 'token_expired', '');

  _log(cek.user, 'RESET_PIN', 'Reset PIN untuk user: ' + _nilai(t, n, 'nama'));

  return _respon('success', {
    id: userId,
    nama: _nilai(t, n, 'nama'),
    email: _nilai(t, n, 'email'),
    pin_baru: pinBaru
  }, 'PIN berhasil direset');
}


/* ========================== L. createAccount ============================== */

/**
 * KTU membuat akun baru. Akun disimpan dengan aktif = false,
 * menunggu persetujuan Kepala Sekolah lewat approveAkun().
 */
function createAccount(nama, email, pin, role, subrole, token) {
  var cek = _wajibRole(token, ['ktu']);
  if (!cek.ok) return cek.respon;

  if (!nama || !email || !pin || !role) {
    return _respon('error', null, 'Nama, email, PIN, dan role wajib diisi');
  }

  var t = _tabel('Users');
  if (_cari(t, 'email', String(email).trim()) !== -1) {
    _log(cek.user, 'BUAT_AKUN_GAGAL', 'Email sudah terdaftar: ' + email);
    return _respon('error', null, 'Email sudah terdaftar');
  }

  var idBaru = _idBaru(t);
  _tambah(t, {
    id: idBaru,
    nama: nama,
    email: String(email).trim(),
    pin: _hashPin(pin),
    role: role,
    subrole: subrole || '',
    aktif: false,
    token: '',
    token_expired: ''
  });

  _logApproval('akun', idBaru, 'pending', cek.user.id, 'Akun baru dibuat KTU, menunggu Kepala Sekolah');
  _log(cek.user, 'BUAT_AKUN', 'Membuat akun ' + nama + ' (' + role + ')');

  return _respon('success', { id: idBaru, aktif: false }, 'Akun berhasil dibuat, menunggu persetujuan Kepala Sekolah');
}


/* =========================== M. inputSiswa ================================ */

/** KTU menginput data siswa baru dengan status_data = pending. */
function inputSiswa(data, token) {
  var cek = _wajibRole(token, ['ktu']);
  if (!cek.ok) return cek.respon;

  data = data || {};
  if (!data.nis || !data.nama) {
    return _respon('error', null, 'NIS dan nama siswa wajib diisi');
  }

  var t = _tabel('Siswa');
  if (_cari(t, 'nis', data.nis) !== -1) {
    _log(cek.user, 'INPUT_SISWA_GAGAL', 'NIS sudah terdaftar: ' + data.nis);
    return _respon('error', null, 'NIS sudah terdaftar');
  }

  var idBaru = _idBaru(t);
  _tambah(t, {
    id: idBaru,
    nis: data.nis,
    nama: data.nama,
    id_kelas: data.id_kelas || '',
    id_wali_murid: data.id_wali_murid || '',
    status_data: 'pending',
    diinput_oleh: cek.user.id,
    tgl_input: new Date()
  });

  _logApproval('siswa', idBaru, 'pending', cek.user.id, 'Data siswa baru diinput KTU');
  _log(cek.user, 'INPUT_SISWA', 'Menginput siswa ' + data.nama + ' (NIS ' + data.nis + ')');

  return _respon('success', { id: idBaru, status_data: 'pending' }, 'Data siswa tersimpan, menunggu persetujuan Kepala Sekolah');
}


/* ========================= N. getSiswaPending ============================= */

/** Daftar siswa yang masih menunggu persetujuan Kepala Sekolah. */
function getSiswaPending(token) {
  var cek = _wajibRole(token, ['kepsek']);
  if (!cek.ok) return cek.respon;

  var t = _tabel('Siswa');
  var kStatus = _kol(t, 'status_data');
  var daftar = [];

  t.baris.forEach(function (r) {
    if (String(r[kStatus]).toLowerCase() !== 'pending') return;
    daftar.push({
      id: r[_kol(t, 'id')],
      nis: r[_kol(t, 'nis')],
      nama: r[_kol(t, 'nama')],
      id_kelas: r[_kol(t, 'id_kelas')],
      id_wali_murid: r[_kol(t, 'id_wali_murid')],
      diinput_oleh: r[_kol(t, 'diinput_oleh')],
      tgl_input: r[_kol(t, 'tgl_input')]
    });
  });

  _log(cek.user, 'LIHAT_SISWA_PENDING', 'Melihat ' + daftar.length + ' data siswa pending');
  return _respon('success', daftar, 'Daftar siswa pending berhasil diambil');
}


/* ======================== O. createPengumuman ============================= */

/**
 * Membuat pengumuman. Status awal ditentukan oleh tipe pengumuman:
 *  - global  (dari KTU)          -> pending        (langsung ke Kepala Sekolah)
 *  - khusus  (dari Wali Kelas)   -> pending        (langsung ke Kepala Sekolah)
 *  - tagihan (dari Bendahara)    -> pending_KTU    (lewat KTU dulu, baru Kepsek)
 */
function createPengumuman(data, token) {
  var cek = _wajibRole(token, null);
  if (!cek.ok) return cek.respon;

  data = data || {};
  var tipe = String(data.tipe || '').toLowerCase();
  if (['global', 'khusus', 'tagihan'].indexOf(tipe) === -1) {
    return _respon('error', null, 'Tipe pengumuman harus global/khusus/tagihan');
  }
  if (!data.konten) {
    return _respon('error', null, 'Konten pengumuman wajib diisi');
  }

  var statusAwal = (tipe === 'tagihan') ? 'pending_KTU' : 'pending';

  var t = _tabel('Pengumuman');
  var idBaru = _idBaru(t);
  _tambah(t, {
    id: idBaru,
    dari_id_user: cek.user.id,
    dari_nama: cek.user.nama,
    tipe: tipe,
    id_penerima_siswa: data.id_penerima_siswa || '',
    konten: data.konten,
    status: statusAwal,
    tgl: new Date(),
    approved_by: ''
  });

  _logApproval('pengumuman', idBaru, statusAwal, cek.user.id, 'Pengumuman tipe ' + tipe + ' dibuat');
  _log(cek.user, 'BUAT_PENGUMUMAN', 'Membuat pengumuman tipe ' + tipe + ' (status ' + statusAwal + ')');

  return _respon('success', { id: idBaru, status: statusAwal }, 'Pengumuman berhasil dibuat');
}


/* ================= P. approvePengumumanTagihanKTU ========================= */

/** KTU meneruskan pengumuman tagihan dari Bendahara ke Kepala Sekolah. */
function approvePengumumanTagihanKTU(pengumumanId, token) {
  var cek = _wajibRole(token, ['ktu']);
  if (!cek.ok) return cek.respon;

  var t = _tabel('Pengumuman');
  var n = _cari(t, 'id', pengumumanId);
  if (n === -1) {
    _log(cek.user, 'APPROVE_TAGIHAN_KTU_GAGAL', 'Pengumuman id ' + pengumumanId + ' tidak ditemukan');
    return _respon('error', null, 'Pengumuman tidak ditemukan');
  }

  if (String(_nilai(t, n, 'status')) !== 'pending_KTU') {
    return _respon('error', null, 'Pengumuman ini tidak sedang menunggu persetujuan KTU');
  }

  _tulis(t, n, 'status', 'pending_Kepsek');
  _logApproval('pengumuman', pengumumanId, 'pending_Kepsek', cek.user.id, 'Diteruskan KTU ke Kepala Sekolah');
  _log(cek.user, 'APPROVE_TAGIHAN_KTU', 'Meneruskan pengumuman id ' + pengumumanId + ' ke Kepala Sekolah');

  return _respon('success', { id: pengumumanId, status: 'pending_Kepsek' }, 'Pengumuman diteruskan ke Kepala Sekolah');
}


/* ======================= Q. getTagihanMenunggak =========================== */

/**
 * Daftar tagihan yang sudah lewat jatuh tempo dan belum lunas.
 * Token sudah diverifikasi lebih dulu oleh doPost.
 */
function getTagihanMenunggak() {
  var t = _tabel('Tagihan_Siswa');
  var tSiswa = _tabel('Siswa');
  var sekarang = new Date();
  var daftar = [];

  t.baris.forEach(function (r) {
    var statusBayar = String(r[_kol(t, 'status_bayar')]).toLowerCase();
    if (statusBayar === 'lunas') return;

    var jatuhTempo = r[_kol(t, 'jatuh_tempo')];
    if (!jatuhTempo) return;
    var jt = new Date(jatuhTempo);
    if (isNaN(jt.getTime()) || jt.getTime() >= sekarang.getTime()) return;

    var idSiswa = r[_kol(t, 'id_siswa')];
    var nSiswa = _cari(tSiswa, 'id', idSiswa);

    daftar.push({
      id: r[_kol(t, 'id')],
      id_siswa: idSiswa,
      nama_siswa: nSiswa === -1 ? '-' : _nilai(tSiswa, nSiswa, 'nama'),
      id_biaya: r[_kol(t, 'id_biaya')],
      nominal: r[_kol(t, 'nominal')],
      jatuh_tempo: jatuhTempo,
      status_bayar: r[_kol(t, 'status_bayar')],
      hari_terlambat: Math.floor((sekarang - jt) / (1000 * 60 * 60 * 24))
    });
  });

  return _respon('success', daftar, 'Ditemukan ' + daftar.length + ' tagihan menunggak');
}


/* ======================== R. catatPembayaran ============================== */

/**
 * Bendahara mencatat pelunasan tagihan.
 * Tagihan ditandai lunas dan otomatis dicatat sebagai pemasukan.
 */
function catatPembayaran(tagihanId, buktiUrl, token) {
  var cek = _wajibRole(token, ['bendahara']);
  if (!cek.ok) return cek.respon;

  var t = _tabel('Tagihan_Siswa');
  var n = _cari(t, 'id', tagihanId);
  if (n === -1) {
    _log(cek.user, 'CATAT_BAYAR_GAGAL', 'Tagihan id ' + tagihanId + ' tidak ditemukan');
    return _respon('error', null, 'Tagihan tidak ditemukan');
  }

  if (String(_nilai(t, n, 'status_bayar')).toLowerCase() === 'lunas') {
    return _respon('error', null, 'Tagihan ini sudah lunas');
  }

  var nominal = Number(_nilai(t, n, 'nominal')) || 0;
  var idSiswa = _nilai(t, n, 'id_siswa');

  _tulis(t, n, 'status_bayar', 'lunas');
  _tulis(t, n, 'tgl_bayar', new Date());
  if (buktiUrl) _tulis(t, n, 'bukti_url', buktiUrl);

  // Catat sebagai pemasukan yang langsung disetujui
  var tTrx = _tabel('Transaksi_Keuangan');
  var idTrx = _idBaru(tTrx);
  _tambah(tTrx, {
    id: idTrx,
    tipe: 'pemasukan',
    jumlah: nominal,
    deskripsi: 'Pembayaran tagihan id ' + tagihanId + ' (siswa id ' + idSiswa + ')',
    id_pengaju: cek.user.id,
    status_approval: 'approved',
    approved_by: cek.user.id,
    tgl: new Date()
  });

  _log(cek.user, 'CATAT_PEMBAYARAN', 'Tagihan id ' + tagihanId + ' lunas sebesar ' + nominal);

  return _respon('success', {
    id_tagihan: tagihanId,
    status_bayar: 'lunas',
    id_transaksi: idTrx
  }, 'Pembayaran berhasil dicatat');
}


/* ========================= S. catatTransaksi ============================== */

/**
 * Bendahara / KTU mencatat transaksi keuangan.
 * Pengeluaran di atas batas wajib menunggu persetujuan Kepala Sekolah.
 * Batasnya dibaca dari sheet Konfigurasi lewat _batasPengeluaran(),
 * sehingga bisa diubah Kepala Sekolah tanpa menyunting kode ini.
 */
function catatTransaksi(data, token) {
  var cek = _wajibRole(token, ['bendahara', 'ktu']);
  if (!cek.ok) return cek.respon;

  data = data || {};
  var tipe = String(data.tipe || '').toLowerCase();
  if (tipe !== 'pemasukan' && tipe !== 'pengeluaran') {
    return _respon('error', null, 'Tipe transaksi harus pemasukan atau pengeluaran');
  }

  var jumlah = Number(data.jumlah);
  if (!jumlah || jumlah <= 0) {
    return _respon('error', null, 'Jumlah transaksi harus lebih dari 0');
  }

  // Pengeluaran besar butuh approval, selain itu langsung disetujui
  var batas = _batasPengeluaran();
  var perluApproval = (tipe === 'pengeluaran' && jumlah > batas);
  var statusApproval = perluApproval ? 'pending' : 'approved';

  var t = _tabel('Transaksi_Keuangan');
  var idBaru = _idBaru(t);
  _tambah(t, {
    id: idBaru,
    tipe: tipe,
    jumlah: jumlah,
    deskripsi: data.deskripsi || '',
    id_pengaju: cek.user.id,
    status_approval: statusApproval,
    approved_by: perluApproval ? '' : cek.user.id,
    tgl: new Date()
  });

  if (perluApproval) {
    _logApproval('transaksi', idBaru, 'pending', cek.user.id, 'Pengeluaran ' + jumlah + ' melebihi batas ' + batas);
  }
  _log(cek.user, 'CATAT_TRANSAKSI', tipe + ' sebesar ' + jumlah + ' (status ' + statusApproval + ')');

  return _respon('success', {
    id: idBaru,
    status_approval: statusApproval
  }, perluApproval ? 'Transaksi tersimpan, menunggu persetujuan Kepala Sekolah' : 'Transaksi berhasil dicatat');
}


/* ========================== T. usulanBiaya ================================ */

/**
 * Bendahara mengusulkan perubahan nominal biaya.
 * Usulan disimpan sebagai baris pending di Approval_Log (tipe "biaya").
 * Nominal di sheet Biaya BELUM berubah sampai Kepala Sekolah menyetujui
 * lewat crudBiaya('update', ...).
 */
function usulanBiaya(idBiaya, nominalBaru, token) {
  var cek = _wajibRole(token, ['bendahara']);
  if (!cek.ok) return cek.respon;

  var nominal = Number(nominalBaru);
  if (!nominal || nominal <= 0) {
    return _respon('error', null, 'Nominal usulan harus lebih dari 0');
  }

  var t = _tabel('Biaya');
  var n = _cari(t, 'id', idBiaya);
  if (n === -1) {
    _log(cek.user, 'USULAN_BIAYA_GAGAL', 'Biaya id ' + idBiaya + ' tidak ditemukan');
    return _respon('error', null, 'Biaya tidak ditemukan');
  }

  var nominalLama = _nilai(t, n, 'nominal_default');
  var namaBiaya = _nilai(t, n, 'nama_biaya');

  _logApproval('biaya', idBiaya, 'pending', cek.user.id,
    'Usulan nominal "' + namaBiaya + '" dari ' + nominalLama + ' menjadi ' + nominal);
  _log(cek.user, 'USULAN_BIAYA', 'Mengusulkan nominal biaya "' + namaBiaya + '" menjadi ' + nominal);

  return _respon('success', {
    id_biaya: idBiaya,
    nominal_lama: nominalLama,
    nominal_usulan: nominal,
    status: 'pending'
  }, 'Usulan biaya terkirim, menunggu persetujuan Kepala Sekolah');
}


/* =========================== U. absenGuru ================================= */

/**
 * Absensi mengajar guru.
 * jenis = "checkin"  -> buat baris baru, isi jam_masuk
 * jenis = "checkout" -> isi jam_keluar pada baris absensi hari ini
 */
function absenGuru(idGuru, jenis, token) {
  var cek = _wajibRole(token, ['guru']);
  if (!cek.ok) return cek.respon;

  var mode = String(jenis).toLowerCase();
  var t = _tabel('Absensi_Mengajar');
  var hariIni = new Date();

  // Cari absensi guru ini untuk hari ini
  var kGuru = _kol(t, 'id_guru');
  var kTgl = _kol(t, 'tgl');
  var barisHariIni = -1;
  for (var i = 0; i < t.baris.length; i++) {
    if (String(t.baris[i][kGuru]) === String(idGuru) && _tanggalSama(t.baris[i][kTgl], hariIni)) {
      barisHariIni = i;
      break;
    }
  }

  if (mode === 'checkin') {
    if (barisHariIni !== -1) {
      return _respon('error', null, 'Guru ini sudah melakukan check-in hari ini');
    }
    var idBaru = _idBaru(t);
    var jamMasuk = _jamSekarang();
    _tambah(t, {
      id: idBaru,
      id_guru: idGuru,
      tgl: hariIni,
      jam_masuk: jamMasuk,
      jam_keluar: '',
      status: 'hadir'
    });
    _log(cek.user, 'ABSEN_CHECKIN', 'Check-in pukul ' + jamMasuk);
    return _respon('success', { id: idBaru, jam_masuk: jamMasuk }, 'Check-in berhasil');
  }

  if (mode === 'checkout') {
    if (barisHariIni === -1) {
      return _respon('error', null, 'Belum ada check-in hari ini');
    }
    if (_nilai(t, barisHariIni, 'jam_keluar')) {
      return _respon('error', null, 'Guru ini sudah melakukan check-out hari ini');
    }
    var jamKeluar = _jamSekarang();
    _tulis(t, barisHariIni, 'jam_keluar', jamKeluar);
    _log(cek.user, 'ABSEN_CHECKOUT', 'Check-out pukul ' + jamKeluar);
    return _respon('success', { jam_keluar: jamKeluar }, 'Check-out berhasil');
  }

  return _respon('error', null, 'Jenis absensi harus checkin atau checkout');
}


/* =========================== V. simpanRPP ================================= */

/** Guru menyimpan Rencana Pelaksanaan Pembelajaran. */
function simpanRPP(data, token) {
  var cek = _wajibRole(token, ['guru']);
  if (!cek.ok) return cek.respon;

  data = data || {};
  if (!data.id_mapel || !data.id_kelas || !data.materi) {
    return _respon('error', null, 'id_mapel, id_kelas, dan materi wajib diisi');
  }

  var t = _tabel('RPP');
  var idBaru = _idBaru(t);
  _tambah(t, {
    id: idBaru,
    id_guru: data.id_guru || cek.user.id,
    id_mapel: data.id_mapel,
    id_kelas: data.id_kelas,
    tgl: data.tgl ? new Date(data.tgl) : new Date(),
    materi: data.materi,
    metode: data.metode || '',
    media: data.media || '',
    file_url: data.file_url || ''
  });

  _log(cek.user, 'SIMPAN_RPP', 'Menyimpan RPP materi "' + data.materi + '" untuk kelas ' + data.id_kelas);
  return _respon('success', { id: idBaru }, 'RPP berhasil disimpan');
}


/* =========================== W. inputNilai ================================ */

/** Guru menginput nilai siswa (harian / ujian / hafalan). */
function inputNilai(data, token) {
  var cek = _wajibRole(token, ['guru']);
  if (!cek.ok) return cek.respon;

  data = data || {};
  var jenis = String(data.jenis || '').toLowerCase();
  if (['harian', 'ujian', 'hafalan'].indexOf(jenis) === -1) {
    return _respon('error', null, 'Jenis nilai harus harian/ujian/hafalan');
  }
  if (!data.id_siswa || !data.id_mapel || data.nilai === undefined || data.nilai === '') {
    return _respon('error', null, 'id_siswa, id_mapel, dan nilai wajib diisi');
  }

  var t = _tabel('Nilai');
  var idBaru = _idBaru(t);
  _tambah(t, {
    id: idBaru,
    id_siswa: data.id_siswa,
    id_mapel: data.id_mapel,
    id_guru: data.id_guru || cek.user.id,
    jenis: jenis,
    nilai: Number(data.nilai),
    tgl: data.tgl ? new Date(data.tgl) : new Date()
  });

  _log(cek.user, 'INPUT_NILAI', 'Nilai ' + jenis + ' siswa id ' + data.id_siswa + ' = ' + data.nilai);
  return _respon('success', { id: idBaru }, 'Nilai berhasil disimpan');
}


/* =========================== X. getDataAnak =============================== */

/** Wali murid melihat data anak-anaknya. */
function getDataAnak(idWaliMurid, token) {
  var cek = _wajibRole(token, ['walimurid']);
  if (!cek.ok) return cek.respon;

  var t = _tabel('Siswa');
  var tKelas = _tabel('Kelas');
  var kWali = _kol(t, 'id_wali_murid');
  var daftar = [];

  t.baris.forEach(function (r) {
    if (String(r[kWali]) !== String(idWaliMurid)) return;
    var idKelas = r[_kol(t, 'id_kelas')];
    var nKelas = _cari(tKelas, 'id', idKelas);
    daftar.push({
      id: r[_kol(t, 'id')],
      nis: r[_kol(t, 'nis')],
      nama: r[_kol(t, 'nama')],
      id_kelas: idKelas,
      nama_kelas: nKelas === -1 ? '-' : _nilai(tKelas, nKelas, 'nama'),
      status_data: r[_kol(t, 'status_data')]
    });
  });

  _log(cek.user, 'LIHAT_DATA_ANAK', 'Melihat ' + daftar.length + ' data anak');
  return _respon('success', daftar, 'Data anak berhasil diambil');
}


/* ======================= Y. getTagihanWaliMurid =========================== */

/** Wali murid melihat seluruh tagihan anak-anaknya. */
function getTagihanWaliMurid(idWaliMurid, token) {
  var cek = _wajibRole(token, ['walimurid']);
  if (!cek.ok) return cek.respon;

  var tSiswa = _tabel('Siswa');
  var kWali = _kol(tSiswa, 'id_wali_murid');

  // Kumpulkan id siswa milik wali murid ini
  var petaAnak = {};
  tSiswa.baris.forEach(function (r) {
    if (String(r[kWali]) === String(idWaliMurid)) {
      petaAnak[String(r[_kol(tSiswa, 'id')])] = r[_kol(tSiswa, 'nama')];
    }
  });

  var tTagihan = _tabel('Tagihan_Siswa');
  var tBiaya = _tabel('Biaya');
  var daftar = [];

  tTagihan.baris.forEach(function (r) {
    var idSiswa = String(r[_kol(tTagihan, 'id_siswa')]);
    if (!Object.prototype.hasOwnProperty.call(petaAnak, idSiswa)) return;

    var idBiaya = r[_kol(tTagihan, 'id_biaya')];
    var nBiaya = _cari(tBiaya, 'id', idBiaya);

    daftar.push({
      id: r[_kol(tTagihan, 'id')],
      id_siswa: idSiswa,
      nama_siswa: petaAnak[idSiswa],
      id_biaya: idBiaya,
      nama_biaya: nBiaya === -1 ? '-' : _nilai(tBiaya, nBiaya, 'nama_biaya'),
      nominal: r[_kol(tTagihan, 'nominal')],
      jatuh_tempo: r[_kol(tTagihan, 'jatuh_tempo')],
      status_bayar: r[_kol(tTagihan, 'status_bayar')],
      tgl_bayar: r[_kol(tTagihan, 'tgl_bayar')],
      bukti_url: r[_kol(tTagihan, 'bukti_url')]
    });
  });

  _log(cek.user, 'LIHAT_TAGIHAN', 'Melihat ' + daftar.length + ' tagihan anak');
  return _respon('success', daftar, 'Daftar tagihan berhasil diambil');
}


/* ======================== Z. uploadBuktiBayar ============================= */

/**
 * Wali murid mengunggah bukti pembayaran.
 * File base64 disimpan ke folder Drive, URL-nya ditulis ke kolom bukti_url.
 * fileBase64 boleh berupa data URI ("data:image/jpeg;base64,....") atau base64 polos.
 */
function uploadBuktiBayar(tagihanId, fileBase64, token) {
  var cek = _wajibRole(token, ['walimurid']);
  if (!cek.ok) return cek.respon;

  if (!fileBase64) {
    return _respon('error', null, 'File bukti pembayaran wajib diisi');
  }
  if (ID_FOLDER_BUKTI_BAYAR === 'GANTI_DENGAN_ID_FOLDER_DRIVE') {
    return _respon('error', null, 'ID_FOLDER_BUKTI_BAYAR belum dikonfigurasi pada script');
  }

  var t = _tabel('Tagihan_Siswa');
  var n = _cari(t, 'id', tagihanId);
  if (n === -1) {
    _log(cek.user, 'UPLOAD_BUKTI_GAGAL', 'Tagihan id ' + tagihanId + ' tidak ditemukan');
    return _respon('error', null, 'Tagihan tidak ditemukan');
  }

  // Pisahkan prefiks data URI bila ada, ambil tipe file-nya
  var mime = 'image/jpeg';
  var isi = String(fileBase64);
  var cocok = isi.match(/^data:([^;]+);base64,(.*)$/);
  if (cocok) {
    mime = cocok[1];
    isi = cocok[2];
  }

  try {
    var ekstensi = mime.split('/')[1] || 'jpg';
    var namaFile = 'bukti_' + tagihanId + '_' + new Date().getTime() + '.' + ekstensi;
    var blob = Utilities.newBlob(Utilities.base64Decode(isi), mime, namaFile);
    var file = DriveApp.getFolderById(ID_FOLDER_BUKTI_BAYAR).createFile(blob);
    var url = file.getUrl();

    _tulis(t, n, 'bukti_url', url);
    _log(cek.user, 'UPLOAD_BUKTI', 'Mengunggah bukti bayar tagihan id ' + tagihanId);

    return _respon('success', { id_tagihan: tagihanId, bukti_url: url }, 'Bukti pembayaran berhasil diunggah');
  } catch (err) {
    _log(cek.user, 'UPLOAD_BUKTI_GAGAL', 'Error: ' + err.message);
    return _respon('error', null, 'Gagal menyimpan file: ' + err.message);
  }
}


/* ==========================================================================
 *  PRIORITAS 1 — 13 AKSI TAMBAHAN
 * --------------------------------------------------------------------------
 *  Melengkapi 25 aksi sebelumnya. Sebagian besar adalah pembaca daftar,
 *  karena hampir semua modul frontend perlu membaca data sebelum
 *  bisa menampilkan apa pun.
 * ========================================================================== */


/* =========================== 1. tolakAkun ================================= */

/**
 * Kepala Sekolah menolak akun yang belum aktif.
 * Barisnya dihapus dari sheet Users, mengikuti perilaku frontend Modul 4.2.
 */
function tolakAkun(userId, token) {
  var cek = _wajibRole(token, ['kepsek']);
  if (!cek.ok) return cek.respon;

  var t = _tabel('Users');
  var n = _cari(t, 'id', userId);
  if (n === -1) {
    _log(cek.user, 'TOLAK_AKUN_GAGAL', 'User id ' + userId + ' tidak ditemukan');
    return _respon('error', null, 'User tidak ditemukan');
  }

  if (_bool(_nilai(t, n, 'aktif'))) {
    return _respon('error', null, 'Akun ini sudah aktif, tidak bisa ditolak');
  }

  var nama = _nilai(t, n, 'nama');

  // Baris 1 adalah header dan indeks baris dimulai dari 0, jadi digeser dua
  t.sheet.deleteRow(n + 2);

  _logApproval('akun', userId, 'rejected', cek.user.id, 'Akun ditolak Kepala Sekolah');
  _log(cek.user, 'TOLAK_AKUN', 'Menolak akun: ' + nama);

  return _respon('success', { id: userId }, 'Akun ' + nama + ' ditolak');
}


/* ============================ 2. getKelas ================================= */

/** Ambil seluruh kelas. Dipakai tujuh modul, jadi tidak dibatasi role. */
function getKelas(token) {
  var cek = _wajibRole(token, []);
  if (!cek.ok) return cek.respon;

  var daftar = _semuaObjek(_tabel('Kelas'));
  return _respon('success', daftar, 'Daftar kelas berhasil diambil');
}


/* ============================ 3. getMapel ================================= */

/** Ambil seluruh mata pelajaran. */
function getMapel(token) {
  var cek = _wajibRole(token, []);
  if (!cek.ok) return cek.respon;

  var daftar = _semuaObjek(_tabel('Mata_Pelajaran'));
  return _respon('success', daftar, 'Daftar mata pelajaran berhasil diambil');
}


/* =========================== 4. crudKelas ================================= */

/**
 * Tambah, ubah, atau hapus satu kelas.
 * Bentuknya mengikuti crudBiaya supaya polanya seragam.
 */
function crudKelas(action, data, token) {
  var cek = _wajibRole(token, ['ktu']);
  if (!cek.ok) return cek.respon;

  var t = _tabel('Kelas');
  var aksi = String(action).toLowerCase();
  data = data || {};

  if (aksi === 'create') {
    var nama = String(data.nama || '').trim();
    if (!nama) return _respon('error', null, 'Nama kelas wajib diisi');

    // Nama kelas tidak boleh kembar
    for (var i = 0; i < t.baris.length; i++) {
      if (String(t.baris[i][_kol(t, 'nama')]).trim().toLowerCase() === nama.toLowerCase()) {
        return _respon('error', null, 'Nama kelas sudah ada');
      }
    }

    var idBaru = _idBaru(t);
    _tambah(t, { id: idBaru, nama: nama, tingkat: data.tingkat || '' });
    _log(cek.user, 'TAMBAH_KELAS', 'Menambah kelas ' + nama);
    return _respon('success', { id: idBaru }, 'Kelas ' + nama + ' berhasil ditambahkan');
  }

  if (aksi === 'update') {
    var nUp = _cari(t, 'id', data.id);
    if (nUp === -1) return _respon('error', null, 'Kelas tidak ditemukan');

    if (data.nama !== undefined) _tulis(t, nUp, 'nama', data.nama);
    if (data.tingkat !== undefined) _tulis(t, nUp, 'tingkat', data.tingkat);

    _log(cek.user, 'UBAH_KELAS', 'Mengubah kelas id ' + data.id);
    return _respon('success', { id: data.id }, 'Kelas berhasil diperbarui');
  }

  if (aksi === 'delete') {
    var nDel = _cari(t, 'id', data.id);
    if (nDel === -1) return _respon('error', null, 'Kelas tidak ditemukan');

    // Kelas yang masih dipakai siswa tidak boleh dihapus
    var tSiswa = _tabel('Siswa');
    var kKelas = _kol(tSiswa, 'id_kelas');
    for (var s = 0; s < tSiswa.baris.length; s++) {
      if (String(tSiswa.baris[s][kKelas]) === String(data.id)) {
        return _respon('error', null, 'Kelas masih dipakai siswa, tidak bisa dihapus');
      }
    }

    var namaHapus = _nilai(t, nDel, 'nama');
    t.sheet.deleteRow(nDel + 2);
    _log(cek.user, 'HAPUS_KELAS', 'Menghapus kelas ' + namaHapus);
    return _respon('success', { id: data.id }, 'Kelas ' + namaHapus + ' berhasil dihapus');
  }

  return _respon('error', null, 'aksiKelas harus "create", "update", atau "delete"');
}


/* =========================== 5. crudMapel ================================= */

/** Tambah, ubah, atau hapus satu mata pelajaran. */
function crudMapel(action, data, token) {
  var cek = _wajibRole(token, ['ktu']);
  if (!cek.ok) return cek.respon;

  var t = _tabel('Mata_Pelajaran');
  var aksi = String(action).toLowerCase();
  data = data || {};

  if (aksi === 'create') {
    var nama = String(data.nama || '').trim();
    if (!nama) return _respon('error', null, 'Nama mata pelajaran wajib diisi');

    for (var i = 0; i < t.baris.length; i++) {
      if (String(t.baris[i][_kol(t, 'nama')]).trim().toLowerCase() === nama.toLowerCase()) {
        return _respon('error', null, 'Nama mata pelajaran sudah ada');
      }
    }

    var idBaru = _idBaru(t);
    _tambah(t, { id: idBaru, nama: nama, kode: data.kode || '' });
    _log(cek.user, 'TAMBAH_MAPEL', 'Menambah mapel ' + nama);
    return _respon('success', { id: idBaru }, 'Mata pelajaran ' + nama + ' berhasil ditambahkan');
  }

  if (aksi === 'update') {
    var nUp = _cari(t, 'id', data.id);
    if (nUp === -1) return _respon('error', null, 'Mata pelajaran tidak ditemukan');

    if (data.nama !== undefined) _tulis(t, nUp, 'nama', data.nama);
    if (data.kode !== undefined) _tulis(t, nUp, 'kode', data.kode);

    _log(cek.user, 'UBAH_MAPEL', 'Mengubah mapel id ' + data.id);
    return _respon('success', { id: data.id }, 'Mata pelajaran berhasil diperbarui');
  }

  if (aksi === 'delete') {
    var nDel = _cari(t, 'id', data.id);
    if (nDel === -1) return _respon('error', null, 'Mata pelajaran tidak ditemukan');

    var namaHapus = _nilai(t, nDel, 'nama');
    t.sheet.deleteRow(nDel + 2);
    _log(cek.user, 'HAPUS_MAPEL', 'Menghapus mapel ' + namaHapus);
    return _respon('success', { id: data.id }, 'Mata pelajaran ' + namaHapus + ' berhasil dihapus');
  }

  return _respon('error', null, 'aksiMapel harus "create", "update", atau "delete"');
}


/* ============================ 6. getBiaya ================================= */

/** Ambil seluruh jenis biaya. crudBiaya sudah bisa menulis, ini pembacanya. */
function getBiaya(token) {
  var cek = _wajibRole(token, []);
  if (!cek.ok) return cek.respon;

  var daftar = _semuaObjek(_tabel('Biaya'));
  return _respon('success', daftar, 'Daftar biaya berhasil diambil');
}


/* ============================ 7. getSiswa ================================= */

/**
 * Ambil data siswa, boleh disaring id_kelas / id_wali_murid / status_data.
 * Kolom "nama" pada sheet ikut dikirim sebagai "nama_lengkap" karena
 * seluruh modul frontend memakai nama itu.
 */
function getSiswa(filter, token) {
  var cek = _wajibRole(token, ['kepsek', 'ktu', 'bendahara', 'guru']);
  if (!cek.ok) return cek.respon;

  filter = filter || {};
  var daftar = _semuaObjek(_tabel('Siswa')).filter(function (s) {
    return _cocok(s, {
      id_kelas: filter.id_kelas,
      id_wali_murid: filter.id_wali_murid,
      status_data: filter.status_data
    });
  }).map(function (s) {
    s.nama_lengkap = s.nama;
    return s;
  });

  return _respon('success', daftar, 'Data siswa berhasil diambil (' + daftar.length + ' siswa)');
}


/* ========================== 8. getPengumuman ============================== */

/**
 * Ambil pengumuman dengan penyaring tipe / status / penerima / pengirim.
 * Wali murid dan guru dipaksa hanya menerima yang sudah disetujui, kecuali
 * kirimannya sendiri. Penyaringan ini WAJIB di sini, bukan di frontend.
 */
function getPengumuman(filter, token) {
  var cek = _wajibRole(token, []);
  if (!cek.ok) return cek.respon;

  filter = filter || {};
  var role = String(cek.user.role).trim().toLowerCase();
  var semua = _semuaObjek(_tabel('Pengumuman'));

  var daftar = semua.filter(function (p) {
    if (!_cocok(p, {
      tipe: filter.tipe,
      status: filter.status,
      id_penerima_siswa: filter.id_penerima_siswa,
      dari_id_user: filter.dari_id_user
    })) return false;

    // Kepala Sekolah dan KTU boleh melihat yang belum disetujui
    if (role === 'kepsek' || role === 'ktu') return true;

    // Selain itu: hanya yang sudah disetujui, atau kiriman sendiri
    if (String(p.status) === 'approved') return true;
    return String(p.dari_id_user) === String(cek.user.id);
  });

  return _respon('success', daftar, 'Daftar pengumuman berhasil diambil (' + daftar.length + ')');
}


/* ========================== 9. getTransaksi =============================== */

/** Ambil transaksi keuangan, boleh disaring tipe, status, dan rentang tanggal. */
function getTransaksi(filter, token) {
  var cek = _wajibRole(token, ['kepsek', 'bendahara', 'ktu']);
  if (!cek.ok) return cek.respon;

  filter = filter || {};
  var daftar = _semuaObjek(_tabel('Transaksi_Keuangan')).filter(function (x) {
    if (!_cocok(x, { tipe: filter.tipe, status_approval: filter.status_approval })) return false;
    return _dalamRentang(x.tgl, filter.tgl_mulai, filter.tgl_akhir);
  });

  return _respon('success', daftar, 'Daftar transaksi berhasil diambil (' + daftar.length + ')');
}


/* =========================== 10. getTagihan =============================== */

/**
 * Ambil tagihan siswa. Wali murid dibatasi hanya tagihan anaknya sendiri,
 * pembatasannya dihitung di sini supaya tidak bisa ditembus dari frontend.
 */
function getTagihan(filter, token) {
  var cek = _wajibRole(token, ['kepsek', 'bendahara', 'walimurid']);
  if (!cek.ok) return cek.respon;

  filter = filter || {};
  var role = String(cek.user.role).trim().toLowerCase();

  // Kumpulkan id anak bila yang meminta adalah wali murid
  var idAnak = null;
  if (role === 'walimurid') {
    var tS = _tabel('Siswa');
    var kW = _kol(tS, 'id_wali_murid');
    var kI = _kol(tS, 'id');
    idAnak = {};
    tS.baris.forEach(function (r) {
      if (String(r[kW]) === String(cek.user.id)) idAnak[String(r[kI])] = true;
    });
  }

  var daftar = _semuaObjek(_tabel('Tagihan_Siswa')).filter(function (g) {
    if (idAnak && !idAnak[String(g.id_siswa)]) return false;
    if (!_cocok(g, { id_siswa: filter.id_siswa, status_bayar: filter.status_bayar })) return false;
    return _dalamRentang(g.jatuh_tempo, filter.tgl_mulai, filter.tgl_akhir);
  });

  return _respon('success', daftar, 'Daftar tagihan berhasil diambil (' + daftar.length + ')');
}


/* ========================== 11. updateSiswa =============================== */

/**
 * Ubah sebagian kolom pada satu siswa. Dipakai Data Master untuk menetapkan
 * kelas dan wali murid. Hanya kolom yang dikirim yang ditimpa.
 */
function updateSiswa(idSiswa, data, token) {
  var cek = _wajibRole(token, ['ktu']);
  if (!cek.ok) return cek.respon;

  var t = _tabel('Siswa');
  var n = _cari(t, 'id', idSiswa);
  if (n === -1) return _respon('error', null, 'Siswa tidak ditemukan');

  data = data || {};
  var bolehDiubah = ['id_kelas', 'id_wali_murid', 'nama', 'nis', 'status_data'];
  var terubah = [];

  bolehDiubah.forEach(function (kolom) {
    if (data[kolom] !== undefined) {
      _tulis(t, n, kolom, data[kolom]);
      terubah.push(kolom);
    }
  });

  if (terubah.length === 0) return _respon('error', null, 'Tidak ada kolom yang diubah');

  _log(cek.user, 'UBAH_SISWA', 'Mengubah ' + terubah.join(', ') + ' pada siswa id ' + idSiswa);
  return _respon('success', { id: idSiswa, diubah: terubah }, 'Data siswa berhasil diperbarui');
}


/* =========================== 12. updateUser =============================== */

/**
 * Ubah sebagian kolom pada satu pengguna.
 * Penugasan mapel dan kelas wali TIDAK disimpan di sheet Users, melainkan
 * di sheet Guru yang terpisah, sesuai keputusan struktur data.
 */
function updateUser(userId, data, token) {
  var cek = _wajibRole(token, ['ktu']);
  if (!cek.ok) return cek.respon;

  var t = _tabel('Users');
  var n = _cari(t, 'id', userId);
  if (n === -1) return _respon('error', null, 'Pengguna tidak ditemukan');

  data = data || {};
  var terubah = [];

  // --- Kolom yang memang ada di sheet Users ---
  ['aktif', 'nama', 'no_hp', 'alamat'].forEach(function (kolom) {
    if (data[kolom] !== undefined) {
      _tulis(t, n, kolom, kolom === 'aktif' ? _bool(data[kolom]) : data[kolom]);
      terubah.push(kolom);
    }
  });

  // --- Penugasan guru, disimpan di sheet Guru ---
  if (data.id_mapel !== undefined || data.id_kelas_wali !== undefined) {
    var tG = _tabel('Guru');
    var nG = _cari(tG, 'id_user', userId);

    if (nG === -1) {
      // Baris penugasan belum ada, buat baru
      _tambah(tG, {
        id_user: userId,
        jenis: (data.id_kelas_wali ? 'walikelas' : 'mapel'),
        id_mapel: (data.id_mapel !== undefined ? data.id_mapel : ''),
        id_kelas_wali: (data.id_kelas_wali !== undefined ? data.id_kelas_wali : '')
      });
    } else {
      if (data.id_mapel !== undefined) _tulis(tG, nG, 'id_mapel', data.id_mapel);
      if (data.id_kelas_wali !== undefined) {
        _tulis(tG, nG, 'id_kelas_wali', data.id_kelas_wali);
        _tulis(tG, nG, 'jenis', data.id_kelas_wali ? 'walikelas' : 'mapel');
      }
    }
    if (data.id_mapel !== undefined) terubah.push('id_mapel');
    if (data.id_kelas_wali !== undefined) terubah.push('id_kelas_wali');
  }

  if (terubah.length === 0) return _respon('error', null, 'Tidak ada kolom yang diubah');

  _log(cek.user, 'UBAH_USER', 'Mengubah ' + terubah.join(', ') + ' pada user id ' + userId);
  return _respon('success', { id: userId, diubah: terubah }, 'Data pengguna berhasil diperbarui');
}


/* ============================= 13. getLog ================================= */

/**
 * Ambil catatan aktivitas terakhir, terbaru di atas.
 * Dipakai Monitoring Kepala Sekolah yang hanya menampilkan lima terakhir.
 */
function getLog(batas, token) {
  var cek = _wajibRole(token, ['kepsek']);
  if (!cek.ok) return cek.respon;

  var n = Number(batas);
  if (isNaN(n) || n <= 0) n = 5;

  var semua = _semuaObjek(_tabel('Log_Aktivitas'));
  var daftar = semua.slice(-n).reverse();

  return _respon('success', daftar, 'Catatan aktivitas berhasil diambil (' + daftar.length + ')');
}


/* ==========================================================================
 *  PRIORITAS 2 — 18 AKSI UNTUK MODUL YANG BACKENDNYA BELUM ADA
 * --------------------------------------------------------------------------
 *  Menutup Jadwal Pelajaran, Tahun Ajaran, Event, Arsip, Permohonan Wali
 *  Murid, ganti PIN, rantai approval pembayaran, dan Konfigurasi Umum.
 *
 *  Membutuhkan sheet baru dari Tahap 1:
 *  Arsip, Permohonan_Wali, Konfigurasi, Absensi_Siswa.
 * ========================================================================== */

/** Urutan hari, dipakai mengurutkan jadwal Senin sampai Minggu. */
var HARI_URUT = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];


/* =========================== 14. getJadwal ================================ */

/** Ambil jadwal pelajaran, boleh disaring kelas, guru, hari, tahun ajaran. */
function getJadwal(filter, token) {
  var cek = _wajibRole(token, []);
  if (!cek.ok) return cek.respon;

  filter = filter || {};
  // Jamnya dirapikan lebih dulu supaya pengurutan di bawah membandingkan
  // "07:00" dengan "09:30", bukan dua objek Date bertanggal 1899.
  var daftar = _rapikanJam(_semuaObjek(_tabel('Jadwal_Pelajaran'))).filter(function (j) {
    return _cocok(j, {
      id_kelas: filter.id_kelas,
      id_guru: filter.id_guru,
      hari: filter.hari,
      tahun_ajaran: filter.tahun_ajaran
    });
  });

  // Senin lebih dulu, lalu jam mulai yang lebih awal
  daftar.sort(function (a, b) {
    var ha = HARI_URUT.indexOf(String(a.hari)); if (ha === -1) ha = 99;
    var hb = HARI_URUT.indexOf(String(b.hari)); if (hb === -1) hb = 99;
    if (ha !== hb) return ha - hb;
    return String(a.jam_mulai).localeCompare(String(b.jam_mulai));
  });

  return _respon('success', daftar, 'Jadwal berhasil diambil (' + daftar.length + ')');
}


/* ========================== 15. simpanJadwal ============================== */

/**
 * Simpan jadwal baru, atau perbarui bila data.id diisi.
 *
 * Deteksi bentrok DIKERJAKAN DI SINI, bukan hanya di frontend. Kalau hanya
 * dijaga peramban, dua KTU yang menyimpan bersamaan tetap bisa menghasilkan
 * jadwal yang beririsan.
 */
function simpanJadwal(data, token) {
  var cek = _wajibRole(token, ['ktu']);
  if (!cek.ok) return cek.respon;

  data = data || {};
  var wajib = ['id_kelas', 'id_mapel', 'id_guru', 'hari', 'jam_mulai', 'jam_selesai'];
  for (var w = 0; w < wajib.length; w++) {
    if (!data[wajib[w]]) return _respon('error', null, wajib[w] + ' wajib diisi');
  }

  // Jam dinormalkan jadi "HH:mm" lebih dulu supaya bisa dibandingkan sebagai
  // teks. Tanpa ini, jam yang datang dari sheet berupa Date bertanggal 1899
  // dan seluruh perbandingan di bawah tidak pernah menghasilkan yang benar.
  var jamMulai = _jam(data.jam_mulai);
  var jamSelesai = _jam(data.jam_selesai);

  if (jamSelesai <= jamMulai) {
    return _respon('error', null, 'Jam selesai harus lebih besar dari jam mulai');
  }

  var t = _tabel('Jadwal_Pelajaran');
  var kId = _kol(t, 'id');
  var kKelas = _kol(t, 'id_kelas');
  var kGuru = _kol(t, 'id_guru');
  var kHari = _kol(t, 'hari');
  var kMulai = _kol(t, 'jam_mulai');
  var kSelesai = _kol(t, 'jam_selesai');

  // --- Periksa bentrok ---
  for (var i = 0; i < t.baris.length; i++) {
    var r = t.baris[i];

    // Jadwal yang sedang disunting tidak diadu dengan dirinya sendiri
    if (data.id && String(r[kId]) === String(data.id)) continue;
    if (String(r[kHari]) !== String(data.hari)) continue;

    // Jam baris pembanding ikut dinormalkan, karena isinya bisa berupa Date
    var rMulai = _jam(r[kMulai]);
    var rSelesai = _jam(r[kSelesai]);

    var beririsan = (jamMulai < rSelesai) && (jamSelesai > rMulai);
    if (!beririsan) continue;

    if (String(r[kKelas]) === String(data.id_kelas)) {
      return _respon('error', null,
        'Bentrok: kelas ini sudah ada jadwal hari ' + r[kHari] +
        ' pukul ' + rMulai + ' - ' + rSelesai);
    }
    if (String(r[kGuru]) === String(data.id_guru)) {
      return _respon('error', null,
        'Bentrok: guru ini sudah mengajar hari ' + r[kHari] +
        ' pukul ' + rMulai + ' - ' + rSelesai);
    }
  }

  // --- Perbarui jadwal yang sudah ada ---
  if (data.id) {
    var n = _cari(t, 'id', data.id);
    if (n === -1) return _respon('error', null, 'Jadwal tidak ditemukan');

    // Kolom jam ditulis dalam bentuk yang sudah dinormalkan
    var isiBaru = {
      id_kelas: data.id_kelas, id_mapel: data.id_mapel, id_guru: data.id_guru,
      hari: data.hari, jam_mulai: jamMulai, jam_selesai: jamSelesai,
      tahun_ajaran: data.tahun_ajaran
    };
    Object.keys(isiBaru).forEach(function (kolom) {
      if (isiBaru[kolom] !== undefined) _tulis(t, n, kolom, isiBaru[kolom]);
    });

    _log(cek.user, 'UBAH_JADWAL', 'Mengubah jadwal id ' + data.id);
    return _respon('success', { id: data.id }, 'Jadwal berhasil diperbarui');
  }

  // --- Tambah jadwal baru ---
  var idBaru = _idBaru(t);
  _tambah(t, {
    id: idBaru,
    id_kelas: data.id_kelas,
    id_mapel: data.id_mapel,
    id_guru: data.id_guru,
    hari: data.hari,
    jam_mulai: jamMulai,
    jam_selesai: jamSelesai,
    tahun_ajaran: data.tahun_ajaran || ''
  });

  _log(cek.user, 'TAMBAH_JADWAL', 'Menambah jadwal ' + data.hari + ' ' + data.jam_mulai);
  return _respon('success', { id: idBaru }, 'Jadwal berhasil ditambahkan');
}


/* ========================== 16. hapusJadwal =============================== */

/** Hapus satu baris jadwal. */
function hapusJadwal(idJadwal, token) {
  var cek = _wajibRole(token, ['ktu']);
  if (!cek.ok) return cek.respon;

  var t = _tabel('Jadwal_Pelajaran');
  var n = _cari(t, 'id', idJadwal);
  if (n === -1) return _respon('error', null, 'Jadwal tidak ditemukan');

  t.sheet.deleteRow(n + 2);
  _log(cek.user, 'HAPUS_JADWAL', 'Menghapus jadwal id ' + idJadwal);
  return _respon('success', { id: idJadwal }, 'Jadwal berhasil dihapus');
}


/* ========================= 17. getTahunAjaran ============================= */

/** Ambil seluruh tahun ajaran. */
function getTahunAjaran(token) {
  var cek = _wajibRole(token, []);
  if (!cek.ok) return cek.respon;

  var daftar = _semuaObjek(_tabel('Tahun_Ajaran')).map(function (x) {
    x.status_aktif = _bool(x.status_aktif);
    return x;
  });
  return _respon('success', daftar, 'Daftar tahun ajaran berhasil diambil');
}


/* ====================== 18. setTahunAjaranAktif =========================== */

/** Tetapkan satu tahun ajaran sebagai yang aktif, sisanya dimatikan. */
function setTahunAjaranAktif(idTahun, token) {
  var cek = _wajibRole(token, ['kepsek']);
  if (!cek.ok) return cek.respon;

  var t = _tabel('Tahun_Ajaran');
  var n = _cari(t, 'id', idTahun);
  if (n === -1) return _respon('error', null, 'Tahun ajaran tidak ditemukan');

  // Hanya satu yang boleh aktif, jadi seluruh baris ditulis ulang
  for (var i = 0; i < t.baris.length; i++) {
    _tulis(t, i, 'status_aktif', i === n);
  }

  var tahun = _nilai(t, n, 'tahun');
  _log(cek.user, 'SET_TAHUN_AJARAN', 'Tahun ajaran aktif diubah ke ' + tahun);
  return _respon('success', { id: idTahun, tahun: tahun }, 'Tahun ajaran aktif diubah ke ' + tahun);
}


/* ============================ 19. getEvent ================================ */

/** Ambil daftar event, boleh disaring status persetujuannya. */
function getEvent(filter, token) {
  var cek = _wajibRole(token, []);
  if (!cek.ok) return cek.respon;

  filter = filter || {};
  var daftar = _semuaObjek(_tabel('Event')).filter(function (e) {
    return _cocok(e, { status_approval: filter.status_approval, jenis: filter.jenis });
  });

  // Terbaru di atas
  daftar.sort(function (a, b) { return (Number(b.id) || 0) - (Number(a.id) || 0); });
  return _respon('success', daftar, 'Daftar event berhasil diambil (' + daftar.length + ')');
}


/* =========================== 20. simpanEvent ============================== */

/** KTU membuat event baru berstatus pending. */
function simpanEvent(data, token) {
  var cek = _wajibRole(token, ['ktu']);
  if (!cek.ok) return cek.respon;

  data = data || {};
  if (!data.nama_event) return _respon('error', null, 'Nama event wajib diisi');
  if (!data.jenis) return _respon('error', null, 'Jenis event wajib dipilih');
  if (!data.tgl_mulai) return _respon('error', null, 'Tanggal mulai wajib diisi');
  if (!data.tgl_selesai) return _respon('error', null, 'Tanggal selesai wajib diisi');
  if (!data.deskripsi) return _respon('error', null, 'Deskripsi wajib diisi');

  // Tanggal ditulis YYYY-MM-DD sehingga bisa dibandingkan sebagai teks
  if (String(data.tgl_selesai) < String(data.tgl_mulai)) {
    return _respon('error', null, 'Tanggal selesai tidak boleh lebih awal dari tanggal mulai');
  }

  var t = _tabel('Event');
  var idBaru = _idBaru(t);

  _tambah(t, {
    id: idBaru,
    nama_event: data.nama_event,
    jenis: data.jenis,
    tgl_mulai: data.tgl_mulai,
    tgl_selesai: data.tgl_selesai,
    deskripsi: data.deskripsi,
    target: data.target || 'semua',
    dibuat_oleh: cek.user.nama,
    status_approval: 'pending'
  });

  _logApproval('event', idBaru, 'pending', cek.user.id, 'Event baru dibuat KTU');
  _log(cek.user, 'TAMBAH_EVENT', 'Membuat event ' + data.nama_event);
  return _respon('success', { id: idBaru },
    'Event berhasil disimpan. Menunggu persetujuan Kepala Sekolah.');
}


/* =========================== 21. batalEvent =============================== */

/** Batalkan event yang masih menunggu persetujuan. */
function batalEvent(idEvent, token) {
  var cek = _wajibRole(token, ['ktu']);
  if (!cek.ok) return cek.respon;

  var t = _tabel('Event');
  var n = _cari(t, 'id', idEvent);
  if (n === -1) return _respon('error', null, 'Event tidak ditemukan');

  if (String(_nilai(t, n, 'status_approval')) !== 'pending') {
    return _respon('error', null, 'Event ini sudah diproses, tidak bisa dibatalkan');
  }

  var nama = _nilai(t, n, 'nama_event');
  t.sheet.deleteRow(n + 2);
  _log(cek.user, 'BATAL_EVENT', 'Membatalkan event ' + nama);
  return _respon('success', { id: idEvent }, 'Event berhasil dibatalkan');
}


/* ========================== 22. approveEvent ============================== */

/** Kepala Sekolah menyetujui atau menolak event. */
function approveEvent(idEvent, status, token) {
  var cek = _wajibRole(token, ['kepsek']);
  if (!cek.ok) return cek.respon;

  var statusBaru = String(status).toLowerCase();
  if (statusBaru !== 'approved' && statusBaru !== 'rejected') {
    return _respon('error', null, 'Status harus "approved" atau "rejected"');
  }

  var t = _tabel('Event');
  var n = _cari(t, 'id', idEvent);
  if (n === -1) return _respon('error', null, 'Event tidak ditemukan');

  _tulis(t, n, 'status_approval', statusBaru);
  _logApproval('event', idEvent, statusBaru, cek.user.id, 'Event diproses Kepala Sekolah');
  _log(cek.user, 'APPROVE_EVENT', 'Event ' + _nilai(t, n, 'nama_event') + ' -> ' + statusBaru);

  return _respon('success', { id: idEvent, status: statusBaru },
    statusBaru === 'approved' ? 'Event disetujui' : 'Event ditolak');
}


/* ============================ 23. getArsip ================================ */

/**
 * Ambil daftar dokumen arsip.
 * Hak akses disaring di sini: dokumen bertanda "kepsek_ktu" tidak akan
 * pernah terkirim ke guru maupun wali murid.
 */
function getArsip(filter, token) {
  var cek = _wajibRole(token, []);
  if (!cek.ok) return cek.respon;

  filter = filter || {};
  var role = String(cek.user.role).trim().toLowerCase();
  var cari = String(filter.cari || '').trim().toLowerCase();

  var daftar = _semuaObjek(_tabel('Arsip')).filter(function (d) {
    if (filter.kategori && String(d.kategori) !== String(filter.kategori)) return false;
    if (cari && String(d.judul).toLowerCase().indexOf(cari) === -1) return false;

    var akses = String(d.akses || 'semua');
    if (akses === 'semua') return true;
    if (akses === 'guru_karyawan') return ['guru', 'bendahara', 'ktu', 'kepsek'].indexOf(role) > -1;
    if (akses === 'kepsek_ktu') return ['kepsek', 'ktu'].indexOf(role) > -1;
    return false;
  });

  // Unggahan terbaru di atas
  daftar.sort(function (a, b) { return new Date(b.tgl_upload) - new Date(a.tgl_upload); });
  return _respon('success', daftar, 'Daftar arsip berhasil diambil (' + daftar.length + ')');
}


/* =========================== 24. simpanArsip ============================== */

/**
 * Simpan satu dokumen arsip.
 * Berkasnya sendiri tidak diunggah, yang dicatat hanya nama berkasnya,
 * mengikuti perilaku modul di frontend.
 */
function simpanArsip(data, token) {
  var cek = _wajibRole(token, ['ktu']);
  if (!cek.ok) return cek.respon;

  data = data || {};
  if (!data.judul) return _respon('error', null, 'Judul dokumen wajib diisi');
  if (!data.kategori) return _respon('error', null, 'Kategori wajib dipilih');
  if (!data.nama_file) return _respon('error', null, 'Nama berkas wajib diisi');
  if (!data.akses) return _respon('error', null, 'Hak akses wajib dipilih');

  var t = _tabel('Arsip');
  var idBaru = _idBaru(t);

  _tambah(t, {
    id: idBaru,
    judul: data.judul,
    kategori: data.kategori,
    nama_file: data.nama_file,
    ukuran: data.ukuran || '-',
    akses: data.akses,
    keterangan: data.keterangan || '',
    diupload_oleh: cek.user.nama,
    tgl_upload: new Date()
  });

  _log(cek.user, 'UPLOAD_ARSIP', 'Mengunggah dokumen ' + data.judul);
  return _respon('success', { id: idBaru }, 'Dokumen berhasil diupload');
}


/* =========================== 25. hapusArsip =============================== */

/** Hapus satu dokumen arsip. */
function hapusArsip(idArsip, token) {
  var cek = _wajibRole(token, ['ktu']);
  if (!cek.ok) return cek.respon;

  var t = _tabel('Arsip');
  var n = _cari(t, 'id', idArsip);
  if (n === -1) return _respon('error', null, 'Dokumen tidak ditemukan');

  var judul = _nilai(t, n, 'judul');
  t.sheet.deleteRow(n + 2);
  _log(cek.user, 'HAPUS_ARSIP', 'Menghapus dokumen ' + judul);
  return _respon('success', { id: idArsip }, 'Dokumen berhasil dihapus');
}


/* ====================== 26. getPermohonanWali ============================= */

/**
 * Ambil permohonan perubahan data wali murid.
 * Wali murid hanya boleh melihat permohonannya sendiri, pembatasannya
 * dihitung dari token supaya tidak bisa ditembus dari peramban.
 */
function getPermohonanWali(filter, token) {
  var cek = _wajibRole(token, ['ktu', 'walimurid']);
  if (!cek.ok) return cek.respon;

  filter = filter || {};
  var role = String(cek.user.role).trim().toLowerCase();

  var daftar = _semuaObjek(_tabel('Permohonan_Wali')).filter(function (p) {
    if (role === 'walimurid' && String(p.id_user) !== String(cek.user.id)) return false;
    return _cocok(p, { status: filter.status, id_user: filter.id_user });
  });

  daftar.sort(function (a, b) {
    return new Date(b.tgl_permohonan) - new Date(a.tgl_permohonan);
  });
  return _respon('success', daftar, 'Daftar permohonan berhasil diambil (' + daftar.length + ')');
}


/* ===================== 27. ajukanPerubahanWali ============================ */

/**
 * Wali murid mengajukan perubahan data dirinya.
 * Nilai LAMA dibaca backend dari sheet Users, tidak dipercayakan ke frontend,
 * supaya riwayat permohonannya tidak bisa dipalsukan.
 */
function ajukanPerubahanWali(data, token) {
  var cek = _wajibRole(token, ['walimurid']);
  if (!cek.ok) return cek.respon;

  data = data || {};
  var tU = _tabel('Users');
  var nU = _cari(tU, 'id', cek.user.id);
  if (nU === -1) return _respon('error', null, 'Akun tidak ditemukan');

  var punyaHp = tU.header.indexOf('no_hp') !== -1;
  var punyaAlamat = tU.header.indexOf('alamat') !== -1;

  var emailLama = String(_nilai(tU, nU, 'email') || '');
  var hpLama = punyaHp ? String(_nilai(tU, nU, 'no_hp') || '') : '';
  var alamatLama = punyaAlamat ? String(_nilai(tU, nU, 'alamat') || '') : '';

  // Kolom yang dikosongkan berarti tetap seperti sekarang
  var emailBaru = String(data.email_baru || '').trim() || emailLama;
  var hpBaru = String(data.no_hp_baru || '').trim() || hpLama;
  var alamatBaru = String(data.alamat_baru || '').trim() || alamatLama;

  if (emailBaru === emailLama && hpBaru === hpLama && alamatBaru === alamatLama) {
    return _respon('error', null, 'Tidak ada data yang berubah');
  }

  var t = _tabel('Permohonan_Wali');
  var idBaru = _idBaru(t);

  _tambah(t, {
    id: idBaru,
    id_user: cek.user.id,
    nama: cek.user.nama,
    email_lama: emailLama, email_baru: emailBaru,
    no_hp_lama: hpLama, no_hp_baru: hpBaru,
    alamat_lama: alamatLama, alamat_baru: alamatBaru,
    status: 'pending',
    tgl_permohonan: new Date(),
    approved_by: '',
    tgl_approve: ''
  });

  _logApproval('data_wali', idBaru, 'pending', cek.user.id, 'Permohonan perubahan data diri');
  _log(cek.user, 'AJUKAN_PERUBAHAN', 'Mengajukan perubahan data diri');
  return _respon('success', { id: idBaru },
    'Permohonan perubahan data dikirim. Menunggu persetujuan KTU.');
}


/* ==================== 28. prosesPermohonanWali ============================ */

/**
 * KTU menyetujui atau menolak permohonan perubahan data.
 * Bila disetujui, kolom yang berubah ikut ditulis ke sheet Users.
 * Email dipakai untuk login, jadi kembarnya diperiksa lebih dulu.
 */
function prosesPermohonanWali(idPermohonan, status, token) {
  var cek = _wajibRole(token, ['ktu']);
  if (!cek.ok) return cek.respon;

  var statusBaru = String(status).toLowerCase();
  if (statusBaru !== 'approved' && statusBaru !== 'rejected') {
    return _respon('error', null, 'Status harus "approved" atau "rejected"');
  }

  var t = _tabel('Permohonan_Wali');
  var n = _cari(t, 'id', idPermohonan);
  if (n === -1) return _respon('error', null, 'Permohonan tidak ditemukan');
  if (String(_nilai(t, n, 'status')) !== 'pending') {
    return _respon('error', null, 'Permohonan ini sudah diproses');
  }

  var idUser = _nilai(t, n, 'id_user');
  var nama = _nilai(t, n, 'nama');

  if (statusBaru === 'approved') {
    var tU = _tabel('Users');
    var nU = _cari(tU, 'id', idUser);
    if (nU === -1) return _respon('error', null, 'Akun wali murid tidak ditemukan');

    var pasangan = [
      { lama: 'email_lama', baru: 'email_baru', simpan: 'email' },
      { lama: 'no_hp_lama', baru: 'no_hp_baru', simpan: 'no_hp' },
      { lama: 'alamat_lama', baru: 'alamat_baru', simpan: 'alamat' }
    ];

    // Email baru tidak boleh sama dengan akun lain
    var emailBaru = String(_nilai(t, n, 'email_baru') || '').trim();
    if (emailBaru && emailBaru !== String(_nilai(t, n, 'email_lama') || '').trim()) {
      var kEmail = _kol(tU, 'email');
      var kIdU = _kol(tU, 'id');
      for (var i = 0; i < tU.baris.length; i++) {
        if (String(tU.baris[i][kIdU]) === String(idUser)) continue;
        if (String(tU.baris[i][kEmail]).trim().toLowerCase() === emailBaru.toLowerCase()) {
          return _respon('error', null, 'Email ' + emailBaru + ' sudah dipakai akun lain');
        }
      }
    }

    // Hanya kolom yang benar-benar berubah yang ditimpa
    pasangan.forEach(function (p) {
      if (tU.header.indexOf(p.simpan) === -1) return;
      var lama = String(_nilai(t, n, p.lama) || '').trim();
      var baru = String(_nilai(t, n, p.baru) || '').trim();
      if (baru !== '' && baru !== lama) _tulis(tU, nU, p.simpan, baru);
    });
  }

  _tulis(t, n, 'status', statusBaru);
  _tulis(t, n, 'approved_by', cek.user.nama);
  _tulis(t, n, 'tgl_approve', new Date());

  _logApproval('data_wali', idPermohonan, statusBaru, cek.user.id, 'Permohonan diproses KTU');
  _log(cek.user, 'PROSES_PERMOHONAN', 'Permohonan ' + nama + ' -> ' + statusBaru);

  return _respon('success', { id: idPermohonan, status: statusBaru },
    statusBaru === 'approved' ? 'Perubahan data ' + nama + ' disetujui'
                              : 'Permohonan ' + nama + ' ditolak');
}


/* ============================ 29. gantiPin ================================ */

/**
 * Pengguna mengganti PIN-nya sendiri.
 * Berbeda dari resetPin yang dipakai Kepala Sekolah untuk mereset PIN orang lain.
 */
function gantiPin(pinLama, pinBaru, token) {
  var cek = _wajibRole(token, []);
  if (!cek.ok) return cek.respon;

  if (!pinLama) return _respon('error', null, 'PIN lama wajib diisi');
  if (!pinBaru) return _respon('error', null, 'PIN baru wajib diisi');
  if (!/^\d{6}$/.test(String(pinBaru))) {
    return _respon('error', null, 'PIN baru harus 6 digit angka');
  }
  if (String(pinLama) === String(pinBaru)) {
    return _respon('error', null, 'PIN baru tidak boleh sama dengan PIN lama');
  }

  var t = _tabel('Users');
  var n = _cari(t, 'id', cek.user.id);
  if (n === -1) return _respon('error', null, 'Akun tidak ditemukan');

  if (String(_nilai(t, n, 'pin')) !== _hashPin(pinLama)) {
    _log(cek.user, 'GANTI_PIN_GAGAL', 'PIN lama tidak sesuai');
    return _respon('error', null, 'PIN lama tidak sesuai');
  }

  _tulis(t, n, 'pin', _hashPin(pinBaru));
  _log(cek.user, 'GANTI_PIN', 'Mengganti PIN sendiri');
  return _respon('success', null, 'PIN berhasil diubah');
}


/* ==================== 30. approvePembayaranKTU ============================ */

/**
 * KTU memproses pembayaran siswa yang dicatat Bendahara.
 * Disetujui berarti diteruskan ke Kepala Sekolah, bukan langsung lunas.
 */
function approvePembayaranKTU(transaksiId, status, token) {
  var cek = _wajibRole(token, ['ktu']);
  if (!cek.ok) return cek.respon;

  var statusBaru = String(status).toLowerCase();
  if (statusBaru !== 'approved' && statusBaru !== 'rejected') {
    return _respon('error', null, 'Status harus "approved" atau "rejected"');
  }

  var t = _tabel('Transaksi_Keuangan');
  var n = _cari(t, 'id', transaksiId);
  if (n === -1) return _respon('error', null, 'Transaksi tidak ditemukan');

  if (String(_nilai(t, n, 'status_approval')) !== 'pending_KTU') {
    return _respon('error', null, 'Transaksi ini sudah diproses');
  }

  var tujuan = (statusBaru === 'approved') ? 'pending_Kepsek' : 'rejected';
  _tulis(t, n, 'status_approval', tujuan);

  _logApproval('transaksi', transaksiId, tujuan, cek.user.id, 'Pembayaran diproses KTU');
  _log(cek.user, 'APPROVE_PEMBAYARAN_KTU', 'Transaksi id ' + transaksiId + ' -> ' + tujuan);

  return _respon('success', { id: transaksiId, status_approval: tujuan },
    statusBaru === 'approved' ? 'Pembayaran disetujui. Diteruskan ke Kepala Sekolah.'
                              : 'Pembayaran ditolak');
}


/* ========================= 31a. getKonfigurasi ============================ */

/** Ambil seluruh konfigurasi sebagai objek { kunci: nilai }. */
function getKonfigurasi(token) {
  var cek = _wajibRole(token, []);
  if (!cek.ok) return cek.respon;

  var hasil = {};
  try {
    var t = _tabel('Konfigurasi');
    var kK = _kol(t, 'kunci');
    var kN = _kol(t, 'nilai');
    t.baris.forEach(function (r) {
      if (String(r[kK]).trim() !== '') hasil[String(r[kK]).trim()] = r[kN];
    });
  } catch (err) {
    // Sheet Konfigurasi belum ada: kembalikan objek kosong, bukan error
  }

  return _respon('success', hasil, 'Konfigurasi berhasil diambil');
}


/* ======================== 31b. simpanKonfigurasi ========================== */

/** Simpan satu nilai konfigurasi. Kunci baru ditambahkan, yang ada ditimpa. */
function simpanKonfigurasi(kunci, nilai, token) {
  var cek = _wajibRole(token, ['kepsek']);
  if (!cek.ok) return cek.respon;

  if (!kunci) return _respon('error', null, 'Kunci konfigurasi wajib diisi');

  var t = _tabel('Konfigurasi');
  var n = _cari(t, 'kunci', kunci);

  if (n === -1) {
    _tambah(t, { kunci: kunci, nilai: nilai });
  } else {
    _tulis(t, n, 'nilai', nilai);
  }

  _log(cek.user, 'UBAH_KONFIGURASI', 'Mengubah ' + kunci + ' menjadi ' + nilai);
  return _respon('success', { kunci: kunci, nilai: nilai }, 'Konfigurasi berhasil disimpan');
}


/* ==========================================================================
 *  PRIORITAS 3 — 11 AKSI UNTUK ROLE GURU DAN PELAPORAN
 * --------------------------------------------------------------------------
 *  Sebelumnya role Guru hanya punya tiga aksi tulis (absenGuru, simpanRPP,
 *  inputNilai) tanpa satu pun aksi baca. Bagian ini menutupnya, sekaligus
 *  melengkapi pembatalan dan laporan.
 * ========================================================================== */


/* ======================== 32. getAbsensiGuru ============================== */

/**
 * Riwayat kehadiran mengajar. Guru hanya boleh melihat miliknya sendiri,
 * Kepala Sekolah boleh melihat semuanya.
 */
function getAbsensiGuru(filter, token) {
  var cek = _wajibRole(token, ['guru', 'kepsek', 'ktu']);
  if (!cek.ok) return cek.respon;

  filter = filter || {};
  var role = String(cek.user.role).trim().toLowerCase();

  // Guru dikunci pada dirinya sendiri, apa pun yang dikirim frontend
  var idGuru = (role === 'guru') ? cek.user.id : filter.id_guru;

  var daftar = _semuaObjek(_tabel('Absensi_Mengajar')).filter(function (a) {
    if (idGuru && String(a.id_guru) !== String(idGuru)) return false;
    return _dalamRentang(a.tgl, filter.tgl_mulai, filter.tgl_akhir);
  }).map(function (a) {
    // jam_masuk/jam_keluar kena masalah yang sama dengan jadwal:
    // sheet menyimpannya sebagai nilai waktu, terbaca sebagai Date 1899
    a.jam_masuk = _jam(a.jam_masuk);
    a.jam_keluar = _jam(a.jam_keluar);
    return a;
  });

  // Terbaru di atas
  daftar.sort(function (a, b) { return new Date(b.tgl) - new Date(a.tgl); });
  return _respon('success', daftar, 'Riwayat absensi berhasil diambil (' + daftar.length + ')');
}


/* ============================= 33. getRPP ================================= */

/** Riwayat RPP. Guru dikunci pada miliknya sendiri. */
function getRPP(filter, token) {
  var cek = _wajibRole(token, ['guru', 'kepsek', 'ktu']);
  if (!cek.ok) return cek.respon;

  filter = filter || {};
  var role = String(cek.user.role).trim().toLowerCase();
  var idGuru = (role === 'guru') ? cek.user.id : filter.id_guru;

  var daftar = _semuaObjek(_tabel('RPP')).filter(function (r) {
    if (idGuru && String(r.id_guru) !== String(idGuru)) return false;
    if (!_cocok(r, { id_mapel: filter.id_mapel, id_kelas: filter.id_kelas })) return false;
    return _dalamRentang(r.tgl, filter.tgl_mulai, filter.tgl_akhir);
  });

  daftar.sort(function (a, b) { return new Date(b.tgl) - new Date(a.tgl); });
  return _respon('success', daftar, 'Daftar RPP berhasil diambil (' + daftar.length + ')');
}


/* ============================ 34. getNilai ================================ */

/**
 * Ambil nilai siswa.
 * Wali murid dikunci hanya pada nilai anaknya sendiri.
 */
function getNilai(filter, token) {
  var cek = _wajibRole(token, ['guru', 'kepsek', 'ktu', 'walimurid']);
  if (!cek.ok) return cek.respon;

  filter = filter || {};
  var role = String(cek.user.role).trim().toLowerCase();

  // Kumpulkan id anak bila yang meminta adalah wali murid
  var idAnak = null;
  if (role === 'walimurid') {
    var tS = _tabel('Siswa');
    var kW = _kol(tS, 'id_wali_murid');
    var kI = _kol(tS, 'id');
    idAnak = {};
    tS.baris.forEach(function (r) {
      if (String(r[kW]) === String(cek.user.id)) idAnak[String(r[kI])] = true;
    });
  }

  var daftar = _semuaObjek(_tabel('Nilai')).filter(function (n) {
    if (idAnak && !idAnak[String(n.id_siswa)]) return false;
    if (!_cocok(n, {
      id_siswa: filter.id_siswa,
      id_mapel: filter.id_mapel,
      id_guru: filter.id_guru,
      jenis: filter.jenis
    })) return false;
    return _dalamRentang(n.tgl, filter.tgl_mulai, filter.tgl_akhir);
  });

  daftar.sort(function (a, b) { return new Date(b.tgl) - new Date(a.tgl); });
  return _respon('success', daftar, 'Daftar nilai berhasil diambil (' + daftar.length + ')');
}


/* ======================== 35. inputNilaiBanyak ============================ */

/**
 * Simpan banyak nilai sekaligus dalam satu panggilan.
 *
 * inputNilai() yang lama hanya menyimpan satu baris. Satu kelas berisi 30
 * siswa berarti 30 panggilan bolak-balik; dengan satu panggilan memakan
 * tiga sampai empat detik, totalnya sekitar satu setengah menit.
 * Versi borongan ini menulis semuanya dalam sekali jalan.
 *
 * Seluruh baris diperiksa lebih dulu. Bila ada satu saja yang tidak sah,
 * TIDAK ADA yang disimpan, supaya tidak tersimpan separuh jalan.
 */
function inputNilaiBanyak(data, token) {
  var cek = _wajibRole(token, ['guru']);
  if (!cek.ok) return cek.respon;

  data = data || {};
  var jenis = String(data.jenis || '').toLowerCase();
  if (['harian', 'ujian', 'hafalan'].indexOf(jenis) === -1) {
    return _respon('error', null, 'Jenis nilai harus harian, ujian, atau hafalan');
  }
  if (!data.id_mapel) return _respon('error', null, 'id_mapel wajib diisi');

  var daftar = data.daftar;
  if (!daftar || !daftar.length) return _respon('error', null, 'Belum ada nilai yang diisi');

  // --- Periksa seluruhnya dulu ---
  var siap = [];
  for (var i = 0; i < daftar.length; i++) {
    var baris = daftar[i] || {};
    if (!baris.id_siswa) return _respon('error', null, 'Ada baris tanpa id_siswa');

    var angka = Number(baris.nilai);
    if (isNaN(angka) || angka < 0 || angka > 100) {
      return _respon('error', null,
        'Nilai untuk siswa id ' + baris.id_siswa + ' harus angka 0 sampai 100');
    }
    siap.push({ id_siswa: baris.id_siswa, nilai: angka });
  }

  // --- Baru ditulis setelah semuanya lolos ---
  var t = _tabel('Nilai');
  var idBerikut = _idBaru(t);
  var tgl = data.tgl ? new Date(data.tgl) : new Date();
  if (isNaN(tgl.getTime())) tgl = new Date();

  siap.forEach(function (x) {
    _tambah(t, {
      id: idBerikut,
      id_siswa: x.id_siswa,
      id_mapel: data.id_mapel,
      id_guru: cek.user.id,
      jenis: jenis,
      nilai: x.nilai,
      tgl: tgl
    });
    idBerikut++;
  });

  _log(cek.user, 'INPUT_NILAI_BANYAK',
    'Menyimpan ' + siap.length + ' nilai ' + jenis + ' untuk mapel id ' + data.id_mapel);
  return _respon('success', { jumlah: siap.length },
    siap.length + ' nilai berhasil disimpan');
}


/* ======================== 36. getJadwalHariIni ============================ */

/** Jadwal mengajar guru yang sedang masuk, untuk hari ini saja. */
function getJadwalHariIni(token) {
  var cek = _wajibRole(token, ['guru']);
  if (!cek.ok) return cek.respon;

  // getDay(): 0 = Minggu, sedangkan HARI_URUT dimulai dari Senin
  var urutan = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  var namaHari = urutan[new Date().getDay()];

  var daftar = _rapikanJam(_semuaObjek(_tabel('Jadwal_Pelajaran'))).filter(function (j) {
    return String(j.id_guru) === String(cek.user.id) && String(j.hari) === namaHari;
  });

  daftar.sort(function (a, b) {
    return String(a.jam_mulai).localeCompare(String(b.jam_mulai));
  });

  return _respon('success', { hari: namaHari, jadwal: daftar },
    'Jadwal hari ' + namaHari + ' berhasil diambil (' + daftar.length + ')');
}


/* ======================== 37. getAbsensiSiswa ============================= */

/**
 * Kehadiran siswa, dibaca dari sheet Absensi_Siswa yang terpisah dari
 * absensi mengajar guru. Wali murid dikunci hanya pada anaknya sendiri.
 */
function getAbsensiSiswa(filter, token) {
  var cek = _wajibRole(token, ['guru', 'kepsek', 'ktu', 'walimurid']);
  if (!cek.ok) return cek.respon;

  filter = filter || {};
  var role = String(cek.user.role).trim().toLowerCase();

  var idAnak = null;
  if (role === 'walimurid') {
    var tS = _tabel('Siswa');
    var kW = _kol(tS, 'id_wali_murid');
    var kI = _kol(tS, 'id');
    idAnak = {};
    tS.baris.forEach(function (r) {
      if (String(r[kW]) === String(cek.user.id)) idAnak[String(r[kI])] = true;
    });
  }

  var daftar = _semuaObjek(_tabel('Absensi_Siswa')).filter(function (a) {
    if (idAnak && !idAnak[String(a.id_siswa)]) return false;
    if (!_cocok(a, { id_siswa: filter.id_siswa, status: filter.status })) return false;
    return _dalamRentang(a.tgl, filter.tgl_mulai, filter.tgl_akhir);
  });

  // Dibaca kiri ke kanan menurut urutan hari, seperti tampilan di Data Anak
  daftar.sort(function (a, b) { return new Date(a.tgl) - new Date(b.tgl); });
  return _respon('success', daftar, 'Absensi siswa berhasil diambil (' + daftar.length + ')');
}


/* ======================== 38. getUsulanBiaya ============================== */

/** Riwayat usulan perubahan biaya, dibaca dari Approval_Log bertipe "biaya". */
function getUsulanBiaya(filter, token) {
  var cek = _wajibRole(token, ['bendahara', 'kepsek']);
  if (!cek.ok) return cek.respon;

  filter = filter || {};
  var daftar = _semuaObjek(_tabel('Approval_Log')).filter(function (a) {
    if (String(a.tipe) !== 'biaya') return false;
    return _cocok(a, { status: filter.status, id_item: filter.id_item });
  });

  daftar.sort(function (a, b) { return new Date(b.timestamp) - new Date(a.timestamp); });
  return _respon('success', daftar, 'Riwayat usulan biaya berhasil diambil (' + daftar.length + ')');
}


/* ====================== 39. approveUsulanBiaya ============================ */

/**
 * Kepala Sekolah memutuskan usulan perubahan biaya.
 * Bila disetujui, nominal pada sheet Biaya ikut diperbarui.
 */
function approveUsulanBiaya(idUsulan, status, nominalBaru, token) {
  var cek = _wajibRole(token, ['kepsek']);
  if (!cek.ok) return cek.respon;

  var statusBaru = String(status).toLowerCase();
  if (statusBaru !== 'approved' && statusBaru !== 'rejected') {
    return _respon('error', null, 'Status harus "approved" atau "rejected"');
  }

  var t = _tabel('Approval_Log');
  var n = _cari(t, 'id', idUsulan);
  if (n === -1) return _respon('error', null, 'Usulan tidak ditemukan');
  if (String(_nilai(t, n, 'tipe')) !== 'biaya') {
    return _respon('error', null, 'Catatan ini bukan usulan biaya');
  }
  if (String(_nilai(t, n, 'status')) !== 'pending') {
    return _respon('error', null, 'Usulan ini sudah diproses');
  }

  var idBiaya = _nilai(t, n, 'id_item');

  if (statusBaru === 'approved') {
    var nominal = Number(nominalBaru);
    if (!nominal || nominal <= 0) {
      return _respon('error', null, 'Nominal baru harus lebih dari 0');
    }

    var tB = _tabel('Biaya');
    var nB = _cari(tB, 'id', idBiaya);
    if (nB === -1) return _respon('error', null, 'Biaya terkait tidak ditemukan');

    _tulis(tB, nB, 'nominal_default', nominal);
  }

  _tulis(t, n, 'status', statusBaru);
  _tulis(t, n, 'oleh', cek.user.id);
  _log(cek.user, 'APPROVE_USULAN_BIAYA', 'Usulan biaya id ' + idUsulan + ' -> ' + statusBaru);

  return _respon('success', { id: idUsulan, status: statusBaru },
    statusBaru === 'approved' ? 'Usulan biaya disetujui dan nominal diperbarui'
                              : 'Usulan biaya ditolak');
}


/* ======================= 40. batalPengumuman ============================== */

/**
 * Batalkan pengumuman yang masih menunggu persetujuan.
 * Hanya pengirimnya sendiri yang boleh membatalkan.
 */
function batalPengumuman(idPengumuman, token) {
  var cek = _wajibRole(token, ['ktu', 'guru', 'bendahara']);
  if (!cek.ok) return cek.respon;

  var t = _tabel('Pengumuman');
  var n = _cari(t, 'id', idPengumuman);
  if (n === -1) return _respon('error', null, 'Pengumuman tidak ditemukan');

  if (String(_nilai(t, n, 'dari_id_user')) !== String(cek.user.id)) {
    return _respon('error', null, 'Hanya pengirimnya yang boleh membatalkan pengumuman ini');
  }

  var status = String(_nilai(t, n, 'status'));
  if (status !== 'pending' && status !== 'pending_KTU' && status !== 'pending_Kepsek') {
    return _respon('error', null, 'Pengumuman ini sudah diproses, tidak bisa dibatalkan');
  }

  t.sheet.deleteRow(n + 2);
  _log(cek.user, 'BATAL_PENGUMUMAN', 'Membatalkan pengumuman id ' + idPengumuman);
  return _respon('success', { id: idPengumuman }, 'Pengumuman berhasil dibatalkan');
}


/* ========================= 41. batalTransaksi ============================= */

/** Bendahara membatalkan transaksi yang belum diputus siapa pun. */
function batalTransaksi(idTransaksi, token) {
  var cek = _wajibRole(token, ['bendahara']);
  if (!cek.ok) return cek.respon;

  var t = _tabel('Transaksi_Keuangan');
  var n = _cari(t, 'id', idTransaksi);
  if (n === -1) return _respon('error', null, 'Transaksi tidak ditemukan');

  if (String(_nilai(t, n, 'id_pengaju')) !== String(cek.user.id)) {
    return _respon('error', null, 'Hanya pengaju yang boleh membatalkan transaksi ini');
  }

  var status = String(_nilai(t, n, 'status_approval'));
  if (status !== 'pending_KTU' && status !== 'pending_Kepsek') {
    return _respon('error', null, 'Transaksi yang sudah diputus tidak bisa dibatalkan');
  }

  t.sheet.deleteRow(n + 2);
  _log(cek.user, 'BATAL_TRANSAKSI', 'Membatalkan transaksi id ' + idTransaksi);
  return _respon('success', { id: idTransaksi }, 'Transaksi berhasil dibatalkan');
}


/* ======================= 42. getLaporanKinerja ============================ */

/**
 * Rekap kinerja pengajar dalam satu panggilan: jumlah kehadiran, jumlah RPP,
 * dan rata-rata nilai per guru.
 *
 * Dibuat menjadi satu aksi karena menyusunnya di frontend berarti tiga
 * panggilan terpisah, sekitar sepuluh detik hanya untuk membuka satu layar.
 */
function getLaporanKinerja(filter, token) {
  var cek = _wajibRole(token, ['kepsek']);
  if (!cek.ok) return cek.respon;

  filter = filter || {};

  // Daftar guru, digabung dengan penugasannya di sheet Guru
  var petaGuru = {};
  try {
    var tG = _tabel('Guru');
    var gUser = _kol(tG, 'id_user');
    var gJenis = _kol(tG, 'jenis');
    tG.baris.forEach(function (r) { petaGuru[String(r[gUser])] = r[gJenis]; });
  } catch (err) { /* sheet Guru belum terisi */ }

  var tU = _tabel('Users');
  var guru = _semuaObjek(tU).filter(function (u) {
    if (String(u.role).trim().toLowerCase() !== 'guru') return false;
    return !filter.id_guru || String(u.id) === String(filter.id_guru);
  });

  var absensi = _semuaObjek(_tabel('Absensi_Mengajar')).filter(function (a) {
    return _dalamRentang(a.tgl, filter.tgl_mulai, filter.tgl_akhir);
  });
  var rpp = _semuaObjek(_tabel('RPP')).filter(function (r) {
    return _dalamRentang(r.tgl, filter.tgl_mulai, filter.tgl_akhir);
  });
  var nilai = _semuaObjek(_tabel('Nilai')).filter(function (n) {
    return _dalamRentang(n.tgl, filter.tgl_mulai, filter.tgl_akhir);
  });

  var baris = guru.map(function (g) {
    var hadir = absensi.filter(function (a) {
      return String(a.id_guru) === String(g.id) &&
             String(a.status).toLowerCase() === 'hadir';
    }).length;

    var jumlahRpp = rpp.filter(function (r) {
      return String(r.id_guru) === String(g.id);
    }).length;

    var nilaiGuru = nilai.filter(function (n) {
      return String(n.id_guru) === String(g.id);
    }).map(function (n) { return Number(n.nilai); })
      .filter(function (x) { return !isNaN(x); });

    var rata = 0;
    if (nilaiGuru.length) {
      var jml = nilaiGuru.reduce(function (a, b) { return a + b; }, 0);
      rata = Math.round((jml / nilaiGuru.length) * 10) / 10;
    }

    return {
      id: g.id,
      nama: g.nama,
      jenis_guru: petaGuru[String(g.id)] || g.subrole || '',
      absensi_hadir: hadir,
      jumlah_rpp: jumlahRpp,
      jumlah_nilai: nilaiGuru.length,
      rata_nilai: rata
    };
  });

  // Ringkasan untuk kartu statistik di layar laporan
  var totalNilai = baris.reduce(function (a, b) { return a + b.jumlah_nilai; }, 0);
  var jumlahRata = baris.reduce(function (a, b) { return a + (b.rata_nilai * b.jumlah_nilai); }, 0);

  var ringkas = {
    total_hadir: baris.reduce(function (a, b) { return a + b.absensi_hadir; }, 0),
    total_rpp: baris.reduce(function (a, b) { return a + b.jumlah_rpp; }, 0),
    rata_semua: totalNilai ? Math.round((jumlahRata / totalNilai) * 10) / 10 : 0
  };

  _log(cek.user, 'LIHAT_LAPORAN_KINERJA', 'Membuka laporan kinerja (' + baris.length + ' guru)');
  return _respon('success', { ringkasan: ringkas, guru: baris },
    'Laporan kinerja berhasil disusun (' + baris.length + ' guru)');
}


/* ==========================================================================
 *  TAHAP 5 — AKSI GABUNGAN
 * --------------------------------------------------------------------------
 *  Satu panggilan Apps Script memakan 3-4 detik. Layar yang butuh empat
 *  sampai enam daftar sekaligus akan terasa menggantung belasan detik kalau
 *  tiap daftar diambil sendiri-sendiri. Tiga aksi di bawah membungkus
 *  panggilan-panggilan itu menjadi satu.
 *
 *  Dua aturan yang dipegang:
 *  1. Tidak ada logika baru. Semuanya memanggil aksi yang sudah ada, supaya
 *     bentuk data dan penjagaan role-nya persis sama dengan kalau dipanggil
 *     satu per satu. Frontend tidak perlu menulis dua cara membaca data.
 *  2. Kalau satu bagian gagal, seluruh respons dianggap gagal. Frontend
 *     tidak boleh menerima data setengah jadi tanpa sadar.
 * ========================================================================== */

/**
 * Ambil isi "data" dari beberapa respons sekaligus.
 * Hasilnya { ok: true, isi: {...} } bila semua sukses, atau
 * { ok: false, respon: <error> } begitu ada satu bagian yang gagal.
 */
function _rangkum(bagian) {
  var isi = {};
  var kunci = Object.keys(bagian);

  for (var i = 0; i < kunci.length; i++) {
    var nama = kunci[i];
    var r = bagian[nama];

    if (!r || r.status !== 'success') {
      var pesan = (r && r.message) ? r.message : 'tidak mengembalikan respons';
      return {
        ok: false,
        respon: _respon('error', null, 'Bagian "' + nama + '" gagal: ' + pesan)
      };
    }
    isi[nama] = r.data;
  }

  return { ok: true, isi: isi };
}


/* ========================= 38. getDataMaster ============================== */

/**
 * Bekal layar Data Master (Modul 6.4): users, siswa, kelas, mapel.
 * Menggantikan 4 panggilan terpisah yang totalnya sekitar 14 detik.
 *
 * Role dikunci kepsek/ktu mengikuti getUsers yang paling ketat di antara
 * keempat sub-aksinya. Tiap sub-aksi tetap memeriksa token sendiri; itu
 * menambah beberapa pembacaan sheet Users, tapi jauh lebih murah daripada
 * satu perjalanan jaringan, dan aturan role tetap ditulis di satu tempat.
 */
function getDataMaster(token) {
  var cek = _wajibRole(token, ['kepsek', 'ktu']);
  if (!cek.ok) return cek.respon;

  var hasil = _rangkum({
    users: getUsers(token),
    siswa: getSiswa({}, token),
    kelas: getKelas(token),
    mapel: getMapel(token)
  });
  if (!hasil.ok) return hasil.respon;

  var isi = hasil.isi;
  _log(cek.user, 'AMBIL_DATA_MASTER', 'Membuka Data Master dalam satu panggilan');

  return _respon('success', isi,
    'Data master berhasil diambil (' +
    isi.users.length + ' user, ' +
    isi.siswa.length + ' siswa, ' +
    isi.kelas.length + ' kelas, ' +
    isi.mapel.length + ' mapel)');
}


/* ======================== 39. getBekalDataAnak ============================ */

/**
 * Bekal layar Data Anak milik wali murid (Modul 7.1):
 * anak, kelas, mapel, jadwal, absensi, nilai.
 * Menggantikan 6 panggilan terpisah yang totalnya sekitar 21 detik.
 *
 * getSiswa sengaja TIDAK dipakai di sini karena penjagaan role-nya tidak
 * mengizinkan wali murid. Daftar anak diambil lewat getDataAnak yang memang
 * sudah mengunci hasilnya pada anak milik wali murid yang sedang masuk.
 * getAbsensiSiswa dan getNilai juga sudah mengunci dirinya sendiri.
 */
function getBekalDataAnak(token) {
  var cek = _wajibRole(token, ['walimurid']);
  if (!cek.ok) return cek.respon;

  var hasil = _rangkum({
    anak: getDataAnak(cek.user.id, token),
    kelas: getKelas(token),
    mapel: getMapel(token),
    jadwal: getJadwal({}, token),
    absensi: getAbsensiSiswa({}, token),
    nilai: getNilai({}, token)
  });
  if (!hasil.ok) return hasil.respon;

  var isi = hasil.isi;

  return _respon('success', isi,
    'Bekal data anak berhasil diambil (' +
    isi.anak.length + ' anak, ' +
    isi.nilai.length + ' nilai, ' +
    isi.absensi.length + ' absensi)');
}


/* ====================== 40. getBekalInputNilai ============================ */

/**
 * Bekal layar Input Nilai milik guru: mapel, kelas, siswa, nilai.
 * Menggantikan 4 panggilan terpisah yang totalnya sekitar 14 detik.
 *
 * Daftar siswa sengaja tidak disaring per kelas di sini supaya isinya sama
 * persis dengan hasil getSiswa bila dipanggil sendiri. Penyaringan kelas
 * tetap dikerjakan di layar, seperti sekarang.
 */
function getBekalInputNilai(token) {
  var cek = _wajibRole(token, ['guru']);
  if (!cek.ok) return cek.respon;

  var hasil = _rangkum({
    mapel: getMapel(token),
    kelas: getKelas(token),
    siswa: getSiswa({}, token),
    nilai: getNilai({}, token)
  });
  if (!hasil.ok) return hasil.respon;

  var isi = hasil.isi;

  return _respon('success', isi,
    'Bekal input nilai berhasil diambil (' +
    isi.mapel.length + ' mapel, ' +
    isi.kelas.length + ' kelas, ' +
    isi.siswa.length + ' siswa)');
}


/* =================== 34. Sinkronisasi Users dari Sheet ==================== */

/**
 * Kolom "pin" menyimpan sidik SHA-256, bukan angka PIN-nya. Karena itu PIN
 * yang diketik langsung di sheet tidak akan pernah cocok saat login.
 *
 * Fungsi di bawah ini menjembatani hal tersebut: baris yang PIN-nya masih
 * berupa 6 digit angka diubah menjadi sidiknya, dan baris baru yang belum
 * ber-id diberi nomor. Dijalankan lewat menu, bukan lewat doPost, sehingga
 * tidak mengubah perilaku web app dan tidak perlu deploy ulang.
 */

/** Pasang menu sendiri saat spreadsheet dibuka. */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('SIP Al-Bustomi')
    .addItem('Sinkronkan PIN & ID pengguna', 'sinkronkanUsers')
    .addToUi();
}

/** Sidik SHA-256 selalu 64 huruf heksadesimal. Selain itu dianggap masih mentah. */
function _sudahDiacak(nilai) {
  return /^[0-9a-f]{64}$/i.test(String(nilai).trim());
}

/**
 * Rapikan sheet Users: acak PIN yang masih mentah, isi id yang kosong,
 * dan laporkan baris yang belum siap dipakai.
 */
function sinkronkanUsers() {
  var t = _tabel('Users');
  var diacak = 0, diberiId = 0, sudahRapi = 0;
  var perhatian = [];
  var emailTerpakai = {};

  // Nomor disiapkan lebih dulu supaya id baru tidak saling bertabrakan
  var idBerikut = _idBaru(t);

  for (var n = 0; n < t.baris.length; n++) {
    var email = String(_nilai(t, n, 'email') || '').trim();
    if (!email) continue;                       // baris kosong di bawah data
    var barisSheet = n + 2;                     // +2 karena baris 1 header

    // Pencocokan email saat login membedakan huruf besar-kecil, jadi dua
    // baris yang hanya beda kapitalisasi tetap menjadi dua akun terpisah
    var kunci = email.toLowerCase();
    var sebelumnya = emailTerpakai[kunci];
    if (sebelumnya) {
      perhatian.push('Baris ' + barisSheet + ' (' + email + '): ' +
        (sebelumnya.email === email
          ? 'email persis sama dengan baris ' + sebelumnya.baris +
            '. Login hanya akan menemukan baris ' + sebelumnya.baris + '.'
          : 'email mirip baris ' + sebelumnya.baris + ' (' + sebelumnya.email + '), ' +
            'beda huruf besar-kecil saja. Keduanya jadi akun terpisah dan mudah tertukar.'));
    } else {
      emailTerpakai[kunci] = { baris: barisSheet, email: email };
    }

    if (String(_nilai(t, n, 'id') || '').trim() === '') {
      _tulis(t, n, 'id', idBerikut);
      idBerikut++;
      diberiId++;
    }

    if (!String(_nilai(t, n, 'role') || '').trim()) {
      perhatian.push('Baris ' + barisSheet + ' (' + email + '): kolom role masih kosong.');
    }

    // Akun dengan aktif kosong/FALSE ditolak saat login. Sengaja tidak
    // diaktifkan otomatis — mengaktifkan akun itu wewenang Kepala Sekolah.
    if (!_bool(_nilai(t, n, 'aktif'))) {
      perhatian.push('Baris ' + barisSheet + ' (' + email + '): kolom aktif belum TRUE, ' +
                     'akun ini belum bisa login.');
    }

    var pin = String(_nilai(t, n, 'pin') || '').trim();
    if (pin === '') {
      perhatian.push('Baris ' + barisSheet + ' (' + email + '): PIN masih kosong.');
      continue;
    }
    if (_sudahDiacak(pin)) { sudahRapi++; continue; }
    if (!/^\d{6}$/.test(pin)) {
      perhatian.push('Baris ' + barisSheet + ' (' + email + '): PIN harus 6 digit angka, ' +
                     'baris ini dilewati.');
      continue;
    }

    _tulis(t, n, 'pin', _hashPin(pin));
    diacak++;
  }

  var pesan = diacak + ' PIN diacak, ' + diberiId + ' id diisi, ' +
              sudahRapi + ' sudah rapi sejak awal.';
  if (perhatian.length) {
    pesan += '\n\nPerlu diperiksa:\n• ' + perhatian.join('\n• ');
  }

  // Selalu dicatat di log supaya tetap terbaca saat dijalankan dari editor,
  // tempat kotak dialog tidak selalu bisa muncul
  Logger.log(pesan);
  try {
    var ui = SpreadsheetApp.getUi();
    ui.alert('Sinkronisasi Users', pesan, ui.ButtonSet.OK);
  } catch (err) {
    // Tidak ada antarmuka: cukup lewat log
  }
  return pesan;
}
