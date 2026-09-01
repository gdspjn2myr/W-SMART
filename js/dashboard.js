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
  const cssWidth = canvas.parentElement.clientWidth || canvas.clientWidth || 320;
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
