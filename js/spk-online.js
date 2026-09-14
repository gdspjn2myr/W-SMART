// ============================================================================
// SPK ONLINE (Staff/Admin) — daftar SPK yang diajukan user dari repo terpisah
// "Reservasi-SP-online" (departemen GDPM/GDSP/GDFG/GDRM), dikelola dari SINI:
//   Menunggu Approval -> (OK+Target Tanggal / Tolak+alasan / Hold+alasan)
//   Open -> (mulai kerja) -> Onproses -> (tutup) -> Closed
//   Hold bisa di-decide ULANG kapan saja (OK/Tolak lagi) oleh Staff/Admin manapun.
// Semua aksi (keputusan, feedback, update harian, mulai onproses, tutup SPK)
// dilakukan lewat 1 modal detail dinamis (#spkDetailModal) — isinya dibangun
// ulang tiap kali lewat renderSpkDetailBody() tergantung status SPK & UI-state
// lokal (spkDetailUiState), BUKAN banyak modal terpisah kayak Kelola User,
// supaya alur "buka detail -> pilih aksi -> isi form kecil -> submit" tetap
// dalam SATU popup (SPK ini punya banyak kemungkinan aksi tergantung status).
// ============================================================================

let spkInitialized = false;
let spkData = [];
let spkLogCache = [];
let spkCurrentItem = null;
let spkDetailUiState = 'view'; // 'view' | 'decide-OK' | 'decide-Tolak' | 'decide-Hold' | 'feedback' | 'update' | 'close'
let spkCloseFotoUrl = '';
let spkCloseFotoPreview = '';
let spkCloseUploading = false;
let spkCloseRequestId = generateClientRequestId();
let spkCreateForCloseId = null; // dipakai withIdempotency_ closeSpk

const SPK_ELIGIBLE_DEPT_ = ['GDPM', 'GDSP', 'GDFG', 'GDRM'];

const SPK_STATUS_PILL_CLASS = {
  'Menunggu Approval': 'status-menunggu',
  'Open': 'status-open',
  'Hold': 'status-hold',
  'Onproses': 'status-onproses',
  'Closed': 'status-closed',
  'Ditolak': 'status-ditolak'
};

function initSpkOnlinePage() {
  if (!spkInitialized) {
    spkInitialized = true;

    ['spkStatusFilter', 'spkDeptFilter', 'spkJenisFilter'].forEach((id) => {
      document.getElementById(id).addEventListener('change', loadSpk);
    });
    document.getElementById('spkTelatOnly').addEventListener('change', loadSpk);
    wireRefreshButton('btnRefreshSpk', loadSpk);

    document.getElementById('spkList').addEventListener('click', (e) => {
      const item = e.target.closest('[data-id]');
      if (item) openSpkDetail(item.dataset.id);
    });
    document.getElementById('spkList').addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const item = e.target.closest('[data-id]');
      if (item) { e.preventDefault(); openSpkDetail(item.dataset.id); }
    });

    document.getElementById('btnCloseSpkDetailModal').addEventListener('click', closeSpkDetailModal);
    document.getElementById('spkDetailModalBackdrop').addEventListener('click', closeSpkDetailModal);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !document.getElementById('spkDetailModal').hidden) closeSpkDetailModal();
    });

    // Event delegation buat SEMUA tombol/aksi di dalam body detail — isinya
    // dibangun ulang tiap render, jadi listener dipasang sekali di container.
    const body = document.getElementById('spkDetailBody');
    body.addEventListener('click', handleSpkDetailClick);
    body.addEventListener('change', (e) => {
      if (e.target.id === 'spkCloseFotoInput') handleSpkCloseFotoChange(e);
    });
  }
  loadSpk();
}

async function loadSpk() {
  const wrap = document.getElementById('spkList');
  const payload = {
    status: document.getElementById('spkStatusFilter').value,
    departement: document.getElementById('spkDeptFilter').value,
    jenisPengerjaan: document.getElementById('spkJenisFilter').value
  };
  try {
    const res = await Api.getSpkList(payload);
    let data = res.data || [];
    if (document.getElementById('spkTelatOnly').checked) {
      data = data.filter((it) => it.telat);
    }
    spkData = data;
    renderSpkList();
  } catch (err) {
    wrap.innerHTML = `<div class="empty-state">Gagal memuat: ${escapeHtml(err.message)}</div>`;
  }
}

