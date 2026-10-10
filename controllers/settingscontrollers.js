/* ═══════════════════════════════════════════════════════════
   SCHOLAR ANALYTICS — Settings Controller
   File: backend/controllers/settingscontrollers.js
═══════════════════════════════════════════════════════════ */

const School = require('../models/School');
const User   = require('../models/User');
const Class  = require('../models/Class');

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

/* ══════════════════════════════════════════════════════════
   CLASS + SUBJECT TEACHER NAMES  (used by the Reports page)
══════════════════════════════════════════════════════════ */
const MAX_NAME     = 80;
const MAX_SUBJECTS = 30;

const cleanText = (v) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME);

/* MongoDB field names cannot contain "." or start with "$" */
const encodeKey = (k) => k.replace(/\./g, '%2E').replace(/^\$/, '%24');
const decodeKey = (k) => k.replace(/%2E/g, '.').replace(/^%24/, '$');

/* GET /api/settings/class-teachers — every class of the user's school */
exports.getClassTeachers = async (req, res, next) => {
  try {
    if (!req.user.school) {
      return res.status(403).json({
        success: false,
        message: 'No school associated with this account.',
      });
    }

    const classes = await Class.find({ school: req.user.school })
      .select('name classTeacherName subjectTeachers')
      .lean();

    res.status(200).json({
      success: true,
      classes: classes.map(c => ({
        _id             : c._id,
        name            : c.name,
        classTeacherName: c.classTeacherName || '',
        subjectTeachers : Object.fromEntries(
          Object.entries(c.subjectTeachers || {}).map(([k, v]) => [decodeKey(k), v])
        ),
      })),
    });

  } catch (error) {
    next(error);
  }
};

/* PUT /api/settings/class-teachers/:classId
   body: { classTeacherName?: string, subjectTeachers?: { "mathematics": "Name", … } }
   subjectTeachers REPLACES the saved list for that class (an empty name removes a teacher). */
exports.updateClassTeachers = async (req, res, next) => {
  try {
    if (!req.user.school) {
      return res.status(403).json({
        success: false,
        message: 'No school associated with this account.',
      });
    }

    const { classTeacherName, subjectTeachers } = req.body || {};
    const update = {};

    if (classTeacherName !== undefined) {
      update.classTeacherName = cleanText(classTeacherName);
    }

    if (subjectTeachers && typeof subjectTeachers === 'object' && !Array.isArray(subjectTeachers)) {
      const entries = Object.entries(subjectTeachers)
        .slice(0, MAX_SUBJECTS)
        .map(([k, v]) => [cleanText(k).toLowerCase().slice(0, 60), cleanText(v)])
        .filter(([k, v]) => k && v);

      update.subjectTeachers = Object.fromEntries(entries.map(([k, v]) => [encodeKey(k), v]));
    }

    if (!Object.keys(update).length) {
      return res.status(400).json({
        success: false,
        message: 'Nothing to save.',
      });
    }

    /* The class must belong to the user's own school */
    const cls = await Class.findOneAndUpdate(
      { _id: req.params.classId, school: req.user.school },
      { $set: update },
      { new: true, runValidators: true }
    ).select('_id').lean();

    if (!cls) {
      return res.status(404).json({
        success: false,
        message: 'Class not found.',
      });
    }

    res.status(200).json({
      success: true,
      message: 'Teacher names saved.',
    });

  } catch (error) {
    next(error);
  }
};