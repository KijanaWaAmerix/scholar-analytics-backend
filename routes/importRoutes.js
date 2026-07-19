/* ═══════════════════════════════════════════════════════════
   SCHOLAR ANALYTICS — Marks Import Route
   File: backend/routes/importRoutes.js

   STANDALONE — new file, doesn't touch any existing route file.
   Register it in server.js/app.js with:
     app.use('/api/marks', require('./routes/importRoutes'));
═══════════════════════════════════════════════════════════ */

const express = require('express');
const multer  = require('multer');
const router  = express.Router();

const { importMarksFromExcel } = require('../controllers/importMarksController');
const { protect, authorize, checkSchool } = require('../middleware/authMiddleware');

/* Keep the file in memory — we parse it directly, never write to disk */
const upload = multer({
  storage : multer.memoryStorage(),
  limits  : { fileSize: 5 * 1024 * 1024 }, // 5MB cap
  fileFilter: (req, file, cb) => {
    const okTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
      'application/vnd.ms-excel', // .xls
    ];
    if (okTypes.includes(file.mimetype)) return cb(null, true);
    cb(new Error('Only .xlsx or .xls files are allowed.'));
  },
});

router.post(
  '/import-excel',
  protect,
  checkSchool,
  authorize('admin', 'teacher'),
  upload.single('file'),
  importMarksFromExcel
);

module.exports = router;