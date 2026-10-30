/* ═══════════════════════════════════════════════════════════
   SCHOLAR ANALYTICS — Content store
   File: backend/utils/contentStore.js

   Binds the object store (Backblaze B2) to what the lesson engine
   needs. Every key is built from checked values only, so a request
   can never reach another path in the bucket.
═══════════════════════════════════════════════════════════ */

const DESIGN_KEY = /^[a-z0-9-]{1,60}$/;
const SUB_ID     = /^\d{1,2}\.\d{1,2}$/;
const LANGS      = ['en', 'sw'];
const NOTES_MAX  = 12000;
const BANK_MAX   = 300;   /* saved questions kept for each kind in each sub-strand */

const check = (designKey, subId, lang) => {
  if (!DESIGN_KEY.test(designKey || '')) throw new Error('Invalid design key');
  if (subId !== undefined && !SUB_ID.test(subId)) throw new Error('Invalid sub-strand id');
  if (lang !== undefined && !LANGS.includes(lang)) throw new Error('Invalid language');
};

const createContentStore = (objects) => ({
  async getOutline(designKey, subId, lang) {
    check(designKey, subId, lang);
    return objects.getJson(`content/${designKey}/${subId}/${lang}/outline.json`);
  },
  async putOutline(designKey, subId, lang, outline) {
    check(designKey, subId, lang);
    return objects.putJson(`content/${designKey}/${subId}/${lang}/outline.json`, outline);
  },
  async getLesson(designKey, subId, lang, n) {
    check(designKey, subId, lang);
    return objects.getJson(`content/${designKey}/${subId}/${lang}/lesson-${Number(n)}.json`);
  },
  async putLesson(designKey, subId, lang, n, content) {
    check(designKey, subId, lang);
    return objects.putJson(`content/${designKey}/${subId}/${lang}/lesson-${Number(n)}.json`, content);
  },

  /* All notes for a sub-strand joined into one text, capped */
  async getNotes(designKey, subId) {
    check(designKey, subId);
    const keys = await objects.list(`notes/${designKey}/${subId}/`, 20);
    let text = '';
    for (const key of keys) {
      const note = await objects.getJson(key);
      if (note?.text) text += `${note.text}\n\n`;
      if (text.length >= NOTES_MAX) break;
    }
    return text.slice(0, NOTES_MAX).trim();
  },

  /* Saved questions for a sub-strand: { mcq: [...], structured: [...] } */
  async getBank(designKey, subId) {
    check(designKey, subId);
    const bank = await objects.getJson(`bank/${designKey}/${subId}.json`);
    return { mcq: Array.isArray(bank?.mcq) ? bank.mcq : [], structured: Array.isArray(bank?.structured) ? bank.structured : [] };
  },
  async addToBank(designKey, subId, add) {
    check(designKey, subId);
    const key = `bank/${designKey}/${subId}.json`;
    const bank = await this.getBank(designKey, subId);
    const mcqKey = (q) => String(q.question || '').toLowerCase();
    const strKey = (q) => String(q.parts?.[0]?.text || '').toLowerCase();
    const merge = (old, incoming, k) => {
      const seen = new Set(old.map(k));
      const out = old.slice();
      for (const q of incoming || []) { if (!seen.has(k(q))) { seen.add(k(q)); out.push(q); } }
      return out.slice(-BANK_MAX);
    };
    const next = { mcq: merge(bank.mcq, add.mcq, mcqKey), structured: merge(bank.structured, add.structured, strKey) };
    await objects.putJson(key, next);
    return { mcq: next.mcq.length, structured: next.structured.length };
  },

  /* Keys of every design uploaded to storage */
  async listDesignKeys() {
    const keys = await objects.list('designs/', 300);
    return keys.map((k) => (k.match(/^designs\/([a-z0-9-]{1,60})\.json$/) || [])[1]).filter(Boolean);
  },

  async getDesign(designKey) {
    check(designKey);
    return objects.getJson(`designs/${designKey}.json`);
  },

  /* Used by the superadmin reset */
  async deleteContent(designKey, subId) {
    check(designKey, subId);
    return objects.deletePrefix(`content/${designKey}/${subId}/`);
  },
});

module.exports = { createContentStore, DESIGN_KEY, SUB_ID, NOTES_MAX };
