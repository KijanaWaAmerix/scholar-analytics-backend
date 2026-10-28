/* ═══════════════════════════════════════════════════════════
   SCHOLAR ANALYTICS — Backup AI
   File: backend/utils/backupAi.js

   A second AI service that takes over when Gemini is down or busy,
   so the same work still gets done. Same promise as Gemini:
   generateJson({ prompt, schema }) -> object.

   Settings (Render → Environment). Pick ONE kind:

   1) Any service that works like OpenAI (OpenAI, Groq, DeepSeek, OpenRouter, ...)
        BACKUP_AI_KEY     the key
        BACKUP_AI_MODEL   the model name
        BACKUP_AI_URL     optional, default https://api.openai.com/v1

   2) Anthropic (Claude)
        BACKUP_AI_PROVIDER=anthropic
        BACKUP_AI_KEY     the key
        BACKUP_AI_MODEL   the model name
═══════════════════════════════════════════════════════════ */

/* Pull the JSON object out of a reply, even if it has ```json fences around it */
const parseJsonReply = (text) => {
  const raw = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('The backup AI did not return JSON.');
  return JSON.parse(raw.slice(start, end + 1));
};

const instruction = (prompt, schema) =>
  `${prompt}\n\nReply with ONLY a JSON object that matches this JSON schema. No other text.\n${JSON.stringify(schema)}`;

const withTimeout = async (url, options, ms) => {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try { return await fetch(url, { ...options, signal: ctl.signal }); }
  finally { clearTimeout(timer); }
};

const createBackupAi = ({ provider = 'openai', key, model, url, fetchImpl, timeoutMs = 60000 }) => {
  const doFetch = fetchImpl || ((u, o) => withTimeout(u, o, timeoutMs));
  const name = provider === 'anthropic' ? 'Anthropic' : 'OpenAI-compatible';

  return {
    name,
    model,
    async generateJson({ prompt, schema, pdf }) {
      if (pdf) throw new Error('The backup AI cannot read PDF files.');
      const text = instruction(prompt, schema);

      if (provider === 'anthropic') {
        const res = await doFetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
          body: JSON.stringify({ model, max_tokens: 8192, temperature: 0.4, messages: [{ role: 'user', content: text }] }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(`Backup AI ${res.status}: ${data?.error?.message || 'request failed'}`);
        return parseJsonReply((data.content || []).map((c) => c.text || '').join(''));
      }

      const base = String(url || 'https://api.openai.com/v1').replace(/\/+$/, '');
      const res = await doFetch(`${base}/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model, temperature: 0.4, response_format: { type: 'json_object' },
          messages: [{ role: 'user', content: text }],
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(`Backup AI ${res.status}: ${data?.error?.message || 'request failed'}`);
      return parseJsonReply(data?.choices?.[0]?.message?.content);
    },
  };
};

let cached; /* undefined = not tried, null = not set up */

const getBackupAi = () => {
  if (cached !== undefined) return cached;
  const key = (process.env.BACKUP_AI_KEY || '').trim();
  const model = (process.env.BACKUP_AI_MODEL || '').trim();
  if (!key || !model) { cached = null; return cached; }
  cached = createBackupAi({
    provider: (process.env.BACKUP_AI_PROVIDER || 'openai').toLowerCase(),
    key, model, url: process.env.BACKUP_AI_URL,
  });
  return cached;
};

module.exports = { createBackupAi, getBackupAi, parseJsonReply };
