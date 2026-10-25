/* ═══════════════════════════════════════════════════════════
   SCHOLAR ANALYTICS — Curriculum design registry
   File: backend/data/curriculum/index.js

   One entry per KICD curriculum design that has been captured as
   structured data. To add a subject, drop its JSON in this folder
   and add a line below. The key is what the frontend sends.
═══════════════════════════════════════════════════════════ */

const designs = {
  'grade8-integrated-science': require('./grade8-integrated-science-design-2024.json'),
};

module.exports = designs;
