/* ═══════════════════════════════════════════════════════════
   SCHOLAR ANALYTICS — Scheme of Work Controller
   File: backend/controllers/schemeController.js
   v1: schedule only (weeks, dates, lessons, half-term).
       The lesson content (outcomes, activities, KIQs) is added
       in the next step by the Gemini module.
═══════════════════════════════════════════════════════════ */

const designs            = require('../data/curriculum');
const { generateScheme } = require('../utils/schemeScheduler');

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const isRealDate = (value) => {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
};

/* ══════════════════════════════════════════════════════════
   @route   GET /api/schemes/designs
   @desc    List the curriculum designs available and their
            sub-strands, so the teacher can pick where the
            scheme starts and ends
   @access  Admin, Teacher
══════════════════════════════════════════════════════════ */
const getDesigns = (req, res, next) => {
  try {
    const list = Object.entries(designs).map(([key, design]) => ({
      key,
      grade           : design.grade,
      learningArea    : design.learning_area,
      lessonsPerWeek  : design.lessons_per_week,
      lessonMinutes   : design.lesson_minutes,
      source          : design.source,
      subStrands      : design.strands.flatMap((strand) =>
        strand.sub_strands.map((sub) => ({
          id         : sub.id,
          name       : sub.name,
          strandId   : strand.id,
          strand     : strand.name,
          lessons    : sub.lessons,
        }))
      ),
    }));

    res.status(200).json({ success: true, count: list.length, designs: list });
  } catch (error) {
    next(error);
  }
};

/* ══════════════════════════════════════════════════════════
   @route   POST /api/schemes/preview
   @desc    Lay out a scheme of work: which lesson falls in which
            week and on which date, with the half-term break shown
   @access  Admin, Teacher
   body: {
     designKey, startSubStrand, endSubStrand,
     termStart, termEnd, halfTermStart, halfTermEnd,   (YYYY-MM-DD)
     holidays?: [YYYY-MM-DD],
     lessonsPerDay?: { "1": 1, "2": 1, ... "5": 1 }    (1 = Monday)
   }
══════════════════════════════════════════════════════════ */
const previewScheme = (req, res, next) => {
  try {
    const {
      designKey, startSubStrand, endSubStrand,
      termStart, termEnd, halfTermStart, halfTermEnd,
      holidays, lessonsPerDay,
    } = req.body;

    const fail = (message) => res.status(400).json({ success: false, message });

    const design = designs[designKey];
    if (!design) return fail('Unknown curriculum design. Use GET /api/schemes/designs to see what is available.');

    if (!startSubStrand || !endSubStrand) {
      return fail('Please choose the sub-strand where the scheme starts and where it ends.');
    }

    const dateFields = { termStart, termEnd, halfTermStart, halfTermEnd };
    for (const [name, value] of Object.entries(dateFields)) {
      if (!isRealDate(value)) return fail(`${name} must be a real date in YYYY-MM-DD format.`);
    }

    let holidayList = [];
    if (holidays !== undefined) {
      if (!Array.isArray(holidays) || holidays.length > 60 || !holidays.every(isRealDate)) {
        return fail('holidays must be a list of dates in YYYY-MM-DD format.');
      }
      holidayList = holidays;
    }

    let perDay;
    if (lessonsPerDay !== undefined) {
      const ok =
        lessonsPerDay && typeof lessonsPerDay === 'object' && !Array.isArray(lessonsPerDay) &&
        Object.entries(lessonsPerDay).every(
          ([day, n]) => ['1', '2', '3', '4', '5'].includes(day) && Number.isInteger(n) && n >= 0 && n <= 8
        );
      if (!ok) return fail('lessonsPerDay must map days 1 (Monday) to 5 (Friday) to a whole number from 0 to 8.');
      perDay = lessonsPerDay;
    }

    let result;
    try {
      result = generateScheme({
        design, startSubStrand, endSubStrand,
        termStart, termEnd, halfTermStart, halfTermEnd,
        holidays: holidayList,
        ...(perDay ? { lessonsPerDay: perDay } : {}),
      });
    } catch (err) {
      /* The scheduler throws plain Errors for bad input (unknown sub-strand,
         dates out of order, half-term outside the term) */
      return fail(err.message);
    }

    res.status(200).json({
      success : true,
      design  : { key: designKey, grade: design.grade, learningArea: design.learning_area },
      summary : result.summary,
      rows    : result.rows,
    });

  } catch (error) {
    next(error);
  }
};

module.exports = { getDesigns, previewScheme };
