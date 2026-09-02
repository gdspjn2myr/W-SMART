// ============================================================================
// DASHBOARD PAGE
// ============================================================================

let dashboardLoadedOnce = false;

async function loadDashboard() {
  try {
    const res = await Api.getDashboard();
    renderStockStats(res);
    renderReorderAlert(res.reorderAlert || []);
    renderStats(res);
    renderChart(res.chart7Hari || []);
    renderTopPemakaian(res.topPemakaianBulanIni || []);
    renderKategoriChart(res.kategoriDist || { A: 0, B: 0, C: 0 });
    renderRiwayat(res.riwayatTerbaru || []);
    dashboardLoadedOnce = true;
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// Stock Balance / Reorder Alert — dihitung realtime di server dari Penerimaan -
// Pemakaian dibandingkan ROP/MAX di Master Data (lihat hitungStockHealth_ di Code.gs).
function renderStockStats(res) {
  // Stock Saat Ini = total pcs SEMUA barang (termasuk yang belum terdaftar
  // di Master Data) — lihat totalStockSaatIni di hitungStockHealth_ (Code.gs).
  animateStatValue('statStockSaatIni', res.totalStockSaatIni || 0);

  const total = res.totalSku || 0;
  animateStatValue('statTotalSku', total);
  animateStatValue('statStokNormal', res.stokNormal || 0);
  animateStatValue('statStokNearRop', res.stokNearRop || 0);
  animateStatValue('statStokNeedReorder', res.stokNeedReorder || 0);
  animateStatValue('statStokOut', res.stokOut || 0);

  const pct = (n) => total ? Math.round((n / total) * 100) + '%' : '0%';
  document.getElementById('statStokNormalPct').textContent = pct(res.stokNormal || 0);
  document.getElementById('statStokNearRopPct').textContent = pct(res.stokNearRop || 0);
  document.getElementById('statStokNeedReorderPct').textContent = pct(res.stokNeedReorder || 0);
  document.getElementById('statStokOutPct').textContent = pct(res.stokOut || 0);
}

const RA_STATUS_CLASS = { 'Stock Out': 'ra-badge-out', 'Need Reorder': 'ra-badge-reorder', 'Near ROP': 'ra-badge-near' };

function renderReorderAlert(list) {
  document.getElementById('reorderAlertCount').textContent = list.length + ' Item';
  const wrap = document.getElementById('reorderAlertList');
  if (!list.length) {
    wrap.innerHTML = '<div class="empty-state">Semua stock dalam kondisi normal.</div>';
    return;
  }
  wrap.innerHTML = list.map((it) => `
      <div class="ra-item">
        <div class="ra-item-main">
          <div class="ra-item-title">${escapeHtml(it.kode)} — ${escapeHtml(it.namaBarang)}</div>
          <div class="ra-item-sub">Stock ${it.onHand} · ROP ${it.rop} · MAX ${it.max} · Order Qty <strong>${it.orderQty}</strong></div>
        </div>
        <span class="ra-badge ${RA_STATUS_CLASS[it.status] || ''}">${escapeHtml(it.status)}</span>
      </div>
    `).join('');
}

function renderTopPemakaian(list) {
  const wrap = document.getElementById('topPemakaianList');
  if (!list.length) {
    wrap.innerHTML = '<div class="empty-state">Belum ada data pemakaian bulan ini.</div>';
    return;
  }
  const max = Math.max(1, ...list.map((it) => it.qty));
  wrap.innerHTML = list.map((it) => `
      <div class="tp-item">
        <div class="tp-item-label">
          <span>${escapeHtml(it.namaBarang || it.kode)}</span>
          <strong>${it.qty}${it.satuan ? ' ' + escapeHtml(it.satuan) : ''}</strong>
        </div>
        <div class="tp-bar-track"><div class="tp-bar-fill" style="width:${Math.max(4, (it.qty / max) * 100)}%"></div></div>
      </div>
    `).join('');
}

function renderStats(res) {
  animateStatValue('statHariIni', res.totalHariIni || 0);
  animateStatValue('statBulanIni', res.totalBulanIni || 0);
  animateStatValue('statTransaksi', res.transaksiBulanIni || 0);
  animateStatValue('statSku', res.skuBulanIni || 0);
}

function prefersReducedMotion() {
  return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
}

function animateStatValue(id, target) {
  const el = document.getElementById(id);
  if (!target || prefersReducedMotion()) {
    el.textContent = target;
    return;
  }
  const duration = 550;
  const t0 = performance.now();
  function step(now) {
    const p = Math.min(1, (now - t0) / duration);
    const eased = 1 - Math.pow(1 - p, 3); // ease-out cubic
    el.textContent = Math.round(target * eased);
    if (p < 1) requestAnimationFrame(step);
    else el.textContent = target;
  }
  requestAnimationFrame(step);
}

function renderRiwayat(items) {
  const wrap = document.getElementById('riwayatList');
  if (!items.length) {
    wrap.innerHTML = '<div class="empty-state">Belum ada data penerimaan.</div>';
    return;
  }
  wrap.innerHTML = items.map((it) => `
      <div class="riwayat-item">
        <div class="riwayat-item-main">
          <div class="riwayat-item-title">${escapeHtml(it.vendor || '(tanpa vendor)')} — ${it.jumlahItem} item</div>
          <div class="riwayat-item-sub">${escapeHtml(it.kedatangan)} · PO ${escapeHtml(it.noPO || '-')} · Qty ${it.totalQty}</div>
        </div>
        <span class="riwayat-item-badge badge-manual">${escapeHtml(it.user || '-')}</span>
      </div>
    `).join('');
}

let chartAnimToken = 0;

function renderChart(data) {
  const canvas = document.getElementById('chartMingguan');
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  // PENTING: canvas ini anak langsung dari .card yang punya padding (lihat index.html).
  // parentElement.clientWidth itu lebar .card TERMASUK padding kiri-kanannya — kalau
  // dipakai langsung, canvas jadi digambar lebih lebar dari ruang yang sebenarnya
  // tersedia di dalam padding, jadi bar paling kanan keliatan "bablas" nyembul lewat
  // tepi kanan card. Makanya padding parent-nya harus dikurangi dulu di sini.
  const parentEl = canvas.parentElement;
  const parentPadding = parentEl ? (parseFloat(getComputedStyle(parentEl).paddingLeft) || 0) +
    (parseFloat(getComputedStyle(parentEl).paddingRight) || 0) : 0;
  const cssWidth = (parentEl && (parentEl.clientWidth - parentPadding)) || canvas.clientWidth || 320;
  const cssHeight = 160;
  // Kunci UKURAN TAMPILAN canvas ke ukuran CSS yang dimaksud — tanpa ini, di HP dengan
  // devicePixelRatio tinggi (2x/3x) canvasnya malah tampil 2-3x lebih besar dari seharusnya,
  // bikin layout dashboard jadi aneh (area kosong raksasa di bawah/kanan chart).
  canvas.style.width = cssWidth + 'px';
  canvas.style.height = cssHeight + 'px';
  canvas.width = Math.round(cssWidth * dpr);
  canvas.height = Math.round(cssHeight * dpr);
  ctx.scale(dpr, dpr);

  const myToken = ++chartAnimToken; // batalkan animasi frame lama kalau renderChart dipanggil lagi

  if (!data.length) {
    ctx.clearRect(0, 0, cssWidth, cssHeight);
    return;
  }

  function draw(progress) {
    ctx.clearRect(0, 0, cssWidth, cssHeight);
    const max = Math.max(1, ...data.map((d) => d.qty));
    const padBottom = 22;
    const padTop = 10;
    const chartH = cssHeight - padBottom - padTop;
    const barGap = 10;
    const barWidth = (cssWidth - barGap * (data.length + 1)) / data.length;

    data.forEach((d, i) => {
      const fullH = (d.qty / max) * chartH;
      const barH = fullH * progress;
      const x = barGap + i * (barWidth + barGap);
      const y = padTop + (chartH - barH);

      ctx.fillStyle = '#0f2a5c';
      roundRectPath(ctx, x, y, barWidth, Math.max(barH, d.qty > 0 ? 2 : 0), 4);
      ctx.fill();

      ctx.fillStyle = '#6b7488';
      ctx.font = '10px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      const label = (d.tanggal || '').slice(5); // MM-DD
      ctx.fillText(label, x + barWidth / 2, cssHeight - 6);

      if (d.qty > 0 && progress > 0.85) {
        ctx.fillStyle = '#0f2a5c';
        ctx.font = 'bold 10px -apple-system, sans-serif';
        ctx.globalAlpha = (progress - 0.85) / 0.15;
        ctx.fillText(String(d.qty), x + barWidth / 2, y - 4);
        ctx.globalAlpha = 1;
      }
    });
  }

  if (prefersReducedMotion()) {
    draw(1);
    return;
  }

  const duration = 500;
  const t0 = performance.now();
  function frame(now) {
    if (myToken !== chartAnimToken) return; // ada renderChart baru, hentikan animasi lama
    const p = Math.min(1, (now - t0) / duration);
    const eased = 1 - Math.pow(1 - p, 3); // ease-out cubic
    draw(eased);
    if (p < 1) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

const KATEGORI_SEGMENTS = [
  { key: 'A', label: 'A — Critical', color: '#d64545' },
  { key: 'B', label: 'B — Medium', color: '#ffb703' },
  { key: 'C', label: 'C — Fast Moving', color: '#2e9e5b' }
];

function renderKategoriChart(dist) {
  const canvas = document.getElementById('chartKategori');
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const size = 140;
  canvas.style.width = size + 'px';
  canvas.style.height = size + 'px';
  canvas.width = Math.round(size * dpr);
  canvas.height = Math.round(size * dpr);
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, size, size);

  const total = (dist.A || 0) + (dist.B || 0) + (dist.C || 0);
  const legend = document.getElementById('kategoriLegend');
  const cx = size / 2, cy = size / 2, r = (size - 18) / 2;

  if (!total) {
    ctx.strokeStyle = '#e3e7f0';
    ctx.lineWidth = 18;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    legend.innerHTML = '<div class="empty-state">Belum ada item aktif di Master Data.</div>';
    return;
  }

  let startAngle = -Math.PI / 2;
  ctx.lineWidth = 18;
  KATEGORI_SEGMENTS.forEach((seg) => {
    const value = dist[seg.key] || 0;
    if (!value) return;
    const angle = (value / total) * Math.PI * 2;
    ctx.strokeStyle = seg.color;
    ctx.beginPath();
    ctx.arc(cx, cy, r, startAngle, startAngle + angle);
    ctx.stroke();
    startAngle += angle;
  });

  legend.innerHTML = KATEGORI_SEGMENTS.map((seg) => {
    const value = dist[seg.key] || 0;
    return `
      <div class="kt-legend-item">
        <span class="kt-dot" style="background:${seg.color}"></span>
        <span>${seg.label}</span>
        <strong>${value} (${Math.round((value / total) * 100)}%)</strong>
      </div>
    `;
  }).join('');
}

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
