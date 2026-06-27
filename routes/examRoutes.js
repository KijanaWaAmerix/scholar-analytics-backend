/* ═══════════════════════════════════════════════════════════
   SCHOLAR ANALYTICS — Exam Routes
   File: backend/routes/examRoutes.js
═══════════════════════════════════════════════════════════ */

const express = require('express');
const router  = express.Router();

const {
  getAllExams,
  getExam,
  createExam,
  updateExam,
  deleteExam,
  seedDefaultExams,
  seedAllExams,
} = require('../controllers/examController');

const { protect }   = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');

router.use(protect);

/* POST /api/exams/seed-defaults  — 3 exams for one class/term */
router.post(
  '/seed-defaults',
  authorize('admin', 'superadmin'),
  seedDefaultExams
);

/* POST /api/exams/seed-all  — all exams for all classes */
router.post(
  '/seed-all',
  authorize('admin', 'superadmin'),
  seedAllExams
);

/* GET  /api/exams */
/* POST /api/exams */
router.route('/')
  .get(getAllExams)
  .post(authorize('admin', 'superadmin'), createExam);

/* GET    /api/exams/:id */
/* PUT    /api/exams/:id */
/* DELETE /api/exams/:id */
router.route('/:id')
  .get(getExam)
  .put(authorize('admin', 'superadmin'), updateExam)
  .delete(authorize('admin', 'superadmin'), deleteExam);

module.exports = router;