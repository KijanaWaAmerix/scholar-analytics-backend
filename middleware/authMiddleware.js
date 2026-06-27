/* ═══════════════════════════════════════════════════════════
   SCHOLAR ANALYTICS — Auth Middleware
   File: backend/middleware/authMiddleware.js
═══════════════════════════════════════════════════════════ */

const jwt  = require('jsonwebtoken');
const User = require('../models/User');

/* ══════════════════════════════════════════════════════════
   PROTECT — verify JWT token
══════════════════════════════════════════════════════════ */
exports.protect = async (req, res, next) => {
  try {
    let token;

    /* Get token from Authorization header */
    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith('Bearer ')
    ) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Not authenticated. Please log in.',
      });
    }

    /* Verify token */
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      return res.status(401).json({
        success: false,
        message: 'Session expired. Please log in again.',
      });
    }

    /* Find user */
    const user = await User.findById(decoded.id)
      .select('-password')
      .lean();

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User no longer exists.',
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Your account has been deactivated. Contact admin.',
      });
    }

    /* Attach user to request */
    req.user = user;
    next();

  } catch (error) {
    console.error('Auth middleware error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Authentication error.',
    });
  }
};

/* ══════════════════════════════════════════════════════════
   AUTHORIZE — role-based access control
   Usage: authorize('admin', 'superadmin')
══════════════════════════════════════════════════════════ */
exports.authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Not authenticated.',
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Your role '${req.user.role}' is not authorized for this action.`,
      });
    }

    next();
  };
};

/* ══════════════════════════════════════════════════════════
   CHECK SCHOOL STATUS
   Blocks access if school is locked or suspended
══════════════════════════════════════════════════════════ */
exports.checkSchool = async (req, res, next) => {
  try {
    /* SuperAdmins bypass school checks */
    if (req.user?.role === 'superadmin') return next();

    if (!req.user?.school) {
      return res.status(403).json({
        success: false,
        message: 'No school associated with this account.',
      });
    }

    const School = require('../models/School');
    const school = await School.findById(req.user.school).lean();

    if (!school) {
      return res.status(404).json({
        success: false,
        message: 'School not found.',
      });
    }

    if (school.status === 'locked' || school.status === 'suspended') {
      return res.status(403).json({
        success: false,
        message: 'SCHOOL_LOCKED',
        reason : school.lockedReason || 'Account suspended. Contact support.',
      });
    }

    next();

  } catch (error) {
    next(error);
  }
};