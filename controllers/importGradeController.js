/* ═══════════════════════════════════════════════════════════
   SCHOLAR ANALYTICS — Whole-grade marks import (CORRECTED)
   File: backend/controllers/importGradeController.js

   POST /api/marks/import-grade   (admin only)

   One sheet for a whole grade (e.g. Grade 9 East + West).
   Each name is matched against the learners of ALL classes in
   that grade, and the marks are saved into the learner's own
   class, in that class's exam and subjects.

   FIXES vs previous version
   1. Column → subject now matches the EXACT subject code first
      (as importMarksController did), then the subject name, and
      only then the slot patterns as a fallback. Before, a header
      like "SCI" matched no slot and was dropped, or went to a
      different subject than the one on screen.
   2. Subjects are sorted, so "first subject for a slot" is stable,
      and duplicate subjects in a slot are reported.
   3. Closed / missing exams are no longer hidden behind a
      "success" message. They are reported, and if nothing was
      saved the import returns an error.
   4. Optional examIds { "<classId>": "<examId>" } lets you pin the
      exact exam per class (avoids hitting a duplicate exam).
   5. The response includes columnMap: which subject each column
      was saved into, per class, so you can verify it.

   dryRun: true  → only reports what WOULD happen (nothing saved)
   dryRun: false → saves the marks

   Body: {
     grade, term, examName, academicYear?,
     examIds?: { "<classId>": "<examId>" },
     createMissingExams?: boolean,
     dryRun: boolean,
     rows: [{ name, scores: { eng: 66, MAT: 'AB', ... } }],
     resolutions?: { "<normalised file name>": "<studentId>" | "" }
   }
═══════════════════════════════════════════════════════════ */

const Mark    = require('../models/Mark');
const Exam    = require('../models/Exam');
const Subject = require('../models/Subject');
const Student = require('../models/Student');
const Class   = require('../models/Class');

/* KJSEA scale (highest band first).
   Matching on `min` only means decimal scores such as 74.5 still get a grade. */
const GRADE_SCALE = [
  { grade: 'EE1', min: 90, points: 8 },
  { grade: 'EE2', min: 75, points: 7 },
  { grade: 'ME1', min: 58, points: 6 },
  { grade: 'ME2', min: 41, points: 5 },
  { grade: 'AE1', min: 31, points: 4 },
  { grade: 'AE2', min: 21, points: 3 },
  { grade: 'BE1', min: 11, points: 2 },
  { grade: 'BE2', min: 1,  points: 1 },
];
const getGrade = (score) =>
  GRADE_SCALE.find(g => score >= g.min) || null;

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

/* ── subject slots (fallback only) ───────────────────────────
   Patterns run on norm()-ed text, so "PRE-TECH" arrives as "pre tech". */
const SLOT_PATTERNS = {
  eng    : /^(eng|english)\b/,
  math   : /^(mat|math|maths|mathematics)\b/,
  kisw   : /^(kis|kisw|kiswahili)\b/,
  inter  : /^(inter|int ?sci|integrated)\b/,
  sst    : /^(sst|social)\b/,
  cre    : /^(cre|ire|hre)\b|religious/,
  cas    : /^(cas\b|creative)/,
  agri   : /^(agn|agr|agri|agric|agriculture)\b/,
  pretech: /^(pre ?tech|prt\b|pre technical|pre ?vocational)/,
};

const matchSlot = (text) => {
  const t = norm(text);
  if (!t) return null;
  for (const [slot, re] of Object.entries(SLOT_PATTERNS)) {
    if (re.test(t)) return slot;
  }
  return null;
};

/* Subject → slot: code first, then name */
const slotOf = (code, name) => matchSlot(code) || matchSlot(name);

