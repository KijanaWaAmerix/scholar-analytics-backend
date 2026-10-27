/* ═══════════════════════════════════════════════════════════
   SCHOLAR ANALYTICS — KICD design importer
   File: backend/utils/designImporter.js

   Turns a KICD curriculum design PDF into the structured design
   JSON the app uses (same shape as data/curriculum/*.json).

   Gemini reads the PDF itself (tables included). It is asked for
   one sub-strand at a time, then the result is CHECKED here, and a
   person reviews the file before it is used.

   ai : { generateJson({ prompt, schema, pdf }) -> object }
═══════════════════════════════════════════════════════════ */

const { cleanText } = require('./lessonContent');

const str = { type: 'string' };
const strList = { type: 'array', items: str };

const SUB_LIST_SCHEMA = {
  type: 'object',
  properties: {
    learning_area: str,
    grade: { type: 'integer' },
    strands: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: str, name: str,
          rubric_indicators: strList,
          sub_strands: {
            type: 'array',
            items: {
              type: 'object',
              properties: { id: str, name: str, lessons: { type: 'integer' } },
              required: ['id', 'name', 'lessons'],
            },
          },
        },
        required: ['id', 'name', 'sub_strands'],
      },
    },
  },
  required: ['learning_area', 'grade', 'strands'],
};

const SUB_DETAIL_SCHEMA = {
  type: 'object',
  properties: {
    scope: strList,
    outcomes: strList,
    experiences: strList,
    key_inquiry_questions: strList,
    core_competencies: strList,
    pcis: strList,
    values: strList,
    links: strList,
  },
  required: ['scope', 'outcomes', 'experiences', 'key_inquiry_questions'],
};

const APPENDIX_SCHEMA = {
  type: 'object',
  properties: {
    assessment_methods: strList,
    learning_resources: strList,
    non_formal_activities: strList,
  },
  required: ['assessment_methods', 'learning_resources'],
};

const COPY_RULES =
  'Copy the wording from the document exactly. Do not add, summarise or invent anything. ' +
  'Remove list markers such as bullets and "a)". Do not include web addresses.';

const listPrompt = () => [
  'This PDF is a Kenyan KICD (CBC) curriculum design.',
  'List every strand and every sub-strand with its number (for example strand "1.0", sub-strand "1.1"), its name and the suggested number of lessons.',
  'Also give the learning area, the grade as a number, and for each strand the indicators from its "Suggested Assessment Rubric" (the Indicator column).',
  COPY_RULES,
].join('\n');

const detailPrompt = (sub) => [
  'This PDF is a Kenyan KICD (CBC) curriculum design.',
  `Extract only sub-strand ${sub.id} "${sub.name}".`,
  '- scope: each bullet in the Sub Strand column (the content).',
  '- outcomes: each specific learning outcome (a, b, c ...), without the lead-in "By the end of the sub strand...".',
  '- experiences: each suggested learning experience, without the lead-in "The learner is guided to:". Include the project or service-learning item if there is one.',
  '- key_inquiry_questions: each suggested key inquiry question.',
  '- core_competencies: each item under "Core competencies to be developed", keeping "Name: explanation".',
  '- pcis: each item under "Pertinent and Contemporary Issues".',
  '- values: each item under "Values".',
  '- links: each item under "Links to other learning areas".',
  COPY_RULES,
].join('\n');

const appendixPrompt = () => [
  'This PDF is a Kenyan KICD (CBC) curriculum design.',
  'From the appendix, list: assessment_methods (suggested assessment methods), learning_resources (suggested learning resources) and non_formal_activities (suggested non-formal activities).',
  COPY_RULES,
].join('\n');

const clean = (list, max = 40, len = 600) =>
  (Array.isArray(list) ? list : []).map((v) => cleanText(v, len)).filter(Boolean).slice(0, max);

const SUB_ID = /^\d{1,2}\.\d{1,2}$/;
const STRAND_ID = /^\d{1,2}\.0$/;

/**
 * Check a design. Returns a list of problems (empty = fine).
 * Used on freshly imported designs and on the ones already shipped.
 */
