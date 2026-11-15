/* Show the header rows of table pages that the reader could not recognise.
     node inspectHeaders.js "<path to the PDF>"
   Prints, for every page that looks like it starts a table but has no readable header, the pieces of text in the top of the page. */
const fs = require('fs');
const { extractPages, findHeader, lineify } = require('./utils/designReader');

(async () => {
  const file = process.argv[2];
  if (!file || !fs.existsSync(file)) { console.error('Usage: node inspectHeaders.js "<PDF>"'); process.exit(1); }
  const pages = await extractPages(fs.readFileSync(file));
  pages.forEach((items, i) => {
    const text = items.map((t) => t.s).join(' ');
    if (!/Specific|Experiences|Inquiry/i.test(text)) return;
    if (findHeader(items)) return;
    const lines = lineify(items.filter((t) => t.y >= 60));
    console.log(`\n=== page ${i + 1}: header not recognised ===`);
    lines.slice(0, 9).forEach((ln) => console.log(`y=${Math.round(ln.y)}: ` + ln.items.map((t) => `[${Math.round(t.x)}] ${String(t.s).trim()}`).join('  ')));
  });
})().catch((e) => { console.error(e.message); process.exit(1); });
