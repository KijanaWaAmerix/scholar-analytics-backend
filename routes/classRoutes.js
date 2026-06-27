/* ═══════════════════════════════════════════════════════════
   SCHOLAR ANALYTICS — Class Routes
   File: backend/routes/classRoutes.js
═══════════════════════════════════════════════════════════ */

const express = require('express');
const router  = express.Router();

const {
  getAllClasses,
  getClass,
  createClass,
  updateClass,
  deleteClass,
  seedDefaultClasses,
} = require('../controllers/classController');

const { protect }   = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');

router.use(protect);

/* POST /api/classes/seed-defaults */
router.post(
  '/seed-defaults',
  authorize('admin', 'superadmin'),
  seedDefaultClasses
);

/* GET  /api/classes */
/* POST /api/classes */
router.route('/')
  .get(getAllClasses)
  .post(authorize('admin', 'superadmin'), createClass);

/* GET    /api/classes/:id */
/* PUT    /api/classes/:id */
/* DELETE /api/classes/:id */
router.route('/:id')
  .get(getClass)
  .put(authorize('admin', 'superadmin'), updateClass)
  .delete(authorize('admin', 'superadmin'), deleteClass);

module.exports = router;