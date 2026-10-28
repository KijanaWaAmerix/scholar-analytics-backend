/* Fill your storage bucket with lessons and exam questions while Gemini works,
   so the app can keep going from saved content when Gemini is down.

   Run on your own computer (needs GEMINI_API_KEY and STORAGE_* in .env):

     node pregenerate.js <designKey> [--lessons] [--questions] [--sub 1.1] [--mcq 20] [--structured 6]

   --lessons     write every lesson of every sub-strand (5 lessons per Gemini call)
   --questions   write a bank of exam questions for every sub-strand
   --sub 1.1     only this sub-strand
   Neither --lessons nor --questions means both.
   It skips what is already saved, so you can stop and run it again any time. */
require('dotenv').config();
const designs = require('./data/curriculum');
const { getGemini } = require('./utils/gemini');
const { getObjectStore } = require('./utils/objectStore');
const { createContentStore, DESIGN_KEY } = require('./utils/contentStore');
const { createLessonEngine, languageFor } = require('./utils/lessonContent');
const { createPaperWriter } = require('./utils/examPaper');

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const args = process.argv.slice(2);
  const flag = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
  const key = args.find((a) => !a.startsWith('--') && a !== flag('--sub') && a !== flag('--mcq') && a !== flag('--structured'));
  const wantLessons = args.includes('--lessons') || !args.includes('--questions');
  const wantQuestions = args.includes('--questions') || !args.includes('--lessons');
  const mcqTarget = Number(flag('--mcq') || 20);
  const strTarget = Number(flag('--structured') || 6);
  const only = flag('--sub');

  if (!DESIGN_KEY.test(key || '')) {
    console.error('Usage: node pregenerate.js <designKey> [--lessons] [--questions] [--sub 1.1] [--mcq 20] [--structured 6]');
    console.error('Designs: ' + Object.keys(designs).join(', '));
    process.exit(1);
  }
  const objects = getObjectStore();
  const ai = getGemini();
  if (!objects) { console.error('Storage settings are missing (STORAGE_*).'); process.exit(1); }
  if (!ai) { console.error('GEMINI_API_KEY is not set.'); process.exit(1); }

  const store = createContentStore(objects);
  const design = (await store.getDesign(key)) || designs[key];
  if (!design) { console.error('Unknown design.'); process.exit(1); }

  const engine = createLessonEngine({ ai, store });
  const writer = createPaperWriter({
    ai,
    notes: (k, s) => store.getNotes(k, s),
    bank: { get: (k, s) => store.getBank(k, s), add: (k, s, a) => store.addToBank(k, s, a) },
  });

  const subs = design.strands.flatMap((s) => s.sub_strands).filter((s) => !only || s.id === only);
  if (!subs.length) { console.error('No such sub-strand.'); process.exit(1); }
  console.log(`${design.learning_area} Grade ${design.grade}, language ${languageFor(design)}: ${subs.length} sub-strand(s)\n`);

  let problems = 0;
  for (const sub of subs) {
    if (wantLessons) {
      for (let from = 1; from <= sub.lessons; from += 5) {
        const to = Math.min(from + 4, sub.lessons);
        process.stdout.write(`Lessons ${sub.id} ${sub.name} ${from}-${to}… `);
        try {
          const r = await engine.getLessons({ design, designKey: key, subStrandId: sub.id, from, to });
          const fromDesign = r.lessons.filter((l) => l.source === 'design').length;
          console.log(fromDesign ? `${r.lessons.length - fromDesign} saved, ${fromDesign} not written (try again later)` : 'saved');
          if (fromDesign) problems += 1;
          if (r.ai.used) await pause(2000);
        } catch (err) { console.log('failed: ' + err.message); problems += 1; }
      }
    }
    if (wantQuestions) {
      process.stdout.write(`Questions ${sub.id} ${sub.name}… `);
      try {
        const bank = await store.getBank(key, sub.id);
        const needM = Math.max(0, mcqTarget - bank.mcq.length);
        const needS = Math.max(0, strTarget - bank.structured.length);
        if (!needM && !needS) { console.log(`already has ${bank.mcq.length} + ${bank.structured.length}`); continue; }
        const r = await writer.writePart({ design, designKey: key, subStrandId: sub.id, mcq: Math.min(needM, 30), structured: Math.min(needS, 10), mode: 'gemini' });
        console.log(`added ${r.mcq.length} multiple choice and ${r.structured.length} structured`);
        if (r.short.mcq || r.short.structured) problems += 1;
        await pause(2000);
      } catch (err) { console.log('failed: ' + err.message); problems += 1; }
    }
  }
  console.log(problems ? `\nDone, with ${problems} problem(s). Run the same command again to fill the gaps.` : '\nDone. Everything is saved in your bucket.');
})().catch((e) => { console.error(e.message); process.exit(1); });
