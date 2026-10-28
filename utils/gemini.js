/* ═══════════════════════════════════════════════════════════
   SCHOLAR ANALYTICS — Gemini client
   File: backend/utils/gemini.js

   Thin wrapper so the rest of the code only sees
   generateJson({ prompt, schema }) -> object.

   Settings (Render → Environment):
     GEMINI_API_KEY   the key (set it only on Render, never in code)
     GEMINI_MODEL     optional, default gemini-flash-latest
═══════════════════════════════════════════════════════════ */

let cached; /* undefined = not tried, null = not available */

const getGemini = () => {
  if (cached !== undefined) return cached;
  if (!process.env.GEMINI_API_KEY) { cached = null; return cached; }

  try {
    const { GoogleGenAI } = require('@google/genai');
    const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const model  = process.env.GEMINI_MODEL || 'gemini-flash-latest';

    /* GEMINI_MODEL first, then any in GEMINI_FALLBACK_MODELS (comma separated),
       used only when the first is busy or slow */
    const models = [model, ...String(process.env.GEMINI_FALLBACK_MODELS || '').split(',').map((m) => m.trim()).filter(Boolean)];
    const busy = (err) => /\b(429|500|502|503|504)\b|unavailable|deadline|overloaded|high demand|timed? ?out/i.test(String(err?.message || err));

    const callModel = async (name, { prompt, schema, pdf }) => {
      const res = await client.models.generateContent({
        model: name,
        contents: pdf
          ? [{ role: 'user', parts: [
              { inlineData: { mimeType: 'application/pdf', data: pdf.toString('base64') } },
              { text: prompt },
            ] }]
          : prompt,
        config: {
          responseMimeType: 'application/json',
          responseJsonSchema: schema,
          maxOutputTokens: pdf ? 16384 : 8192,
          temperature: 0.4,
          httpOptions: { timeout: pdf ? 120000 : 45000 },
        },
      });
      return JSON.parse(res.text);
    };

    cached = {
      async generateJson(args) {
        let last;
        for (const name of models) {
          try { return await callModel(name, args); }
          catch (err) { last = err; if (!busy(err)) throw err; }
        }
        throw last;
      },
    };
  } catch (err) {
    console.error('Gemini library not available:', err.message);
    cached = null;
  }
  return cached;
};

module.exports = { getGemini };