function spkJenisDetailText_(it) {
  return it.jenisPengerjaan === 'Perbaikan Unit'
    ? `${it.jenisUnit || '-'} · ${it.nomorUnit || '-'}`
    : `${it.namaItemFabrikasi || '-'} · ${it.area || '-'}`;
}

function renderSpkList() {
  const wrap = document.getElementById('spkList');
  document.getElementById('spkCount').textContent = spkData.length + ' SPK';
  if (!spkData.length) {
    wrap.innerHTML = '<div class="empty-state">Belum ada SPK yang cocok dengan filter ini.</div>';
    return;
  }
  wrap.innerHTML = spkData.map((it) => {
    const pillClass = SPK_STATUS_PILL_CLASS[it.status] || 'status-menunggu';
    return `
      <div class="md-item spk-list-item" role="button" tabindex="0" data-id="${escapeHtml(it.idSpk)}">
        <div class="md-item-main">
          <div class="md-item-title">
            <span class="status-pill ${pillClass}">${escapeHtml(it.status)}</span>
            ${it.telat ? '<span class="status-pill status-telat">Telat</span>' : ''}
            ${escapeHtml(it.idSpk)}
          </div>
          <div class="md-item-sub">${escapeHtml(it.namaUser)} · ${escapeHtml(it.departement || '-')} · ${escapeHtml(it.tanggalDibuat)}</div>
          <div class="md-item-sub">${escapeHtml(it.jenisPengerjaan)}: ${escapeHtml(spkJenisDetailText_(it))}</div>
          ${it.targetTanggalPengerjaan ? `<div class="item-meta-line">Target pengerjaan: ${escapeHtml(it.targetTanggalPengerjaan)}</div>` : ''}
        </div>
        <div class="md-item-actions"><span class="chevron">›</span></div>
      </div>`;
  }).join('');
}

// Ekstrak file ID dari URL Drive (hasil file.getUrl(), format .../d/<id>/view)
// supaya bisa ditampilkan sebagai <img> thumbnail — kalau formatnya beda/gagal
// di-parse, fallback ke link biasa (bukan gambar) di renderSpkDetailBody.
function driveThumbUrl_(url) {
  if (!url) return '';
  const m = String(url).match(/\/d\/([^/]+)/);
  return m ? `https://drive.google.com/thumbnail?id=${m[1]}&sz=w800` : '';
}

function openSpkDetail(idSpk) {
  const item = spkData.find((it) => it.idSpk === idSpk);
  if (!item) return;
  spkCurrentItem = item;
  spkDetailUiState = 'view';
  spkCloseFotoUrl = '';
  spkCloseFotoPreview = '';
  spkCloseUploading = false;
  spkCloseRequestId = generateClientRequestId();

  document.getElementById('spkDetailModalTitle').textContent = item.idSpk;
  document.getElementById('spkDetailBody').innerHTML = '<div class="empty-state">Memuat...</div>';
  document.getElementById('spkDetailModalBackdrop').hidden = false;
  document.getElementById('spkDetailModal').hidden = false;

  loadSpkLogAndRender(idSpk);
}

async function loadSpkLogAndRender(idSpk) {
  try {
    const res = await Api.getSpkLog({ idSpk });
    spkLogCache = res.data || [];
  } catch (err) {
    spkLogCache = [];
  }
  renderSpkDetailBody();
}

function closeSpkDetailModal() {
  document.getElementById('spkDetailModalBackdrop').hidden = true;
  document.getElementById('spkDetailModal').hidden = true;
  spkCurrentItem = null;
  spkDetailUiState = 'view';
}

const SPK_LOG_TIPE_LABEL_ = { 'Feedback Kebutuhan': 'Feedback Kebutuhan', 'Update Harian': 'Update Harian' };

