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
  loadPgTarget();

  if (pengaturanInitialized) return;
  pengaturanInitialized = true;

  document.getElementById('formPengaturanEmail').addEventListener('submit', submitPengaturanEmail);
  document.getElementById('pgEmailSubject').addEventListener('input', updatePengaturanPreview);
  document.getElementById('pgEmailBody').addEventListener('input', updatePengaturanPreview);

  document.getElementById('btnSavePgTarget').addEventListener('click', submitPgTarget);
  document.getElementById('pgTargetRowsBody').addEventListener('paste', handlePgTargetPaste);
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

// ============================================================================
// TARGET VALUE STOCK (FACTORY MANAGER) — target TETAP per Plant (bukan per
// minggu, lihat handleGetValueStockTarget/handleSaveValueStockTarget di
// Code.gs), dipakai Dashboard buat itung % pencapaian di grafik Value Stock.
// Tabelnya cuma 3 baris tetap (VALUE_STOCK_PLANTS, dari js/dashboard.js —
// dashboard.js dimuat SEBELUM file ini di index.html jadi konstanta itu udah
// ada), tiap baris cuma kolom angka Target yang bisa diedit + di-paste
// langsung dari Excel (lihat handlePgTargetPaste).
// ============================================================================

async function loadPgTarget() {
  const tbody = document.getElementById('pgTargetRowsBody');
  try {
    const res = await Api.getValueStockTarget();
    const targets = (res && res.targets) || {};
    tbody.innerHTML = VALUE_STOCK_PLANTS.map((p) => `
      <tr class="vs-row">
        <td>Plant ${escapeHtml(p)}</td>
        <td><input type="text" inputmode="numeric" class="pg-target-input" data-plant="${escapeHtml(p)}" value="${targets[p] ? Math.round(targets[p]) : ''}" placeholder="0"></td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr class="empty-state"><td colspan="2">Gagal memuat target: ${escapeHtml(err.message)}</td></tr>`;
  }
}

// Ubah teks hasil paste jadi angka bulat — nerima format umum yang mungkin
// kepaste dari Excel: angka polos ("1200000000"), format Indonesia
// ("1.200.000.000" atau "1.200.000.000,50"), atau ada prefix "Rp"/spasi.
function parsePgTargetNumber_(raw) {
  if (raw === undefined || raw === null) return null;
  let s = String(raw).trim().replace(/[^0-9.,\-]/g, '');
  if (!s) return null;
  if (s.indexOf(',') !== -1) {
    s = s.replace(/\./g, '').replace(',', '.'); // titik = ribuan, koma = desimal
  } else if (s.indexOf('.') !== -1) {
    s = s.replace(/\./g, ''); // cuma titik -> anggap ribuan (Value Stock selalu bulat)
  }
  const num = parseFloat(s);
  if (isNaN(num) || num < 0) return null;
  return Math.round(num);
}

// Paste 1 atau beberapa baris sekaligus (select range di Excel lalu Copy),
// mulai dari baris yang lagi difokus/dipaste, ngisi baris-baris Target di
// bawahnya berurutan — persis kelakuan paste-drag di Excel/Google Sheets.
// Kalau yang kepaste 2 kolom (mis. Plant + Value), dipakai kolom PALING
// KANAN tiap baris (asumsi itu kolom Value-nya).
function handlePgTargetPaste(e) {
  const input = e.target;
  if (!input.classList || !input.classList.contains('pg-target-input')) return;
  const text = (e.clipboardData || window.clipboardData).getData('text');
  if (!text) return;
  e.preventDefault();

  const allInputs = Array.from(document.querySelectorAll('#pgTargetRowsBody .pg-target-input'));
  const startIdx = allInputs.indexOf(input);
  const lines = text.split(/\r\n|\r|\n/).filter((l) => l.trim() !== '');
  lines.forEach((line, i) => {
    const targetInput = allInputs[startIdx + i];
    if (!targetInput) return; // lebih banyak baris kepaste daripada Plant yang ada -- sisanya dibuang
    const cells = line.split('\t').map((c) => c.trim());
    const num = parsePgTargetNumber_(cells[cells.length - 1]);
    if (num !== null) targetInput.value = num;
  });
}

async function submitPgTarget() {
  const inputs = Array.from(document.querySelectorAll('#pgTargetRowsBody .pg-target-input'));
  const targets = {};
  for (const inp of inputs) {
    const plant = inp.dataset.plant;
    const raw = inp.value.trim();
    if (raw === '') { targets[plant] = 0; continue; }
    const num = parsePgTargetNumber_(raw);
    if (num === null) {
      showToast('Target Plant ' + plant + ' harus angka & tidak boleh negatif.', 'error');
      return;
    }
    targets[plant] = num;
  }

  const btn = document.getElementById('btnSavePgTarget');
  btn.disabled = true;
  try {
    await Api.saveValueStockTarget({ targets });
    showToast('Target Value Stock tersimpan.', 'success');
  } catch (err) {
    showToast('Gagal menyimpan: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
  }
}
