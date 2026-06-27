/* ═══════════════════════════════════════════════════════════
   SCHOLAR ANALYTICS — SuperAdmin Controller
   File: backend/controllers/superAdminController.js
═══════════════════════════════════════════════════════════ */

const School  = require('../models/School');
const User    = require('../models/User');
const Student = require('../models/Student');
const Mark    = require('../models/Mark');

/* ══════════════════════════════════════════════════════════
   DASHBOARD STATS
══════════════════════════════════════════════════════════ */
exports.getDashboard = async (req, res, next) => {
  try {

    const [
      totalSchools,
      activeSchools,
      lockedSchools,
      trialSchools,
      totalUsers,
      totalStudents,
      totalMarks,
      recentSchools,
    ] = await Promise.all([
      School.countDocuments({}),
      School.countDocuments({ status: 'active'   }),
      School.countDocuments({ status: 'locked'   }),
      School.countDocuments({ status: 'trial'    }),
      User.countDocuments({ role: { $ne: 'superadmin' } }),
      Student.countDocuments({}),
      Mark.countDocuments({}),
      School.find({})
        .sort({ createdAt: -1 })
        .limit(5)
        .lean(),
    ]);

    /* Schools expiring in next 30 days */
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    const expiringSoon = await School.countDocuments({
      status                  : 'active',
      'subscription.expiryDate': {
        $gte: new Date(),
        $lte: thirtyDaysFromNow,
      },
    });

    res.status(200).json({
      success: true,
      stats  : {
        totalSchools,
        activeSchools,
        lockedSchools,
        trialSchools,
        expiringSoon,
        totalUsers,
        totalStudents,
        totalMarks,
      },
      recentSchools,
    });

  } catch (error) {
    next(error);
  }
};

/* ══════════════════════════════════════════════════════════
   GET ALL SCHOOLS
══════════════════════════════════════════════════════════ */
exports.getSchools = async (req, res, next) => {
  try {
    const { search, status, page = 1, limit = 20 } = req.query;

    const filter = {};
    if (status && status !== 'all') filter.status = status;
    if (search) {
      filter.$or = [
        { schoolName: { $regex: search, $options: 'i' } },
        { schoolEmail:{ $regex: search, $options: 'i' } },
      ];
    }

    const total   = await School.countDocuments(filter);
    const schools = await School.find(filter)
      .sort({ createdAt: -1 })
      .skip((Number(page)-1) * Number(limit))
      .limit(Number(limit))
      .lean();

    /* Enrich with counts */
    const enriched = await Promise.all(
      schools.map(async (s) => {
        const [students, users, admins] = await Promise.all([
          Student.countDocuments({ school: s._id }),
          User.countDocuments({ school: s._id, role:'teacher' }),
          User.countDocuments({ school: s._id, role:'admin' }),
        ]);

        const daysLeft = s.subscription?.expiryDate
          ? Math.ceil(
              (new Date(s.subscription.expiryDate) - new Date()) /
              (1000 * 60 * 60 * 24)
            )
          : null;

        return { ...s, students, users, admins, daysLeft };
      })
    );

    res.status(200).json({
      success: true,
      schools : enriched,
      pagination: {
        total,
        page : Number(page),
        pages: Math.ceil(total / Number(limit)),
      },
    });

  } catch (error) {
    next(error);
  }
};

/* ══════════════════════════════════════════════════════════
   GET SINGLE SCHOOL
══════════════════════════════════════════════════════════ */
exports.getSchool = async (req, res, next) => {
  try {
    const school = await School.findById(req.params.id).lean();
    if (!school) {
      return res.status(404).json({ success:false, message:'School not found.' });
    }

    const [students, teachers, admin] = await Promise.all([
      Student.countDocuments({ school: school._id }),
      User.countDocuments({ school: school._id, role:'teacher' }),
      User.findOne({ school: school._id, role:'admin' })
        .select('fullName email lastLogin'),
    ]);

    res.status(200).json({
      success: true,
      school : { ...school, students, teachers, admin },
    });
  } catch (error) {
    next(error);
  }
};

