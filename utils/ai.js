/* ═══════════════════════════════════════════════════════════
   SCHOLAR ANALYTICS — The AI the app uses
   File: backend/utils/ai.js

   Gemini first. If Gemini fails (busy, down, wrong answer) the backup AI
   does the same job. If only one of them is set up, that one is used.
   PDF reading is Gemini only.
═══════════════════════════════════════════════════════════ */

const { getGemini }   = require('./gemini');
const { getBackupAi } = require('./backupAi');

/* primary / backup can be passed in for tests */
const combine = (primary, backup) => {
  if (!primary && !backup) return null;
  if (!backup) return primary;
  if (!primary) return backup;
  return {
    async generateJson(args) {
      try { return await primary.generateJson(args); }
      catch (err) {
        if (args.pdf) throw err;                  /* backup cannot read PDFs */
        console.error('Gemini failed, using the backup AI:', String(err.message || err).slice(0, 160));
        return backup.generateJson(args);
      }
    },
  };
};

const getAi = () => combine(getGemini(), getBackupAi());

module.exports = { getAi, combine };
