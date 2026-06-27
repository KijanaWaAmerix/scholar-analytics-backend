/* ═══════════════════════════════════════════════════════════
   SCHOLAR ANALYTICS — User Model
   File: backend/models/User.js
═══════════════════════════════════════════════════════════ */

const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    fullName: {
      type     : String,
      required : [true, 'Full name is required'],
      trim     : true,
      minlength: [3, 'Name must be at least 3 characters'],
    },

    email: {
      type     : String,
      required : [true, 'Email is required'],
      unique   : true,
      lowercase: true,
      trim     : true,
      match    : [
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
        'Please provide a valid email address',
      ],
    },

    password: {
      type     : String,
      required : [true, 'Password is required'],
      minlength: [8, 'Password must be at least 8 characters'],
      select   : false,
    },

    role: {
      type    : String,
      enum    : ['superadmin', 'admin', 'teacher'],
      default : 'teacher',
    },

    phone: {
      type : String,
      trim : true,
    },

    school: {
      type : mongoose.Schema.Types.ObjectId,
      ref  : 'School',
    },

    assignedSubjects: [
      {
        subject : { type: mongoose.Schema.Types.ObjectId, ref: 'Subject' },
        class   : { type: mongoose.Schema.Types.ObjectId, ref: 'Class'   },
      },
    ],

    isActive: {
      type    : Boolean,
      default : true,
    },

    resetPasswordToken  : String,
    resetPasswordExpire : Date,
    accountSetupToken   : String,
    accountSetupExpire  : Date,

    isAccountSetup: {
      type    : Boolean,
      default : false,
    },

    lastLogin: {
      type    : Date,
      default : null,
    },

    profilePhoto: {
      type    : String,
      default : null,
    },
  },
  {
    timestamps: true,
  }
);

/* ══════════════════════════════════════════════════════════
   PRE-SAVE HOOK — Hash password before saving
   Note: No next() needed in async Mongoose 7+ hooks
══════════════════════════════════════════════════════════ */
userSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, 12);
});

/* ══════════════════════════════════════════════════════════
   INSTANCE METHODS
══════════════════════════════════════════════════════════ */
userSchema.methods.comparePassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

userSchema.methods.generateToken = function () {
  const crypto = require('crypto');
  const token  = crypto.randomBytes(32).toString('hex');

  this.resetPasswordToken  = crypto
    .createHash('sha256')
    .update(token)
    .digest('hex');

  this.resetPasswordExpire = Date.now() + 60 * 60 * 1000;

  return token;
};

/* ══════════════════════════════════════════════════════════
   INDEXES
══════════════════════════════════════════════════════════ */
userSchema.index({ school: 1, role: 1 });

module.exports = mongoose.model('User', userSchema);