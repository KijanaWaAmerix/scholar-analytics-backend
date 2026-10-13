/* ═══════════════════════════════════════════════════════════
   SCHOLAR ANALYTICS — Students Page
   File: js/students.js  Version: 4.0
   Connected to real MongoDB backend
═══════════════════════════════════════════════════════════ */

/* ── Auth ─────────────────────────────────────────────────── */
const user = requireAuth();
if (!user) throw new Error('Not authenticated');
initSidebar(user);

/* ══════════════════════════════════════════════════════════
   STATE
══════════════════════════════════════════════════════════ */
const state = {
  students  : [],
  classes   : [],
  pagination: { total:0, page:1, pages:1, limit:50 },
  filters   : { search:'', class:'', gender:'', status:'' },
  editingId : null,
  deleteId  : null,
  importing : [],
  importClassId: '',
};

/* ══════════════════════════════════════════════════════════
   DOM REFS
══════════════════════════════════════════════════════════ */
const el = {
  searchInput     : document.getElementById('searchInput'),
  filterClass     : document.getElementById('filterClass'),
  filterGender    : document.getElementById('filterGender'),
  filterStatus    : document.getElementById('filterStatus'),
  resetBtn        : document.getElementById('resetFilters'),
  addBtn          : document.getElementById('addStudentBtn'),
  importBtn       : document.getElementById('importExcelBtn'),
  exportBtn       : document.getElementById('exportBtn'),
  tableBody       : document.getElementById('studentsTableBody'),
  tableCount      : document.getElementById('tableCount'),
  pagination      : document.getElementById('pagination'),
  totalStat       : document.getElementById('totalStudents'),
  maleStat        : document.getElementById('totalMale'),
  femaleStat      : document.getElementById('totalFemale'),
  activeStat      : document.getElementById('totalActive'),
  inactiveStat    : document.getElementById('totalInactive'),
};

/* Avatar helpers */
const AV = ['av-blue','av-green','av-orange','av-purple','av-teal','av-red'];
const getInitials = n => n?.trim().split(' ').filter(Boolean).slice(0,2).map(w=>w[0].toUpperCase()).join('') || '?';
const getAvColour = n => AV[(n?.charCodeAt(0)||0) % AV.length];

/* ══════════════════════════════════════════════════════════
   LOAD CLASSES (for dropdowns)
══════════════════════════════════════════════════════════ */
const loadClasses = async () => {
  const result = await API.get('/classes');
  if (!result?.ok) return;

  state.classes = result.data.classes || [];

  /* Populate filter dropdown */
  const filterSel = el.filterClass;
  if (filterSel) {
    filterSel.innerHTML = '<option value="">All Classes</option>' +
      state.classes.map(c =>
        `<option value="${c._id}">${c.name}</option>`
      ).join('');
  }

  /* Populate add/edit modal class dropdown */
  const modalSel = document.getElementById('studentClass');
  if (modalSel) {
    modalSel.innerHTML = '<option value="">-- Select Class --</option>' +
      state.classes.map(c =>
        `<option value="${c._id}">${c.name}</option>`
      ).join('');
  }

  /* Import modal class dropdown */
  const importSel = document.getElementById('importClass');
  if (importSel) {
    importSel.innerHTML = '<option value="">-- Select Class --</option>' +
      state.classes.map(c =>
        `<option value="${c._id}">${c.name}</option>`
      ).join('');
  }
};

/* ══════════════════════════════════════════════════════════
   LOAD STUDENTS FROM API
══════════════════════════════════════════════════════════ */
const loadStudents = async (page = 1) => {

  /* Show skeleton */
  if (el.tableBody) {
    el.tableBody.innerHTML = Skeleton.table(8, 8);
  }

  /* Build query */
  const params = new URLSearchParams({
    page  : page,
    limit : state.pagination.limit,
  });

  if (state.filters.search) params.set('search', state.filters.search);
  if (state.filters.class)  params.set('class',  state.filters.class);
  if (state.filters.gender) params.set('gender', state.filters.gender);
  if (state.filters.status) params.set('status', state.filters.status);

  const result = await API.get(`/students?${params}`);

  if (!result?.ok) {
    showToast('Failed to load students.', 'error');
    if (el.tableBody) {
      el.tableBody.innerHTML = `
        <tr><td colspan="8" style="text-align:center;padding:40px;color:var(--text-soft);">
          <i class="fas fa-triangle-exclamation" style="font-size:24px;display:block;margin-bottom:10px;color:var(--danger);opacity:0.5;"></i>
          Failed to load students. Check your connection.
        </td></tr>`;
    }
    return;
  }

  state.students   = result.data.students   || [];
  state.pagination = result.data.pagination || state.pagination;
  state.pagination.page = page;

  /* Update stats */
  const stats = result.data.stats || {};
  updateStats(stats);

  /* Render */
  renderTable();
  renderPagination();
};

/* ══════════════════════════════════════════════════════════
   UPDATE STATS STRIP
══════════════════════════════════════════════════════════ */
const updateStats = (stats) => {
  const set = (id, val) => {
    const e = document.getElementById(id);
    if (e) e.textContent = val ?? '--';
  };

  set('statTotal',    stats.total    || 0);
  set('statMale',     stats.male     || 0);
  set('statFemale',   stats.female   || 0);
  set('statActive',   stats.active   || 0);
  set('statInactive', stats.inactive || 0);
};