/* Header/key from the file → slot (accepts slot names or sheet headers) */
const slotKey = (key) => (SLOT_PATTERNS[key] ? key : matchSlot(key));

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
      rows, resolutions = {}, examIds = {},
    } = req.body;

    if (!Number.isInteger(Number(grade)) || Number(grade) < 1 || Number(grade) > 12 ||
        ![1, 2, 3].includes(Number(term)) ||
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
      Subject.find({ school, class: { $in: classIds }, isActive: true }).sort({ _id: 1 }),
    ]);

    /* ── subject lookups per class: by code, by name, by slot ── */
    const byCode = new Map();                // classId -> Map(normCode -> subject)
    const byName = new Map();                // classId -> Map(normName -> subject)
    const bySlot = new Map();                // classId -> Map(slot -> subject)
    const duplicateSubjects = {};            // className -> ["slot: A vs B"]
    classes.forEach(c => {
      const id = String(c._id);
      byCode.set(id, new Map());
      byName.set(id, new Map());
      bySlot.set(id, new Map());
    });

    subjects.forEach(s => {
      const cid = String(s.class);
      const code = norm(s.code), name = norm(s.name);
      if (code && !byCode.get(cid).has(code)) byCode.get(cid).set(code, s);
      if (name && !byName.get(cid).has(name)) byName.get(cid).set(name, s);

      const slot = slotOf(s.code, s.name);
      if (!slot) return;
      const bucket = bySlot.get(cid);
      if (bucket.has(slot)) {
        const cn = classById.get(cid).name;
        (duplicateSubjects[cn] = duplicateSubjects[cn] || [])
          .push(`${slot}: ${bucket.get(slot).name} vs ${s.name}`);
      } else {
        bucket.set(slot, s);
      }
    });

    /* column key (from file) → subject, for one class.
       1) exact code  2) exact name  3) slot pattern */
    const resolveSubject = (cid, rawKey) => {
      const k = norm(rawKey);
      return byCode.get(cid).get(k)
          || byName.get(cid).get(k)
          || (slotKey(rawKey) ? bySlot.get(cid).get(slotKey(rawKey)) : null)
          || (slotKey(k) ? bySlot.get(cid).get(slotKey(k)) : null)
          || null;
    };

    /* ── exams: one per class ── */
    const examName_ = String(examName).trim();
    const exams = new Map();                 // classId -> { exam, status }
    for (const c of classes) {
      const cid = String(c._id);
      let found = null;

      if (examIds && examIds[cid]) {
        found = await Exam.findOne({ _id: examIds[cid], school, class: c._id });
      } else {
        const filter = {
          school, class: c._id, term: Number(term),
          name: new RegExp('^' + examName_.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i'),
        };
        if (academicYear) filter.academicYear = String(academicYear);
        found = await Exam.findOne(filter).sort({ academicYear: -1 });
      }

      if (!found)             exams.set(cid, { status: 'missing' });
      else if (!found.isOpen) exams.set(cid, { status: 'closed', exam: found });
      else                    exams.set(cid, { status: 'found',  exam: found });
    }

    /* Preview only: pretend the missing exams will be created */
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

    const merged       = new Map();          // studentId -> { scores:{colKey: cell}, names:[] }
    const rawNames     = new Map();          // colKey -> header as written in the file
    const unmatched    = [];
    const ambiguous    = [];
    const conflicts    = [];
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
      for (const [rawKey, cell] of Object.entries(row.scores || {})) {
        if (cell === null || cell === undefined || cell === '') continue;
        const colKey = norm(rawKey);
        if (!colKey) continue;
        if (!rawNames.has(colKey)) rawNames.set(colKey, rawKey);
        if (m.scores[colKey] !== undefined && String(m.scores[colKey]) !== String(cell)) {
          conflicts.push({ learner: target.fullName, subject: rawKey, kept: m.scores[colKey], ignored: cell });
          continue;                                          // keep the first value
        }
        m.scores[colKey] = cell;
      }
    }

    /* ── turn merged rows into mark operations ── */
    const ops = [];
    const invalidCells = [];
    const missingSubject = {};               // className -> Set(headers)
    const columnMap = {};                    // className -> { header: "CODE – Name" }
    const resolvedCols = new Set();
    const perClass = new Map();              // classId -> { learners, marks }
    classes.forEach(c => perClass.set(String(c._id), { learners: 0, marks: 0 }));

    for (const [id, m] of merged) {
      const st  = studentById.get(id);
      const cid = String(st.class);
      const cn  = classById.get(cid).name;
      const ex  = exams.get(cid);
      perClass.get(cid).learners++;
      if (!ex.exam) continue;                // exam missing → nothing to save
      if (ex.status === 'closed') continue;

      for (const [colKey, cell] of Object.entries(m.scores)) {
        const p = parseCell(cell);
        if (p.skip) continue;

        const header = rawNames.get(colKey) || colKey;
        const subj = resolveSubject(cid, header);
        if (!subj) {
          (missingSubject[cn] = missingSubject[cn] || new Set()).add(header);
          continue;
        }
        resolvedCols.add(colKey);
        (columnMap[cn] = columnMap[cn] || {})[header] = `${subj.code || ''} – ${subj.name}`;

        if (p.invalid) { invalidCells.push({ learner: st.fullName, subject: header, value: cell }); continue; }

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
        exam: e.status,                       // found | missing | closed | created | will-create
        examId: e.exam?._id ? String(e.exam._id) : null,
      };
    });

    const skippedClasses = classReport
      .filter(c => ['closed', 'missing'].includes(c.exam) && c.learnersMatched > 0)
      .map(c => `${c.className} (exam ${c.exam})`);

    const base = {
      success: true,
      classes: classReport,
      unmatched, ambiguous, conflicts, invalidCells,
      unknownColumns: [...rawNames.entries()]
        .filter(([k]) => !resolvedCols.has(k)).map(([, v]) => v),
      missingSubjects: Object.fromEntries(Object.entries(missingSubject).map(([k, v]) => [k, [...v]])),
      duplicateSubjects,
      columnMap,
      skippedClasses,
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

    /* Nothing to save → say why, do NOT report success */
    if (!ops.length) {
      return res.status(400).json({
        ...base, success: false, dryRun: false,
        saved: { created: 0, updated: 0, total: 0 },
        message: skippedClasses.length
          ? `No marks saved. Exam closed or missing for: ${skippedClasses.join(', ')}.`
          : 'No marks saved. No column matched a subject, or no learner matched. Check unknownColumns, missingSubjects and unmatched.',
      });
    }

    let created = 0, updated = 0, writeErrors = [];
    try {
      const r = await Mark.bulkWrite(ops, { ordered: false });
      created = r.upsertedCount || 0;
      updated = r.matchedCount || 0;
    } catch (err) {
      /* ordered:false → the rest still saved; report what failed */
      const r = err.result || {};
      created = r.nUpserted || 0;
      updated = r.nMatched || 0;
      writeErrors = (err.writeErrors || []).slice(0, 20)
        .map(w => w.errmsg || String(w.err?.errmsg || w));
      if (!created && !updated && !writeErrors.length) throw err;
    }

    const warnings = [];
    if (skippedClasses.length) warnings.push(`Skipped (exam closed/missing): ${skippedClasses.join(', ')}.`);
    if (Object.keys(missingSubject).length) warnings.push('Some columns have no subject in some classes (see missingSubjects).');
    if (base.unknownColumns.length) warnings.push(`Columns not matched to any subject: ${base.unknownColumns.join(', ')}.`);
    if (Object.keys(duplicateSubjects).length) warnings.push('Duplicate subjects found in some classes (see duplicateSubjects).');
    if (writeErrors.length) warnings.push(`${writeErrors.length} write error(s).`);

    res.status(200).json({
      ...base, dryRun: false,
      saved: { created, updated, total: created + updated },
      writeErrors,
      warnings,
      message: `${created + updated} marks saved for ${merged.size} learners (${created} new, ${updated} updated).` +
               (warnings.length ? ' Warnings: ' + warnings.join(' ') : ''),
    });
  } catch (error) {
    next(error);
  }
};