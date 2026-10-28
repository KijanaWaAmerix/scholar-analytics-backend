/* ═══════════════════════════════════════════════════════════
   SCHOLAR ANALYTICS — Read a notes document as plain text
   File: backend/utils/readNotesFile.js

   Supports Word (.docx and the old .doc), PDF (.pdf with real text,
   not a scanned picture) and plain text (.txt, .md).
═══════════════════════════════════════════════════════════ */

const needs = (name) => new Error(`Run "npm install" first (the ${name} reader is missing).`);

const readDocx = async (buffer) => {
  let mammoth;
  try { mammoth = require('mammoth'); } catch { throw needs('docx'); }
  return (await mammoth.extractRawText({ buffer })).value;
};

const readDoc = async (buffer) => {
  let WordExtractor;
  try { WordExtractor = require('word-extractor'); } catch { throw needs('doc'); }
  const doc = await new WordExtractor().extract(buffer);
  return doc.getBody();
};

const readPdf = async (buffer) => {
  let pdf;
  try { pdf = require('pdf-parse'); } catch { throw needs('pdf'); }
  const data = await pdf(buffer);
  const text = String(data.text || '');
  if (text.replace(/\s/g, '').length < 200) {
    throw new Error('This PDF has no readable text (it may be a scan). Skipped.');
  }
  return text;
};

/** The file type from a name or link, ignoring any ?query part */
const kindOf = (name) => {
  const clean = String(name || '').split('?')[0].toLowerCase();
  if (/\.docx$/.test(clean)) return 'docx';
  if (/\.doc$/.test(clean)) return 'doc';
  if (/\.pdf$/.test(clean)) return 'pdf';
  if (/\.(txt|md)$/.test(clean)) return 'txt';
  return null;
};

const readNotesBuffer = async (buffer, name) => {
  const kind = kindOf(name);
  if (kind === 'docx') return readDocx(buffer);
  if (kind === 'doc') return readDoc(buffer);
  if (kind === 'pdf') return readPdf(buffer);
  if (kind === 'txt') return buffer.toString('utf8');
  throw new Error('Only .docx, .doc, .pdf and .txt files are supported.');
};

module.exports = { readNotesBuffer, kindOf };
