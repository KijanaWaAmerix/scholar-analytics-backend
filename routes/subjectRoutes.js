/* ═══════════════════════════════════════════════════════════
   SCHOLAR ANALYTICS — Subject Routes
   File: backend/routes/subjectRoutes.js
═══════════════════════════════════════════════════════════ */

const express = require('express');
const router  = express.Router();

const {
  getAllSubjects,
  getSubject,
  createSubject,
  updateSubject,
  deleteSubject,
  seedDefaultSubjects,
  seedAllClasses,
} = require('../controllers/subjectController');

const { protect }   = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');

router.use(protect);

/* POST /api/subjects/seed-defaults  — 9 subjects for one class */
router.post(
  '/seed-defaults',
  authorize('admin', 'superadmin'),
  seedDefaultSubjects
);

/* POST /api/subjects/seed-all-classes — 9 subjects for ALL classes */
router.post(
  '/seed-all-classes',
  authorize('admin', 'superadmin'),
  seedAllClasses
);

/* GET  /api/subjects */
/* POST /api/subjects */
router.route('/')
  .get(getAllSubjects)
  .post(authorize('admin', 'superadmin'), createSubject);

/* GET    /api/subjects/:id */
/* PUT    /api/subjects/:id */
/* DELETE /api/subjects/:id */
router.route('/:id')
  .get(getSubject)
  .put(authorize('admin', 'superadmin'), updateSubject)
  .delete(authorize('admin', 'superadmin'), deleteSubject);

module.exports = router;