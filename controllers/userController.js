/* ═══════════════════════════════════════════════════════════
   SCHOLAR ANALYTICS — School User Management (Admin)
   File: backend/controllers/userController.js

   Lets a SCHOOL ADMIN manage the teachers of THEIR OWN school:
     list users · create teacher (admin sets the password)
     edit teacher · activate / deactivate · reset password

   Safety rules enforced here:
     • Every query is scoped to req.user.school — an admin can never
       see or change another school's users.
     • Only role 'teacher' accounts can be changed. Admins and the
       SuperAdmin are never touched by these endpoints.
     • The role and school of a new account are set by the server,
       never taken from the request body.
═══════════════════════════════════════════════════════════ */

const crypto = require('crypto');
const User   = require('../models/User');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 8;

/* Fields that are safe to send back to the browser */
const PUBLIC_FIELDS =
  'fullName email phone role isActive isAccountSetup lastLogin createdAt';

/* Random, easy-to-read password (no 0/O, 1/l/I) with upper, lower, digit */
const generatePassword = (length = 10) => {
  const upper  = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower  = 'abcdefghijkmnpqrstuvwxyz';
  const digits = '23456789';
  const all    = upper + lower + digits;
  const pick   = (set) => set[crypto.randomInt(set.length)];

  const chars = [pick(upper), pick(lower), pick(digits)];
  while (chars.length < length) chars.push(pick(all));

  for (let i = chars.length - 1; i > 0; i--) {          // shuffle
    const j = crypto.randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
};

const schoolOnly = (req, res) => {
  if (!req.user?.school) {
    res.status(403).json({
      success: false,
      message: 'No school is linked to this account.',
    });
    return false;
  }
  return true;
};

/* Find a TEACHER that belongs to the admin's school, or answer 404 */
const findOwnTeacher = async (req, res) => {
  const teacher = await User.findOne({
    _id   : req.params.id,
    school: req.user.school,
    role  : 'teacher',
  });

  if (!teacher) {
    res.status(404).json({
      success: false,
      message: 'Teacher not found in your school.',
    });
    return null;
  }
  return teacher;
};

const publicUser = (u) => ({
  _id           : u._id,
  fullName      : u.fullName,
  email         : u.email,
  phone         : u.phone || '',
  role          : u.role,
  isActive      : u.isActive,
  isAccountSetup: u.isAccountSetup,
  lastLogin     : u.lastLogin || null,
  createdAt     : u.createdAt,
});

/* ══════════════════════════════════════════════════════════
   1. LIST  — GET /api/users
══════════════════════════════════════════════════════════ */
exports.getSchoolUsers = async (req, res, next) => {
  try {
    if (!schoolOnly(req, res)) return;

    const users = await User.find({
      school: req.user.school,
      role  : { $in: ['admin', 'teacher'] },
    })
      .select(PUBLIC_FIELDS)
      .sort({ role: 1, fullName: 1 })
      .lean();

    res.status(200).json({ success: true, count: users.length, users });
  } catch (error) {
    next(error);
  }
};

/* ══════════════════════════════════════════════════════════
   2. CREATE TEACHER  — POST /api/users/teachers
   Body: { fullName, email, phone?, password? }
   If no password is sent, a strong one is generated.
   The plain password is returned ONCE so the admin can hand it over.
══════════════════════════════════════════════════════════ */
exports.createTeacher = async (req, res, next) => {
  try {
    if (!schoolOnly(req, res)) return;

    const fullName = String(req.body.fullName || '').trim();
    const email    = String(req.body.email    || '').toLowerCase().trim();
    const phone    = String(req.body.phone    || '').trim();
    let   password = String(req.body.password || '');

    if (!fullName || !email) {
      return res.status(400).json({
        success: false,
        message: 'Teacher name and email are required.',
      });
    }
    if (!EMAIL_RE.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid email address.',
      });
    }

    const generated = !password;
    if (generated) password = generatePassword();

    if (password.length < MIN_PASSWORD) {
      return res.status(400).json({
        success: false,
        message: `Password must be at least ${MIN_PASSWORD} characters.`,
      });
    }

    if (await User.findOne({ email })) {
      return res.status(400).json({
        success: false,
        message: 'That email address is already registered.',
      });
    }

    /* The model's pre-save hook hashes the password */
    const teacher = await User.create({
      fullName,
      email,
      phone,
      password,
      role          : 'teacher',
      school        : req.user.school,
      isActive      : true,
      isAccountSetup: true,       // can sign in straight away
    });

    res.status(201).json({
      success    : true,
      message    : `Teacher account created for ${fullName}.`,
      user       : publicUser(teacher),
      credentials: { email, password, generated },
    });
  } catch (error) {
    next(error);
  }
};

