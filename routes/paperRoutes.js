/* ═══════════════════════════════════════════════════════════
   SCHOLAR ANALYTICS — Exam paper routes
   File: backend/routes/paperRoutes.js
═══════════════════════════════════════════════════════════ */

const express   = require('express');
const rateLimit = require('express-rate-limit');
const router    = express.Router();

const { planPaper, writePart, getBands, fillBank, bankStats, removeQuestion } = require('../controllers/paperController');
const { protect }   = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');

/* Writing questions calls Gemini, so it has its own, tighter limit */
const writeLimiter = rateLimit({
  windowMs       : 15 * 60 * 1000,
  max            : 400,
  standardHeaders: true,
  legacyHeaders  : false,
  message        : { success: false, message: 'Too many requests. Please try again in a few minutes.' },
});

router.use(protect);

router.post('/plan',  authorize('admin', 'teacher', 'superadmin'), planPaper);
router.post('/part',  writeLimiter, authorize('admin', 'teacher', 'superadmin'), writePart);
router.post('/bank/fill',   writeLimiter, authorize('admin', 'superadmin'), fillBank);
router.post('/bank/stats',  authorize('admin', 'teacher', 'superadmin'), bankStats);
router.post('/bank/remove', authorize('admin', 'superadmin'), removeQuestion);
router.post('/bands', authorize('admin', 'teacher', 'superadmin'), getBands);

module.exports = router;
