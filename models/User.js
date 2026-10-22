/* ═══════════════════════════════════════════════════════════
   SCHOLAR ANALYTICS — User model  (LAST-RESORT REPLACEMENT)

   Rebuilt from how your controllers use the model and from the
   saved admin record in Atlas. I have NOT seen your original file.
   Use this ONLY if Git has no good copy of models/User.js.

   Save it as: backend/models/User.js
═══════════════════════════════════════════════════════════ */

const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');   // your hashes start with $2a$12$ (bcryptjs, 12 rounds)
const crypto   = require('crypto');

const userSchema = new mongoose.Schema(
  {
    fullName: {
      type    : String,
      required: [true, 'Full name is required'],
      trim    : true,
    },
    email: {
      type     : String,
      required : [true, 'Email is required'],
      unique   : true,
      lowercase: true,
      trim     : true,
    },
    password: {
      type    : String,
      required: [true, 'Password is required'],
      select  : false,                    // login uses .select('+password')
    },
    role: {
      type   : String,
      enum   : ['superadmin', 'admin', 'teacher'],
      default: 'teacher',
    },
    school: {
      type: mongoose.Schema.Types.ObjectId,
      ref : 'School',
    },
    phone: { type: String, trim: true },

    isActive      : { type: Boolean, default: true  },
    isAccountSetup: { type: Boolean, default: false },
    lastLogin     : { type: Date,    default: null  },
    profilePhoto  : { type: String,  default: null  },

    assignedSubjects: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Subject' }],

    resetPasswordToken : String,
    resetPasswordExpire: Date,
    /* 6-digit reset code (SMS / email) — only a hash is stored */
    resetCodeHash      : { type: String, select: false },
    resetCodeExpire    : Date,
    resetCodeAttempts  : { type: Number, default: 0 },
    resetCodeSentAt    : Date,
    accountSetupToken  : String,
    accountSetupExpire : Date,
  },
  { timestamps: true }
);

/* Hash the password whenever it is new or changed */
userSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, 12);
});

/* Compare a typed password with the stored hash */
userSchema.methods.comparePassword = function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

/* Password-reset token: the raw token goes in the email link,
   only its SHA-256 hash is stored (authController compares hashes). */
userSchema.methods.generateToken = function () {
  const raw = crypto.randomBytes(32).toString('hex');
  this.resetPasswordToken  = crypto.createHash('sha256').update(raw).digest('hex');
  this.resetPasswordExpire = Date.now() + 30 * 60 * 1000;
  return raw;
};

/* Account-setup token (used by the teacher setup-email flow) */
userSchema.methods.generateSetupToken = function () {
  const raw = crypto.randomBytes(32).toString('hex');
  this.accountSetupToken  = crypto.createHash('sha256').update(raw).digest('hex');
  this.accountSetupExpire = Date.now() + 72 * 60 * 60 * 1000;
  return raw;
};

module.exports = mongoose.model('User', userSchema);