/**
 * Learning resources for ONE lesson.
 *
 * Every lesson gets Textbooks and Digital devices. Between them go the resources the lesson itself calls for,
 * chosen from the design's own list when it has one (otherwise from the usual list of the learning area):
 * a geometrical set only when the lesson draws or measures, graph paper only when it plots, gardening tools only when
 * it plants. A lesson on integers is not given a geometrical set.
 */
const AREAS = [
  { re: /kiswahili/i, general: 'Chati na kadi za maneno', items: ['Kamusi ya Kiswahili', 'Vitabu vya ziada na hadithi', 'Chati na kadi za maneno', 'Rekodi za sauti', 'Video', 'Picha na michoro'] },
  { re: /english/i, general: 'Charts and flash cards', items: ['Dictionary and thesaurus', 'Class readers and set texts', 'Charts and flash cards', 'Audio recordings', 'Video clips', 'Newspapers and magazines', 'Games and puzzles'] },
  { re: /mathematics/i, general: 'Charts and models', items: ['Number lines and number cards', 'Geometrical instruments (ruler, protractor, compasses, set square)', 'Scientific calculators', 'Graph paper', 'Charts and models', 'Real objects'] },
  { re: /integrated science/i, general: 'Charts and models', items: ['Laboratory apparatus and materials', 'Charts and models', 'Specimens and samples', 'Locally available materials', 'Video clips and simulations'] },
  { re: /social studies/i, general: 'Pictures and photographs', items: ['Atlases, wall maps and globes', 'Pictures and photographs', 'Newspapers and magazines', 'Charts and diagrams', 'Resource persons', 'Video clips'] },
  { re: /christian|\bcre\b/i, general: 'Bible', items: ['Bible', 'Bible dictionary and concordance', 'Pictures and charts', 'Resource persons', 'Video clips'] },
  { re: /islamic|\bire\b/i, general: "Qur'an", items: ["Qur'an", 'Pictures and charts', 'Resource persons', 'Video clips'] },
  { re: /hindu|\bhre\b/i, general: 'Holy scriptures', items: ['Holy scriptures', 'Pictures and charts', 'Resource persons', 'Video clips'] },
  { re: /pre-?technical/i, general: 'Samples and models', items: ['Tools, equipment and materials', 'Drawing instruments and paper', 'Samples and models', 'Charts and pictures', 'Resource persons', 'Video clips'] },
  { re: /agriculture/i, general: 'Charts and samples', items: ['Farm tools and equipment', 'School garden or farm', 'Seeds, plants and soil samples', 'Food items and kitchen utensils', 'Charts and samples', 'Resource persons', 'Video clips'] },
  { re: /creative arts|sports/i, general: 'Art and craft materials', items: ['Art and craft materials', 'Musical instruments', 'Sports equipment and playing field', 'Costumes and props', 'Audio recordings', 'Video clips'] },
];
const GENERAL_ITEMS = ['Charts and pictures', 'Resource persons'];

