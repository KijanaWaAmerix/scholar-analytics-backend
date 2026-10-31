/**
 * Look inside a folder of notes (PDF, DOCX, DOC) and report what each file holds.
 *
 *   node inspectNotes.js "C:\Users\robin\Desktop\GRADE 8 NOTES\Integrated Science"
 *
 * Prints, per file: type, size, length, how many headings look like topics, and the
 * first lines. Also writes notes-sample.json (next to this script) with the first
 * 150 lines of every file, so it can be attached for the reader to be built against.
 * Nothing is uploaded or changed.
 */
const fs = require('fs');
const path = require('path');

const linesOf = (text) =>
  text.split(/\r?\n/).map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);

const read = async (file) => {
  const ext = path.extname(file).toLowerCase();
  if (ext === '.pdf') {
    const data = await require('pdf-parse')(fs.readFileSync(file));
    return { text: data.text, pages: data.numpages };
  }
  if (ext === '.docx') {
    const r = await require('mammoth').extractRawText({ path: file });
    return { text: r.value };
  }
  if (ext === '.doc') {
    const WordExtractor = require('word-extractor');
    const doc = await new WordExtractor().extract(file);
    return { text: doc.getBody() };
  }
  return null;
};

const main = async () => {
  const dir = process.argv[2];
  if (!dir || !fs.existsSync(dir)) {
    console.log('Give the notes folder, for example: node inspectNotes.js "C:\\Users\\robin\\Desktop\\GRADE 8 NOTES\\Integrated Science"');
    process.exit(1);
  }
  const files = fs.readdirSync(dir).filter((f) => /\.(pdf|docx?)$/i.test(f)).sort();
  if (!files.length) { console.log('No PDF, DOCX or DOC files found in that folder.'); return; }

  const sample = {};
  for (const f of files) {
    try {
      const r = await read(path.join(dir, f));
      const lines = linesOf(r.text || '');
      const headings = lines.filter((l) => /^(strand|sub[- ]?strand|topic|lesson|week|\d+\.\d+)\b/i.test(l)).length;
      console.log(`\n${f}\n  ${(fs.statSync(path.join(dir, f)).size / 1024).toFixed(0)} KB, ${r.pages ? r.pages + ' pages, ' : ''}${lines.length} lines, ${headings} heading-like lines`);
      lines.slice(0, 8).forEach((l) => console.log('   | ' + l.slice(0, 110)));
      sample[f] = { pages: r.pages || null, lines: lines.length, first: lines.slice(0, 150) };
    } catch (err) {
      console.log(`\n${f}\n  could not be read: ${err.message}`);
      sample[f] = { error: err.message };
    }
  }
  const out = path.join(__dirname, 'notes-sample.json');
  fs.writeFileSync(out, JSON.stringify(sample, null, 1));
  console.log(`\nSaved ${out}. Please attach that file here, and paste the output above.`);
};

main().catch((e) => { console.error(e.message); process.exit(1); });
