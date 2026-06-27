/* ═══════════════════════════════════════════════════════════
   SCHOLAR ANALYTICS — Student Routes
   File: backend/routes/studentRoutes.js
═══════════════════════════════════════════════════════════ */

const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/studentController');
const { protect, authorize } = require('../middleware/authMiddleware');

/* All routes require login */
router.use(protect);

/* GET  /api/students         — get all students (with filters) */
router.get('/',          ctrl.getStudents);

/* GET  /api/students/stats   — get stats */
router.get('/stats',     ctrl.getStats);

/* GET  /api/students/:id     — get one student */
router.get('/:id',       ctrl.getStudent);

/* POST /api/students         — create student */
router.post('/',         authorize('admin','superadmin'), ctrl.createStudent);

/* POST /api/students/bulk-import — bulk import */
router.post('/bulk-import', authorize('admin','superadmin'), ctrl.bulkImport);

/* PUT  /api/students/:id     — update student */
router.put('/:id',       authorize('admin','superadmin'), ctrl.updateStudent);

/* DELETE /api/students/:id   — delete student */
router.delete('/:id',    authorize('admin','superadmin'), ctrl.deleteStudent);

module.exports = router;