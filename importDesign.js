/* Turn a KICD curriculum design PDF into the app's design file.
   Run on your own computer (needs GEMINI_API_KEY in .env):

     node importDesign.js <pdf file or https link> <designKey> <lessonsPerWeek> [--upload]

   Example:
     node importDesign.js Integrated-Science-Grade-8-Design-Formatted-April-2024.pdf grade8-integrated-science 5

   It writes data/curriculum/<designKey>.json for you to READ and correct,
   then add one line for it in data/curriculum/index.js.
   With --upload it also puts the file in your storage bucket (STORAGE_*).
   Only use documents you are allowed to use (KICD designs are public). */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { getGemini } = require('./utils/gemini');
const { getObjectStore } = require('./utils/objectStore');
const { importDesign } = require('./utils/designImporter');
const { DESIGN_KEY } = require('./utils/contentStore');

(async () => {
  const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const upload = process.argv.includes('--upload');
  const [input, key, perWeekText] = args;
  const perWeek = Number(perWeekText);

  if (!input || !DESIGN_KEY.test(key || '') || !Number.isInteger(perWeek)) {
    console.error('Usage: node importDesign.js <pdf file or https link> <designKey> <lessonsPerWeek> [--upload]');
    process.exit(1);
  }
  const ai = getGemini();
  if (!ai) { console.error('GEMINI_API_KEY is not set.'); process.exit(1); }

  let pdf;
  if (/^https:\/\//i.test(input)) {
    const res = await fetch(input);
    if (!res.ok) throw new Error(`Could not download the file (${res.status}).`);
    pdf = Buffer.from(await res.arrayBuffer());
  } else {
    pdf = fs.readFileSync(input);
  }

  const { design, problems } = await importDesign({
    ai, pdf, lessonsPerWeek: perWeek,
    source: `KICD Junior School Curriculum Design (${path.basename(input)})`,
    onProgress: (m) => console.log(m),
  });

  const out = path.join(__dirname, 'data', 'curriculum', `${key}.json`);
  fs.writeFileSync(out, JSON.stringify(design, null, 2) + '\n');
  console.log(`\nWritten: ${out}`);
  console.log(`${design.learning_area}, Grade ${design.grade}: ${design.strands.length} strands, ${design.total_suggested_lessons} lessons`);

  if (problems.length) {
    console.log('\nPlease check these before using the file:');
    problems.forEach((p) => console.log(' - ' + p));
  } else {
    console.log('All checks passed. Still read the file once against the PDF.');
  }

  if (upload) {
    const store = getObjectStore();
    if (!store) { console.error('Storage settings are missing, nothing uploaded.'); process.exit(1); }
    if (problems.length) { console.error('Not uploaded, because of the problems above.'); process.exit(1); }
    await store.putJson(`designs/${key}.json`, design);
    console.log(`Uploaded designs/${key}.json`);
  }
})().catch((e) => { console.error(e.message); process.exit(1); });
