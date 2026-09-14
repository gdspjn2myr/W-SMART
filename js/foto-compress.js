// ============================================================================
// KOMPRESI FOTO DI BROWSER — sebelum diupload ke handleUploadFotoSpk (Code.gs)
// via Api.uploadFotoSpk. Di-resize maks 1280px di sisi terpanjang & disimpan
// ulang sebagai JPEG kualitas 0.72 — cukup buat dokumentasi SPK, jauh lebih
// kecil dari foto asli kamera HP (bisa 3-8MB) supaya upload cepat & Google
// Drive-nya nggak penuh sia-sia. Dipakai di sini buat "Foto Selesai" (Staff/
// Admin, js/spk-online.js) — file yang SAMA PERSIS dipakai juga di repo
// Reservasi-SP-online buat "Foto Sebelum" (User), sengaja disalin apa adanya
// biar perilakunya identik di dua tempat.
// ============================================================================

const FOTO_MAX_DIMENSI = 1280;
const FOTO_JPEG_QUALITY = 0.72;

function kompresFotoUntukUpload(file) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type || file.type.indexOf('image/') !== 0) {
      reject(new Error('File yang dipilih bukan gambar.'));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Gagal membaca file gambar.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Gagal memuat gambar.'));
      img.onload = () => {
        let { width, height } = img;
        if (width > FOTO_MAX_DIMENSI || height > FOTO_MAX_DIMENSI) {
          if (width >= height) {
            height = Math.round(height * (FOTO_MAX_DIMENSI / width));
            width = FOTO_MAX_DIMENSI;
          } else {
            width = Math.round(width * (FOTO_MAX_DIMENSI / height));
            height = FOTO_MAX_DIMENSI;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', FOTO_JPEG_QUALITY);
        const base64 = dataUrl.split(',')[1];
        resolve({ base64: base64, mimeType: 'image/jpeg', previewUrl: dataUrl });
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
