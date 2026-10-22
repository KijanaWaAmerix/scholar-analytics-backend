/* ═══════════════════════════════════════════════════════════
   SCHOLAR ANALYTICS — Auth Controller
   File: backend/controllers/authController.js
   Handles: Login, setup, password reset, profile
═══════════════════════════════════════════════════════════ */

const crypto  = require('crypto');
const jwt     = require('jsonwebtoken');
const User    = require('../models/User');
const School  = require('../models/School');
const { sendSMS } = require('../utils/smsService');
const {
  sendPasswordResetEmail,
  sendResetCodeEmail,
  sendAccountSetupEmail,
  sendPasswordChangedEmail,
} = require('../utils/emailService');

/* ══════════════════════════════════════════════════════════
   HELPER — Generate JWT token
══════════════════════════════════════════════════════════ */
const generateJWT = (userId) => {
  return jwt.sign(
    { id: userId },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE || '7d' }
  );
};

/* ══════════════════════════════════════════════════════════
   HELPER — Send token response
══════════════════════════════════════════════════════════ */
const sendTokenResponse = async (user, statusCode, res) => {
  const token = generateJWT(user._id);

  /* Get school info to include subscription status */
  let schoolData = null;
  if (user.school) {
    const school = await School.findById(user.school)
      .select('schoolName status subscription lockedReason');

    if (school) {
      schoolData = {
        id           : school._id,
        schoolName   : school.schoolName,
        status       : school.status,
        expiryDate   : school.subscription?.expiryDate,
        plan         : school.subscription?.plan,
        daysLeft     : school.daysUntilExpiry(),
        lockedReason : school.lockedReason,
      };
    }
  }

  /* Update last login */
  await User.findByIdAndUpdate(user._id, { lastLogin: new Date() });

  res.status(statusCode).json({
    success : true,
    token,
    user    : {
      id      : user._id,
      fullName: user.fullName,
      email   : user.email,
      role    : user.role,
      phone   : user.phone,
    },
    school  : schoolData,
  });
};

/* ══════════════════════════════════════════════════════════
   1. LOGIN
   POST /api/auth/login
   Public
══════════════════════════════════════════════════════════ */
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    /* Validate fields */
    if (!email || !password) {
      return res.status(400).json({
        success : false,
        message : 'Please provide both email and password.',
      });
    }

    /* Find user — include password for comparison */
    const user = await User.findOne({
      email: email.toLowerCase().trim(),
    }).select('+password');

    /* User not found or wrong password */
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({
        success   : false,
        message   : 'Invalid email or password.',
        errorCode : 'INVALID_CREDENTIALS',
      });
    }

    /* Account not set up yet */
    if (!user.isAccountSetup && user.role !== 'superadmin') {
      return res.status(401).json({
        success : false,
        message : 'Please complete your account setup first. Check your email.',
      });
    }

    /* Account inactive */
    if (!user.isActive) {
      return res.status(401).json({
        success : false,
        message : 'Your account has been deactivated. Contact your administrator.',
      });
    }

    /* All good — send token */
    await sendTokenResponse(user, 200, res);

  } catch (error) {
    next(error);
  }
};

/* ══════════════════════════════════════════════════════════
   2. GET CURRENT USER
   GET /api/auth/me
   Protected
══════════════════════════════════════════════════════════ */
const getMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id)
      .populate('school', 'schoolName status subscription');

    res.status(200).json({
      success : true,
      user,
    });
  } catch (error) {
    next(error);
  }
};

