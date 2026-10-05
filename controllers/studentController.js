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

    const {
      students,
      classId,
    } = req.body;


    if (
      !students?.length ||
      !classId
    ) {
      return res.status(400).json({
        success: false,
        message:
          'Students array and classId are required.',
      });
    }


    /* Verify class */

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


    const results = {
      created: 0,
      skipped: 0,
      errors: [],
    };


    for (const row of students) {

      try {

        /*
         * Read UPI from possible import column names.
         */
        const rawUpi =
          row.upiNumber ??
          row['UPI Number'] ??
          '';


        /*
         * Blank UPI becomes undefined.
         */
        const upiNumber =
          typeof rawUpi === 'string' &&
          rawUpi.trim() !== ''
            ? rawUpi
                .trim()
                .toUpperCase()
            : undefined;


        /*
         * Check duplicate UPI only when
         * an actual UPI exists.
         */
        if (upiNumber) {

          const exists =
            await Student.findOne({
              upiNumber,
              school: req.user.school,
            });


          if (exists) {
            results.skipped++;
            continue;
          }
        }


        /*
         * Build student data WITHOUT
         * a blank UPI field.
         */
        const studentData = {

          fullName:
            row.fullName ||
            row['Full Name'] ||
            '',

          gender:
            (
              row.gender ||
              row['Gender'] ||
              'male'
            ).toLowerCase(),

          dateOfBirth:
            row.dateOfBirth ||
            row['Date of Birth'] ||
            null,

          assessmentNo:
            row.assessmentNo ||
            row['Assessment No'] ||
            null,

          parentName:
            row.parentName ||
            row['Parent Name'] ||
            null,

          parentPhone:
            row.parentContact ||
            row['Parent Contact'] ||
            null,

          class: classId,

          school:
            req.user.school,

          isActive: true,
        };


        /*
         * Only save UPI when there is
         * an actual UPI value.
         */
        if (upiNumber) {
          studentData.upiNumber =
            upiNumber;
        }


        await Student.create(
          studentData
        );


        results.created++;

      } catch (err) {

        results.errors.push({
          row:
            row.fullName ||
            row['Full Name'] ||
            'Unknown',

          error: err.message,
        });
      }
    }


    res.status(200).json({
      success: true,

      message:
        `${results.created} students imported, ${results.skipped} skipped.`,

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