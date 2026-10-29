/* ═══════════════════════════════════════════════════════════
   SCHOLAR ANALYTICS — KICD design reader (no AI)
   File: backend/utils/designReader.js

   Reads a KICD curriculum design PDF with plain code. Every piece of
   text on a PDF page has a position, so the four table columns (content,
   outcomes, experiences, key inquiry question) can be told apart even
   when a table row runs over a page break.

   Steps
   1. The summary table gives the strands, sub-strands and lesson counts.
   2. Each sub-strand's table pages are split into columns and read down.
   3. The notes under the table (core competencies, values, PCIs, links)
      are read from the full-width lines after "Core competencies".

   Nothing is invented: if a part cannot be found it is left empty and
   reported in `problems` so a person can fix it by hand.
═══════════════════════════════════════════════════════════ */

const BULLET_START = /^[●○◦•▪■·∙‣➢]/;
const BULLET_ONLY = /^[●○◦•▪■·∙‣➢]\s*$/;

/* ── Text helpers ─────────────────────────────────────────── */

const tidy = (s) =>
  String(s || '')
    .replace(/[  ​]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:?!)])/g, '$1')
    .replace(/\(\s+/g, '(')
    .trim();

/* One list item: no list markers, no trailing comma or full stop */
const cleanItem = (s) => tidy(s).replace(/^[●◦•\s]+/, '').replace(/[,;.\s]+$/, '').trim();

/** Group the text pieces of a page into lines (top to bottom, left to right) */
const lineify = (items, tol = 3) => {
  const sorted = items.filter((t) => String(t.s).trim() !== '').sort((a, b) => b.y - a.y || a.x - b.x);
  const lines = [];
  for (const it of sorted) {
    const last = lines[lines.length - 1];
    if (last && Math.abs(last.y - it.y) <= tol) last.items.push(it);
    else lines.push({ y: it.y, items: [it] });
  }
  return lines.map((ln) => {
    ln.items.sort((a, b) => a.x - b.x);
    let text = '';
    let prev = null;
    for (const it of ln.items) {
      if (prev && it.x - (prev.x + prev.w) > 1.5 && !/\s$/.test(text) && !/^\s/.test(it.s)) text += ' ';
      text += it.s;
      prev = it;
    }
    const first = ln.items[0];
    const bullet = BULLET_START.test(String(first.s).trim());
    return { y: ln.y, x: first.x, bullet, text: tidy(bullet ? text.replace(BULLET_START, '') : text) };
  }).filter((l) => l.text);
};

/* ── Reading the PDF ──────────────────────────────────────── */

/** Pages as lists of { s, x, y, w } (needs the pdf-parse package) */
const extractPages = async (buffer) => {
  let pdf;
  try { pdf = require('pdf-parse'); } catch { throw new Error('Run "npm install" first (the pdf reader is missing).'); }
  const pages = [];
  const render = (page) => page.getTextContent({ normalizeWhitespace: false }).then((tc) => {
    pages.push(tc.items.filter((i) => i.str !== undefined).map((i) => ({
      s: i.str, x: Math.round(i.transform[4]), y: Math.round(i.transform[5]), w: Math.round(i.width),
    })));
    return '';
  });
  await pdf(buffer, { pagerender: render });
  return pages;
};

/* ── 1. Summary table: strands, sub-strands, lesson counts ── */

const readSkeleton = (pages) => {
  const at = pages.findIndex((p) => {
    const t = lineify(p).map((l) => l.text).join(' ');
    return /SUMMARY OF STRANDS AND SUB\s?STRANDS/i.test(t) && /Suggested Number of Lessons/i.test(t);
  });
  if (at === -1) return { strands: [] };

  const items = pages[at].filter((t) => String(t.s).trim() !== '');
  const head = (re) => items.find((t) => re.test(String(t.s).trim()) && t.y < 430);
  const subHead = head(/^SUB\s*STRANDS?$/i);
  const lessonHead = head(/^Suggested Number of Lessons/i);
  if (!subHead || !lessonHead) return { strands: [] };

  const totalLine = items.find((t) => /^Total Number of Lessons/i.test(String(t.s).trim()));
  const stopY = totalLine ? totalLine.y + 2 : 0;
  const rows = items.filter((t) => t.y < subHead.y - 3 && t.y > stopY);
  const total = totalLine
    ? Number((items.find((t) => /^\s*\d{2,3}\s*$/.test(t.s) && Math.abs(t.y - totalLine.y) <= 4 && t.x > subHead.x) || {}).s)
    : undefined;

  const strandCol = rows.filter((t) => t.x < subHead.x - 6);
  const subCol = rows.filter((t) => t.x >= subHead.x - 6 && !(t.x >= lessonHead.x - 5 && /^\s*\d{1,2}\s*$/.test(t.s)));
  const numbers = rows.filter((t) => t.x >= lessonHead.x - 5 && /^\s*\d{1,2}\s*$/.test(t.s));

  const strands = [];
  for (const ln of lineify(strandCol)) {
    const m = ln.text.match(/^(\d{1,2})\.0\b\s*(.*)$/);
    if (m) strands.push({ id: `${m[1]}.0`, name: m[2], sub_strands: [] });
    else if (strands.length) strands[strands.length - 1].name += ' ' + ln.text;
  }

  let last = null;
  for (const ln of lineify(subCol)) {
    const m = ln.text.match(/^(\d{1,2})\.(\d{1,2})\.?\s*(.*)$/);
    if (m) {
      last = { id: `${m[1]}.${m[2]}`, name: m[3], y: ln.y };
      let strand = strands.find((s) => s.id === `${m[1]}.0`);
      if (!strand) { strand = { id: `${m[1]}.0`, name: '', sub_strands: [] }; strands.push(strand); }
      strand.sub_strands.push(last);
    } else if (last) {
      last.name += ' ' + ln.text;
    }
  }
  for (const st of strands) {
    st.name = tidy(st.name);
    for (const sub of st.sub_strands) {
      sub.name = tidy(sub.name);
      const near = numbers.filter((n) => Math.abs(n.y - sub.y) <= 12).sort((a, b) => Math.abs(a.y - sub.y) - Math.abs(b.y - sub.y))[0];
      sub.lessons = near ? Number(near.s) : NaN;
      delete sub.y;
    }
  }
  return { strands, total: Number.isFinite(total) ? total : undefined };
};

/* ── 2 and 3. The sub-strand tables ───────────────────────── */

const HEADERS = {
  sub: /^Sub([\s-]?Strand)?$/i,
  out: /^Specific\b/i,
  exp: /^Suggested Learning/i,
  kiq: /^(Suggested\s+)?Key\b/i,
};

const findHeader = (items) => {
  const text = (it) => String(it.s).trim();
  /* The "Specific Learning Outcomes" cell fixes the header row; the other cells sit on the same row */
  const anchor = items.find((it) => HEADERS.out.test(text(it)));
  if (!anchor) return null;
  const x = { out: anchor.x };
  for (const k of ['sub', 'exp', 'kiq']) {
    /* "Suggested Key Inquiry Question(s)" can wrap onto two or three rows */
    const reach = k === 'kiq' ? 18 : 3;
    const hit = items.find((it) => (HEADERS[k].test(text(it)) || (k === 'kiq' && /^Suggested$/i.test(text(it))))
      && it.y <= anchor.y + 3 && it.y >= anchor.y - reach);
    if (!hit) return null;
    x[k] = hit.x;
  }
  /* The header ends at "Question(s)" (or "Inquiry"), a little below the row */
  const below = items.filter((it) => it.y < anchor.y && it.y > anchor.y - 45 && /^(Question|Inquiry)/i.test(text(it)));
  const bottom = below.length ? Math.min(...below.map((it) => it.y)) : anchor.y - 26;
  return { x, bottom };
};

const columnOf = (x, b) => {
  /* Text can start a few points to the left of its column heading */
  const room = 10;
  if (x < b.sub - room) return 'strand';
  if (x < b.out - room) return 'sub';
  if (x < b.exp - room) return 'out';
  if (x < b.kiq - room) return 'exp';
  return 'kiq';
};

const TAIL = {
  competencies: /^core competenc/i,
  pcis: /^pertinent and contemporary/i,
  values: /^values?\s*:?\s*$/i,
  links: /^links?\s+to\s+other/i,
};
const STOP = /^(STRAND\s+\d|Suggested Assessment|ASSESSMENT RUBRIC|APPENDIX)/i;

const emptyAcc = () => ({ sub: [], out: [], exp: [], kiq: [], tail: [], header: [] });

const readTables = (pages) => {
  const acc = {};
  let current = null;
  let inHeader = false;
  let mode = 'none';
  let bounds = null;

  pages.forEach((page) => {
    /* Drop the page number in the footer, but keep real text near the bottom edge */
    const isFooter = (t) => t.y < 90 && /^\s*(\d{1,3}|[ivxl]+)\s*$/i.test(t.s);
    const items = page.filter((t) => t.y >= 30 && !isFooter(t) && String(t.s).trim() !== '');
    const header = findHeader(items);
    let tableItems = items;
    let tailLines = [];

    if (header) {
      bounds = header.x;
      mode = 'table';
      tableItems = items.filter((t) => t.y < header.bottom - 4);
    } else if (mode === 'none') {
      return;
    }

    if (mode === 'tail') {
      tailLines = lineify(tableItems);
      tableItems = [];
    } else {
      const lines = lineify(tableItems);
      const core = lines.find((l) => l.x <= 90 && TAIL.competencies.test(l.text));
      if (core) {
        tailLines = lines.filter((l) => l.y <= core.y + 1);
        tableItems = tableItems.filter((t) => t.y > core.y + 2);
        mode = 'tail';
      }
    }

    /* Table part: sort the pieces into their columns */
    if (bounds && tableItems.length) {
      const cols = { strand: [], sub: [], out: [], exp: [], kiq: [] };
      tableItems.forEach((t) => cols[columnOf(t.x, bounds)].push(t));

      for (const ln of lineify(cols.sub)) {
        const id = ln.text.match(/^(\d{1,2})\.(\d{1,2})\.?(?:\s|$)/);
        if (id && !ln.bullet) {
          current = `${id[1]}.${id[2]}`;
          if (!acc[current]) acc[current] = emptyAcc();
          inHeader = true;
        }
        if (!current) continue;
        if (inHeader) {
          if (/\(\s*\d+\s*lessons?\s*\)/i.test(ln.text)) inHeader = false;
          else if (!acc[current].headerDone) acc[current].header.push(ln.text);
          if (!inHeader) acc[current].headerDone = true;
          continue;
        }
        acc[current].sub.push(ln);
      }
      if (current) {
        lineify(cols.out).forEach((l) => acc[current].out.push(l));
        lineify(cols.exp).forEach((l) => acc[current].exp.push(l));
        lineify(cols.kiq).forEach((l) => acc[current].kiq.push(l));
      }
    }

    /* Notes under the table */
    if (tailLines.length && current) {
      for (const ln of tailLines) {
        if (STOP.test(ln.text)) { mode = 'none'; break; }
        acc[current].tail.push(ln);
      }
    }
  });
  return acc;
};

/* ── Turning lines into list items ────────────────────────── */

const byBullet = (lines) => {
  const items = [];
  for (const ln of lines) {
    if (ln.bullet || !items.length) items.push(ln.text);
    else items[items.length - 1] += ' ' + ln.text;
  }
  return items.map(cleanItem).filter(Boolean);
};

const outcomesOf = (lines) => {
  const items = [];
  for (const ln of lines) {
    if (/^\(?[a-z]\)\s*/.test(ln.text)) items.push(ln.text.replace(/^\(?[a-z]\)\s*/, ''));
    else if (items.length) items[items.length - 1] += ' ' + ln.text;
  }
  return items.map(cleanItem).filter(Boolean);
};

/* A project or service-learning item is not always marked with a bullet */
const EXTRA_ITEM = /^(project|service learning|community service learning)\b\s*:/i;

const experiencesOf = (lines) => {
  const body = lines.filter((l) => !/^the learner is guided to/i.test(l.text));
  const firstBullet = body.findIndex((l) => l.bullet);
  const marked = (firstBullet === -1 ? body : body.slice(firstBullet))
    .map((l) => (EXTRA_ITEM.test(l.text) ? { ...l, bullet: true } : l));
  return byBullet(marked);
};

const questionsOf = (lines) => {
  const text = tidy(lines.map((l) => l.text).join(' '));
  return (text.match(/[^?]+\?/g) || (text ? [text] : [])).map((q) => tidy(q).replace(/^\d{1,2}[.)]\s*/, '')).filter(Boolean);
};