/* ══════════════════════════════════════════════════════════
   RENDER TABLE
══════════════════════════════════════════════════════════ */
const renderTable = () => {
  if (!el.tableBody) return;

  if (!state.students.length) {
    el.tableBody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align:center;padding:56px;color:var(--text-soft);">
          <i class="fas fa-user-graduate" style="font-size:36px;display:block;margin-bottom:14px;opacity:0.2;"></i>
          <p style="font-size:1rem;font-weight:600;color:var(--text-dark);margin-bottom:6px;">No students found</p>
          <p style="font-size:0.875rem;">
            ${state.filters.search || state.filters.class || state.filters.gender
              ? 'Try adjusting your filters.'
              : 'Click <strong>Add Learner</strong> to get started.'}
          </p>
        </td>
      </tr>`;
    if (el.tableCount) el.tableCount.textContent = '0 students';
    return;
  }

  const start = (state.pagination.page - 1) * state.pagination.limit;

  el.tableBody.innerHTML = state.students.map((s, i) => {
    const dob = s.dateOfBirth
      ? new Date(s.dateOfBirth).toLocaleDateString('en-KE', {
          day:'numeric', month:'short', year:'numeric'
        })
      : '—';

    const genderIcon  = s.gender === 'female'
      ? '<i class="fas fa-venus"  style="color:#e91e8c;font-size:11px;"></i>'
      : '<i class="fas fa-mars"   style="color:#1a6fa8;font-size:11px;"></i>';

    return `
      <tr id="row-${s._id}">

        <!-- Checkbox -->
        <td class="th-check">
          <input type="checkbox" class="student-checkbox" data-id="${s._id}"/>
        </td>

        <!-- Number -->
        <td class="th-num">${start + i + 1}</td>

        <!-- Name -->
        <td>
          <div class="student-name-cell">
            <div class="student-avatar ${getAvColour(s.fullName)}">
              ${getInitials(s.fullName)}
            </div>
            <div>
              <div class="student-name">${s.fullName}</div>
              <div class="student-dob">${dob}</div>
            </div>
          </div>
        </td>

        <!-- Admission No -->
        <td style="font-size:var(--text-sm);color:var(--text-mid);">
          ${s.admissionNo || '<span style="color:var(--text-light);">—</span>'}
        </td>

        <!-- Assessment No -->
        <td style="font-size:var(--text-sm);color:var(--text-mid);">
          ${s.assessmentNo || '—'}
        </td>

        <!-- Class -->
        <td>
          <span class="class-badge">
            <i class="fas fa-school" style="font-size:9px;"></i>
            ${s.class?.name || '—'}
          </span>
        </td>

        <!-- Gender -->
        <td>
          <span style="display:inline-flex;align-items:center;gap:5px;font-size:var(--text-sm);font-weight:600;color:var(--text-mid);text-transform:capitalize;">
            ${genderIcon} ${s.gender || '—'}
          </span>
        </td>

        <!-- Parent -->
        <td>
          <div style="font-size:var(--text-sm);font-weight:600;color:var(--text-dark);">${s.parentName || '—'}</div>
          <div style="font-size:var(--text-xs);color:var(--text-soft);">${s.parentContact || ''}</div>
        </td>

        <!-- Status -->
        <td>
          <span class="badge ${s.isActive ? 'badge-success' : 'badge-neutral'}">
            <span class="dot"></span>
            ${s.isActive ? 'Active' : 'Inactive'}
          </span>
        </td>

        <!-- Actions -->
        <td class="th-actions">
          <button class="action-btn edit"   onclick="openEdit('${s._id}')" title="Edit"><i class="fas fa-pen"></i></button>
          <button class="action-btn delete" onclick="openDelete('${s._id}','${s.fullName.replace(/'/g,"\\'")}')  " title="Delete"><i class="fas fa-trash"></i></button>
        </td>

      </tr>`;
  }).join('');

  if (el.tableCount) {
    el.tableCount.textContent =
      `Showing ${state.students.length} of ${state.pagination.total} students`;
  }
};

/* ══════════════════════════════════════════════════════════
   PAGINATION
══════════════════════════════════════════════════════════ */
const renderPagination = () => {
  const wrap = document.getElementById('paginationEl');
  if (!wrap) return;

  const { page, pages } = state.pagination;
  if (pages <= 1) { wrap.innerHTML = ''; return; }

  let html = `
    <button class="page-btn" onclick="changePage(${page-1})"
      ${page <= 1 ? 'disabled' : ''}>
      <i class="fas fa-chevron-left"></i>
    </button>`;

  for (let p = 1; p <= pages; p++) {
    if (p === 1 || p === pages || (p >= page-1 && p <= page+1)) {
      html += `<button class="page-btn ${p === page ? 'active' : ''}"
        onclick="changePage(${p})">${p}</button>`;
    } else if (p === page-2 || p === page+2) {
      html += `<span class="page-dots">...</span>`;
    }
  }

  html += `
    <button class="page-btn" onclick="changePage(${page+1})"
      ${page >= pages ? 'disabled' : ''}>
      <i class="fas fa-chevron-right"></i>
    </button>`;

  wrap.innerHTML = html;
};

window.changePage = (p) => {
  if (p < 1 || p > state.pagination.pages) return;
  loadStudents(p);
};

/* ══════════════════════════════════════════════════════════
   FILTERS
══════════════════════════════════════════════════════════ */
let searchTimeout;

el.searchInput?.addEventListener('input', (e) => {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    state.filters.search = e.target.value.trim();
    loadStudents(1);
  }, 400);
});

el.filterClass?.addEventListener('change', (e) => {
  state.filters.class = e.target.value;
  loadStudents(1);
});

el.filterGender?.addEventListener('change', (e) => {
  state.filters.gender = e.target.value;
  loadStudents(1);
});

el.filterStatus?.addEventListener('change', (e) => {
  state.filters.status = e.target.value;
  loadStudents(1);
});

el.resetBtn?.addEventListener('click', () => {
  state.filters = { search:'', class:'', gender:'', status:'' };
  if (el.searchInput)  el.searchInput.value  = '';
  if (el.filterClass)  el.filterClass.value  = '';
  if (el.filterGender) el.filterGender.value = '';
  if (el.filterStatus) el.filterStatus.value = '';
  loadStudents(1);
});

/* ══════════════════════════════════════════════════════════
   ADD / EDIT STUDENT MODAL
══════════════════════════════════════════════════════════ */
el.addBtn?.addEventListener('click', openAdd);

function openAdd() {
  state.editingId = null;

  const title = document.getElementById('studentModalTitle');
  const sub   = document.getElementById('studentModalSub');
  if (title) title.textContent = 'Add New Learner';
  if (sub)   sub.textContent   = 'Fill in the learner details below';

  clearStudentForm();
  openModal('studentModal');
}

window.openEdit = async (id) => {
  state.editingId = id;

  const title = document.getElementById('studentModalTitle');
  const sub   = document.getElementById('studentModalSub');
  if (title) title.textContent = 'Edit Learner';
  if (sub)   sub.textContent   = 'Update learner information';

  /* Load student data */
  const result = await API.get(`/students/${id}`);
  if (!result?.ok) { showToast('Failed to load student data.', 'error'); return; }

  const s = result.data.student;

  /* Fill form */
  const set = (id, val) => {
    const e = document.getElementById(id);
    if (e) e.value = val || '';
  };

  set('studentFullName',    s.fullName);
  set('studentGender',      s.gender);
  set('studentDOB',         s.dateOfBirth ? s.dateOfBirth.split('T')[0] : '');
  set('studentUPI',         s.upiNumber);
  set('studentAdmissionNo', s.admissionNo);
  set('studentAssessmentNo',s.assessmentNo);
  set('studentClass',       s.class?._id || '');
  set('studentParentName',  s.parentName);
  set('studentParentPhone', s.parentContact);

  const statusEl = document.getElementById('studentStatus');
  if (statusEl) statusEl.value = s.isActive ? 'active' : 'inactive';

  openModal('studentModal');
};

const clearStudentForm = () => {
  ['studentFullName','studentGender','studentDOB','studentUPI',
   'studentAdmissionNo','studentAssessmentNo','studentClass','studentParentName',
   'studentParentPhone','studentStatus'].forEach(id => {
    const e = document.getElementById(id);
    if (e) e.value = '';
  });
};

document.getElementById('saveStudentBtn')?.addEventListener('click', saveStudent);

async function saveStudent() {
  const fullName     = document.getElementById('studentFullName')?.value.trim();
  const gender       = document.getElementById('studentGender')?.value;
  const dateOfBirth  = document.getElementById('studentDOB')?.value;
  const upiNumber    = document.getElementById('studentUPI')?.value.trim();
  const admissionNo  = document.getElementById('studentAdmissionNo')?.value.trim();
  const assessmentNo = document.getElementById('studentAssessmentNo')?.value.trim();
  const classId      = document.getElementById('studentClass')?.value;
  const parentName   = document.getElementById('studentParentName')?.value.trim();
  const parentContact= document.getElementById('studentParentPhone')?.value.trim();
  const isActive     = document.getElementById('studentStatus')?.value !== 'inactive';

  /* Validation */
  if (!fullName) {
    showToast('Full name is required.', 'warning');
    document.getElementById('studentFullName')?.focus();
    return;
  }
  if (!gender)  { showToast('Please select gender.', 'warning'); return; }
  if (!classId) { showToast('Please select a class.', 'warning'); return; }

  const btn = document.getElementById('saveStudentBtn');
  if (btn) btn.disabled = true;
const payload = {
  fullName,
  gender,
  dateOfBirth,
  upiNumber    : upiNumber?.trim()    || undefined,
  admissionNo  : admissionNo || '',
  assessmentNo : assessmentNo?.trim() || undefined,
  classId,
  parentName,
  parentContact,
  isActive,
  };

  let result;

  if (state.editingId) {
    result = await API.put(`/students/${state.editingId}`, payload);
  } else {
    result = await API.post('/students', payload);
  }

  if (btn) btn.disabled = false;

  if (!result?.ok) {
    showToast(result?.data?.message || 'Failed to save student.', 'error');
    return;
  }

  showToast(
    state.editingId
      ? `${fullName} updated successfully.`
      : `${fullName} added successfully.`,
    'success'
  );

  closeModal('studentModal');
  loadStudents(state.pagination.page);
}

/* ══════════════════════════════════════════════════════════
   DELETE STUDENT
══════════════════════════════════════════════════════════ */
window.openDelete = (id, name) => {
  state.deleteId = id;
  const nameEl = document.getElementById('deleteStudentName');
  if (nameEl) nameEl.textContent = name;
  openModal('deleteStudentModal');
};

document.getElementById('confirmDeleteBtn')?.addEventListener('click', async () => {
  if (!state.deleteId) return;

  const result = await API.delete(`/students/${state.deleteId}`);

  if (!result?.ok) {
    showToast(result?.data?.message || 'Failed to delete student.', 'error');
    return;
  }

  showToast('Student deleted successfully.', 'success');
  closeModal('deleteStudentModal');
  state.deleteId = null;
  loadStudents(state.pagination.page);
});

/* ══════════════════════════════════════════════════════════
   EXCEL / CSV IMPORT
   One class at a time. Columns: Full Name, Gender (required),
   Admission No, Assessment No (optional). Learners are shown
   A–Z, and learners already in the class are skipped.
══════════════════════════════════════════════════════════ */
const IMPORT_TEMPLATE_HEADERS = ['Full Name', 'Gender', 'Admission No', 'Assessment No'];

const importEl = {
  drop   : document.getElementById('dropZone'),
  input  : document.getElementById('importFileInput'),
  bar    : document.getElementById('fileInfoBar'),
  name   : document.getElementById('fileInfoName'),
  size   : document.getElementById('fileInfoSize'),
  remove : document.getElementById('fileRemoveBtn'),
  count  : document.getElementById('importCount'),
  preview: document.getElementById('importPreviewTable'),
  note   : document.getElementById('importFooterNote'),
  confirm: document.getElementById('confirmImportBtn'),
  text   : document.getElementById('confirmImportText'),
  spin   : document.getElementById('confirmImportSpinner'),
  cls    : document.getElementById('importClass'),
};

const normKey = (k) => String(k).toLowerCase().replace(/[^a-z0-9]/g, '');
const COLS = {
  fullName    : ['fullname', 'name', 'names', 'namesofstudents', 'namesofstudent', 'namesoflearners', 'namesoflearner',
                 'nameofstudent', 'nameoflearner', 'learnername', 'learnernames', 'studentname', 'studentsname', 'studentnames',
                 'pupilname', 'pupil', 'candidatename', 'learner', 'learners', 'student', 'students'],
  gender      : ['gender', 'sex', 'g'],
  admissionNo : ['admissionno', 'admissionnumber', 'admno', 'admission', 'adm', 'adno'],
  assessmentNo: ['assessmentno', 'assessmentnumber', 'assessment', 'assno', 'assessmentnum', 'assnumber'],
};

const FOOTER_NAMES = /^(total|totals|mean|average|avg|sum|grand total|mean score|class mean|rank|position|subject|subjects|key|signature)$/i;

const cellText = (v) => (v === undefined || v === null ? '' : String(v).trim());

const toGender = (g) => {
  const v = String(g || '').trim().toLowerCase();
  if (['male', 'm', 'boy', 'b'].includes(v))    return 'male';
  if (['female', 'f', 'girl', 'g'].includes(v)) return 'female';
  return null;
};

const escapeHtml = (t) => String(t ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* Find the header row anywhere in the first rows (school titles above it are fine),
   then read the name / gender / admission / assessment columns. Marks, totals and
   ranks in the file are simply ignored. */
const parseImportSheet = (aoa) => {
  let headerRow = -1, nameCol = -1;
  for (let r = 0; r < Math.min(aoa.length, 40) && headerRow < 0; r++) {
    for (let c = 0; c < (aoa[r] || []).length; c++) {
      if (COLS.fullName.includes(normKey(cellText(aoa[r][c])))) { headerRow = r; nameCol = c; break; }
    }
  }

  const findCol = (names) => {
    if (headerRow < 0) return -1;
    return (aoa[headerRow] || []).findIndex(h => names.includes(normKey(cellText(h))));
  };

  /* No recognisable header: treat column A as the names */
  if (headerRow < 0) { nameCol = 0; }
  const genderCol = findCol(COLS.gender);
  const admCol    = findCol(COLS.admissionNo);
  const assCol    = findCol(COLS.assessmentNo);

  const rows = [];
  for (let r = headerRow + 1; r < aoa.length; r++) {
    const line = aoa[r] || [];
    const fullName = cellText(line[nameCol]).replace(/[`´]/g, '').replace(/\s+/g, ' ').trim();
    if (!fullName) continue;
    if (FOOTER_NAMES.test(fullName)) continue;
    if (/^[\d.\s-]+$/.test(fullName)) continue;           // a number is not a name

    const genderIn = genderCol >= 0 ? cellText(line[genderCol]) : '';
    const gender   = toGender(genderIn);
    let problem = '', note = '';

    if (genderCol >= 0) {
      /* the file has a Gender column, so every learner needs a valid one */
      if (!genderIn)     problem = 'Gender is missing';
      else if (!gender)  problem = 'Gender must be Male or Female';
    } else {
      note = 'No gender in file — add later';
    }

    rows.push({
      line: r + 1, fullName, gender: gender || '',
      admissionNo : admCol >= 0 ? cellText(line[admCol]) : '',
      assessmentNo: assCol >= 0 ? cellText(line[assCol]) : '',
      problem, note,
    });
  }

  rows.sort((a, b) => a.fullName.localeCompare(b.fullName, 'en', { sensitivity: 'base' }));
  return { rows, hasGender: genderCol >= 0, foundHeader: headerRow >= 0 };
};