function renderSpkLogTimeline_() {
  if (!spkLogCache.length) return '<div class="empty-state" style="padding:16px 4px;">Belum ada feedback/update.</div>';
  return spkLogCache.map((l) => `
    <div class="spk-log-item ${l.tipe === 'Feedback Kebutuhan' ? 'log-feedback' : ''}">
      <div class="spk-log-meta">${escapeHtml(SPK_LOG_TIPE_LABEL_[l.tipe] || l.tipe)} · ${escapeHtml(l.oleh)} · ${escapeHtml(l.tanggal)}</div>
      <div class="spk-log-isi">${escapeHtml(l.isi)}</div>
    </div>`).join('');
}

function renderSpkDetailBody() {
  const it = spkCurrentItem;
  if (!it) return;
  const pillClass = SPK_STATUS_PILL_CLASS[it.status] || 'status-menunggu';
  const thumbSebelum = driveThumbUrl_(it.fotoSebelum);
  const thumbSelesai = driveThumbUrl_(it.fotoSelesai);

  let infoHtml = `
    <div class="md-item-title" style="margin-bottom:8px;">
      <span class="status-pill ${pillClass}">${escapeHtml(it.status)}</span>
      ${it.telat ? '<span class="status-pill status-telat">Telat</span>' : ''}
    </div>
    <p class="hint-text" style="margin-top:0;">
      ${escapeHtml(it.namaUser)} · ${escapeHtml(it.departement || '-')} · diajukan ${escapeHtml(it.tanggalDibuat)}<br>
      <strong>${escapeHtml(it.jenisPengerjaan)}</strong> — ${escapeHtml(spkJenisDetailText_(it))}<br>
      ${escapeHtml(it.deskripsi)}
      ${it.targetTanggalPengerjaan ? '<br>Target Tanggal Pengerjaan: <strong>' + escapeHtml(it.targetTanggalPengerjaan) + '</strong>' : ''}
      ${(it.status === 'Ditolak' || it.status === 'Hold') && it.catatanApproval ? '<br>Catatan: ' + escapeHtml(it.catatanApproval) : ''}
      ${it.diprosesOleh ? '<br>Diproses oleh ' + escapeHtml(it.diprosesOleh) + (it.tanggalKeputusan ? ' · ' + escapeHtml(it.tanggalKeputusan) : '') : ''}
    </p>
    <div class="spk-foto-row">
      ${thumbSebelum ? `<a href="${escapeHtml(it.fotoSebelum)}" target="_blank" rel="noopener"><img src="${escapeHtml(thumbSebelum)}" class="foto-upload-preview" alt="Foto Sebelum"></a>` : (it.fotoSebelum ? `<a href="${escapeHtml(it.fotoSebelum)}" target="_blank" rel="noopener">Lihat Foto Sebelum</a>` : '')}
      ${thumbSelesai ? `<a href="${escapeHtml(it.fotoSelesai)}" target="_blank" rel="noopener"><img src="${escapeHtml(thumbSelesai)}" class="foto-upload-preview" alt="Foto Selesai"></a>` : (it.fotoSelesai ? `<a href="${escapeHtml(it.fotoSelesai)}" target="_blank" rel="noopener">Lihat Foto Selesai</a>` : '')}
    </div>`;

  let actionHtml = '';

  if (spkDetailUiState === 'decide-OK' && (it.status === 'Menunggu Approval' || it.status === 'Hold')) {
    actionHtml = `
      <div class="spk-action-box">
        <div class="form-row">
          <label>Target Tanggal Pengerjaan *</label>
          <input type="date" id="spkDecideTarget" required>
        </div>
        <div id="spkDecideError" class="form-error" hidden></div>
        <div class="spk-action-btn-row">
          <button type="button" class="btn-link" data-action="decide-cancel">Batal</button>
          <button type="button" class="btn btn-primary" data-action="decide-confirm" data-keputusan="OK">Setujui — Jadi Open</button>
        </div>
      </div>`;
  } else if ((spkDetailUiState === 'decide-Tolak' || spkDetailUiState === 'decide-Hold') && (it.status === 'Menunggu Approval' || it.status === 'Hold')) {
    const kp = spkDetailUiState === 'decide-Tolak' ? 'Tolak' : 'Hold';
    actionHtml = `
      <div class="spk-action-box">
        <div class="form-row">
          <label>Alasan / Feedback *</label>
          <textarea id="spkDecideCatatan" rows="3" placeholder="Wajib diisi"></textarea>
        </div>
        <div id="spkDecideError" class="form-error" hidden></div>
        <div class="spk-action-btn-row">
          <button type="button" class="btn-link" data-action="decide-cancel">Batal</button>
          <button type="button" class="btn ${kp === 'Tolak' ? 'btn-danger' : 'btn-primary'}" data-action="decide-confirm" data-keputusan="${kp}">${kp === 'Tolak' ? 'Tolak SPK' : 'Hold SPK'}</button>
        </div>
      </div>`;
  } else if (it.status === 'Menunggu Approval' || it.status === 'Hold') {
    actionHtml = `
      <div class="spk-action-btn-row">
        <button type="button" class="btn btn-small" data-action="decide" data-keputusan="Tolak">Tolak</button>
        <button type="button" class="btn btn-small" data-action="decide" data-keputusan="Hold">Hold</button>
        <button type="button" class="btn btn-small btn-primary" data-action="decide" data-keputusan="OK">Setujui (OK)</button>
      </div>`;
  } else if (spkDetailUiState === 'feedback' && it.status === 'Open') {
    actionHtml = `
      <div class="spk-action-box">
        <div class="form-row">
          <label>Feedback Kebutuhan (barang/alat yang dibutuhkan) *</label>
          <textarea id="spkFeedbackText" rows="3"></textarea>
        </div>
        <div id="spkFeedbackError" class="form-error" hidden></div>
        <div class="spk-action-btn-row">
          <button type="button" class="btn-link" data-action="feedback-cancel">Batal</button>
          <button type="button" class="btn btn-primary" data-action="feedback-submit">Kirim Feedback</button>
        </div>
      </div>`;
  } else if (spkDetailUiState === 'onproses-confirm' && it.status === 'Open') {
    // Konfirmasi INLINE (bukan showConfirmModal) SENGAJA — modal detail ini
    // sendiri sudah sebuah modal; menumpuk showConfirmModal di atasnya bikin
    // urutan DOM/z-index modal ketuker (tombol OK-nya ketutup konten modal
    // detail sendiri). Pola "konfirmasi inline" ini sudah dipakai buat
    // decide/close juga, jadi konsisten.
    actionHtml = `
      <div class="spk-action-box">
        <p class="hint-text" style="margin-top:0;">Mulai kerjakan SPK ini sekarang? Status akan berubah jadi Onproses.</p>
        <div class="spk-action-btn-row">
          <button type="button" class="btn-link" data-action="onproses-cancel">Batal</button>
          <button type="button" class="btn btn-primary" data-action="onproses-confirm">Mulai Onproses</button>
        </div>
      </div>`;
  } else if (it.status === 'Open') {
    actionHtml = `
      <div class="spk-action-btn-row">
        <button type="button" class="btn btn-small" data-action="feedback-toggle">+ Tambah Feedback</button>
        <button type="button" class="btn btn-small btn-primary" data-action="onproses-start">Mulai Onproses</button>
      </div>`;
  } else if (spkDetailUiState === 'update' && it.status === 'Onproses') {
    actionHtml = `
      <div class="spk-action-box">
        <div class="form-row">
          <label>Update Harian (progres pengerjaan hari ini) *</label>
          <textarea id="spkUpdateText" rows="3"></textarea>
        </div>
        <div id="spkUpdateError" class="form-error" hidden></div>
        <div class="spk-action-btn-row">
          <button type="button" class="btn-link" data-action="update-cancel">Batal</button>
          <button type="button" class="btn btn-primary" data-action="update-submit">Kirim Update</button>
        </div>
      </div>`;
  } else if (spkDetailUiState === 'close' && it.status === 'Onproses') {
    const isFabrikasi = it.jenisPengerjaan === 'Fabrikasi';
    actionHtml = `
      <div class="spk-action-box">
        <div class="form-row">
          <label>Foto Selesai ${isFabrikasi ? '*' : '(opsional)'}</label>
          <div class="foto-upload-box" data-action="close-foto-pick">
            <span id="spkCloseFotoStatus">${spkCloseUploading ? 'Mengupload...' : (spkCloseFotoUrl ? 'Foto siap ✓' : 'Klik untuk ambil/pilih foto')}</span>
            ${spkCloseFotoPreview ? `<img src="${spkCloseFotoPreview}" class="foto-upload-preview" alt="Preview foto selesai">` : ''}
          </div>
          <input type="file" id="spkCloseFotoInput" accept="image/*" capture="environment" hidden>
        </div>
        <div id="spkCloseError" class="form-error" hidden></div>
        <div class="spk-action-btn-row">
          <button type="button" class="btn-link" data-action="close-cancel">Batal</button>
          <button type="button" class="btn btn-primary" data-action="close-submit" ${spkCloseUploading ? 'disabled' : ''}>Tutup SPK (Closed)</button>
        </div>
      </div>`;
  } else if (it.status === 'Onproses') {
    actionHtml = `
      <div class="spk-action-btn-row">
        <button type="button" class="btn btn-small" data-action="update-toggle">+ Tambah Update Harian</button>
        <button type="button" class="btn btn-small btn-primary" data-action="close-toggle">Tutup SPK (Closed)</button>
      </div>`;
  }
  // Ditolak / Closed: tidak ada actionHtml (read-only).

  document.getElementById('spkDetailBody').innerHTML = `
    ${infoHtml}
    ${actionHtml}
    <div class="section-eyebrow" style="margin-top:16px;">Feedback &amp; Update Harian</div>
    <div class="spk-log-list">${renderSpkLogTimeline_()}</div>
  `;
}

