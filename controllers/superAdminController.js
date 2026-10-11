/* ══════════════════════════════════════════════════════════
   CREATE SCHOOL  — drop-in replacement for exports.createSchool
   in backend/controllers/superAdminController.js

   Fixes:
   1. The School document was never created, so `school._id` threw a
      ReferenceError and NO admin user was saved (hence "invalid" on login).
   2. The admin user was being created twice (second create = duplicate email).
   3. Email is now trimmed + lowercased before the duplicate check and save,
      matching what the login does.
══════════════════════════════════════════════════════════ */
exports.createSchool = async (req, res, next) => {
  let school = null;
  try {
    const {
      schoolName, schoolMotto, schoolEmail,
      adminName, adminPassword,
      plan, expiryDate,
    } = req.body;

    const adminEmail = (req.body.adminEmail || '').toLowerCase().trim();

    if (!schoolName || !adminEmail || !adminName || !adminPassword) {
      return res.status(400).json({
        success: false,
        message: 'School name, admin name, admin email and admin password are required.',
      });
    }

    if (adminPassword.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'Admin password must be at least 8 characters.',
      });
    }

    /* Check email taken */
    const existing = await User.findOne({ email: adminEmail });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: `Email ${adminEmail} is already registered.`,
      });
    }

    /* 1. Create the school */
    school = await School.create({
      schoolName,
      schoolMotto,
      schoolEmail,
      status      : 'active',
      subscription: {
        plan      : plan || 'standard',
        expiryDate: expiryDate ? new Date(expiryDate) : undefined,
      },
    });

    /* 2. Create the admin ONCE (pre-save hook hashes the password) */
    await User.create({
      fullName      : adminName,
      email         : adminEmail,
      password      : adminPassword,
      role          : 'admin',
      school        : school._id,
      isActive      : true,
      isAccountSetup: true,
    });

    res.status(201).json({
      success: true,
      message: `School "${schoolName}" created successfully.`,
      school,
      admin  : { email: adminEmail },
    });

  } catch (error) {
    /* Don't leave a school behind with no admin */
    if (school) await School.findByIdAndDelete(school._id).catch(() => {});
    next(error);
  }
};