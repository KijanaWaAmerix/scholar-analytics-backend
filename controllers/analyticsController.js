/* ═══════════════════════════════════════════════════════════
   SCHOLAR ANALYTICS — Analytics Controller
   File: backend/controllers/analyticsController.js
═══════════════════════════════════════════════════════════ */

const Mark    = require('../models/Mark');
const Student = require('../models/Student');
const Exam    = require('../models/Exam');
const Class   = require('../models/Class');
const Subject = require('../models/Subject');

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

const getGradeInfo = (score) => {
  if (score === null || score === undefined) return null;
  return GRADE_SCALE.find(g => score >= g.min && score <= g.max) || null;
};

/* ══════════════════════════════════════════════════════════
   SCHOOL OVERVIEW
══════════════════════════════════════════════════════════ */
exports.getOverview = async (req, res, next) => {
  try {
    const school = req.user.school;

    const [
      totalStudents,
      totalClasses,
      totalExams,
      totalMarks,
    ] = await Promise.all([
      Student.countDocuments({ school, isActive: true }),
      Class.countDocuments({ school }),
      Exam.countDocuments({ school }),
      Mark.countDocuments({ school }),
    ]);

    /* Latest exam stats */
    const latestExam = await Exam.findOne({ school })
      .sort({ createdAt: -1 });

    let latestStats = { avg: 0, passRate: 0, total: 0 };

    if (latestExam) {
      const marks = await Mark.find({
        exam  : latestExam._id,
        school,
        absent: false,
        score : { $ne: null },
      });

      if (marks.length) {
        const scores  = marks.map(m => m.score);
        const avg     = scores.reduce((a,b)=>a+b,0) / scores.length;
        const passed  = scores.filter(s => s >= 41).length;
        latestStats = {
          avg      : parseFloat(avg.toFixed(1)),
          passRate : parseFloat(((passed/scores.length)*100).toFixed(1)),
          total    : marks.length,
          examName : latestExam.name,
        };
      }
    }

    res.status(200).json({
      success: true,
      stats  : { totalStudents, totalClasses, totalExams, totalMarks, latestStats },
    });

  } catch (error) {
    next(error);
  }
};

/* ══════════════════════════════════════════════════════════
   CLASS COMPARISON — compare all classes for one exam
══════════════════════════════════════════════════════════ */
exports.getClassComparison = async (req, res, next) => {
  try {
    const { examId } = req.query;
    const school     = req.user.school;

    if (!examId) {
      return res.status(400).json({ success:false, message:'examId required.' });
    }

    const classes = await Class.find({ school }).lean();

    const comparison = await Promise.all(
      classes.map(async (cls) => {
        const marks = await Mark.find({
          class : cls._id,
          exam  : examId,
          school,
          absent: false,
          score : { $ne: null },
        }).lean();

        if (!marks.length) {
          return {
            classId  : cls._id,
            className: cls.name,
            grade    : cls.grade,
            avg      : 0,
            passRate : 0,
            highest  : 0,
            lowest   : 0,
            total    : 0,
          };
        }

        const scores  = marks.map(m => m.score);
        const avg     = parseFloat((scores.reduce((a,b)=>a+b,0)/scores.length).toFixed(1));
        const passed  = scores.filter(s => s >= 41).length;

        return {
          classId  : cls._id,
          className: cls.name,
          grade    : cls.grade,
          avg,
          passRate : parseFloat(((passed/scores.length)*100).toFixed(1)),
          highest  : Math.max(...scores),
          lowest   : Math.min(...scores),
          total    : marks.length,
        };
      })
    );

    res.status(200).json({
      success   : true,
      comparison: comparison.filter(c => c.total > 0),
    });

  } catch (error) {
    next(error);
  }
};

/* ══════════════════════════════════════════════════════════
   PERFORMANCE TREND — one class across all exams
══════════════════════════════════════════════════════════ */
exports.getTrend = async (req, res, next) => {
  try {
    const { classId } = req.query;
    const school      = req.user.school;

    const filter = { school };
    if (classId && classId !== 'all') filter.class = classId;

    const exams = await Exam.find({ school })
      .sort({ term:1, createdAt:1 })
      .lean();

    const trend = await Promise.all(
      exams.map(async (exam) => {
        const markFilter = { exam: exam._id, school, absent: false, score: { $ne: null } };
        if (classId && classId !== 'all') markFilter.class = classId;

        const marks = await Mark.find(markFilter).lean();

        if (!marks.length) return null;

        const scores = marks.map(m => m.score);
        const avg    = parseFloat((scores.reduce((a,b)=>a+b,0)/scores.length).toFixed(1));
        const passed = scores.filter(s => s >= 41).length;

        return {
          examId  : exam._id,
          examName: exam.name,
          term    : exam.term,
          label   : `T${exam.term} ${exam.name}`,
          avg,
          passRate: parseFloat(((passed/scores.length)*100).toFixed(1)),
          total   : marks.length,
        };
      })
    );

    res.status(200).json({
      success: true,
      trend  : trend.filter(Boolean),
    });

  } catch (error) {
    next(error);
  }
};

