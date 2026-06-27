/* ═══════════════════════════════════════════════════════════
   SCHOLAR ANALYTICS — Exam Controller
   File: backend/controllers/examController.js
═══════════════════════════════════════════════════════════ */

const Exam    = require('../models/Exam');
const Class   = require('../models/Class');
const Mark    = require('../models/Mark');

/* ══════════════════════════════════════════════════════════
   @route   GET /api/exams
   @desc    Get all exams — filterable by class, term, year
   @access  Admin, Teacher
══════════════════════════════════════════════════════════ */
const getAllExams = async (req, res, next) => {
  try {
    const filter = { school: req.user.school };

    if (req.query.class)       filter.class        = req.query.class;
    if (req.query.term)        filter.term         = Number(req.query.term);
    if (req.query.academicYear)filter.academicYear  = req.query.academicYear;
    if (req.query.name)        filter.name         = req.query.name;
    if (req.query.isOpen)      filter.isOpen       = req.query.isOpen === 'true';
    if (req.query.isPublished) filter.isPublished  = req.query.isPublished === 'true';

    const exams = await Exam.find(filter)
      .populate('class',     'name grade')
      .populate('createdBy', 'fullName')
      .sort({ academicYear: -1, term: 1, name: 1 })
      .lean();

    /* Add marks count to each exam */
    const examsWithCount = await Promise.all(
      exams.map(async (exam) => {
        const markCount = await Mark.countDocuments({
          exam  : exam._id,
          school: req.user.school,
        });
        return { ...exam, markCount };
      })
    );

    res.status(200).json({
      success : true,
      count   : exams.length,
      exams   : examsWithCount,
    });

  } catch (error) {
    next(error);
  }
};

/* ══════════════════════════════════════════════════════════
   @route   GET /api/exams/:id
   @desc    Get single exam
   @access  Admin, Teacher
══════════════════════════════════════════════════════════ */
const getExam = async (req, res, next) => {
  try {
    const exam = await Exam.findOne({
      _id   : req.params.id,
      school: req.user.school,
    })
    .populate('class',     'name grade stream')
    .populate('createdBy', 'fullName')
    .lean();

    if (!exam) {
      return res.status(404).json({
        success : false,
        message : 'Exam not found.',
      });
    }

    /* Get marks progress */
    const markCount = await Mark.countDocuments({
      exam  : exam._id,
      school: req.user.school,
    });

    res.status(200).json({
      success : true,
      exam    : { ...exam, markCount },
    });

  } catch (error) {
    next(error);
  }
};

/* ══════════════════════════════════════════════════════════
   @route   POST /api/exams
   @desc    Create a new exam
   @access  Admin only
══════════════════════════════════════════════════════════ */
const createExam = async (req, res, next) => {
  try {
    const {
      name, term, academicYear,
      classId, startDate, endDate,
    } = req.body;

    if (!name || !term || !classId) {
      return res.status(400).json({
        success : false,
        message : 'name, term and classId are required.',
      });
    }

    /* Verify class */
    const classDoc = await Class.findOne({
      _id   : classId,
      school: req.user.school,
    });

    if (!classDoc) {
      return res.status(404).json({
        success : false,
        message : 'Class not found.',
      });
    }

    /* Check not duplicate */
    const existing = await Exam.findOne({
      name        : name,
      term        : Number(term),
      academicYear: academicYear || '2024',
      class       : classId,
      school      : req.user.school,
    });

    if (existing) {
      return res.status(400).json({
        success : false,
        message : `${name} for Term ${term} already exists in ${classDoc.name}.`,
      });
    }

    const exam = await Exam.create({
      name,
      term        : Number(term),
      academicYear: academicYear || '2024',
      class       : classId,
      school      : req.user.school,
      startDate   : startDate || null,
      endDate     : endDate   || null,
      isOpen      : true,
      isPublished : false,
      createdBy   : req.user._id,
    });

    await exam.populate('class', 'name grade');

    res.status(201).json({
      success : true,
      message : `${exam.name} (Term ${exam.term}) created for ${classDoc.name}.`,
      exam,
    });

  } catch (error) {
    next(error);
  }
};

/* ══════════════════════════════════════════════════════════
   @route   PUT /api/exams/:id
   @desc    Update an exam
   @access  Admin only
══════════════════════════════════════════════════════════ */
const updateExam = async (req, res, next) => {
  try {
    const exam = await Exam.findOne({
      _id   : req.params.id,
      school: req.user.school,
    });

    if (!exam) {
      return res.status(404).json({
        success : false,
        message : 'Exam not found.',
      });
    }

    const allowed = [
      'startDate', 'endDate',
      'isOpen', 'isPublished',
    ];

    allowed.forEach(field => {
      if (req.body[field] !== undefined) {
        exam[field] = req.body[field];
      }
    });

    await exam.save();
    await exam.populate('class', 'name grade');

    res.status(200).json({
      success : true,
      message : `${exam.name} updated successfully.`,
      exam,
    });

  } catch (error) {
    next(error);
  }
};

