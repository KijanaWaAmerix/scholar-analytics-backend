/* ═══════════════════════════════════════════════════════════
   SCHOLAR ANALYTICS — Student Model
   File: backend/models/Student.js
═══════════════════════════════════════════════════════════ */

const mongoose = require('mongoose');

const studentSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: [true, 'Full name is required'],
      trim: true,
    },

    upiNumber: {
      type: String,
      trim: true,
      uppercase: true,
      default: undefined,

      validate: {
        validator: function (v) {
          return (
            v === undefined ||
            v === null ||
            v === '' ||
            /^[A-Za-z0-9]{6,20}$/.test(v)
          );
        },
        message: 'UPI must be 6-20 alphanumeric characters',
      },
    },

    assessmentNo: {
      type: String,
      trim: true,
      default: null,
    },

    dateOfBirth: {
      type: Date,
      default: null,
    },

    gender: {
      type: String,
      enum: {
        values: ['male', 'female'],
        message: 'Gender must be male or female',
      },
      default: null,
    },

    class: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Class',
      required: [true, 'Class is required'],
    },

    school: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'School',
      required: [true, 'School is required'],
    },

    parentName: {
      type: String,
      trim: true,
    },

    parentPhone: {
      type: String,
      trim: true,
    },

    parentEmail: {
      type: String,
      lowercase: true,
      trim: true,
      default: null,
    },

    parentPortalPin: {
      type: String,
      select: false,
    },

    address: {
      type: String,
      trim: true,
    },

    photo: {
      type: String,
      default: null,
    },

    profileIncomplete: {
      type: Boolean,
      default: false,
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    enrollmentDate: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

/*
 * UPI is unique only when an actual UPI exists.
 * Learners without a UPI are allowed.
 */
studentSchema.index(
  { upiNumber: 1, school: 1 },
  {
    unique: true,
    partialFilterExpression: {
      upiNumber: {
        $type: 'string',
      },
    },
  }
);

studentSchema.index({ class: 1 });
studentSchema.index({ school: 1 });
studentSchema.index({ fullName: 'text' });

module.exports = mongoose.model('Student', studentSchema);