/* ═══════════════════════════════════════════════════════════
   SCHOLAR ANALYTICS — Object storage (Backblaze B2 / any S3-compatible)
   File: backend/utils/objectStore.js

   Curriculum designs, notes and the lessons Gemini writes are kept
   as small JSON files in a storage bucket, NOT in MongoDB.

   Settings (Render → Environment):
     STORAGE_ENDPOINT    e.g. https://s3.us-west-004.backblazeb2.com
     STORAGE_REGION      e.g. us-west-004
     STORAGE_BUCKET      e.g. scholar-analytics-curriculum
     STORAGE_KEY_ID      the Backblaze keyID
     STORAGE_SECRET_KEY  the Backblaze applicationKey

   Any S3-compatible service works with the same settings, so the
   provider can be changed later without changing the code.
═══════════════════════════════════════════════════════════ */

const REQUIRED = ['STORAGE_ENDPOINT', 'STORAGE_REGION', 'STORAGE_BUCKET', 'STORAGE_KEY_ID', 'STORAGE_SECRET_KEY'];

const isMissing = (err) =>
  err?.name === 'NoSuchKey' || err?.name === 'NotFound' || err?.$metadata?.httpStatusCode === 404;

/**
 * The store wraps a client that has the S3 `send(command)` method.
 * `sdk` carries the command classes, so tests can pass a fake client.
 */
const createObjectStore = ({ client, sdk, bucket }) => {
  const { GetObjectCommand, PutObjectCommand, DeleteObjectCommand, ListObjectsV2Command } = sdk;

  const getJson = async (key) => {
    try {
      const res  = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      const text = await res.Body.transformToString();
      return JSON.parse(text);
    } catch (err) {
      if (isMissing(err)) return null;
      throw err;
    }
  };

  const putJson = (key, value) =>
    client.send(new PutObjectCommand({
      Bucket     : bucket,
      Key        : key,
      Body       : JSON.stringify(value),
      ContentType: 'application/json',
    }));

  const del = (key) => client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));

  /* Every key that starts with the prefix (up to `limit`) */
  const list = async (prefix, limit = 500) => {
    const keys = [];
    let token;
    do {
      const res = await client.send(new ListObjectsV2Command({
        Bucket: bucket, Prefix: prefix, ContinuationToken: token,
      }));
      (res.Contents || []).forEach((o) => keys.push(o.Key));
      token = res.IsTruncated ? res.NextContinuationToken : undefined;
    } while (token && keys.length < limit);
    return keys.slice(0, limit);
  };

  const deletePrefix = async (prefix) => {
    const keys = await list(prefix, 2000);
    for (const key of keys) await del(key);
    return keys.length;
  };

  return { getJson, putJson, delete: del, list, deletePrefix, bucket };
};

let cached; /* undefined = not tried yet, null = not configured */

/** The shared store, or null when the storage settings are not all set. */
const getObjectStore = () => {
  if (cached !== undefined) return cached;

  if (REQUIRED.some((name) => !process.env[name])) {
    cached = null;
    return cached;
  }

  try {
    const sdk = require('@aws-sdk/client-s3');
    /* People often paste the address without https:// or with spaces */
    const raw = String(process.env.STORAGE_ENDPOINT).trim();
    const endpoint = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const client = new sdk.S3Client({
      region  : String(process.env.STORAGE_REGION).trim(),
      endpoint,
      credentials: {
        accessKeyId    : String(process.env.STORAGE_KEY_ID).trim().replace(/^["']|["']$/g, ''),
        secretAccessKey: String(process.env.STORAGE_SECRET_KEY).trim().replace(/^["']|["']$/g, ''),
      },
      /* Backblaze and other S3-compatible services do not accept the extra
         checksum headers the AWS library adds by default */
      requestChecksumCalculation : 'WHEN_REQUIRED',
      responseChecksumValidation : 'WHEN_REQUIRED',
    });
    cached = createObjectStore({ client, sdk, bucket: process.env.STORAGE_BUCKET });
  } catch (err) {
    console.error('Storage library not available:', err.message);
    cached = null;
  }
  return cached;
};

/* For tests */
const resetObjectStoreCache = () => { cached = undefined; };

module.exports = { createObjectStore, getObjectStore, resetObjectStoreCache, REQUIRED };
