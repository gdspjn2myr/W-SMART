// ============================================================================
// QR PAYLOAD — format & parsing QR "kaya data" untuk label Barang. Permintaan
// user: "harusnya isi qr itu manampilkan semuanya" — QR Barang sekarang encode
// SEMUA detail label (bukan cuma Kode Barang polos lagi), supaya siapa pun
// yang scan (termasuk pakai app kamera biasa, di luar W-SMART) langsung dapat
// datanya, tanpa harus buka halaman lain dulu.
//
// Dipusatkan di 1 file supaya SEMUA titik yang scan QR (lewat openQrScanner di
// qr-scan.js) otomatis tetap dapat Kode Barang POLOS buat dipakai persis
// seperti sebelumnya oleh konsumen scan yang SUDAH ADA (Put Away, Barang
// Keluar, Stock Opname, Pindah Bin) — TIDAK SATU PUN dari halaman itu perlu
// diubah kodenya. Lihat openQrScanner di qr-scan.js: onResult sekarang
// dipanggil sebagai onResult(kodePolos, rawScanText) — konsumen lama yang
// cuma pakai argumen pertama (kodePolos) otomatis tetap benar; konsumen baru
// (Cek Barang, lihat js/cek-barang.js) yang butuh detail lengkapnya bisa parse
// ulang argumen kedua (rawScanText) sendiri lewat parseQrPayload di bawah.
//
// FORMAT (Barang): "WSB1|kode|namaBarang|noPO|vendor|sumber|plant|sloc|qty|satuan|tanggal|user"
//  - Prefix versi "WSB1" (W-SMART Barang, versi 1) — dipakai buat BEDAIN dari:
//    (a) label LAMA yang sudah dicetak SEBELUM fitur ini ada (teks Kode Barang
//        polos apa adanya) — HARUS TETAP kebaca normal selamanya (kompatibel
//        ke belakang, banyak label fisik yang sudah beredar di gudang), dan
//    (b) QR Bin/Lokasi — SENGAJA TETAP teks polos, TIDAK PERNAH diubah (lihat
//        generateQrBinLabels di qr-labels.js) — bin cuma butuh dikenali
//        sebagai lokasi, tidak ada "riwayat/detail" yang perlu nempel ke bin.
//  - Field dipisah karakter '|', urutan TETAP (lihat QR_PAYLOAD_FIELD_ORDER) —
//    field yang kosong tetap "ada tempatnya" (string kosong di antara 2 '|')
//    supaya field sesudahnya tidak ikut geser urutan.
//  - Karakter '|' yang (jarang) kebawa di isi field (mis. nama vendor aneh)
//    DIBUANG saat encode (bukan di-escape) — parsing tetap simpel & aman
//    (split biasa by '|'), lebih baik kehilangan 1 karakter langka daripada
//    parser jadi rumit & rawan bug.
//  - tanggal disimpan ringkas format ISO 'yyyy-mm-dd' di DALAM QR (beda dari
//    qrFormatTanggal di qr-labels.js yang ngubah ke 'DD/MM/YYYY' cuma buat
//    teks TAMPILAN di label, bukan isi QR-nya).
//
// KENAPA BUKAN JSON: jauh lebih boros karakter (nama field diulang tiap QR),
// padahal kepadatan/jumlah modul QR itu PENTING buat scan reliability — makin
// padat, makin gampang gagal-scan di kondisi gudang (label kecil, kamera HP
// biasa, jarak/sudut kurang ideal, print kadang buram). Delimited text jauh
// lebih hemat karakter -> QR tetap seringan mungkin buat data sebanyak ini.
// ============================================================================

const QR_BARANG_PREFIX = 'WSB1|';

// Urutan field WAJIB SAMA PERSIS di encode & decode (lihat encodeBarangQrPayload
// & parseQrPayload di bawah) — kalau nambah/ubah urutan field di sini, label
// yang SUDAH DICETAK sebelumnya jadi salah baca kalau di-parse ulang versi
// baru. Kalau suatu saat butuh ubah struktur, naikkan prefix jadi "WSB2|" dkk,
// JANGAN timpa "WSB1|" yang sudah dipegang label fisik yang beredar.
const QR_PAYLOAD_FIELD_ORDER = ['kode', 'namaBarang', 'noPO', 'vendor', 'sumber', 'plant', 'sloc', 'qty', 'satuan', 'tanggal', 'user'];

function qrSanitizePipeField_(v) {
  return String(v == null ? '' : v).replace(/\|/g, ' ').replace(/[\r\n]+/g, ' ').trim();
}

// 'yyyy-mm-dd' (string, dari <input type="date">) ATAU objek Date -> 'yyyy-mm-dd'
// ringkas buat disimpan DI DALAM QR. Beda dari qrFormatTanggal di qr-labels.js
// (itu buat teks TAMPILAN 'DD/MM/YYYY' di label, bukan isi QR-nya).
function qrPayloadDateIso_(v) {
  if (!v) return '';
  if (typeof v === 'string') {
    const m = v.match(/^(\d{4}-\d{2}-\d{2})/);
    if (m) return m[1];
    const d = new Date(v);
    return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
  }
  if (v instanceof Date && !isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  return '';
}

// lbl = hasil buildBarangLabel(...) di qr-labels.js. Return string yang jadi
// ISI QR-nya (bukan teks tampilan di sebelah QR — itu tetap qrLabelDetailRowsHtml).
// SELALU dibungkus format WSB1 walau lbl-nya cuma punya kode+namaBarang (tanpa
// detail lain) — biar 1 format konsisten dipakai semua label Barang, gampang
// di-maintain (bin TETAP beda, lihat generateQrBinLabels — TIDAK lewat sini).
function encodeBarangQrPayload(lbl) {
  const parts = QR_PAYLOAD_FIELD_ORDER.map((key) => {
    // buildBarangLabel (qr-labels.js) menyimpan Kode Barang di properti
    // `.code` (bukan `.kode`) — field WIRE-nya tetap dinamai 'kode' (lebih
    // jelas dibaca di parseQrPayload/detail), jadi di-map manual di sini.
    let v = key === 'kode' ? lbl.code : lbl[key];
    if (key === 'tanggal') v = qrPayloadDateIso_(v);
    return qrSanitizePipeField_(v);
  });
  return QR_BARANG_PREFIX + parts.join('|');
}

// raw = teks HASIL SCAN apa adanya (rawValue dari BarcodeDetector). Selalu
// balikin { kode, isRich, detail }:
//  - kode: SELALU ada & SELALU "bersih" — siap dipakai langsung sebagai Kode
//    Barang ATAU Kode Lokasi/Bin oleh konsumen manapun, PERSIS seperti
//    sebelum fitur ini ada (lihat pemakaiannya di openQrScanner, qr-scan.js).
//  - isRich: true kalau formatnya WSB1 (label Barang baru, kaya data).
//  - detail: object semua field (lihat QR_PAYLOAD_FIELD_ORDER) kalau isRich
//    true; null kalau bukan (label lama ATAU QR Bin — dua-duanya sama-sama
//    teks polos, tidak dibedakan di sini karena memang tidak perlu).
function parseQrPayload(raw) {
  const text = String(raw == null ? '' : raw).trim();
  if (text.indexOf(QR_BARANG_PREFIX) === 0) {
    const rest = text.slice(QR_BARANG_PREFIX.length);
    const values = rest.split('|');
    const detail = {};
    QR_PAYLOAD_FIELD_ORDER.forEach((key, i) => { detail[key] = values[i] || ''; });
    return { kode: detail.kode, isRich: true, detail: detail };
  }
  return { kode: text, isRich: false, detail: null };
}
