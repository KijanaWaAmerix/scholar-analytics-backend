/* ═══════════════════════════════════════════════════════════
   SCHOLAR ANALYTICS — Mark Model
   File: backend/models/Mark.js
═══════════════════════════════════════════════════════════ */

const mongoose = require('mongoose');

const markSchema = new mongoose.Schema(
  {
    student: {
      type    : mongoose.Schema.Types.ObjectId,
      ref     : 'Student',
      required: true,
    },

    exam: {
      type    : mongoose.Schema.Types.ObjectId,
      ref     : 'Exam',
      required: true,
    },

    subject: {
      type    : mongoose.Schema.Types.ObjectId,
      ref     : 'Subject',
      required: true,
    },

    class: {
      type    : mongoose.Schema.Types.ObjectId,
      ref     : 'Class',
      required: true,
    },

    school: {
      type    : mongoose.Schema.Types.ObjectId,
      ref     : 'School',
      required: true,
    },

    score : { type: Number, min: 0, max: 100, default: null },
    absent: { type: Boolean, default: false },
    grade : { type: String, default: null },
    points: { type: Number, default: 0, min: 0, max: 8 },
  },
  {
    timestamps: true,
  }
);

/* Unique mark per student per subject per exam */
markSchema.index(
  { student:1, subject:1, exam:1, school:1 },
  { unique: true }
);

markSchema.index({ class:1, exam:1, school:1 });

module.exports = mongoose.model('Mark', markSchema);