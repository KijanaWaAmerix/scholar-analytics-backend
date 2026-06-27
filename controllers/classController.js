/* ═══════════════════════════════════════════════════════════
   SCHOLAR ANALYTICS — Class Controller
   File: backend/controllers/classController.js
═══════════════════════════════════════════════════════════ */

const Class   = require('../models/Class');
const Student = require('../models/Student');
const Subject = require('../models/Subject');
const Exam    = require('../models/Exam');

/* ══════════════════════════════════════════════════════════
   @route   GET /api/classes
   @desc    Get all classes for this school
   @access  Admin, Teacher
══════════════════════════════════════════════════════════ */
const getAllClasses = async (req, res, next) => {
  try {
    const filter = { school: req.user.school };

    if (req.query.grade)       filter.grade    = Number(req.query.grade);
    if (req.query.academicYear)filter.academicYear = req.query.academicYear;
    if (req.query.active)      filter.isActive = req.query.active === 'true';

    const classes = await Class.find(filter)
      .populate('classTeacher', 'fullName email')
      .sort({ grade: 1, name: 1 })
      .lean();

    /* Add student count to each class */
    const classesWithCount = await Promise.all(
      classes.map(async (cls) => {
        const studentCount = await Student.countDocuments({
          class    : cls._id,
          school   : req.user.school,
          isActive : true,
        });
        return { ...cls, studentCount };
      })
    );

    res.status(200).json({
      success : true,
      count   : classes.length,
      classes : classesWithCount,
    });

  } catch (error) {
    next(error);
  }
};

/* ══════════════════════════════════════════════════════════
   @route   GET /api/classes/:id
   @desc    Get single class with full details
   @access  Admin, Teacher
══════════════════════════════════════════════════════════ */
const getClass = async (req, res, next) => {
  try {
    const cls = await Class.findOne({
      _id   : req.params.id,
      school: req.user.school,
    })
    .populate('classTeacher', 'fullName email phone')
    .lean();

    if (!cls) {
      return res.status(404).json({
        success : false,
        message : 'Class not found.',
      });
    }

    /* Get student count */
    const studentCount = await Student.countDocuments({
      class    : cls._id,
      school   : req.user.school,
      isActive : true,
    });

    /* Get subjects for this class */
    const subjects = await Subject.find({
      class    : cls._id,
      school   : req.user.school,
      isActive : true,
    })
    .populate('teacher', 'fullName')
    .lean();

    res.status(200).json({
      success  : true,
      class    : { ...cls, studentCount },
      subjects,
    });

  } catch (error) {
    next(error);
  }
};

/* ══════════════════════════════════════════════════════════
   @route   POST /api/classes
   @desc    Create a new class
   @access  Admin only
══════════════════════════════════════════════════════════ */
const createClass = async (req, res, next) => {
  try {
    const {
      name, grade, stream,
      classTeacher, academicYear, capacity,
    } = req.body;

    if (!name || !grade) {
      return res.status(400).json({
        success : false,
        message : 'Class name and grade are required.',
      });
    }

    if (![7, 8, 9].includes(Number(grade))) {
      return res.status(400).json({
        success : false,
        message : 'Grade must be 7, 8 or 9 for JSS CBC.',
      });
    }

    /* Check class name not already taken in this school + year */
    const existing = await Class.findOne({
      name        : name.trim(),
      school      : req.user.school,
      academicYear: academicYear || '2024',
    });

    if (existing) {
      return res.status(400).json({
        success : false,
        message : `Class "${name}" already exists for this academic year.`,
      });
    }

    const newClass = await Class.create({
      name        : name.trim(),
      grade       : Number(grade),
      stream      : stream       || null,
      school      : req.user.school,
      classTeacher: classTeacher || null,
      academicYear: academicYear || '2024',
      capacity    : capacity     || 45,
    });

    await newClass.populate('classTeacher', 'fullName email');

    res.status(201).json({
      success : true,
      message : `Class "${newClass.name}" created successfully.`,
      class   : newClass,
    });

  } catch (error) {
    next(error);
  }
};

/* ══════════════════════════════════════════════════════════
   @route   PUT /api/classes/:id
   @desc    Update a class
   @access  Admin only
══════════════════════════════════════════════════════════ */
const updateClass = async (req, res, next) => {
  try {
    const cls = await Class.findOne({
      _id   : req.params.id,
      school: req.user.school,
    });

    if (!cls) {
      return res.status(404).json({
        success : false,
        message : 'Class not found.',
      });
    }

    const allowed = [
      'name', 'stream', 'classTeacher',
      'capacity', 'isActive',
    ];

    allowed.forEach(field => {
      if (req.body[field] !== undefined) {
        cls[field] = req.body[field];
      }
    });

    await cls.save();
    await cls.populate('classTeacher', 'fullName email');

    res.status(200).json({
      success : true,
      message : `${cls.name} updated successfully.`,
      class   : cls,
    });

  } catch (error) {
    next(error);
  }
};

/* ══════════════════════════════════════════════════════════
   @route   DELETE /api/classes/:id
   @desc    Delete a class
           Only allowed if class has no students
   @access  Admin only
══════════════════════════════════════════════════════════ */
const deleteClass = async (req, res, next) => {
  try {
    const cls = await Class.findOne({
      _id   : req.params.id,
      school: req.user.school,
    });

    if (!cls) {
      return res.status(404).json({
        success : false,
        message : 'Class not found.',
      });
    }

    /* Check if class has students */
    const studentCount = await Student.countDocuments({
      class : req.params.id,
      school: req.user.school,
    });

    if (studentCount > 0) {
      return res.status(400).json({
        success : false,
        message : `Cannot delete "${cls.name}" — it has ${studentCount} learner(s). Move or delete learners first.`,
      });
    }

    /* Delete class subjects and exams too */
    await Promise.all([
      Subject.deleteMany({ class: req.params.id, school: req.user.school }),
      Exam.deleteMany({ class: req.params.id, school: req.user.school }),
    ]);

    await Class.deleteOne({ _id: req.params.id });

    res.status(200).json({
      success : true,
      message : `Class "${cls.name}" deleted successfully.`,
    });

  } catch (error) {
    next(error);
  }
};

/* ══════════════════════════════════════════════════════════
   @route   POST /api/classes/seed-defaults
   @desc    Create all 6 default JSS CBC classes at once
           Useful when setting up a new school
   @access  Admin only
══════════════════════════════════════════════════════════ */
const seedDefaultClasses = async (req, res, next) => {
  try {
    const academicYear = req.body.academicYear || '2024';

    const defaultClasses = [
      { name:'Grade 7 East', grade:7, stream:'East' },
      { name:'Grade 7 West', grade:7, stream:'West' },
      { name:'Grade 8 East', grade:8, stream:'East' },
      { name:'Grade 8 West', grade:8, stream:'West' },
      { name:'Grade 9 East', grade:9, stream:'East' },
      { name:'Grade 9 West', grade:9, stream:'West' },
    ];

    const created = [];
    const skipped = [];

    for (const cls of defaultClasses) {
      const existing = await Class.findOne({
        name        : cls.name,
        school      : req.user.school,
        academicYear,
      });

      if (existing) {
        skipped.push(cls.name);
        continue;
      }

      await Class.create({
        ...cls,
        school      : req.user.school,
        academicYear,
      });

      created.push(cls.name);
    }

    res.status(201).json({
      success : true,
      message : `${created.length} classes created, ${skipped.length} already existed.`,
      created,
      skipped,
    });

  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAllClasses,
  getClass,
  createClass,
  updateClass,
  deleteClass,
  seedDefaultClasses,
};