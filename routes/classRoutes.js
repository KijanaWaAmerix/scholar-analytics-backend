/* ═══════════════════════════════════════════════════════════
   SCHOLAR ANALYTICS — Class Routes
   File: backend/routes/classRoutes.js
   Change: seed-defaults route removed
═══════════════════════════════════════════════════════════ */

const express = require('express');
const router  = express.Router();

const {
  getAllClasses,
  getClass,
  createClass,
  updateClass,
  deleteClass,
} = require('../controllers/classController');

const { protect }   = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');

router.use(protect);

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