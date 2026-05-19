import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { generateKursImageBuffer } from './kurs-image-generator.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const KURS_SHARE_TEMPLATE_VERSION = 'hero-usd-v4';
export const DEFAULT_KURS_SHARE_CACHE_DIR = path.resolve(__dirname, '..', 'data', 'kurs-share-cache');
const ttlDays = Number(process.env.KURS_SHARE_CACHE_TTL_DAYS || 3);
const maxMb = Number(process.env.KURS_SHARE_CACHE_MAX_MB || 512);
export const DEFAULT_KURS_SHARE_CACHE_TTL_MS =
  Math.max(1, Number.isFinite(ttlDays) ? ttlDays : 3) * 24 * 60 * 60 * 1000;
export const DEFAULT_KURS_SHARE_CACHE_MAX_BYTES =
  Math.max(0, Number.isFinite(maxMb) ? maxMb : 512) * 1024 * 1024;

const inFlight = new Map();

const ID_MONTHS = new Map([
  ['januari', 0],
  ['februari', 1],
  ['maret', 2],
  ['april', 3],
  ['mei', 4],
  ['juni', 5],
  ['juli', 6],
  ['agustus', 7],
  ['september', 8],
  ['oktober', 9],
  ['november', 10],
  ['desember', 11],
]);

function safeSlug(value) {
  const safe = String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return safe || 'agent';
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function dateSegmentFromKurs(rawUpdatedAt) {
  const raw = String(rawUpdatedAt || '').trim();

  const mandiri = raw.match(/(\d{2})\/(\d{2})\/(\d{2})/);
  if (mandiri) {
    return `${2000 + Number(mandiri[3])}-${mandiri[2]}-${mandiri[1]}`;
  }

  const idDate = raw.match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/i);
  if (idDate) {
    const month = ID_MONTHS.get(idDate[2].toLowerCase());
    if (month != null) {
      return `${idDate[3]}-${pad2(month + 1)}-${pad2(Number(idDate[1]))}`;
    }
  }

  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
}

export function formatKursDateForShare(rawUpdatedAt) {
  const m = String(rawUpdatedAt || '').match(/(\d{2})\/(\d{2})\/(\d{2})\s+\d{2}:\d{2}\s*WIB/);
  if (!m) return rawUpdatedAt || '';
  const dt = new Date(2000 + parseInt(m[3], 10), parseInt(m[2], 10) - 1, parseInt(m[1], 10));
  const dayName = dt.toLocaleDateString('id-ID', { weekday: 'long' });
  const monthName = dt.toLocaleDateString('id-ID', { month: 'long' });
  return `${dayName}, ${dt.getDate()} ${monthName} ${dt.getFullYear()}`;
}

export function buildKursShareCacheKey({
  kurs,
  agent,
  templateVersion = KURS_SHARE_TEMPLATE_VERSION,
}) {
  const payload = {
    templateVersion,
    kurs: {
      usd: Math.round(Number(kurs?.usd || 0)),
      updatedAt: String(kurs?.updatedAt || ''),
    },
    agent: {
      slug: String(agent?.slug || ''),
      name: String(agent?.name || ''),
      phone: String(agent?.phone || ''),
      photo: String(agent?.photo || ''),
      website: String(agent?.website || ''),
    },
  };
  const hash = crypto
    .createHash('sha256')
    .update(JSON.stringify(payload))
    .digest('hex')
    .slice(0, 16);
  return `${safeSlug(agent?.slug)}-${hash}.jpg`;
}

async function fileExists(filePath) {
  try {
    const stats = await fs.stat(filePath);
    return stats.isFile();
  } catch {
    return false;
  }
}

async function readCachedBuffer(filePath) {
  if (!(await fileExists(filePath))) return null;
  return fs.readFile(filePath);
}

async function writeFileAtomic(filePath, buffer) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, buffer);
  await fs.rename(tmp, filePath);
}

