/* ═══════════════════════════════════════════════════════════
   SCHOLAR ANALYTICS — KJSEA Grading Engine
   File: backend/utils/gradingEngine.js
   Handles all grade calculations for the entire system
═══════════════════════════════════════════════════════════ */

/* ══════════════════════════════════════════════════════════
   DEFAULT KJSEA 8-POINT GRADING SCALE
   Source: KNEC Kenya CBC JSS Assessment Framework
══════════════════════════════════════════════════════════ */
const DEFAULT_SCALE = [
  { grade:'EE1', label:'Exceptional',       min:90, max:100, points:8 },
  { grade:'EE2', label:'Very Good',         min:75, max:89,  points:7 },
  { grade:'ME1', label:'Good',              min:58, max:74,  points:6 },
  { grade:'ME2', label:'Fair',              min:41, max:57,  points:5 },
  { grade:'AE1', label:'Needs Improvement', min:31, max:40,  points:4 },
  { grade:'AE2', label:'Below Average',     min:21, max:30,  points:3 },
  { grade:'BE1', label:'Minimal',           min:11, max:20,  points:2 },
  { grade:'BE2', label:'Below Minimal',     min:1,  max:10,  points:1 },
];

/* Auto-comments per grade */
const GRADE_COMMENTS = {
  EE1: 'Exceptional performance. A truly outstanding learner!',
  EE2: 'Very good performance. Shows strong mastery of the subject.',
  ME1: 'Good performance. Meeting expectations well. Keep it up!',
  ME2: 'Fair performance. More effort is needed to improve.',
  AE1: 'Approaching expectation. Needs improvement in several areas.',
  AE2: 'Below average performance. Extra support and effort required.',
  BE1: 'Minimal performance. Urgent intervention and support needed.',
  BE2: 'Below minimal. Requires immediate intensive academic support.',
};

/* ══════════════════════════════════════════════════════════
   CORE FUNCTIONS
══════════════════════════════════════════════════════════ */

/**
 * Get grade info from a numeric score
 * Uses school's custom scale if provided,
 * falls back to KNEC default scale
 *
 * @param {number} score      - Score between 0-100
 * @param {Array}  customScale - Optional school grading scale
 * @returns {Object|null}     - Grade info object or null
 */
const getGrade = (score, customScale = null) => {
  if (score === null || score === undefined || score === '') return null;

  const num   = Number(score);
  const scale = customScale || DEFAULT_SCALE;

  return scale.find(g => num >= g.min && num <= g.max) || null;
};

/**
 * Get points from a score
 *
 * @param {number} score
 * @param {Array}  customScale
 * @returns {number} - Points between 1-8, or 0 if no grade
 */
const getPoints = (score, customScale = null) => {
  const grade = getGrade(score, customScale);
  return grade ? grade.points : 0;
};

/**
 * Get auto-generated teacher comment from grade
 *
 * @param {string} gradeCode - e.g. "EE1", "ME2"
 * @returns {string}
 */
const getComment = (gradeCode) => {
  return GRADE_COMMENTS[gradeCode] || 'Performance data available.';
};

/**
 * Calculate mean grade from total points and subject count
 * Used for overall student performance
 *
 * @param {number} totalPoints
 * @param {number} subjectCount
 * @returns {string} - Mean grade code e.g. "ME1"
 */
const getMeanGrade = (totalPoints, subjectCount) => {
  if (!subjectCount || subjectCount === 0) return null;

  const avg = totalPoints / subjectCount;

  if (avg >= 7.5) return 'EE1';
  if (avg >= 6.5) return 'EE2';
  if (avg >= 5.5) return 'ME1';
  if (avg >= 4.5) return 'ME2';
  if (avg >= 3.5) return 'AE1';
  if (avg >= 2.5) return 'AE2';
  if (avg >= 1.5) return 'BE1';
  return 'BE2';
};

/**
 * Process a single mark entry
 * Attaches grade, points, label and comment
 *
 * @param {number} score
 * @param {Array}  customScale
 * @returns {Object}
 */
const processScore = (score, customScale = null) => {
  const gradeInfo = getGrade(score, customScale);

  if (!gradeInfo) {
    return {
      score,
      grade      : null,
      gradePoints: 0,
      gradeLabel : null,
      comment    : null,
    };
  }

  return {
    score,
    grade      : gradeInfo.grade,
    gradePoints: gradeInfo.points,
    gradeLabel : gradeInfo.label,
    comment    : getComment(gradeInfo.grade),
  };
};

