/* ═══════════════════════════════════════════════════════════
   SCHOLAR ANALYTICS — Student Model
   File: backend/models/Student.js

   UPDATED: upiNumber, dateOfBirth and gender are now optional,
   so students can be created quickly (e.g. via Excel import)
   with just a name, and completed later via the Students page.
═══════════════════════════════════════════════════════════ */

const mongoose = require('mongoose');

const studentSchema = new mongoose.Schema(
  {
    fullName: {
      type     : String,
      required : [true, 'Full name is required'],
      trim     : true,
    },

    /* CBC identifiers — now optional, fill in later if not known yet */
    upiNumber: {
      type     : String,
      trim     : true,
      uppercase: true,
      default  : null,
      match    : [
        /^[A-Za-z0-9]{6,20}$/,
        'UPI must be 6-20 alphanumeric characters',
      ],
      /* Only validate the pattern when a value is actually provided */
      validate: {
        validator: function (v) {
          return v === null || v === '' || /^[A-Za-z0-9]{6,20}$/.test(v);
        },
        message: 'UPI must be 6-20 alphanumeric characters',
      },
    },

    assessmentNo: {
      type    : String,
      trim    : true,
      default : null,
    },

    dateOfBirth: {
      type     : Date,
      default  : null,
    },

    gender: {
      type     : String,
      enum     : {
        values  : ['male', 'female'],
        message : 'Gender must be male or female',
      },
      default  : null,
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

    /* Parent / Guardian */
    parentName  : { type: String, trim: true },
    parentPhone : { type: String, trim: true },
    parentEmail : { type: String, lowercase: true, trim: true, default: null },

    /* Parent portal PIN (hashed) */
    parentPortalPin : { type: String, select: false },

    address : { type: String, trim: true },
    photo   : { type: String, default: null },

    /* Flags an incomplete profile — set true by quick-add flows like
       Excel import, cleared once UPI/DOB/gender are filled in */
    profileIncomplete: { type: Boolean, default: false },

    isActive       : { type: Boolean, default: true  },
    enrollmentDate : { type: Date,    default: Date.now },
  },
  {
    timestamps : true,
    toJSON     : { virtuals: true },
    toObject   : { virtuals: true },
  }
);

/* ── Indexes ───────────────────────────────────────────── */
/* UPI must be unique within a school — sparse so multiple students
   with no UPI yet (null) don't collide with each other */
studentSchema.index(
  { upiNumber: 1, school: 1 },
  { unique: true, sparse: true }
);
studentSchema.index({ class  : 1 });
studentSchema.index({ school : 1 });
/* Full-text search on name */
studentSchema.index({ fullName: 'text' });

module.exports = mongoose.model('Student', studentSchema);