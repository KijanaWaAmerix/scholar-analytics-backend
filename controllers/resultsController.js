/* ═══════════════════════════════════════════════════════════
   SCHOLAR ANALYTICS — Results Controller
   File: backend/controllers/resultsController.js
═══════════════════════════════════════════════════════════ */

const Mark    = require('../models/Mark');
const Student = require('../models/Student');
const Subject = require('../models/Subject');
const Exam    = require('../models/Exam');
const Class   = require('../models/Class');

/* ══════════════════════════════════════════════════════════
   KJSEA GRADING ENGINE
══════════════════════════════════════════════════════════ */
const GRADE_SCALE = [
  { grade:'EE1', min:90, max:100, points:8, label:'Exceeds Expectation' },
  { grade:'EE2', min:75, max:89,  points:7, label:'Exceeds Expectation' },
  { grade:'ME1', min:58, max:74,  points:6, label:'Meets Expectation'   },
  { grade:'ME2', min:41, max:57,  points:5, label:'Meets Expectation'   },
  { grade:'AE1', min:31, max:40,  points:4, label:'Approaches Exp.'     },
  { grade:'AE2', min:21, max:30,  points:3, label:'Approaches Exp.'     },
  { grade:'BE1', min:11, max:20,  points:2, label:'Below Expectation'   },
  { grade:'BE2', min:1,  max:10,  points:1, label:'Below Expectation'   },
];

const getGrade = (score) => {
  if (score === null || score === undefined) return null;
  return GRADE_SCALE.find(g =>
    Number(score) >= g.min && Number(score) <= g.max
  ) || null;
};

const getMeanGrade = (totalPoints, count) => {
  if (!count) return null;
  const avg = totalPoints / count;
  if (avg >= 7.5) return 'EE1';
  if (avg >= 6.5) return 'EE2';
  if (avg >= 5.5) return 'ME1';
  if (avg >= 4.5) return 'ME2';
  if (avg >= 3.5) return 'AE1';
  if (avg >= 2.5) return 'AE2';
  if (avg >= 1.5) return 'BE1';
  return 'BE2';
};