const tailOf = (lines) => {
  const sections = { competencies: [], pcis: [], values: [], links: [] };
  let at = null;
  for (const ln of lines) {
    const name = Object.keys(TAIL).find((k) => TAIL[k].test(ln.text));
    if (name) { at = name; continue; }
    if (!at) continue;
    sections[at].push(ln);
  }
  const start = /^[A-Z][A-Za-z ,&'’\-/()]{1,70}:\s*\S/;
  const split = (arr) => {
    const items = [];
    for (const ln of arr) {
      if (ln.bullet || start.test(ln.text) || !items.length) items.push(ln.text);
      else items[items.length - 1] += ' ' + ln.text;
    }
    return items.map(cleanItem).filter(Boolean);
  };
  return {
    core_competencies: split(sections.competencies),
    pcis: split(sections.pcis),
    values: split(sections.values),
    links: split(sections.links).length ? split(sections.links) : [],
  };
};

/* ── Putting it together ──────────────────────────────────── */

/**
 * pages: from extractPages. Returns { design, problems, notes }.
 * problems = something is missing (blocks upload); notes = worth a look.
 * options: { source, lessonsPerWeek, lessonMinutes, learningArea, grade }
 */
const readDesign = (pages, { source = '', lessonsPerWeek, lessonMinutes = 40, learningArea = '', grade } = {}) => {
  const problems = [];
  const notes = [];
  const skeleton = readSkeleton(pages);
  if (!skeleton.strands.length) problems.push('Could not read the summary table of strands.');
  const tables = readTables(pages);

  const strands = skeleton.strands.map((st) => ({
    id: st.id,
    name: cleanItem(st.name),
    rubric_indicators: [],
    sub_strands: st.sub_strands.map((sub) => {
      const a = tables[sub.id];
      if (!a) { problems.push(`Sub-strand ${sub.id} ${sub.name}: its table was not found.`); }
      const tail = a ? tailOf(a.tail) : { core_competencies: [], pcis: [], values: [], links: [] };
      /* The name above the table is the one teachers see; the summary page can have typos */
      const tableName = a ? cleanItem(a.header.join(' ').replace(/^\d{1,2}\.\d{1,2}\.?\s*/, '')) : '';
      const norm = (v) => String(v).toLowerCase().replace(/[^a-z0-9]+/g, '');
      let name = cleanItem(sub.name);
      if (tableName && norm(tableName) !== norm(name)) {
        notes.push(`Sub-strand ${sub.id}: the summary page says "${sub.name}" but the table says "${tableName}". The table name was used.`);
        name = tableName;
      }
      const out = {
        id: sub.id,
        name,
        lessons: sub.lessons,
        scope: a ? byBullet(a.sub) : [],
        outcomes: a ? outcomesOf(a.out) : [],
        experiences: a ? experiencesOf(a.exp) : [],
        key_inquiry_questions: a ? questionsOf(a.kiq) : [],
        ...tail,
      };
      for (const f of ['scope', 'outcomes', 'experiences', 'key_inquiry_questions', 'core_competencies']) {
        if (a && !out[f].length) problems.push(`Sub-strand ${sub.id} ${sub.name}: nothing found for ${f}.`);
      }
      return out;
    }),
  }));

  const total = strands.reduce((n, s) => n + s.sub_strands.reduce((m, x) => m + (Number.isInteger(x.lessons) ? x.lessons : 0), 0), 0);
  if (skeleton.total && skeleton.total !== total) problems.push(`Lessons add up to ${total}, but the design says ${skeleton.total}.`);

  const design = {
    source,
    learning_area: learningArea,
    grade,
    lessons_per_week: lessonsPerWeek,
    lesson_minutes: lessonMinutes,
    total_suggested_lessons: skeleton.total || total,
    note: 'The suggested number of lessons per sub strand may be less or more depending on the context.',
    strands,
    appendix: { assessment_methods: [], learning_resources: [], non_formal_activities: [] },
  };
  return { design, problems, notes };
};

module.exports = { extractPages, readDesign, readSkeleton, readTables, lineify, cleanItem };
