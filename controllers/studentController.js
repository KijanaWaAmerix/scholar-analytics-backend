/* ═══════════════════════════════════════════════════════════
   SCHOLAR ANALYTICS — Student Controller
   File: backend/controllers/studentController.js
═══════════════════════════════════════════════════════════ */

const Student = require('../models/Student');
const Class   = require('../models/Class');

/* ── GET all students ─────────────────────────────────────── */
exports.getStudents = async (req, res, next) => {
  try {
    const { search, class: classId, gender, status, page = 1, limit = 50 } = req.query;

    const filter = { school: req.user.school };

    if (classId && classId !== 'all') filter.class = classId;
    if (gender  && gender  !== 'all') filter.gender = gender;
    if (status  && status  !== 'all') {
      filter.isActive = status === 'active';
    }

    if (search) {
      filter.$or = [
        { fullName    : { $regex: search, $options: 'i' } },
        { upiNumber   : { $regex: search, $options: 'i' } },
        { assessmentNo: { $regex: search, $options: 'i' } },
      ];
    }

    const skip  = (Number(page) - 1) * Number(limit);
    const total = await Student.countDocuments(filter);

    const students = await Student.find(filter)
      .populate('class', 'name grade')
      .sort({ fullName: 1 })
      .skip(skip)
      .limit(Number(limit))
      .lean();

    /* Stats */
    const allStudents = await Student.find({ school: req.user.school });
    const stats = {
      total   : allStudents.length,
      male    : allStudents.filter(s => s.gender === 'male').length,
      female  : allStudents.filter(s => s.gender === 'female').length,
      active  : allStudents.filter(s => s.isActive).length,
      inactive: allStudents.filter(s => !s.isActive).length,
    };

    res.status(200).json({
      success : true,
      students,
      stats,
      pagination: {
        total,
        page    : Number(page),
        limit   : Number(limit),
        pages   : Math.ceil(total / Number(limit)),
      },
    });

  } catch (error) {
    next(error);
  }
};

/* ── GET single student ───────────────────────────────────── */
exports.getStudent = async (req, res, next) => {
  try {
    const student = await Student.findOne({
      _id   : req.params.id,
      school: req.user.school,
    }).populate('class', 'name grade');

    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found.' });
    }

    res.status(200).json({ success: true, student });
  } catch (error) {
    next(error);
  }
};

/* ── CREATE student ───────────────────────────────────────── */
exports.createStudent = async (req, res, next) => {
  try {
    const {
      fullName, gender, dateOfBirth,
      upiNumber, assessmentNo,
      classId, parentName, parentContact,
    } = req.body;

    if (!fullName || !gender || !classId) {
      return res.status(400).json({
        success: false,
        message: 'Full name, gender and class are required.',
      });
    }

    /* Check class belongs to this school */
    const cls = await Class.findOne({
      _id   : classId,
      school: req.user.school,
    });

    if (!cls) {
      return res.status(404).json({ success: false, message: 'Class not found.' });
    }

    /* Check UPI uniqueness */
    if (upiNumber) {
      const existing = await Student.findOne({ upiNumber, school: req.user.school });
      if (existing) {
        return res.status(400).json({
          success: false,
          message: `UPI number ${upiNumber} already exists.`,
        });
      }
    }

    const student = await Student.create({
      fullName,
      gender,
      dateOfBirth,
      upiNumber,
      assessmentNo,
      class        : classId,
      school       : req.user.school,
      parentName,
      parentContact,
      isActive     : true,
    });

    await student.populate('class', 'name grade');

    res.status(201).json({ success: true, student });

  } catch (error) {
    next(error);
  }
};

/* ── UPDATE student ───────────────────────────────────────── */
exports.updateStudent = async (req, res, next) => {
  try {
    const {
      fullName, gender, dateOfBirth,
      upiNumber, assessmentNo,
      classId, parentName, parentContact, isActive,
    } = req.body;

    const student = await Student.findOne({
      _id   : req.params.id,
      school: req.user.school,
    });

    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found.' });
    }

    /* Check UPI uniqueness if changed */
    if (upiNumber && upiNumber !== student.upiNumber) {
      const existing = await Student.findOne({
        upiNumber,
        school: req.user.school,
        _id   : { $ne: student._id },
      });
      if (existing) {
        return res.status(400).json({
          success: false,
          message: `UPI number ${upiNumber} already exists.`,
        });
      }
    }

    if (fullName)     student.fullName     = fullName;
    if (gender)       student.gender       = gender;
    if (dateOfBirth)  student.dateOfBirth  = dateOfBirth;
    if (upiNumber)    student.upiNumber    = upiNumber;
    if (assessmentNo) student.assessmentNo = assessmentNo;
    if (classId)      student.class        = classId;
    if (parentName)   student.parentName   = parentName;
    if (parentContact)student.parentContact= parentContact;
    if (isActive !== undefined) student.isActive = isActive;

    await student.save();
    await student.populate('class', 'name grade');

    res.status(200).json({ success: true, student });

  } catch (error) {
    next(error);
  }
};

/* ── DELETE student ───────────────────────────────────────── */
exports.deleteStudent = async (req, res, next) => {
  try {
    const student = await Student.findOneAndDelete({
      _id   : req.params.id,
      school: req.user.school,
    });

    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found.' });
    }

    res.status(200).json({ success: true, message: 'Student deleted successfully.' });
  } catch (error) {
    next(error);
  }
};

/* ── BULK IMPORT ──────────────────────────────────────────── */
exports.bulkImport = async (req, res, next) => {
  try {
    const { students, classId } = req.body;

    if (!students?.length || !classId) {
      return res.status(400).json({
        success: false,
        message: 'Students array and classId are required.',
      });
    }

    const cls = await Class.findOne({ _id: classId, school: req.user.school });
    if (!cls) {
      return res.status(404).json({ success: false, message: 'Class not found.' });
    }

    const results = { created: 0, skipped: 0, errors: [] };

    for (const row of students) {
      try {
        /* Skip if UPI already exists */
        if (row.upiNumber) {
          const exists = await Student.findOne({
            upiNumber: row.upiNumber,
            school   : req.user.school,
          });
          if (exists) { results.skipped++; continue; }
        }

        await Student.create({
          fullName    : row.fullName     || row['Full Name']      || '',
          gender      : (row.gender      || row['Gender']         || 'male').toLowerCase(),
          dateOfBirth : row.dateOfBirth  || row['Date of Birth']  || null,
          upiNumber   : row.upiNumber    || row['UPI Number']     || null,
          assessmentNo: row.assessmentNo || row['Assessment No']  || null,
          parentName  : row.parentName   || row['Parent Name']    || null,
          parentContact:row.parentContact|| row['Parent Contact'] || null,
          class       : classId,
          school      : req.user.school,
          isActive    : true,
        });

        results.created++;
      } catch (err) {
        results.errors.push({ row: row.fullName, error: err.message });
      }
    }

    res.status(200).json({
      success: true,
      message: `${results.created} students imported, ${results.skipped} skipped.`,
      results,
    });

  } catch (error) {
    next(error);
  }
};

/* ── STATS ────────────────────────────────────────────────── */
exports.getStats = async (req, res, next) => {
  try {
    const school = req.user.school;

    const [total, male, female, active] = await Promise.all([
      Student.countDocuments({ school }),
      Student.countDocuments({ school, gender: 'male'  }),
      Student.countDocuments({ school, gender: 'female'}),
      Student.countDocuments({ school, isActive: true  }),
    ]);

    res.status(200).json({
      success: true,
      stats  : { total, male, female, active, inactive: total - active },
    });
  } catch (error) {
    next(error);
  }
};