/* ══════════════════════════════════════════════════════════
   3. FORGOT PASSWORD
   POST /api/auth/forgot-password
   Public
══════════════════════════════════════════════════════════ */
const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success : false,
        message : 'Please provide your email address.',
      });
    }

    const user = await User.findOne({
      email: email.toLowerCase().trim(),
    });

    /*
     * Security: Always return success even if email not found.
     * This prevents attackers from knowing which emails exist.
     */
    if (!user) {
      return res.status(200).json({
        success : true,
        message : 'If that email exists, a reset link has been sent.',
      });
    }

    /* Generate reset token */
    const resetToken = user.generateToken();
    await user.save({ validateBeforeSave: false });

    /* Build reset URL */
    const resetUrl =
      `${process.env.FRONTEND_URL}/pages/reset-password.html?token=${resetToken}`;

    /* Send email */
    await sendPasswordResetEmail({
      email    : user.email,
      name     : user.fullName,
      resetUrl,
    });

    res.status(200).json({
      success : true,
      message : 'If that email exists, a reset link has been sent.',
    });

  } catch (error) {
    /* If email fails, clear the token */
    await User.findOneAndUpdate(
      { email: req.body.email?.toLowerCase() },
      {
        resetPasswordToken  : undefined,
        resetPasswordExpire : undefined,
      }
    );
    next(error);
  }
};

/* ══════════════════════════════════════════════════════════
   3b. RESET CODE (SMS or email)
   POST /api/auth/request-reset-code   { method, identifier }
   POST /api/auth/verify-reset-code    { method, identifier, code }
   Public. The 6-digit code is stored hashed, expires in 10 min,
   allows 5 wrong tries, and the reply never reveals whether the
   phone / email is registered.
══════════════════════════════════════════════════════════ */
const CODE_MINUTES  = 10;
const CODE_COOLDOWN = 60 * 1000;
const CODE_MAX_TRIES = 5;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* 0712345678 / +254 712 345 678 / 712345678  →  "712345678" */
const phoneCore = (raw) => {
  let d = String(raw || '').replace(/\D/g, '');
  if (d.startsWith('254')) d = d.slice(3);
  else if (d.startsWith('0')) d = d.slice(1);
  return /^[17]\d{8}$/.test(d) ? d : '';
};

const hashCode = (userId, code) =>
  crypto.createHash('sha256')
    .update(`${userId}:${code}:${process.env.JWT_SECRET || ''}`)
    .digest('hex');

/* One box for both: anything with "@" is an email, otherwise a phone */
const detectMethod = (identifier) => (String(identifier || '').includes('@') ? 'email' : 'phone');

/* Returns the single matching active user, or null */
const findResetUser = async (method, identifier) => {
  if (method === 'phone') {
    const core = phoneCore(identifier);
    if (!core) return null;
    /* saved phones may be 07.., +254.. or contain spaces */
    const rx = new RegExp(
      '^[^0-9]*(?:(?:254|0)[^0-9]*)?' + core.split('').join('[^0-9]*') + '[^0-9]*$'
    );
    const users = await User.find({ phone: rx, isActive: true })
      .select('+resetCodeHash');
    if (users.length > 1) {
      console.warn('Reset code: phone matches several users, not sending.');
      return null;
    }
    return users[0] || null;
  }
  const email = String(identifier || '').toLowerCase().trim();
  if (!EMAIL_RE.test(email)) return null;
  return User.findOne({ email, isActive: true }).select('+resetCodeHash');
};

