/* ═══════════════════════════════════════════════════════════
   SCHOLAR ANALYTICS — Users Page (updated)
   File: js/users.js
   School admin adds teachers with email + password.
═══════════════════════════════════════════════════════════ */

/* Superadmin has its own users page (sa-users), so this page is admin-only */
const user = requireAuth(['admin']);
if (!user) throw new Error('Not authenticated');
initSidebar(user);

const state = { users: [] };

/* Escape anything that comes from the database before putting it in HTML */
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => (
  { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]
));

const AV_COLOURS = ['av-blue','av-green','av-orange','av-purple','av-teal','av-red'];
const getInitials = (name='') => name.trim().split(' ').filter(Boolean).slice(0,2).map(w=>w[0].toUpperCase()).join('') || '?';
const getAvColour = (name='') => AV_COLOURS[(name.charCodeAt(0) || 0) % AV_COLOURS.length];

/* ── Load users ─────────────────────────────────────────── */
const loadUsers = async () => {
  const result = await API.get('/admin/users');

  if (!result?.ok) {
    showToast(result?.data?.message || 'Failed to load users.', 'error');
    return;
  }

  state.users = result.data.users || [];
  renderStats();
  renderTable();
};

/* ── Stats ──────────────────────────────────────────────── */
const renderStats = () => {
  const set = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };
  set('totalUsers',    state.users.length);
  set('totalAdmins',   state.users.filter(u => u.role === 'admin').length);
  set('totalTeachers', state.users.filter(u => u.role === 'teacher').length);
  set('activeUsers',   state.users.filter(u => u.isActive).length);
};

/* ── Table ──────────────────────────────────────────────── */
const roleColours = {
  admin  : { bg:'rgba(46,134,193,0.10)', text:'#1a6fa8' },
  teacher: { bg:'rgba(39,174,96,0.10)',  text:'#1e8449' },
};

const smallBtn = 'padding:5px 10px;border-radius:6px;border:1px solid var(--border-input);' +
                 'background:white;cursor:pointer;font-size:0.75rem;color:var(--text-mid);';

const renderTable = () => {
  const tbody = document.getElementById('usersTableBody');
  if (!tbody) return;

  if (!state.users.length) {
    tbody.innerHTML = `
      <tr><td colspan="8" style="text-align:center;padding:48px;color:var(--text-soft);">
        <i class="fas fa-users" style="font-size:32px;display:block;margin-bottom:12px;opacity:0.3;"></i>
        No users found. Add a teacher to get started.
      </td></tr>`;
    return;
  }

  tbody.innerHTML = state.users.map((u, i) => {
    const col = roleColours[u.role] || { bg:'rgba(209,220,235,0.4)', text:'#94a3b8' };

    const lastLogin = u.lastLogin
      ? new Date(u.lastLogin).toLocaleDateString('en-KE', { day:'numeric', month:'short', year:'numeric' })
      : 'Never';

    const actions = u.role === 'teacher'
      ? `<div style="display:flex;gap:4px;flex-wrap:wrap;">
           <button title="Reset password" onclick="resetTeacher('${u._id}')" style="${smallBtn}">
             <i class="fas fa-key"></i>
           </button>
           <button onclick="toggleUser('${u._id}','${u.isActive}')" style="${smallBtn}">
             <i class="fas ${u.isActive ? 'fa-user-slash' : 'fa-user-check'}"></i>
             ${u.isActive ? 'Deactivate' : 'Activate'}
           </button>
         </div>`
      : '<span style="color:#94a3b8;font-size:0.78rem;">—</span>';

    return `
      <tr>
        <td>${i+1}</td>
        <td>
          <div style="display:flex;align-items:center;gap:10px;">
            <div style="width:34px;height:34px;border-radius:9px;display:flex;align-items:center;justify-content:center;font-size:0.74rem;font-weight:700;color:white;flex-shrink:0;"
              class="${getAvColour(u.fullName)}">
              ${esc(getInitials(u.fullName))}
            </div>
            <div>
              <p style="font-weight:600;color:var(--text-dark);font-size:0.875rem;">${esc(u.fullName)}</p>
              <p style="font-size:0.72rem;color:var(--text-soft);">${esc(u.phone)}</p>
            </div>
          </div>
        </td>
        <td style="font-size:0.84rem;">${esc(u.email)}</td>
        <td>
          <span style="display:inline-block;padding:3px 10px;border-radius:999px;font-size:0.72rem;font-weight:700;
            background:${col.bg};color:${col.text};text-transform:capitalize;">
            ${esc(u.role)}
          </span>
        </td>
        <td>
          <span style="display:inline-flex;align-items:center;gap:5px;font-size:0.78rem;font-weight:600;
            color:${u.isAccountSetup ? '#27ae60' : '#e67e22'};">
            <i class="fas ${u.isAccountSetup ? 'fa-circle-check' : 'fa-clock'}"></i>
            ${u.isAccountSetup ? 'Complete' : 'Pending'}
          </span>
        </td>
        <td style="font-size:0.80rem;color:var(--text-soft);">${lastLogin}</td>
        <td>
          <span style="display:inline-flex;align-items:center;gap:5px;padding:3px 10px;border-radius:999px;font-size:0.72rem;font-weight:700;
            background:${u.isActive ? 'rgba(39,174,96,0.10)' : 'rgba(209,220,235,0.4)'};
            color:${u.isActive ? '#27ae60' : '#94a3b8'};">
            <i class="fas fa-circle" style="font-size:7px;"></i>
            ${u.isActive ? 'Active' : 'Inactive'}
          </span>
        </td>
        <td>${actions}</td>
      </tr>`;
  }).join('');
};

