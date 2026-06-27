/* ═══════════════════════════════════════════════════════════
   SCHOLAR ANALYTICS — Subject Controller
   File: backend/controllers/subjectController.js
═══════════════════════════════════════════════════════════ */

const Subject = require('../models/Subject');
const Class   = require('../models/Class');
const Mark    = require('../models/Mark');

/* 9 Default CBC JSS Learning Areas */
const CBC_SUBJECTS = [
  { code:'ENG',   name:'English',                learningArea:'Languages'      },
  { code:'KIS',   name:'Kiswahili',              learningArea:'Languages'      },
  { code:'MATH',  name:'Mathematics',            learningArea:'Mathematics'    },
  { code:'INTER', name:'Integrated Science',     learningArea:'Sciences'       },
  { code:'SST',   name:'Social Studies',         learningArea:'Humanities'     },
  { code:'CRE',   name:'Religious Education',    learningArea:'Life Skills'    },
  { code:'PRT',   name:'Pre Technical',          learningArea:'Technical'      },
  { code:'AGR',   name:'Agriculture',            learningArea:'Technical'      },
  { code:'CAS',   name:'Creative Arts & Sports', learningArea:'Creative Arts'  },
];

/* ══════════════════════════════════════════════════════════
   @route   GET /api/subjects
   @desc    Get all subjects — optionally filtered by class
   @access  Admin, Teacher
══════════════════════════════════════════════════════════ */
const getAllSubjects = async (req, res, next) => {
  try {
    const filter = { school: req.user.school };

    if (req.query.class)   filter.class    = req.query.class;
    if (req.query.active)  filter.isActive = req.query.active === 'true';
    if (req.query.teacher) filter.teacher  = req.query.teacher;

    const subjects = await Subject.find(filter)
      .populate('class',   'name grade')
      .populate('teacher', 'fullName email')
      .sort({ code: 1 })
      .lean();

    res.status(200).json({
      success  : true,
      count    : subjects.length,
      subjects,
    });

  } catch (error) {
    next(error);
  }
};

/* ══════════════════════════════════════════════════════════
   @route   GET /api/subjects/:id
   @desc    Get one subject
   @access  Admin, Teacher
══════════════════════════════════════════════════════════ */
const getSubject = async (req, res, next) => {
  try {
    const subject = await Subject.findOne({
      _id   : req.params.id,
      school: req.user.school,
    })
    .populate('class',   'name grade')
    .populate('teacher', 'fullName email')
    .lean();

    if (!subject) {
      return res.status(404).json({
        success : false,
        message : 'Subject not found.',
      });
    }

    res.status(200).json({
      success: true,
      subject,
    });

  } catch (error) {
    next(error);
  }
};

/* ══════════════════════════════════════════════════════════
   @route   POST /api/subjects
   @desc    Create a single subject for a class
   @access  Admin only
══════════════════════════════════════════════════════════ */
const createSubject = async (req, res, next) => {
  try {
    const {
      name, code, classId,
      teacher, learningArea,
    } = req.body;

    if (!name || !code || !classId) {
      return res.status(400).json({
        success : false,
        message : 'name, code and classId are required.',
      });
    }

    /* Verify class belongs to school */
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

    /* Check not duplicate in same class */
    const existing = await Subject.findOne({
      code  : code.toUpperCase().trim(),
      class : classId,
      school: req.user.school,
    });

    if (existing) {
      return res.status(400).json({
        success : false,
        message : `Subject code "${code}" already exists in ${classDoc.name}.`,
      });
    }

    const subject = await Subject.create({
      name        : name.trim(),
      code        : code.toUpperCase().trim(),
      class       : classId,
      school      : req.user.school,
      teacher     : teacher     || null,
      learningArea: learningArea|| null,
    });

    await subject.populate([
      { path:'class',   select:'name grade' },
      { path:'teacher', select:'fullName'   },
    ]);

    res.status(201).json({
      success : true,
      message : `${subject.name} created for ${classDoc.name}.`,
      subject,
    });

  } catch (error) {
    next(error);
  }
};