const resetImport = () => {
  state.importing = [];
  if (importEl.input)   importEl.input.value = '';
  if (importEl.bar)     importEl.bar.style.display = 'none';
  if (importEl.drop)    importEl.drop.style.display = '';
  if (importEl.count)   importEl.count.textContent = '';
  if (importEl.preview) importEl.preview.innerHTML = '';
  if (importEl.note)    importEl.note.style.display = 'none';
  if (importEl.confirm) importEl.confirm.disabled = true;
  if (importEl.text)    importEl.text.style.display = '';
  if (importEl.spin)    importEl.spin.style.display = 'none';
};

const renderImportPreview = () => {
  const rows  = state.importing;
  const bad   = rows.filter(r => r.problem).length;
  const good  = rows.length - bad;

  if (importEl.count) {
    importEl.count.innerHTML =
      `<strong>${good}</strong> learner${good === 1 ? '' : 's'} ready to import (A–Z)` +
      (state.importMeta && !state.importMeta.hasGender && good ? ` &nbsp;·&nbsp; <span style="color:#b9770e;">no Gender column found — learners are added without gender (set it later)</span>` : '') +
      (bad ? ` &nbsp;·&nbsp; <span style="color:#c0392b;"><strong>${bad}</strong> need attention and will be skipped</span>` : '');
  }

  const th = 'padding:6px 10px;color:rgba(255,255,255,0.85);text-align:left;font-size:10px;text-transform:uppercase;';
  const td = 'padding:6px 10px;color:#2c3e50;border-bottom:1px solid #e2e8f0;';
  if (importEl.preview) {
    importEl.preview.innerHTML = `
      <div style="max-height:260px;overflow:auto;border:1px solid #e2e8f0;border-radius:8px;">
      <table style="width:100%;border-collapse:collapse;font-size:12px;">
        <thead style="position:sticky;top:0;"><tr style="background:#0d3349;">
          <th style="${th}">#</th><th style="${th}">Full name</th><th style="${th}">Gender</th>
          <th style="${th}">Admission no</th><th style="${th}">Assessment no</th><th style="${th}"></th>
        </tr></thead>
        <tbody>${rows.map((r, i) => `
          <tr style="background:${r.problem ? '#fdecea' : (i % 2 ? '#f8fafc' : '#ffffff')};">
            <td style="${td}">${i + 1}</td>
            <td style="${td}font-weight:600;">${escapeHtml(r.fullName) || '—'}</td>
            <td style="${td}text-transform:capitalize;">${r.gender || '—'}</td>
            <td style="${td}">${escapeHtml(r.admissionNo) || '—'}</td>
            <td style="${td}">${escapeHtml(r.assessmentNo) || '—'}</td>
            <td style="${td}color:${r.problem ? '#c0392b' : '#b9770e'};font-weight:600;">${escapeHtml(r.problem || r.note || '')}</td>
          </tr>`).join('')}
        </tbody>
      </table></div>`;
  }

  if (importEl.note)    importEl.note.style.display = bad ? '' : 'none';
  if (importEl.confirm) importEl.confirm.disabled = good === 0;
};

