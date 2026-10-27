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

    cached = {
      async generateJson({ prompt, schema }) {
        const res = await client.models.generateContent({
          model,
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
            responseJsonSchema: schema,
            maxOutputTokens: 8192,
            temperature: 0.4,
            httpOptions: { timeout: 45000 },
          },
        });
        return JSON.parse(res.text);
      },
    };
  } catch (err) {
    console.error('Gemini library not available:', err.message);
    cached = null;
  }
  return cached;
};

module.exports = { getGemini };
