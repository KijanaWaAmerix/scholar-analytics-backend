const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/settingscontrollers');
const { protect } = require('../middleware/authMiddleware');

const authorize = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return res.status(403).json({ success:false, message:'Not authorized.' });
  }
  next();
};

router.use(protect);

router.get('/',         ctrl.getSettings);
router.put('/school',   ctrl.updateSchoolInfo);
router.put('/password', ctrl.changePassword);

module.exports = router;