/* ══════════════════════════════════════════════════════════
   @route   PUT /api/subjects/:id
   @desc    Update a subject
   @access  Admin only
══════════════════════════════════════════════════════════ */
const updateSubject = async (req, res, next) => {
  try {
    const subject = await Subject.findOne({
      _id   : req.params.id,
      school: req.user.school,
    });

    if (!subject) {
      return res.status(404).json({
        success : false,
        message : 'Subject not found.',
      });
    }

    const allowed = [
      'name', 'teacher', 'learningArea',
      'isActive', 'isOptional',
    ];

    allowed.forEach(field => {
      if (req.body[field] !== undefined) {
        subject[field] = req.body[field];
      }
    });

    await subject.save();
    await subject.populate([
      { path:'class',   select:'name grade' },
      { path:'teacher', select:'fullName'   },
    ]);

    res.status(200).json({
      success : true,
      message : `${subject.name} updated successfully.`,
      subject,
    });

  } catch (error) {
    next(error);
  }
};

/* ══════════════════════════════════════════════════════════
   @route   DELETE /api/subjects/:id
   @desc    Delete a subject
           Only if no marks exist for it
   @access  Admin only
══════════════════════════════════════════════════════════ */
const deleteSubject = async (req, res, next) => {
  try {
    const subject = await Subject.findOne({
      _id   : req.params.id,
      school: req.user.school,
    });

    if (!subject) {
      return res.status(404).json({
        success : false,
        message : 'Subject not found.',
      });
    }

    /* Check no marks exist */
    const markCount = await Mark.countDocuments({
      subject: req.params.id,
      school : req.user.school,
    });

    if (markCount > 0) {
      return res.status(400).json({
        success : false,
        message : `Cannot delete "${subject.name}" — ${markCount} mark record(s) exist. Delete marks first.`,
      });
    }

    await Subject.deleteOne({ _id: req.params.id });

    res.status(200).json({
      success : true,
      message : `${subject.name} deleted successfully.`,
    });

  } catch (error) {
    next(error);
  }
};

/* ══════════════════════════════════════════════════════════
   @route   POST /api/subjects/seed-defaults
   @desc    Create all 9 CBC subjects for a class at once
   @body    { classId }
   @access  Admin only
══════════════════════════════════════════════════════════ */
const seedDefaultSubjects = async (req, res, next) => {
  try {
    const { classId } = req.body;

    if (!classId) {
      return res.status(400).json({
        success : false,
        message : 'classId is required.',
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

    const created = [];
    const skipped = [];

    for (const subj of CBC_SUBJECTS) {
      const existing = await Subject.findOne({
        code  : subj.code,
        class : classId,
        school: req.user.school,
      });

      if (existing) {
        skipped.push(subj.code);
        continue;
      }

      await Subject.create({
        name        : subj.name,
        code        : subj.code,
        class       : classId,
        school      : req.user.school,
        learningArea: subj.learningArea,
      });

      created.push(subj.name);
    }

    res.status(201).json({
      success : true,
      message : `${created.length} subjects created for ${classDoc.name}.`,
      created,
      skipped,
    });

  } catch (error) {
    next(error);
  }
};

/* ══════════════════════════════════════════════════════════
   @route   POST /api/subjects/seed-all-classes
   @desc    Seed all 9 subjects for ALL classes in school
           Run this once during school setup
   @access  Admin only
══════════════════════════════════════════════════════════ */
const seedAllClasses = async (req, res, next) => {
  try {
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

    let totalCreated = 0;
    let totalSkipped = 0;
    const summary    = [];

    for (const cls of classes) {
      let created = 0;

      for (const subj of CBC_SUBJECTS) {
        const existing = await Subject.findOne({
          code  : subj.code,
          class : cls._id,
          school: req.user.school,
        });

        if (existing) { totalSkipped++; continue; }

        await Subject.create({
          name        : subj.name,
          code        : subj.code,
          class       : cls._id,
          school      : req.user.school,
          learningArea: subj.learningArea,
        });

        created++;
        totalCreated++;
      }

      summary.push({ class: cls.name, created });
    }

    res.status(201).json({
      success : true,
      message : `Setup complete. ${totalCreated} subjects created across ${classes.length} classes.`,
      totalCreated,
      totalSkipped,
      summary,
    });

  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAllSubjects,
  getSubject,
  createSubject,
  updateSubject,
  deleteSubject,
  seedDefaultSubjects,
  seedAllClasses,
};