/* Write short study notes for the sub-strands of a design with Gemini.
   Run on your own computer (needs GEMINI_API_KEY in .env):

     node generateNotes.js <designKey> [subStrandId] [--upload]

   Without --upload the notes are only saved as text files in
   generated-notes/<designKey>/ for you to READ and correct.
   After you are happy, run the same command with --upload and they
   go to your storage bucket (STORAGE_*), where the lessons use them. */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const designs = require('./data/curriculum');
const { getGemini } = require('./utils/gemini');
const { getObjectStore } = require('./utils/objectStore');
const { writeNotes } = require('./utils/notesWriter');
const { DESIGN_KEY, SUB_ID } = require('./utils/contentStore');

(async () => {
  const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const upload = process.argv.includes('--upload');
  const [key, only] = args;

  const design = designs[key];
  if (!DESIGN_KEY.test(key || '') || !design || (only && !SUB_ID.test(only))) {
    console.error('Usage: node generateNotes.js <designKey> [subStrandId] [--upload]');
    console.error('Designs: ' + Object.keys(designs).join(', '));
    process.exit(1);
  }

  const dir = path.join(__dirname, 'generated-notes', key);
  fs.mkdirSync(dir, { recursive: true });
  const subs = design.strands.flatMap((s) => s.sub_strands).filter((s) => !only || s.id === only);
  if (!subs.length) { console.error('No such sub-strand.'); process.exit(1); }

  const store = upload ? getObjectStore() : null;
  if (upload && !store) { console.error('Storage settings are missing (STORAGE_*).'); process.exit(1); }

  const ai = upload ? null : getGemini();
  if (!upload && !ai) { console.error('GEMINI_API_KEY is not set.'); process.exit(1); }

  for (const sub of subs) {
    const file = path.join(dir, `${sub.id}.txt`);

    if (upload) {
      /* Upload what you reviewed, not a fresh write */
      if (!fs.existsSync(file)) { console.log(`Skipped ${sub.id}: no reviewed file yet.`); continue; }
      const text = fs.readFileSync(file, 'utf8').trim();
      await store.putJson(`notes/${key}/${sub.id}/generated.json`, {
        text, source: 'Written by Gemini from the KICD design and reviewed', added: new Date().toISOString(),
      });
      console.log(`Uploaded notes for ${sub.id} ${sub.name}`);
      continue;
    }

    process.stdout.write(`Writing ${sub.id} ${sub.name}… `);
    try {
      const text = await writeNotes({ ai, design, subStrandId: sub.id });
      if (!text) { console.log('nothing usable, try again'); continue; }
      fs.writeFileSync(file, text + '\n');
      console.log(`saved (${text.length} characters)`);
    } catch (err) {
      console.log('failed: ' + err.message);
    }
  }
  if (!upload) console.log(`\nRead and correct the files in ${dir}, then run again with --upload.`);
})().catch((e) => { console.error(e.message); process.exit(1); });
