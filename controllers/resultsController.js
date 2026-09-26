/* ═══════════════════════════════════════════════════════════
   SCHOLAR ANALYTICS — Results Controller v3.0
   File: backend/controllers/resultsController.js
   Enhanced: VAP, Gender Analytics, Top 3, Most Improved
   Kept: getGradeResults (with learningArea + teacherName)
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
   GET CLASS RESULTS — Full Analysis with VAP, Gender, Top3
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

    const [cls, exam, subjects, students] = await Promise.all([
      Class.findOne({ _id: classId, school }),
      Exam.findOne({ _id: examId, school }),
      Subject.find({ class: classId, school, isActive: true })
        .populate('teacher', 'fullName')
        .sort({ name: 1 }),
      Student.find({ class: classId, school, isActive: true }).sort({ fullName: 1 }),
    ]);

    if (!cls)  return res.status(404).json({ success: false, message: 'Class not found.'  });
    if (!exam) return res.status(404).json({ success: false, message: 'Exam not found.'   });

    const subjectsOut = subjects.map(s => ({
      _id         : s._id,
      name        : s.name,
      code        : s.code,
      learningArea: s.learningArea || null,
      teacherName : s.teacher?.fullName || null,
    }));

    if (!students.length) {
      return res.status(200).json({
        success : true,
        results : [],
        subjects: subjectsOut,
        stats   : { total: 0, entered: 0, passRate: 0, avg: 0 },
        class   : cls,
        exam,
      });
    }

    /* Current exam marks */
    const marks = await Mark.find({ class: classId, exam: examId, school }).lean();

    /* Previous exam for VAP */
    const prevExam = await Exam.findOne({
      school,
      class    : classId,
      createdAt: { $lt: exam.createdAt },
    }).sort({ createdAt: -1 });

    let prevMarkMap = {};
    if (prevExam) {
      const prevMarks = await Mark.find({
        class: classId, exam: prevExam._id, school,
        absent: false, score: { $ne: null },
      }).lean();
      const prevStudentMap = {};
      prevMarks.forEach(m => {
        const sid = m.student.toString();
        if (!prevStudentMap[sid]) prevStudentMap[sid] = { points: 0, count: 0 };
        const g = getGrade(m.score);
        if (g) { prevStudentMap[sid].points += g.points; prevStudentMap[sid].count++; }
      });
      Object.keys(prevStudentMap).forEach(sid => {
        const s = prevStudentMap[sid];
        prevMarkMap[sid] = s.count ? parseFloat((s.points / s.count).toFixed(2)) : 0;
      });
    }

    /* Build mark lookup */
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
            subjectId   : subject._id,
            code        : subject.code,
            name        : subject.name,
            learningArea: subject.learningArea || null,
            teacherName : subject.teacher?.fullName || null,
            score       : null,
            grade       : null,
            points      : 0,
            absent      : false,
            notEntered  : true,
          };
        }

        if (mark.absent) {
          absentCount++;
          return {
            subjectId   : subject._id,
            code        : subject.code,
            name        : subject.name,
            learningArea: subject.learningArea || null,
            teacherName : subject.teacher?.fullName || null,
            score       : null,
            grade       : null,
            points      : 0,
            absent      : true,
          };
        }

        const gradeInfo  = getGrade(mark.score);
        totalScore      += Number(mark.score || 0);
        totalPoints     += gradeInfo ? gradeInfo.points : 0;
        subjectCount++;

        return {
          subjectId   : subject._id,
          code        : subject.code,
          name        : subject.name,
          learningArea: subject.learningArea || null,
          teacherName : subject.teacher?.fullName || null,
          score       : mark.score,
          grade       : gradeInfo?.grade  || null,
          points      : gradeInfo?.points || 0,
          absent      : false,
        };
      });

      const avgScore  = subjectCount
        ? parseFloat((totalScore / subjectCount).toFixed(1)) : 0;
      const avgPoints = subjectCount
        ? parseFloat((totalPoints / subjectCount).toFixed(2)) : 0;
      const meanGrade  = getMeanGrade(totalPoints, subjectCount);
      const prevPoints = prevMarkMap[sid] ?? null;
      const vap        = prevPoints !== null
        ? parseFloat((avgPoints - prevPoints).toFixed(2)) : null;

      return {
        studentId    : student._id,
        fullName     : student.fullName,
        upiNumber    : student.upiNumber,
        assessmentNo : student.assessmentNo,
        gender       : student.gender,
        subjectResults,
        totalScore,
        totalPoints,
        avgScore,
        avgPoints,
        meanGrade,
        meanGradeInfo: GRADE_SCALE.find(g => g.grade === meanGrade) || null,
        absentCount,
        subjectCount,
        prevPoints,
        vap,
        position     : 0,
      };
    });

    /* Sort + assign positions */
    results.sort((a, b) =>
      b.totalPoints !== a.totalPoints
        ? b.totalPoints - a.totalPoints
        : b.totalScore  - a.totalScore
    );
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
      ? parseFloat((avgScores.reduce((a,b)=>a+b,0)/avgScores.length).toFixed(1)) : 0;
    const highest     = avgScores.length ? Math.max(...avgScores) : 0;
    const lowest      = avgScores.length ? Math.min(...avgScores) : 0;
    const meanPoints  = studentsWithMarks.length
      ? parseFloat((studentsWithMarks.reduce((a,r)=>a+r.avgPoints,0)/studentsWithMarks.length).toFixed(2)) : 0;
    const classMeanGrade = getMeanGrade(
      studentsWithMarks.reduce((a,r)=>a+r.totalPoints,0),
      studentsWithMarks.reduce((a,r)=>a+r.subjectCount,0)
    );

    /* Subject averages + top 3 + grade dist per subject */
    const subjectAverages = subjects.map(subject => {
      const subId  = subject._id.toString();
      const scores = marks
        .filter(m => m.subject.toString() === subId && !m.absent && m.score !== null)
        .map(m => Number(m.score));
      const avg    = scores.length
        ? parseFloat((scores.reduce((a,b)=>a+b,0)/scores.length).toFixed(1)) : 0;
      const avgPts = scores.length
        ? parseFloat((scores.map(s=>getGrade(s)?.points||0).reduce((a,b)=>a+b,0)/scores.length).toFixed(2)) : 0;

      const gradeDist = {};
      GRADE_SCALE.forEach(g => gradeDist[g.grade] = 0);
      scores.forEach(s => { const g = getGrade(s); if (g) gradeDist[g.grade]++; });

      const top3 = results
        .map(r => {
          const sr = r.subjectResults.find(s => s.subjectId?.toString() === subId);
          return sr && !sr.absent && !sr.notEntered
            ? { fullName: r.fullName, score: sr.score, grade: sr.grade, points: sr.points }
            : null;
        })
        .filter(Boolean)
        .sort((a,b) => b.score - a.score)
        .slice(0, 3);

      return {
        subjectId: subject._id,
        code     : subject.code,
        name     : subject.name,
        avg, avgPts,
        count    : scores.length,
        gradeDist,
        top3,
        highest  : scores.length ? Math.max(...scores) : 0,
        lowest   : scores.length ? Math.min(...scores) : 0,
        passRate : scores.length
          ? parseFloat(((scores.filter(s=>s>=41).length/scores.length)*100).toFixed(1)) : 0,
      };
    }).sort((a,b) => b.avg - a.avg).map((s,i) => ({ ...s, rank: i+1 }));

    /* Overall grade distribution */
    const gradeDist = {};
    let xCount = 0;
    GRADE_SCALE.forEach(g => gradeDist[g.grade] = 0);
    results.forEach(r => {
      if (r.subjectCount === 0) { xCount++; return; }
      if (r.meanGrade && gradeDist[r.meanGrade] !== undefined) gradeDist[r.meanGrade]++;
    });

    /* Gender analytics */
    const males   = studentsWithMarks.filter(r => r.gender === 'male');
    const females = studentsWithMarks.filter(r => r.gender === 'female');
    const gAvg = g => g.length ? parseFloat((g.reduce((a,r)=>a+r.avgScore,0)/g.length).toFixed(1)) : 0;
    const gPts = g => g.length ? parseFloat((g.reduce((a,r)=>a+r.avgPoints,0)/g.length).toFixed(2)) : 0;

    const subjectGender = subjects.map(subject => {
      const subId = subject._id.toString();
      const getAvg = (gender) => {
        const sc = marks.filter(m =>
          m.subject.toString() === subId && !m.absent && m.score !== null &&
          students.find(s => s._id.toString() === m.student.toString())?.gender === gender
        ).map(m => Number(m.score));
        return sc.length ? parseFloat((sc.reduce((a,b)=>a+b,0)/sc.length).toFixed(1)) : 0;
      };
      const mA = getAvg('male'), fA = getAvg('female');
      return {
        subjectId: subject._id, name: subject.name, code: subject.code,
        maleAvg: mA, femaleAvg: fA,
        gap    : parseFloat(Math.abs(mA - fA).toFixed(1)),
        leader : mA > fA ? 'male' : mA < fA ? 'female' : 'tie',
      };
    }).sort((a,b) => b.gap - a.gap);

    const maleAvg   = gAvg(males);
    const femaleAvg = gAvg(females);
    const genderStats = {
      male  : { count: males.length,   avg: maleAvg,   avgPoints: gPts(males)   },
      female: { count: females.length, avg: femaleAvg, avgPoints: gPts(females) },
      subjectGender,
      betterGender: femaleAvg >= maleAvg ? 'female' : 'male',
      gap: parseFloat(Math.abs(maleAvg - femaleAvg).toFixed(2)),
    };

    /* Most improved (VAP) */
    const mostImproved = results
      .filter(r => r.vap !== null && r.vap !== undefined && r.vap > 0)
      .sort((a,b) => b.vap - a.vap)
      .slice(0, 5)
      .map((r, i) => ({
        rank: i+1, fullName: r.fullName,
        prevPoints: r.prevPoints, currPoints: r.avgPoints, vap: r.vap,
      }));

    res.status(200).json({
      success        : true,
      results,
      subjects       : subjectsOut,
      subjectAverages,
      gradeDist,
      xCount,
      genderStats,
      mostImproved,
      stats          : {
        total        : totalStudents,
        entered      : studentsWithMarks.length,
        passed,
        passRate     : studentsWithMarks.length
          ? parseFloat(((passed/studentsWithMarks.length)*100).toFixed(1)) : 0,
        avg          : classAvg,
        meanPoints,
        classMeanGrade,
        highest,
        lowest,
        xCount,
      },
      class          : { _id: cls._id, name: cls.name, grade: cls.grade },
      exam           : { _id: exam._id, name: exam.name, term: exam.term, academicYear: exam.academicYear },
    });

  } catch (error) {
    next(error);
  }
};