const handleImportFile = (file) => {
  if (!file) return;

  if (typeof XLSX === 'undefined') {
    showToast('Excel reader did not load. Please refresh the page.', 'error');
    return;
  }
  if (!/\.(xlsx|xls|csv)$/i.test(file.name)) {
    showToast('Please choose an .xlsx, .xls or .csv file.', 'warning');
    return;
  }

  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const wb  = XLSX.read(new Uint8Array(ev.target.result), { type: 'array' });
            /* use the first sheet that actually holds learners */
      let parsed = { rows: [] };
      for (const name of wb.SheetNames) {
        const aoa = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '', raw: false, blankrows: false });
        const p = parseImportSheet(aoa);
        if (p.rows.length) { parsed = p; break; }
      }
      const rows = parsed.rows;
      state.importMeta = { hasGender: parsed.hasGender };

      if (!rows.length) {
        showToast('No learners found in that file.', 'warning');
        return;
      }

      state.importing = rows;
      if (importEl.name) importEl.name.textContent = file.name;
      if (importEl.size) importEl.size.textContent = (file.size / 1024).toFixed(1) + ' KB';
      if (importEl.bar)  importEl.bar.style.display = 'flex';
      if (importEl.drop) importEl.drop.style.display = 'none';
      renderImportPreview();
    } catch (err) {
      console.error(err);
      showToast('Could not read that file. Is it a valid Excel or CSV file?', 'error');
    }
  };
  reader.readAsArrayBuffer(file);
};

