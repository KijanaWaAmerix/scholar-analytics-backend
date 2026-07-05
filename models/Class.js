/* ═══════════════════════════════════════════════════════════
   SCHOLAR ANALYTICS — Class Model
   File: backend/models/Class.js
   Handles: Grade 7, 8, 9 — with streams
═══════════════════════════════════════════════════════════ */

const mongoose = require('mongoose');

const classSchema = new mongoose.Schema(
  {
    name: {
      type     : String,
      required : [true, 'Class name is required'],
      trim     : true,
      /* e.g. "Grade 7 East" */
    },

    grade: {
      type     : Number,
      required : [true, 'Grade is required'],
      enum     : {
        values  : [7, 8, 9],
        message : 'Grade must be 7, 8 or 9 for JSS CBC',
      },
    },

    stream: {
      type    : String,
      trim    : true,
      default : null,
      /* e.g. "East", "West", "North", "South" */
    },

    school: {
      type     : mongoose.Schema.Types.ObjectId,
      ref      : 'School',
      required : [true, 'School is required'],
    },

    classTeacher: {
      type    : mongoose.Schema.Types.ObjectId,
      ref     : 'User',
      default : null,
    },

    academicYear: {
      type     : String,
      required : [true, 'Academic year is required'],
      default  : '2024',
    },

    capacity : { type: Number, default: 45  },
    isActive : { type: Boolean, default: true },
  },
  {
    timestamps : true,
    toJSON     : { virtuals: true },
    toObject   : { virtuals: true },
  }
);

/* Virtual — get all students in this class */
classSchema.virtual('students', {
  ref         : 'Student',
  localField  : '_id',
  foreignField: 'class',
});

/* One class name per school per year */
classSchema.index(
  { name: 1, school: 1, academicYear: 1 },
  { unique: true }
);

classSchema.index({ school: 1, grade: 1 });

module.exports = mongoose.model('Class', classSchema);