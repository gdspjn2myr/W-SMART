// ============================================================================
// RESERVASI SPAREPART (Staff/Admin) — daftar reservasi yang diajukan user dari
// repo terpisah "Reservasi-SP-online", diproses di sini:
//   Menunggu Approval GDSP -> (Approve/Tolak) -> Barang Ready -> (Issue) -> Selesai
// "Approval GDSP" & Issue boleh dilakukan Staff/Admin MANAPUN, tidak dicek
// departemennya (dikonfirmasi user) — jadi tidak ada filter departemen di sini,
// beda dengan SPK Online (js/spk-online.js) yang emang perlu filter itu.
// ============================================================================

let rsvInitialized = false;
let rsvData = [];
let rsvActiveId = null; // ID Reservasi yang lagi diproses lewat salah satu modal
let rsvActiveKeputusan = null; // 'Approve' | 'Tolak' (rsvKeputusanModal)
let rsvIssueRequestId = generateClientRequestId(); // anti-dobel-simpan (lihat js/api.js)

const RSV_STATUS_PILL_CLASS = {
  'Menunggu Approval GDSP': 'status-menunggu',
  'Barang Ready': 'status-ready',
  'Selesai': 'status-selesai',
  'Ditolak': 'status-ditolak'
};

function initReservasiPage() {
  if (!rsvInitialized) {
    rsvInitialized = true;

    document.getElementById('rsvStatusFilter').addEventListener('change', loadReservasi);
    wireRefreshButton('btnRefreshReservasi', loadReservasi);

    document.getElementById('rsvList').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const id = btn.dataset.id;
      const item = rsvData.find((it) => it.idReservasi === id);
      if (!item) return;
      if (btn.dataset.action === 'approve') openRsvKeputusanModal(item, 'Approve');
      else if (btn.dataset.action === 'tolak') openRsvKeputusanModal(item, 'Tolak');
      else if (btn.dataset.action === 'issue') openRsvIssueModal(item);
    });

    document.getElementById('btnCloseRsvKeputusanModal').addEventListener('click', closeRsvKeputusanModal);
    document.getElementById('rsvKeputusanModalBackdrop').addEventListener('click', closeRsvKeputusanModal);
    document.getElementById('rsvKeputusanForm').addEventListener('submit', submitRsvKeputusan);

    document.getElementById('btnCloseRsvIssueModal').addEventListener('click', closeRsvIssueModal);
    document.getElementById('rsvIssueModalBackdrop').addEventListener('click', closeRsvIssueModal);
    document.getElementById('rsvIssueForm').addEventListener('submit', submitRsvIssue);

    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (!document.getElementById('rsvKeputusanModal').hidden) closeRsvKeputusanModal();
      if (!document.getElementById('rsvIssueModal').hidden) closeRsvIssueModal();
    });
  }
  loadReservasi();
}

async function loadReservasi() {
  const wrap = document.getElementById('rsvList');
  const status = document.getElementById('rsvStatusFilter').value;
  try {
    const res = await Api.getReservasiList({ status });
    rsvData = res.data || [];
    renderReservasiList();
  } catch (err) {
    wrap.innerHTML = `<div class="empty-state">Gagal memuat: ${escapeHtml(err.message)}</div>`;
  }
}

function renderReservasiList() {
  const wrap = document.getElementById('rsvList');
  document.getElementById('rsvCount').textContent = rsvData.length + ' Reservasi';
  if (!rsvData.length) {
    wrap.innerHTML = '<div class="empty-state">Belum ada reservasi yang cocok dengan filter ini.</div>';
    return;
  }
  wrap.innerHTML = rsvData.map((it) => {
    const pillClass = RSV_STATUS_PILL_CLASS[it.status] || 'status-menunggu';
    let actions = '';
    let extraInfo = '';
    if (it.status === 'Menunggu Approval GDSP') {
      actions = `
        <button type="button" class="btn btn-small" data-action="tolak" data-id="${escapeHtml(it.idReservasi)}">Tolak</button>
        <button type="button" class="btn btn-small btn-primary" data-action="approve" data-id="${escapeHtml(it.idReservasi)}">Approve</button>`;
    } else if (it.status === 'Barang Ready') {
      actions = `<button type="button" class="btn btn-small btn-primary" data-action="issue" data-id="${escapeHtml(it.idReservasi)}">Issue</button>`;
    } else if (it.status === 'Selesai') {
      extraInfo = `<div class="item-meta-line">Diissue ${escapeHtml(it.qtyIssue)} ${escapeHtml(it.satuan || '')} oleh ${escapeHtml(it.issuedBy || '-')} · ${escapeHtml(it.tanggalIssue || '-')}</div>`;
    } else if (it.status === 'Ditolak') {
      extraInfo = `<div class="item-meta-line">Alasan: ${escapeHtml(it.catatanApproval || '-')} · oleh ${escapeHtml(it.diprosesOleh || '-')}</div>`;
    }
    return `
      <div class="md-item">
        <div class="md-item-main">
          <div class="md-item-title">
            <span class="status-pill ${pillClass}">${escapeHtml(it.status)}</span>
            ${escapeHtml(it.idReservasi)}
          </div>
          <div class="md-item-sub">
            ${escapeHtml(it.namaUser)} · ${escapeHtml(it.departement || '-')}${it.plant ? ' · Plant ' + escapeHtml(it.plant) : ''} · ${escapeHtml(it.tanggal)}
          </div>
          <div class="md-item-sub">
            ${escapeHtml(it.kode)} — ${escapeHtml(it.namaBarang)} · Qty diminta: ${escapeHtml(it.qtyDiminta)} ${escapeHtml(it.satuan || '')}${it.keterangan ? ' · ' + escapeHtml(it.keterangan) : ''}
          </div>
          ${extraInfo}
        </div>
        <div class="md-item-actions">${actions}</div>
      </div>`;
  }).join('');
}

