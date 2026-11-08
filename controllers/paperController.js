/* ═══════════════════════════════════════════════════════════
   SCHOLAR ANALYTICS — Exam paper controller
   File: backend/controllers/paperController.js
═══════════════════════════════════════════════════════════ */

const { loadDesign, getContentStore } = require('./schemeController');
const { getAi }           = require('../utils/ai');
const { createPaperWriter, share, bandsFor } = require('../utils/examPaper');
const { SUB_ID }          = require('../utils/contentStore');

let writer;
const getWriter = () => {
  if (!writer) {
    const store = getContentStore();
    writer = createPaperWriter({
      ai   : getAi(),
      notes: store ? (key, subId) => store.getNotes(key, subId) : undefined,
      bank : store ? { get: (k, sId) => store.getBank(k, sId), add: (k, sId, a) => store.addToBank(k, sId, a) } : null,
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

    if (!Array.isArray(subStrandIds) || !subStrandIds.length ||
        !subStrandIds.every((id) => typeof id === 'string' && SUB_ID.test(id)) ||
        new Set(subStrandIds).size !== subStrandIds.length) {
      return fail('Choose at least one sub-strand, each only once.');
    }
    if (!Number.isInteger(mcq) || mcq < 0) return fail('Multiple choice questions must be a whole number, 0 or more.');
    if (!Number.isInteger(structured) || structured < 0) return fail('Structured questions must be a whole number, 0 or more.');
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
   body: { designKey, subStrandId, mcq, structured, source?: 'auto' | 'gemini' | 'saved' }
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
      part = await getWriter().writePart({ design, designKey, subStrandId, mcq, structured, mode: 'bank' });
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
  if (!Number.isInteger(total) || total < 1 || total > 10000) {
    return res.status(400).json({ success: false, message: 'Total marks must be from 1 to 10000.' });
  }
  res.status(200).json({ success: true, bands: bandsFor(total) });
};

/* ══════════════════════════════════════════════════════════
   @route   POST /api/papers/bank/fill
   @desc    Gemini writes new questions for ONE sub-strand from the notes
            and keeps them in the bank (the page calls it once per sub-strand)
   @access  Admin
   body: { designKey, subStrandId, mcq?, structured? }
══════════════════════════════════════════════════════════ */
const fillBank = async (req, res, next) => {
  try {
    const { designKey, subStrandId, mcq = 12, structured = 4 } = req.body;
    const design = await loadDesign(designKey);
    if (!design) return res.status(400).json({ success: false, message: 'Unknown curriculum design.' });
    if (typeof subStrandId !== 'string' || !SUB_ID.test(subStrandId)) {
      return res.status(400).json({ success: false, message: 'Invalid sub-strand.' });
    }
    try {
      const out = await getWriter().fillBank({ design, designKey, subStrandId, mcq, structured });
      res.status(200).json({ success: true, ...out });
    } catch (err) {
      if (err.statusCode) return res.status(err.statusCode).json({ success: false, message: err.message });
      throw err;
    }
  } catch (error) {
    next(error);
  }
};

/* ══════════════════════════════════════════════════════════
   @route   POST /api/papers/bank/stats
   @desc    How many questions the bank holds for each sub-strand
   @access  Admin, Teacher
   body: { designKey }
══════════════════════════════════════════════════════════ */
const bankStats = async (req, res, next) => {
  try {
    const design = await loadDesign(req.body.designKey);
    if (!design) return res.status(400).json({ success: false, message: 'Unknown curriculum design.' });
    const store = getContentStore();
    const subs = design.strands.flatMap((s) => s.sub_strands);
    const counts = {};
    for (let i = 0; i < subs.length; i += 10) {
      await Promise.all(subs.slice(i, i + 10).map(async (s) => {
        try {
          const b = store ? await store.getBank(req.body.designKey, s.id) : { mcq: [], structured: [] };
          counts[s.id] = { mcq: b.mcq.length, structured: b.structured.length };
        } catch { counts[s.id] = { mcq: 0, structured: 0 }; }
      }));
    }
    res.status(200).json({ success: true, counts });
  } catch (error) {
    next(error);
  }
};

/* ══════════════════════════════════════════════════════════
   @route   POST /api/papers/bank/remove
   @desc    Take one bad question out of the bank
   @access  Admin
   body: { designKey, subStrandId, kind: 'mcq'|'structured', text }
══════════════════════════════════════════════════════════ */
const removeQuestion = async (req, res, next) => {
  try {
    const { designKey, subStrandId, kind, text } = req.body;
    const store = getContentStore();
    if (!store) return res.status(503).json({ success: false, message: 'The question bank needs the storage set-up (Backblaze).' });
    if (typeof designKey !== 'string' || typeof subStrandId !== 'string' || !SUB_ID.test(subStrandId) || typeof text !== 'string' || !text) {
      return res.status(400).json({ success: false, message: 'Invalid request.' });
    }
    try {
      res.status(200).json({ success: true, ...(await store.removeFromBank(designKey, subStrandId, kind, text)) });
    } catch (err) {
      if (err.statusCode || /key|sub/i.test(err.message)) return res.status(err.statusCode || 400).json({ success: false, message: err.message });
      throw err;
    }
  } catch (error) {
    next(error);
  }
};

module.exports = { planPaper, writePart, getBands, fillBank, bankStats, removeQuestion };
