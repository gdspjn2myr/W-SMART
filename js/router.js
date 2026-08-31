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
    document.querySelectorAll('.nav-item').forEach((el) => {
      el.classList.toggle('active', el.dataset.nav === page);
    });
    const titles = { dashboard: 'Dashboard', penerimaan: 'Penerimaan Barang' };
    document.getElementById('pageTitle').textContent = titles[page] || '';
    if (typeof this.routes[page] === 'function') {
      this.routes[page]();
    }
  }
};
