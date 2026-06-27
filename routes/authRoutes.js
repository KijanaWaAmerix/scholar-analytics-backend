/* ═══════════════════════════════════════════════════════════
   SCHOLAR ANALYTICS — Auth Routes
   File: backend/routes/authRoutes.js
═══════════════════════════════════════════════════════════ */

const express = require('express');
const router  = express.Router();

const {
  login,
  getMe,
  forgotPassword,
  resetPassword,
  setupAccount,
  updatePassword,
  updateProfile,
  logout,
} = require('../controllers/authController');

const { protect } = require('../middleware/authMiddleware');

/* ── Public routes (no token needed) ─────────────────────── */
router.post('/login',                    login);
router.post('/forgot-password',          forgotPassword);
router.post('/reset-password/:token',    resetPassword);
router.post('/setup-account/:token',     setupAccount);

/* ── Protected routes (token required) ───────────────────── */
router.get ('/me',                       protect, getMe);
router.put ('/update-password',          protect, updatePassword);
router.put ('/update-profile',           protect, updateProfile);
router.post('/logout',                   protect, logout);

module.exports = router;