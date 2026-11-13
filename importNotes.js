/* Read the notes you downloaded and share them out by sub-strand of each curriculum design.
   Run on your own computer. No AI, no quota.

     node importNotes.js grade8 --from "C:\\Users\\robin\\Desktop\\GRADE 8 NOTES"
     node importNotes.js grade8 --from "..." --only integrated-science
     node importNotes.js grade8 --from "..." --upload        (also send the result to storage)

   Each file is recognised by its name in data/notes-catalog/<grade>.json. The result for a subject
   is written to data/notes-extracted/<designKey>.json and, with --upload, to storage as
   notes/<designKey>/<subId>/notes.json, where lesson plans, schemes and exams read them. Every sub-strand is rated:
     full = enough notes to build the lesson on,   thin = some notes, AI should expand,   none = AI writes from the design. */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const designs = require('./data/curriculum');
const { getObjectStore } = require('./utils/objectStore');
const { linesFromFile, looksRunTogether, splitBySubStrands, sectionsOf, relevantTo } = require('./utils/notesReader');
const { matchNotes } = require('./utils/lessonContent');

const base = (u) => decodeURIComponent(String(u).split('/').pop()).toLowerCase();

(async () => {
  const args = process.argv.slice(2);
  const grab = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : null; };
  const from = grab('--from'); const only = grab('--only'); const upload = args.includes('--upload'); const headingsOnly = args.includes('--headings-only');
  const gradeKey = args.find((a, i) => !a.startsWith('--') && !['--from', '--only'].includes(args[i - 1]));
  const catalogFile = path.join(__dirname, 'data', 'notes-catalog', `${gradeKey}.json`);
  if (!gradeKey || !from || !fs.existsSync(catalogFile) || !fs.existsSync(from)) {
    console.error('Usage: node importNotes.js <grade> --from "<folder with the notes>" [--only subject] [--headings-only] [--upload]');
    process.exit(1);
  }
  const catalog = JSON.parse(fs.readFileSync(catalogFile, 'utf8'));
  const store = upload ? getObjectStore() : null;
  if (upload && !store) { console.error('Storage settings are missing (STORAGE_*).'); process.exit(1); }

  const local = fs.readdirSync(from).filter((f) => !f.startsWith('~$'));
  const outDir = path.join(__dirname, 'data', 'notes-extracted');
  fs.mkdirSync(outDir, { recursive: true });

  const claimed = new Set();
  for (const subject of catalog.subjects) {
    if (only && subject.slug !== only) continue;
    const design = designs[subject.designKey] || (store && await store.getJson(`designs/${subject.designKey}.json`).catch(() => null));
    /* Files named in the catalog, plus any file in the folder whose name holds the subject's words */
    const KEYS = { 'integrated-science': ['integrated-science', 'integrated science'], mathematics: ['mathematics', 'maths', 'math-'], 'pre-technical': ['pre-technical', 'pre technical', 'pretechnical'], 'pre-technical-studies': ['pre-technical', 'pre technical', 'pretechnical'], 'agriculture-and-nutrition': ['agric'], 'creative-arts-and-sports': ['creative-arts', 'creative arts'], 'social-studies': ['social-studies', 'social studies'], agriculture: ['agric'], cre: ['c-r-e', '-cre-', ' cre '], 'creative-arts': ['creative-arts', 'creative arts'], english: ['english'], kiswahili: ['kiswahili'] };
    const keys = KEYS[subject.slug] || [subject.slug.replace(/-/g, ' '), subject.slug];
    const files = [...new Set([
      ...subject.notes.map((u) => local.find((f) => f.toLowerCase() === base(u))).filter(Boolean),
      ...local.filter((f) => /\.(pdf|docx?|txt)$/i.test(f) && keys.some((k) => f.toLowerCase().replace(/_/g, '-').includes(k))),
    ])];
    files.forEach((f) => claimed.add(f));
    if (!files.length) { console.log(`${subject.name}: no notes found in the folder, skipped`); continue; }
    if (!design) { console.log(`${subject.name}: no design ${subject.designKey} yet, skipped`); continue; }

    const subs = {};
    const used = [];
    const allText = [];
    let loose = false;
    for (const f of files) {
      try {
        const lines = await linesFromFile(path.join(from, f));
        let split = splitBySubStrands(lines, design);
        const runTogether = looksRunTogether(lines);
        /* If most sub-strand headings were not found, the notes are not laid out by sub-strand
           (English, Kiswahili...): do not trust the split, match by content instead. */
        const nSubs = design.strands.reduce((n, st) => n + st.sub_strands.length, 0);
        const nFound = Object.values(split).filter((v) => v.found).length;
        if (nFound < nSubs * 0.6) {
          console.log(`  - ${f}: only ${nFound} of ${nSubs} sub-strand headings found, matching by content instead`);
          split = Object.fromEntries(Object.entries(split).map(([id, v]) => [id, { ...v, found: false, words: 0, sections: [] }]));
        }
        /* the table of contents ("Nouns ........ 9") names every topic and would win every match: leave it out */
        allText.push(sectionsOf(lines.filter((l) => !/\.{4,}/.test(l))).map((sec) => [sec.heading, ...sec.text].filter(Boolean).join('\n')).join('\n\n'));
        if (runTogether) loose = true;
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
    const everything = allText.join('\n\n');
    for (const strand of design.strands) for (const sub of strand.sub_strands) {
      const cur = subs[sub.id] || { name: sub.name, found: false, words: 0, sections: [], files: [] };
      let per = sub.lessons ? cur.words / sub.lessons : cur.words;
      /* Thin or missing: look through all the notes of the subject for what matches this sub-strand */
      if (per < 35 && everything && !headingsOnly) {
        /* For notes that cover only some sub-strands the outcomes are too general ("use ... correctly") and
           pull in other chapters: search by the sub-strand's own name only */
        const query = subject.matchOnly ? sub.name : [sub.name, ...(sub.scope || []), ...(sub.outcomes || [])].join(' ');
        const m = matchNotes(everything, query, 6000, loose);
        const words = m.text.split(/\s+/).filter(Boolean).length;
        /* A notes file may cover only some kinds of sub-strands (an English "grammar notes" file):
           the catalog's matchOnly lists the words a sub-strand's name must contain to receive matched text */
        const allowed = !subject.matchOnly || subject.matchOnly.some((w) => sub.name.toLowerCase().includes(w));
        if (allowed && m.blocks && words > cur.words && relevantTo(m.text, sub)) {
          cur.sections = [{ heading: '', text: m.text.split('\n'), source: 'matched' }];
          cur.words = words; cur.matched = true; cur.found = true; cur.files = used.slice();
          per = sub.lessons ? words / sub.lessons : words;
        }
      }
      cur.lessons = sub.lessons;
      cur.coverage = per >= 35 ? 'full' : per >= 12 ? 'thin' : 'none';
      subs[sub.id] = cur;
    }
    const doc = { key: subject.designKey, grade: design.grade, learning_area: design.learning_area, built_at: new Date().toISOString(), files: used, sub_strands: subs };
    fs.writeFileSync(path.join(outDir, `${subject.designKey}.json`), JSON.stringify(doc));
    const counts = { full: 0, thin: 0, none: 0 };
    Object.values(subs).forEach((v) => { counts[v.coverage]++; });
    console.log(`${subject.name}: ${used.length} file(s); full ${counts.full}, thin ${counts.thin}, none ${counts.none}`);
    for (const [id, v] of Object.entries(subs)) console.log(`    ${id} ${v.name}: ${v.words} words, ${v.coverage}${v.matched ? ' (matched by content)' : ''}`);
    if (store) {
      /* The layout the app already reads: notes/<designKey>/<subId>/<file>.json holding { text }.
         Lesson plans, schemes and exams all pick the notes up from there. */
      /* Start clean: notes from an earlier import (possibly matched wrongly) must not stay behind
         for sub-strands that now have none. Everything is rebuilt from the folder just read. */
      await store.deletePrefix(`notes/${subject.designKey}/`);
      let n = 0;
      for (const [id, v] of Object.entries(subs)) {
        if (!v.sections.length) continue;
        const text = v.sections.map((sec) => [sec.heading, ...sec.text].filter(Boolean).join('\n')).join('\n\n');
        await store.putJson(`notes/${subject.designKey}/${id}/notes.json`, { text, words: v.words, coverage: v.coverage, files: v.files });
        n += 1;
      }
      await store.putJson(`notes/${subject.designKey}/coverage.json`, { built_at: doc.built_at, files: used, coverage: Object.fromEntries(Object.entries(subs).map(([id, v]) => [id, { name: v.name, words: v.words, coverage: v.coverage }])) });
      console.log(`  Uploaded notes for ${n} sub-strands to notes/${subject.designKey}/`);
    }
  }
  const left = local.filter((f) => /\.(pdf|docx?|txt)$/i.test(f) && !claimed.has(f));
  if (left.length && !only) console.log('\nFiles not matched to any subject (tell me and I will add them):\n  ' + left.join('\n  '));
})().catch((e) => { console.error(e.message); process.exit(1); });
