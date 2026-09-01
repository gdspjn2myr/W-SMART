// ============================================================================
// QR SCAN HELPER — baca QR code pakai kamera device, langsung pakai API
// bawaan browser (BarcodeDetector), TANPA library eksternal (biar PWA tetap
// ringan & bisa jalan offline). Dipakai di Put Away & Barang Keluar buat baca
// kode lokasi/bin.
//
// PENTING: scan itu PERCEPATAN, bukan keharusan — kalau browser/device tidak
// dukung (atau user tolak izin kamera), form tetap bisa diisi manual. Ini
// dipanggil lewat openQrScanner(onResult, onError) — onResult(text) dipanggil
// begitu QR kebaca, onError(pesan) dipanggil kalau gagal/tidak didukung.
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
              onResult(value);
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