/* ══════════════════════════════════════════════════════════
   CREATE SCHOOL
══════════════════════════════════════════════════════════ */
exports.createSchool = async (req, res, next) => {
  try {
    const {
      schoolName, schoolMotto, schoolEmail,
      adminName, adminEmail,
      plan, expiryDate,
    } = req.body;

    if (!schoolName || !adminEmail || !adminName) {
      return res.status(400).json({
        success: false,
        message: 'School name, admin name and admin email are required.',
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

    /* Create school */
    const school = await School.create({
      schoolName,
      schoolMotto : schoolMotto || 'Excellence Through Knowledge',
      schoolEmail : schoolEmail || adminEmail,
      status      : 'active',
      subscription: {
        plan      : plan || 'standard',
        expiryDate: expiryDate || new Date(Date.now() + 365*24*60*60*1000),
        autoLock  : false,
      },
    });

    /* Create admin account */
    const tempPassword = `Scholar${Math.floor(1000+Math.random()*9000)}`;

    const admin = await User.create({
      fullName      : adminName,
      email         : adminEmail,
      password      : tempPassword,
      role          : 'admin',
      school        : school._id,
      isActive      : true,
      isAccountSetup: true,
    });

    res.status(201).json({
      success     : true,
      message     : `School "${schoolName}" created successfully.`,
      school,
      admin       : { email: adminEmail, tempPassword },
    });

  } catch (error) {
    next(error);
  }
};

/* ══════════════════════════════════════════════════════════
   LOCK SCHOOL
══════════════════════════════════════════════════════════ */
exports.lockSchool = async (req, res, next) => {
  try {
    const { reason } = req.body;

    const school = await School.findByIdAndUpdate(
      req.params.id,
      {
        status      : 'locked',
        lockedAt    : new Date(),
        lockedReason: reason || 'Locked by SuperAdmin',
      },
      { new: true }
    );

    if (!school) {
      return res.status(404).json({ success:false, message:'School not found.' });
    }

    res.status(200).json({
      success: true,
      message: `${school.schoolName} has been locked.`,
      school,
    });
  } catch (error) {
    next(error);
  }
};

/* ══════════════════════════════════════════════════════════
   UNLOCK SCHOOL
══════════════════════════════════════════════════════════ */
exports.unlockSchool = async (req, res, next) => {
  try {
    const school = await School.findByIdAndUpdate(
      req.params.id,
      {
        status      : 'active',
        lockedAt    : null,
        lockedReason: null,
      },
      { new: true }
    );

    if (!school) {
      return res.status(404).json({ success:false, message:'School not found.' });
    }

    res.status(200).json({
      success: true,
      message: `${school.schoolName} has been unlocked.`,
      school,
    });
  } catch (error) {
    next(error);
  }
};

/* ══════════════════════════════════════════════════════════
   EXTEND SUBSCRIPTION
══════════════════════════════════════════════════════════ */
exports.extendSubscription = async (req, res, next) => {
  try {
    const { months, plan } = req.body;
    const school           = await School.findById(req.params.id);

    if (!school) {
      return res.status(404).json({ success:false, message:'School not found.' });
    }

    /* Extend from today or from current expiry — whichever is later */
    const base = school.subscription?.expiryDate > new Date()
      ? new Date(school.subscription.expiryDate)
      : new Date();

    base.setMonth(base.getMonth() + Number(months || 12));

    school.subscription.expiryDate = base;
    school.subscription.autoLock   = false;
    if (plan) school.subscription.plan = plan;

    /* Auto unlock if was locked */
    if (school.status === 'locked' &&
        school.lockedReason?.includes('expired')) {
      school.status       = 'active';
      school.lockedAt     = null;
      school.lockedReason = null;
    }

    await school.save();

    res.status(200).json({
      success   : true,
      message   : `Subscription extended to ${base.toDateString()}.`,
      school,
    });
  } catch (error) {
    next(error);
  }
};

/* ══════════════════════════════════════════════════════════
   UPDATE SCHOOL
══════════════════════════════════════════════════════════ */
exports.updateSchool = async (req, res, next) => {
  try {
    const { schoolName, schoolMotto, schoolEmail, status } = req.body;

    const school = await School.findByIdAndUpdate(
      req.params.id,
      { schoolName, schoolMotto, schoolEmail, status },
      { new:true, runValidators:true }
    );

    if (!school) {
      return res.status(404).json({ success:false, message:'School not found.' });
    }

    res.status(200).json({ success:true, school });
  } catch (error) {
    next(error);
  }
};

/* ══════════════════════════════════════════════════════════
   RESET SCHOOL ADMIN PASSWORD
══════════════════════════════════════════════════════════ */
exports.resetAdminPassword = async (req, res, next) => {
  try {
    const admin = await User.findOne({
      school: req.params.id,
      role  : 'admin',
    });

    if (!admin) {
      return res.status(404).json({ success:false, message:'Admin not found.' });
    }

    const newPassword   = `Reset${Math.floor(1000+Math.random()*9000)}`;
    admin.password      = newPassword;
    admin.isAccountSetup= true;
    await admin.save();

    res.status(200).json({
      success    : true,
      message    : 'Admin password reset.',
      newPassword,
      adminEmail : admin.email,
    });
  } catch (error) {
    next(error);
  }
};

/* ══════════════════════════════════════════════════════════
   GET ALL USERS (across all schools)
══════════════════════════════════════════════════════════ */
exports.getAllUsers = async (req, res, next) => {
  try {
    const { search, role, school, page=1, limit=30 } = req.query;

    const filter = { role: { $ne:'superadmin' } };
    if (role   && role   !== 'all') filter.role   = role;
    if (school && school !== 'all') filter.school = school;
    if (search) {
      filter.$or = [
        { fullName: { $regex:search, $options:'i' } },
        { email   : { $regex:search, $options:'i' } },
      ];
    }

    const total = await User.countDocuments(filter);
    const users = await User.find(filter)
      .populate('school','schoolName')
      .sort({ createdAt:-1 })
      .skip((Number(page)-1)*Number(limit))
      .limit(Number(limit))
      .select('-password -resetPasswordToken -accountSetupToken')
      .lean();

    res.status(200).json({
      success: true,
      users,
      pagination: { total, page:Number(page), pages:Math.ceil(total/Number(limit)) },
    });
  } catch (error) {
    next(error);
  }
};

/* ══════════════════════════════════════════════════════════
   TOGGLE USER ACTIVE
══════════════════════════════════════════════════════════ */
exports.toggleUser = async (req, res, next) => {
  try {
    const user = await User.findOne({
      _id : req.params.id,
      role: { $ne:'superadmin' },
    });

    if (!user) {
      return res.status(404).json({ success:false, message:'User not found.' });
    }

    user.isActive = !user.isActive;
    await user.save({ validateBeforeSave:false });

    res.status(200).json({
      success  : true,
      isActive : user.isActive,
      message  : `User ${user.isActive ? 'activated' : 'deactivated'}.`,
    });
  } catch (error) {
    next(error);
  }
};

/* ══════════════════════════════════════════════════════════
   AUTO LOCK EXPIRED SCHOOLS
══════════════════════════════════════════════════════════ */
exports.autoLockExpired = async (req, res, next) => {
  try {
    const result = await School.updateMany(
      {
        status                  : 'active',
        'subscription.autoLock' : true,
        'subscription.expiryDate': { $lt: new Date() },
      },
      {
        $set: {
          status      : 'locked',
          lockedAt    : new Date(),
          lockedReason: 'Subscription expired — auto locked',
        },
      }
    );

    res.status(200).json({
      success: true,
      message: `${result.modifiedCount} school(s) auto-locked.`,
      count  : result.modifiedCount,
    });
  } catch (error) {
    next(error);
  }
};