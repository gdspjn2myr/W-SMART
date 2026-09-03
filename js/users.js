// ============================================================================
// KELOLA USER — halaman Admin-only: daftar akun, tambah/edit, aktif/nonaktif.
// Pola sama dengan Master Data (js/master-data.js): usersInitialized dicek
// sekali di initUsersPage buat wiring event, sisanya (load/render) dipanggil
// ulang tiap halaman ini dibuka.
// ============================================================================

let usersInitialized = false;
let usersCache = [];
let editingUsername = null; // null = mode tambah baru

function initUsersPage() {
  if (!usersInitialized) {
    usersInitialized = true;

    document.getElementById('btnAddUser').addEventListener('click', () => openUserModal(null));
    document.getElementById('btnCloseUserModal').addEventListener('click', closeUserModal);
    document.getElementById('userModalBackdrop').addEventListener('click', closeUserModal);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !document.getElementById('userModal').hidden) closeUserModal();
    });

    document.getElementById('userForm').addEventListener('submit', submitUserForm);

    document.getElementById('usersList').addEventListener('click', (e) => {
      const editBtn = e.target.closest('[data-action="edit-user"]');
      const toggleBtn = e.target.closest('[data-action="toggle-user-status"]');
      if (editBtn) {
        const u = usersCache.find((it) => it.username === editBtn.dataset.username);
        if (u) openUserModal(u);
      } else if (toggleBtn && !toggleBtn.disabled) {
        toggleUserStatus(toggleBtn.dataset.username, toggleBtn.dataset.nextStatus);
      }
    });
  }

  loadUsers();
}

async function loadUsers() {
  const wrap = document.getElementById('usersList');
  try {
    const res = await Api.getUsers();
    usersCache = res.data || [];
    renderUsersList();
  } catch (err) {
    wrap.innerHTML = `<div class="empty-state">Gagal memuat data: ${escapeHtml(err.message)}</div>`;
  }
}

const ROLE_BADGE_CLASS = { Admin: 'role-badge-admin', Staff: 'role-badge-staff', Viewer: 'role-badge-viewer' };

function renderUsersList() {
  const wrap = document.getElementById('usersList');
  if (!usersCache.length) {
    wrap.innerHTML = '<div class="empty-state">Belum ada user. Klik "+ Tambah User" untuk mulai.</div>';
    return;
  }

  const me = Auth.getUser();
  wrap.innerHTML = usersCache.map((u) => {
    const isAktif = u.status !== 'Nonaktif';
    const isSelf = !!(me && me.username && me.username.toLowerCase() === String(u.username).toLowerCase());
    const badgeClass = ROLE_BADGE_CLASS[u.role] || 'role-badge-staff';
    return `
      <div class="md-item">
        <div class="md-item-main">
          <div class="md-item-title">
            <span class="role-badge ${badgeClass}">${escapeHtml(u.role)}</span>
            ${escapeHtml(u.nama)}
          </div>
          <div class="md-item-sub">
            @${escapeHtml(u.username)}${u.loginTerakhir ? ' · Login terakhir ' + escapeHtml(u.loginTerakhir) : ' · Belum pernah login'}${isSelf ? ' · (Akun kamu)' : ''}
          </div>
        </div>
        <div class="md-item-actions">
          <button type="button" class="status-pill ${isAktif ? 'status-aktif' : 'status-nonaktif'}"
            data-action="toggle-user-status" data-username="${escapeHtml(u.username)}"
            data-next-status="${isAktif ? 'Nonaktif' : 'Aktif'}"
            ${isSelf && isAktif ? 'disabled title="Tidak bisa nonaktifkan akun sendiri"' : ''}>${isAktif ? 'Aktif' : 'Nonaktif'}</button>
          <button type="button" class="btn-icon" data-action="edit-user" data-username="${escapeHtml(u.username)}" title="Edit user" aria-label="Edit user">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
          </button>
        </div>
      </div>`;
  }).join('');
}

function openUserModal(user) {
  editingUsername = user ? user.username : null;
  const isEdit = !!user;
  document.getElementById('userModalTitle').textContent = isEdit ? 'Edit User' : 'Tambah User';
  document.getElementById('userNama').value = user ? user.nama : '';
  document.getElementById('userUsername').value = user ? user.username : '';
  document.getElementById('userUsername').disabled = isEdit; // username = kunci, tidak diubah setelah dibuat
  document.getElementById('userPin').value = '';
  document.getElementById('userPin').placeholder = isEdit ? 'Kosongkan jika PIN tidak diubah' : 'PIN (angka, min 4 digit)';
  document.getElementById('userRole').value = user ? user.role : 'Staff';
  document.getElementById('userFormError').hidden = true;

  document.getElementById('userModalBackdrop').hidden = false;
  document.getElementById('userModal').hidden = false;
  setTimeout(() => document.getElementById('userNama').focus(), 50);
}

function closeUserModal() {
  document.getElementById('userModalBackdrop').hidden = true;
  document.getElementById('userModal').hidden = true;
  document.getElementById('userUsername').disabled = false;
  editingUsername = null;
}

async function submitUserForm(e) {
  e.preventDefault();
  const nama = document.getElementById('userNama').value.trim();
  const username = document.getElementById('userUsername').value.trim();
  const pin = document.getElementById('userPin').value.trim();
  const role = document.getElementById('userRole').value;
  const errEl = document.getElementById('userFormError');
  errEl.hidden = true;

  if (!nama || !username) {
    errEl.textContent = 'Nama & Username wajib diisi.';
    errEl.hidden = false;
    return;
  }
  if (!editingUsername && !pin) {
    errEl.textContent = 'PIN wajib diisi untuk user baru.';
    errEl.hidden = false;
    return;
  }
  if (pin && !/^\d{4,}$/.test(pin)) {
    errEl.textContent = 'PIN harus angka, minimal 4 digit.';
    errEl.hidden = false;
    return;
  }

  const btnSubmit = document.getElementById('btnSaveUser');
  btnSubmit.disabled = true;
  try {
    await Api.saveUser({ originalUsername: editingUsername || '', nama, username, pin, role });
    showToast(editingUsername ? 'User diperbarui.' : 'User baru ditambahkan.', 'success');
    closeUserModal();
    loadUsers();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.hidden = false;
  } finally {
    btnSubmit.disabled = false;
  }
}

async function toggleUserStatus(username, nextStatus) {
  if (!confirm((nextStatus === 'Nonaktif' ? 'Nonaktifkan' : 'Aktifkan') + ' user "' + username + '"?')) return;
  try {
    await Api.toggleUserStatus({ username, status: nextStatus });
    showToast('Status user diperbarui.', 'success');
    loadUsers();
  } catch (err) {
    showToast(err.message, 'error');
  }
}
