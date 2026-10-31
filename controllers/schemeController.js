/* ═══════════════════════════════════════════════════════════
   SCHOLAR ANALYTICS — Scheme of Work Controller
   File: backend/controllers/schemeController.js
   v1: schedule only (weeks, dates, lessons, half-term).
       The lesson content (outcomes, activities, KIQs) is added
       in the next step by the Gemini module.
═══════════════════════════════════════════════════════════ */

const designs            = require('../data/curriculum');
const { generateScheme } = require('../utils/schemeScheduler');
const { getObjectStore } = require('../utils/objectStore');
const { getAi }          = require('../utils/ai');
const { getGemini }      = require('../utils/gemini');
const { getBackupAi }    = require('../utils/backupAi');
const { createContentStore, DESIGN_KEY, SUB_ID } = require('../utils/contentStore');
const { createLessonEngine, buildFallback } = require('../utils/lessonContent');
const { runChecks }          = require('../utils/setupCheck');

/* Content store and engine are built on first use, so a missing setting
   never stops the server from starting */
let contentStore;
const getContentStore = () => {
  if (contentStore === undefined) {
    const objects = getObjectStore();
    contentStore = objects ? createContentStore(objects) : null;
  }
  return contentStore;
};

let engine;
const getEngine = () => {
  if (!engine) engine = createLessonEngine({ ai: getAi(), store: getContentStore() });
  return engine;
};

/* A design uploaded to storage replaces the one shipped in the code.
   Kept in memory for 10 minutes. */
const designCache = new Map();
const DESIGN_TTL = 10 * 60 * 1000;

