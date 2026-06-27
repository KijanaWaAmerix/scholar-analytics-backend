/* ═══════════════════════════════════════════════════════════
   SCHOLAR ANALYTICS — Auth Controller
   File: backend/controllers/authController.js
   Handles: Login, setup, password reset, profile
═══════════════════════════════════════════════════════════ */

const crypto  = require('crypto');
const jwt     = require('jsonwebtoken');
const User    = require('../models/User');
const School  = require('../models/School');
const {
  sendPasswordResetEmail,
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
    await sendPasswordChangedEmail({
      email : user.email,
      name  : user.fullName,
    });

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
  resetPassword,
  setupAccount,
  updatePassword,
  updateProfile,
  logout,
};