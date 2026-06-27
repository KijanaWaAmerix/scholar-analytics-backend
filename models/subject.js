/* ═══════════════════════════════════════════════════════════
   SCHOLAR ANALYTICS — Subject Model
   File: backend/models/Subject.js
   Handles: 9 CBC JSS Learning Areas
═══════════════════════════════════════════════════════════ */

const mongoose = require('mongoose');

const subjectSchema = new mongoose.Schema(
  {
    name: {
      type     : String,
      required : [true, 'Subject name is required'],
      trim     : true,
    },

    code: {
      type      : String,
      required  : [true, 'Subject code is required'],
      uppercase : true,
      trim      : true,
      /* ENG, KIS, MATH, INTER, SST, CRE, PRT, AGR, CAS */
    },

    school: {
      type     : mongoose.Schema.Types.ObjectId,
      ref      : 'School',
      required : [true, 'School is required'],
    },

    class: {
      type     : mongoose.Schema.Types.ObjectId,
      ref      : 'Class',
      required : [true, 'Class is required'],
    },

    teacher: {
      type    : mongoose.Schema.Types.ObjectId,
      ref     : 'User',
      default : null,
    },

    learningArea: {
      type : String,
      enum : [
        'Languages',
        'Mathematics',
        'Sciences',
        'Humanities',
        'Technical',
        'Creative Arts',
        'Life Skills',
      ],
    },

    maxScore  : { type: Number, default: 100  },
    isOptional: { type: Boolean, default: false },
    isActive  : { type: Boolean, default: true  },
  },
  { timestamps: true }
);

/* One subject code per class */
subjectSchema.index(
  { code: 1, class: 1, school: 1 },
  { unique: true }
);

module.exports = mongoose.model('Subject', subjectSchema);