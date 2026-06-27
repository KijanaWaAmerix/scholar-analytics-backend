const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/analyticsController');
const { protect } = require('../middleware/authMiddleware');

router.use(protect);

router.get('/overview',            ctrl.getOverview);
router.get('/class-comparison',    ctrl.getClassComparison);
router.get('/trend',               ctrl.getTrend);
router.get('/subject-performance', ctrl.getSubjectPerformance);
router.get('/grade-distribution',  ctrl.getGradeDistribution);
router.get('/at-risk',             ctrl.getAtRisk);

module.exports = router;