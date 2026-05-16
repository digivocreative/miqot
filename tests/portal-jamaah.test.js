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
  assert.match(server, /app\.get\('\/api\/portal\/jamaah\/:slug\/auth\/consume\/:token'/);
  assert.match(server, /app\.get\('\/api\/portal\/jamaah\/auth\/consume\/:token'/);
  assert.match(server, /app\.get\('\/api\/portal\/jamaah\/me'/);
  assert.match(server, /app\.get\('\/api\/portal\/jamaah\/persiapan'/);
  assert.match(server, /app\.put\('\/api\/portal\/jamaah\/persiapan\/item'/);
  assert.match(server, /app\.post\('\/api\/portal\/jamaah\/auth\/logout'/);
  assert.match(server, /app\.get\('\/api\/portal\/jamaah\/sessions'/);
  assert.match(server, /randomBytes\(32\)\.toString\('hex'\)/);
  assert.match(server, /PORTAL_MAGIC_CODE_REGEX/);
});

test('portal jamaah schedule fallback can pair by package tier and price when id_jadwal is missing', () => {
  const server = read('server.js');

  assert.match(server, /'paket_harga'/);
  assert.match(server, /function parsePortalPackagePricing/);
  assert.match(server, /QUARD:\s*'Quard'/);
  assert.match(server, /QUAD:\s*'Quard'/);
  assert.match(server, /function portalBookingTargetPrice/);
  assert.match(server, /raw_data\?\.harga_paket/);
  assert.match(server, /toMoney\(row\?\.bayar\) \+ Math\.max\(0,\s*toMoney\(row\?\.sisa\)\)/);
  assert.match(server, /function getPortalSchedulePackagePrice/);
  assert.match(server, /schedule\.paket_harga/);
  assert.match(server, /function findPortalScheduleByPackagePrice/);
  assert.match(server, /getPortalSchedulePackagePrice\(row,\s*packageInfo\) === targetPrice/);
  assert.match(server, /findPortalScheduleByPackagePrice\(first,\s*data\)/);
});

test('magic link generation is gated to agent nikita during rollout', () => {
  const server = read('server.js');

  assert.match(server, /toLowerCase\(\)\s*!==\s*'nikita'/);
  assert.match(server, /portal_feature_coming_soon/);
  assert.match(server, /Fitur Magic Link Portal Jamaah akan tersedia beberapa saat lagi/);
});

test('magic link generation reuses active booking links before applying rate limit', () => {
  const server = read('server.js');

  assert.match(server, /select\('token, expires_at'\)/);
  assert.match(server, /\.like\('token',\s*`\$\{slug\}:%`\)/);
  assert.doesNotMatch(server, /magic-link\/generate[\s\S]*\.is\('consumed_at',\s*null\)[\s\S]*reused:\s*true/);
  assert.match(server, /\.gt\('expires_at',\s*new Date\(\)\.toISOString\(\)\)/);
  assert.match(server, /\.limit\(10\)/);
  assert.match(server, /find\(\(row\) => isPortalStoredMagicToken\(row\.token\)\)/);
  assert.match(server, /const hasIncompatibleShortToken\s*=/);
  assert.match(server, /reused:\s*true/);
  assert.match(server, /if \(!hasIncompatibleShortToken\) \{[\s\S]*checkPortalRateLimit\(portalGenerateRateLimits/);
  assert.match(server, /retry_after/);
  assert.match(server, /Terlalu sering membuat link/);
});

test('portal magic links are reusable booking links that expire fourteen days after departure', () => {
  const server = read('server.js');

  assert.match(server, /const PORTAL_LINK_AFTER_DEPARTURE_DAYS\s*=\s*14/);
  assert.match(server, /function getPortalMagicLinkExpiresAt/);
  assert.match(server, /tgl_berangkat/);
  assert.match(server, /PORTAL_LINK_AFTER_DEPARTURE_DAYS \+ 1/);
  assert.match(server, /function portalBookingHasDp/);
  assert.match(server, /portalBookingHasDp\(jamaah\)/);
  assert.match(server, /belum_dp/);
  assert.match(server, /expiresAt\s*=\s*getPortalMagicLinkExpiresAt\(jamaah\.tgl_berangkat\)/);
  assert.match(server, /expires_at:\s*expiresAt/);

  assert.doesNotMatch(server, /if \(portalToken\.consumed_at\)[\s\S]*already_used/);
  assert.doesNotMatch(server, /\.is\('consumed_at',\s*null\)[\s\S]*already_used/);
  assert.match(server, /update\(\{[\s\S]*consumed_at:\s*consumedAt/);
  assert.match(server, /Math\.min\([\s\S]*Date\.parse\(portalToken\.expires_at\)/);
});

test('magic link generation returns short mixed alphanumeric jamaah URLs scoped by slug', () => {
  const server = read('server.js');

  assert.match(server, /const PORTAL_MAGIC_CODE_LETTERS/);
  assert.match(server, /const PORTAL_MAGIC_CODE_DIGITS/);
  assert.match(server, /const PORTAL_MAGIC_CODE_REGEX\s*=\s*\/\^\(\?=\.\*\[a-z\]\)\(\?=\.\*\[2-9\]\)\[a-z2-9\]\{5\}\$\/i/);
  assert.match(server, /const PORTAL_SHORT_CODE_REGEX\s*=\s*\/\^\[a-z0-9\]\{5\}\$\/i/);
  assert.match(server, /shufflePortalMagicCode/);
  assert.match(server, /function generatePortalMagicCode/);
  assert.match(server, /PORTAL_MAGIC_CODE_LETTERS/);
  assert.match(server, /PORTAL_MAGIC_CODE_DIGITS/);
  assert.match(server, /PORTAL_MAGIC_CODE_CHARS/);
  assert.doesNotMatch(server, /randomInt\(0,\s*100000\)/);
  assert.doesNotMatch(server, /padStart\(5,\s*'0'\)/);
  assert.match(server, /function formatPortalMagicUrl/);
  assert.match(server, /function parsePortalMagicCode[\s\S]*PORTAL_SHORT_CODE_REGEX\.test\(parts\[1\]\)[\s\S]*return parts\[1\]\.toLowerCase\(\)/);
  assert.match(server, /function isPortalStoredMagicToken[\s\S]*isPortalMagicCode\(parts\[1\]\)/);
  assert.match(server, /buildPortalStoredToken\(slug,\s*code\)/);
  assert.match(server, /formatPortalMagicUrl\(slug,\s*existingToken\.token\)/);
  assert.match(server, /formatPortalMagicUrl\(slug,\s*token\)/);
  assert.doesNotMatch(server, /url:\s*`\$\{PORTAL_BASE_URL\}\/\$\{slug\}\/jamaah\/auth\//);
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
