/**
 * Learning resources for a sub-strand whose design does not list any (CRE has no appendix, for example).
 * Nothing is invented about the topic: the list is the usual resources of the learning area, with a few
 * more picked from words in the sub-strand's own learning experiences ("watch a video clip" -> video clips).
 */
const AREAS = [
  { re: /kiswahili/i, items: ['Vitabu vya kiada vya Kiswahili', 'Kamusi ya Kiswahili', 'Vitabu vya ziada na hadithi', 'Chati na kadi za maneno', 'Rekodi za sauti na video', 'Vifaa vya kidijitali'] },
  { re: /english/i, items: ['English textbooks', 'Dictionary and thesaurus', 'Class readers and set texts', 'Charts and flash cards', 'Audio and video recordings', 'Digital devices'] },
  { re: /mathematics/i, items: ['Mathematics textbooks', 'Geometrical instruments (ruler, protractor, compasses, set square)', 'Scientific calculators', 'Graph paper', 'Charts, models and real objects', 'Digital devices'] },
  { re: /integrated science/i, items: ['Integrated Science textbooks', 'Laboratory apparatus and materials', 'Charts, models and specimens', 'Locally available materials', 'Video clips and simulations', 'Digital devices'] },
  { re: /social studies/i, items: ['Social Studies textbooks', 'Atlases, wall maps and globes', 'Pictures and photographs', 'Newspapers and magazines', 'Resource persons', 'Digital devices'] },
  { re: /christian|\bcre\b/i, items: ['Bible (Holy Bible)', 'Christian Religious Education textbooks', 'Bible dictionary and concordance', 'Pictures and photographs', 'Resource persons', 'Digital devices'] },
  { re: /islamic|\bire\b/i, items: ['Qur\'an', 'Islamic Religious Education textbooks', 'Pictures and photographs', 'Resource persons', 'Digital devices'] },
  { re: /hindu|\bhre\b/i, items: ['Holy scriptures', 'Hindu Religious Education textbooks', 'Pictures and photographs', 'Resource persons', 'Digital devices'] },
  { re: /pre-?technical/i, items: ['Pre-Technical Studies textbooks', 'Tools, equipment and materials', 'Drawing instruments and paper', 'Models, samples and charts', 'Resource persons', 'Digital devices'] },
  { re: /agriculture/i, items: ['Agriculture and Nutrition textbooks', 'Farm tools and equipment', 'School garden and farm', 'Seeds, tools and food items', 'Charts and samples', 'Digital devices'] },
  { re: /creative arts|sports/i, items: ['Art and craft materials', 'Musical instruments', 'Sports equipment and playing field', 'Costumes, props and stage', 'Audio and video recordings', 'Digital devices'] },
];
const GENERAL = ['Textbooks', 'Charts and pictures', 'Resource persons', 'Digital devices'];

/* A word in the learning experiences adds a more specific resource (the first few that match are used) */
const CUES = [
  [/\b(video|film|clip|watch|documentary|dramatis)/i, 'Video clips'],
  [/\b(audio|listen to a|recording|song|radio|podcast)/i, 'Audio recordings'],
  [/\b(internet|online|search|digital|website|social media)/i, 'Digital devices with internet'],
  [/\b(poster|chart|flash ?card|illustration|diagram)/i, 'Charts and posters'],
  [/\b(map|atlas|globe)/i, 'Maps and atlases'],
  [/\b(newspaper|magazine|article)/i, 'Newspapers and magazines'],
  [/\b(resource person|visit|field trip|excursion|interview|invite)/i, 'Resource persons and field visits'],
  [/\b(experiment|laborator|apparatus|investigat)/i, 'Laboratory apparatus'],
  [/\b(calculator)/i, 'Calculators'],
  [/\b(dictionary|thesaurus|kamusi)/i, 'Dictionary'],
  [/\b(bible|scripture|quran|verse)/i, 'Holy book'],
  [/\b(garden|crop|soil|seed|farm|plant)/i, 'Garden or farm tools and plants'],
  [/\b(model|specimen|sample|real objects?|realia)/i, 'Models and specimens'],
  [/\b(costume|role[- ]?play|dramatise|perform)/i, 'Costumes and props'],
  [/\b(food|cook|recipe|ingredient|meal)/i, 'Food items and utensils'],
  [/\b(graph|plot|ruler|protractor|compass|draw)/i, 'Drawing and measuring instruments'],
];

const resourcesFor = (design, sub) => {
  const own = sub && sub.resources && sub.resources.length ? sub.resources : (design.appendix && design.appendix.learning_resources) || [];
  if (own.length) return own;

  const base = (AREAS.find((a) => a.re.test(String(design.learning_area || ''))) || { items: GENERAL }).items;
  const text = [sub.name, ...(sub.scope || []), ...(sub.experiences || [])].join(' ');
  const extra = CUES.filter(([re]) => re.test(text)).map(([, label]) => label).slice(0, 3);
  const sw = /kiswahili/i.test(String(design.learning_area || ''));
  return [...new Set([...base.slice(0, 3), ...(sw ? [] : extra), ...base.slice(3)])].slice(0, 6);
};

module.exports = { resourcesFor };
