/* Add a teacher's notes for one sub-strand to storage.
   Usage:
     node importNote.js <designKey> <subStrandId> <textFile> [sourceName]
   Example:
     node importNote.js grade8-integrated-science 1.1 atoms.txt "Teacher notes"
   Only add notes you have the right to use. */
require('dotenv').config();
const fs = require('fs');
const crypto = require('crypto');
const { getObjectStore } = require('./utils/objectStore');
const { DESIGN_KEY, SUB_ID, NOTES_MAX } = require('./utils/contentStore');

(async () => {
  const [designKey, subId, file, source = ''] = process.argv.slice(2);
  if (!DESIGN_KEY.test(designKey || '') || !SUB_ID.test(subId || '') || !file) {
    console.error('Usage: node importNote.js <designKey> <subStrandId> <textFile> [sourceName]');
    process.exit(1);
  }
  const store = getObjectStore();
  if (!store) { console.error('Storage settings are missing (STORAGE_*).'); process.exit(1); }

  const text = fs.readFileSync(file, 'utf8').replace(/\s+\n/g, '\n').trim().slice(0, NOTES_MAX);
  if (!text) { console.error('The file is empty.'); process.exit(1); }

  const id = crypto.createHash('sha1').update(text).digest('hex').slice(0, 12);
  await store.putJson(`notes/${designKey}/${subId}/${id}.json`, { text, source, added: new Date().toISOString() });
  console.log(`Saved notes/${designKey}/${subId}/${id}.json (${text.length} characters)`);
})().catch((e) => { console.error(e.message); process.exit(1); });
