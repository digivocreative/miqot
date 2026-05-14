#!/usr/bin/env node
// Self-host all alhijazindonesia.com assets referenced by public/umroh.html and
// public/haji-plus.html. Saves under public/ preserving the original path so
// the HTML can reference them via root-relative URLs after the rewrite step.
//
// Idempotent: existing files are skipped. Re-run anytime WordPress assets change.
//
// Usage: node scripts/self-host-landing-assets.mjs

import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { resolve, dirname, posix } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(import.meta.url), '../..');
const PUBLIC_DIR = resolve(ROOT, 'public');
const HTML_FILES = ['umroh.html', 'haji-plus.html'].map(f => resolve(PUBLIC_DIR, f));
const ORIGIN = 'https://alhijazindonesia.com';

const seen = new Set();
const downloaded = [];
const failed = [];

function urlToLocalPath(url) {
  // https://alhijazindonesia.com/wp-content/foo.css?ver=1 -> public/wp-content/foo.css
  const u = new URL(url);
  return resolve(PUBLIC_DIR, '.' + u.pathname);
}

// Only download asset-like URLs. Skip canonical / page URLs that would shadow
// SPA routes (e.g. https://alhijazindonesia.com/umroh/ → public/umroh).
const ASSET_EXT_RE = /\.(css|js|m?js|woff2?|ttf|eot|otf|png|jpe?g|gif|svg|webp|avif|ico|json|webmanifest|mp4|webm|map)(\?|$)/i;

async function downloadUrl(url) {
  if (seen.has(url)) return;
  seen.add(url);
  if (!ASSET_EXT_RE.test(url)) {
    return; // skip page/canonical URLs that have no asset extension
  }
  const localPath = urlToLocalPath(url);
  if (existsSync(localPath)) {
    return; // already on disk
  }
  try {
    const res = await fetch(url, { redirect: 'follow' });
    if (!res.ok) {
      failed.push(`${res.status} ${url}`);
      return;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    await mkdir(dirname(localPath), { recursive: true });
    await writeFile(localPath, buf);
    downloaded.push(`${localPath.replace(PUBLIC_DIR + '/', '')} (${buf.length}B)`);
    return { localPath, buf };
  } catch (err) {
    failed.push(`ERR ${url} ${err.message}`);
  }
}

function extractUrlsFromHtml(html) {
  // Match https://alhijazindonesia.com/ followed by path chars
  // Allow query strings; stop at quotes, whitespace, > < ( )
  const re = /https:\/\/alhijazindonesia\.com\/[^"'\s<>()]+/g;
  return Array.from(new Set(html.match(re) || []));
}

function extractUrlsFromCss(css, cssUrl) {
  // url(...) entries: url("..."), url('...'), url(...)
  const re = /url\(\s*(['"]?)([^'")\s]+)\1\s*\)/g;
  const urls = new Set();
  let m;
  while ((m = re.exec(css))) {
    let val = m[2];
    if (val.startsWith('data:')) continue;
    if (val.startsWith('#')) continue; // fragment refs
    try {
      const abs = new URL(val, cssUrl);
      if (abs.origin === ORIGIN) urls.add(abs.toString());
    } catch { /* ignore parse errors */ }
  }
  // @import "..." or @import url(...)
  const imp = /@import\s+(?:url\(\s*)?(['"])([^'")]+)\1/g;
  while ((m = imp.exec(css))) {
    try {
      const abs = new URL(m[2], cssUrl);
      if (abs.origin === ORIGIN) urls.add(abs.toString());
    } catch { /* ignore */ }
  }
  return Array.from(urls);
}

async function main() {
  // Phase 1: collect URLs from HTML
  console.log('Phase 1: extract URLs from HTML files');
  const initialUrls = new Set();
  for (const f of HTML_FILES) {
    const html = await readFile(f, 'utf-8');
    extractUrlsFromHtml(html).forEach(u => initialUrls.add(u));
    console.log(`  ${f.replace(PUBLIC_DIR + '/', '')}: ${extractUrlsFromHtml(html).length} URLs`);
  }
  console.log(`Total unique: ${initialUrls.size}`);

  // Phase 2: download URLs from HTML (round 1)
  console.log('\nPhase 2: download HTML-referenced assets');
  let round = 1;
  for (const url of initialUrls) {
    await downloadUrl(url);
  }
  console.log(`  Round ${round}: downloaded ${downloaded.length}, failed ${failed.length}`);

  // Phase 3: parse downloaded CSS for nested url() refs, download those too. Loop until stable.
  console.log('\nPhase 3: crawl CSS for url() references (recursive)');
  let prevCount = -1;
  while (seen.size !== prevCount) {
    prevCount = seen.size;
    round++;
    const cssFiles = [];
    for (const url of seen) {
      if (!/\.css(\?|$)/i.test(url)) continue;
      const localPath = urlToLocalPath(url);
      if (existsSync(localPath)) cssFiles.push({ url, localPath });
    }
    for (const { url, localPath } of cssFiles) {
      const css = await readFile(localPath, 'utf-8').catch(() => '');
      const nestedUrls = extractUrlsFromCss(css, url);
      for (const nested of nestedUrls) {
        if (!seen.has(nested)) {
          await downloadUrl(nested);
        }
      }
    }
    console.log(`  Round ${round}: total downloaded ${downloaded.length}, failed ${failed.length}`);
  }

  // Phase 4: rewrite HTML to point to local paths
  console.log('\nPhase 4: rewrite HTML — replace https://alhijazindonesia.com/ with /');
  for (const f of HTML_FILES) {
    const html = await readFile(f, 'utf-8');
    const rewritten = html.replaceAll(`${ORIGIN}/`, '/');
    if (html === rewritten) {
      console.log(`  ${f.replace(PUBLIC_DIR + '/', '')}: no changes (already rewritten?)`);
    } else {
      await writeFile(f, rewritten);
      console.log(`  ${f.replace(PUBLIC_DIR + '/', '')}: rewritten`);
    }
  }

  console.log('\n=== Summary ===');
  console.log(`Downloaded: ${downloaded.length}`);
  console.log(`Failed:     ${failed.length}`);
  if (failed.length) {
    console.log('\nFailed URLs:');
    failed.forEach(f => console.log('  -', f));
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
