// ============================================================================
// QR SCAN HELPER — baca QR code pakai kamera device, langsung pakai API
// bawaan browser (BarcodeDetector), TANPA library eksternal (biar PWA tetap
// ringan & bisa jalan offline). Dipakai di Put Away, Barang Keluar, Stock
// Opname, Pindah Bin, & Cek Barang buat baca kode barang/lokasi-bin.
//
// PENTING: scan itu PERCEPATAN, bukan keharusan — kalau browser/device tidak
// dukung (atau user tolak izin kamera), form tetap bisa diisi manual. Ini
// dipanggil lewat openQrScanner(onResult, onError) — onError(pesan) dipanggil
// kalau gagal/tidak didukung. onResult(kode, rawText) dipanggil begitu QR
// kebaca:
//  - kode: teks POLOS siap pakai (Kode Barang atau Kode Lokasi/Bin) — SAMA
//    PERSIS perilakunya kayak sebelum QR Barang "kaya data" (format WSB1,
//    lihat js/qr-payload.js) ada. Diekstrak PUSAT di sini (parseQrPayload)
//    supaya SEMUA pemanggil yang sudah ada (Put Away, Barang Keluar, Stock
//    Opname, Pindah Bin) TIDAK PERLU DIUBAH SAMA SEKALI — cukup pakai
//    argumen pertama seperti biasa, walau yang di-scan sekarang label WSB1
//    yang isinya jauh lebih panjang dari Kode Barang polos.
//  - rawText: teks HASIL SCAN ASLI, apa adanya (belum diproses) — dipakai
//    konsumen yang butuh detail lengkap label WSB1 (mis. Cek Barang, lihat
//    js/cek-barang.js), lewat parseQrPayload(rawText) sendiri. Pemanggil
//    lama yang cuma pakai argumen pertama otomatis aman (argumen ekstra di
//    JS diabaikan begitu saja kalau tidak dipakai).
// ============================================================================

let qrScanState = null; // { stream, video, active }

function isQrScanSupported() {
  return typeof window.BarcodeDetector !== 'undefined' &&
    !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
}

function openQrScanner(onResult, onError) {
  if (!isQrScanSupported()) {
    if (onError) onError('Scan QR tidak didukung di browser ini — silakan isi manual.');
    return;
  }

  const overlay = document.getElementById('qrScanOverlay');
  const video = document.getElementById('qrScanVideo');
  if (!overlay || !video) {
    if (onError) onError('Komponen scan tidak ditemukan.');
    return;
  }

  overlay.hidden = false;

  navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
    .then((stream) => {
      video.srcObject = stream;
      video.play().catch(() => {});

      let detector;
      try {
        detector = new window.BarcodeDetector({ formats: ['qr_code'] });
      } catch (e) {
        stream.getTracks().forEach((t) => t.stop());
        overlay.hidden = true;
        if (onError) onError('BarcodeDetector gagal diinisialisasi: ' + e.message);
        return;
      }

      qrScanState = { stream: stream, video: video, active: true };

      const tick = () => {
        if (!qrScanState || !qrScanState.active) return;
        detector.detect(video)
          .then((codes) => {
            if (!qrScanState || !qrScanState.active) return;
            if (codes && codes.length) {
              const value = codes[0].rawValue;
              closeQrScanner();
              // parseQrPayload (js/qr-payload.js) yang nentuin: label WSB1
              // (Barang "kaya data") -> kode-nya diekstrak; teks polos (label
              // lama, ATAU QR Bin yang memang selalu polos) -> apa adanya.
              // onResult SELALU dapat kode polos di argumen 1, berapa pun
              // panjang/formatnya isi asli yang ke-scan.
              const parsed = parseQrPayload(value);
              onResult(parsed.kode, value);
            } else {
              requestAnimationFrame(tick);
            }
          })
          .catch(() => {
            if (qrScanState && qrScanState.active) requestAnimationFrame(tick);
          });
      };
      requestAnimationFrame(tick);
    })
    .catch((err) => {
      overlay.hidden = true;
      if (onError) onError('Tidak bisa akses kamera: ' + err.message);
    });
}

function closeQrScanner() {
  if (qrScanState) {
    qrScanState.active = false;
    if (qrScanState.stream) qrScanState.stream.getTracks().forEach((t) => t.stop());
    if (qrScanState.video) qrScanState.video.srcObject = null;
  }
  qrScanState = null;
  const overlay = document.getElementById('qrScanOverlay');
  if (overlay) overlay.hidden = true;
}
