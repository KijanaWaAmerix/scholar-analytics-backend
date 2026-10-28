/* ═══════════════════════════════════════════════════════════
   SCHOLAR ANALYTICS — Setup check
   File: backend/utils/setupCheck.js

   Tells an admin whether the lesson writing set-up works:
   storage (Backblaze) and Gemini. It really tries each one with a
   tiny request, and reports the result in plain words.
   Secrets are never shown.
═══════════════════════════════════════════════════════════ */

const STORAGE_NAMES = ['STORAGE_ENDPOINT', 'STORAGE_REGION', 'STORAGE_BUCKET', 'STORAGE_KEY_ID', 'STORAGE_SECRET_KEY'];

/* Short message with any secret value removed */
const safeMessage = (err, env) => {
  let text = String(err?.message || err || 'Unknown error');
  [env.GEMINI_API_KEY, env.STORAGE_KEY_ID, env.STORAGE_SECRET_KEY].forEach((secret) => {
    if (secret && secret.length > 6) text = text.split(secret).join('***');
  });
  return text.replace(/\s+/g, ' ').slice(0, 220);
};

/* Plain-words hint for the most common problems */
const hint = (message, where) => {
  const m = message.toLowerCase();
  if (where === 'storage') {
    if (m.includes('invalidaccesskeyid') || m.includes('not authorized') || m.includes('signaturedoesnotmatch') || m.includes('access denied')) {
      return 'The Backblaze key was refused. Check STORAGE_KEY_ID and STORAGE_SECRET_KEY, and that the key can read and write this bucket.';
    }
    if (m.includes('nosuchbucket') || m.includes('specified bucket')) return 'The bucket was not found. Check STORAGE_BUCKET.';
    if (m.includes('invalid url') || m.includes('invalid_url')) return 'The storage address is not valid. STORAGE_ENDPOINT must look like https://s3.us-west-004.backblazeb2.com (no spaces, no bucket name, and the same region as your bucket).';
    if (m.includes('enotfound') || m.includes('getaddrinfo') || m.includes('endpoint')) return 'The storage address could not be reached. Check STORAGE_ENDPOINT (it starts with https://s3.).';
  }
  if (where === 'gemini') {
    if (m.includes('api key') || m.includes('api_key') || m.includes('permission') || m.includes('401') || m.includes('403')) {
      return 'Gemini refused the key. Create a new key and set GEMINI_API_KEY again.';
    }
    if (m.includes('504') || m.includes('deadline') || m.includes('timeout') || m.includes('timed out') || m.includes('503') || m.includes('overloaded')) return 'Google was too slow or busy. Try again in a minute. If it keeps happening, set GEMINI_MODEL to a fixed model such as gemini-2.5-flash.';
    if (m.includes('429') || m.includes('quota') || m.includes('rate')) return 'Gemini says the limit was reached. Wait a while or check the quota.';
    if (m.includes('not found') || m.includes('404') || m.includes('model')) return 'The Gemini model name was not found. Check GEMINI_MODEL.';
  }
  return '';
};

/**
 * deps: { env, store, ai, nodeVersion }
 * Returns { node, storage:{configured, ok, message}, gemini:{configured, ok, message, model} }
 */
const runChecks = async ({ env = process.env, store, ai, nodeVersion = process.versions.node, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) => {
  const out = {
    node: { version: nodeVersion, ok: Number(nodeVersion.split('.')[0]) >= 20 },
    storage: { configured: false, ok: false, message: '' },
    gemini: { configured: false, ok: false, message: '', model: env.GEMINI_MODEL || 'gemini-flash-latest' },
  };
  if (!out.node.ok) out.node.message = 'Node 20 or newer is needed. Set the Node version on Render.';

  /* Storage: write, read back, delete */
  const missing = STORAGE_NAMES.filter((n) => !env[n]);
  if (missing.length) {
    out.storage.message = `Missing setting${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}`;
  } else if (!store) {
    out.storage.configured = true;
    out.storage.message = 'The storage library could not be loaded. Redeploy after the packages install.';
  } else {
    out.storage.configured = true;
    try {
      const key = 'healthcheck/ping.json';
      const stamp = String(Date.now());
      await store.putJson(key, { stamp });
      const back = await store.getJson(key);
      await store.delete(key);
      out.storage.ok = back?.stamp === stamp;
      out.storage.message = out.storage.ok ? 'Storage works (wrote, read and removed a test file).' : 'The test file did not read back correctly.';
    } catch (err) {
      const message = safeMessage(err, env);
      out.storage.message = `${message} ${hint(message, 'storage')}`.trim();
    }
  }

  /* Gemini: one tiny question */
  if (!env.GEMINI_API_KEY) {
    out.gemini.message = 'GEMINI_API_KEY is not set.';
  } else if (!ai) {
    out.gemini.configured = true;
    out.gemini.message = 'The Gemini library could not be loaded. Redeploy after the packages install.';
  } else {
    out.gemini.configured = true;
    /* A busy moment on Google's side is common, so try up to three times */
    let lastErr;
    for (let attempt = 0; attempt < 3 && !out.gemini.ok; attempt += 1) {
      try {
        const res = await ai.generateJson({
          prompt: 'Reply with JSON {"ok": true} and nothing else.',
          schema: { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'] },
        });
        out.gemini.ok = res?.ok === true;
        out.gemini.message = out.gemini.ok
          ? `Gemini works.${attempt ? ` (it needed ${attempt + 1} tries)` : ''}`
          : 'Gemini answered, but not in the expected form.';
        lastErr = null;
        if (!out.gemini.ok) break;
      } catch (err) {
        lastErr = err;
        await sleep(1500);
      }
    }
    if (lastErr) {
      const message = safeMessage(lastErr, env);
      out.gemini.message = `${message} ${hint(message, 'gemini')}`.trim();
    }
  }
  return out;
};

module.exports = { runChecks, safeMessage };
