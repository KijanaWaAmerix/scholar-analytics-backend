const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/superAdminController');
const { protect, authorize } = require('../middleware/authMiddleware');

router.use(protect);
router.use(authorize('superadmin'));

router.get('/dashboard',              ctrl.getDashboard);

router.get('/schools',                ctrl.getSchools);
router.post('/schools',               ctrl.createSchool);
router.get('/schools/:id',            ctrl.getSchool);
router.put('/schools/:id',            ctrl.updateSchool);
router.patch('/schools/:id/lock',     ctrl.lockSchool);
router.patch('/schools/:id/unlock',   ctrl.unlockSchool);
router.patch('/schools/:id/extend',   ctrl.extendSubscription);
router.post('/schools/:id/reset-admin', ctrl.resetAdminPassword);

router.get('/users',                  ctrl.getAllUsers);
router.patch('/users/:id/toggle',     ctrl.toggleUser);

router.post('/auto-lock-expired',     ctrl.autoLockExpired);

module.exports = router;