/* Open the picker, drag & drop, change, remove */
importEl.drop?.addEventListener('click', () => importEl.input?.click());
['dragenter', 'dragover'].forEach(ev => importEl.drop?.addEventListener(ev, (e) => {
  e.preventDefault(); importEl.drop.classList.add('drag-over');
}));
['dragleave', 'drop'].forEach(ev => importEl.drop?.addEventListener(ev, (e) => {
  e.preventDefault(); importEl.drop.classList.remove('drag-over');
}));
importEl.drop?.addEventListener('drop', (e) => handleImportFile(e.dataTransfer?.files?.[0]));
importEl.input?.addEventListener('change', (e) => handleImportFile(e.target.files[0]));
importEl.remove?.addEventListener('click', resetImport);

el.importBtn?.addEventListener('click', () => {
  resetImport();
  openModal('importModalOverlay');
});

/* Blank template with the right columns */
document.getElementById('downloadTemplateBtn')?.addEventListener('click', () => {
  const clsName = importEl.cls?.selectedOptions?.[0]?.textContent?.trim();
  const base = 'Learners_Import_Template' + (clsName && !clsName.startsWith('--') ? '_' + clsName.replace(/\s+/g, '_') : '');
  if (typeof XLSX !== 'undefined') {
    const ws = XLSX.utils.aoa_to_sheet([IMPORT_TEMPLATE_HEADERS]);
    ws['!cols'] = [{ wch: 30 }, { wch: 10 }, { wch: 16 }, { wch: 16 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Learners');
    XLSX.writeFile(wb, base + '.xlsx');
  } else {
    const blob = new Blob(['﻿' + IMPORT_TEMPLATE_HEADERS.join(',') + '\n'], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = base + '.csv'; a.click();
    URL.revokeObjectURL(a.href);
  }
});

importEl.confirm?.addEventListener('click', async () => {
  const classId = importEl.cls?.value;

  if (!classId) {
    showToast('Please select the class first.', 'warning');
    importEl.cls?.focus();
    return;
  }

  const good = state.importing.filter(r => !r.problem);
  if (!good.length) {
    showToast('There are no valid learners to import.', 'warning');
    return;
  }

  importEl.confirm.disabled = true;
  if (importEl.text) importEl.text.style.display = 'none';
  if (importEl.spin) importEl.spin.style.display = 'inline';

  const result = await API.post('/students/bulk-import', {
    classId,
    students: good.map(r => ({
      fullName: r.fullName, gender: r.gender || '',
      admissionNo: r.admissionNo, assessmentNo: r.assessmentNo,
    })),
  });

  if (importEl.text) importEl.text.style.display = '';
  if (importEl.spin) importEl.spin.style.display = 'none';

  if (!result?.ok) {
    importEl.confirm.disabled = false;
    showToast(result?.data?.message || 'Import failed.', 'error');
    return;
  }

  const r = result.data.results || {};
  const skipped = r.skippedNames || [];
  const errors  = r.errors || [];
  showToast(result.data.message, errors.length ? 'warning' : 'success');
  loadStudents(1);

  if (!skipped.length && !errors.length) {
    closeModal('importModal');
    resetImport();
    return;
  }

  /* Show what was skipped, so nothing disappears silently */
  if (importEl.count) importEl.count.innerHTML = `<strong>${r.created || 0}</strong> imported. Details below:`;
  if (importEl.preview) {
    importEl.preview.innerHTML = `
      <div style="max-height:260px;overflow:auto;border:1px solid #e2e8f0;border-radius:8px;padding:10px 14px;font-size:12px;line-height:1.7;">
        ${skipped.length ? `<p style="font-weight:700;margin:0 0 4px;">Already in the class — skipped (${skipped.length})</p>
          <p style="margin:0 0 10px;">${skipped.map(escapeHtml).join(', ')}</p>` : ''}
        ${errors.length ? `<p style="font-weight:700;margin:0 0 4px;color:#c0392b;">Could not import (${errors.length})</p>
          <p style="margin:0;">${errors.map(e => escapeHtml(e.row) + ' — ' + escapeHtml(e.error)).join('<br/>')}</p>` : ''}
      </div>`;
  }
  state.importing = [];
  importEl.confirm.disabled = true;
});

/* ══════════════════════════════════════════════════════════
   BLANK CLASS SHEET (PDF)
   Learners A–Z with the 9 subject columns empty, so teachers
   can write marks by hand first. Drawn directly with jsPDF,
   so the text is sharp and rows never split across pages.
══════════════════════════════════════════════════════════ */
const SHEET_SUBJECTS = [
  ['ENG', 'English'], ['MAT', 'Mathematics'], ['KISW', 'Kiswahili'],
  ['INTER', 'Integrated Sci.'], ['SST', 'Social Studies'], ['CRE', 'Religious Ed.'],
  ['CAS', 'Creative Arts'], ['AGN', 'Agriculture'], ['PRE-TECH', 'Pre-Technical'],
];

document.getElementById('blankSheetBtn')?.addEventListener('click', () => {
  const sel = document.getElementById('blankSheetClass');
  if (sel) {
    sel.innerHTML = '<option value="">-- Select Class --</option>' +
      state.classes.map(c => `<option value="${c._id}">${escapeHtml(c.name)}</option>`).join('');
    if (state.filters.class) sel.value = state.filters.class;   // use the class already chosen in the filter
  }
  const yr = document.getElementById('blankSheetYear');
  if (yr && !yr.value) yr.value = String(new Date().getFullYear());
  openModal('blankSheetModalOverlay');
});

const fetchAllLearners = async (classId) => {
  const all = [];
  for (let page = 1; page <= 20; page++) {
    const params = new URLSearchParams({ page, limit: 200, class: classId, status: 'active' });
    const r = await API.get(`/students?${params}`);
    if (!r?.ok) throw new Error(r?.data?.message || 'Could not load learners.');
    all.push(...(r.data.students || []));
    if (page >= (r.data.pagination?.pages || 1)) break;
  }
  return all;
};

document.getElementById('blankSheetGo')?.addEventListener('click', async () => {
  const classId = document.getElementById('blankSheetClass')?.value;
  if (!classId) { showToast('Please select a class.', 'warning'); return; }
  if (!window.jspdf?.jsPDF) { showToast('PDF library did not load. Please refresh the page.', 'error'); return; }

  const btn = document.getElementById('blankSheetGo');
  if (btn) btn.disabled = true;

  try {
    const cls = state.classes.find(c => c._id === classId);
    const learners = (await fetchAllLearners(classId))
      .sort((a, b) => a.fullName.trim().localeCompare(b.fullName.trim(), 'en', { sensitivity: 'base' }));

    if (!learners.length) {
      showToast('That class has no learners yet. Import them first.', 'warning');
      return;
    }

    let school = { schoolName: '', schoolMotto: '' };
    try {
      const sr = await API.get('/settings');
      if (sr?.ok && sr.data?.school) school = sr.data.school;
    } catch { /* the sheet still works without it */ }

    const term = document.getElementById('blankSheetTerm')?.value;
    const exam = document.getElementById('blankSheetExam')?.value.trim();
    const year = document.getElementById('blankSheetYear')?.value.trim();

    drawBlankClassSheet({
      schoolName: school.schoolName || '',
      className : cls?.name || '',
      term, exam, year, learners,
    });

    closeModal('blankSheetModal');
    showToast('Class sheet downloaded.', 'success');
  } catch (err) {
    console.error(err);
    showToast(err.message || 'Could not create the class sheet.', 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
});

function drawBlankClassSheet({ schoolName, className, term, exam, year, learners }) {
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const PW = pdf.internal.pageSize.getWidth();
  const PH = pdf.internal.pageSize.getHeight();
  const M  = 10;

  const colNo = 9, colName = 62, colAdm = 22;
  const subjW = (PW - 2 * M - colNo - colName - colAdm) / SHEET_SUBJECTS.length;
  const headH = 11, rowH = 7.4, headerBlockH = 24, footerH = 8;
  const tableTop = M + headerBlockH;
  const rowsPerPage = Math.floor((PH - M - footerH - tableTop - headH) / rowH);

  const xs = [M, M + colNo, M + colNo + colName, M + colNo + colName + colAdm];
  SHEET_SUBJECTS.forEach((_, i) => xs.push(xs[3] + subjW * (i + 1)));
  const right = xs[xs.length - 1];

  const meta = [
    className && `CLASS: ${className}`,
    term && `TERM: ${term}`,
    exam && `EXAM: ${exam}`,
    year && `YEAR: ${year}`,
  ].filter(Boolean).join('   |   ');

  const pages = Math.ceil(learners.length / rowsPerPage);
  /* one extra line for the teacher's signatures on the last page */
  const sigOnLast = (learners.length - (pages - 1) * rowsPerPage) < rowsPerPage;
  const totalPages = sigOnLast ? pages : pages + 1;

  pdf.setDrawColor(0); pdf.setTextColor(0);

  const drawHeader = () => {
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(14);
    pdf.text((schoolName || 'SCHOOL').toUpperCase(), M, M + 5);
    pdf.setFontSize(10);
    pdf.text('CLASS MARKS SHEET', PW - M, M + 5, { align: 'right' });
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9.5);
    pdf.text(meta, M, M + 12);
    pdf.text('Class teacher: ................................................', PW - M, M + 12, { align: 'right' });
    pdf.setLineWidth(0.5); pdf.line(M, M + 15, PW - M, M + 15);

    /* table header */
    const y = tableTop;
    pdf.setLineWidth(0.3);
    pdf.rect(M, y, right - M, headH);
    xs.slice(1, -1).forEach(x => pdf.line(x, y, x, y + headH));
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8);
    pdf.text('NO', xs[0] + colNo / 2, y + 6.5, { align: 'center' });
    pdf.text('LEARNER NAME', xs[1] + 2, y + 6.5);
    pdf.text('ADM NO', xs[2] + colAdm / 2, y + 6.5, { align: 'center' });
    SHEET_SUBJECTS.forEach(([code, full], i) => {
      const cx = xs[3 + i] + subjW / 2;
      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8.5);
      pdf.text(code, cx, y + 4.6, { align: 'center' });
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(5.8);
      pdf.text(full, cx, y + 8.4, { align: 'center' });
    });
  };

  const drawRowLines = (y, label) => {
    pdf.setLineWidth(0.2);
    pdf.rect(M, y, right - M, rowH);
    xs.slice(1, -1).forEach(x => pdf.line(x, y, x, y + rowH));
    if (label) {
      pdf.setFont('helvetica', 'italic'); pdf.setFontSize(7.5);
      pdf.text(label, xs[1] + 2, y + rowH / 2 + 1.1);
    }
  };

  for (let p = 0; p < pages; p++) {
    if (p > 0) pdf.addPage();
    drawHeader();
    const chunk = learners.slice(p * rowsPerPage, (p + 1) * rowsPerPage);
    chunk.forEach((l, i) => {
      const y = tableTop + headH + i * rowH;
      drawRowLines(y);
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8.5);
      pdf.text(String(p * rowsPerPage + i + 1), xs[0] + colNo / 2, y + rowH / 2 + 1.1, { align: 'center' });
      let name = l.fullName.replace(/\s+/g, ' ').trim().toUpperCase();
      while (pdf.getTextWidth(name) > colName - 4 && name.length > 4) name = name.slice(0, -1);
      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(9);
      pdf.text(name, xs[1] + 2, y + rowH / 2 + 1.2);
      if (l.admissionNo) {
        pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8);
        pdf.text(String(l.admissionNo), xs[2] + colAdm / 2, y + rowH / 2 + 1.1, { align: 'center' });
      }
    });

    /* teacher signature row, directly under the last learner */
    if (p === pages - 1 && sigOnLast) {
      drawRowLines(tableTop + headH + chunk.length * rowH, 'Subject teacher (name & sign)');
    }
  }

  if (!sigOnLast) {
    pdf.addPage();
    drawHeader();
    drawRowLines(tableTop + headH, 'Subject teacher (name & sign)');
  }

  /* page numbers */
  for (let p = 1; p <= totalPages; p++) {
    pdf.setPage(p);
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8);
    pdf.text(`Page ${p} of ${totalPages}`, PW / 2, PH - 5, { align: 'center' });
    pdf.text(`${learners.length} learners`, M, PH - 5);
  }

  const safe = (t) => String(t || '').replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
  pdf.save(`Blank_Class_Sheet_${safe(className) || 'Class'}${term ? '_T' + term : ''}_${new Date().toISOString().split('T')[0]}.pdf`);
}

