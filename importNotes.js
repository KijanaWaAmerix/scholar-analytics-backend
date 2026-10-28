/* Add notes from Word (.docx) or text files to your notes storage.
   Run on your own computer (needs STORAGE_* in .env for --upload):

     node importNotes.js <designKey> <file or https link> [more files or links...] [--upload]
     node importNotes.js <designKey> --list links.txt [--upload]     (links from listLinks.js)

   Example:
     node importNotes.js grade8-integrated-science GRADE-8-INTEGRATED-SCIENCE-NOTES2024.docx

   The file is split into one piece for each sub-strand, found by its heading.
   Without --upload the pieces are only written to imported-notes/<designKey>/
   so you can read them. Run again with --upload to send them to storage.

   Rules this tool follows:
   - You choose each document. It does not crawl a website.
   - Links are downloaded one at a time, with a pause, and the source is saved with the notes.
   - The notes are only reference for Gemini. They are never shown to learners as they are.
   - Word (.docx and .doc), PDF (with real text) and .txt files can be read.
   - Only use documents you are happy to use for this project. If the app is ever sold
     to schools, get permission from the owners of the notes first. */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const designs = require('./data/curriculum');
const { getObjectStore } = require('./utils/objectStore');
const { splitIntoSections } = require('./utils/notesImporter');
const { readNotesBuffer } = require('./utils/readNotesFile');
const { DESIGN_KEY } = require('./utils/contentStore');

const readText = async (input) => {
  let buffer;
  let name = input;
  if (/^https:\/\//i.test(input)) {
    const res = await fetch(input, { headers: { 'User-Agent': 'ScholarAnalytics-NotesImporter/1.0 (personal project)' } });
    if (!res.ok) throw new Error(`Could not download (${res.status}).`);
    buffer = Buffer.from(await res.arrayBuffer());
    name = decodeURIComponent(new URL(input).pathname.split('/').pop() || input);
  } else {
    buffer = fs.readFileSync(input);
  }

  return readNotesBuffer(buffer, name);
};

(async () => {
  const upload = process.argv.includes('--upload');
  const listIdx = process.argv.indexOf('--list');
  const listFile = listIdx >= 0 ? process.argv[listIdx + 1] : null;
  const [key, ...given] = process.argv.slice(2).filter((a) => !a.startsWith('--') && a !== listFile);
  let inputs = given;
  if (listFile) {
    /* At most 40 documents in one run, one link per line */
    inputs = fs.readFileSync(listFile, 'utf8').split(/\r?\n/).map((l) => l.trim()).filter((l) => /^https:\/\//i.test(l)).slice(0, 40);
  }
  const design = designs[key];
  if (!DESIGN_KEY.test(key || '') || !design || !inputs.length) {
    console.error('Usage: node importNotes.js <designKey> <file or https link> [more...] [--upload]');
    console.error('   or: node importNotes.js <designKey> --list links.txt [--upload]');
    console.error('Designs: ' + Object.keys(designs).join(', '));
    process.exit(1);
  }
  const store = upload ? getObjectStore() : null;
  if (upload && !store) { console.error('Storage settings are missing (STORAGE_*).'); process.exit(1); }

  const outDir = path.join(__dirname, 'imported-notes', key);
  fs.mkdirSync(outDir, { recursive: true });

  for (let i = 0; i < inputs.length; i += 1) {
    const input = inputs[i];
    console.log(`\n${input}`);
    try {
      const text = await readText(input);
      const { sections, missing } = splitIntoSections(text, design);
      console.log(`  ${text.length} characters read, ${sections.length} sub-strands found`);

      for (const s of sections) {
        const id = crypto.createHash('sha1').update(s.text).digest('hex').slice(0, 12);
        const file = path.join(outDir, `${s.id}-${id}.txt`);
        if (upload) {
          await store.putJson(`notes/${key}/${s.id}/${id}.json`, { text: s.text, source: input, added: new Date().toISOString() });
          console.log(`  uploaded ${s.id} ${s.name} (${s.text.length} characters)`);
        } else {
          fs.writeFileSync(file, s.text + '\n');
          console.log(`  saved ${s.id} ${s.name} (${s.text.length} characters)`);
        }
      }
      if (missing.length) console.log(`  not found in this file: ${missing.join(', ')}`);
    } catch (err) {
      console.log('  failed: ' + err.message);
    }
    if (i + 1 < inputs.length && /^https:/i.test(inputs[i + 1])) await new Promise((r) => setTimeout(r, 2500));
  }
  if (!upload) console.log(`\nRead the files in ${outDir}. Then run again with --upload to send them to storage.`);
})().catch((e) => { console.error(e.message); process.exit(1); });
