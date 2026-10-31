/**
 * Reader for the English and Kiswahili designs.
 *
 * Unlike the other subjects, these are written as 15 themes. Under each theme every skill (listening and
 * speaking, reading, grammar, writing ...) has its own table. The numbers in the tables are unreliable
 * (the draft repeats and mistypes them), so the tables are numbered here in the order they appear:
 * theme 3, third table = sub-strand 3.3. No lesson counts are given for most tables; the missing ones are
 * shared out from the lessons per week (and marked "lessons_estimated").
 */
const {
  lineify, findHeader, columnOf, byBullet, outcomesOf, experiencesOf, questionsOf, titleCase, tidy, cleanItem,
} = require('./designReader');

const NOISE = /Download this and other FREE materials from https?:\/\/\S*?teacher\.co\.ke\/notes/g;

const LANG = {
  en: {
    header: { endRe: /Question|Questio|Inquiry|n\(s\)/i },
    tail: {
      competencies: /^core competenc/i,
      pcis: /^pertinent and contemporary/i,
      values: /^values?\s*:?\s*$/i,
      links: /^links?\s+to\s+other/i,
    },
    stop: /^(STRAND\b|Suggested Assessment|Ass\w*\s+Rubric|Indicators?\s|APPENDIX|COMMUNITY SERVICE LEARNING)/i,
    theme: /^(?:STRAND\s*:?\s*)?(\d{1,2})\.0\s*:?\s*(?:THEME\s*:?\s*)?(\S.*)$/,
    lessons: /\(?\s*(\d+)\s*lessons?\s*\)?/i,
    strandLabel: /^STRAND/i,
  },
  sw: {
    header: {
      endRe: /Dadisi|Ujifunzaji|Yanayotarajiwa|Swali|Maswali/i,
      columns: (text, owner) => {
        const at = (re) => { const m = re.exec(text); return m ? owner[m.index].x : null; };
        const mada = [...text.matchAll(/Mada/g)].map((m) => owner[m.index].x);
        const x = {
          sub: at(/Mada\s*Ndogo/) ?? (mada.length > 1 ? mada[1] : null),
          out: at(/Matokeo\s*Maalum/),
          exp: at(/Mapendekezo\s*ya\s*Shughuli/),
          kiq: at(/Maswali?\s*Dadisi|Swali\s*Dadisi|Maswali?\b|Swali\b/),
        };
        return Object.values(x).some((v) => v === null) ? null : x;
      },
    },
    tail: {
      competencies: /^umilisi wa kimsingi/i,
      pcis: /^masuala mtambuko/i,
      values: /^maadili\s*:?\s*$/i,
      links: /^uhusiano na masomo/i,
    },
    stop: /^(Vigezo na Viwango|Suggested Assessment|Assessment Rubric|APPENDIX|KIAMBATISHO|VIAMBATISHO|SHUGHULI YA HUDUMA)/i,
    theme: /^(\d{1,2})\.0\s+(\S.*)$/,
    lessons: /\(\s*Vipindi\s*(\d+)\s*\)|\(\s*(\d+)\s*vipindi\s*\)/i,
  },
};

const cleanPage = (page) => page
  .map((t) => ({ ...t, s: String(t.s).replace(NOISE, '').replace(/DRAFT/g, '') }))
  .filter((t) => t.y >= 60 && t.s.trim() !== '')
  .filter((t) => !/^(Property of the Government|Mali ya serikali)/i.test(t.s.trim()));

/* Items in the tail start at the left margin; wrapped lines are indented */
const splitByMargin = (lines) => {
  if (!lines.length) return [];
  const margin = Math.min(...lines.map((l) => l.x));
  const items = [];
  for (const ln of lines) {
    if (ln.bullet || ln.x <= margin + 3 || !items.length) items.push(ln.text);
    else items[items.length - 1] += ' ' + ln.text;
  }
  return items.map(cleanItem).filter(Boolean);
};

const tailItems = (lines, tail) => {
  const sections = { competencies: [], pcis: [], values: [], links: [] };
  let at = null;
  for (const ln of lines) {
    const name = Object.keys(tail).find((k) => tail[k].test(ln.text));
    if (name) { at = name; continue; }
    if (at) sections[at].push(ln);
  }
  return {
    core_competencies: splitByMargin(sections.competencies),
    pcis: splitByMargin(sections.pcis),
    values: splitByMargin(sections.values),
    links: splitByMargin(sections.links),
  };
};


/* ── The appendix of English and Kiswahili: assessment, resources and activities are listed by skill ── */
const BULLET = /^[●◦•\u2022\uf0b7\uf0a7\s]+/;

