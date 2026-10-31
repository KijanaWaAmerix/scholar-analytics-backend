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
    for (let i = from; i < lines.length && found < 0; i++) {
      const l = lines[i];
      if (l.length > 110) continue;
      if (byId.test(l)) found = i;
    }
    /* a numberless heading: a short line holding the sub-strand's own words */
    for (let i = from; i < lines.length && found < 0; i++) {
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

module.exports = { linesFromFile, looksRunTogether, splitBySubStrands, findAnchors, sectionsOf, norm, clean };
