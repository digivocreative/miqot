/**
 * One-off: migrate community VIDEO objects that landed on Supabase Storage
 * (stale server process without Bunny env) over to Bunny CDN, then rewrite
 * the URLs in community_posts.media / community_post_comments.media.
 *
 * Streaming video from sb.alhijaz.co stalls in Chromium (range-request
 * handling); Bunny serves ranges correctly. Images are left as-is.
 *
 * Run: node scripts/fix-community-video-urls.mjs
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const ZONE = process.env.BUNNY_STORAGE_ZONE;
const STORAGE_HOST = process.env.BUNNY_STORAGE_HOSTNAME || 'storage.bunnycdn.com';
const CDN_HOST = process.env.BUNNY_CDN_HOSTNAME;
const API_KEY = process.env.BUNNY_STORAGE_API_KEY;

if (!ZONE || !CDN_HOST || !API_KEY) {
  console.error('Bunny env belum lengkap — batal.');
  process.exit(1);
}

const SUPABASE_MARKER = '/storage/v1/object/public/agent-photos/';

async function migrateUrl(url) {
  const idx = url.indexOf(SUPABASE_MARKER);
  if (idx === -1) return null;
  const path = url.slice(idx + SUPABASE_MARKER.length); // community/<file>
  if (!path.startsWith('community/')) return null;

  const download = await fetch(url);
  if (!download.ok) throw new Error(`download ${download.status} untuk ${url}`);
  const buffer = Buffer.from(await download.arrayBuffer());

  const put = await fetch(`https://${STORAGE_HOST}/${ZONE}/${path}`, {
    method: 'PUT',
    headers: { AccessKey: API_KEY, 'Content-Type': 'application/octet-stream' },
    body: buffer,
  });
  if (!put.ok) throw new Error(`Bunny PUT ${put.status} untuk ${path}`);

  const check = await fetch(`https://${CDN_HOST}/${path}`, { method: 'HEAD' });
  if (!check.ok) throw new Error(`Bunny CDN HEAD ${check.status} untuk ${path}`);

  return `https://${CDN_HOST}/${path}`;
}

async function fixTable(table) {
  const { data: rows, error } = await supabase
    .from(table)
    .select('id, media')
    .is('deleted_at', null)
    .not('media', 'eq', '[]')
    .limit(500);
  if (error) {
    if (/media/.test(String(error.message))) {
      console.log(`${table}: kolom media belum ada — lewati.`);
      return;
    }
    throw error;
  }

  for (const row of rows || []) {
    const media = Array.isArray(row.media) ? row.media : [];
    let changed = false;
    const next = [];
    for (const item of media) {
      if (item?.type === 'video' && typeof item.url === 'string' && item.url.includes(SUPABASE_MARKER)) {
        const newUrl = await migrateUrl(item.url);
        if (newUrl) {
          console.log(`${table} ${row.id}: ${item.url.slice(-40)} -> Bunny`);
          next.push({ ...item, url: newUrl });
          changed = true;
          continue;
        }
      }
      next.push(item);
    }
    if (changed) {
      const { error: updateError } = await supabase.from(table).update({ media: next }).eq('id', row.id);
      if (updateError) throw updateError;
      console.log(`${table} ${row.id}: media diperbarui.`);
    }
  }
}

await fixTable('community_posts');
await fixTable('community_post_comments');
console.log('Selesai.');
