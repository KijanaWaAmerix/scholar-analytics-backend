/* ═══════════════════════════════════════════════════════════
   SCHOLAR ANALYTICS — Scheme of Work Routes
   File: backend/routes/schemeRoutes.js
═══════════════════════════════════════════════════════════ */

const express = require('express');
const router  = express.Router();

const { getDesigns, previewScheme } = require('../controllers/schemeController');

const { protect }   = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');

router.use(protect);

/* GET  /api/schemes/designs  — designs and their sub-strands */
router.get('/designs', authorize('admin', 'teacher', 'superadmin'), getDesigns);

/* POST /api/schemes/preview  — lay out weeks, dates and half-term */
router.post('/preview', authorize('admin', 'teacher', 'superadmin'), previewScheme);

module.exports = router;
