/* ═══════════════════════════════════════════════════════════
   SCHOLAR ANALYTICS — Settings Controller
   File: backend/controllers/settingscontrollers.js
═══════════════════════════════════════════════════════════ */

const School = require('../models/School');
const User   = require('../models/User');

/* ══════════════════════════════════════════════════════════
   GET SCHOOL SETTINGS
══════════════════════════════════════════════════════════ */
exports.getSettings = async (req, res, next) => {
  try {
    const school = await School.findById(req.user.school).lean();

    if (!school) {
      return res.status(404).json({
        success: false,
        message: 'School not found.',
      });
    }

    const admin = await User.findOne({
      school: req.user.school,
      role  : 'admin',
    }).select('fullName email phone').lean();

    res.status(200).json({
      success: true,
      school,
      admin,
    });

  } catch (error) {
    next(error);
  }
};

/* ══════════════════════════════════════════════════════════
   UPDATE SCHOOL INFO
══════════════════════════════════════════════════════════ */
exports.updateSchoolInfo = async (req, res, next) => {
  try {
    const {
      schoolName, schoolMotto, schoolEmail,
      schoolPhone, schoolAddress,
      principalName, principalPhone,
      currentTerm, currentYear,
      termOpeningDate, termClosingDate, nextTermDate,
    } = req.body;

    const school = await School.findById(req.user.school);

    if (!school) {
      return res.status(404).json({
        success: false,
        message: 'School not found.',
      });
    }

    if (schoolName)    school.schoolName    = schoolName;
    if (schoolMotto)   school.schoolMotto   = schoolMotto;
    if (schoolEmail)   school.schoolEmail   = schoolEmail;
    if (schoolPhone)   school.schoolPhone   = schoolPhone;
    if (schoolAddress) school.schoolAddress = schoolAddress;

    if (!school.principal) school.principal = {};
    if (principalName)  school.principal.name  = principalName;
    if (principalPhone) school.principal.phone = principalPhone;

    if (!school.academic) school.academic = {};
    if (currentTerm)     school.academic.currentTerm     = Number(currentTerm);
    if (currentYear)     school.academic.currentYear     = currentYear;
    if (termOpeningDate) school.academic.termOpeningDate = termOpeningDate;
    if (termClosingDate) school.academic.termClosingDate = termClosingDate;
    if (nextTermDate)    school.academic.nextTermDate    = nextTermDate;

    await school.save();

    res.status(200).json({
      success: true,
      message: 'School settings saved successfully.',
      school,
    });

  } catch (error) {
    next(error);
  }
};

/* ══════════════════════════════════════════════════════════
   CHANGE PASSWORD
══════════════════════════════════════════════════════════ */
exports.changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Current and new password are required.',
      });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'New password must be at least 8 characters.',
      });
    }

    const user = await User.findById(req.user._id).select('+password');

    const isMatch = await user.comparePassword(currentPassword);

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Current password is incorrect.',
      });
    }

    user.password = newPassword;
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Password changed successfully.',
    });

  } catch (error) {
    next(error);
  }
};