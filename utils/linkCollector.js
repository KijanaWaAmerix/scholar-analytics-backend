/* ═══════════════════════════════════════════════════════════
   SCHOLAR ANALYTICS — Link collector
   File: backend/utils/linkCollector.js

   Reads ONE listing page and picks out the links to documents
   (.docx, .txt) whose address contains the words you ask for.
   It does not follow links to other pages.
═══════════════════════════════════════════════════════════ */

const decode = (s) => s.replace(/&amp;/g, '&').replace(/&#038;/g, '&').replace(/&#8211;/g, '-');

/**
 * html: the page. base: its address. options: { match: ['grade-8','notes'], exts: ['docx','txt'] }
 * A link is kept when every word in `match` is in its address (ignoring case).
 */
const parseLinks = (html, base, { match = [], exts = ['docx', 'txt'] } = {}) => {
  const out = new Set();
  const words = match.map((w) => w.toLowerCase()).filter(Boolean);
  const re = /href\s*=\s*["']([^"'#]+)["']/gi;
  let m;
  while ((m = re.exec(String(html || ''))) !== null) {
    let url;
    try { url = new URL(decode(m[1]).trim(), base); } catch { continue; }
    if (url.protocol !== 'https:') continue;
    const path = decodeURIComponent(url.pathname).toLowerCase();
    if (!exts.some((e) => path.endsWith(`.${e}`))) continue;
    const text = `${url.hostname}${path}`;
    if (words.every((w) => text.includes(w))) out.add(url.toString());
  }
  return [...out];
};

/* Does robots.txt allow this path for everyone ("User-agent: *")? */
const robotsAllows = (robotsTxt, path) => {
  const lines = String(robotsTxt || '').split(/\r?\n/).map((l) => l.replace(/#.*/, '').trim());
  let applies = false;
  let best = { len: -1, allow: true };
  for (const line of lines) {
    const [k, ...rest] = line.split(':');
    const key = (k || '').toLowerCase();
    const value = rest.join(':').trim();
    if (key === 'user-agent') { applies = value === '*'; continue; }
    if (!applies || !value) continue;
    if ((key === 'disallow' || key === 'allow') && path.startsWith(value) && value.length > best.len) {
      best = { len: value.length, allow: key === 'allow' };
    }
  }
  return best.allow;
};

module.exports = { parseLinks, robotsAllows };
