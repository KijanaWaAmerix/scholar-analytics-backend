/* ═══════════════════════════════════════════════════════════
   SCHOLAR ANALYTICS — Whole-grade marks import
   File: backend/controllers/importGradeController.js

   POST /api/marks/import-grade   (admin only)

   One sheet for a whole grade (e.g. Grade 9 East + West).
   Each name is matched against the learners of ALL classes in
   that grade, and the marks are saved into the learner's own
   class, in that class's exam and subjects.

   dryRun: true  → only reports what WOULD happen (nothing saved)
   dryRun: false → saves the marks

   Body: {
     grade, term, examName, academicYear?,      // which exam
     createMissingExams?: boolean,
     dryRun: boolean,
     rows: [{ name, scores: { eng: 66, math: 'AB', ... } }],
     resolutions?: { "<normalised file name>": "<studentId>" | "" }
   }
═══════════════════════════════════════════════════════════ */

const Mark    = require('../models/Mark');
const Exam    = require('../models/Exam');
const Subject = require('../models/Subject');
const Student = require('../models/Student');
const Class   = require('../models/Class');

/* Same KJSEA scale used everywhere else */
const GRADE_SCALE = [
  { grade: 'EE1', min: 90, max: 100, points: 8 },
  { grade: 'EE2', min: 75, max: 89,  points: 7 },
  { grade: 'ME1', min: 58, max: 74,  points: 6 },
  { grade: 'ME2', min: 41, max: 57,  points: 5 },
  { grade: 'AE1', min: 31, max: 40,  points: 4 },
  { grade: 'AE2', min: 21, max: 30,  points: 3 },
  { grade: 'BE1', min: 11, max: 20,  points: 2 },
  { grade: 'BE2', min: 1,  max: 10,  points: 1 },
];
const getGrade = (score) =>
  GRADE_SCALE.find(g => score >= g.min && score <= g.max) || null;

