/* ═══════════════════════════════════════════════════════════
   SCHOLAR ANALYTICS — Marks Controller
   File: backend/controllers/marksController.js
═══════════════════════════════════════════════════════════ */

const Mark    = require('../models/Mark');
const Exam    = require('../models/Exam');
const Subject = require('../models/Subject');
const Student = require('../models/Student');
const Class   = require('../models/Class');

/* ══════════════════════════════════════════════════════════
   GET MARK SHEET
   Returns all students in a class with their marks
   for a specific exam + subject
══════════════════════════════════════════════════════════ */
exports.getMarkSheet = async (req, res, next) => {
  try {
    const { classId, examId, subjectId } = req.query;
    const school = req.user.school;

    if (!classId || !examId || !subjectId) {
      return res.status(400).json({
        success: false,
        message: 'classId, examId and subjectId are required.',
      });
    }

    /* Verify class, exam, subject belong to this school */
    const [cls, exam, subject] = await Promise.all([
      Class.findOne(   { _id: classId,   school }),
      Exam.findOne(    { _id: examId,    school }),
      Subject.findOne( { _id: subjectId, school }),
    ]);

    if (!cls)     return res.status(404).json({ success:false, message:'Class not found.'   });
    if (!exam)    return res.status(404).json({ success:false, message:'Exam not found.'    });
    if (!subject) return res.status(404).json({ success:false, message:'Subject not found.' });

    /* Get all students in this class */
    const students = await Student.find({ class: classId, school, isActive: true })
      .sort({ fullName: 1 })
      .lean();

    /* Get existing marks for this exam+subject */
    const marks = await Mark.find({
      exam   : examId,
      subject: subjectId,
      school,
    }).lean();

    /* Build mark map */
    const markMap = {};
    marks.forEach(m => {
      markMap[m.student.toString()] = {
        _id   : m._id,
        score : m.score,
        absent: m.absent || false,
      };
    });

    /* Merge students with marks */
    const sheet = students.map(s => ({
      ...s,
      mark  : markMap[s._id.toString()] || null,
    }));

    res.status(200).json({
      success: true,
      sheet,
      exam,
      subject,
      class  : cls,
      total  : students.length,
      entered: marks.filter(m => !m.absent).length,
    });

  } catch (error) {
    next(error);
  }
};

/* ══════════════════════════════════════════════════════════
   BULK SAVE MARKS
   Saves all marks for one exam + subject at once
══════════════════════════════════════════════════════════ */
exports.bulkSaveMarks = async (req, res, next) => {
  try {
    const { examId, subjectId, classId, marks } = req.body;
    const school = req.user.school;

    if (!examId || !subjectId || !classId || !marks?.length) {
      return res.status(400).json({
        success: false,
        message: 'examId, subjectId, classId and marks are required.',
      });
    }

    /* Verify exam is open */
    const exam = await Exam.findOne({ _id: examId, school });
    if (!exam) {
      return res.status(404).json({ success:false, message:'Exam not found.' });
    }

    if (!exam.isOpen) {
      return res.status(400).json({
        success: false,
        message: 'This exam is closed. Open it first to enter marks.',
      });
    }

    const results = { saved:0, updated:0, errors:[] };

    for (const m of marks) {
      try {
        const score  = m.absent ? null : Number(m.score);
        const absent = m.absent || false;

        if (!absent && (isNaN(score) || score < 0 || score > 100)) {
          results.errors.push({ student: m.studentId, error: 'Invalid score' });
          continue;
        }

        /* Grade calculation */
        const grade  = absent ? null : getGrade(score);
        const points = absent ? 0    : (grade?.points || 0);

        /* Upsert — update if exists, create if not */
        const existing = await Mark.findOne({
          student: m.studentId,
          exam   : examId,
          subject: subjectId,
          school,
        });

        if (existing) {
          existing.score  = score;
          existing.absent = absent;
          existing.grade  = grade?.grade  || null;
          existing.points = points;
          await existing.save();
          results.updated++;
        } else {
          await Mark.create({
            student: m.studentId,
            exam   : examId,
            subject: subjectId,
            class  : classId,
            school,
            score,
            absent,
            grade  : grade?.grade  || null,
            points,
          });
          results.saved++;
        }

      } catch (err) {
        results.errors.push({ student: m.studentId, error: err.message });
      }
    }

    res.status(200).json({
      success: true,
      message: `${results.saved} marks saved, ${results.updated} updated.`,
      results,
    });

  } catch (error) {
    next(error);
  }
};

/* ══════════════════════════════════════════════════════════
   GET MARKS BY CLASS + EXAM (for results)
══════════════════════════════════════════════════════════ */
exports.getClassMarks = async (req, res, next) => {
  try {
    const { classId, examId } = req.query;
    const school = req.user.school;

    const marks = await Mark.find({ class:classId, exam:examId, school })
      .populate('student', 'fullName upiNumber assessmentNo gender')
      .populate('subject', 'name code')
      .lean();

    res.status(200).json({ success: true, marks });
  } catch (error) {
    next(error);
  }
};

/* ══════════════════════════════════════════════════════════
   TOGGLE EXAM OPEN / CLOSED
══════════════════════════════════════════════════════════ */
exports.toggleExam = async (req, res, next) => {
  try {
    const exam = await Exam.findOne({
      _id   : req.params.examId,
      school: req.user.school,
    });

    if (!exam) {
      return res.status(404).json({ success:false, message:'Exam not found.' });
    }

    exam.isOpen = !exam.isOpen;
    await exam.save();

    res.status(200).json({
      success : true,
      isOpen  : exam.isOpen,
      message : exam.isOpen ? 'Exam opened for marks entry.' : 'Exam closed.',
    });
  } catch (error) {
    next(error);
  }
};

/* ══════════════════════════════════════════════════════════
   DELETE MARKS FOR A CLASS/EXAM
══════════════════════════════════════════════════════════ */
exports.deleteClassMarks = async (req, res, next) => {
  try {
    const { classId, examId } = req.query;

    await Mark.deleteMany({
      class : classId,
      exam  : examId,
      school: req.user.school,
    });

    res.status(200).json({ success:true, message:'Marks deleted.' });
  } catch (error) {
    next(error);
  }
};

/* ── KJSEA Grading helper ─────────────────────────────── */
const getGrade = (score) => {
  if (score === null || score === undefined) return null;
  const SCALE = [
    { grade:'EE1', min:90, max:100, points:8 },
    { grade:'EE2', min:75, max:89,  points:7 },
    { grade:'ME1', min:58, max:74,  points:6 },
    { grade:'ME2', min:41, max:57,  points:5 },
    { grade:'AE1', min:31, max:40,  points:4 },
    { grade:'AE2', min:21, max:30,  points:3 },
    { grade:'BE1', min:11, max:20,  points:2 },
    { grade:'BE2', min:1,  max:10,  points:1 },
  ];
  return SCALE.find(g => score >= g.min && score <= g.max) || null;
};