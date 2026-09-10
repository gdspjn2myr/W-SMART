// ============================================================================
// CEK BARANG — halaman BARU: scan/cari 1 Kode Barang, lihat identitas +
// STOCK SAAT INI (live, per Plant/S.Loc/Bin). Permintaan user: QR Barang
// diminta "manampilkan semuanya" saat di-scan — dijawab dengan 2 hal
// sekaligus (lihat riwayat chat):
//  1) QR Barang sekarang encode SEMUA detail label ke dalam QR-nya sendiri
//     (lihat js/qr-payload.js) — kalau yang di-scan di sini adalah label
//     format itu, section "Info dari Label" di bawah nampilin snapshot-nya
//     (No PO/Vendor/dst PAS LABEL DICETAK).
//  2) Halaman INI — stock SAAT INI itu berubah terus (tidak bisa "dibekukan"
//     ke dalam QR yang statis), jadi selalu diambil LIVE dari server tiap
//     kali cari/scan (lihat handleGetCekBarang di Code.gs), bukan dari isi
//     QR-nya. Section "Info dari Label" & "Stock Saat Ini" SENGAJA dipisah
//     biar tidak ketuker: yang satu snapshot beku, yang satu live.
// Beda dari Stock Opname: halaman ini CUMA BUAT LIHAT (tidak mencatat hasil
// hitung apa pun), jadi kalau kode-nya multi-Plant, SEMUA Plant langsung
// ditampilkan sekaligus (tidak maksa pilih 1 Plant dulu kayak Opname).
// ============================================================================

let cbInitialized = false;
let cbLastLabelInfo = null; // detail dari QR WSB1 yang barusan di-scan (kalau ada) — lihat renderCbResult

function initCekBarangPage() {
  if (cbInitialized) return;
  cbInitialized = true;

  document.getElementById('btnCbCari').addEventListener('click', () => handleCbCari());
  document.getElementById('cbKode').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); handleCbCari(); }
  });

  document.getElementById('btnScanCbBarang').addEventListener('click', () => {
    openQrScanner(
      (kode, rawText) => {
        // rawText = teks asli hasil scan (belum diproses) — parse ULANG di
        // sini (bukan cuma pakai `kode` yang sudah diekstrak openQrScanner)
        // supaya kalau formatnya WSB1, detail lengkapnya (Info dari Label)
        // ikut ke-capture buat ditampilkan, bukan cuma kode-nya doang.
        const parsed = parseQrPayload(rawText);
        cbLastLabelInfo = parsed.isRich ? parsed.detail : null;
        document.getElementById('cbKode').value = kode;
        showToast('Kode Barang terbaca: ' + kode, 'success');
        handleCbCari();
      },
      (err) => showToast(err, 'error')
    );
  });
}

async function handleCbCari() {
  const kode = document.getElementById('cbKode').value.trim();
  if (!kode) { showToast('Isi atau scan Kode Barang dulu.', 'error'); return; }

  // Kode diketik/diedit manual (beda dari yang barusan di-scan) -> "Info dari
  // Label" punya kode yang lama, jangan ditampilkan biar tidak menyesatkan.
  if (cbLastLabelInfo && String(cbLastLabelInfo.kode || '').toUpperCase() !== kode.toUpperCase()) {
    cbLastLabelInfo = null;
  }

  document.getElementById('cbResultCard').hidden = true;
  const btn = document.getElementById('btnCbCari');
  btn.disabled = true;
  try {
    const res = await Api.getCekBarang({ kode });
    renderCbResult(res);
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
  }
}

