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

  const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
  const pick = (arr, i) => arr[i % arr.length];
  const NUM = ['', 'one', 'two', 'three', 'four', 'five'];

  /* Multiple choice: name the term, pick the meaning, or pick a true point about a heading */
  const D = shuffle(defs, random);
  const Lm = shuffle(lists, random);
  const mcqMakers = [];
  if (D.length >= 4) {
    D.forEach((d, i) => mcqMakers.push(() => {
      const others = shuffle(D.filter((x) => x !== d), random).slice(0, 3);
      return i % 2 === 0
        ? { question: `Which term is described as: "${d.meaning}"?`, options: [d.term, ...others.map((o) => o.term)], answer: 'A', explanation: d.sentence }
        : { question: `Which of the following best describes the ${d.term}?`, options: [d.meaning, ...others.map((o) => o.meaning)].map(cap), answer: 'A', explanation: d.sentence };
    }));
  }
  if (Lm.length >= 2) {
    Lm.forEach((l) => l.items.slice(0, 2).forEach((item, k) => mcqMakers.push(() => {
      const others = shuffle(Lm.filter((x) => x !== l).flatMap((x) => x.items), random).slice(0, 3);
      if (others.length < 3) return null;
      return { question: k === 0 ? `Which of the following is a point about ${l.heading.toLowerCase()}?` : `Which one of these is correct about ${l.heading.toLowerCase()}?`, options: [item, ...others], answer: 'A', explanation: `${l.heading}: ${item}` };
    })));
  }
  /* alternate the kinds so the paper is not all definitions */
  const mixed = [];
  const defMk = mcqMakers.slice(0, D.length >= 4 ? D.length : 0);
  const lstMk = mcqMakers.slice(defMk.length);
  for (let i = 0; i < Math.max(defMk.length, lstMk.length); i += 1) {
    if (defMk[i]) mixed.push(defMk[i]);
    if (lstMk[i]) mixed.push(lstMk[i]);
  }
  for (const mk of mixed) {
    if (out.mcq.length >= mcq) break;
    const q = mk();
    if (q) out.mcq.push(q);
  }

  /* Structured: parts that rise from recall (Define, State, List) to Outline, Describe, Explain, Discuss, Differentiate */
  const ITEMISED = /^(types|kinds|examples|uses|causes|effects|advantages|disadvantages|characteristics|features|ways|methods|functions|steps|factors|reasons|benefits|properties|sources|symptoms|stages|rules|roles|qualities|signs|safety)\b/i;
  const RECALL = ['State', 'List', 'Identify', 'Name', 'Give'];
  const WIDER = ['Outline', 'Describe', 'Explain', 'Discuss'];
  const DEFINE = (t, i) => pick([`Define the term ${t}.`, `State the meaning of ${t}.`, `What is meant by ${t}?`, `Explain the term ${t}.`], i);

  const pool = shuffle(defs, random);
  const lst = shuffle(lists, random);
  let di = 0; let li = 0; let cw = 0;
  const listPart = (l, hard) => {
    const n = Math.min(hard ? 3 : 3, l.items.length);
    const h = l.heading.toLowerCase();
    const word = NUM[n] || String(n);
    const text = ITEMISED.test(l.heading)
      ? (hard ? `${pick(['Describe', 'Outline'], cw)} ${word} ${h}.` : `${pick(RECALL, cw)} ${word} ${h}.`)
      : `${pick(WIDER, cw)} ${word} points ${/^importance of\b/i.test(h) ? 'on the' : 'about'} ${h}.`;
    cw += 1;
    return { text, marks: n, answer: l.items.slice(0, Math.max(n, 4)).slice(0, 4) };
  };

  for (let i = 0; i < structured; i += 1) {
    const parts = [];
    const d1 = pool[di];
    const at = d1 ? defs.indexOf(d1) : -1;
    const d2 = at >= 0 ? (defs[at + 1] || defs[at - 1]) : null;   /* the next definition in the notes: usually a related term */
    const l1 = lst[li]; const l2 = lst[li + 1];
    if (d1) { parts.push({ text: DEFINE(d1.term, i), marks: 2, answer: [d1.sentence] }); di += 1; }
    if (l1) { parts.push(listPart(l1, false)); li += 1; }
    if (d1 && d2 && (i % 2 === 0 || !l1)) {
      parts.push({ text: `Differentiate between ${d1.term} and ${d2.term}.`, marks: 2, answer: [d1.sentence, d2.sentence] });
    }
    if (l2 && parts.length < 4) { parts.push(listPart(l2, true)); li += 1; }
    if (parts.length) out.structured.push({ intro: '', parts });
  }
  return out;
};

module.exports = { fromNotes, parse };
