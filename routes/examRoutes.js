/* ═══════════════════════════════════════════════════════════
   SCHOLAR ANALYTICS — Exam Routes
   File: backend/routes/examRoutes.js
   v2: added POST /api/exams/delete (delete many exams + marks)
═══════════════════════════════════════════════════════════ */

const express = require('express');
const router  = express.Router();

const {
  getAllExams,
  getExam,
  createExam,
  updateExam,
  deleteExam,
  deleteExams,
  seedDefaultExams,
  seedAllExams,
} = require('../controllers/examController');

const { protect }   = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');

router.use(protect);

/* POST /api/exams/seed-defaults  — exams for one class/term */
router.post(
  '/seed-defaults',
  authorize('admin', 'superadmin'),
  seedDefaultExams
);

/* POST /api/exams/seed-all  — exams for all classes */
router.post(
  '/seed-all',
  authorize('admin', 'superadmin'),
  seedAllExams
);

/* POST /api/exams/delete  — delete one or many exams AND their marks
   body: { examIds: [...] }                                          */
router.post(
  '/delete',
  authorize('admin', 'superadmin'),
  deleteExams
);

/* GET  /api/exams */
/* POST /api/exams */
router.route('/')
  .get(getAllExams)
  .post(authorize('admin', 'superadmin'), createExam);

/* GET    /api/exams/:id */
/* PUT    /api/exams/:id */
/* DELETE /api/exams/:id  (safe delete — refused if marks exist) */
router.route('/:id')
  .get(getExam)
  .put(authorize('admin', 'superadmin'), updateExam)
  .delete(authorize('admin', 'superadmin'), deleteExam);

module.exports = router;