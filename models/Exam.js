/* ═══════════════════════════════════════════════════════════
   SCHOLAR ANALYTICS — Exam Model
   File: backend/models/Exam.js
═══════════════════════════════════════════════════════════ */

const mongoose = require('mongoose');

const examSchema = new mongoose.Schema(
  {
    name: {
      type     : String,
      required : [true, 'Exam name is required'],
      enum     : {
        values  : ['Opener', 'Midterm', 'Endterm'],
        message : 'Exam must be Opener, Midterm or Endterm',
      },
    },

    term: {
      type     : Number,
      required : [true, 'Term is required'],
      enum     : {
        values  : [1, 2, 3],
        message : 'Term must be 1, 2 or 3',
      },
    },

    academicYear: {
      type     : String,
      required : [true, 'Academic year is required'],
      default  : '2024',
    },

    class: {
      type     : mongoose.Schema.Types.ObjectId,
      ref      : 'Class',
      required : [true, 'Class is required'],
    },

    school: {
      type     : mongoose.Schema.Types.ObjectId,
      ref      : 'School',
      required : [true, 'School is required'],
    },

    startDate : { type: Date },
    endDate   : { type: Date },

    /* Whether teachers can still enter marks */
    isOpen: {
      type    : Boolean,
      default : true,
    },

    /* Whether results are visible to parents */
    isPublished: {
      type    : Boolean,
      default : false,
    },

    createdBy: {
      type : mongoose.Schema.Types.ObjectId,
      ref  : 'User',
    },
  },
  { timestamps: true }
);

/* One exam type per class per term per year */
examSchema.index(
  { name: 1, term: 1, academicYear: 1, class: 1, school: 1 },
  { unique: true }
);

module.exports = mongoose.model('Exam', examSchema);