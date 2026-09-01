// ============================================================================
// ROUTER — hash-based, sederhana untuk PWA single page
// ============================================================================

const Router = {
  routes: {},
  register(name, onEnter) {
    this.routes[name] = onEnter;
  },
  current: 'dashboard',
  init() {
    window.addEventListener('hashchange', () => this.resolve());
    this.resolve();
  },
  resolve() {
    const hash = window.location.hash.replace('#/', '') || 'dashboard';
    const page = this.routes[hash] ? hash : 'dashboard';
    this.current = page;
    this.render(page);
  },
  render(page) {
    document.querySelectorAll('.page').forEach((el) => {
      el.hidden = el.id !== 'page-' + page;
    });
    const activeEl = document.getElementById('page-' + page);
    if (activeEl) {
      // Re-trigger animasi masuk tiap kali halaman ini ditampilkan (reflow paksa
      // supaya class yang sama bisa dipasang ulang & animasi CSS jalan lagi).
      activeEl.classList.remove('page-enter');
      void activeEl.offsetWidth;
      activeEl.classList.add('page-enter');
    }
    document.querySelectorAll('.nav-item').forEach((el) => {
      el.classList.toggle('active', el.dataset.nav === page);
    });
    const titles = { dashboard: 'Dashboard', penerimaan: 'Barang Masuk', putaway: 'Put Away', pemakaian: 'Barang Keluar', 'stock-balance': 'Stock Balance', 'master-data': 'Master Data', 'qr-labels': 'Cetak Label QR', riwayat: 'Riwayat Transaksi' };
    document.getElementById('pageTitle').textContent = titles[page] || '';
    if (typeof this.routes[page] === 'function') {
      this.routes[page]();
    }
  }
};