const requestResetCode = async (req, res, next) => {
  try {
    const identifier = String(req.body.identifier || '').trim();
    const method     = detectMethod(identifier);

    const valid = method === 'phone'
      ? !!phoneCore(identifier)
      : EMAIL_RE.test(identifier);
    if (!valid) {
      return res.status(400).json({
        success : false,
        message : 'Enter the email address or Kenyan phone number on your account.',
      });
    }

    const generic = {
      success : true,
      message : 'If that account exists, a code has been sent.',
    };

    const user = await findResetUser(method, identifier);
    if (!user) return res.status(200).json(generic);

    /* 60-second cooldown between codes */
    if (user.resetCodeSentAt && Date.now() - user.resetCodeSentAt.getTime() < CODE_COOLDOWN) {
      return res.status(200).json(generic);
    }

    const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
    user.resetCodeHash     = hashCode(user._id, code);
    user.resetCodeExpire   = new Date(Date.now() + CODE_MINUTES * 60 * 1000);
    user.resetCodeAttempts = 0;
    user.resetCodeSentAt   = new Date();
    await user.save({ validateBeforeSave: false });

    /* Send the SAME code by SMS and by email, at the same time */
    const jobs = [];

    if (user.phone && phoneCore(user.phone)) {
      jobs.push(
        sendSMS({
          to      : user.phone,
          message : `Scholar Analytics: your reset code is ${code}. ` +
                    `It expires in ${CODE_MINUTES} minutes. Do not share it.`,
        }).then((r) => {
          if (!r.success) throw new Error(r.error || r.status || 'SMS not sent');
        })
      );
    }
    if (user.email) {
      jobs.push(sendResetCodeEmail({ email: user.email, name: user.fullName, code }));
    }

    const results = await Promise.allSettled(jobs);
    results.forEach((r) => {
      if (r.status === 'rejected') console.error('Reset code send failed:', r.reason?.message || r.reason);
    });
    const sent = results.some((r) => r.status === 'fulfilled');

    if (!sent) {
      user.resetCodeHash   = undefined;
      user.resetCodeExpire = undefined;
      user.resetCodeSentAt = undefined;
      await user.save({ validateBeforeSave: false });
    }

    res.status(200).json(generic);
  } catch (error) {
    next(error);
  }
};

const verifyResetCode = async (req, res, next) => {
  try {
    const identifier = String(req.body.identifier || '').trim();
    const method     = detectMethod(identifier);
    const code       = String(req.body.code || '').replace(/\D/g, '');

    const bad = (msg) => res.status(400).json({
      success : false,
      message : msg || 'That code is incorrect or has expired.',
    });

    if (code.length !== 6) return bad('Enter the 6-digit code.');

    const user = await findResetUser(method, identifier);
    if (!user || !user.resetCodeHash || !user.resetCodeExpire ||
        user.resetCodeExpire.getTime() < Date.now()) {
      return bad();
    }

    if (user.resetCodeAttempts >= CODE_MAX_TRIES) {
      user.resetCodeHash = undefined;
      user.resetCodeExpire = undefined;
      await user.save({ validateBeforeSave: false });
      return bad('Too many wrong tries. Please request a new code.');
    }

    const given  = Buffer.from(hashCode(user._id, code));
    const stored = Buffer.from(user.resetCodeHash);
    const ok = given.length === stored.length && crypto.timingSafeEqual(given, stored);

    if (!ok) {
      user.resetCodeAttempts += 1;
      await user.save({ validateBeforeSave: false });
      return bad();
    }

    /* Correct: swap the code for a one-time reset token (30 min),
       which the page then uses with POST /auth/reset-password/:token */
    const resetToken = user.generateToken();
    user.resetCodeHash     = undefined;
    user.resetCodeExpire   = undefined;
    user.resetCodeAttempts = 0;
    await user.save({ validateBeforeSave: false });

    res.status(200).json({ success: true, resetToken });
  } catch (error) {
    next(error);
  }
};

/* ══════════════════════════════════════════════════════════
   4. RESET PASSWORD
   POST /api/auth/reset-password/:token
   Public
══════════════════════════════════════════════════════════ */
const resetPassword = async (req, res, next) => {
  try {
    const { password, confirmPassword } = req.body;

    if (!password || !confirmPassword) {
      return res.status(400).json({
        success : false,
        message : 'Please provide a new password and confirm it.',
      });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({
        success : false,
        message : 'Passwords do not match.',
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        success : false,
        message : 'Password must be at least 8 characters.',
      });
    }

    /* Hash the token from URL and find matching user */
    const hashedToken = crypto
      .createHash('sha256')
      .update(req.params.token)
      .digest('hex');

    const user = await User.findOne({
      resetPasswordToken  : hashedToken,
      resetPasswordExpire : { $gt: Date.now() }, // not expired
    });

    if (!user) {
      return res.status(400).json({
        success : false,
        message : 'Reset link is invalid or has expired. Please request a new one.',
      });
    }

    /* Set new password */
    user.password           = password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire= undefined;
    user.isAccountSetup     = true;
    await user.save();

    /* Send confirmation email */
    try {
      await sendPasswordChangedEmail({
        email : user.email,
        name  : user.fullName,
      });
    } catch (mailErr) {
      console.error('Password-changed email failed:', mailErr.message);
    }

    /* Log them in immediately */
    await sendTokenResponse(user, 200, res);

  } catch (error) {
    next(error);
  }
};

