/* Read the notes you downloaded and share them out by sub-strand of each curriculum design.
   Run on your own computer. No AI, no quota.

     node importNotes.js grade8 --from "C:\\Users\\robin\\Desktop\\GRADE 8 NOTES"
     node importNotes.js grade8 --from "..." --only integrated-science
     node importNotes.js grade8 --from "..." --upload        (also send the result to storage)

   Each file is recognised by its name in data/notes-catalog/<grade>.json. The result for a subject
   is written to data/notes-extracted/<designKey>.json and, with --upload, to storage as
   notes/<designKey>.json (next to designs/<designKey>.json). Every sub-strand is rated:
     full = enough notes to build the lesson on,   thin = some notes, AI should expand,   none = AI writes from the design. */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const designs = require('./data/curriculum');
const { getObjectStore } = require('./utils/objectStore');
const { linesFromFile, looksRunTogether, splitBySubStrands } = require('./utils/notesReader');

const base = (u) => decodeURIComponent(String(u).split('/').pop()).toLowerCase();

(async () => {
  const args = process.argv.slice(2);
  const grab = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : null; };
  const from = grab('--from'); const only = grab('--only'); const upload = args.includes('--upload');
  const gradeKey = args.find((a, i) => !a.startsWith('--') && !['--from', '--only'].includes(args[i - 1]));
  const catalogFile = path.join(__dirname, 'data', 'notes-catalog', `${gradeKey}.json`);
  if (!gradeKey || !from || !fs.existsSync(catalogFile) || !fs.existsSync(from)) {
    console.error('Usage: node importNotes.js <grade> --from "<folder with the notes>" [--only subject] [--upload]');
    process.exit(1);
  }
  const catalog = JSON.parse(fs.readFileSync(catalogFile, 'utf8'));
  const store = upload ? getObjectStore() : null;
  if (upload && !store) { console.error('Storage settings are missing (STORAGE_*).'); process.exit(1); }

  const local = fs.readdirSync(from).filter((f) => !f.startsWith('~$'));
  const outDir = path.join(__dirname, 'data', 'notes-extracted');
  fs.mkdirSync(outDir, { recursive: true });

  for (const subject of catalog.subjects) {
    if (only && subject.slug !== only) continue;
    const design = designs[subject.designKey] || (store && await store.getJson(`designs/${subject.designKey}.json`).catch(() => null));
    const files = subject.notes.map((u) => local.find((f) => f.toLowerCase() === base(u))).filter(Boolean);
    if (!files.length) { console.log(`${subject.name}: no notes found in the folder, skipped`); continue; }
    if (!design) { console.log(`${subject.name}: no design ${subject.designKey} yet, skipped`); continue; }

    const subs = {};
    const used = [];
    for (const f of files) {
      try {
        const lines = await linesFromFile(path.join(from, f));
        const split = splitBySubStrands(lines, design);
        const runTogether = looksRunTogether(lines);
        used.push(f);
        if (runTogether) console.log(`  ! ${f}: words look run together, the text will need clean-up`);
        for (const [id, v] of Object.entries(split)) {
          const cur = subs[id] || { name: v.name, found: false, words: 0, sections: [], files: [] };
          if (v.found) {
            cur.found = true; cur.words += v.words;
            cur.sections.push(...v.sections.map((s) => ({ ...s, source: f })));
            cur.files.push(f);
          }
          subs[id] = cur;
        }
      } catch (e) { console.log(`  ! ${f}: ${e.message}`); }
    }
    for (const strand of design.strands) for (const sub of strand.sub_strands) {
      const cur = subs[sub.id] || { name: sub.name, found: false, words: 0, sections: [], files: [] };
      const per = sub.lessons ? cur.words / sub.lessons : cur.words;
      cur.lessons = sub.lessons;
      cur.coverage = per >= 35 ? 'full' : per >= 12 ? 'thin' : 'none';
      subs[sub.id] = cur;
    }
    const doc = { key: subject.designKey, grade: design.grade, learning_area: design.learning_area, built_at: new Date().toISOString(), files: used, sub_strands: subs };
    fs.writeFileSync(path.join(outDir, `${subject.designKey}.json`), JSON.stringify(doc));
    const counts = { full: 0, thin: 0, none: 0 };
    Object.values(subs).forEach((v) => { counts[v.coverage]++; });
    console.log(`${subject.name}: ${used.length} file(s); full ${counts.full}, thin ${counts.thin}, none ${counts.none}`);
    for (const [id, v] of Object.entries(subs)) console.log(`    ${id} ${v.name}: ${v.words} words, ${v.coverage}`);
    if (store) { await store.putJson(`notes/${subject.designKey}.json`, doc); console.log(`  Uploaded notes/${subject.designKey}.json`); }
  }
})().catch((e) => { console.error(e.message); process.exit(1); });