/* ══════════════════════════════════════════════════════════
   EXPORT CSV
══════════════════════════════════════════════════════════ */
el.exportBtn?.addEventListener('click', async () => {
  if (!state.students.length) {
    showToast('No students to export.', 'warning');
    return;
  }

  const rows = state.students.map(s => ({
    'Full Name'     : s.fullName,
    'Gender'        : s.gender,
    'Admission No'  : s.admissionNo  || '',
    'Assessment No' : s.assessmentNo || '',
    'Class'         : s.class?.name  || '',
    'UPI Number'    : s.upiNumber    || '',
    'Date of Birth' : s.dateOfBirth
      ? new Date(s.dateOfBirth).toLocaleDateString('en-KE')
      : '',
    'Parent Name'   : s.parentName    || '',
    'Parent Contact': s.parentContact || '',
    'Status'        : s.isActive ? 'Active' : 'Inactive',
  }));

  const headers = Object.keys(rows[0]);
  const csv     = [
    headers.join(','),
    ...rows.map(r =>
      headers.map(h => `"${(r[h]||'').toString().replace(/"/g,'""')}"`).join(',')
    ),
  ].join('\n');

  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');

  a.href     = url;
  a.download = `students_${new Date().toISOString().split('T')[0]}.csv`;

  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  showToast(`${rows.length} students exported to CSV.`, 'success');
});