/* ══════════════════════════════════════════════════════════
   SUBJECT PERFORMANCE — for one class + exam
══════════════════════════════════════════════════════════ */
exports.getSubjectPerformance = async (req, res, next) => {
  try {
    const { classId, examId } = req.query;
    const school              = req.user.school;

    if (!classId || !examId) {
      return res.status(400).json({ success:false, message:'classId and examId required.' });
    }

    const subjects = await Subject.find({ class:classId, school, isActive:true }).lean();

    const performance = await Promise.all(
      subjects.map(async (subj) => {
        const marks = await Mark.find({
          subject: subj._id,
          class  : classId,
          exam   : examId,
          school,
          absent : false,
          score  : { $ne: null },
        }).lean();

        if (!marks.length) return null;

        const scores = marks.map(m => m.score);
        const avg    = parseFloat((scores.reduce((a,b)=>a+b,0)/scores.length).toFixed(1));
        const passed = scores.filter(s => s >= 41).length;

        return {
          subjectId  : subj._id,
          subjectName: subj.name,
          code       : subj.code,
          avg,
          highest    : Math.max(...scores),
          lowest     : Math.min(...scores),
          passRate   : parseFloat(((passed/scores.length)*100).toFixed(1)),
          total      : marks.length,
        };
      })
    );

    res.status(200).json({
      success    : true,
      performance: performance.filter(Boolean),
    });

  } catch (error) {
    next(error);
  }
};

/* ══════════════════════════════════════════════════════════
   GRADE DISTRIBUTION — for one class + exam
══════════════════════════════════════════════════════════ */
exports.getGradeDistribution = async (req, res, next) => {
  try {
    const { classId, examId } = req.query;
    const school              = req.user.school;

    const filter = { school, absent:false, score:{ $ne:null } };
    if (classId && classId !== 'all') filter.class = classId;
    if (examId  && examId  !== 'all') filter.exam  = examId;

    const marks = await Mark.find(filter).lean();

    const dist = {};
    GRADE_SCALE.forEach(g => dist[g.grade] = 0);

    marks.forEach(m => {
      const g = getGradeInfo(m.score);
      if (g) dist[g.grade]++;
    });

    res.status(200).json({ success:true, dist, total: marks.length });

  } catch (error) {
    next(error);
  }
};

/* ══════════════════════════════════════════════════════════
   AT-RISK STUDENTS — scoring below 41%
══════════════════════════════════════════════════════════ */
exports.getAtRisk = async (req, res, next) => {
  try {
    const { examId } = req.query;
    const school     = req.user.school;

    if (!examId) {
      return res.status(400).json({ success:false, message:'examId required.' });
    }

    /* Get all marks for this exam */
    const marks = await Mark.find({ exam:examId, school, absent:false, score:{ $ne:null } })
      .populate('student', 'fullName upiNumber gender')
      .populate('class',   'name')
      .lean();

    /* Group by student */
    const studentMap = {};

    marks.forEach(m => {
      const sid = m.student?._id?.toString();
      if (!sid) return;
      if (!studentMap[sid]) {
        studentMap[sid] = {
          student: m.student,
          class  : m.class,
          scores : [],
        };
      }
      studentMap[sid].scores.push(m.score);
    });

    /* Compute averages and filter at-risk */
    const atRisk = Object.values(studentMap)
      .map(s => ({
        ...s.student,
        className: s.class?.name || '—',
        avg      : parseFloat((s.scores.reduce((a,b)=>a+b,0)/s.scores.length).toFixed(1)),
      }))
      .filter(s => s.avg < 41)
      .sort((a,b) => a.avg - b.avg)
      .slice(0, 20);

    res.status(200).json({ success:true, atRisk });

  } catch (error) {
    next(error);
  }
};