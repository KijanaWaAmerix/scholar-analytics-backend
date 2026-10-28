/* ═══════════════════════════════════════════════════════════
   SCHOLAR ANALYTICS — Notes importer
   File: backend/utils/notesImporter.js

   Splits the text of a notes document (for example a teacher's Word
   file for a whole strand) into one piece for each sub-strand of a
   design, by finding the sub-strand headings.

   The notes are kept only as REFERENCE for Gemini when it writes
   lessons and exams. They are never shown to learners as they are.
═══════════════════════════════════════════════════════════ */

const { NOTES_MAX } = require('./contentStore');

const URL_RE = /(https?:\/\/|www\.)\S+/gi;

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/* A line that could be a heading: short, and not a sentence.
   Teachers often end a heading with a full stop ("2.1 The Cell."), so a short
   line is allowed to end with one. */
const looksLikeHeading = (line) => {
  const t = line.trim();
  if (!t || t.length > 140) return false;
  if (/[!?]$/.test(t)) return false;
  if (/\.$/.test(t)) return t.length <= 80;
  return true;
};

/* Light word clean-up so "Material" and "Materials" count as the same word */
const stem = (w) => (w.length > 3 ? w.replace(/(es|s)$/, '') : w);
const words = (s) => norm(s).split(' ').filter(Boolean).map(stem);

const editDistanceAtMost1 = (a, b) => {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i += 1;
  if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1);
  return a.length > b.length ? a.slice(i + 1) === b.slice(i) : b.slice(i + 1) === a.slice(i);
};

/* Same words in the same order; a one-letter slip in a long word is allowed ("compunds") */
const sameWords = (a, b) =>
  a.length === b.length && a.every((w, i) => w === b[i] || (w.length >= 6 && editDistanceAtMost1(w, b[i])));

/**
 * Find where each sub-strand starts. A heading line has to contain the
 * sub-strand's name (ignoring case, punctuation and a leading number).
 * Returns [{ id, name, line }] in the order they appear, and the ids not found.
 */
const findHeadings = (lines, subs) => {
  const found = [];
  const missing = [];
  let from = 0;

  for (const sub of subs) {
    const target = norm(sub.name);
    /* Best match first: a heading that is exactly the name (a number in front is fine).
       Then a heading that merely contains it. Strand titles never count. */
    const heading = (i) => looksLikeHeading(lines[i]) && !/^strand\b/i.test(lines[i]);
    const bare = (i) => norm(lines[i]).replace(/^\d+( \d+)* /, '');
    let at = -1;
    for (let i = from; i < lines.length && at === -1; i += 1) {
      if (heading(i) && bare(i) === target) at = i;
    }
    /* Same words, allowing "Material"/"Materials" and a small spelling slip */
    const targetWords = words(sub.name);
    for (let i = from; i < lines.length && at === -1; i += 1) {
      if (heading(i) && sameWords(words(bare(i)), targetWords)) at = i;
    }
    for (let i = from; i < lines.length && at === -1; i += 1) {
      if (heading(i) && bare(i).includes(target)) at = i;
    }
    if (at === -1) { missing.push(sub.id); continue; }
    found.push({ id: sub.id, name: sub.name, line: at });
    from = at + 1;
  }
  return { found, missing };
};

const tidy = (text) =>
  text.replace(URL_RE, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();

/**
 * text   : the whole document as plain text
 * design : a curriculum design
 * Returns { sections: [{ id, name, text }], missing: [ids] }
 */
const splitIntoSections = (text, design) => {
  const lines = String(text || '').split(/\r?\n/).map((l) => l.trim());
  const subs = design.strands.flatMap((s) => s.sub_strands);
  const { found, missing } = findHeadings(lines, subs);

  /* A section also stops at any other numbered heading ("2.1 ...", "Strand 2") so a
     sub-strand we could not match does not get added to the one before it */
  const foundLines = new Set(found.map((h) => h.line));
  const isOtherHeading = (line, i) =>
    !foundLines.has(i) && looksLikeHeading(line) && /^(\d+\.\d+\.?\s+\S|strand\s+\d)/i.test(line);

  const sections = found.map((h, i) => {
    let end = i + 1 < found.length ? found[i + 1].line : lines.length;
    for (let k = h.line + 1; k < end; k += 1) {
      if (isOtherHeading(lines[k], k)) { end = k; break; }
    }
    const body = tidy(lines.slice(h.line, end).join('\n'));
    return { id: h.id, name: h.name, text: body.slice(0, NOTES_MAX) };
  }).filter((s) => s.text.length >= 200);

  const kept = new Set(sections.map((s) => s.id));
  return { sections, missing: subs.map((s) => s.id).filter((id) => !kept.has(id)) };
};

module.exports = { splitIntoSections, findHeadings, tidy, norm };