const validateDesign = (design) => {
  const problems = [];
  const need = (cond, msg) => { if (!cond) problems.push(msg); };

  need(design && typeof design === 'object', 'The design is not an object.');
  if (!design || typeof design !== 'object') return problems;

  need(typeof design.learning_area === 'string' && design.learning_area, 'Missing learning area.');
  need(Number.isInteger(design.grade) && design.grade >= 1 && design.grade <= 9, 'Grade must be a number from 1 to 9.');
  need(Number.isInteger(design.lessons_per_week) && design.lessons_per_week > 0, 'Missing lessons per week.');
  need(Number.isInteger(design.lesson_minutes) && design.lesson_minutes > 0, 'Missing lesson minutes.');
  need(Array.isArray(design.strands) && design.strands.length > 0, 'No strands.');

  const seen = new Set();
  let total = 0;
  for (const strand of design.strands || []) {
    need(STRAND_ID.test(strand.id || ''), `Strand id "${strand.id}" should look like 1.0`);
    need(Array.isArray(strand.sub_strands) && strand.sub_strands.length > 0, `Strand ${strand.id} has no sub-strands.`);
    for (const sub of strand.sub_strands || []) {
      const at = `Sub-strand ${sub.id}`;
      need(SUB_ID.test(sub.id || ''), `${at}: id should look like 1.1`);
      need(!seen.has(sub.id), `${at}: id is used twice.`);
      seen.add(sub.id);
      need(typeof sub.name === 'string' && sub.name, `${at}: missing name.`);
      need(Number.isInteger(sub.lessons) && sub.lessons >= 1 && sub.lessons <= 60, `${at}: lessons must be a number from 1 to 60.`);
      need(Array.isArray(sub.outcomes) && sub.outcomes.length > 0, `${at}: no specific learning outcomes.`);
      need(Array.isArray(sub.experiences) && sub.experiences.length > 0, `${at}: no learning experiences.`);
      need(Array.isArray(sub.key_inquiry_questions) && sub.key_inquiry_questions.length > 0, `${at}: no key inquiry questions.`);
      need(Array.isArray(sub.scope) && sub.scope.length > 0, `${at}: no scope (content).`);
      total += Number.isInteger(sub.lessons) ? sub.lessons : 0;
    }
  }
  if (design.total_suggested_lessons !== undefined) {
    need(design.total_suggested_lessons === total,
      `Lessons add up to ${total}, but the design says ${design.total_suggested_lessons}.`);
  }
  return problems;
};

/**
 * Build the design from the PDF with Gemini.
 * options: { pdf: Buffer, source, lessonsPerWeek, lessonMinutes, onProgress }
 * Returns { design, problems }.
 */
const importDesign = async ({ ai, pdf, source, lessonsPerWeek, lessonMinutes = 40, onProgress = () => {} }) => {
  if (!ai) throw new Error('Gemini is not set up (GEMINI_API_KEY).');
  if (!Buffer.isBuffer(pdf) || pdf.length < 1000) throw new Error('The PDF is empty.');
  if (!Number.isInteger(lessonsPerWeek) || lessonsPerWeek < 1) throw new Error('Give the lessons per week.');

  const call = async (prompt, schema) => {
    let last;
    for (let i = 0; i < 3; i += 1) {
      try { return await ai.generateJson({ prompt, schema, pdf }); }
      catch (err) { last = err; await new Promise((r) => setTimeout(r, 1500 * (i + 1))); }
    }
    throw last;
  };

  onProgress('Reading the list of strands and sub-strands…');
  const list = await call(listPrompt(), SUB_LIST_SCHEMA);

  const strands = [];
  let total = 0;
  for (const s of list.strands || []) {
    const subs = [];
    for (const sub of s.sub_strands || []) {
      onProgress(`Reading sub-strand ${sub.id} ${sub.name}…`);
      const d = await call(detailPrompt(sub), SUB_DETAIL_SCHEMA);
      subs.push({
        id: cleanText(sub.id, 10),
        name: cleanText(sub.name, 150),
        lessons: sub.lessons,
        scope: clean(d.scope),
        outcomes: clean(d.outcomes),
        experiences: clean(d.experiences),
        key_inquiry_questions: clean(d.key_inquiry_questions),
        core_competencies: clean(d.core_competencies),
        pcis: clean(d.pcis),
        values: clean(d.values),
        links: clean(d.links),
      });
      total += Number.isInteger(sub.lessons) ? sub.lessons : 0;
    }
    strands.push({
      id: cleanText(s.id, 10),
      name: cleanText(s.name, 150),
      rubric_indicators: clean(s.rubric_indicators),
      sub_strands: subs,
    });
  }

  onProgress('Reading the appendix…');
  const appendix = await call(appendixPrompt(), APPENDIX_SCHEMA);

  const design = {
    source: cleanText(source, 300),
    learning_area: cleanText(list.learning_area, 100),
    grade: list.grade,
    lessons_per_week: lessonsPerWeek,
    lesson_minutes: lessonMinutes,
    total_suggested_lessons: total,
    note: 'The suggested number of lessons per sub strand may be less or more depending on the context.',
    strands,
    appendix: {
      assessment_methods: clean(appendix.assessment_methods),
      learning_resources: clean(appendix.learning_resources),
      non_formal_activities: clean(appendix.non_formal_activities),
    },
  };

  return { design, problems: validateDesign(design) };
};

module.exports = {
  importDesign, validateDesign, listPrompt, detailPrompt, appendixPrompt,
  SUB_LIST_SCHEMA, SUB_DETAIL_SCHEMA, APPENDIX_SCHEMA,
};