/* ══════════════════════════════════════════════════════════
   MODAL HELPERS
══════════════════════════════════════════════════════════ */
const openModal = (id) => {
  const modal = document.getElementById(id + 'Overlay') ||
                document.getElementById(id);
  if (modal) {
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
};

const closeModal = (id) => {
  const modal = document.getElementById(id + 'Overlay') ||
                document.getElementById(id);
  if (modal) {
    modal.classList.remove('open');
    document.body.style.overflow = '';
  }
};

/* Wire close buttons */
document.querySelectorAll('[data-close-modal]').forEach(btn => {
  btn.addEventListener('click', () => {
    closeModal(btn.dataset.closeModal);
  });
});

/* ══════════════════════════════════════════════════════════
   SEED TEST STUDENTS (dev helper)
══════════════════════════════════════════════════════════ */
document.getElementById('seedStudentsBtn')?.addEventListener('click', async () => {
  if (state.classes.length === 0) {
    showToast('No classes found. Create classes first.', 'warning');
    return;
  }

  const cls = state.classes[0];
  const btn = document.getElementById('seedStudentsBtn');
  if (btn) btn.disabled = true;

  const testStudents = [
    { fullName:'Aisha Kamau',     gender:'female', upiNumber:'8N73K2P1Q4', assessmentNo:'23456780', classId:cls._id, parentName:'Grace Kamau',     parentContact:'0712345671' },
    { fullName:'Brian Ochieng',   gender:'male',   upiNumber:'2T41R5N7X8', assessmentNo:'23456781', classId:cls._id, parentName:'Peter Ochieng',    parentContact:'0722345672' },
    { fullName:'Cynthia Wanjiku', gender:'female', upiNumber:'9V63T3N1Z2', assessmentNo:'23456782', classId:cls._id, parentName:'John Mwangi',      parentContact:'0733345673' },
    { fullName:'David Kipchoge',  gender:'male',   upiNumber:'4R28P7L9S2', assessmentNo:'23456783', classId:cls._id, parentName:'Elijah Kipchoge',  parentContact:'0744345674' },
    { fullName:'Esther Njoroge',  gender:'female', upiNumber:'5Q17N8M3T6', assessmentNo:'23456784', classId:cls._id, parentName:'Samuel Njoroge',   parentContact:'0755345675' },
    { fullName:'Felix Mwenda',    gender:'male',   upiNumber:'6Y96W9R7C5', assessmentNo:'23456785', classId:cls._id, parentName:'Joseph Mwenda',    parentContact:'0766345676' },
    { fullName:'Grace Wambui',    gender:'female', upiNumber:'7X85V1Q8B4', assessmentNo:'23456786', classId:cls._id, parentName:'Thomas Wambui',    parentContact:'0777345677' },
    { fullName:'Hassan Abdi',     gender:'male',   upiNumber:'1U52S4M8Y9', assessmentNo:'23456787', classId:cls._id, parentName:'Omar Abdi',        parentContact:'0788345678' },
    { fullName:'Irene Chebet',    gender:'female', upiNumber:'9V63T3N1Z3', assessmentNo:'23456788', classId:cls._id, parentName:'Kibet Chebet',     parentContact:'0799345679' },
    { fullName:'James Otieno',    gender:'male',   upiNumber:'3K91P7N4W2', assessmentNo:'23456789', classId:cls._id, parentName:'Michael Otieno',   parentContact:'0700345680' },
  ];

  let created = 0;

  for (const s of testStudents) {
    const r = await API.post('/students', s);
    if (r?.ok) created++;
  }

  if (btn) btn.disabled = false;

  showToast(`${created} test students added to ${cls.name}.`, 'success');
  loadStudents(1);
});

/* ══════════════════════════════════════════════════════════
   INIT
══════════════════════════════════════════════════════════ */
const init = async () => {
  await loadClasses();
  await loadStudents(1);
};

init();