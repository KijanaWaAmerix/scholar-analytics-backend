/* Import the notes for a whole grade, one subject after another.
   Run on your own computer (needs STORAGE_* in .env for --upload):

     node importGradeNotes.js grade8                       (look only: writes to imported-notes/)
     node importGradeNotes.js grade8 --upload              (send to storage)
     node importGradeNotes.js grade8 --only cre --upload   (one subject)
     node importGradeNotes.js --status                     (which subjects have a design and notes)

   Layout in storage (everything for a subject lives under its design key,
   which is <grade>-<subject>, for example grade8-integrated-science):
     designs/<key>.json
     notes/<key>/<sub-strand>/<id>.json
     content/<key>/...    bank/<key>/...

   A subject is skipped, with a clear line, until its design exists.
   The documents come from data/notes-catalog/<grade>.json: you choose the
   documents there, nothing is crawled. One download every 2.5 seconds.
   Use only documents you are happy to use for this project; ask the owners
   for permission before the app is ever sold. */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const localDesigns = require('./data/curriculum');
const { getObjectStore } = require('./utils/objectStore');
const { splitIntoSections } = require('./utils/notesImporter');
const { readNotesBuffer } = require('./utils/readNotesFile');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const download = async (url) => {
  const res = await fetch(url, { headers: { 'User-Agent': 'ScholarAnalytics-NotesImporter/1.0 (personal project)' } });
  if (!res.ok) throw new Error(`Could not download (${res.status}).`);
  return Buffer.from(await res.arrayBuffer());
};

const loadDesign = async (key, store) => {
  if (store) {
    const stored = await store.getJson(`designs/${key}.json`).catch(() => null);
    if (stored) return stored;
  }
  return localDesigns[key] || null;
};

/** Count notes already in storage for each sub-strand of a design */
const countStored = async (key, design, store) => {
  const subs = design.strands.flatMap((s) => s.sub_strands);
  const rows = [];
  for (const s of subs) {
    const keys = store ? await store.list(`notes/${key}/${s.id}/`, 50).catch(() => []) : [];
    rows.push({ id: s.id, name: s.name, count: keys.length });
  }
  return rows;
};

(async () => {
  const args = process.argv.slice(2);
  const upload = args.includes('--upload');
  const status = args.includes('--status');
  const onlyIdx = args.indexOf('--only');
  const only = onlyIdx >= 0 ? args[onlyIdx + 1] : null;
  const gradeKey = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--only');

  const catalogDir = path.join(__dirname, 'data', 'notes-catalog');
  const grades = fs.readdirSync(catalogDir).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, ''));
  const wanted = status && !gradeKey ? grades : [gradeKey];
  if (wanted.some((g) => !grades.includes(g))) {
    console.error('Usage: node importGradeNotes.js <grade> [--only subject] [--upload]   or   --status');
    console.error('Grades with a notes list: ' + grades.join(', '));
    process.exit(1);
  }

  const store = getObjectStore();
  if ((upload || status) && !store) { console.error('Storage settings are missing (STORAGE_*).'); process.exit(1); }

  for (const g of wanted) {
    const catalog = JSON.parse(fs.readFileSync(path.join(catalogDir, `${g}.json`), 'utf8'));
    console.log(`\n=== ${catalog.label} ===`);
    const summary = [];

    for (const subject of catalog.subjects) {
      if (only && subject.slug !== only) continue;
      const design = await loadDesign(subject.designKey, store);
      console.log(`\n--- ${subject.name} (${subject.designKey}) ---`);

      if (!design) {
        console.log(`  no design yet. Import the KICD design first (node importDesign.js ...).`);
        summary.push([subject.name, 'no design', subject.notes.length + ' documents waiting', '']);
        continue;
      }

      if (status) {
        const rows = await countStored(subject.designKey, design, store);
        const covered = rows.filter((r) => r.count > 0).length;
        console.log(`  design ok, notes for ${covered} of ${rows.length} sub-strands`);
        rows.filter((r) => r.count === 0).forEach((r) => console.log(`    no notes: ${r.id} ${r.name}`));
        summary.push([subject.name, 'design ok', `${covered}/${rows.length} sub-strands have notes`, '']);
        continue;
      }

      const outDir = path.join(__dirname, 'imported-notes', subject.designKey);
      fs.mkdirSync(outDir, { recursive: true });
      const found = new Set();
      let read = 0;
      let failed = 0;

      for (let i = 0; i < subject.notes.length; i += 1) {
        const url = subject.notes[i];
        console.log(`  ${decodeURIComponent(url.split('/').pop())}`);
        try {
          const text = await readNotesBuffer(await download(url), url);
          const { sections } = splitIntoSections(text, design);
          read += 1;
          for (const s of sections) {
            const id = crypto.createHash('sha1').update(s.text).digest('hex').slice(0, 12);
            if (upload) await store.putJson(`notes/${subject.designKey}/${s.id}/${id}.json`, { text: s.text, source: url, added: new Date().toISOString() });
            else fs.writeFileSync(path.join(outDir, `${s.id}-${id}.txt`), s.text + '\n');
            found.add(s.id);
          }
          console.log(`    ${sections.length} sub-strands: ${sections.map((s) => s.id).join(', ') || 'none'}`);
        } catch (err) {
          failed += 1;
          console.log('    failed: ' + err.message);
        }
        if (i + 1 < subject.notes.length) await sleep(2500);
      }

      const all = design.strands.flatMap((s) => s.sub_strands).map((s) => s.id);
      const missing = all.filter((id) => !found.has(id));
      summary.push([subject.name, upload ? 'uploaded' : 'checked', `${read} read, ${failed} failed`, missing.length ? 'no notes for ' + missing.join(', ') : 'all sub-strands covered']);
    }

    console.log('\nSummary');
    summary.forEach((r) => console.log('  ' + r.filter(Boolean).join(' | ')));
  }
  if (!upload && !status) console.log('\nRead the files in imported-notes/. Then run again with --upload.');
})().catch((e) => { console.error(e.message); process.exit(1); });
