/* ═══════════════════════════════════════════════════════════
   SCHOLAR ANALYTICS — Report Card Model
   File: backend/models/ReportCard.js
   Stores computed results — generated from Marks
═══════════════════════════════════════════════════════════ */

const mongoose = require('mongoose');

/* Sub-schema for each subject result */
const subjectResultSchema = new mongoose.Schema({
  subject        : { type: mongoose.Schema.Types.ObjectId, ref: 'Subject' },
  subjectName    : String,
  subjectCode    : String,
  score          : Number,
  grade          : String,   /* EE1, EE2, ME1, ME2, AE1, AE2, BE1, BE2 */
  gradePoints    : Number,   /* 1 to 8 */
  gradeLabel     : String,   /* Exceptional, Very Good etc. */
  subjectPosition: Number,   /* Position in class for this subject */
  teacherComment : String,
}, { _id: false });

const reportCardSchema = new mongoose.Schema(
  {
    student: {
      type     : mongoose.Schema.Types.ObjectId,
      ref      : 'Student',
      required : true,
    },

    exam: {
      type     : mongoose.Schema.Types.ObjectId,
      ref      : 'Exam',
      required : true,
    },

    class: {
      type     : mongoose.Schema.Types.ObjectId,
      ref      : 'Class',
      required : true,
    },

    school: {
      type     : mongoose.Schema.Types.ObjectId,
      ref      : 'School',
      required : true,
    },

    academicYear : { type: String, required: true },
    term         : { type: Number, required: true },
    examName     : { type: String, required: true },

    /* All 9 subject results */
    subjects: [subjectResultSchema],

    /* Computed totals */
    totalScore    : { type: Number }, /* Sum of all scores   */
    totalSubjects : { type: Number }, /* Number of subjects  */
    averageScore  : { type: Number }, /* Mean percentage     */
    totalPoints   : { type: Number }, /* Sum of KJSEA points */
    meanGrade     : { type: String }, /* EE1, ME2 etc.       */

    /* Class ranking */
    classPosition : { type: Number },
    totalStudents : { type: Number },

    /* Comments */
    classTeacherComment : { type: String },
    principalComment    : { type: String },

    /* PDF path after generation */
    pdfPath     : { type: String,  default: null },
    generatedAt : { type: Date                   },
    generatedBy : {
      type    : mongoose.Schema.Types.ObjectId,
      ref     : 'User',
    },
  },
  { timestamps: true }
);

/* One report card per student per exam */
reportCardSchema.index(
  { student: 1, exam: 1 },
  { unique: true }
);

reportCardSchema.index({ class: 1, exam: 1 });
reportCardSchema.index({ school: 1 });

module.exports = mongoose.model('ReportCard', reportCardSchema);