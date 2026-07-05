const mongoose = require('mongoose');

const schoolSchema = new mongoose.Schema(
  {
    schoolName   : { type: String, required: true, trim: true },
    schoolMotto  : { type: String, trim: true, default: 'Excellence Through Knowledge' },
    schoolEmail  : { type: String, trim: true, lowercase: true },
    schoolPhone  : { type: String, trim: true },
    schoolAddress: { type: String, trim: true },
    schoolLogo   : { type: String, default: null },

    principal: {
      name : { type: String, trim: true },
      phone: { type: String, trim: true },
    },

    academic: {
      currentTerm    : { type: Number, default: 1 },
      currentYear    : { type: String, default: '2024' },
      termOpeningDate: { type: String },
      termClosingDate: { type: String },
      nextTermDate   : { type: String },
    },

    status: {
      type   : String,
      enum   : ['active','locked','suspended','trial'],
      default: 'active',
    },

    subscription: {
      plan      : { type: String, enum:['trial','standard','premium'], default:'standard' },
      expiryDate: { type: Date },
      autoLock  : { type: Boolean, default: false },
    },

    lockedAt    : { type: Date,   default: null },
    lockedReason: { type: String, default: null },
  },
  { timestamps: true }
);

/* Instance methods */
schoolSchema.methods.isExpired = function () {
  if (!this.subscription?.expiryDate) return false;
  return new Date() > new Date(this.subscription.expiryDate);
};

schoolSchema.methods.daysUntilExpiry = function () {
  if (!this.subscription?.expiryDate) return null;
  return Math.ceil(
    (new Date(this.subscription.expiryDate) - new Date()) /
    (1000 * 60 * 60 * 24)
  );
};

module.exports = mongoose.model('School', schoolSchema);