/* ══════════════════════════════════════════════════════════
   3. EDIT TEACHER  — PUT /api/users/:id
   Body: { fullName?, email?, phone? }
══════════════════════════════════════════════════════════ */
exports.updateTeacher = async (req, res, next) => {
  try {
    if (!schoolOnly(req, res)) return;

    const teacher = await findOwnTeacher(req, res);
    if (!teacher) return;

    if (req.body.fullName !== undefined) {
      const fullName = String(req.body.fullName).trim();
      if (!fullName) {
        return res.status(400).json({
          success: false,
          message: 'Teacher name cannot be empty.',
        });
      }
      teacher.fullName = fullName;
    }

    if (req.body.email !== undefined) {
      const email = String(req.body.email).toLowerCase().trim();
      if (!EMAIL_RE.test(email)) {
        return res.status(400).json({
          success: false,
          message: 'Please enter a valid email address.',
        });
      }
      if (email !== teacher.email) {
        const taken = await User.findOne({ email, _id: { $ne: teacher._id } });
        if (taken) {
          return res.status(400).json({
            success: false,
            message: 'That email address is already registered.',
          });
        }
        teacher.email = email;
      }
    }

    if (req.body.phone !== undefined) {
      teacher.phone = String(req.body.phone).trim();
    }

    await teacher.save();

    res.status(200).json({
      success: true,
      message: 'Teacher details updated.',
      user   : publicUser(teacher),
    });
  } catch (error) {
    next(error);
  }
};

/* ══════════════════════════════════════════════════════════
   4. ACTIVATE / DEACTIVATE  — PATCH /api/users/:id/toggle
   A deactivated teacher cannot sign in. Their marks, subjects and
   history stay intact, so nothing breaks.
══════════════════════════════════════════════════════════ */
exports.toggleTeacher = async (req, res, next) => {
  try {
    if (!schoolOnly(req, res)) return;

    const teacher = await findOwnTeacher(req, res);
    if (!teacher) return;

    teacher.isActive = !teacher.isActive;
    await teacher.save();

    res.status(200).json({
      success: true,
      message: teacher.isActive
        ? `${teacher.fullName} has been activated.`
        : `${teacher.fullName} has been deactivated.`,
      user   : publicUser(teacher),
    });
  } catch (error) {
    next(error);
  }
};

/* ══════════════════════════════════════════════════════════
   5. RESET PASSWORD  — POST /api/users/:id/reset-password
   Body: { password? }   (blank = generate a strong one)
   Passwords are stored hashed, so they can never be "viewed" again —
   the admin sets a new one instead.
══════════════════════════════════════════════════════════ */
exports.resetTeacherPassword = async (req, res, next) => {
  try {
    if (!schoolOnly(req, res)) return;

    const teacher = await findOwnTeacher(req, res);
    if (!teacher) return;

    let password = String(req.body.password || '');
    const generated = !password;
    if (generated) password = generatePassword();

    if (password.length < MIN_PASSWORD) {
      return res.status(400).json({
        success: false,
        message: `Password must be at least ${MIN_PASSWORD} characters.`,
      });
    }

    teacher.password       = password;     // hashed by the pre-save hook
    teacher.isAccountSetup = true;
    await teacher.save();

    res.status(200).json({
      success    : true,
      message    : `Password reset for ${teacher.fullName}.`,
      credentials: { email: teacher.email, password, generated },
    });
  } catch (error) {
    next(error);
  }
};