/* ═══════════════════════════════════════════════════════════
   SCHOLAR ANALYTICS — Student Model
   File: backend/models/Student.js
═══════════════════════════════════════════════════════════ */

const mongoose = require('mongoose');

const studentSchema = new mongoose.Schema(
  {
    fullName: {
      type     : String,
      required : [true, 'Full name is required'],
      trim     : true,
    },

    /* CBC identifiers */
    upiNumber: {
      type     : String,
      required : [true, 'UPI number is required'],
      trim     : true,
      uppercase: true,
      match    : [
        /^[A-Za-z0-9]{6,20}$/,
        'UPI must be 6-20 alphanumeric characters',
      ],
    },

    assessmentNo: {
      type    : String,
      trim    : true,
      default : null,
    },

    dateOfBirth: {
      type     : Date,
      required : [true, 'Date of birth is required'],
    },

    gender: {
      type     : String,
      enum     : {
        values  : ['male', 'female'],
        message : 'Gender must be male or female',
      },
      required : [true, 'Gender is required'],
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
/* UPI must be unique within a school */
studentSchema.index({ upiNumber: 1, school: 1 }, { unique: true });
studentSchema.index({ class  : 1 });
studentSchema.index({ school : 1 });
/* Full-text search on name */
studentSchema.index({ fullName: 'text' });

module.exports = mongoose.model('Student', studentSchema);