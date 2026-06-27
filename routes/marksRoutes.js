const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/marksController');
const { protect, authorize } = require('../middleware/authMiddleware');

router.use(protect);

/* GET  /api/marks/sheet          — get mark sheet */
router.get('/sheet',              ctrl.getMarkSheet);

/* GET  /api/marks/class          — get all marks for class+exam */
router.get('/class',              ctrl.getClassMarks);

/* POST /api/marks/bulk           — save bulk marks */
router.post('/bulk', authorize('admin','teacher','superadmin'), ctrl.bulkSaveMarks);

/* PATCH /api/marks/exam/:examId/toggle — open/close exam */
router.patch('/exam/:examId/toggle', authorize('admin','superadmin'), ctrl.toggleExam);

/* DELETE /api/marks/class        — delete class marks */
router.delete('/class', authorize('admin','superadmin'), ctrl.deleteClassMarks);

module.exports = router;