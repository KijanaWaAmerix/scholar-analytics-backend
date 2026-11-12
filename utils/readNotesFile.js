/* ═══════════════════════════════════════════════════════════
   SCHOLAR ANALYTICS — Read a notes document as plain text
   File: backend/utils/readNotesFile.js

   Supports Word (.docx and the old .doc), PDF (real text, or a scanned
   picture, which is read with OCR when tesseract and pdftoppm are
   installed) and plain text (.txt, .md).
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

/** Read a scanned PDF page by page with OCR (needs the tesseract and pdftoppm programs) */
const ocrPdf = async (buffer) => {
  const fs = require('fs'); const os = require('os'); const path = require('path');
  const { execFile } = require('child_process'); const { promisify } = require('util');
  const run = promisify(execFile);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'notes-ocr-'));
  try {
    fs.writeFileSync(path.join(dir, 'in.pdf'), buffer);
    await run('pdftoppm', ['-r', '150', '-gray', '-png', path.join(dir, 'in.pdf'), path.join(dir, 'p')], { maxBuffer: 1 << 26 });
    const pages = fs.readdirSync(dir).filter((f) => /^p-\d+\.png$/.test(f)).sort();
    const out = [];
    for (const f of pages) {
      const { stdout } = await run('tesseract', [path.join(dir, f), 'stdout', '-l', 'eng', '--psm', '6'], { maxBuffer: 1 << 26 });
      out.push(stdout);
    }
    return out.join('\n')
      .split('\n')
      /* download-site banners and page footers that every scanned page carries */
      .filter((l) => !/studocu|scan to open|downloaded by|lOMoAR|publishers\s*[-–]\s*\d{6,}/i.test(l))
      .join('\n');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
};

const readPdf = async (buffer) => {
  let pdf;
  try { pdf = require('pdf-parse'); } catch { throw needs('pdf'); }
  const data = await pdf(buffer);
  const text = String(data.text || '');
  /* a scan has no text except a stamp such as a download banner: read it with OCR instead */
  const real = text.split('\n').filter((l) => !/studocu|downloaded by|lOMoAR/i.test(l)).join(' ');
  if (real.replace(/\s/g, '').length >= 200 && data.numpages <= real.length / 40) return text;
  try {
    const ocr = await ocrPdf(buffer);
    if (ocr.replace(/\s/g, '').length >= 200) return ocr;
  } catch (e) {
    throw new Error('This PDF is a scan and could not be read with OCR (' + (e.code === 'ENOENT' ? 'tesseract and pdftoppm are not installed' : e.message) + '). Skipped.');
  }
  throw new Error('This PDF has no readable text. Skipped.');
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