function openRsvKeputusanModal(item, keputusan) {
  rsvActiveId = item.idReservasi;
  rsvActiveKeputusan = keputusan;
  const isTolak = keputusan === 'Tolak';
  document.getElementById('rsvKeputusanModalTitle').textContent = isTolak ? 'Tolak Reservasi' : 'Setujui Reservasi (Approval GDSP)';
  document.getElementById('rsvKeputusanModalHint').textContent = `${item.idReservasi} — ${item.kode} ${item.namaBarang} · ${item.qtyDiminta} ${item.satuan || ''} · diminta oleh ${item.namaUser}`;
  document.getElementById('rsvKeputusanCatatanLabel').textContent = isTolak ? 'Alasan Tolak *' : 'Catatan';
  document.getElementById('rsvKeputusanCatatan').value = '';
  document.getElementById('rsvKeputusanCatatan').placeholder = isTolak ? 'Wajib diisi — kenapa reservasi ini ditolak' : 'Catatan (opsional)';
  // SENGAJA TIDAK pakai atribut HTML `required` di sini — validasi wajib-isi
  // (kalau Tolak) murni ditangani manual di submitRsvKeputusan() supaya pesan
  // errornya tampil rapi di rsvKeputusanFormError, bukan tooltip bawaan
  // browser yang tidak senada sama tampilan modal.
  const submitBtn = document.getElementById('btnRsvKeputusanSubmit');
  submitBtn.textContent = isTolak ? 'Tolak Reservasi' : 'Setujui — Barang Ready';
  submitBtn.classList.toggle('btn-danger', isTolak);
  submitBtn.classList.toggle('btn-primary', !isTolak);
  document.getElementById('rsvKeputusanFormError').hidden = true;
  document.getElementById('rsvKeputusanModalBackdrop').hidden = false;
  document.getElementById('rsvKeputusanModal').hidden = false;
  setTimeout(() => document.getElementById('rsvKeputusanCatatan').focus(), 50);
}

function closeRsvKeputusanModal() {
  document.getElementById('rsvKeputusanModalBackdrop').hidden = true;
  document.getElementById('rsvKeputusanModal').hidden = true;
  rsvActiveId = null;
  rsvActiveKeputusan = null;
}

async function submitRsvKeputusan(e) {
  e.preventDefault();
  const catatan = document.getElementById('rsvKeputusanCatatan').value.trim();
  const errEl = document.getElementById('rsvKeputusanFormError');
  errEl.hidden = true;

  if (rsvActiveKeputusan === 'Tolak' && !catatan) {
    errEl.textContent = 'Alasan tolak wajib diisi.';
    errEl.hidden = false;
    return;
  }

  const btn = document.getElementById('btnRsvKeputusanSubmit');
  btn.disabled = true;
  try {
    await Api.approveReservasi({ idReservasi: rsvActiveId, keputusan: rsvActiveKeputusan, catatan });
    showToast(rsvActiveKeputusan === 'Tolak' ? 'Reservasi ditolak.' : 'Reservasi disetujui — status Barang Ready.', 'success');
    closeRsvKeputusanModal();
    loadReservasi();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.hidden = false;
  } finally {
    btn.disabled = false;
  }
}

function openRsvIssueModal(item) {
  rsvActiveId = item.idReservasi;
  rsvIssueRequestId = generateClientRequestId(); // transaksi baru -> ID baru
  document.getElementById('rsvIssueModalHint').textContent = `${item.idReservasi} — ${item.kode} ${item.namaBarang} · diminta ${item.qtyDiminta} ${item.satuan || ''} oleh ${item.namaUser}`;
  const qtyInput = document.getElementById('rsvIssueQty');
  qtyInput.value = item.qtyDiminta;
  document.getElementById('rsvIssueFormError').hidden = true;
  document.getElementById('rsvIssueModalBackdrop').hidden = false;
  document.getElementById('rsvIssueModal').hidden = false;
  setTimeout(() => { qtyInput.focus(); qtyInput.select(); }, 50);
}

function closeRsvIssueModal() {
  document.getElementById('rsvIssueModalBackdrop').hidden = true;
  document.getElementById('rsvIssueModal').hidden = true;
  rsvActiveId = null;
}

async function submitRsvIssue(e) {
  e.preventDefault();
  const qtyIssue = Number(document.getElementById('rsvIssueQty').value) || 0;
  const errEl = document.getElementById('rsvIssueFormError');
  errEl.hidden = true;

  if (qtyIssue <= 0) {
    errEl.textContent = 'Qty harus lebih dari 0.';
    errEl.hidden = false;
    return;
  }

  const btn = document.getElementById('btnRsvIssueSubmit');
  btn.disabled = true;
  try {
    await Api.issueReservasi({ idReservasi: rsvActiveId, qtyIssue, clientRequestId: rsvIssueRequestId });
    showToast('Reservasi selesai — barang sudah diissue.', 'success');
    closeRsvIssueModal();
    loadReservasi();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.hidden = false;
  } finally {
    btn.disabled = false;
  }
}
