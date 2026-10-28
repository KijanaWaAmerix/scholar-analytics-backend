/* List the document links on ONE page, for importNotes.js to download.

     node listLinks.js <page link> [--match word,word] [--out links.txt]

   Example (notes for Grade 8 science found on a listing page):
     node listLinks.js https://teacher.co.ke/some-listing-page/ --match grade-8,science,notes

   - Only that one page is read. It checks the site's robots.txt first and stops if the page is not allowed.
   - Links are kept when their address contains all the words after --match.
   - The result is written to links.txt (one link per line). Open it, delete any line you do not want,
     then run:  node importNotes.js <designKey> --list links.txt */
const fs = require('fs');
const { parseLinks, robotsAllows } = require('./utils/linkCollector');

const UA = { 'User-Agent': 'ScholarAnalytics-NotesImporter/1.0 (personal project)' };

(async () => {
  const args = process.argv.slice(2);
  const flag = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
  const page = args.find((a) => /^https:\/\//i.test(a));
  if (!page) { console.error('Usage: node listLinks.js <page link> [--match word,word] [--out links.txt]'); process.exit(1); }

  const url = new URL(page);
  try {
    const robots = await fetch(`${url.origin}/robots.txt`, { headers: UA });
    if (robots.ok && !robotsAllows(await robots.text(), url.pathname)) {
      console.error('The site\'s robots.txt does not allow reading this page. Stopping.');
      process.exit(1);
    }
  } catch { /* no robots.txt reachable: carry on */ }

  const res = await fetch(page, { headers: UA });
  if (!res.ok) throw new Error(`Could not open the page (${res.status}).`);
  const links = parseLinks(await res.text(), page, { match: (flag('--match') || '').split(',') });

  const out = flag('--out') || 'links.txt';
  fs.writeFileSync(out, links.join('\n') + (links.length ? '\n' : ''));
  console.log(`${links.length} document link${links.length === 1 ? '' : 's'} found. Written to ${out}`);
  links.slice(0, 40).forEach((l) => console.log('  ' + l));
  if (!links.length) console.log('Nothing matched. Try fewer words after --match, or open the page and check it lists .docx files.');
})().catch((e) => { console.error(e.message); process.exit(1); });
