/* Find and download notes documents from a website, politely.
   Run on your own computer:

     node crawlNotes.js <start page> <word> [word...] [--max 20] [--import <designKey>]

   Example:
     node crawlNotes.js https://teacher.co.ke/ grade-8 integrated-science notes --import grade8-integrated-science

   It visits at most 15 pages, waits between requests, obeys robots.txt, stays on
   that website and keeps only Word (.docx) or text links containing ALL the words.
   Files are saved in downloaded-notes/. With --import <designKey> each file is then
   split into sub-strands (same as importNotes.js, review files first, then --upload).
   Old .doc files are listed but not downloaded: save them as .docx yourself. */
const fs = require('fs');
const path = require('path');
const { crawl } = require('./utils/crawler');

(async () => {
  const argv = process.argv.slice(2);
  const take = (flag) => { const i = argv.indexOf(flag); if (i === -1) return null; const v = argv[i + 1]; argv.splice(i, 2); return v; };
  const max = Number(take('--max')) || 20;
  const designKey = take('--import');
  const [start, ...words] = argv.filter((a) => !a.startsWith('--'));

  if (!start || !words.length) {
    console.error('Usage: node crawlNotes.js <start page> <word> [word...] [--max 20] [--import <designKey>]');
    process.exit(1);
  }

  const { files, pages, skipped } = await crawl({ start, match: words, maxFiles: max, log: (m) => console.log(m) });
  console.log(`\n${pages} pages visited, ${files.length} matching documents found.`);
  skipped.slice(0, 5).forEach((s) => console.log('  skipped: ' + s));
  if (!files.length) { console.log('Try other words, or start from the page that lists the notes.'); return; }

  const dir = path.join(__dirname, 'downloaded-notes');
  fs.mkdirSync(dir, { recursive: true });
  const saved = [];
  for (const f of files) {
    const name = decodeURIComponent(new URL(f.url).pathname.split('/').pop());
    const file = path.join(dir, name);
    try {
      const res = await fetch(f.url, { headers: { 'User-Agent': 'ScholarAnalytics-NotesImporter/1.0 (personal project)' } });
      if (!res.ok) throw new Error(String(res.status));
      fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
      saved.push(file);
      console.log('  saved ' + name);
    } catch (err) {
      console.log(`  failed ${name}: ${err.message}`);
    }
    await new Promise((r) => setTimeout(r, 2500));
  }

  if (designKey && saved.length) {
    console.log('\nSplitting into sub-strands…');
    require('child_process').spawnSync(process.execPath, [path.join(__dirname, 'importNotes.js'), designKey, ...saved], { stdio: 'inherit' });
  } else if (saved.length) {
    console.log(`\nNext: node importNotes.js <designKey> ${path.join('downloaded-notes', '*.docx')}`);
  }
})().catch((e) => { console.error(e.message); process.exit(1); });
