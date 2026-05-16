import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url);
const rootPath = root.pathname;

function read(path) {
  return readFileSync(join(rootPath, path), 'utf8');
}

test('portal jamaah migration creates the required RLS-protected tables', () => {
  const migrationsDir = join(rootPath, 'migrations');
  assert.equal(existsSync(migrationsDir), true, 'migrations directory should exist');

  const migrationFile = readdirSync(migrationsDir)
    .find((name) => /portal_jamaah\.sql$/.test(name));
  assert.ok(migrationFile, 'portal jamaah migration should exist');

  const sql = read(join('migrations', migrationFile));
  for (const table of ['jamaah_portal_tokens', 'jamaah_portal_sessions', 'booking_persiapan']) {
    assert.match(sql, new RegExp(`CREATE TABLE\\s+${table}`, 'i'));
    assert.match(sql, new RegExp(`ALTER TABLE\\s+${table}\\s+ENABLE ROW LEVEL SECURITY`, 'i'));
  }
  assert.match(sql, /jamaah_id\s+INTEGER\s+NOT NULL\s+REFERENCES\s+jamaah\(id\)\s+ON DELETE CASCADE/i);
  assert.match(sql, /initiating_jamaah_id\s+INTEGER\s+REFERENCES\s+jamaah\(id\)\s+ON DELETE SET NULL/i);
  assert.match(sql, /tahapan\s+JSONB\s+NOT NULL\s+DEFAULT\s+'\{\}'::jsonb/i);
  assert.match(sql, /spiritual\s+JSONB\s+NOT NULL\s+DEFAULT\s+'\{\}'::jsonb/i);
});

test('persiapan defaults expose tahapan, spiritual, and perlengkapan item sets', () => {
  const constants = read('src/constants/persiapan-defaults.ts');

  assert.match(constants, /export interface PersiapanItem/);
  assert.match(constants, /export const TAHAPAN_DEFAULTS:\s*PersiapanItem\[\]/);
  assert.match(constants, /export const SPIRITUAL_DEFAULTS:\s*PersiapanItem\[\]/);
  assert.match(constants, /export const PERLENGKAPAN_DEFAULTS/);
  assert.match(constants, /id:\s*'dp_dibayar'/);
  assert.match(constants, /id:\s*'hafal_niat_umroh'/);
  assert.match(constants, /id:\s*'koper_besar'/);
});

test('server registers all portal jamaah routes and middleware', () => {
  const server = read('server.js');

  assert.match(server, /function portalJamaahAuth\s*\(/);
  assert.match(server, /app\.post\('\/api\/portal\/jamaah\/:slug\/magic-link\/generate'/);
  assert.match(server, /app\.get\('\/api\/portal\/jamaah\/auth\/consume\/:token'/);
  assert.match(server, /app\.get\('\/api\/portal\/jamaah\/me'/);
  assert.match(server, /app\.get\('\/api\/portal\/jamaah\/persiapan'/);
  assert.match(server, /app\.put\('\/api\/portal\/jamaah\/persiapan\/item'/);
  assert.match(server, /app\.post\('\/api\/portal\/jamaah\/auth\/logout'/);
  assert.match(server, /app\.get\('\/api\/portal\/jamaah\/sessions'/);
  assert.match(server, /randomBytes\(32\)\.toString\('hex'\)/);
  assert.match(server, /crypto\.randomUUID\(\)/);
});

test('magic link generation is gated to agent nikita during rollout', () => {
  const server = read('server.js');

  assert.match(server, /toLowerCase\(\)\s*!==\s*'nikita'/);
  assert.match(server, /portal_feature_coming_soon/);
  assert.match(server, /Fitur Magic Link Portal Jamaah akan tersedia beberapa saat lagi/);
});

test('magic link generation reuses active unused tokens before applying rate limit', () => {
  const server = read('server.js');

  assert.match(server, /select\('token, expires_at'\)/);
  assert.match(server, /\.is\('consumed_at',\s*null\)/);
  assert.match(server, /\.gt\('expires_at',\s*new Date\(\)\.toISOString\(\)\)/);
  assert.match(server, /reused:\s*true/);
  assert.match(server, /checkPortalRateLimit\(portalGenerateRateLimits/);
  assert.match(server, /retry_after/);
  assert.match(server, /Terlalu sering membuat link/);
});

test('server computes portal persiapan progress across 5 documents and 7 perlengkapan items', () => {
  const server = read('server.js');

  assert.match(server, /const PORTAL_DOCUMENT_KEYS\s*=\s*\[/);
  for (const key of ['paspor', 'ktp', 'vaksin', 'foto_46', 'buku_nikah']) {
    assert.match(server, new RegExp(`['"]${key}['"]`));
  }
  assert.match(server, /docTotal\s*\+=\s*PORTAL_DOCUMENT_KEYS\.length/);
  assert.match(server, /const perlengkapanTotal\s*=\s*\(rows \|\| \[\]\)\.length \* PERLENGKAPAN_DEFAULTS\.length/);
  assert.match(server, /pending_count:\s*Math\.max\(0,\s*totalItems - checkedItems\)/);
});

test('server keeps session list read-only and does not expose revoke or unused-token dashboard routes', () => {
  const server = read('server.js');

  assert.doesNotMatch(server, /app\.get\('\/api\/portal\/jamaah\/sessions\/unused'/);
  assert.doesNotMatch(server, /app\.delete\('\/api\/portal\/jamaah\/sessions\/:token'/);
  assert.match(server, /app\.get\('\/api\/portal\/jamaah\/sessions',\s*authMiddleware/);
  assert.match(server, /select\('id_umroh, initiating_jamaah_id, last_active_at, created_at, user_agent'\)/);
  assert.doesNotMatch(server, /select\('session_token, id_umroh, initiating_jamaah_id/);
});

test('portal jamaah migration reloads Supabase schema cache and server returns friendly schema-missing errors', () => {
  const migrationsDir = join(rootPath, 'migrations');
  const migrationFile = readdirSync(migrationsDir)
    .find((name) => /portal_jamaah\.sql$/.test(name));
  assert.ok(migrationFile, 'portal jamaah migration should exist');

  const sql = read(join('migrations', migrationFile));
  const server = read('server.js');

  assert.match(sql, /NOTIFY\s+pgrst,\s*'reload schema'/i);
  assert.match(server, /function portalSchemaMissingResponse/);
  assert.match(server, /portal_schema_missing/);
  assert.match(server, /Migration Portal Jamaah belum dijalankan/);
});
