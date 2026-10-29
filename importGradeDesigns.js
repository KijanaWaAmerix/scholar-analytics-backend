/* Import every curriculum design of a grade, one subject after another.
   Run on your own computer. No AI, no quota: the PDFs are read with plain code.

     node importGradeDesigns.js grade8                      (all subjects without a design yet)
     node importGradeDesigns.js grade8 --only english       (one subject)
     node importGradeDesigns.js grade8 --force              (read again, even if a design exists)
     node importGradeDesigns.js grade8 --upload             (also send good designs to storage)

   For each subject it uses, in this order:
     1. a PDF you saved as design-pdfs/<grade>-<subject>.pdf   (for example design-pdfs/grade8-english.pdf)
     2. the links listed in data/design-catalog/<grade>.json (first one that works)

   A design that passes every check is written to data/curriculum/ and the app picks it up.
   A design with problems is written to data/curriculum-review/ instead, so a broken one is
   never used by mistake. Fix it by hand, then move it to data/curriculum/.
   KICD designs are public documents. One download every 2.5 seconds. */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { designFromPdf } = require('./utils/designReader');
const { validateDesign } = require('./utils/designImporter');
const { getObjectStore } = require('./utils/objectStore');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; ScholarAnalytics-DesignImporter/1.0; personal project)',
  Accept: 'application/pdf,*/*',
};

const fetchPdf = async (url) => {
  const res = await fetch(url, { headers: HEADERS, redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.slice(0, 4).toString() !== '%PDF') throw new Error('not a PDF');
  return buffer;
};

(async () => {
  const args = process.argv.slice(2);
  const upload = args.includes('--upload');
  const force = args.includes('--force');
  const onlyAt = args.indexOf('--only');
  const only = onlyAt >= 0 ? args[onlyAt + 1] : null;
  const gradeKey = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--only');

  const catalogFile = path.join(__dirname, 'data', 'design-catalog', `${gradeKey}.json`);
  if (!gradeKey || !fs.existsSync(catalogFile)) {
    const have = fs.readdirSync(path.join(__dirname, 'data', 'design-catalog')).map((f) => f.replace(/\.json$/, ''));
    console.error('Usage: node importGradeDesigns.js <grade> [--only subject] [--force] [--upload]');
    console.error('Grades with a list: ' + have.join(', '));
    process.exit(1);
  }
  const catalog = JSON.parse(fs.readFileSync(catalogFile, 'utf8'));
  const store = upload ? getObjectStore() : null;
  if (upload && !store) { console.error('Storage settings are missing (STORAGE_*).'); process.exit(1); }

  const curriculumDir = path.join(__dirname, 'data', 'curriculum');
  const reviewDir = path.join(__dirname, 'data', 'curriculum-review');
  const pdfDir = path.join(__dirname, 'design-pdfs');
  fs.mkdirSync(reviewDir, { recursive: true });

  const exists = (key) =>
    fs.existsSync(path.join(curriculumDir, `${key}.json`)) ||
    (key === 'grade8-integrated-science' && fs.existsSync(path.join(curriculumDir, 'grade8-integrated-science-design-2024.json')));

  console.log(`\n=== ${catalog.label} designs ===`);
  const summary = [];

  for (const subject of catalog.subjects) {
    if (only && subject.slug !== only) continue;
    const key = `${catalog.grade}-${subject.slug}`;
    console.log(`\n--- ${subject.name} (${key}) ---`);

    if (exists(key) && !force) {
      console.log('  already have it (use --force to read it again)');
      summary.push([subject.name, 'already have', '']);
      continue;
    }

    /* 1. a PDF saved by hand, 2. the links */
    let pdf = null;
    let where = '';
    const saved = path.join(pdfDir, `${key}.pdf`);
    if (fs.existsSync(saved)) { pdf = fs.readFileSync(saved); where = saved; console.log('  using your saved file'); }
    for (const url of pdf ? [] : subject.urls) {
      try {
        pdf = await fetchPdf(url);
        where = url;
        console.log('  downloaded ' + url.split('/').pop());
        break;
      } catch (err) {
        console.log(`  not available: ${url.split('/').pop()} (${err.message})`);
      }
      await sleep(2500);
    }
    if (!pdf) {
      console.log(`  no PDF found. Open ${catalog.page}, save the ${subject.name} design as design-pdfs/${key}.pdf and run again.`);
      summary.push([subject.name, 'no PDF', 'save it as design-pdfs/' + key + '.pdf']);
      continue;
    }

    try {
      const read = await designFromPdf(pdf, {
        source: `KICD Junior School Curriculum Design (${path.basename(where)})`,
        lessonsPerWeek: subject.lessonsPerWeek,
      });
      const { design } = read;
      const problems = [...read.problems, ...validateDesign(design)];
      if (design.grade !== Number(String(catalog.grade).replace(/\D/g, ''))) {
        problems.push(`The PDF says grade ${design.grade}, expected ${catalog.grade}. Is it the right file?`);
      }

      /* Make sure it is the right subject: the cover's learning area should start like the name */
      const word = subject.name.toLowerCase().replace(/[^a-z ]/g, '').split(' ')[0].slice(0, 5);
      if (!String(design.learning_area).toLowerCase().replace(/[^a-z]/g, '').includes(word)) {
        problems.push(`The cover says "${design.learning_area}" but this should be ${subject.name}. Is it the right file?`);
      }

      read.notes.forEach((n) => console.log('  note: ' + n));
      const counts = design.strands.flatMap((s) => s.sub_strands);
      console.log(`  ${design.learning_area}, Grade ${design.grade}: ${design.strands.length} strands, ${counts.length} sub-strands, ${design.total_suggested_lessons} lessons`);

      if (problems.length) {
        const file = path.join(reviewDir, `${key}.json`);
        fs.writeFileSync(file, JSON.stringify(design, null, 2) + '\n');
        console.log('  NEEDS A LOOK, written to data/curriculum-review/ (not used by the app):');
        problems.forEach((p) => console.log('   - ' + p));
        summary.push([subject.name, 'needs a look', `${problems.length} problem(s), see data/curriculum-review/${key}.json`]);
      } else {
        fs.writeFileSync(path.join(curriculumDir, `${key}.json`), JSON.stringify(design, null, 2) + '\n');
        console.log(`  OK, written to data/curriculum/${key}.json`);
        if (upload) { await store.putJson(`designs/${key}.json`, design); console.log(`  uploaded designs/${key}.json`); }
        summary.push([subject.name, upload ? 'done and uploaded' : 'done', `${counts.length} sub-strands`]);
      }
    } catch (err) {
      console.log('  failed: ' + err.message);
      summary.push([subject.name, 'failed', err.message]);
    }
    await sleep(2500);
  }

  console.log('\nSummary');
  summary.forEach((r) => console.log('  ' + r.filter(Boolean).join(' | ')));
  console.log('\nRead each new design once against its PDF. Learning resources (appendix) are not copied.');
})().catch((e) => { console.error(e.message); process.exit(1); });
