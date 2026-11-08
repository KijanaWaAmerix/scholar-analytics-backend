/* Read a teacher's notes file (PDF, DOCX, DOC) and share it out by the sub-strands of a curriculum design.
   Plain code, no AI. The same reader serves every grade and subject: it only needs the design's
   sub-strand numbers and names, and finds where each one begins in the notes.            */
const fs = require('fs');
const path = require('path');

const clean = (s) => String(s || '')
  .replace(/[   ]/g, ' ').replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
  .replace(/\s+/g, ' ').trim();

const norm = (s) => clean(s).toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

/* ── 1. file → list of non-empty lines ── */
const linesFromFile = async (file) => {
  const ext = path.extname(file).toLowerCase();
  let text = '';
  if (ext === '.pdf') text = (await require('pdf-parse')(fs.readFileSync(file))).text;
  else if (ext === '.docx') text = (await require('mammoth').extractRawText({ path: file })).value;
  else if (ext === '.doc') text = (await new (require('word-extractor'))().extract(file)).getBody();
  else throw new Error(`Unsupported file type ${ext}`);
  return text.split(/\r?\n/).map(clean).filter((l) => l && !/^[-_=.\s]+$/.test(l));
};

/* The older .doc files lose their spaces ("Itisadeliberate"). A line with very long
   words and few spaces is flagged so the importer can warn about it. */
const looksRunTogether = (lines) => {
  const words = lines.join(' ').split(' ').filter(Boolean);
  if (!words.length) return false;
  return words.filter((w) => w.length > 18).length / words.length > 0.04;
};

/* ── 2. find the line where each sub-strand begins ── */
const STRAND_LINE = /^(strand|sub[- ]?strand)\s*\d*/i;

const findAnchors = (lines, design, { byName = true } = {}) => {
  const subs = design.strands.flatMap((st) => st.sub_strands.map((sub) => ({ strand: st, sub })));
  const anchors = [];
  /* A table of contents lists every heading ("1.1 KUSIKILIZA ........ 13") and would be taken for the
     real ones. It shows as a block of dot-leader lines near the start: begin the search after it. */
  const leaders = lines.map((l, i) => (/\.{5,}/.test(l) ? i : -1)).filter((i) => i >= 0);
  const early = leaders.filter((i) => i < lines.length * 0.3);
  let from = early.length >= 8 ? early[early.length - 1] + 1 : 0;
  for (const { strand, sub } of subs) {
    const id = sub.id.replace('.', '\\.');
    const byId = new RegExp(`^\\W{0,3}${id}(?!\\d)\\b`);
    const words = norm(sub.name).split(' ').filter((w) => w.length > 2);
    const need = Math.max(1, Math.ceil(words.length * 0.75));
    let found = -1;
    for (let i = from; i < lines.length && found < 0; i++) {
      const l = lines[i];
      if (l.length > 110) continue;
      if (byId.test(l)) found = i;
    }
    /* a numberless heading: a short line holding the sub-strand's own words */
    for (let i = from; byName && i < lines.length && found < 0; i++) {
      const l = lines[i];
      if (l.length > 90 || /[,;]$/.test(l)) continue;
      const n = norm(l);
      if (words.filter((w) => n.includes(w)).length >= need && n.split(' ').length <= words.length + 4) found = i;
    }
    anchors.push({ strand, sub, line: found });
    if (found >= 0) from = found + 1;
  }
  return anchors;
};

/* ── 3. split into sections by sub-headings (short lines) ── */
const isHeading = (l) => l.length <= 70 && l.length >= 3 && !/[,;]$/.test(l) && !/^[0-9. ]+$/.test(l)
  && (l.split(' ').length <= 6 || l === l.toUpperCase() || /:$/.test(l)) && l.split(' ').length <= 9
  && !/\b(is|are|was|were|can|has|have|will)\b.*[a-z]\.$/.test(l);