/* ── Activate / deactivate ──────────────────────────────── */
const toggleUser = async (userId, isActive) => {
  const active = isActive === 'true';

  if (active && !confirm('Deactivate this user? They will not be able to log in.')) return;

  const result = await API.patch(`/admin/teachers/${userId}/toggle`, {});

  if (!result?.ok) {
    showToast(result?.data?.message || 'Failed to update user.', 'error');
    return;
  }

  showToast(active ? 'User deactivated.' : 'User activated.', 'success');
  loadUsers();
};

/* ── Reset a teacher's password ─────────────────────────── */
const resetTeacher = async (userId) => {
  const teacher = state.users.find(u => u._id === userId);
  if (!teacher) return;

  const entered = window.prompt(
    `New password for ${teacher.fullName}.\n\n` +
    `Type one (at least 8 characters), or leave blank to generate a strong one.`
  );
  if (entered === null) return;                 // cancelled

  if (entered && entered.length < 8) {
    showToast('Password must be at least 8 characters.', 'warning');
    return;
  }

  const result = await API.post(
    `/admin/teachers/${userId}/reset`,
    entered ? { newPassword: entered } : {}
  );

  if (!result?.ok) {
    showToast(result?.data?.message || 'Failed to reset password.', 'error');
    return;
  }

  if (entered) {
    showToast('Password reset. Tell the teacher their new password.', 'success');
  } else {
    /* Generated password is shown once, here only */
    window.prompt(
      `New password for ${teacher.fullName} (copy it now, it will not be shown again):`,
      result.data.newPassword
    );
  }
};

/* ── Add teacher ────────────────────────────────────────── */
const addTeacher = async () => {
  const name     = document.getElementById('teacherName').value.trim();
  const email    = document.getElementById('teacherEmail').value.trim();
  const phone    = document.getElementById('teacherPhone').value.trim();
  const password = document.getElementById('teacherPassword')?.value || '';

  if (!name || !email) {
    showToast('Name and email are required.', 'warning');
    return;
  }
  if (!password) {
    showToast('Please set a password for the teacher.', 'warning');
    return;
  }
  if (password.length < 8) {
    showToast('Password must be at least 8 characters.', 'warning');
    return;
  }

  const text    = document.getElementById('saveTeacherText');
  const spinner = document.getElementById('saveTeacherSpinner');
  const btn     = document.getElementById('saveTeacherBtn');

  if (text)    text.style.display    = 'none';
  if (spinner) spinner.style.display = 'inline';
  if (btn)     btn.disabled          = true;

  const result = await API.post('/admin/teachers', { fullName: name, email, phone, password });

  if (text)    text.style.display    = 'inline';
  if (spinner) spinner.style.display = 'none';
  if (btn)     btn.disabled          = false;

  if (!result?.ok) {
    showToast(result?.data?.message || 'Failed to create teacher.', 'error');
    return;
  }

  showToast(`Teacher added. They can log in with ${email}.`, 'success');
  closeTeacherModal();
  loadUsers();
};

const closeTeacherModal = () => {
  document.getElementById('teacherModalOverlay').classList.remove('open');
  document.body.style.overflow = '';
  document.getElementById('teacherName').value  = '';
  document.getElementById('teacherEmail').value = '';
  document.getElementById('teacherPhone').value = '';
  const pw = document.getElementById('teacherPassword');
  if (pw) pw.value = '';                         // don't leave the password in the form
};

/* ── Event listeners ────────────────────────────────────── */
document.getElementById('addTeacherBtn')?.addEventListener('click', () => {
  document.getElementById('teacherModalOverlay').classList.add('open');
  document.body.style.overflow = 'hidden';
});
document.getElementById('teacherModalClose')?.addEventListener('click',  closeTeacherModal);
document.getElementById('teacherModalCancel')?.addEventListener('click', closeTeacherModal);
document.getElementById('saveTeacherBtn')?.addEventListener('click',     addTeacher);

window.toggleUser   = toggleUser;
window.resetTeacher = resetTeacher;

loadUsers();