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
  /* PDFs go through the shared reader, which also reads scanned pages with OCR */
  if (ext === '.pdf') text = await require('./readNotesFile').readNotesBuffer(fs.readFileSync(file), file);
  else if (ext === '.txt') text = fs.readFileSync(file, 'utf8');
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

const findAnchors = (lines, design) => {
  const subs = design.strands.flatMap((st) => st.sub_strands.map((sub) => ({ strand: st, sub })));
  const anchors = [];
  let from = 0;
  for (const { strand, sub } of subs) {
    const id = sub.id.replace('.', '\\.');
    const byId = new RegExp(`^\\W{0,3}${id}(?!\\d)\\b`);
    const words = norm(sub.name).split(' ').filter((w) => w.length > 2);
    const need = Math.max(1, Math.ceil(words.length * 0.75));
    let found = -1;
    /* the table of contents ("Soil conservation ....... 12") is not where a topic begins */
    const toc = (l) => /\.{4,}|…{2,}/.test(l);
    /* a numbered line that also holds some of the sub-strand's words; some books number every
       small heading (1.1, 1.2, 1.3 ...) so a number alone may belong to another topic */
    const hasName = (l) => { const n = norm(l); return words.some((w) => n.includes(w)); };
    let weak = -1;
    for (let i = from; i < lines.length && found < 0; i++) {
      const l = lines[i];
      if (l.length > 110 || toc(l)) continue;
      if (byId.test(l)) { if (hasName(l)) found = i; else if (weak < 0) weak = i; }
    }
    /* a numberless heading: a short line holding the sub-strand's own words */
    for (let i = from; i < lines.length && found < 0; i++) {
      const l = lines[i];
      if (l.length > 90 || /[,;]$/.test(l) || toc(l)) continue;
      const n = norm(l);
      if (words.filter((w) => n.includes(w)).length >= need && n.split(' ').length <= words.length + 4) found = i;
    }
    if (found < 0) found = weak;
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
  const anchors = findAnchors(lines, design);
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
    /* peace / peaceful / peaceable share a stem; maps / map too */
    const stem = t.length <= 5 ? t.replace(/s$/, '') : t.slice(0, 5);
    const n = words.filter((w) => w.startsWith(stem)).length;
    if (n) { matched += 1; hits += n; }
  }
  return matched >= Math.ceil(terms.length / 2) && hits >= 2;
};

module.exports = { relevantTo, distinctiveTerms, linesFromFile, looksRunTogether, splitBySubStrands, findAnchors, sectionsOf, norm, clean };
