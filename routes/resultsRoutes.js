const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/resultsController');
const { protect } = require('../middleware/authMiddleware');

router.use(protect);

/* GET /api/results/class?classId=&examId= */
router.get('/class', ctrl.getClassResults);

/* GET /api/results/student/:studentId */
router.get('/student/:studentId', ctrl.getStudentResults);

module.exports = router;