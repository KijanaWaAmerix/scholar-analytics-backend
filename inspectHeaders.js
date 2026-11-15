/* Show the header rows of table pages that the reader could not recognise.
     node inspectHeaders.js "<path to the PDF>" [sw]      (add sw for a Kiswahili design)
     node inspectHeaders.js "<PDF>" --find "text on the page"     (print every row of the pages containing that text)
     node inspectHeaders.js "<PDF>" --pages 5-9                    (print every row of pages 5 to 9)
   Prints, for every page that looks like it starts a table but has no readable header, the pieces of text in the top of the page. */
const fs = require('fs');
const { extractPages, findHeader } = require('./utils/designReader');
const { LANG } = require('./utils/languageReader');

(async () => {
  const file = process.argv[2];
  if (!file || !fs.existsSync(file)) { console.error('Usage: node inspectHeaders.js "<PDF>"'); process.exit(1); }
  const sw = process.argv[3] === 'sw';
  const pats = sw ? LANG.sw.header : undefined;
  const findAt = process.argv.indexOf('--find');
  const find = findAt >= 0 ? process.argv[findAt + 1] : null;
  const pgAt = process.argv.indexOf('--pages');
  const [pFrom, pTo] = pgAt >= 0 ? String(process.argv[pgAt + 1]).split('-').map(Number) : [0, 0];
  const pages = await extractPages(fs.readFileSync(file));
  pages.forEach((items, i) => {
    const text = items.map((t) => t.s).join(' ');
    if (pFrom && (i + 1 < pFrom || i + 1 > (pTo || pFrom))) return;
    if (find || pFrom) {
      if (find && !text.toLowerCase().includes(find.toLowerCase())) return;
      console.log(`\n=== page ${i + 1}${find ? ` (contains "${find}")` : ''} ===`);
      const all = [];
      for (const it of items.filter((t) => String(t.s).trim()).sort((a, b) => b.y - a.y || a.x - b.x)) {
        const row = all.find((r) => Math.abs(r.y - it.y) <= 3);
        if (row) row.items.push(it); else all.push({ y: it.y, items: [it] });
      }
      all.forEach((r) => console.log(`y=${Math.round(r.y)}: ` + r.items.sort((a, b) => a.x - b.x).map((t) => `[${Math.round(t.x)}] ${String(t.s).trim()}`).join('  ').slice(0, 170)));
      return;
    }
    if (sw ? !(/Matokeo/i.test(text) && /Shughuli|Mapendekezo/i.test(text)) : !(/Specific/i.test(text) && /Suggested/i.test(text))) return;
    if (findHeader(items, pats)) return;
    const rows = [];
    for (const it of items.filter((t) => t.y >= 60 && String(t.s).trim()).sort((a, b) => b.y - a.y || a.x - b.x)) {
      const row = rows.find((r) => Math.abs(r.y - it.y) <= 3);
      if (row) row.items.push(it); else rows.push({ y: it.y, items: [it] });
    }
    console.log(`\n=== page ${i + 1}: header not recognised ===`);
    rows.slice(0, 9).forEach((r) => console.log(`y=${Math.round(r.y)}: ` + r.items.sort((a, b) => a.x - b.x).map((t) => `[${Math.round(t.x)}] ${String(t.s).trim()}`).join('  ')));
  });
})().catch((e) => { console.error(e.message); process.exit(1); });
