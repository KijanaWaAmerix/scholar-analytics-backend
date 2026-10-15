/* ═══════════════════════════════════════════════════════════
   SCHOLAR ANALYTICS — Class Controller
   File: backend/controllers/classController.js
   Change: seedDefaultClasses removed
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
      grade, stream,
      classTeacher, academicYear, capacity,
    } = req.body;

    if (!grade) {
      return res.status(400).json({
        success : false,
        message : 'Grade is required.',
      });
    }

    if (!Number.isInteger(Number(grade)) || Number(grade) < 1 || Number(grade) > 12) {
      return res.status(400).json({
        success : false,
        message : 'Grade must be a whole number from 1 to 12.',
      });
    }

    /* The class name is made from the grade and the stream, e.g. "Grade 8 Alpha".
       (A name can still be sent explicitly.) */
    const streamText = String(stream || '').trim();
    const name = String(req.body.name || '').trim() ||
      `Grade ${Number(grade)}${streamText ? ' ' + streamText : ''}`;

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
      stream      : streamText   || null,
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

    /* the grade can be changed too (e.g. a class typed wrongly) */
    if (req.body.grade !== undefined) {
      const g = Number(req.body.grade);
      if (!Number.isInteger(g) || g < 1 || g > 12) {
        return res.status(400).json({ success: false, message: 'Grade must be a whole number from 1 to 12.' });
      }
      cls.grade = g;
    }

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

module.exports = {
  getAllClasses,
  getClass,
  createClass,
  updateClass,
  deleteClass,
};