const clusterStarts = (items) => {
  const xs = items.filter((i) => String(i.s).trim()).sort((a, b) => a.x - b.x);
  const starts = [];
  let edge = -Infinity;
  for (const it of xs) {
    if (it.x - edge > 22) starts.push(it.x);
    edge = Math.max(edge, it.x + String(it.s).trimEnd().length * 5);
  }
  return starts;
};

const entriesOf = (lines, strip) => {
  const out = [];
  for (const ln of lines) {
    let t = tidy(ln.text.replace(BULLET, ''));
    if (strip) t = t.replace(strip, '');
    if (!t) continue;
    const prev = out[out.length - 1];
    const continues = prev && !ln.bullet && !(strip && strip.test(ln.text.replace(BULLET, '')))
      && (/^[a-z(]/.test(t) || /[\/,&-]$/.test(prev) || /\b(and|of|by|on|in|for|to|the|a|an|na|ya|wa|za|kwa)$/i.test(prev));
    if (continues) out[out.length - 1] = `${prev} ${t}`;
    else out.push(t);
  }
  return [...new Set(out.map((v) => v.replace(/[;,.]+$/, '').trim()).filter((v) => v.length > 2 && !/^(Page\b|Property of|Mali ya serikali|Download this)/i.test(v)))];
};

const splitColumns = (items, starts, from = 0) => starts.map((x, i) => {
  const next = starts[i + 1] === undefined ? Infinity : starts[i + 1] - 12;
  return items.filter((t) => t.x >= x - 12 && t.x < next && t.y < from);
});

const pageLines = (page) => lineify(cleanPage(page));

const englishAppendix = (pages) => {
  const find = (re) => pages.findIndex((p) => pageLines(p).some((l) => l.x <= 90 && re.test(l.text) && !/\.{4,}/.test(l.text)));
  const a = find(/^SUGGESTED ASSESSMENT METHODS/);
  const r = find(/^SUGGESTED LEARNING RESOURCES/);
  const n = find(/^SUGGESTED NON-FORMAL ACTIVITIES/);
  if (a < 0) return null;
  const skills = ['Listening and Speaking', 'Reading', 'Grammar in Use', 'Writing'];
  const out = skills.map(() => ({ assessment: [], resources: [], activities: [] }));
  const byColumns = (pageIndex, key, headerRe) => {
    const items = cleanPage(pages[pageIndex]);
    const head = lineify(items).find((l) => headerRe.test(l.text));
    if (!head) return;
    const row = items.filter((t) => Math.abs(t.y - head.y) <= 3);
    const starts = clusterStarts(row).slice(0, 4);
    splitColumns(items, starts, head.y - 1).forEach((col, i) => { if (out[i]) out[i][key] = entriesOf(lineify(col)); });
  };
  byColumns(a, 'assessment', /^Listening and Speaking/);
  if (n >= 0) byColumns(n, 'activities', /^Listening and Speaking/);
  /* resources are shared by every skill: a non-digital and a digital list */
  const shared = [];
  if (r >= 0) {
    const items = cleanPage(pages[r]);
    const head = lineify(items).find((l) => /^Non-digital/i.test(l.text));
    if (head) {
      const row = items.filter((t) => Math.abs(t.y - head.y) <= 3);
      const starts = clusterStarts(row).slice(0, 2);
      splitColumns(items, starts, head.y - 1).forEach((col) => shared.push(...entriesOf(lineify(col))));
    }
  }
  return { skills: out, shared };
};

const swahiliAppendix = (pages) => {
  const first = pages.findIndex((p, i) => i > pages.length / 2 && pageLines(p).some((l) => l.x <= 90 && /^MUHTASARI WA MBINU ZA KUTATHMINI/.test(l.text) && !/\.{4,}/.test(l.text)));
  if (first < 0) return null;
  const rows = {};
  let skill = null;
  const names = [['KUSIKILIZA', 0], ['KUSOMA', 1], ['KUANDIKA', 2], ['SARUFI', 3]];
  for (const page of pages.slice(first)) {
    const items = cleanPage(page);
    const labels = lineify(items.filter((t) => t.x < 150)).filter((l) => l.x <= 90);
    /* the skill names sit in the first column, assessment from ~182, resources from ~357, activities from ~520 */
    const marks = labels.map((l) => ({ y: l.y, k: (names.find(([w]) => l.text.toUpperCase().startsWith(w)) || [])[1] })).filter((v) => v.k !== undefined);
    const body = items.filter((t) => t.x >= 170);
    const colOf = (x) => (x < 350 ? 'assessment' : x < 515 ? 'resources' : 'activities');
    const groups = {};
    for (const t of body) {
      const above = marks.filter((m) => m.y >= t.y - 1).pop();
      if (above) skill = above.k;
      if (skill === null) continue;
      const key = `${skill}|${colOf(t.x)}`;
      (groups[key] = groups[key] || []).push(t);
    }
    for (const [key, list] of Object.entries(groups)) {
      const [k, col] = key.split('|');
      rows[k] = rows[k] || { assessment: [], resources: [], activities: [] };
      rows[k][col].push(...lineify(list));
    }
  }
  const out = [0, 1, 2, 3].map((k) => {
    const r = rows[k] || { assessment: [], resources: [], activities: [] };
    return {
      assessment: entriesOf(r.assessment, /^[a-z]\)\s*/),
      resources: entriesOf(r.resources),
      activities: entriesOf(r.activities, /^\d+\.\s*/),
    };
  });
  return { skills: out, shared: [] };
};

