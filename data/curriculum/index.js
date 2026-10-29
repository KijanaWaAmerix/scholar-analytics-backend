/* ═══════════════════════════════════════════════════════════
   SCHOLAR ANALYTICS — Curriculum design registry
   File: backend/data/curriculum/index.js

   One entry per KICD curriculum design that has been captured as
   structured data. Any file named <grade>-<subject>.json in this folder
   is picked up by itself (for example grade8-mathematics.json becomes
   the design "grade8-mathematics"). The name is what the frontend sends.
═══════════════════════════════════════════════════════════ */

const fs = require('fs');
const path = require('path');

const designs = {
  /* The first design keeps its older file name */
  'grade8-integrated-science': require('./grade8-integrated-science-design-2024.json'),
};

for (const file of fs.readdirSync(__dirname).sort()) {
  const match = file.match(/^(grade\d{1,2}-[a-z0-9-]+)\.json$/);
  if (!match || file.endsWith('-design-2024.json')) continue;
  designs[match[1]] = JSON.parse(fs.readFileSync(path.join(__dirname, file), 'utf8'));
}

module.exports = designs;
