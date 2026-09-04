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
      const approveBtn = e.target.closest('[data-action="approve-user"]');
      const rejectBtn = e.target.closest('[data-action="reject-user"]');
      const deleteBtn = e.target.closest('[data-action="delete-user"]');
      if (editBtn) {
        const u = usersCache.find((it) => it.username === editBtn.dataset.username);
        if (u) openUserModal(u);
      } else if (approveBtn) {
        const u = usersCache.find((it) => it.username === approveBtn.dataset.username);
        if (u) openUserModal(u);
      } else if (rejectBtn) {
        rejectUser(rejectBtn.dataset.username);
      } else if (deleteBtn && !deleteBtn.disabled) {
        deleteUser(deleteBtn.dataset.username);
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
const STATUS_PENDING = 'Menunggu Persetujuan'; // harus sama persis dengan STATUS_PENDING di Code.gs

function renderUsersList() {
  const wrap = document.getElementById('usersList');
  if (!usersCache.length) {
    wrap.innerHTML = '<div class="empty-state">Belum ada user. Klik "+ Tambah User" untuk mulai.</div>';
    return;
  }

  const me = Auth.getUser();
  // Pendaftar baru (menunggu persetujuan) ditaruh paling atas biar Admin tidak
  // perlu scroll buat lihat siapa yang perlu ditindaklanjuti.
  const sorted = usersCache.slice().sort((a, b) => {
    const aPending = a.status === STATUS_PENDING ? 0 : 1;
    const bPending = b.status === STATUS_PENDING ? 0 : 1;
    return aPending - bPending;
  });

  wrap.innerHTML = sorted.map((u) => {
    const isPending = u.status === STATUS_PENDING;
    const isAktif = u.status !== 'Nonaktif' && !isPending;
    const isSelf = !!(me && me.username && me.username.toLowerCase() === String(u.username).toLowerCase());
    const badgeClass = ROLE_BADGE_CLASS[u.role] || 'role-badge-staff';

    if (isPending) {
      return `
        <div class="md-item">
          <div class="md-item-main">
            <div class="md-item-title">
              <span class="status-pill status-pending">Menunggu Persetujuan</span>
              ${escapeHtml(u.nama)}
            </div>
            <div class="md-item-sub">@${escapeHtml(u.username)} · Daftar sendiri, belum punya Role</div>
          </div>
          <div class="md-item-actions">
            <button type="button" class="btn btn-small" data-action="reject-user" data-username="${escapeHtml(u.username)}">Tolak</button>
            <button type="button" class="btn btn-small btn-primary" data-action="approve-user" data-username="${escapeHtml(u.username)}">Setujui</button>
          </div>
        </div>`;
    }

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
          <button type="button" class="btn-icon btn-icon-danger" data-action="delete-user" data-username="${escapeHtml(u.username)}"
            title="${isSelf ? 'Tidak bisa hapus akun sendiri' : 'Hapus user permanen'}" aria-label="Hapus user"
            ${isSelf ? 'disabled' : ''}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-.9 14a2 2 0 0 1-2 1.9H7.9a2 2 0 0 1-2-1.9L5 6"/><path d="M10 11v6M14 11v6"/></svg>
          </button>
        </div>
      </div>`;
  }).join('');
}

function openUserModal(user) {
  editingUsername = user ? user.username : null;
  const isEdit = !!user;
  const isApproving = !!(user && user.status === STATUS_PENDING);
  document.getElementById('userModalTitle').textContent = isApproving ? 'Setujui User' : (isEdit ? 'Edit User' : 'Tambah User');
  document.getElementById('userNama').value = user ? user.nama : '';
  document.getElementById('userUsername').value = user ? user.username : '';
  document.getElementById('userUsername').disabled = isEdit; // username = kunci, tidak diubah setelah dibuat
  document.getElementById('userPin').value = '';
  document.getElementById('userPin').placeholder = isApproving
    ? 'Kosongkan supaya Password yang dia daftarkan tetap dipakai'
    : (isEdit ? 'Kosongkan jika Password tidak diubah' : 'Password (min 4 karakter)');
  // Pendaftar-sendiri belum punya Role — default-kan ke Staff, Admin tinggal
  // ganti kalau perlu sebelum klik Simpan (Simpan = otomatis menyetujui akun).
  document.getElementById('userRole').value = user && user.role ? user.role : 'Staff';
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
    errEl.textContent = 'Password wajib diisi untuk user baru.';
    errEl.hidden = false;
    return;
  }
  if (pin && pin.length < 4) {
    errEl.textContent = 'Password minimal 4 karakter.';
    errEl.hidden = false;
    return;
  }

  const wasApproving = !!(editingUsername && usersCache.find((it) => it.username === editingUsername && it.status === STATUS_PENDING));

  const btnSubmit = document.getElementById('btnSaveUser');
  btnSubmit.disabled = true;
  try {
    await Api.saveUser({ originalUsername: editingUsername || '', nama, username, pin, role });
    showToast(wasApproving ? 'User disetujui & diaktifkan.' : (editingUsername ? 'User diperbarui.' : 'User baru ditambahkan.'), 'success');
    closeUserModal();
    loadUsers();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.hidden = false;
  } finally {
    btnSubmit.disabled = false;
  }
}

async function rejectUser(username) {
  const ok = await showConfirmModal({
    title: 'Tolak Pendaftaran',
    message: 'Tolak pendaftaran "' + username + '"? Data pendaftarannya akan dihapus permanen.',
    confirmText: 'Tolak',
    danger: true
  });
  if (!ok) return;
  try {
    await Api.rejectUser({ username });
    showToast('Pendaftaran ditolak.', 'success');
    loadUsers();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deleteUser(username) {
  const ok = await showConfirmModal({
    title: 'Hapus User',
    message: 'Hapus user "' + username + '" secara PERMANEN? Aksi ini tidak bisa dibatalkan — kalau cuma mau nonaktifkan sementara, pakai tombol Aktif/Nonaktif saja.',
    confirmText: 'Hapus Permanen',
    danger: true
  });
  if (!ok) return;
  try {
    await Api.deleteUser({ username });
    showToast('User dihapus.', 'success');
    loadUsers();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function toggleUserStatus(username, nextStatus) {
  const aksi = nextStatus === 'Nonaktif' ? 'Nonaktifkan' : 'Aktifkan';
  const ok = await showConfirmModal({
    title: aksi + ' User',
    message: aksi + ' user "' + username + '"?',
    confirmText: aksi,
    danger: nextStatus === 'Nonaktif'
  });
  if (!ok) return;
  try {
    await Api.toggleUserStatus({ username, status: nextStatus });
    showToast('Status user diperbarui.', 'success');
    loadUsers();
  } catch (err) {
    showToast(err.message, 'error');
  }
}