function handleSpkDetailClick(e) {
  const btn = e.target.closest('[data-action]');
  if (!btn || !spkCurrentItem) return;
  const action = btn.dataset.action;

  if (action === 'decide') { spkDetailUiState = 'decide-' + btn.dataset.keputusan; renderSpkDetailBody(); }
  else if (action === 'decide-cancel') { spkDetailUiState = 'view'; renderSpkDetailBody(); }
  else if (action === 'decide-confirm') submitSpkDecide(btn.dataset.keputusan);
  else if (action === 'feedback-toggle') { spkDetailUiState = 'feedback'; renderSpkDetailBody(); }
  else if (action === 'feedback-cancel') { spkDetailUiState = 'view'; renderSpkDetailBody(); }
  else if (action === 'feedback-submit') submitSpkLog('Feedback Kebutuhan', 'spkFeedbackText', 'spkFeedbackError');
  else if (action === 'update-toggle') { spkDetailUiState = 'update'; renderSpkDetailBody(); }
  else if (action === 'update-cancel') { spkDetailUiState = 'view'; renderSpkDetailBody(); }
  else if (action === 'update-submit') submitSpkLog('Update Harian', 'spkUpdateText', 'spkUpdateError');
  else if (action === 'onproses-start') { spkDetailUiState = 'onproses-confirm'; renderSpkDetailBody(); }
  else if (action === 'onproses-cancel') { spkDetailUiState = 'view'; renderSpkDetailBody(); }
  else if (action === 'onproses-confirm') startSpkOnprosesFlow();
  else if (action === 'close-toggle') { spkDetailUiState = 'close'; renderSpkDetailBody(); }
  else if (action === 'close-cancel') { spkDetailUiState = 'view'; renderSpkDetailBody(); }
  else if (action === 'close-foto-pick') { const inp = document.getElementById('spkCloseFotoInput'); if (inp) inp.click(); }
  else if (action === 'close-submit') submitSpkClose();
}

