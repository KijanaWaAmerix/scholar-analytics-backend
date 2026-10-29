/* Turn a KICD curriculum design PDF into the app's design file.
   Run on your own computer. It reads the PDF with plain code: no AI, no quota, no cost.

     node importDesign.js <pdf file or https link> <designKey> <lessonsPerWeek> [--upload]
     node importDesign.js <pdf file or https link> <designKey> <lessonsPerWeek> --ai
                                   (--ai asks Gemini to read the PDF instead; needs GEMINI_API_KEY)

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
const { importDesign, validateDesign } = require('./utils/designImporter');
const { designFromPdf } = require('./utils/designReader');
const { DESIGN_KEY } = require('./utils/contentStore');

(async () => {
  const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const upload = process.argv.includes('--upload');
  const [input, key, perWeekText] = args;
  const perWeek = Number(perWeekText);

  if (!input || !DESIGN_KEY.test(key || '') || !Number.isInteger(perWeek)) {
    console.error('Usage: node importDesign.js <pdf file or https link> <designKey> <lessonsPerWeek> [--upload] [--ai]');
    process.exit(1);
  }
  const useAi = process.argv.includes('--ai');
  const ai = useAi ? getGemini() : null;
  if (useAi && !ai) { console.error('GEMINI_API_KEY is not set.'); process.exit(1); }

  let pdf;
  if (/^https:\/\//i.test(input)) {
    const res = await fetch(input, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ScholarAnalytics-DesignImporter/1.0; personal project)',
        Accept: 'application/pdf,*/*',
      },
      redirect: 'follow',
    });
    if (!res.ok) {
      throw new Error(`Could not download the file (${res.status}). If the link opens in your browser, save the PDF into this folder and run the command with the file name instead of the link.`);
    }
    pdf = Buffer.from(await res.arrayBuffer());
  } else {
    pdf = fs.readFileSync(input);
  }

  let design;
  let problems;
  let notes = [];
  const source = `KICD Junior School Curriculum Design (${path.basename(input)})`;

  if (useAi) {
    ({ design, problems } = await importDesign({
      ai, pdf, lessonsPerWeek: perWeek, source, onProgress: (m) => console.log(m),
    }));
  } else {
    console.log('Reading the PDF with code (no AI)...');
    const read = await designFromPdf(pdf, { source, lessonsPerWeek: perWeek });
    design = read.design;
    problems = [...read.problems, ...validateDesign(design)];
    notes = [
      ...read.notes,
      'The appendix (assessment methods, learning resources, non-formal activities) is not copied by this reader. Add it by hand if you want it in the lessons.',
    ];
  }

  const out = path.join(__dirname, 'data', 'curriculum', `${key}.json`);
  fs.writeFileSync(out, JSON.stringify(design, null, 2) + '\n');
  console.log(`\nWritten: ${out}`);
  console.log(`${design.learning_area}, Grade ${design.grade}: ${design.strands.length} strands, ${design.total_suggested_lessons} lessons`);

  if (notes.length) {
    console.log('\nGood to know:');
    notes.forEach((n) => console.log(' - ' + n));
  }
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
