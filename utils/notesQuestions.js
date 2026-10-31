/* Exam questions made straight from stored notes, without AI.
   Plain code: it finds definition sentences ("Pressure is the force acting per unit area")
   and lists under a heading, and turns them into questions with a marking scheme taken from
   the notes' own words. The questions are plain but they always follow what was taught.

   Returns { mcq: [...], structured: [...] } in the same shape the AI answers use, so the paper
   writer checks them the same way. */

const DEF = /^([A-Z][A-Za-z0-9'\- ]{2,45}?)\s+(?:(?:is|are)\s+(?:defined as\s+|called\s+)?(?:the |a |an )|(?:is|are)\s+(?=(?:used|measured|produced|formed|made|found|given|obtained|caused|possessed|released|stored)\b)|refers to\s+(?:the |a |an )?|means\s+(?:the |a |an )?|(?:is|are)\s+defined as\s+)([a-z].{25,220}?)[.]?$/;
const BAD_START = /^(most|many|why|in|on|your|following|excessive|such|another|other|several|various|during|after|before|as|at|from|with|for|any|every|no|its|their|our|my|his|her|it|this|that|these|those|there|they|he|she|we|you|what|when|where|which|how|if|one|some|each|all|both)\b/i;

const words = (s) => s.split(/\s+/).filter(Boolean).length;

const shuffle = (list, random) => {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const parse = (text) => {
  const defs = [];
  const lists = [];
  const seenTerm = new Set();
  for (const block of String(text || '').split(/\n{2,}/)) {
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
    if (!lines.length) continue;
    for (const full of lines) {
     for (const line of full.split(/(?<=[.!?])\s+(?=[A-Z])/)) {
      const m = DEF.exec(line.trim());
      if (!m) continue;
      /* "A compound" -> "compound"; skip fragments, long run-ons and several-term subjects */
      const term = m[1].trim().replace(/^(?:the|a|an)\s+/i, '');
      const meaning = m[2].trim().replace(/[.;,:]+$/, '');
      if (BAD_START.test(term) || words(term) > 4 || term.length < 3) continue;
      if (/[^A-Za-z' -]|-\s|\s-/.test(term) || /\b(and|or|of the|which|that)\b/i.test(term)) continue;
      if (/[.!?]\s+[A-Z]/.test(meaning) || meaning.length > 170 || /:/.test(meaning)) continue;
      if (seenTerm.has(term.toLowerCase())) continue;
      seenTerm.add(term.toLowerCase());
      defs.push({ term, meaning, sentence: line.trim() });
     }
    }
    const head = lines[0];
    if (/^[A-Z][A-Za-z' -]{3,50}$/.test(head) && words(head) <= 6 && !/\b(is|are|was|were|has|have|represented|derived)\b/i.test(head)) {
      const good = lines.slice(1).filter((l) => l.length >= 25 && l.length <= 200 && !/[:,]$/.test(l));
      if (good.length >= 3) lists.push({ heading: head, items: good });
    }
  }
  return { defs, lists };
};

const fromNotes = (text, { mcq = 0, structured = 0, random = Math.random } = {}) => {
  const { defs, lists } = parse(text);
  const out = { mcq: [], structured: [] };

  /* Multiple choice: name the term from its meaning, or pick the meaning of a term */
  if (defs.length >= 4) {
    shuffle(defs, random).slice(0, mcq).forEach((d, i) => {
      const others = shuffle(defs.filter((x) => x !== d), random).slice(0, 3);
      if (i % 2 === 0) {
        out.mcq.push({
          question: `Which term is described as: "${d.meaning}"?`,
          options: [d.term, ...others.map((o) => o.term)],
          answer: 'A',
          explanation: d.sentence,
        });
      } else {
        out.mcq.push({
          question: `Which of the following best describes the ${d.term}?`,
          options: [d.meaning, ...others.map((o) => o.meaning)].map((o) => o.charAt(0).toUpperCase() + o.slice(1)),
          answer: 'A',
          explanation: d.sentence,
        });
      }
    });
  }

  /* Structured: a definition part, plus an "outline points" part when the notes have a list */
  const pool = shuffle(defs, random);
  const lst = shuffle(lists, random);
  for (let i = 0; i < structured; i += 1) {
    const parts = [];
    const d = pool[i];
    if (d) parts.push({ text: `Define ${d.term}.`, marks: 2, answer: [d.sentence] });
    const l = lst[i];
    if (l) {
      const n = Math.min(3, l.items.length);
      parts.push({ text: `Outline ${n} points about ${l.heading.toLowerCase()}.`, marks: n, answer: l.items.slice(0, Math.max(n, 4)).slice(0, 4) });
    } else if (pool[structured + i]) {
      const d2 = pool[structured + i];
      parts.push({ text: `Explain what is meant by ${d2.term}.`, marks: 2, answer: [d2.sentence] });
    }
    if (parts.length) out.structured.push({ intro: '', parts });
  }
  return out;
};

module.exports = { fromNotes, parse };
