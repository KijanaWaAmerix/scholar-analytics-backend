/* ═══════════════════════════════════════════════════════════
   SCHOLAR ANALYTICS — Excel Marks Import Controller
   File: backend/controllers/importMarksController.js

   STANDALONE — does not modify marksController.js, Mark.js,
   Student.js or Subject.js. Reuses the same Mark schema and
   the same KJSEA grade scale already used elsewhere, so your
   existing ranking (resultsController.getClassResults) works
   on imported marks with no changes needed there.
═══════════════════════════════════════════════════════════ */

const XLSX    = require('xlsx');
const Mark    = require('../models/Mark');
const Exam    = require('../models/Exam');
const Subject = require('../models/Subject');
const Student = require('../models/Student');
const Class   = require('../models/Class');

/* ── Same KJSEA grade scale used in resultsController.js ── */
const GRADE_SCALE = [
  { grade:'EE1', min:90, max:100, points:8 },
  { grade:'EE2', min:75, max:89,  points:7 },
  { grade:'ME1', min:58, max:74,  points:6 },
  { grade:'ME2', min:41, max:57,  points:5 },
  { grade:'AE1', min:31, max:40,  points:4 },
  { grade:'AE2', min:21, max:30,  points:3 },
  { grade:'BE1', min:11, max:20,  points:2 },
  { grade:'BE2', min:1,  max:10,  points:1 },
];

const getGrade = (score) => {
  if (score === null || score === undefined) return null;
  return GRADE_SCALE.find(g => score >= g.min && score <= g.max) || null;
};

/* Normalize a name/code for forgiving matching:
   lowercase, collapse whitespace, strip dashes/dots/underscores */
