/* ═══════════════════════════════════════════════════════════
   SCHOLAR ANALYTICS — Scheme of Work Routes
   File: backend/routes/schemeRoutes.js
═══════════════════════════════════════════════════════════ */

const express = require('express');
const rateLimit = require('express-rate-limit');
const router  = express.Router();

/* Lesson writing can call Gemini, so it has its own, tighter limit */
const contentLimiter = rateLimit({
  windowMs       : 15 * 60 * 1000,
  max            : 60,
  standardHeaders: true,
  legacyHeaders  : false,
  message        : { success: false, message: 'Too many requests. Please try again in a few minutes.' },
});

const { getTopics, getDesigns, previewScheme, getContent, resetContent, getStatus } = require('../controllers/schemeController');

const { protect }   = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');

router.use(protect);

/* GET  /api/schemes/designs  — designs and their sub-strands */
router.get('/designs', authorize('admin', 'teacher', 'superadmin'), getDesigns);

/* POST /api/schemes/preview  — lay out weeks, dates and half-term */
router.post('/preview', authorize('admin', 'teacher', 'superadmin'), previewScheme);

/* POST /api/schemes/content  — lesson content for up to 5 lessons */
router.post('/topics', authorize('admin', 'teacher', 'superadmin'), getTopics);
router.post('/content', contentLimiter, authorize('admin', 'teacher', 'superadmin'), getContent);

/* DELETE /api/schemes/content — clear saved lessons of a sub-strand */
router.delete('/content', authorize('superadmin'), resetContent);

/* GET /api/schemes/status — does storage and Gemini work? */
router.get('/status', rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false,
  message: { success: false, message: 'Too many checks. Try again in a few minutes.' } }),
  authorize('admin', 'superadmin'), getStatus);

module.exports = router;
