/**
 * Download the notes listed in data/notes-catalog/<grade>.json into folders on your Desktop,
 * one folder per subject.
 *
 *   node downloadNotes.js grade8
 *   node downloadNotes.js grade8 --only agriculture-and-nutrition
 *   node downloadNotes.js grade8 --to "D:\notes"
 *
 * Files already downloaded are skipped. If the site refuses a file, the list at the end shows
 * the links to open in your browser (save them into the same subject folder).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const args = process.argv.slice(2);
const grade = args.find((a) => !a.startsWith('--')) || 'grade8';
const flag = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const only = flag('--only');
const root = flag('--to') || path.join(os.homedir(), 'Desktop', `${grade.replace('grade', 'grade ')} notes`);

const catalogFile = path.join(__dirname, 'data', 'notes-catalog', `${grade}.json`);
if (!fs.existsSync(catalogFile)) { console.error(`No list found at ${catalogFile}`); process.exit(1); }
const catalog = JSON.parse(fs.readFileSync(catalogFile, 'utf8'));

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  Accept: '*/*',
  Referer: catalog.source || 'https://teacher.co.ke/',
};

(async () => {
  const failed = [];
  let got = 0;
  let had = 0;
  for (const subject of catalog.subjects) {
    if (only && subject.slug !== only) continue;
    if (!subject.notes.length) continue;
    const dir = path.join(root, subject.name.replace(/[\\/:*?"<>|]/g, ' '));
    fs.mkdirSync(dir, { recursive: true });
    console.log(`\n${subject.name} (${subject.notes.length} file${subject.notes.length === 1 ? '' : 's'})`);
    for (const url of subject.notes) {
      const name = decodeURIComponent(url.split('/').pop()).replace('TEACHER.CO_.KE_', 'TEACHER.CO.KE');
      const file = path.join(dir, name);
      if (fs.existsSync(file) && fs.statSync(file).size > 1000) { console.log(`  already have ${name}`); had += 1; continue; }
      try {
        const res = await fetch(url, { headers: HEADERS, redirect: 'follow' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length < 1000) throw new Error('the file came back empty');
        fs.writeFileSync(file, buf);
        got += 1;
        console.log(`  saved ${name} (${Math.round(buf.length / 1024)} KB)`);
      } catch (e) {
        console.log(`  could not get ${name}: ${e.message}`);
        failed.push({ subject: subject.name, url });
      }
    }
  }
  console.log(`\nDone. ${got} downloaded, ${had} already there, ${failed.length} failed.`);
  console.log(`Folder: ${root}`);
  if (failed.length) {
    console.log('\nOpen these in your browser and save each into its subject folder:');
    failed.forEach((f) => console.log(`  [${f.subject}] ${f.url}`));
  }
})();