/* ══════════════════════════════════════════════════════════
   5. ACCOUNT SETUP (first time — teacher sets password)
   POST /api/auth/setup-account/:token
   Public
══════════════════════════════════════════════════════════ */
const setupAccount = async (req, res, next) => {
  try {
    const { password, confirmPassword } = req.body;

    if (!password || !confirmPassword) {
      return res.status(400).json({
        success : false,
        message : 'Please provide and confirm your password.',
      });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({
        success : false,
        message : 'Passwords do not match.',
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        success : false,
        message : 'Password must be at least 8 characters.',
      });
    }

    /* Hash the setup token and find user */
    const hashedToken = crypto
      .createHash('sha256')
      .update(req.params.token)
      .digest('hex');

    const user = await User.findOne({
      accountSetupToken  : hashedToken,
      accountSetupExpire : { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({
        success : false,
        message : 'Setup link is invalid or has expired. Ask your administrator to resend.',
      });
    }

    /* Activate account */
    user.password          = password;
    user.accountSetupToken = undefined;
    user.accountSetupExpire= undefined;
    user.isAccountSetup    = true;
    await user.save();

    /* Log them in */
    await sendTokenResponse(user, 200, res);

  } catch (error) {
    next(error);
  }
};

/* ══════════════════════════════════════════════════════════
   6. UPDATE PASSWORD (logged in user changing own password)
   PUT /api/auth/update-password
   Protected
══════════════════════════════════════════════════════════ */
const updatePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;

    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({
        success : false,
        message : 'Please provide current password, new password and confirmation.',
      });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({
        success : false,
        message : 'New passwords do not match.',
      });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({
        success : false,
        message : 'New password must be at least 8 characters.',
      });
    }

    /* Get user with password */
    const user = await User.findById(req.user._id).select('+password');

    /* Check current password */
    if (!(await user.comparePassword(currentPassword))) {
      return res.status(401).json({
        success : false,
        message : 'Current password is incorrect.',
      });
    }

    /* Update password */
    user.password = newPassword;
    await user.save();

    /* Send confirmation */
    await sendPasswordChangedEmail({
      email : user.email,
      name  : user.fullName,
    });

    await sendTokenResponse(user, 200, res);

  } catch (error) {
    next(error);
  }
};

/* ══════════════════════════════════════════════════════════
   7. UPDATE PROFILE
   PUT /api/auth/update-profile
   Protected
══════════════════════════════════════════════════════════ */
const updateProfile = async (req, res, next) => {
  try {
    /* Only allow these fields to be updated */
    const allowed = ['fullName', 'phone'];
    const updates = {};

    allowed.forEach(field => {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    });

    const user = await User.findByIdAndUpdate(
      req.user._id,
      updates,
      { new: true, runValidators: true }
    );

    res.status(200).json({
      success : true,
      message : 'Profile updated successfully.',
      user,
    });

  } catch (error) {
    next(error);
  }
};

/* ══════════════════════════════════════════════════════════
   8. LOGOUT (just a client-side action — but good to have)
   POST /api/auth/logout
   Protected
══════════════════════════════════════════════════════════ */
const logout = (req, res) => {
  res.status(200).json({
    success : true,
    message : 'Logged out successfully.',
    token   : null,
  });
};

module.exports = {
  login,
  getMe,
  forgotPassword,
  requestResetCode,
  verifyResetCode,
  resetPassword,
  setupAccount,
  updatePassword,
  updateProfile,
  logout,
};