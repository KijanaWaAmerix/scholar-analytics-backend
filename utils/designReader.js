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
const extractPages = async (buffer, { max = 0 } = {}) => {
  let pdf;
  try { pdf = require('pdf-parse'); } catch { throw new Error('Run "npm install" first (the pdf reader is missing).'); }
  const pages = [];
  const render = (page) => page.getTextContent({ normalizeWhitespace: false }).then((tc) => {
    pages.push(tc.items.filter((i) => i.str !== undefined).map((i) => ({
      s: i.str, x: Math.round(i.transform[4]), y: Math.round(i.transform[5]), w: Math.round(i.width),
    })));
    return '';
  });
  await pdf(buffer, { pagerender: render, max });
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

const ENGLISH_HEADER = { endRe: /Question|Questio|Inquiry|n\(s\)/i };

const findHeader = (items, pats = ENGLISH_HEADER) => {
  /* Header cells arrive in odd pieces ("Spe"+"cific Learning", "Sugges"+"ted Learning"), so each row
     is joined into one string and the column starts are found in that string */
  const rows = [];
  for (const it of [...items].sort((a, b) => b.y - a.y || a.x - b.x)) {
    const row = rows.find((r) => Math.abs(r.y - it.y) <= 3);
    if (row) row.items.push(it); else rows.push({ y: it.y, items: [it] });
  }
  for (const row of rows) {
    const parts = row.items.sort((a, b) => a.x - b.x).filter((it) => String(it.s).trim() !== '');
    let text = '';
    const owner = [];
    for (const it of parts) {
      const t = String(it.s).replace(/\s+/g, ' ');
      for (let i = 0; i < t.length; i += 1) owner.push(it);
      text += t;
    }
    const at = (re) => { const m = re.exec(text); return m ? owner[m.index].x : null; };
    if (pats.columns) {
      const x = pats.columns(text, owner);
      if (!x) continue;
      const below = items.filter((it) => it.y < row.y && it.y > row.y - 45 && it.x >= x.kiq - 8 && pats.endRe.test(it.s));
      return { x, bottom: below.length ? Math.min(...below.map((it) => it.y)) : row.y - 26 };
    }
    const x = {
      sub: at(/Sub\s*-?\s*S\s*trand/i) ?? at(/Sub(?![a-z])/),
      /* One design heads the outcomes column "Suggested Learning Outcomes" */
      out: at(/Spe\s*cific/i) ?? at(/Sugg?\s*ested\s*Learning\s*Outcomes?/i) ?? at(/Sugg?\s*ested\s*Learning(?!\s*Exp)/i),
      exp: at(/Sugg?\s*ested\s*Learning\s*Exp/i) ?? at(/Learning\s*Experiences/i),
      kiq: at(/Sugg?\s*ested\s*Key|Key\s*Inquiry/i),
    };
    /* "Experiences" can sit on the next row, leaving only "Suggested Learning" on the header row */
    if (x.exp === null && x.out !== null) {
      const hit = [...text.matchAll(/Sugg?\s*ested\s*Learning/gi)].map((m) => owner[m.index].x).find((v) => v > x.out + 50);
      if (hit !== undefined) x.exp = hit;
    }
    /* "Suggested" alone on the header row, "Key Inquiry Question(s)" on the next rows */
    if (x.kiq === null && x.exp !== null) {
      const last = [...text.matchAll(/Sugg?\s*ested/gi)].pop();
      if (last && owner[last.index].x > x.exp + 50) x.kiq = owner[last.index].x;
    }
    if (Object.values(x).some((v) => v === null)) continue;
    /* The header ends at "Question(s)" (or "Inquiry"), a little below the row */
    const below = items.filter((it) => it.y < row.y && it.y > row.y - 45 && it.x >= x.kiq - 8 && pats.endRe.test(it.s));
    const bottom = below.length ? Math.min(...below.map((it) => it.y)) : row.y - 26;
    return { x, bottom };
  }
  return null;
};

const columnOf = (x, b) => {
  /* Text can start a few points to the left of its column heading */
  const room = 10;
  if (x < b.sub - room) return 'strand';
  /* the "a)" marks of the outcomes stick out further to the left */
  if (x < b.out - 18) return 'sub';
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
  const order = [];
  const strandTitles = {};
  const strandCol = {};
  let current = null;
  let inHeader = false;
  let mode = 'none';
  let bounds = null;

  pages.forEach((page) => {
    /* Drop the page number in the footer, but keep real text near the bottom edge */
    const isFooter = (t) => t.y < 90 && /^\s*(\d{1,3}|[ivxl]+)\s*$/i.test(t.s);
    const items = page.filter((t) => t.y >= 30 && !isFooter(t) && String(t.s).trim() !== '');
    const header = findHeader(items);
    /* "STRAND 1.0: NAME" above the first table of a strand */
    for (const ln of lineify(items)) {
      const t = ln.text.match(/^STRAND\s+(\d{1,2})\.0\s*[:.\-]?\s*(.+)$/i);
      if (t && ln.x <= 90 && !/\.{4,}/.test(ln.text) && !strandTitles[`${t[1]}.0`]) strandTitles[`${t[1]}.0`] = cleanItem(t[2]);
    }
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
      /* The notes under a table begin at the first of their headings (some sub-strands skip "Core competencies") */
      const core = lines.find((l) => l.x <= 90 && Object.values(TAIL).some((re) => re.test(l.text)));
      if (core) {
        tailLines = lines.filter((l) => l.y <= core.y + 1);
        tableItems = tableItems.filter((t) => t.y > core.y + 2);
        mode = 'tail';
      }
    }

    /* Table part: sort the pieces into their columns */
    if (bounds && tableItems.length) {
      const cols = { strand: [], sub: [], out: [], exp: [], kiq: [] };
      /* A sub-strand number can start well left of its heading ("5.3" at 200, "Sub Strand" at 218) */
      const idx = tableItems.filter((t) => /^\d{1,2}\.[1-9]\d?\s*$/.test(t.s) && t.x < bounds.sub - 10 && t.x > bounds.sub - 60 && t.x > 110).map((t) => t.x);
      const pageBounds = idx.length ? { ...bounds, sub: Math.min(...idx) } : { ...bounds };
      /* Some tables sit a little left of their headings; the first row's opening words show where the columns really start */
      const top = [...tableItems].sort((a, b) => b.y - a.y);
      const near = (re, want) => (top.find((t) => re.test(String(t.s).trim()) && Math.abs(t.x - want) <= 40) || {}).x;
      const outX = near(/^By the end of/i, pageBounds.out);
      const expX = near(/^The learner( is guided)?/i, pageBounds.exp);
      if (outX !== undefined && outX < pageBounds.out) pageBounds.out = outX;
      if (expX !== undefined && expX < pageBounds.exp) pageBounds.exp = expX;
      tableItems.forEach((t) => cols[columnOf(t.x, pageBounds)].push(t));

      for (const ln of lineify(cols.sub)) {
        const id = ln.text.match(/^(\d{1,2})\.(\d{1,2})\.?(?=\s|$|[A-Z])/);
        if (id && !ln.bullet) {
          current = `${id[1]}.${id[2]}`;
          if (!acc[current]) { acc[current] = emptyAcc(); order.push(current); }
          inHeader = true;
        }
        if (!current) continue;
        const count = ln.text.match(/\(\s*(\d+)\s*lessons?\s*\)/i);
        const rest = tidy(ln.text.replace(/\(\s*\d+\s*lessons?\s*\)/i, ''));
        if (count && acc[current].lessons === undefined) acc[current].lessons = Number(count[1]);
        if (inHeader) {
          /* A bulleted line under the name is content (scope), not part of the name */
          if (ln.bullet) {
            inHeader = false;
            acc[current].headerDone = true;
          } else {
            if (rest && !acc[current].headerDone) acc[current].header.push(rest);
            if (count) { inHeader = false; acc[current].headerDone = true; }
            continue;
          }
        } else if (count) {
          if (rest) acc[current].sub.push({ ...ln, text: rest });
          continue;
        }
        acc[current].sub.push(ln);
      }
      /* Strand names are also written in the first table row of each strand (wrapped, left column) */
      if (current) {
        const major = current.split('.')[0];
        if (!strandCol[major]) strandCol[major] = { lines: [], sub: current };
        if (strandCol[major].sub === current) lineify(cols.strand).forEach((l) => strandCol[major].lines.push(l.text));
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
  for (const [major, v] of Object.entries(strandCol)) {
    const name = tidy(v.lines.join(' ').replace(/^\s*\d{1,2}\.0\s*/, ''));
    if (name && !strandTitles[`${major}.0`]) strandTitles[`${major}.0`] = name;
  }
  return { acc, order, strandTitles };
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

/* ── The appendix table: assessment methods, learning resources and activities for each sub-strand ── */

const appendixHeader = (items) => {
  const rows = [];
  for (const it of [...items].sort((a, b) => b.y - a.y || a.x - b.x)) {
    const row = rows.find((r) => Math.abs(r.y - it.y) <= 3);
    if (row) row.items.push(it); else rows.push({ y: it.y, items: [it] });
  }
  /* The header row is the one that names the non-formal activities column */
  const row = rows.find((r) => r.items.length >= 4 && /Assess|Resourc|Sugg/i.test(r.items.map((i) => i.s).join('')) && /Strand|Sub/i.test(r.items.map((i) => i.s).join('')));
  if (!row) return null;
  /* Columns start where the gaps between header pieces are wide */
  const xs = row.items.filter((i) => String(i.s).trim()).sort((a, b) => a.x - b.x);
  const starts = [];
  let edge = -Infinity;
  for (const it of xs) {
    if (it.x - edge > 22) starts.push(it.x);
    edge = Math.max(edge, it.x + String(it.s).trimEnd().length * 5);
  }
  if (starts.length < 4) return null;
  const cols = starts.slice(-3);
  const area = items.filter((i) => i.y <= row.y + 1 && i.y > row.y - 40);
  const label = (from, to) => {
    const text = area.filter((i) => i.x >= from - 6 && i.x < to - 6).map((i) => i.s).join(' ');
    if (/Resourc/i.test(text)) return 'resources';
    if (/Assess/i.test(text)) return 'assessment';
    if (/Non|Activit/i.test(text)) return 'activities';
    return null;
  };
  const x = {};
  cols.forEach((from, i) => { x[label(from, cols[i + 1] || Infinity)] = from; });
  if (!x.assessment || !x.resources || !x.activities) return null;
  x.sub = starts[starts.length - 4];
  const low = area.filter((i) => i.y > row.y - 30 && /Methods|Resources|Activities|methods|activities|Formal|Learning/.test(i.s));
  return { x, bottom: Math.min(row.y, ...low.map((i) => i.y)) - 4 };
};

/* Lines of one cell become separate entries: a bullet or a capital letter after a finished line starts a new one */
const cellEntries = (lines) => {
  const out = [];
  for (const ln of lines) {
    const t = tidy(ln.text.replace(/^[●◦•\u2022\uf0b7\uf0a7\s]+/, ''));
    if (!t) continue;
    const prev = out[out.length - 1];
    const continues = prev && !ln.bullet
      && (/^[a-z(@]/.test(t) || /[\/,&@-]$/.test(prev) || /\b(and|of|by|on|in|for|to|the|a|an|with|from)$/i.test(prev) || /^(Question\(s\)|ac\.ke|[a-z]{1,3}\.[a-z]{2,3})/i.test(t));
    if (continues) out[out.length - 1] = `${prev} ${t}`.replace(/\s*([\/-])\s*/g, '$1 ').replace(/\s+/g, ' ').trim();
    else out.push(t);
  }
  const split = out.flatMap((v) => v.split(/\s+(?=[b-z]\)\s)/).map((x) => x.replace(/^[a-z]\)\s*/, '')));
  return [...new Set(split.map((v) => v.replace(/\s*([\/-])\s+/g, '$1').replace(/[;,.]+$/, '').trim()).filter((v) => v.length > 2 && !/^(Page\b|Property of|Not for Sale)/i.test(v)))];
};

const readAppendix = (pages) => {
  const found = {};
  let on = false;
  let bounds = null;
  let current = null;
  let unnumbered = 0;
  for (const page of pages) {
    const items = page.filter((t) => t.y >= 60 && String(t.s).trim() !== '');
    const lines = lineify(items);
    if (lines.some((l) => l.x <= 90 && /^APPENDIX\s*2?\s*:?\s*(2\b)?.*(ASSESSMENT|LEARNING RESOURCES)/i.test(l.text) && !/\.{4,}/.test(l.text))) on = true;
    if (!on) continue;
    const header = appendixHeader(items);
    if (header) bounds = header;
    if (!bounds) continue;
    const top = header ? header.bottom : Infinity;
    const b = bounds.x;
    const cols = { sub: [], assessment: [], resources: [], activities: [] };
    items.filter((t) => t.y < top).forEach((t) => {
      /* columns by position: the three content columns can come in any order */
      const starts = [['assessment', b.assessment], ['resources', b.resources], ['activities', b.activities]].sort((p, q) => p[1] - q[1]);
      let c = t.x < starts[0][1] - 12 ? 'sub' : null;
      starts.forEach(([name, from], i) => { if (t.x >= from - 12 && t.x < (starts[i + 1] ? starts[i + 1][1] - 12 : Infinity)) c = name; });
      if (t.x < b.sub - 12) c = null;
      if (c) cols[c].push(t);
    });
    /* rows start where a sub-strand number appears; the strand column is ignored */
    const subLines = lineify(cols.sub);
    const marks = subLines.map((l) => ({ y: l.y, m: l.text.match(/^(\d{1,2})\s*\.\s*(\d{1,2})\b\s*(.*)$/), text: l.text }))
      .filter((v) => v.m).map((v) => ({ y: v.y, id: `${v.m[1]}.${v.m[2]}` }));
    /* Some appendices give no numbers: every sub-strand name in the column starts a row (wrapped names are joined) */
    if (!marks.length && subLines.length) {
      let last = null;
      for (const l of subLines) {
        if (last === null || last - l.y > 17) marks.push({ y: l.y, id: `n${++unnumbered}` });
        last = l.y;
      }
    }
    const rowOf = (y) => {
      const hit = marks.filter((v) => v.y >= y - 1).pop();
      return hit ? hit.id : current;
    };
    /* the sub-strand's name, as written in the appendix (the numbers there are not always right) */
    for (const ln of subLines) {
      const id = rowOf(ln.y);
      if (!id) continue;
      if (!found[id]) found[id] = { assessment: [], resources: [], activities: [], name: [] };
      found[id].name.push(ln.text.replace(/^\d{1,2}\s*\.\s*\d{1,2}\s*\.?\s*/, '').replace(/\d+\s*lessons?/i, ''));
    }
    for (const k of ['assessment', 'resources', 'activities']) {
      for (const ln of lineify(cols[k])) {
        const id = rowOf(ln.y);
        if (!id) continue;
        current = id;
        if (!found[id]) found[id] = { assessment: [], resources: [], activities: [], name: [] };
        found[id][k].push(ln);
      }
    }
    if (marks.length) current = marks[marks.length - 1].id;
  }
  const out = {};
  for (const [id, v] of Object.entries(found)) {
    out[id] = { name: tidy(v.name.join(' ')), assessment: cellEntries(v.assessment), resources: cellEntries(v.resources), activities: cellEntries(v.activities) };
  }
  return out;
};

/* ── Putting it together ──────────────────────────────────── */

/**
 * pages: from extractPages. Returns { design, problems, notes }.
 * problems = something is missing (blocks upload); notes = worth a look.
 * options: { source, lessonsPerWeek, lessonMinutes, learningArea, grade }
 */
const titleCase = (v) => String(v || '').toLowerCase()
  .replace(/(^|[\s(\-/])([a-z])/g, (m, pre, c) => pre + c.toUpperCase())
  .replace(/\b(And|Of|In|The|To|For|On|At|By|A|An)\b(?!$)/g, (w, x, i) => (i === 0 ? w : w.toLowerCase()));

const readDesign = (pages, { source = '', lessonsPerWeek, lessonMinutes = 40, learningArea = '', grade } = {}) => {
  const problems = [];
  const notes = [];
  /* The summary page is only used for strand names and the total: layouts differ too much
     (some have no numbers, some no lesson counts). The tables themselves carry the structure. */
  const skeleton = readSkeleton(pages);
  const { acc, order, strandTitles } = readTables(pages);
  const appendix = readAppendix(pages);
  /* Match an appendix row to a sub-strand by name first (its numbers can be wrong), then by number */
  const wordsOf = (v) => String(v).toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter((w) => w.length > 3);
  const overlap = (name, rowName) => {
    const mine = wordsOf(name);
    const theirs = wordsOf(rowName);
    if (!mine.length) return 0;
    return mine.filter((w) => theirs.some((t) => t === w || t.startsWith(w) || w.startsWith(t))).length / mine.length;
  };
  let assigned = null;
  const assignAppendix = () => {
    assigned = {};
    const subs = order.map((id) => ({ id, name: cleanItem(acc[id].header.join(' ').replace(/^\d{1,2}\.\d{1,2}\.?\s*/, '')) }));
    const rows = Object.entries(appendix);
    const taken = new Set();
    /* pass 1: a clear name match; pass 2: a partial match among the rows nobody else took */
    for (const [min, strict] of [[0.5, true], [0.01, false]]) {
      for (const sub of subs) {
        if (assigned[sub.id]) continue;
        let best = null;
        let bestScore = 0;
        for (const [rid, row] of rows) {
          if (!strict && taken.has(rid)) continue;
          const score = overlap(sub.name, row.name);
          if (score > bestScore) { best = rid; bestScore = score; }
        }
        if (best && bestScore >= min) { assigned[sub.id] = best; taken.add(best); }
        else if (!strict) continue;
      }
    }
    /* rows written for a whole strand (numbered x.0) apply to every sub-strand of it that has none */
    for (const sub of subs) {
      const whole = appendix[`${sub.id.split('.')[0]}.0`];
      if (!assigned[sub.id] && whole) assigned[sub.id] = `${sub.id.split('.')[0]}.0`;
    }
  };
  const appendixFor = (id) => {
    if (!assigned) assignAppendix();
    const row = appendix[assigned[id]];
    return row ? { assessment: row.assessment, resources: row.resources, activities: row.activities } : null;
  };

  /* The tables themselves carry the structure; this check is for the notes below */
  if (!order.length) problems.push('No sub-strand tables were found in this PDF.');

  const norm = (v) => String(v).toLowerCase().replace(/[^a-z0-9]+/g, '');
  const summarySub = {};
  const summaryStrand = {};
  for (const st of skeleton.strands || []) {
    summaryStrand[st.id] = st.name;
    for (const sub of st.sub_strands) summarySub[sub.id] = sub;
  }

  /* Some subjects (e.g. CRE) have no content column; that is only a problem when other sub-strands have one */
  const withScope = order.filter((id) => byBullet(acc[id].sub).length > 0).length;
  const scopeExpected = order.length > 0 && withScope / order.length >= 0.8;
  if (!scopeExpected && order.length) {
    notes.push(withScope ? `Only ${withScope} of ${order.length} sub-strands list content (scope); that is how this design is written.` : 'This design has no content (scope) column, so scope is empty for every sub-strand.');
  }

  for (const id of Object.keys(summarySub)) {
    if (!acc[id]) problems.push(`Sub-strand ${id} ${summarySub[id].name || ''} is on the summary page but its table was not found.`.replace('  ', ' '));
  }

  const byStrand = new Map();
  for (const id of order) {
    const major = id.split('.')[0];
    if (!byStrand.has(major)) byStrand.set(major, []);
    byStrand.get(major).push(id);
  }

  const strands = [...byStrand.entries()].sort((x, y) => Number(x[0]) - Number(y[0])).map(([major, ids]) => {
    const strandId = `${major}.0`;
    const strandName = titleCase(strandTitles[strandId] || '') || cleanItem(summaryStrand[strandId] || '');
    if (!strandName) problems.push(`Strand ${strandId}: its name was not found.`);
    return {
      id: strandId,
      name: strandName,
      rubric_indicators: [],
      sub_strands: ids.sort((x, y) => Number(x.split('.')[1]) - Number(y.split('.')[1])).map((id) => {
        const a = acc[id];
        const tail = tailOf(a.tail);
        const name = cleanItem(a.header.join(' ').replace(/^\d{1,2}\.\d{1,2}\.?\s*/, ''));
        const fromSummary = summarySub[id];
        if (fromSummary && fromSummary.name && norm(fromSummary.name) !== norm(name)) {
          notes.push(`Sub-strand ${id}: the summary page says "${fromSummary.name}" but the table says "${name}". The table name was used.`);
        }
        let lessons = a.lessons;
        if (!Number.isInteger(lessons) && fromSummary && Number.isInteger(fromSummary.lessons)) lessons = fromSummary.lessons;
        if (Number.isInteger(a.lessons) && fromSummary && Number.isInteger(fromSummary.lessons) && a.lessons !== fromSummary.lessons) {
          notes.push(`Sub-strand ${id}: the table says ${a.lessons} lessons but the summary page says ${fromSummary.lessons}. The table was used.`);
        }
        const out = {
          id,
          name,
          lessons,
          scope: byBullet(a.sub),
          outcomes: outcomesOf(a.out),
          experiences: experiencesOf(a.exp),
          key_inquiry_questions: questionsOf(a.kiq),
          ...tail,
          ...(appendixFor(id) || {}),
        };
        if (!name) problems.push(`Sub-strand ${id}: its name was not found.`);
        if (!Number.isInteger(lessons)) problems.push(`Sub-strand ${id} ${name}: the number of lessons was not found.`);
        for (const f of ['scope', 'outcomes', 'experiences', 'key_inquiry_questions', 'core_competencies']) {
          if (f === 'scope' && !scopeExpected) continue;
          if (!out[f].length) (['core_competencies', 'scope'].includes(f) ? notes : problems).push(`Sub-strand ${id} ${name}: nothing found for ${f}.`);
        }
        return out;
      }),
    };
  });

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

/* Cover: "JUNIOR [SECONDARY] SCHOOL CURRICULUM DESIGN" / AREA / "GRADE n" (Kiswahili: "MTAALA ... SHULE ZA UPILI" / AREA / "GREDI YA n") */
const coverFrom = (cover) => {
  const at = cover.findIndex((t) => /JUNIOR\s+(SECONDARY\s+)?SCHOOL\s+CURRICULUM\s+DESIGN|MTAALA\s*WA\s+DARAJA/i.test(t));
  const area = at >= 0 ? cover[at + 1] : '';
  const grade = Number(((cover.find((t) => /^(GRADE|GREDI\s+YA)\s*\d/i.test(t)) || '').match(/\d+/) || [])[0]);
  return { area, grade };
};

/** The learning area and grade on a design's cover page (reads only the first page) */
const coverOf = async (buffer) => {
  const pages = await extractPages(buffer, { max: 1 });
  const cover = lineify(pages[0] || []).map((l) => l.text);
  const { area, grade } = coverFrom(cover);
  return { area: String(area || '').trim(), grade: Number.isInteger(grade) ? grade : null };
};

/**
 * The whole job for one PDF file: pages, cover page (learning area and grade),
 * tables. Returns { design, problems, notes }.
 */
const designFromPdf = async (buffer, { source = '', lessonsPerWeek, lessonMinutes = 40 } = {}) => {
  const pages = await extractPages(buffer);
  /* The cover page says: JUNIOR SCHOOL CURRICULUM DESIGN / <LEARNING AREA> / GRADE n */
  const cover = lineify(pages[0] || []).map((l) => l.text);
  const { area, grade } = coverFrom(cover);
  const titled = (v) => String(v || '').toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase()).replace(/\b(And|Of)\b/g, (w) => w.toLowerCase());
  const opts = { source, lessonsPerWeek, lessonMinutes, learningArea: titled(area), grade };
  /* English and Kiswahili are written in themes, with one table per skill and no numbered sub-strands */
  if (/^(english|kiswahili)$/i.test(String(area).trim())) {
    return require('./languageReader').readLanguageDesign(pages, { ...opts, language: /kiswahili/i.test(area) ? 'sw' : 'en' });
  }
  return readDesign(pages, opts);
};

module.exports = { appendixHeader, readAppendix, findHeader, coverFrom, columnOf, tailOf, TAIL, STOP, byBullet, outcomesOf, experiencesOf, questionsOf, titleCase, tidy, extractPages, readDesign, designFromPdf, coverOf, readSkeleton, readTables, lineify, cleanItem };
