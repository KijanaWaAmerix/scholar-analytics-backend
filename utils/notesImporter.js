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

/* A line that could be a heading: short, and not a sentence */
const looksLikeHeading = (line) => line.length > 0 && line.length <= 140 && !/[.!?]$/.test(line.trim());

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