const loadDesign = async (key) => {
  if (typeof key !== 'string' || !DESIGN_KEY.test(key)) return null;
  const hit = designCache.get(key);
  if (hit && hit.until > Date.now()) return hit.design;

  let design = null;
  const store = getContentStore();
  if (store) {
    try { design = await store.getDesign(key); }
    catch (err) { console.error('Design lookup failed:', err.message); }
  }
  design = design || designs[key] || null;
  designCache.set(key, { design, until: Date.now() + DESIGN_TTL });
  return design;
};

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
const getDesigns = async (req, res, next) => {
  try {
    /* Designs shipped in the code plus every design uploaded to storage */
    const keys = new Set(Object.keys(designs));
    const store = getContentStore();
    let storageProblem = '';
    if (store) {
      try { (await store.listDesignKeys()).forEach((k) => keys.add(k)); }
      catch (err) { console.error('Design list failed:', err.message); storageProblem = err.message; }
    } else {
      storageProblem = 'Storage is not set up on the server (the STORAGE_* settings are missing).';
    }

    const list = [];
    for (const key of [...keys].sort()) {
      const design = await loadDesign(key);
      if (!design || !Array.isArray(design.strands)) continue;
      list.push({
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
      });
    }

    res.status(200).json({ success: true, count: list.length, designs: list, storageProblem });
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
const previewScheme = async (req, res, next) => {
  try {
    const {
      designKey, startSubStrand, endSubStrand,
      termStart, termEnd, halfTermStart, halfTermEnd,
      holidays, lessonsPerDay, startLesson, endLesson, skipSubStrands,
    } = req.body;

    const fail = (message) => res.status(400).json({ success: false, message });

    const design = await loadDesign(designKey);
    if (!design) return fail('Unknown curriculum design. Use GET /api/schemes/designs to see what is available.');

    if (!startSubStrand || !endSubStrand) {
      return fail('Please choose the sub-strand where the scheme starts and where it ends.');
    }

    /* Half term is optional, but if one half-term date is given the other is needed too */
    const noHalfTerm = !halfTermStart && !halfTermEnd;
    const dateFields = noHalfTerm ? { termStart, termEnd } : { termStart, termEnd, halfTermStart, halfTermEnd };
    for (const [name, value] of Object.entries(dateFields)) {
      if (!isRealDate(value)) return fail(`${name} must be a real date in YYYY-MM-DD format.`);
    }

    for (const [name, v] of [['startLesson', startLesson], ['endLesson', endLesson]]) {
      if (v !== undefined && v !== null && v !== '' && !(Number.isInteger(Number(v)) && Number(v) >= 1 && Number(v) <= 200)) {
        return fail(`${name} must be a whole lesson number, 1 or more.`);
      }
    }
    if (skipSubStrands !== undefined && (!Array.isArray(skipSubStrands) || skipSubStrands.length > 100 || !skipSubStrands.every((x) => typeof x === 'string'))) {
      return fail('skipSubStrands must be a list of sub-strand numbers such as "1.2".');
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
        startLesson: startLesson ? Number(startLesson) : undefined,
        endLesson: endLesson ? Number(endLesson) : undefined,
        skipSubStrands: skipSubStrands || [],
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
      /* Each lesson row carries what the curriculum design already says for it (outcomes, experiences,
         inquiry questions, resources, assessment), so the scheme is complete without writing lessons. */
      rows    : result.rows.map((r) => (r.type === 'LESSON'
        ? { ...r, fromDesign: buildFallback({ design, subStrandId: r.subStrandId, lessonNo: r.lessonInSubStrand }) }
        : r)),
    });

  } catch (error) {
    next(error);
  }
};

/* ══════════════════════════════════════════════════════════
   @route   POST /api/schemes/content
   @desc    Lesson content for lessons from..to of one sub-strand.
            At most 5 lessons per request; the page asks in steps.
   @access  Admin, Teacher
   body: { designKey, subStrandId, from, to, source?: 'auto' | 'saved' }
   source 'saved' never calls Gemini: saved lessons, then the design only.
══════════════════════════════════════════════════════════ */
const getContent = async (req, res, next) => {
  try {
    const { designKey, subStrandId, from, to, source = 'auto', topic } = req.body;
    const fail = (message) => res.status(400).json({ success: false, message });
    if (!['auto', 'saved'].includes(source)) return fail('Unknown source.');

    const design = await loadDesign(designKey);
    if (!design) return fail('Unknown curriculum design.');
    if (typeof subStrandId !== 'string' || !SUB_ID.test(subStrandId)) return fail('Invalid sub-strand.');

    let result;
    try {
      /* A topic the teacher typed: find it in the notes and plan that lesson. Not saved. */
      if (typeof topic === 'string' && topic.trim()) {
        if (topic.length > 3000) return fail('The topic is too long. Keep it under 3000 characters.');
        result = await getEngine().getLessonByTopic({
          design, designKey, subStrandId, topic, lessonNo: Number.isInteger(from) && from >= 1 ? from : 1, useAi: source !== 'saved',
        });
        return res.status(200).json({ success: true, ...result });
      }
      result = await getEngine().getLessons({ design, designKey, subStrandId, from, to, useAi: source !== 'saved' });
    } catch (err) {
      if (err.statusCode === 400) return fail(err.message);
      throw err;
    }

    res.status(200).json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
};

/* ══════════════════════════════════════════════════════════
   @route   DELETE /api/schemes/content
   @desc    Throw away the saved lessons of one sub-strand so they
            are written again (e.g. after better notes are added)
   @access  Superadmin
   body: { designKey, subStrandId }
══════════════════════════════════════════════════════════ */
const resetContent = async (req, res, next) => {
  try {
    const { designKey, subStrandId } = req.body;
    const store = getContentStore();
    if (!store) return res.status(503).json({ success: false, message: 'Storage is not set up.' });
    if (typeof designKey !== 'string' || !DESIGN_KEY.test(designKey) ||
        typeof subStrandId !== 'string' || !SUB_ID.test(subStrandId)) {
      return res.status(400).json({ success: false, message: 'Invalid design or sub-strand.' });
    }
    const removed = await store.deleteContent(designKey, subStrandId);
    res.status(200).json({ success: true, removed });
  } catch (error) {
    next(error);
  }
};

/* ══════════════════════════════════════════════════════════
   @route   GET /api/schemes/status
   @desc    Try the storage and Gemini set-up and say what works
   @access  Admin, Superadmin
══════════════════════════════════════════════════════════ */
const getStatus = async (req, res, next) => {
  try {
    const checks = await runChecks({ store: getObjectStore(), ai: getGemini(), backup: getBackupAi() });
    res.status(200).json({ success: true, ...checks });
  } catch (error) {
    next(error);
  }
};

const getTopics = async (req, res, next) => {
  try {
    const { designKey, subStrandId } = req.body;
    const design = await loadDesign(designKey);
    if (!design) return res.status(400).json({ success: false, message: 'Unknown curriculum design.' });
    if (typeof subStrandId !== 'string' || !SUB_ID.test(subStrandId)) return res.status(400).json({ success: false, message: 'Invalid sub-strand.' });
    res.status(200).json({ success: true, ...(await getEngine().getTopics({ design, designKey, subStrandId })) });
  } catch (error) {
    if (error.statusCode === 400) return res.status(400).json({ success: false, message: error.message });
    next(error);
  }
};

module.exports = { getTopics, getDesigns, previewScheme, getContent, resetContent, getStatus, loadDesign, getContentStore };