/* what a resource is (left) and which words in a lesson call for it (right) */
const RULES = [
  [/geometr|instrument|protractor|compass|ruler|set square|mathematical set/i, /angle|triang|construct|circle|polygon|measur|draw|protractor|compass|bisect|locus|symmetr|transform|reflect|rotat|translat|scale|bearing|sketch|perpendicular|parallel|arc\b|radius|diameter|geometr/i],
  [/calculator/i, /calculat|percent|interest|compound|root|power|standard form|\bvat\b|tax|profit|loss|ratio|speed|trigonom|sine|cosine|tangent|logarithm|surd|discount|commission/i],
  [/graph|squared|grid/i, /graph|plot|coordinate|cartesian|gradient|axis|axes|histogram|table of values|inequalit|linear equation/i],
  [/number (line|card|chart)|abacus|counters|place value/i, /integer|number|fraction|decimal|place value|operation|addition|subtract|multipl|divi|factor|multiple|prime|negative|sequence|pattern|order|compar/i],
  [/laborator|apparatus|chemical|test tube|bunsen|microscope/i, /experiment|investigat|apparatus|laborator|test|heat|measure|mix|separat|dissolv|react|burn|filter|distill|evaporat|observe|magnet|circuit|bulb|microscope|thermometer/i],
  [/specimen|sample|realia|real objects?|locally available|food items|seeds/i, /specimen|sample|collect|observe|identify|real objects?|classify|examine|different types|local|material|food|seed|leaf|plant|animal|soil|rock/i],
  [/model|chart|poster|picture|photograph|diagram|realia|illustrat|flash ?card|cards?/i, /chart|poster|picture|photograph|diagram|model|illustrat|label|display|flash ?card|cartoon/i],
  [/map|atlas|globe/i, /map|atlas|globe|location|locate|climate|relief|continent|region|country|countries|boundar|latitude|longitude|distribution|settlement|river|mountain|ocean|population/i],
  [/newspaper|magazine|article/i, /newspaper|magazine|article|advert|headline|current|report|news/i],
  [/video|film|clip|simulation|animation/i, /video|clip|watch|film|documentary|simulat|animation|demonstrat|dramati|recorded|view /i],
  [/audio|recording|song|radio/i, /audio|listen|record|song|radio|podcast|music|pronunc|dialogue|bulletin|oral|speech/i],
  [/garden|farm|tools|equipment|compost|nursery/i, /garden|plant|seed|soil|crop|farm|weed|compost|mulch|prune|nursery|transplant|harvest|tool|livestock|animal|feed|poultry|fish|bee|hay|forage|pest|disease|irrigat|manure|fertili[sz]er|dig|prepare the|seedbed/i],
  [/food|kitchen|utensil|cook|ingredient/i, /food|cook|meal|nutri|recipe|ingredient|diet|prepar|bake|boil|fry|serve|hygiene|kitchen|menu|snack|balanced|vitamin|protein|carbohydrate/i],
  [/bible|holy|qur|scripture/i, /bible|verse|scripture|qur|gospel|psalm|prayer|read|text|passage|book of|story|parable|teaching of|commandment|worship|hadith|surah|chapter/i],
  [/resource person|visit|field|interview/i, /resource person|visit|invite|interview|field|excursion|talk to|survey|community|guest|speaker|expert|professional|elder/i],
  [/musical|drum|percussion|string|wind|keyboard/i, /music|song|sing|instrument|rhythm|drum|melody|play a|beat|tune|choir|dance|perform|compose|note|pitch|tempo/i],
  [/sport|ball|playing field|gym|athlet|net/i, /game|sport|ball|run|jump|throw|athlet|exercise|team|football|netball|volleyball|basketball|hockey|swim|race|fitness|warm|stretch|gymnastic|rope|relay/i],
  [/costume|props|stage/i, /role|drama|costume|perform|act\b|acting|dramati|play\b|stage|mime|puppet|skit|narrat|sketch/i],
  [/art|craft|paint|clay|material|paper|fabric|colour/i, /draw|paint|colour|craft|sculpt|model|clay|weav|collage|print|design|decorat|mould|carv|sketch|pattern|batik|tie|dye|stitch|knit/i],
  [/drawing|paper|tools, equipment and materials/i, /draw|design|sketch|measure|cut|join|assemble|construct|make|model|fabricat|plan|drawing|tool|workshop|build|repair|install|wire|circuit|pipe|wood|metal/i],
  [/dictionary|thesaurus|kamusi/i, /dictionary|thesaurus|meaning|vocabular|synonym|antonym|spell|word|kamusi|maana|msamiati/i],
  [/reader|set text|novel|storybook|hadithi|vitabu vya ziada/i, /read|story|poem|play|novel|text|character|plot|theme|hadithi|shairi|soma|kitabu|tamthilia|riwaya/i],
  [/game|puzzle|quiz|crossword/i, /game|puzzle|quiz|crossword|riddle|competition|guess|bingo|race|play/i],
];

/* resources every lesson has, and the ones that only repeat them */
const COMMON = /text ?books?|course books?|digital|print|reading materials|reference|electronic|online|internet|devices?|^information|different sources|vitabu vya kiada|vifaa vya kidijitali|^general environment/i;

const stems = (t) => new Set((String(t).toLowerCase().match(/[a-z]{4,}/g) || []).map((w) => w.slice(0, 5)));

const wb = (re) => new RegExp(`\\b(?:${re.source})`, 'i');

const calls = (item, lessonText) => {
  let known = false;
  for (const [what, words] of RULES) {
    if (what.test(item)) {
      known = true;
      if (wb(words).test(lessonText)) return true;
    }
  }
  if (known) return false;
  /* an item the rules do not know is used when the lesson mentions one of its own words */
  const mine = stems(lessonText);
  return [...stems(item)].some((w) => mine.has(w));
};

const resourcesFor = (design, sub, lessonText = '') => {
  const area = String(design.learning_area || '');
  const sw = /kiswahili/i.test(area);
  const text = String(lessonText || [sub.name, ...(sub.outcomes || [])].join(' '));

  const own = sub.resources && sub.resources.length ? sub.resources : (design.appendix && design.appendix.learning_resources) || [];
  const catalogue = (AREAS.find((a) => a.re.test(area)) || { items: GENERAL_ITEMS, general: 'Charts and pictures' });
  const pool = (own.length ? own : catalogue.items).filter((x) => !COMMON.test(x));

  const chosen = pool.filter((item) => calls(item, text)).slice(0, 4);
  /* a lesson that calls for nothing in particular still gets one plain classroom resource */
  if (!chosen.length) chosen.push(pool.find((x) => /chart|picture|model|sample|real/i.test(x)) || catalogue.general);

  return [sw ? 'Vitabu vya kiada' : 'Textbooks', ...chosen, sw ? 'Vifaa vya kidijitali' : 'Digital devices'];
};

module.exports = { resourcesFor };