/* ══════════════════════════════════════════════════════════
   GET CLASS RESULTS
   Main endpoint — returns full ranked results for a class+exam
══════════════════════════════════════════════════════════ */
exports.getClassResults = async (req, res, next) => {
  try {
    const { classId, examId } = req.query;
    const school = req.user.school;

    if (!classId || !examId) {
      return res.status(400).json({
        success: false,
        message: 'classId and examId are required.',
      });
    }

    /* Verify class and exam belong to this school */
    const [cls, exam, subjects, students] = await Promise.all([
      Class.findOne({ _id: classId, school }),
      Exam.findOne( { _id: examId,  school }),
      Subject.find( { class: classId, school, isActive: true }).sort({ name:1 }),
      Student.find( { class: classId, school, isActive: true }).sort({ fullName:1 }),
    ]);

    if (!cls)  return res.status(404).json({ success:false, message:'Class not found.'  });
    if (!exam) return res.status(404).json({ success:false, message:'Exam not found.'   });

    if (!students.length) {
      return res.status(200).json({
        success : true,
        results : [],
        subjects: subjects.map(s => ({ _id:s._id, name:s.name, code:s.code })),
        stats   : { total:0, entered:0, passRate:0, avg:0 },
        class   : cls,
        exam,
      });
    }

    /* Get all marks for this class + exam */
    const marks = await Mark.find({
      class  : classId,
      exam   : examId,
      school,
    }).lean();

    /* Build mark lookup: { studentId: { subjectId: mark } } */
    const markMap = {};
    marks.forEach(m => {
      const sid = m.student.toString();
      const sub = m.subject.toString();
      if (!markMap[sid]) markMap[sid] = {};
      markMap[sid][sub] = m;
    });

    /* Compute results per student */
    const results = students.map(student => {
      const sid          = student._id.toString();
      const studentMarks = markMap[sid] || {};

      let totalScore  = 0;
      let totalPoints = 0;
      let subjectCount= 0;
      let absentCount = 0;

      const subjectResults = subjects.map(subject => {
        const subId = subject._id.toString();
        const mark  = studentMarks[subId];

        if (!mark) {
          return {
            subjectId  : subject._id,
            code       : subject.code,
            name       : subject.name,
            score      : null,
            grade      : null,
            points     : 0,
            absent     : false,
            notEntered : true,
          };
        }

        if (mark.absent) {
          absentCount++;
          return {
            subjectId: subject._id,
            code     : subject.code,
            name     : subject.name,
            score    : null,
            grade    : null,
            points   : 0,
            absent   : true,
          };
        }

        const gradeInfo  = getGrade(mark.score);
        totalScore      += Number(mark.score || 0);
        totalPoints     += gradeInfo ? gradeInfo.points : 0;
        subjectCount++;

        return {
          subjectId: subject._id,
          code     : subject.code,
          name     : subject.name,
          score    : mark.score,
          grade    : gradeInfo?.grade  || null,
          points   : gradeInfo?.points || 0,
          absent   : false,
        };
      });

      const avgScore  = subjectCount
        ? parseFloat((totalScore / subjectCount).toFixed(1))
        : 0;

      const meanGrade = getMeanGrade(totalPoints, subjectCount);

      return {
        studentId      : student._id,
        fullName       : student.fullName,
        upiNumber      : student.upiNumber,
        assessmentNo   : student.assessmentNo,
        gender         : student.gender,
        subjectResults,
        totalScore,
        totalPoints,
        avgScore,
        meanGrade,
        meanGradeInfo  : GRADE_SCALE.find(g => g.grade === meanGrade) || null,
        absentCount,
        subjectCount,
        position       : 0,
      };
    });

    /* Sort by points DESC then total score DESC */
    results.sort((a, b) =>
      b.totalPoints !== a.totalPoints
        ? b.totalPoints - a.totalPoints
        : b.totalScore  - a.totalScore
    );

    /* Assign positions */
    let pos = 1;
    results.forEach((r, i) => {
      if (i > 0 && r.totalPoints === results[i-1].totalPoints &&
                   r.totalScore  === results[i-1].totalScore) {
        r.position = results[i-1].position;
      } else {
        r.position = pos;
      }
      pos++;
    });

    /* Class statistics */
    const studentsWithMarks = results.filter(r => r.subjectCount > 0);
    const totalStudents     = results.length;
    const passed            = studentsWithMarks.filter(r => r.avgScore >= 41).length;
    const avgScores         = studentsWithMarks.map(r => r.avgScore);
    const classAvg          = avgScores.length
      ? parseFloat((avgScores.reduce((a,b)=>a+b,0)/avgScores.length).toFixed(1))
      : 0;
    const highest = avgScores.length ? Math.max(...avgScores) : 0;
    const lowest  = avgScores.length ? Math.min(...avgScores) : 0;

    /* Subject averages */
    const subjectAverages = subjects.map(subject => {
      const subId  = subject._id.toString();
      const scores = marks
        .filter(m => m.subject.toString() === subId && !m.absent && m.score !== null)
        .map(m => Number(m.score));
      const avg = scores.length
        ? parseFloat((scores.reduce((a,b)=>a+b,0)/scores.length).toFixed(1))
        : 0;
      return {
        subjectId: subject._id,
        code     : subject.code,
        name     : subject.name,
        avg,
        count    : scores.length,
      };
    });

    /* Grade distribution */
    const gradeDist = {};
    GRADE_SCALE.forEach(g => gradeDist[g.grade] = 0);
    results.forEach(r => {
      if (r.meanGrade && gradeDist[r.meanGrade] !== undefined) {
        gradeDist[r.meanGrade]++;
      }
    });

    res.status(200).json({
      success        : true,
      results,
      subjects       : subjects.map(s => ({ _id:s._id, name:s.name, code:s.code })),
      subjectAverages,
      gradeDist,
      stats          : {
        total       : totalStudents,
        entered     : studentsWithMarks.length,
        passed,
        passRate    : studentsWithMarks.length
          ? parseFloat(((passed/studentsWithMarks.length)*100).toFixed(1))
          : 0,
        avg         : classAvg,
        highest,
        lowest,
      },
      class          : { _id:cls._id, name:cls.name, grade:cls.grade },
      exam           : { _id:exam._id, name:exam.name, term:exam.term, academicYear:exam.academicYear },
    });

  } catch (error) {
    next(error);
  }
};

/* ══════════════════════════════════════════════════════════
   GET STUDENT RESULTS (single student across all exams)
══════════════════════════════════════════════════════════ */
exports.getStudentResults = async (req, res, next) => {
  try {
    const { studentId } = req.params;
    const school        = req.user.school;

    const student = await Student.findOne({ _id:studentId, school })
      .populate('class','name grade');

    if (!student) {
      return res.status(404).json({ success:false, message:'Student not found.' });
    }

    const marks = await Mark.find({ student:studentId, school })
      .populate('subject','name code')
      .populate('exam',   'name term academicYear')
      .lean();

    res.status(200).json({ success:true, student, marks });

  } catch (error) {
    next(error);
  }
};