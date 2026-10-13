/* ═══════════════════════════════════════════════════════════
   SCHOLAR ANALYTICS — Student Controller
   File: backend/controllers/studentController.js
═══════════════════════════════════════════════════════════ */

const Student = require('../models/Student');
const Class   = require('../models/Class');


/* ═══════════════════════════════════════════════════════════
   GET ALL STUDENTS
═══════════════════════════════════════════════════════════ */

exports.getStudents = async (req, res, next) => {
  try {
    const {
      search,
      class: classId,
      gender,
      status,
      page = 1,
      limit = 50,
    } = req.query;

    const filter = {
      school: req.user.school,
    };

    if (classId && classId !== 'all') {
      filter.class = classId;
    }

    if (gender && gender !== 'all') {
      filter.gender = gender;
    }

    if (status && status !== 'all') {
      filter.isActive = status === 'active';
    }

    if (search) {
      filter.$or = [
        {
          fullName: {
            $regex: search,
            $options: 'i',
          },
        },
        {
          upiNumber: {
            $regex: search,
            $options: 'i',
          },
        },
        {
          assessmentNo: {
            $regex: search,
            $options: 'i',
          },
        },
        {
          admissionNo: {
            $regex: search,
            $options: 'i',
          },
        },
      ];
    }

    const skip =
      (Number(page) - 1) * Number(limit);

    const total =
      await Student.countDocuments(filter);

    const students =
      await Student.find(filter)
        .populate('class', 'name grade')
        .sort({ fullName: 1 })
        .skip(skip)
        .limit(Number(limit))
        .lean();

    const allStudents =
      await Student.find({
        school: req.user.school,
      });

    const stats = {
      total: allStudents.length,

      male: allStudents.filter(
        s => s.gender === 'male'
      ).length,

      female: allStudents.filter(
        s => s.gender === 'female'
      ).length,

      active: allStudents.filter(
        s => s.isActive
      ).length,

      inactive: allStudents.filter(
        s => !s.isActive
      ).length,
    };

    res.status(200).json({
      success: true,
      students,
      stats,

      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        pages: Math.ceil(
          total / Number(limit)
        ),
      },
    });

  } catch (error) {
    next(error);
  }
};


/* ═══════════════════════════════════════════════════════════
   GET SINGLE STUDENT
═══════════════════════════════════════════════════════════ */

exports.getStudent = async (req, res, next) => {
  try {
    const student =
      await Student.findOne({
        _id: req.params.id,
        school: req.user.school,
      }).populate(
        'class',
        'name grade'
      );

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found.',
      });
    }

    res.status(200).json({
      success: true,
      student,
    });

  } catch (error) {
    next(error);
  }
};


/* ═══════════════════════════════════════════════════════════
   CREATE STUDENT
═══════════════════════════════════════════════════════════ */

exports.createStudent = async (req, res, next) => {
  try {

    const {
      fullName,
      gender,
      dateOfBirth,
      assessmentNo,
      classId,
      parentName,
      parentContact,
    } = req.body;

    const admissionNo =
      String(req.body.admissionNo || '').trim();

    if (admissionNo) {
      const dup = await Student.findOne({
        school: req.user.school,
        admissionNo,
      });
      if (dup) {
        return res.status(400).json({
          success: false,
          message:
            `Admission number ${admissionNo} already exists.`,
        });
      }
    }


    /*
     * IMPORTANT:
     * Blank UPI values are converted to undefined.
     *
     * This means:
     * ""      → no UPI
     * "   "   → no UPI
     * missing → no UPI
     *
     * Only an actual UPI is saved.
     */
    const upiNumber =
      typeof req.body.upiNumber === 'string' &&
      req.body.upiNumber.trim() !== ''
        ? req.body.upiNumber
            .trim()
            .toUpperCase()
        : undefined;


    /* Required fields */

    if (!fullName || !classId) {
      return res.status(400).json({
        success: false,
        message:
          'Full name and class are required.',
      });
    }


    /* Verify class belongs to this school */

    const cls =
      await Class.findOne({
        _id: classId,
        school: req.user.school,
      });

    if (!cls) {
      return res.status(404).json({
        success: false,
        message: 'Class not found.',
      });
    }


    /* Check UPI only when an actual UPI was supplied */

    if (upiNumber) {

      const existing =
        await Student.findOne({
          upiNumber,
          school: req.user.school,
        });

      if (existing) {
        return res.status(400).json({
          success: false,
          message:
            `UPI number ${upiNumber} already exists.`,
        });
      }
    }


    /*
     * Build student data.
     *
     * IMPORTANT:
     * We deliberately DO NOT put upiNumber
     * into the object when it is blank.
     */
    const studentData = {
      fullName,
      gender: gender || null,
      dateOfBirth:
        dateOfBirth || null,
      assessmentNo:
        assessmentNo || null,

      admissionNo: admissionNo || null,

      class: classId,
      school: req.user.school,

      parentName:
        parentName || null,

      parentPhone:
        parentContact || null,

      isActive: true,
    };


    /* Add UPI only when it actually exists */

    if (upiNumber) {
      studentData.upiNumber = upiNumber;
    }


    const student =
      await Student.create(
        studentData
      );


    await student.populate(
      'class',
      'name grade'
    );


    res.status(201).json({
      success: true,
      student,
    });

  } catch (error) {

    /*
     * Extra protection against duplicate UPI
     * errors coming directly from MongoDB.
     */
    if (error.code === 11000) {

      if (
        error.keyPattern &&
        error.keyPattern.upiNumber
      ) {
        return res.status(400).json({
          success: false,
          message:
            'UPI number already exists. Please use a different value.',
        });
      }
    }

    next(error);
  }
};