function renderCbResult(res) {
  const card = document.getElementById('cbResultCard');
  const labelInfo = cbLastLabelInfo;

  const labelInfoHtml = labelInfo ? `
    <div class="op-section-title">Info dari Label (saat dicetak)</div>
    <p class="hint-text">Data ini "beku" — dicatat pas labelnya dicetak, BUKAN kondisi sekarang. Lihat "Stock Saat Ini" di bawah buat qty terbaru.</p>
    <div class="op-riwayat-list">
      <div class="op-riwayat-item">
        <div class="op-riwayat-main">
          ${labelInfo.noPO ? `No PO ${escapeHtml(labelInfo.noPO)} · ` : ''}${labelInfo.vendor ? `Vendor ${escapeHtml(labelInfo.vendor)} · ` : ''}${labelInfo.sumber ? `Sumber ${escapeHtml(labelInfo.sumber)}` : ''}
          ${labelInfo.tanggal || labelInfo.user ? `<br><span class="item-meta-line">${labelInfo.tanggal ? 'Tgl Terima ' + escapeHtml(qrFormatTanggal(labelInfo.tanggal)) : ''}${labelInfo.tanggal && labelInfo.user ? ' · ' : ''}${labelInfo.user ? 'Diterima ' + escapeHtml(labelInfo.user) : ''}</span>` : ''}
        </div>
        ${labelInfo.qty ? `<div class="op-riwayat-qty">${escapeHtml(labelInfo.qty)} ${escapeHtml(labelInfo.satuan || '')}</div>` : ''}
      </div>
    </div>
  ` : '';

  if (!res.plants || !res.plants.length) {
    card.innerHTML = `
      <div class="card-header">${escapeHtml(res.kode)} — ${escapeHtml(res.namaBarang || '-')}</div>
      ${labelInfoHtml}
      <div class="op-section-title">Stock Saat Ini</div>
      <div class="empty-state">${res.belumAdaMaster ? 'Belum terdaftar di Master Data — belum ada stock tercatat.' : 'Tidak ada stock tercatat.'}</div>
      ${cbRiwayatHtml(res.riwayatKedatangan)}
    `;
    card.hidden = false;
    return;
  }

  const plantsHtml = res.plants.map((p) => {
    const statusClass = OP_STATUS_CLASS[p.status] || 'ra-badge-unregistered';
    const statusLabel = OP_STATUS_LABEL[p.status] || p.status || '-';
    const slocMeta = itemMetaLine({ slocBreakdown: p.slocBreakdown });
    const binsHtml = (p.bins && p.bins.length)
      ? `<div class="op-riwayat-list">${p.bins.map((b) => `
          <div class="op-riwayat-item">
            <div class="op-riwayat-main">${escapeHtml(b.lokasi)}</div>
            <div class="op-riwayat-qty">${b.qty} ${escapeHtml(res.satuan || '')}</div>
          </div>
        `).join('')}</div>`
      : '<div class="empty-state">Belum ada barang tercatat di bin manapun untuk Plant ini.</div>';

    // "Sisa saat ini per Sumber" per Plant — helper bareng sama dipakai popup
    // Riwayat Stock Balance & kartu detail Opname (sumberBreakdownChipsHtml,
    // js/dashboard.js). p.sumberBreakdown dibalikin handleGetCekBarang (Code.gs).
    const sumberBreakdownHtml = (p.sumberBreakdown && p.sumberBreakdown.length)
      ? `<div class="sb-sumber-breakdown">${sumberBreakdownChipsHtml(p.sumberBreakdown)}</div>`
      : '';

    return `
      <div class="cb-plant-block">
        <div class="cb-plant-header">
          <span>Plant ${escapeHtml(p.plant || '-')}</span>
          <span class="ra-badge ${statusClass}">${escapeHtml(statusLabel)}</span>
        </div>
        <div class="op-detail-stats">
          <div><span>Qty Sistem</span><strong>${p.onHand} ${escapeHtml(res.satuan || '')}</strong></div>
          <div><span>Jumlah Bin</span><strong>${(p.bins || []).length}</strong></div>
        </div>
        ${slocMeta ? `<div class="item-meta-line">${slocMeta}</div>` : ''}
        ${sumberBreakdownHtml}
        <div class="op-section-title">Breakdown per Bin</div>
        ${binsHtml}
      </div>
    `;
  }).join('');

  card.innerHTML = `
    <div class="card-header">${escapeHtml(res.kode)} — ${escapeHtml(res.namaBarang || '-')}</div>
    ${labelInfoHtml}
    <div class="op-section-title">Stock Saat Ini per Plant</div>
    ${plantsHtml}
    ${cbRiwayatHtml(res.riwayatKedatangan)}
  `;
  card.hidden = false;
}

function cbRiwayatHtml(riwayatKedatangan) {
  const list = riwayatKedatangan || [];
  // Sama seperti Opname (js/opname.js renderOpDetailCard): tiap baris riwayat
  // dikasih baris kecil Plant/S.Loc/Sumber kalau ada datanya — permintaan
  // user: "di riwayat, kurang data yg ditampilkannya".
  const rows = list.length
    ? list.map((r) => {
        const subParts = [];
        if (r.plant) subParts.push('Plant ' + escapeHtml(r.plant));
        if (r.sloc) subParts.push('S.Loc ' + escapeHtml(r.sloc));
        if (r.sumber) subParts.push('Sumber ' + escapeHtml(r.sumber));
        const subLine = subParts.length ? `<div class="op-riwayat-sub">${subParts.join(' · ')}</div>` : '';
        return `
        <div class="op-riwayat-item">
          <div class="op-riwayat-main">
            <strong>${escapeHtml(r.kedatangan || '-')}</strong> · No PO ${escapeHtml(r.noPO || '-')} · Vendor ${escapeHtml(r.vendor || '-')}
            ${subLine}
          </div>
          <div class="op-riwayat-qty">+${r.qty} ${escapeHtml(r.satuan || '')}</div>
        </div>
      `;
      }).join('')
    : '<div class="empty-state">Belum ada riwayat Penerimaan tercatat untuk item ini.</div>';
  return `<div class="op-section-title">Riwayat Kedatangan Terakhir</div><div class="op-riwayat-list">${rows}</div>`;
}