const languageAppendix = (pages, language) => (language === 'sw' ? swahiliAppendix(pages) : englishAppendix(pages));

const readLanguageDesign = (pages, { source = '', lessonsPerWeek, lessonMinutes = 40, learningArea = '', grade, language = 'en' } = {}) => {
  const L = LANG[language];
  const problems = [];
  const notes = [];
  const tables = [];
  const themes = {};
  let theme = null;
  let table = null;
  let bounds = null;
  let mode = 'none';

  for (const raw of pages) {
    const items = cleanPage(raw);
    const lines = lineify(items);
    for (const ln of lines) {
      const m = ln.text.match(L.theme);
      if (m && ln.x <= 90 && !/\.{4,}/.test(ln.text) && ln.text === ln.text.toUpperCase() && /[A-Z]{3}/.test(ln.text)) {
        theme = Number(m[1]);
        if (!themes[theme]) {
          let name = titleCase(cleanItem(m[2]).replace(/^THEME\s*:?\s*/i, '')).replace(/Responsibilites/, 'Responsibilities');
          /* small Kiswahili joining words stay lower case: "Usafi wa Sehemu za Umma" */
          if (language === 'sw') name = name.replace(/(\S) (Wa|Za|Ya|Na|La|Kwa|Cha|Vya)\b/g, (x, a, w) => `${a} ${w.toLowerCase()}`);
          themes[theme] = name;
        }
      }
    }
    const header = findHeader(items, L.header);
    let body = items;
    if (header && theme) {
      table = { theme, strand: [], sub: [], out: [], exp: [], kiq: [], tail: [] };
      tables.push(table);
      bounds = header.x;
      mode = 'table';
      body = items.filter((t) => t.y < header.bottom - 4);
    } else if (mode === 'none') {
      continue;
    }

    let tailLines = [];
    if (mode === 'tail') {
      tailLines = lineify(body);
      body = [];
    } else {
      const bl = lineify(body);
      const core = bl.find((l) => l.x <= 90 && Object.values(L.tail).some((re) => re.test(l.text)));
      if (core) {
        tailLines = bl.filter((l) => l.y <= core.y + 1);
        body = body.filter((t) => t.y > core.y + 2);
        mode = 'tail';
      }
    }

    if (table && bounds && body.length) {
      const cols = { strand: [], sub: [], out: [], exp: [], kiq: [] };
      const b = { ...bounds };
      const first = [...body].sort((a, c) => c.y - a.y);
      const near = (re, want) => (first.find((t) => re.test(String(t.s).trim()) && Math.abs(t.x - want) <= 40) || {}).x;
      const outX = near(/^(By the end of|Kufikia mwisho)/i, b.out);
      if (outX !== undefined && outX < b.out) b.out = outX;
      body.forEach((t) => cols[columnOf(t.x, b)].push(t));
      for (const k of Object.keys(cols)) lineify(cols[k]).forEach((l) => table[k].push(l));
    }
    if (tailLines.length && table) {
      for (const ln of tailLines) {
        if (L.stop.test(ln.text)) { mode = 'none'; break; }
        table.tail.push(ln);
      }
    }
  }
  if (!tables.length) problems.push('No tables were found in this PDF.');

  /* Each table becomes one sub-strand, numbered in order within its theme */
  const ordinal = {};
  const subs = tables.map((t) => {
    ordinal[t.theme] = (ordinal[t.theme] || 0) + 1;
    const id = `${t.theme}.${ordinal[t.theme]}`;

    let lessons;
    const subText = [];
    for (const ln of t.sub) {
      const m = ln.text.match(L.lessons);
      if (m) lessons = Number(m[1] || m[2]);
      const rest = tidy(ln.text.replace(new RegExp(L.lessons.source, 'ig'), ''));
      if (rest) subText.push(rest);
    }
    const skill = tidy(t.strand.map((l) => l.text).join(' ').replace(/^\s*\d{1,2}\.\d{1,2}\.?\s*/, ''));
    /* Lines starting "1.1.1 ..." are the units of the sub-strand (they become the scope) */
    const head = [];
    const units = [];
    for (const text of subText) {
      if (/^\d{1,2}\.\d{1,2}\.?\d{0,2}\s*[:.]?\s*\S/.test(text) && /^\d{1,2}\.\d{1,2}\.\d{1,2}/.test(text)) units.push(text.replace(/^\d{1,2}\.\d{1,2}\.\d{1,2}\s*[:.]?\s*/, ''));
      else if (units.length) units[units.length - 1] += ' ' + text;
      else head.push(text);
    }
    const main = cleanItem(head.join(' ').replace(/^\d{1,2}\.\d{1,2}\.?\s*/, ''));
    const unitTitles = units.map(cleanItem).filter(Boolean);
    const subName = main || unitTitles[0] || '';
    const name = skill && subName && !subName.toLowerCase().startsWith(skill.toLowerCase()) ? `${skill}: ${subName}` : (subName || skill);

    const sub = {
      id,
      name: tidy(name),
      lessons,
      scope: unitTitles,
      outcomes: outcomesOf(t.out),
      experiences: experiencesOf(t.exp),
      key_inquiry_questions: questionsOf(t.kiq),
      ...tailItems(t.tail, L.tail),
    };
    if (!sub.name) problems.push(`Sub-strand ${id}: its name was not found.`);
    for (const f of ['outcomes', 'experiences', 'key_inquiry_questions']) {
      if (!sub[f].length) problems.push(`Sub-strand ${id} ${sub.name}: nothing found for ${f}.`);
    }
    if (!sub.core_competencies.length) notes.push(`Sub-strand ${id} ${sub.name}: nothing found for core_competencies.`);
    return { theme: t.theme, sub };
  });

  /* The tables of a theme come in the same skill order every time */
  const SKILL_ORDER = language === 'sw' ? [0, 1, 2, 3] : [0, 1, 2, 1, 3];
  const appendix = languageAppendix(pages, language);
  if (appendix) {
    const seen = {};
    for (const x of subs) {
      seen[x.theme] = (seen[x.theme] || 0) + 1;
      const row = appendix.skills[SKILL_ORDER[(seen[x.theme] - 1) % SKILL_ORDER.length]];
      if (!row) continue;
      const resources = [...row.resources, ...appendix.shared];
      if (resources.length) x.sub.resources = resources;
      if (row.assessment.length) x.sub.assessment = row.assessment;
      if (row.activities.length) x.sub.activities = row.activities;
    }
  } else {
    notes.push('The appendix with learning resources and assessment methods was not found.');
  }

  /* Lessons the design does not state are shared out from the lessons per week (30 teaching weeks) */
  const known = subs.filter((x) => Number.isInteger(x.sub.lessons));
  const unknown = subs.filter((x) => !Number.isInteger(x.sub.lessons));
  if (unknown.length) {
    const total = (lessonsPerWeek || 0) * 30;
    const left = total - known.reduce((n, x) => n + x.sub.lessons, 0);
    if (left < unknown.length) {
      problems.push(`${unknown.length} sub-strands have no lesson count and there are not enough lessons left to share (${left}).`);
    } else {
      const each = Math.floor(left / unknown.length);
      let extra = left - each * unknown.length;
      for (const x of unknown) {
        x.sub.lessons = each + (extra > 0 ? 1 : 0);
        if (extra > 0) extra -= 1;
        x.sub.lessons_estimated = true;
      }
      notes.push(`${unknown.length} of ${subs.length} sub-strands do not state their lessons in the design, so ${left} lessons were shared out evenly (${lessonsPerWeek} a week x 30 weeks). Edit them if your school splits them differently.`);
    }
  }

  const strands = Object.keys(themes).map(Number).sort((a, b) => a - b).map((n) => {
    const mine = subs.filter((x) => x.theme === n).map((x) => x.sub);
    if (!mine.length) problems.push(`Theme ${n}.0 ${themes[n]}: no tables were found.`);
    return { id: `${n}.0`, name: themes[n], rubric_indicators: [], sub_strands: mine };
  }).filter((s) => s.sub_strands.length);

  const counts = [...new Set(strands.map((s) => s.sub_strands.length))];
  if (counts.length > 1) notes.push(`Themes do not all have the same number of tables (${strands.map((s) => `${s.id}: ${s.sub_strands.length}`).join(', ')}). Check them against the PDF.`);
  const total = strands.reduce((n, s) => n + s.sub_strands.reduce((m, x) => m + (x.lessons || 0), 0), 0);

  const design = {
    source,
    learning_area: learningArea,
    grade,
    lessons_per_week: lessonsPerWeek,
    lesson_minutes: lessonMinutes,
    total_suggested_lessons: total,
    note: 'The suggested number of lessons per sub strand may be less or more depending on the context.',
    strands,
    appendix: { assessment_methods: [], learning_resources: [], non_formal_activities: [] },
  };
  return { design, problems, notes };
};

module.exports = { readLanguageDesign };