/* ═══════════════════════════════════════════════════════════
   UPDATE STUDENT
═══════════════════════════════════════════════════════════ */

exports.updateStudent = async (req, res, next) => {
  try {

    const {
      fullName,
      gender,
      dateOfBirth,
      assessmentNo,
      classId,
      parentName,
      parentContact,
      isActive,
    } = req.body;

    const newAdmissionNo =
      req.body.admissionNo === undefined
        ? undefined
        : String(req.body.admissionNo || '').trim();


    const student =
      await Student.findOne({
        _id: req.params.id,
        school: req.user.school,
      });


    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found.',
      });
    }


    /*
     * Normalize UPI.
     *
     * Blank UPI becomes undefined,
     * allowing the learner to have no UPI.
     */
    const hasUpiField =
      Object.prototype.hasOwnProperty.call(
        req.body,
        'upiNumber'
      );

    const upiNumber =
      hasUpiField &&
      typeof req.body.upiNumber === 'string' &&
      req.body.upiNumber.trim() !== ''
        ? req.body.upiNumber
            .trim()
            .toUpperCase()
        : undefined;


    /* Check duplicate UPI only when supplied */

    if (
      upiNumber &&
      upiNumber !== student.upiNumber
    ) {

      const existing =
        await Student.findOne({
          upiNumber,
          school: req.user.school,
          _id: {
            $ne: student._id,
          },
        });

      if (existing) {
        return res.status(400).json({
          success: false,
          message:
            `UPI number ${upiNumber} already exists.`,
        });
      }
    }


    /* Update normal fields */

    if (fullName) {
      student.fullName = fullName;
    }

    if (gender) {
      student.gender = gender;
    }

    if (dateOfBirth) {
      student.dateOfBirth = dateOfBirth;
    }

    if (assessmentNo) {
      student.assessmentNo =
        assessmentNo;
    }

    if (newAdmissionNo !== undefined) {
      if (
        newAdmissionNo &&
        newAdmissionNo !== student.admissionNo
      ) {
        const dup = await Student.findOne({
          school: req.user.school,
          admissionNo: newAdmissionNo,
          _id: { $ne: student._id },
        });
        if (dup) {
          return res.status(400).json({
            success: false,
            message:
              `Admission number ${newAdmissionNo} already exists.`,
          });
        }
      }
      student.admissionNo = newAdmissionNo || null;
    }

    if (classId) {
      student.class = classId;
    }

    if (parentName) {
      student.parentName =
        parentName;
    }

    if (parentContact) {
      student.parentPhone =
        parentContact;
    }

    if (isActive !== undefined) {
      student.isActive = isActive;
    }


    /*
     * If UPI field was submitted blank,
     * remove it completely.
     */
    if (hasUpiField) {

      if (upiNumber) {
        student.upiNumber =
          upiNumber;
      } else {
        student.upiNumber =
          undefined;
      }
    }


    await student.save();

    await student.populate(
      'class',
      'name grade'
    );


    res.status(200).json({
      success: true,
      student,
    });

  } catch (error) {

    if (error.code === 11000) {

      if (
        error.keyPattern &&
        error.keyPattern.upiNumber
      ) {
        return res.status(400).json({
          success: false,
          message:
            'UPI number already exists. Please use a different value.',
        });
      }
    }

    next(error);
  }
};


/* ═══════════════════════════════════════════════════════════
   DELETE STUDENT
═══════════════════════════════════════════════════════════ */

exports.deleteStudent = async (req, res, next) => {
  try {

    const student =
      await Student.findOneAndDelete({
        _id: req.params.id,
        school: req.user.school,
      });


    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found.',
      });
    }


    res.status(200).json({
      success: true,
      message:
        'Student deleted successfully.',
    });

  } catch (error) {
    next(error);
  }
};


/* ═══════════════════════════════════════════════════════════
   BULK IMPORT
═══════════════════════════════════════════════════════════ */

