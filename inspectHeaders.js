/* Show the header rows of table pages that the reader could not recognise.
     node inspectHeaders.js "<path to the PDF>"
   Prints, for every page that looks like it starts a table but has no readable header, the pieces of text in the top of the page. */
const fs = require('fs');
const { extractPages, findHeader } = require('./utils/designReader');

(async () => {
  const file = process.argv[2];
  if (!file || !fs.existsSync(file)) { console.error('Usage: node inspectHeaders.js "<PDF>"'); process.exit(1); }
  const pages = await extractPages(fs.readFileSync(file));
  pages.forEach((items, i) => {
    const text = items.map((t) => t.s).join(' ');
    if (!/Specific/i.test(text) || !/Suggested/i.test(text)) return;
    if (findHeader(items)) return;
    const rows = [];
    for (const it of items.filter((t) => t.y >= 60 && String(t.s).trim()).sort((a, b) => b.y - a.y || a.x - b.x)) {
      const row = rows.find((r) => Math.abs(r.y - it.y) <= 3);
      if (row) row.items.push(it); else rows.push({ y: it.y, items: [it] });
    }
    console.log(`\n=== page ${i + 1}: header not recognised ===`);
    rows.slice(0, 9).forEach((r) => console.log(`y=${Math.round(r.y)}: ` + r.items.sort((a, b) => a.x - b.x).map((t) => `[${Math.round(t.x)}] ${String(t.s).trim()}`).join('  ')));
  });
})().catch((e) => { console.error(e.message); process.exit(1); });
