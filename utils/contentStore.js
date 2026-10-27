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