/* ══════════════════════════════════════════════════════════
   @route   DELETE /api/exams/:id
   @desc    Delete exam — only if no marks exist
   @access  Admin only
══════════════════════════════════════════════════════════ */
const deleteExam = async (req, res, next) => {
  try {
    const exam = await Exam.findOne({
      _id   : req.params.id,
      school: req.user.school,
    });

    if (!exam) {
      return res.status(404).json({
        success : false,
        message : 'Exam not found.',
      });
    }

    /* Check no marks exist */
    const markCount = await Mark.countDocuments({
      exam  : req.params.id,
      school: req.user.school,
    });

    if (markCount > 0) {
      return res.status(400).json({
        success : false,
        message : `Cannot delete "${exam.name}" — ${markCount} mark record(s) exist. Delete marks first.`,
      });
    }

    await Exam.deleteOne({ _id: req.params.id });

    res.status(200).json({
      success : true,
      message : `${exam.name} deleted successfully.`,
    });

  } catch (error) {
    next(error);
  }
};

/* ══════════════════════════════════════════════════════════
   @route   POST /api/exams/seed-defaults
   @desc    Create all 3 exams for a class
           (Opener, Midterm, Endterm) for one term
   @body    { classId, term, academicYear }
   @access  Admin only
══════════════════════════════════════════════════════════ */
const seedDefaultExams = async (req, res, next) => {
  try {
    const { classId, term, academicYear } = req.body;

    if (!classId || !term) {
      return res.status(400).json({
        success : false,
        message : 'classId and term are required.',
      });
    }

    const classDoc = await Class.findOne({
      _id   : classId,
      school: req.user.school,
    });

    if (!classDoc) {
      return res.status(404).json({
        success : false,
        message : 'Class not found.',
      });
    }

    const examNames = ['Opener', 'Midterm', 'Endterm'];
    const created   = [];
    const skipped   = [];

    for (const name of examNames) {
      const existing = await Exam.findOne({
        name,
        term        : Number(term),
        academicYear: academicYear || '2024',
        class       : classId,
        school      : req.user.school,
      });

      if (existing) { skipped.push(name); continue; }

      await Exam.create({
        name,
        term        : Number(term),
        academicYear: academicYear || '2024',
        class       : classId,
        school      : req.user.school,
        isOpen      : true,
        isPublished : false,
        createdBy   : req.user._id,
      });

      created.push(name);
    }

    res.status(201).json({
      success : true,
      message : `${created.length} exams created for ${classDoc.name} Term ${term}.`,
      created,
      skipped,
    });

  } catch (error) {
    next(error);
  }
};

/* ══════════════════════════════════════════════════════════
   @route   POST /api/exams/seed-all
   @desc    Create all 9 exams (3 terms × 3 exams)
           for ALL classes — full school setup
   @access  Admin only
══════════════════════════════════════════════════════════ */
const seedAllExams = async (req, res, next) => {
  try {
    const academicYear = req.body.academicYear || '2024';

    const classes = await Class.find({
      school  : req.user.school,
      isActive: true,
    }).lean();

    if (!classes.length) {
      return res.status(400).json({
        success : false,
        message : 'No classes found. Create classes first.',
      });
    }

    const examNames = ['Opener', 'Midterm', 'Endterm'];
    const terms     = [1, 2, 3];

    let totalCreated = 0;
    let totalSkipped = 0;

    for (const cls of classes) {
      for (const term of terms) {
        for (const name of examNames) {
          const existing = await Exam.findOne({
            name,
            term,
            academicYear,
            class : cls._id,
            school: req.user.school,
          });

          if (existing) { totalSkipped++; continue; }

          await Exam.create({
            name,
            term,
            academicYear,
            class    : cls._id,
            school   : req.user.school,
            isOpen   : true,
            createdBy: req.user._id,
          });

          totalCreated++;
        }
      }
    }

    res.status(201).json({
      success : true,
      message : `School setup complete. ${totalCreated} exams created across ${classes.length} classes.`,
      totalCreated,
      totalSkipped,
    });

  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAllExams,
  getExam,
  createExam,
  updateExam,
  deleteExam,
  seedDefaultExams,
  seedAllExams,
};