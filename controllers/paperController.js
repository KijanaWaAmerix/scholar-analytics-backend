/* ═══════════════════════════════════════════════════════════
   SCHOLAR ANALYTICS — Exam paper controller
   File: backend/controllers/paperController.js
═══════════════════════════════════════════════════════════ */

const { loadDesign, getContentStore } = require('./schemeController');
const { getGemini }       = require('../utils/gemini');
const { createPaperWriter, share, bandsFor } = require('../utils/examPaper');
const { SUB_ID }          = require('../utils/contentStore');

let writer;
const getWriter = () => {
  if (!writer) {
    const store = getContentStore();
    writer = createPaperWriter({
      ai   : getGemini(),
      notes: store ? (key, subId) => store.getNotes(key, subId) : undefined,
    });
  }
  return writer;
};

/* ══════════════════════════════════════════════════════════
   @route   POST /api/papers/plan
   @desc    Split the number of questions over the chosen sub-strands
            (in proportion to their lessons) and give the marks bands
   @access  Admin, Teacher
   body: { designKey, subStrandIds: ["1.1","1.2"], mcq, structured }
══════════════════════════════════════════════════════════ */
const planPaper = async (req, res, next) => {
  try {
    const { designKey, subStrandIds, mcq, structured } = req.body;
    const fail = (message) => res.status(400).json({ success: false, message });

    const design = await loadDesign(designKey);
    if (!design) return fail('Unknown curriculum design.');

    if (!Array.isArray(subStrandIds) || !subStrandIds.length || subStrandIds.length > 8 ||
        !subStrandIds.every((id) => typeof id === 'string' && SUB_ID.test(id)) ||
        new Set(subStrandIds).size !== subStrandIds.length) {
      return fail('Choose between 1 and 8 different sub-strands.');
    }
    if (!Number.isInteger(mcq) || mcq < 0 || mcq > 60) return fail('Multiple choice questions must be from 0 to 60.');
    if (!Number.isInteger(structured) || structured < 0 || structured > 20) return fail('Structured questions must be from 0 to 20.');
    if (mcq + structured < 1) return fail('Choose at least one question.');

    const subs = [];
    for (const id of subStrandIds) {
      const found = design.strands.flatMap((s) => s.sub_strands).find((x) => x.id === id);
      if (!found) return fail(`Unknown sub-strand ${id}.`);
      subs.push(found);
    }

    const weights = subs.map((s) => s.lessons || 1);
    const m = share(mcq, weights);
    const st = share(structured, weights);

    res.status(200).json({
      success: true,
      parts: subs.map((s, i) => ({ subStrandId: s.id, subStrand: s.name, mcq: m[i], structured: st[i] })),
    });
  } catch (error) {
    next(error);
  }
};

/* ══════════════════════════════════════════════════════════
   @route   POST /api/papers/part
   @desc    Write the questions of ONE sub-strand (one request each,
            so a long paper never waits on a single slow call)
   @access  Admin, Teacher
   body: { designKey, subStrandId, mcq, structured }
══════════════════════════════════════════════════════════ */
const writePart = async (req, res, next) => {
  try {
    const { designKey, subStrandId, mcq, structured } = req.body;
    const design = await loadDesign(designKey);
    if (!design) return res.status(400).json({ success: false, message: 'Unknown curriculum design.' });
    if (typeof subStrandId !== 'string' || !SUB_ID.test(subStrandId)) {
      return res.status(400).json({ success: false, message: 'Invalid sub-strand.' });
    }

    let part;
    try {
      part = await getWriter().writePart({ design, designKey, subStrandId, mcq, structured });
    } catch (err) {
      if (err.statusCode) return res.status(err.statusCode).json({ success: false, message: err.message });
      throw err;
    }
    res.status(200).json({ success: true, ...part });
  } catch (error) {
    next(error);
  }
};

/* ══════════════════════════════════════════════════════════
   @route   POST /api/papers/bands
   @desc    Marks bands for a paper with this total
   @access  Admin, Teacher
   body: { total }
══════════════════════════════════════════════════════════ */
const getBands = (req, res) => {
  const total = req.body.total;
  if (!Number.isInteger(total) || total < 1 || total > 200) {
    return res.status(400).json({ success: false, message: 'Total marks must be from 1 to 200.' });
  }
  res.status(200).json({ success: true, bands: bandsFor(total) });
};

module.exports = { planPaper, writePart, getBands };