/**
 * Compute full results for a list of students
 * Used by the Results Engine
 *
 * @param {Array}  students    - Array of student mark objects
 * @param {Array}  customScale - Optional school grading scale
 * @returns {Array}            - Processed and ranked results
 */
const computeClassResults = (students, customScale = null) => {

  /* Process each student */
  const processed = students.map(student => {

    const subjects = student.subjects.map(sub => {
      const gradeInfo = getGrade(sub.score, customScale);
      return {
        ...sub,
        grade      : gradeInfo?.grade  || null,
        gradePoints: gradeInfo?.points || 0,
        gradeLabel : gradeInfo?.label  || null,
        comment    : gradeInfo ? getComment(gradeInfo.grade) : null,
      };
    });

    /* Calculate totals */
    const validSubjects = subjects.filter(s => s.score !== null);
    const totalScore    = validSubjects.reduce((sum, s) => sum + s.score, 0);
    const totalPoints   = validSubjects.reduce((sum, s) => sum + s.gradePoints, 0);
    const avgScore      = validSubjects.length
      ? parseFloat((totalScore / validSubjects.length).toFixed(2))
      : 0;
    const meanGrade     = getMeanGrade(totalPoints, validSubjects.length);

    return {
      ...student,
      subjects,
      totalScore,
      totalPoints,
      avgScore,
      meanGrade,
      meanGradeLabel: GRADE_COMMENTS[meanGrade]?.split('.')[0] || null,
      position      : 0,
    };
  });

  /* Sort by total points DESC then total score DESC */
  processed.sort((a, b) =>
    b.totalPoints !== a.totalPoints
      ? b.totalPoints - a.totalPoints
      : b.totalScore  - a.totalScore
  );

  /* Assign positions — handle tied scores */
  let pos = 1;
  processed.forEach((student, i) => {
    if (i > 0 &&
        student.totalPoints === processed[i - 1].totalPoints &&
        student.totalScore  === processed[i - 1].totalScore) {
      student.position = processed[i - 1].position;
    } else {
      student.position = pos;
    }
    pos++;
  });

  return processed;
};

/**
 * Calculate subject positions within a class
 * e.g. who got 1st in Maths
 *
 * @param {Array}  marks      - All marks for a class/exam/subject
 * @returns {Array}           - Marks with position added
 */
const assignSubjectPositions = (marks) => {
  const sorted = [...marks].sort((a, b) => b.score - a.score);

  let pos = 1;
  sorted.forEach((mark, i) => {
    if (i > 0 && mark.score === sorted[i - 1].score) {
      mark.position = sorted[i - 1].position;
    } else {
      mark.position = pos;
    }
    pos++;
  });

  return sorted;
};

/* ══════════════════════════════════════════════════════════
   STATISTICS HELPERS
══════════════════════════════════════════════════════════ */

/**
 * Calculate class statistics from an array of scores
 *
 * @param {Array} scores - Array of numeric scores
 * @returns {Object}
 */
const calculateStats = (scores) => {
  if (!scores || scores.length === 0) {
    return {
      count   : 0,
      total   : 0,
      average : 0,
      highest : 0,
      lowest  : 0,
      passRate: 0,
    };
  }

  const valid    = scores.filter(s => s !== null && s !== undefined);
  const total    = valid.reduce((sum, s) => sum + s, 0);
  const average  = parseFloat((total / valid.length).toFixed(2));
  const highest  = Math.max(...valid);
  const lowest   = Math.min(...valid);
  /* Pass = ME2 and above = score >= 41 */
  const passed   = valid.filter(s => s >= 41).length;
  const passRate = parseFloat(((passed / valid.length) * 100).toFixed(2));

  return {
    count: valid.length,
    total,
    average,
    highest,
    lowest,
    passRate,
  };
};

/**
 * Count grade distribution for a set of marks
 *
 * @param {Array} marks       - Array of mark objects with grade field
 * @returns {Object}          - Count per grade
 */
const gradeDistribution = (marks) => {
  const dist = {
    EE1:0, EE2:0,
    ME1:0, ME2:0,
    AE1:0, AE2:0,
    BE1:0, BE2:0,
  };

  marks.forEach(mark => {
    if (mark.grade && dist[mark.grade] !== undefined) {
      dist[mark.grade]++;
    }
  });

  return dist;
};

/* ══════════════════════════════════════════════════════════
   EXPORTS
══════════════════════════════════════════════════════════ */
module.exports = {
  DEFAULT_SCALE,
  GRADE_COMMENTS,
  getGrade,
  getPoints,
  getComment,
  getMeanGrade,
  processScore,
  computeClassResults,
  assignSubjectPositions,
  calculateStats,
  gradeDistribution,
};