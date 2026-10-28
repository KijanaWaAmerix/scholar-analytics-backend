/* ═══════════════════════════════════════════════════════════
   SCHOLAR ANALYTICS — Careful page crawler
   File: backend/utils/crawler.js

   Finds links to downloadable documents (.docx / .txt) on a website,
   starting from one page. It is deliberately limited:
     - stays on the starting website
     - obeys that website's robots.txt
     - waits between requests
     - stops after a set number of pages and files
   Documents are kept only when their address or text contains ALL the "match" words;
   pages are followed when they mention at least one.
═══════════════════════════════════════════════════════════ */

const FILE_RE = /\.(docx|txt)(\?.*)?$/i;
const NOT_A_PAGE = /\.(pdf|doc|xls|xlsx|ppt|pptx|zip|rar|jpe?g|png|gif|webp|svg|mp4|mp3|css|js)(\?.*)?$/i;

/* Disallow rules that apply to everyone (User-agent: *) */
const parseRobots = (text) => {
  const rules = [];
  let applies = false;
  let delay = 0;
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    const m = line.match(/^([a-z-]+)\s*:\s*(.*)$/i);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const value = m[2].trim();
    if (key === 'user-agent') applies = value === '*';
    else if (applies && key === 'disallow' && value) rules.push(value);
    else if (applies && key === 'crawl-delay') delay = Math.max(delay, Number(value) || 0);
  }
  return { rules, delay };
};

const allowed = (robots, pathname) => !robots.rules.some((r) => pathname.startsWith(r.replace(/\*.*$/, '')));

const linksIn = (html, base) => {
  const out = [];
  const re = /<a\b[^>]*?href\s*=\s*["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html))) {
    try {
      out.push({ url: new URL(m[1].replace(/&amp;/g, '&'), base).toString(), text: m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() });
    } catch { /* not a usable link */ }
  }
  return out;
};

const hayOf = (link) => {
  let url = link.url;
  try { url = decodeURIComponent(link.url); } catch { /* keep as is */ }
  return `${url} ${link.text}`.toLowerCase().replace(/[^a-z0-9]+/g, ' ');
};
const wordKey = (w) => w.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const hasAll = (link, words) => words.every((w) => hayOf(link).includes(wordKey(w)));

/* How many of the words a link mentions (used to pick which pages to visit first) */
const score = (link, words) => words.filter((w) => hayOf(link).includes(wordKey(w))).length;

/**
 * options: { start, match:[words], maxPages, maxFiles, delayMs, fetch, sleep, log }
 * Returns { files:[{url,text}], pages: n, skipped: [reasons] }
 */
const crawl = async ({
  start, match = [], maxPages = 15, maxFiles = 30, delayMs = 2500,
  fetchFn = fetch, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), log = () => {},
}) => {
  const root = new URL(start);
  if (root.protocol !== 'https:' && root.protocol !== 'http:') throw new Error('Use a web address that starts with https://');

  const headers = { 'User-Agent': 'ScholarAnalytics-NotesImporter/1.0 (personal project)' };
  let robots = { rules: [], delay: 0 };
  try {
    const res = await fetchFn(new URL('/robots.txt', root), { headers });
    if (res.ok) robots = parseRobots(await res.text());
  } catch { /* no robots file */ }
  const wait = Math.max(delayMs, robots.delay * 1000);

  const files = new Map();
  const skipped = [];
  const queue = [root.toString()];
  const seen = new Set(queue);
  let pages = 0;

  while (queue.length && pages < maxPages && files.size < maxFiles) {
    const url = queue.shift();
    if (!allowed(robots, new URL(url).pathname)) { skipped.push(`robots.txt asks not to visit ${url}`); continue; }

    let html;
    try {
      const res = await fetchFn(url, { headers });
      if (!res.ok || !/text\/html/i.test(res.headers.get('content-type') || '')) { skipped.push(`${url} (${res.status})`); continue; }
      html = await res.text();
    } catch (err) {
      skipped.push(`${url} (${err.message})`);
      continue;
    }
    pages += 1;
    log(`Page ${pages}: ${url}`);

    const pageLinks = [];
    for (const link of linksIn(html, url)) {
      const u = new URL(link.url);
      if (u.host !== root.host) continue;
      if (FILE_RE.test(u.pathname)) {
        /* a document has to mention ALL the words */
        if (hasAll(link, match) && allowed(robots, u.pathname) && files.size < maxFiles) files.set(link.url, link);
      } else if (!NOT_A_PAGE.test(u.pathname) && !seen.has(link.url) && score(link, match) > 0) {
        /* a page on the way only has to mention ONE; the best-matching pages go first */
        pageLinks.push(link);
      }
    }
    pageLinks.sort((a, b) => score(b, match) - score(a, match));
    for (const link of pageLinks) {
      if (queue.length >= maxPages * 3) break;
      seen.add(link.url);
      queue.push(link.url);
    }
    if (queue.length) await sleep(wait);
  }
  return { files: [...files.values()], pages, skipped };
};

module.exports = { crawl, parseRobots, linksIn, hasAll, allowed };
