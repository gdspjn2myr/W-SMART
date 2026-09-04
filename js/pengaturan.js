// ============================================================================
// PENGATURAN — halaman Admin-only: edit template email notif "barang pesanan
// sudah datang" yang dikirim otomatis ke Pemesan (tipe USER) begitu Barang
// Masuk disimpan (lihat js/penerimaan.js & sendPemesanNotificationEmail_ di
// Code.gs). Template disimpan di PropertiesService (backend), bukan sheet —
// cukup satu subjek + satu isi buat seluruh aplikasi.
// Pola sama dengan Kelola User/Master Data: pengaturanInitialized dicek
// sekali buat wiring event, isi form dimuat ulang tiap halaman ini dibuka.
// ============================================================================

let pengaturanInitialized = false;

// Data contoh buat pratinjau (bukan data asli) — biar Admin bisa lihat kira2
// hasil akhirnya sebelum disimpan, tanpa perlu kirim email beneran dulu.
const PG_PREVIEW_SAMPLE = {
  nama: 'Budi Santoso',
  daftarBarang: '- Bearing 6204 (SP-1023) x 5 pcs\n- Selang Hidrolik 1/2" (SP-2044) x 2 roll',
  noPO: 'PO-2026-0091',
  tanggal: '04/09/2026',
  plant: '1111',
  sloc: 'R01-A',
  keterangan: 'Catatan: dicek dulu sebelum dipakai'
};

function initPengaturanPage() {
  loadPengaturanEmail();

  if (pengaturanInitialized) return;
  pengaturanInitialized = true;

  document.getElementById('formPengaturanEmail').addEventListener('submit', submitPengaturanEmail);
  document.getElementById('pgEmailSubject').addEventListener('input', updatePengaturanPreview);
  document.getElementById('pgEmailBody').addEventListener('input', updatePengaturanPreview);
}

async function loadPengaturanEmail() {
  try {
    const res = await Api.getEmailTemplate();
    document.getElementById('pgEmailSubject').value = res.subject || '';
    document.getElementById('pgEmailBody').value = res.body || '';
    updatePengaturanPreview();
  } catch (err) {
    showToast('Gagal memuat template email: ' + err.message, 'error');
  }
}

// Ganti {{key}} pakai data contoh (PG_PREVIEW_SAMPLE) — persis logika
// renderEmailTemplate_ di Code.gs, tapi jalan di browser (nggak perlu round
// trip ke server cuma buat pratinjau).
function renderPengaturanPreview(template, data) {
  return String(template || '').replace(/\{\{(\w+)\}\}/g, (m, key) => {
    const val = data[key];
    return (val === undefined || val === null) ? '' : String(val);
  });
}

function updatePengaturanPreview() {
  const subjectTpl = document.getElementById('pgEmailSubject').value;
  const bodyTpl = document.getElementById('pgEmailBody').value;
  document.getElementById('pgPreviewSubject').textContent = renderPengaturanPreview(subjectTpl, PG_PREVIEW_SAMPLE) || '(subjek kosong)';
  document.getElementById('pgPreviewBody').textContent = renderPengaturanPreview(bodyTpl, PG_PREVIEW_SAMPLE) || '(isi kosong)';
}

async function submitPengaturanEmail(e) {
  e.preventDefault();
  const subject = document.getElementById('pgEmailSubject').value.trim();
  const body = document.getElementById('pgEmailBody').value.trim();
  if (!subject || !body) {
    showToast('Subjek & Isi email wajib diisi.', 'error');
    return;
  }

  const btn = document.getElementById('btnSavePengaturanEmail');
  btn.disabled = true;
  try {
    await Api.saveEmailTemplate({ subject, body });
    showToast('Template email tersimpan.', 'success');
  } catch (err) {
    showToast('Gagal menyimpan: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
  }
}