/* ── name helpers ─────────────────────────────────────────── */
const norm = (s) => String(s || '')
  .toLowerCase()
  .replace(/[`'’´.]/g, '')
  .replace(/[-_]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();
const tokKey = (s) => norm(s).split(' ').filter(Boolean).sort().join(' ');

const levenshtein = (a, b) => {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j] + 1, cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    prev = cur;
  }
  return prev[b.length];
};

/* ── subject slots (same 9 learning areas everywhere) ─────── */
const SLOT_PATTERNS = {
  eng    : /^(eng|english)\b/,
  math   : /^(mat|math|maths|mathematics)\b/,
  kisw   : /^(kis|kisw|kiswahili)\b/,
  inter  : /^(inter|int sci|integrated)/,
  sst    : /^(sst|social)/,
  cre    : /^(cre|ire|hre|religious)/,
  cas    : /^(cas|creative)/,
  agri   : /^(agn|agr|agri|agric|agriculture)\b/,
  pretech: /^(pre ?tech|prt|pre technical|pre vocational|prevocational)/,
};
const slotOf = (code, name) => {
  for (const [slot, re] of Object.entries(SLOT_PATTERNS)) {
    if (re.test(norm(code)) || re.test(norm(name))) return slot;
  }
  return null;
};

const parseCell = (v) => {
  if (v === null || v === undefined || v === '') return { skip: true };
  if (typeof v === 'string' && ['ab', 'abs', 'absent'].includes(norm(v))) return { absent: true };
  const n = Number(v);
  if (Number.isNaN(n) || n < 0 || n > 100) return { invalid: true };
  return { score: n };
};

exports.importGradeMarks = async (req, res, next) => {
  try {
    const school = req.user.school;
    const {
      grade, term, examName, academicYear,
      createMissingExams = false, dryRun = true,
      rows, resolutions = {},
    } = req.body;

    if (!Number.isInteger(Number(grade)) || Number(grade) < 1 || Number(grade) > 12 || ![1, 2, 3].includes(Number(term)) ||
        !String(examName || '').trim() || !Array.isArray(rows) || !rows.length) {
      return res.status(400).json({
        success: false,
        message: 'Grade, term, exam name and the rows from the file are required.',
      });
    }

    /* ── the classes of this grade, their learners and subjects ── */
    const classes = await Class.find({ school, grade: Number(grade) });
    if (!classes.length) {
      return res.status(404).json({ success: false, message: `No Grade ${grade} classes found.` });
    }
    const classById = new Map(classes.map(c => [String(c._id), c]));
    const classIds  = classes.map(c => c._id);

    const [students, subjects] = await Promise.all([
      Student.find({ school, class: { $in: classIds }, isActive: true }).select('fullName class'),
      Subject.find({ school, class: { $in: classIds }, isActive: true }),
    ]);

    /* slot → subject, per class */
    const subjectBySlot = new Map();         // classId -> Map(slot -> subject)
    classes.forEach(c => subjectBySlot.set(String(c._id), new Map()));
    subjects.forEach(s => {
      const slot = slotOf(s.code, s.name);
      if (slot) subjectBySlot.get(String(s.class)).set(slot, s);
    });

    /* ── exams: one per class ── */
    const examName_ = String(examName).trim();
    const exams = new Map();                 // classId -> { exam, status }
    for (const c of classes) {
      const filter = {
        school, class: c._id, term: Number(term),
        name: new RegExp('^' + examName_.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i'),
      };
      if (academicYear) filter.academicYear = String(academicYear);
      const found = await Exam.findOne(filter).sort({ academicYear: -1 });
      if (!found)               exams.set(String(c._id), { status: 'missing' });
      else if (!found.isOpen)   exams.set(String(c._id), { status: 'closed', exam: found });
      else                      exams.set(String(c._id), { status: 'found',  exam: found });
    }

    /* Preview only: pretend the missing exams will be created, so the
       counts show what the real import will save */
    if (dryRun && createMissingExams) {
      for (const c of classes) {
        const e = exams.get(String(c._id));
        if (e.status === 'missing') exams.set(String(c._id), { status: 'will-create', exam: { _id: null } });
      }
    }

    if (!dryRun) {
      for (const c of classes) {
        const e = exams.get(String(c._id));
        if (e.status === 'missing' && createMissingExams) {
          const created = await Exam.create({
            name: examName_, term: Number(term),
            academicYear: String(academicYear || new Date().getFullYear()),
            class: c._id, school, isOpen: true, createdBy: req.user._id || req.user.id,
          });
          exams.set(String(c._id), { status: 'created', exam: created });
        }
      }
    }

    /* ── match every file row to a learner ── */
    const byNorm = new Map(), byTok = new Map();
    const push = (m, k, s) => { if (!m.has(k)) m.set(k, []); m.get(k).push(s); };
    students.forEach(s => { push(byNorm, norm(s.fullName), s); push(byTok, tokKey(s.fullName), s); });
    const studentById = new Map(students.map(s => [String(s._id), s]));

    const label = (s) => ({ id: String(s._id), name: s.fullName, className: classById.get(String(s.class))?.name || '' });

    const suggest = (fileName) => {
      const n = norm(fileName), t = tokKey(fileName);
      return students
        .map(s => ({ s, d: Math.min(levenshtein(n, norm(s.fullName)), levenshtein(t, tokKey(s.fullName))) }))
        .filter(x => x.d <= Math.max(2, Math.round(n.length * 0.2)))
        .sort((a, b) => a.d - b.d).slice(0, 3).map(x => label(x.s));
    };

    const merged     = new Map();            // studentId -> { scores:{slot: cell}, names:[] }
    const unmatched  = [];
    const ambiguous  = [];
    const conflicts  = [];
    const notFoundSeen = new Set();

    for (const row of rows) {
      const fileName = String(row.name || '').trim();
      if (!fileName) continue;
      const key = norm(fileName);

      let target = null;
      if (Object.prototype.hasOwnProperty.call(resolutions, key)) {
        const id = resolutions[key];
        if (!id) continue;                                   // you chose to skip this name
        target = studentById.get(String(id)) || null;
      } else {
        const exact = byNorm.get(key) || [];
        const reord = byTok.get(tokKey(fileName)) || [];
        const pool  = exact.length ? exact : reord;
        if (pool.length === 1) target = pool[0];
        else if (pool.length > 1) {
          if (!notFoundSeen.has(key)) {
            notFoundSeen.add(key);
            ambiguous.push({ fileName, key, options: pool.map(label) });
          }
          continue;
        }
      }

      if (!target) {
        if (!notFoundSeen.has(key)) {
          notFoundSeen.add(key);
          unmatched.push({ fileName, key, suggestions: suggest(fileName) });
        }
        continue;
      }

      const id = String(target._id);
      if (!merged.has(id)) merged.set(id, { scores: {}, names: [] });
      const m = merged.get(id);
      m.names.push(fileName);
      for (const [slot, cell] of Object.entries(row.scores || {})) {
        if (cell === null || cell === undefined || cell === '') continue;
        if (m.scores[slot] !== undefined && String(m.scores[slot]) !== String(cell)) {
          conflicts.push({ learner: target.fullName, slot, kept: m.scores[slot], ignored: cell });
          continue;                                          // keep the first value
        }
        m.scores[slot] = cell;
      }
    }

    /* ── turn merged rows into mark operations ── */
    const ops = [];
    const invalidCells = [];
    const missingSubject = {};               // className -> [slots]
    const perClass = new Map();              // classId -> { learners, marks }
    classes.forEach(c => perClass.set(String(c._id), { learners: 0, marks: 0 }));

    for (const [id, m] of merged) {
      const st  = studentById.get(id);
      const cid = String(st.class);
      const ex  = exams.get(cid);
      perClass.get(cid).learners++;
      if (!ex.exam) continue;                // exam missing (preview) → nothing to save yet
      if (ex.status === 'closed') continue;

      for (const [slot, cell] of Object.entries(m.scores)) {
        const subj = subjectBySlot.get(cid).get(slot);
        if (!subj) {
          const cn = classById.get(cid).name;
          (missingSubject[cn] = missingSubject[cn] || new Set()).add(slot);
          continue;
        }
        const p = parseCell(cell);
        if (p.skip) continue;
        if (p.invalid) { invalidCells.push({ learner: st.fullName, subject: slot, value: cell }); continue; }

        const gi = p.absent ? null : getGrade(p.score);
        ops.push({
          updateOne: {
            filter: { student: st._id, exam: ex.exam._id, subject: subj._id, school },
            update: { $set: {
              class: st.class, score: p.absent ? null : p.score, absent: !!p.absent,
              grade: gi?.grade || null, points: p.absent ? 0 : (gi?.points || 0),
            } },
            upsert: true,
          },
        });
        perClass.get(cid).marks++;
      }
    }

    const classReport = classes.map(c => {
      const e = exams.get(String(c._id));
      const pc = perClass.get(String(c._id));
      return {
        classId: String(c._id), className: c.name,
        learnersInClass: students.filter(s => String(s.class) === String(c._id)).length,
        learnersMatched: pc.learners, marks: pc.marks,
        exam: e.status,                       // found | missing | closed | created
      };
    });

    const base = {
      success: true,
      classes: classReport,
      unmatched, ambiguous, conflicts, invalidCells,
      missingSubjects: Object.fromEntries(Object.entries(missingSubject).map(([k, v]) => [k, [...v]])),
      learnersNotInFile: students
        .filter(s => !merged.has(String(s._id)))
        .map(label),
    };

    if (dryRun) {
      return res.status(200).json({
        ...base, dryRun: true,
        learners: students.map(label).sort((a, b) => a.name.localeCompare(b.name)),
      });
    }

    let created = 0, updated = 0;
    if (ops.length) {
      const r = await Mark.bulkWrite(ops, { ordered: false });
      created = r.upsertedCount || 0;
      updated = (r.matchedCount || 0);
    }

    res.status(200).json({
      ...base, dryRun: false,
      saved: { created, updated, total: ops.length },
      message: `${ops.length} marks saved for ${merged.size} learners (${created} new, ${updated} updated).`,
    });
  } catch (error) {
    next(error);
  }
};