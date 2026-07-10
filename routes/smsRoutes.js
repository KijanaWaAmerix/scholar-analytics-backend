const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/smsController');
const { protect } = require('../middleware/authMiddleware');

const authorize = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return res.status(403).json({ success:false, message:'Not authorized.' });
  }
  next();
};

router.use(protect);
router.use(authorize('admin','superadmin'));

router.post('/test',           ctrl.sendTest);
router.post('/notify-at-risk', ctrl.notifyAtRisk);
router.post('/notify-results', ctrl.notifyResults);

module.exports = router;