/* Upload the curriculum designs in data/curriculum to storage.
   Run once from your computer (needs the STORAGE_* settings in .env):
     node uploadDesigns.js
   A design in storage replaces the one shipped with the code. */
require('dotenv').config();
const designs = require('./data/curriculum');
const { getObjectStore } = require('./utils/objectStore');

(async () => {
  const store = getObjectStore();
  if (!store) { console.error('Storage settings are missing (STORAGE_*).'); process.exit(1); }
  for (const [key, design] of Object.entries(designs)) {
    await store.putJson(`designs/${key}.json`, design);
    console.log('Uploaded designs/' + key + '.json');
  }
})().catch((e) => { console.error(e.message); process.exit(1); });
