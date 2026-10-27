/* ═══════════════════════════════════════════════════════════
   SCHOLAR ANALYTICS — Notes writer
   File: backend/utils/notesWriter.js

   Gemini writes short, ORIGINAL notes for each sub-strand from the
   KICD design. The notes are saved once and reviewed by a person.
   They then back up the lessons (and later the exams), so the app
   leans on stored, checked notes and not only on a live Gemini call.

   Nothing is copied from any website. Notes are written only from
   the design's scope, outcomes and activities.

   ai : { generateJson({ prompt, schema }) -> object }
═══════════════════════════════════════════════════════════ */

const { cleanText, languageFor, findSubStrand } = require('./lessonContent');

const NOTES_MAX = 12000;

const NOTES_SCHEMA = {
  type: 'object',
  properties: {
    sections: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          heading: { type: 'string' },
          points : { type: 'array', items: { type: 'string' } },
        },
        required: ['heading', 'points'],
      },
    },
  },
  required: ['sections'],
};

const notesPrompt = ({ design, sub, lang }) => [
  `You are an experienced Kenyan CBC teacher writing short study notes for ${design.grade} ${design.learning_area}, sub-strand "${sub.name}".`,
  'Write ORIGINAL notes in your own words. Do not copy from any book or website. Do not include web addresses.',
  'Make one section for each item in the scope. Each section has a short heading and 3 to 6 clear points: definitions, key facts, simple examples from Kenyan daily life, and (where it fits) a short worked example or a common mistake to avoid.',
  'Only use what belongs to the scope and outcomes below. Be accurate. If you are not sure of a fact, leave it out.',
  lang === 'sw' ? 'Write everything in Kiswahili sanifu.' : 'Write in simple, clear English for 13 to 14 year olds.',
  `<design>${JSON.stringify({
    scope: sub.scope, specific_learning_outcomes: sub.outcomes, learning_experiences: sub.experiences,
  })}</design>`,
].join('\n');

/* Sections -> plain text, capped */
const toText = (sections) => {
  const text = (sections || [])
    .map((s) => {
      const heading = cleanText(s?.heading, 120);
      const points = (Array.isArray(s?.points) ? s.points : []).map((p) => cleanText(p, 500)).filter(Boolean);
      return heading && points.length ? `${heading}\n${points.map((p) => `- ${p}`).join('\n')}` : '';
    })
    .filter(Boolean)
    .join('\n\n');
  return text.slice(0, NOTES_MAX);
};

/** Write the notes of one sub-strand. Returns the text, or '' if unusable. */
const writeNotes = async ({ ai, design, subStrandId }) => {
  if (!ai) throw new Error('Gemini is not set up (GEMINI_API_KEY).');
  const found = findSubStrand(design, subStrandId);
  if (!found) throw new Error(`Unknown sub-strand ${subStrandId}.`);

  const out = await ai.generateJson({
    prompt: notesPrompt({ design, sub: found.sub, lang: languageFor(design) }),
    schema: NOTES_SCHEMA,
  });
  const text = toText(out?.sections);
  return text.length >= 200 ? text : '';
};

module.exports = { writeNotes, notesPrompt, toText, NOTES_MAX };