const sectionsOf = (lines) => {
  const out = [];
  let cur = { heading: '', text: [] };
  for (const l of lines) {
    if (isHeading(l) && !/^(a|an|the)\b.*\b(is|are)\b/i.test(l)) {
      if (cur.text.length || cur.heading) out.push(cur);
      cur = { heading: l.replace(/[:.]+$/, ''), text: [] };
    } else cur.text.push(l);
  }
  if (cur.text.length || cur.heading) out.push(cur);
  return out.filter((s) => s.text.length);
};

/* ── 4. share the notes out ── */
const splitBySubStrands = (lines, design) => {
  /* Notes numbered like the design (1.1, 1.2 ...): trust the numbers and do not guess by name */
  const total = design.strands.reduce((n, st) => n + st.sub_strands.length, 0);
  let anchors = findAnchors(lines, design, { byName: false });
  if (anchors.filter((a) => a.line >= 0).length < total * 0.6) anchors = findAnchors(lines, design);
  /* the first sub-strand often has no number: it starts right after the title block */
  if (anchors.length && anchors[0].line < 0) {
    const strandLine = lines.findIndex((l) => STRAND_LINE.test(l));
    anchors[0].line = strandLine >= 0 ? strandLine + 1 : 0;
  }
  const known = anchors.filter((a) => a.line >= 0).sort((a, b) => a.line - b.line);
  const result = {};
  for (const a of anchors) {
    const lessons = a.sub.lessons || 0;
    if (a.line < 0) { result[a.sub.id] = { name: a.sub.name, found: false, words: 0, coverage: 'none', sections: [] }; continue; }
    const next = known.find((k) => k.line > a.line);
    let body = lines.slice(a.line + 1, next ? next.line : lines.length);
    /* a strand title at the end belongs to the next strand, not to this sub-strand */
    while (body.length && STRAND_LINE.test(body[body.length - 1])) body.pop();
    const cut = body.findIndex((l) => STRAND_LINE.test(l));
    if (cut >= 0) body = body.slice(0, cut);
    const words = body.join(' ').split(' ').filter(Boolean).length;
    const perLesson = lessons ? words / lessons : words;
    result[a.sub.id] = {
      name: a.sub.name, found: true, words,
      coverage: perLesson >= 35 ? 'full' : perLesson >= 12 ? 'thin' : 'none',
      sections: sectionsOf(body),
    };
  }
  return result;
};

/* ── Is matched text really about this sub-strand? ─────────────────────────
   Content matching always finds *something*. For English and Kiswahili the sub-strand names are
   mostly generic ("Reading: Intensive Reading: Class Reader"), so the same grammar text was being
   attached to dozens of sub-strands. A match is kept only when the text mentions the sub-strand's
   own distinctive words (its name, without the skill words) at least twice in all. Otherwise the
   sub-strand stays without notes and the design/AI covers it, which is better than wrong notes. */
const GENERIC = new Set(('and the for with from into of in on to a an by or as at its their your our use using used '
  + 'word words skills skill basic simple general introduction intensive extensive reading writing listening speaking grammar '
  + 'comprehension class reader readers passage passages text texts activities activity learner learners '
  + 'kusikiliza kuzungumza kusoma kuandika sarufi kwa na ya wa za la cha vya ili katika au matini kifungu').split(' '));

const distinctiveTerms = (sub) => norm(sub.name).split(' ').filter((w) => w.length >= 4 && !GENERIC.has(w));

const relevantTo = (text, sub) => {
  const terms = [...new Set(distinctiveTerms(sub))];
  if (!terms.length) return false;
  const words = norm(text).split(' ');
  let hits = 0, matched = 0;
  for (const t of terms) {
    const stem = t.slice(0, Math.max(4, Math.min(t.length, 6)));
    const n = words.filter((w) => w.startsWith(stem)).length;
    if (n) { matched += 1; hits += n; }
  }
  return matched >= Math.ceil(terms.length / 2) && hits >= 2;
};

module.exports = { relevantTo, distinctiveTerms, linesFromFile, looksRunTogether, splitBySubStrands, findAnchors, sectionsOf, norm, clean };
