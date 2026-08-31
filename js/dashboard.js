// ============================================================================
// DASHBOARD PAGE
// ============================================================================

let dashboardLoadedOnce = false;

async function loadDashboard() {
  try {
    const res = await Api.getDashboard();
    renderStats(res);
    renderChart(res.chart7Hari || []);
    renderRiwayat(res.riwayatTerbaru || []);
    dashboardLoadedOnce = true;
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function renderStats(res) {
  document.getElementById('statHariIni').textContent = res.totalHariIni || 0;
  document.getElementById('statBulanIni').textContent = res.totalBulanIni || 0;
  document.getElementById('statTransaksi').textContent = res.transaksiBulanIni || 0;
  document.getElementById('statSku').textContent = res.skuBulanIni || 0;
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

function renderChart(data) {
  const canvas = document.getElementById('chartMingguan');
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const cssWidth = canvas.clientWidth || 320;
  const cssHeight = 160;
  canvas.width = cssWidth * dpr;
  canvas.height = cssHeight * dpr;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, cssWidth, cssHeight);

  if (!data.length) return;

  const max = Math.max(1, ...data.map((d) => d.qty));
  const padBottom = 22;
  const padTop = 10;
  const chartH = cssHeight - padBottom - padTop;
  const barGap = 10;
  const barWidth = (cssWidth - barGap * (data.length + 1)) / data.length;

  data.forEach((d, i) => {
    const barH = (d.qty / max) * chartH;
    const x = barGap + i * (barWidth + barGap);
    const y = padTop + (chartH - barH);

    ctx.fillStyle = '#0f2a5c';
    roundRectPath(ctx, x, y, barWidth, Math.max(barH, 2), 4);
    ctx.fill();

    ctx.fillStyle = '#6b7488';
    ctx.font = '10px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    const label = (d.tanggal || '').slice(5); // MM-DD
    ctx.fillText(label, x + barWidth / 2, cssHeight - 6);

    if (d.qty > 0) {
      ctx.fillStyle = '#0f2a5c';
      ctx.font = 'bold 10px -apple-system, sans-serif';
      ctx.fillText(String(d.qty), x + barWidth / 2, y - 4);
    }
  });
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