exports.bulkImport = async (req, res, next) => {
  try {

    const { students, classId } = req.body;

    if (!Array.isArray(students) || !students.length || !classId) {
      return res.status(400).json({
        success: false,
        message: 'Students array and classId are required.',
      });
    }

    const cls = await Class.findOne({
      _id: classId,
      school: req.user.school,
    });

    if (!cls) {
      return res.status(404).json({
        success: false,
        message: 'Class not found.',
      });
    }

    /* ── helpers ───────────────────────────────────────── */

    /* Read a column whatever its heading is called:
       "Full Name", "full_name", "NAME" ... all work */
    const key = (k) => String(k).toLowerCase().replace(/[^a-z0-9]/g, '');
    const pick = (row, names) => {
      for (const k of Object.keys(row)) {
        if (names.includes(key(k))) {
          const v = row[k];
          if (v !== undefined && v !== null && String(v).trim() !== '') {
            return String(v).trim();
          }
        }
      }
      return '';
    };

    const cleanName = (n) => n.replace(/\s+/g, ' ').trim();
    const nameKey   = (n) => cleanName(n).toLowerCase();

    const toGender = (g) => {
      const v = String(g || '').trim().toLowerCase();
      if (['male', 'm', 'boy', 'b'].includes(v))   return 'male';
      if (['female', 'f', 'girl', 'g'].includes(v)) return 'female';
      return null;
    };

    /* ── what is already there ─────────────────────────── */
    const inClass = await Student.find({ school: req.user.school, class: classId })
      .select('fullName');
    const namesInClass = new Set(inClass.map(x => nameKey(x.fullName)));

    const withAdm = await Student.find({
      school: req.user.school,
      admissionNo: { $type: 'string' },
    }).select('admissionNo');
    const admsInSchool = new Set(withAdm.map(x => x.admissionNo.toLowerCase()));

    const results = { created: 0, skipped: 0, skippedNames: [], errors: [] };
    const seenNames = new Set();
    const seenAdms  = new Set();
    const valid     = [];

    students.forEach((row, i) => {
      const fullName = cleanName(pick(row, ['fullname', 'name', 'learnername', 'studentname', 'learner', 'student']));
      const label    = fullName || `Row ${i + 2}`;

      if (!fullName) {
        results.errors.push({ row: label, error: 'Name is missing.' });
        return;
      }

      /* TOTAL / MEAN style footer rows are not learners */
      if (/^(total|totals|mean|average|avg|sum|grand total|mean score|class mean)$/i.test(fullName)) return;

      /* Gender may be left blank (e.g. a broad sheet has no gender column):
         the learner is imported and flagged "profile incomplete" so it is
         easy to finish later. A value that is filled in must make sense. */
      const genderRaw = pick(row, ['gender', 'sex']);
      const gender    = genderRaw ? toGender(genderRaw) : null;
      if (genderRaw && !gender) {
        results.errors.push({ row: label, error: 'Gender must be Male or Female.' });
        return;
      }

      const admissionNo  = pick(row, ['admissionno', 'admissionnumber', 'admno', 'admission', 'adm']);
      const assessmentNo = pick(row, ['assessmentno', 'assessmentnumber', 'assessment', 'assno']);
      const rawUpi       = pick(row, ['upinumber', 'upi']);

      /* already there → skip */
      const nk = nameKey(fullName);
      const ak = admissionNo.toLowerCase();
      if (
        namesInClass.has(nk) || seenNames.has(nk) ||
        (ak && (admsInSchool.has(ak) || seenAdms.has(ak)))
      ) {
        results.skipped++;
        results.skippedNames.push(fullName);
        return;
      }
      seenNames.add(nk);
      if (ak) seenAdms.add(ak);

      const data = {
        fullName,
        gender,
        assessmentNo: assessmentNo || null,
        admissionNo : admissionNo  || null,
        class : classId,
        school: req.user.school,
        isActive: true,
        profileIncomplete: !gender,
      };
      if (rawUpi) data.upiNumber = rawUpi.toUpperCase();

      valid.push(data);
    });

    /* A–Z by name, so the class is stored in alphabetical order */
    valid.sort((a, b) => a.fullName.localeCompare(b.fullName, 'en', { sensitivity: 'base' }));

    for (const data of valid) {
      try {
        await Student.create(data);
        results.created++;
      } catch (err) {
        results.errors.push({ row: data.fullName, error: err.message });
      }
    }

    res.status(200).json({
      success: true,
      message:
        `${results.created} imported, ` +
        `${results.skipped} already there (skipped)` +
        (results.errors.length ? `, ${results.errors.length} with problems.` : '.'),
      results,
    });

  } catch (error) {
    next(error);
  }
};


/* ═══════════════════════════════════════════════════════════
   GET STUDENT STATISTICS
═══════════════════════════════════════════════════════════ */

exports.getStats = async (req, res, next) => {
  try {

    const school =
      req.user.school;


    const [
      total,
      male,
      female,
      active,
    ] =
      await Promise.all([

        Student.countDocuments({
          school,
        }),

        Student.countDocuments({
          school,
          gender: 'male',
        }),

        Student.countDocuments({
          school,
          gender: 'female',
        }),

        Student.countDocuments({
          school,
          isActive: true,
        }),

      ]);


    res.status(200).json({
      success: true,

      stats: {
        total,
        male,
        female,
        active,
        inactive:
          total - active,
      },
    });

  } catch (error) {
    next(error);
  }
};