async function submitSpkDecide(keputusan) {
  const idSpk = spkCurrentItem.idSpk;
  let payload = { idSpk, keputusan };
  if (keputusan === 'OK') {
    const target = document.getElementById('spkDecideTarget').value;
    if (!target) return showSpkInlineError_('spkDecideError', 'Target Tanggal Pengerjaan wajib diisi.');
    payload.targetTanggal = target;
  } else {
    const catatan = document.getElementById('spkDecideCatatan').value.trim();
    if (!catatan) return showSpkInlineError_('spkDecideError', 'Alasan wajib diisi.');
    payload.catatan = catatan;
  }
  const btn = document.querySelector('[data-action="decide-confirm"]');
  if (btn) btn.disabled = true;
  try {
    await Api.decideSpk(payload);
    showToast(keputusan === 'OK' ? 'SPK disetujui — status Open.' : (keputusan === 'Tolak' ? 'SPK ditolak.' : 'SPK di-hold.'), 'success');
    closeSpkDetailModal();
    loadSpk();
  } catch (err) {
    showSpkInlineError_('spkDecideError', err.message);
    if (btn) btn.disabled = false;
  }
}

async function submitSpkLog(tipe, textFieldId, errorFieldId) {
  const isi = document.getElementById(textFieldId).value.trim();
  if (!isi) return showSpkInlineError_(errorFieldId, 'Wajib diisi.');
  const btn = document.querySelector(`[data-action="${tipe === 'Feedback Kebutuhan' ? 'feedback-submit' : 'update-submit'}"]`);
  if (btn) btn.disabled = true;
  try {
    await Api.addSpkLog({ idSpk: spkCurrentItem.idSpk, tipe, isi });
    showToast(tipe === 'Feedback Kebutuhan' ? 'Feedback terkirim.' : 'Update harian tersimpan.', 'success');
    closeSpkDetailModal();
    loadSpk();
  } catch (err) {
    showSpkInlineError_(errorFieldId, err.message);
    if (btn) btn.disabled = false;
  }
}

