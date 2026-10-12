// Cache disk banner Share Cuaca (spec 2026-10-12). Pola lib/kurs-share-cache.mjs,
// sengaja modul terpisah agar Kurs tidak tersentuh. Gambar dibuat ulang hanya
// setelah cron cuaca (syncedAt) berganti atau identitas agent berubah.
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const CUACA_SHARE_TEMPLATE_VERSION = 'c2-v1';
export const DEFAULT_CUACA_SHARE_CACHE_DIR = path.resolve(__dirname, '..', 'data', 'cuaca-share-cache');
export const DEFAULT_CUACA_SHARE_CACHE_TTL_MS = 2 * 24 * 60 * 60 * 1000;
export const DEFAULT_CUACA_SHARE_CACHE_MAX_BYTES = 256 * 1024 * 1024;

const inFlight = new Map();

function safeSegment(value, fallback) {
  const safe = String(value || '').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
  return safe || fallback;
}

export function buildCuacaShareCacheKey({ cityKey, syncedAt, agent, templateVersion = CUACA_SHARE_TEMPLATE_VERSION }) {
  const payload = {
    templateVersion,
    cityKey: String(cityKey || ''),
    syncedAt: String(syncedAt || ''),
    agent: {
      slug: String(agent?.slug || ''),
      name: String(agent?.name || ''),
      phone: String(agent?.phone || ''),
      photo: String(agent?.photo || ''),
    },
  };
  const hash = crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 16);
  return `${safeSegment(agent?.slug, 'agent')}-${safeSegment(cityKey, 'kota')}-${hash}.jpg`;
}

function dateDirFromKey(dateKey) {
  const m = /^(\d{4})(\d{2})(\d{2})$/.exec(String(dateKey || ''));
  return m ? `${m[1]}-${m[2]}-${m[3]}` : new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
}

async function readCached(filePath) {
  try {
    return await fs.readFile(filePath);
  } catch {
    return null;
  }
}

async function writeFileAtomic(filePath, buffer) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, buffer);
  await fs.rename(tmp, filePath);
}

export async function getOrCreateCuacaShareImage({
  cityKey,
  syncedAt,
  agent,
  dateKey,
  render,
  cacheDir = DEFAULT_CUACA_SHARE_CACHE_DIR,
  templateVersion = CUACA_SHARE_TEMPLATE_VERSION,
}) {
  if (!agent?.slug) throw new Error('Agent slug tidak tersedia');
  const key = buildCuacaShareCacheKey({ cityKey, syncedAt, agent, templateVersion });
  const filePath = path.join(cacheDir, dateDirFromKey(dateKey), key);

  const cached = await readCached(filePath);
  if (cached) return { buffer: cached, cacheHit: true, path: filePath, key };
  if (inFlight.has(filePath)) return inFlight.get(filePath);

  const promise = (async () => {
    const again = await readCached(filePath);
    if (again) return { buffer: again, cacheHit: true, path: filePath, key };
    const buffer = await render();
    if (!buffer?.length) throw new Error('Gambar cuaca hasil render kosong');
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
    } else if (entry.isFile() && /\.jpe?g$/i.test(entry.name)) {
      const s = await fs.stat(fullPath);
      files.push({ path: fullPath, size: s.size, mtimeMs: s.mtimeMs });
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
    if ((await fs.readdir(dir)).length === 0) await fs.rmdir(dir);
  } catch {
    // Best effort.
  }
}

export async function cleanupCuacaShareCache({
  cacheDir = DEFAULT_CUACA_SHARE_CACHE_DIR,
  ttlMs = DEFAULT_CUACA_SHARE_CACHE_TTL_MS,
  maxBytes = DEFAULT_CUACA_SHARE_CACHE_MAX_BYTES,
  now = Date.now(),
} = {}) {
  await fs.mkdir(cacheDir, { recursive: true });
  const files = await listCacheFiles(cacheDir);
  const stats = { scanned: files.length, deletedExpired: 0, deletedForSize: 0, freedBytes: 0, remainingBytes: 0 };
  const remaining = [];

  for (const file of files) {
    if (now - file.mtimeMs > ttlMs) {
      try {
        await fs.unlink(file.path);
        stats.deletedExpired += 1;
        stats.freedBytes += file.size;
      } catch {
        // Sudah dihapus proses lain.
      }
    } else {
      remaining.push(file);
    }
  }

  let total = remaining.reduce((sum, f) => sum + f.size, 0);
  if (maxBytes > 0 && total > maxBytes) {
    remaining.sort((a, b) => a.mtimeMs - b.mtimeMs);
    for (const file of remaining) {
      if (total <= maxBytes) break;
      try {
        await fs.unlink(file.path);
        total -= file.size;
        stats.deletedForSize += 1;
        stats.freedBytes += file.size;
      } catch {
        // Sudah dihapus proses lain.
      }
    }
  }

  stats.remainingBytes = Math.max(0, total);
  await removeEmptyDirs(cacheDir);
  return stats;
}