/* ══════════════════════════════════════════════════════════
   GET GRADE RESULTS
   Ranks students across every stream/class sharing the same
   grade value — e.g. "Grade 7 East" + "Grade 7 West" combined.
   Subjects matched by CODE across streams.
══════════════════════════════════════════════════════════ */
exports.getGradeResults = async (req, res, next) => {
  try {
    const { grade, term, examName, academicYear } = req.query;
    const school = req.user.school;

    if (!grade || !term || !examName) {
      return res.status(400).json({
        success: false,
        message: 'grade, term and examName are required.',
      });
    }

    const year = academicYear || new Date().getFullYear().toString();

    const classes = await Class.find({ grade, school, isActive: true }).lean();
    if (!classes.length) {
      return res.status(404).json({ success: false, message: `No classes found for ${grade}.` });
    }
    const classIds = classes.map(c => c._id);

    const exams = await Exam.find({
      name        : examName,
      term        : Number(term),
      academicYear: year,
      class       : { $in: classIds },
      school,
    }).lean();

    if (!exams.length) {
      return res.status(404).json({
        success: false,
        message: `No "${examName}" exam found for ${grade}, Term ${term}.`,
      });
    }

    const examIds = exams.map(e => e._id);

    const allSubjects = await Subject.find({ class: { $in: classIds }, school, isActive: true })
      .populate('teacher', 'fullName');

    const subjectsByClass = {};
    allSubjects.forEach(s => {
      const cid = s.class.toString();
      if (!subjectsByClass[cid]) subjectsByClass[cid] = {};
      subjectsByClass[cid][s.code] = s;
    });

    const codeByObjectId = {};
    allSubjects.forEach(s => { codeByObjectId[s._id.toString()] = s.code; });

    const firstClassId = classIds.find(id => subjectsByClass[id.toString()])?.toString();
    const canonicalSubjects = firstClassId
      ? allSubjects
          .filter(s => s.class.toString() === firstClassId)
          .sort((a,b) => a.name.localeCompare(b.name))
      : [];

    const subjectsOut = canonicalSubjects.map(s => ({
      _id         : s._id,
      name        : s.name,
      code        : s.code,
      learningArea: s.learningArea || null,
      teacherName : s.teacher?.fullName || null,
    }));

    const students = await Student.find({ class: { $in: classIds }, school, isActive: true })
      .sort({ fullName: 1 });

    if (!students.length) {
      return res.status(200).json({
        success : true,
        results : [],
        subjects: subjectsOut,
        stats   : { total: 0, entered: 0, passRate: 0, avg: 0 },
        grade, term, examName,
        streams : classes.map(c => c.name),
      });
    }

    const marks = await Mark.find({ exam: { $in: examIds }, school }).lean();

    const markMap = {};
    marks.forEach(m => {
      const sid = m.student.toString();
      const sub = m.subject.toString();
      if (!markMap[sid]) markMap[sid] = {};
      markMap[sid][sub] = m;
    });

    const results = students.map(student => {
      const sid            = student._id.toString();
      const cid            = student.class.toString();
      const studentSubjects= subjectsByClass[cid] || {};
      const studentMarks   = markMap[sid] || {};

      let totalScore  = 0;
      let totalPoints = 0;
      let subjectCount= 0;
      let absentCount = 0;

      const subjectResults = canonicalSubjects.map(canon => {
        const subj = studentSubjects[canon.code];

        if (!subj) {
          return {
            subjectId: null, code: canon.code, name: canon.name,
            learningArea: canon.learningArea || null, teacherName: null,
            score: null, grade: null, points: 0, absent: false, notEntered: true,
          };
        }

        const mark = studentMarks[subj._id.toString()];

        if (!mark) {
          return {
            subjectId: subj._id, code: subj.code, name: subj.name,
            learningArea: subj.learningArea || null, teacherName: subj.teacher?.fullName || null,
            score: null, grade: null, points: 0, absent: false, notEntered: true,
          };
        }

        if (mark.absent) {
          absentCount++;
          return {
            subjectId: subj._id, code: subj.code, name: subj.name,
            learningArea: subj.learningArea || null, teacherName: subj.teacher?.fullName || null,
            score: null, grade: null, points: 0, absent: true,
          };
        }

        const gradeInfo = getGrade(mark.score);
        totalScore     += Number(mark.score || 0);
        totalPoints    += gradeInfo ? gradeInfo.points : 0;
        subjectCount++;

        return {
          subjectId: subj._id, code: subj.code, name: subj.name,
          learningArea: subj.learningArea || null, teacherName: subj.teacher?.fullName || null,
          score: mark.score, grade: gradeInfo?.grade || null,
          points: gradeInfo?.points || 0, absent: false,
        };
      });

      const avgScore  = subjectCount
        ? parseFloat((totalScore / subjectCount).toFixed(1)) : 0;
      const avgPoints = subjectCount
        ? parseFloat((totalPoints / subjectCount).toFixed(2)) : 0;
      const meanGrade  = getMeanGrade(totalPoints, subjectCount);

      return {
        studentId    : student._id,
        fullName     : student.fullName,
        upiNumber    : student.upiNumber,
        assessmentNo : student.assessmentNo,
        gender       : student.gender,
        streamName   : classes.find(c => c._id.toString() === cid)?.name || null,
        subjectResults,
        totalScore,
        totalPoints,
        avgScore,
        avgPoints,
        meanGrade,
        meanGradeInfo: GRADE_SCALE.find(g => g.grade === meanGrade) || null,
        absentCount,
        subjectCount,
        vap     : null,
        position: 0,
      };
    });

    /* Combined ranking */
    results.sort((a, b) =>
      b.totalPoints !== a.totalPoints
        ? b.totalPoints - a.totalPoints
        : b.totalScore  - a.totalScore
    );
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

    /* Stats */
    const studentsWithMarks = results.filter(r => r.subjectCount > 0);
    const totalStudents     = results.length;
    const passed            = studentsWithMarks.filter(r => r.avgScore >= 41).length;
    const avgScores         = studentsWithMarks.map(r => r.avgScore);
    const classAvg          = avgScores.length
      ? parseFloat((avgScores.reduce((a,b)=>a+b,0)/avgScores.length).toFixed(1)) : 0;
    const highest = avgScores.length ? Math.max(...avgScores) : 0;
    const lowest  = avgScores.length ? Math.min(...avgScores) : 0;
    const meanPoints = studentsWithMarks.length
      ? parseFloat((studentsWithMarks.reduce((a,r)=>a+r.avgPoints,0)/studentsWithMarks.length).toFixed(2)) : 0;
    const classMeanGrade = getMeanGrade(
      studentsWithMarks.reduce((a,r)=>a+r.totalPoints,0),
      studentsWithMarks.reduce((a,r)=>a+r.subjectCount,0)
    );

    /* Subject averages — combined across streams by code */
    const subjectAverages = canonicalSubjects.map(canon => {
      const scores = marks
        .filter(m => codeByObjectId[m.subject.toString()] === canon.code && !m.absent && m.score !== null)
        .map(m => Number(m.score));
      const avg = scores.length
        ? parseFloat((scores.reduce((a,b)=>a+b,0)/scores.length).toFixed(1)) : 0;
      const avgPts = scores.length
        ? parseFloat((scores.map(s=>getGrade(s)?.points||0).reduce((a,b)=>a+b,0)/scores.length).toFixed(2)) : 0;

      const gradeDist = {};
      GRADE_SCALE.forEach(g => gradeDist[g.grade] = 0);
      scores.forEach(s => { const g = getGrade(s); if (g) gradeDist[g.grade]++; });

      const top3 = results
        .map(r => {
          const sr = r.subjectResults.find(s => s.code === canon.code);
          return sr && !sr.absent && !sr.notEntered
            ? { fullName: r.fullName, score: sr.score, grade: sr.grade, points: sr.points }
            : null;
        })
        .filter(Boolean)
        .sort((a,b) => b.score - a.score)
        .slice(0, 3);

      return {
        subjectId: canon._id, code: canon.code, name: canon.name,
        avg, avgPts, count: scores.length, gradeDist, top3,
        highest: scores.length ? Math.max(...scores) : 0,
        lowest : scores.length ? Math.min(...scores) : 0,
        passRate: scores.length
          ? parseFloat(((scores.filter(s=>s>=41).length/scores.length)*100).toFixed(1)) : 0,
      };
    }).sort((a,b) => b.avg - a.avg).map((s,i) => ({ ...s, rank: i+1 }));

    /* Grade distribution */
    const gradeDist = {};
    let xCount = 0;
    GRADE_SCALE.forEach(g => gradeDist[g.grade] = 0);
    results.forEach(r => {
      if (r.subjectCount === 0) { xCount++; return; }
      if (r.meanGrade && gradeDist[r.meanGrade] !== undefined) gradeDist[r.meanGrade]++;
    });

    /* Gender analytics */
    const males   = studentsWithMarks.filter(r => r.gender === 'male');
    const females = studentsWithMarks.filter(r => r.gender === 'female');
    const gAvg = g => g.length ? parseFloat((g.reduce((a,r)=>a+r.avgScore,0)/g.length).toFixed(1)) : 0;
    const gPts = g => g.length ? parseFloat((g.reduce((a,r)=>a+r.avgPoints,0)/g.length).toFixed(2)) : 0;

    const maleAvg   = gAvg(males);
    const femaleAvg = gAvg(females);

    const subjectGender = canonicalSubjects.map(canon => {
      const getAvg = (gender) => {
        const sc = marks.filter(m =>
          codeByObjectId[m.subject.toString()] === canon.code && !m.absent && m.score !== null &&
          students.find(s => s._id.toString() === m.student.toString())?.gender === gender
        ).map(m => Number(m.score));
        return sc.length ? parseFloat((sc.reduce((a,b)=>a+b,0)/sc.length).toFixed(1)) : 0;
      };
      const mA = getAvg('male'), fA = getAvg('female');
      return {
        subjectId: canon._id, name: canon.name, code: canon.code,
        maleAvg: mA, femaleAvg: fA,
        gap    : parseFloat(Math.abs(mA - fA).toFixed(1)),
        leader : mA > fA ? 'male' : mA < fA ? 'female' : 'tie',
      };
    }).sort((a,b) => b.gap - a.gap);

    const genderStats = {
      male  : { count: males.length,   avg: maleAvg,   avgPoints: gPts(males)   },
      female: { count: females.length, avg: femaleAvg, avgPoints: gPts(females) },
      subjectGender,
      betterGender: femaleAvg >= maleAvg ? 'female' : 'male',
      gap: parseFloat(Math.abs(maleAvg - femaleAvg).toFixed(2)),
    };

    res.status(200).json({
      success  : true,
      results,
      subjects : subjectsOut,
      subjectAverages,
      gradeDist,
      xCount,
      genderStats,
      stats    : {
        total    : totalStudents,
        entered  : studentsWithMarks.length,
        passed,
        passRate : studentsWithMarks.length
          ? parseFloat(((passed/studentsWithMarks.length)*100).toFixed(1)) : 0,
        avg      : classAvg,
        meanPoints,
        classMeanGrade,
        highest,
        lowest,
        xCount,
      },
      grade,
      streams  : classes.map(c => c.name),
      exam     : { name: examName, term: Number(term), academicYear: year },
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

    const student = await Student.findOne({ _id: studentId, school })
      .populate('class', 'name grade');

    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found.' });
    }

    const marks = await Mark.find({ student: studentId, school })
      .populate('subject', 'name code')
      .populate('exam',    'name term academicYear')
      .lean();

    res.status(200).json({ success: true, student, marks });

  } catch (error) {
    next(error);
  }
};

/* ══════════════════════════════════════════════════════════
   IMPORT MARKS FROM EXCEL
══════════════════════════════════════════════════════════ */
exports.importMarksFromExcel = async (req, res, next) => {
  try {
    const { classId, examId, rows } = req.body;
    const school = req.user.school;

    if (!classId || !examId || !rows?.length) {
      return res.status(400).json({
        success: false,
        message: 'classId, examId and rows required.',
      });
    }

    const subjects = await Subject.find({ class: classId, school, isActive: true }).lean();
    const students = await Student.find({ class: classId, school, isActive: true }).lean();

    let imported = 0, skipped = 0;
    const errors = [];

    for (const row of rows) {
      const student = students.find(s =>
        s.upiNumber === row.upi ||
        s.fullName?.toLowerCase().trim() === row.name?.toLowerCase().trim()
      );

      if (!student) {
        skipped++;
        errors.push(`Not found: ${row.name || row.upi}`);
        continue;
      }

      for (const [code, score] of Object.entries(row.scores || {})) {
        const subject = subjects.find(s =>
          s.code?.toLowerCase() === code?.toLowerCase() ||
          s.name?.toLowerCase().includes(code?.toLowerCase())
        );
        if (!subject) continue;

        const num = Number(score);
        if (isNaN(num) || num < 0 || num > 100) continue;

        await Mark.findOneAndUpdate(
          { student: student._id, subject: subject._id, exam: examId, class: classId, school },
          { score: num, absent: false, enteredBy: req.user._id },
          { upsert: true, new: true }
        );
        imported++;
      }
    }

    res.status(200).json({
      success : true,
      message : `Import complete. ${imported} marks saved, ${skipped} students skipped.`,
      imported, skipped, errors,
    });

  } catch (error) {
    next(error);
  }
};