async function startSpkOnprosesFlow() {
  const btn = document.querySelector('[data-action="onproses-confirm"]');
  if (btn) btn.disabled = true;
  try {
    await Api.startSpkOnproses({ idSpk: spkCurrentItem.idSpk });
    showToast('SPK mulai dikerjakan — status Onproses.', 'success');
    closeSpkDetailModal();
    loadSpk();
  } catch (err) {
    showToast(err.message, 'error');
    if (btn) btn.disabled = false;
  }
}

async function handleSpkCloseFotoChange(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  spkCloseUploading = true;
  renderSpkDetailBody();
  try {
    const compressed = await kompresFotoUntukUpload(file);
    spkCloseFotoPreview = compressed.previewUrl;
    const res = await Api.uploadFotoSpk({
      imageBase64: compressed.base64,
      mimeType: compressed.mimeType,
      idSpk: spkCurrentItem.idSpk,
      tipeFoto: 'selesai'
    });
    spkCloseFotoUrl = res.url;
    showToast('Foto selesai siap diupload.', 'success');
  } catch (err) {
    spkCloseFotoUrl = '';
    spkCloseFotoPreview = '';
    showToast('Gagal upload foto: ' + err.message, 'error');
  } finally {
    spkCloseUploading = false;
    renderSpkDetailBody();
  }
}

async function submitSpkClose() {
  const it = spkCurrentItem;
  if (it.jenisPengerjaan === 'Fabrikasi' && !spkCloseFotoUrl) {
    return showSpkInlineError_('spkCloseError', 'Foto selesai wajib diisi untuk menutup SPK Fabrikasi.');
  }
  if (spkCloseUploading) {
    return showSpkInlineError_('spkCloseError', 'Tunggu upload foto selesai dulu.');
  }
  const btn = document.querySelector('[data-action="close-submit"]');
  if (btn) btn.disabled = true;
  try {
    await Api.closeSpk({ idSpk: it.idSpk, fotoSelesai: spkCloseFotoUrl, clientRequestId: spkCloseRequestId });
    showToast('SPK ditutup — status Closed.', 'success');
    closeSpkDetailModal();
    loadSpk();
  } catch (err) {
    showSpkInlineError_('spkCloseError', err.message);
    if (btn) btn.disabled = false;
  }
}

function showSpkInlineError_(elId, msg) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.textContent = msg;
  el.hidden = false;
}