const normalize = (str) =>
  String(str || '')
    .toLowerCase()
    .replace(/[-_.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/* Rows we should never treat as a student */
const SKIP_ROW_NAMES = ['total', 'mean', 'average', 'rank', 'position'];

/* ══════════════════════════════════════════════════════════
   POST /api/marks/import-excel
   multipart/form-data: file, classId, examId
══════════════════════════════════════════════════════════ */
exports.importMarksFromExcel = async (req, res, next) => {
  try {
    const { classId, examId } = req.body;
    const school = req.user.school;

    if (!req.file) {
      return res.status(400).json({ success:false, message:'No file uploaded.' });
    }
    if (!classId || !examId) {
      return res.status(400).json({ success:false, message:'classId and examId are required.' });
    }

    /* Verify class + exam belong to this school */
    const [cls, exam] = await Promise.all([
      Class.findOne({ _id: classId, school }),
      Exam.findOne({ _id: examId,  school }),
    ]);

    if (!cls)  return res.status(404).json({ success:false, message:'Class not found.' });
    if (!exam) return res.status(404).json({ success:false, message:'Exam not found.'  });

    if (!exam.isOpen) {
      return res.status(400).json({
        success: false,
        message: 'This exam is closed. Open it first to import marks.',
      });
    }

    /* Load reference data for matching */
    const [students, subjects] = await Promise.all([
      Student.find({ class: classId, school, isActive: true }),
      Subject.find({ class: classId, school, isActive: true }),
    ]);

    if (!subjects.length) {
      return res.status(400).json({ success:false, message:'No subjects found for this class.' });
    }

    /* Build lookup maps keyed by normalized name/code */
    const studentByName = new Map();
    students.forEach(s => studentByName.set(normalize(s.fullName), s));

    const subjectByCode = new Map();
    subjects.forEach(s => subjectByCode.set(normalize(s.code), s));

    /* ── Parse the workbook ────────────────────────────── */
    const workbook  = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet     = workbook.Sheets[sheetName];

    /* Raw rows as arrays, keeping blanks as null */
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });

    /* Find the header row — the one containing something like
       "NAMES OF STUDENTS" in its first populated cell */
    let headerRowIndex = -1;
    for (let i = 0; i < rows.length; i++) {
      const firstCell = normalize(rows[i]?.[0]);
      if (firstCell.includes('name')) {
        headerRowIndex = i;
        break;
      }
    }

    if (headerRowIndex === -1) {
      return res.status(400).json({
        success: false,
        message: 'Could not find a header row (expected a "Names of Students" column). Check the file format.',
      });
    }

    const headerRow = rows[headerRowIndex];

    /* Map each column index -> matched Subject (skip TOTAL/RANK/unmatched columns) */
    const columnSubjectMap = {}; // colIndex -> Subject doc
    const unmatchedColumns = [];

    for (let col = 1; col < headerRow.length; col++) {
      const rawHeader = headerRow[col];
      if (!rawHeader) continue;

      const normHeader = normalize(rawHeader);
      if (['total', 'rank', 'position', 'mean'].includes(normHeader)) continue;

      const subject = subjectByCode.get(normHeader);
      if (subject) {
        columnSubjectMap[col] = subject;
      } else {
        unmatchedColumns.push(rawHeader);
      }
    }

    if (!Object.keys(columnSubjectMap).length) {
      return res.status(400).json({
        success: false,
        message: 'None of the column headers in the file matched a subject code for this class.',
        unmatchedColumns,
      });
    }

    /* ── Walk student rows ─────────────────────────────── */
    const createdStudents = [];
    const errors          = [];
    let created = 0;
    let updated = 0;
    let skippedBlank = 0;

    for (let r = headerRowIndex + 1; r < rows.length; r++) {
      const row = rows[r];
      const rawName = row?.[0];
      if (!rawName) continue; // blank row

      const normName = normalize(rawName);
      if (!normName || SKIP_ROW_NAMES.includes(normName)) continue; // TOTAL / MEAN footer rows

      let student = studentByName.get(normName);

      /* Auto-create if this name doesn't match an existing student.
         UPI, gender and date of birth are left blank — the profile
         is flagged incomplete so it's easy to find and finish later
         from the Students page. */
      if (!student) {
        try {
          student = await Student.create({
            fullName          : String(rawName).trim(),
            class             : classId,
            school            : school,
            profileIncomplete : true,
          });
          studentByName.set(normName, student); // so later duplicate rows in the same file reuse it
          createdStudents.push(student.fullName);
        } catch (err) {
          errors.push({
            student: String(rawName).trim(),
            error  : `Could not create student: ${err.message}`,
          });
          continue;
        }
      }

      for (const [colStr, subject] of Object.entries(columnSubjectMap)) {
        const col = Number(colStr);
        const cell = row[col];

        if (cell === null || cell === undefined || cell === '') {
          skippedBlank++;
          continue; // nothing entered for this subject — leave untouched
        }

        let absent = false;
        let score  = null;

        if (typeof cell === 'string' && ['ab', 'abs', 'absent'].includes(normalize(cell))) {
          absent = true;
        } else {
          score = Number(cell);
          if (isNaN(score) || score < 0 || score > 100) {
            errors.push({
              student: student.fullName,
              subject: subject.code,
              value  : cell,
              error  : 'Invalid score (must be 0-100, or AB for absent)',
            });
            continue;
          }
        }

        const gradeInfo = absent ? null : getGrade(score);

        try {
          const existing = await Mark.findOne({
            student: student._id,
            exam   : examId,
            subject: subject._id,
            school,
          });

          if (existing) {
            existing.score  = score;
            existing.absent = absent;
            existing.grade  = gradeInfo?.grade  || null;
            existing.points = absent ? 0 : (gradeInfo?.points || 0);
            await existing.save();
            updated++;
          } else {
            await Mark.create({
              student: student._id,
              exam   : examId,
              subject: subject._id,
              class  : classId,
              school,
              score,
              absent,
              grade  : gradeInfo?.grade  || null,
              points : absent ? 0 : (gradeInfo?.points || 0),
            });
            created++;
          }
        } catch (err) {
          errors.push({
            student: student.fullName,
            subject: subject.code,
            error  : err.message,
          });
        }
      }
    }

    res.status(200).json({
      success: true,
      message: `Import complete: ${createdStudents.length} student(s) created, ${created} marks created, ${updated} updated.`,
      summary: {
        studentsCreated: createdStudents.length,
        createdStudents,     // names auto-created from the Excel — profiles are incomplete (no UPI/gender/DOB yet)
        created,
        updated,
        skippedBlank,
        unmatchedColumns,    // column headers that don't match any subject code for this class
        errorCount: errors.length,
      },
      errors, // per-cell or per-student errors, if any
    });

  } catch (error) {
    next(error);
  }
};