/* ═══════════════════════════════════════════════════════════
   SCHOLAR ANALYTICS — School User Routes (Admin)
   File: backend/routes/userRoutes.js
   Mounted in server.js as:  app.use('/api/users', ...)
═══════════════════════════════════════════════════════════ */

const express = require('express');
const router  = express.Router();

const {
  getSchoolUsers,
  createTeacher,
  updateTeacher,
  toggleTeacher,
  resetTeacherPassword,
} = require('../controllers/userController');

const { protect, checkSchool } = require('../middleware/authMiddleware');
const { authorize }            = require('../middleware/roleMiddleware');

/* School admins only. (The SuperAdmin has their own panel and no
   school of their own, so they are deliberately not allowed here.) */
router.use(protect, checkSchool, authorize('admin'));

router.get ('/',                      getSchoolUsers);
router.post('/teachers',              createTeacher);
router.put ('/:id',                   updateTeacher);
router.patch('/:id/toggle',           toggleTeacher);
router.post('/:id/reset-password',    resetTeacherPassword);

module.exports = router;