export async function getOrCreateKursShareImage({
  kurs,
  agent,
  cacheDir = DEFAULT_KURS_SHARE_CACHE_DIR,
  generator = generateKursImageBuffer,
  templateVersion = KURS_SHARE_TEMPLATE_VERSION,
}) {
  if (!kurs?.usd) throw new Error('Kurs USD tidak tersedia');
  if (!agent?.slug) throw new Error('Agent slug tidak tersedia');

  const key = buildKursShareCacheKey({ kurs, agent, templateVersion });
  const dateDir = dateSegmentFromKurs(kurs.updatedAt);
  const filePath = path.join(cacheDir, dateDir, key);

  const cached = await readCachedBuffer(filePath);
  if (cached) {
    return { buffer: cached, cacheHit: true, path: filePath, key };
  }

  if (inFlight.has(filePath)) {
    return inFlight.get(filePath);
  }

  const promise = (async () => {
    const secondRead = await readCachedBuffer(filePath);
    if (secondRead) {
      return { buffer: secondRead, cacheHit: true, path: filePath, key };
    }

    const buffer = await generator({
      kurs,
      agent,
      format: 'jpeg',
      quality: 88,
    });
    if (!buffer?.length) throw new Error('Generated kurs image is empty');
    await writeFileAtomic(filePath, buffer);
    return { buffer, cacheHit: false, path: filePath, key };
  })();

  inFlight.set(filePath, promise);
  try {
    return await promise;
  } finally {
    inFlight.delete(filePath);
  }
}

async function listCacheFiles(dir) {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (err) {
    if (err?.code === 'ENOENT') return [];
    throw err;
  }

  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listCacheFiles(fullPath));
    } else if (entry.isFile() && /\.(jpe?g|png)$/i.test(entry.name)) {
      const stats = await fs.stat(fullPath);
      files.push({
        path: fullPath,
        size: stats.size,
        mtimeMs: stats.mtimeMs,
      });
    }
  }
  return files;
}

async function removeEmptyDirs(dir, root = dir) {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) await removeEmptyDirs(path.join(dir, entry.name), root);
  }
  if (dir === root) return;
  try {
    const after = await fs.readdir(dir);
    if (after.length === 0) await fs.rmdir(dir);
  } catch {
    // Best effort cleanup.
  }
}

export async function cleanupKursShareCache({
  cacheDir = DEFAULT_KURS_SHARE_CACHE_DIR,
  ttlMs = DEFAULT_KURS_SHARE_CACHE_TTL_MS,
  maxBytes = DEFAULT_KURS_SHARE_CACHE_MAX_BYTES,
  now = Date.now(),
} = {}) {
  await fs.mkdir(cacheDir, { recursive: true });

  const files = await listCacheFiles(cacheDir);
  const remaining = [];
  const stats = {
    scanned: files.length,
    deletedExpired: 0,
    deletedForSize: 0,
    freedBytes: 0,
    remainingBytes: 0,
  };

  for (const file of files) {
    if (now - file.mtimeMs > ttlMs) {
      try {
        await fs.unlink(file.path);
        stats.deletedExpired += 1;
        stats.freedBytes += file.size;
      } catch {
        // File may have been removed by another process.
      }
    } else {
      remaining.push(file);
    }
  }

  let totalBytes = remaining.reduce((sum, file) => sum + file.size, 0);
  if (Number.isFinite(maxBytes) && maxBytes > 0 && totalBytes > maxBytes) {
    remaining.sort((a, b) => a.mtimeMs - b.mtimeMs);
    for (const file of remaining) {
      if (totalBytes <= maxBytes) break;
      try {
        await fs.unlink(file.path);
        totalBytes -= file.size;
        stats.deletedForSize += 1;
        stats.freedBytes += file.size;
      } catch {
        // File may have been removed by another process.
      }
    }
  }

  stats.remainingBytes = Math.max(0, totalBytes);
  await removeEmptyDirs(cacheDir);
  return stats;
}
