import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  PUBLIC_AGENT_FIELDS,
  isPubliclyListedAgent,
  toPublicAgent,
  listPublicAgents,
} from '../lib/public-agents.js';

// GET /api/agents/public menggantikan pembacaan tabel agents dari browser lewat
// anon key Supabase (`select slug,name,website,phone,photo` +
// `.or('status.eq.active,status.is.null')`). Tabel agents memuat PII & kunci —
// yang dikunci di sini: filter status persis semantik PostgREST, HANYA lima
// kolom yang keluar, nilai apa adanya, dan rute terdaftar sebelum
// '/api/agents/:slug/public'.

const SECRET_AGENT = {
  id: 7,
  slug: 'nikita',
  name: 'Nikita',
  website: 'https://alhijaz.co/nikita',
  phone: '628123456789',
  photo: 'https://sb.alhijaz.co/storage/v1/object/public/agent-photos/nikita.webp',
  status: 'active',
  email: 'nikita@example.com',
  password_hash: '$2b$10$rahasia',
  awapi_key: 'AWAPI-RAHASIA',
  mcp_api_key: 'alhijaz_mcp_rahasia',
  telegram_chat_id: '123456',
  jamaah_username: 'SM919',
  jamaah_password: 'rahasia',
  custom_domain: 'nikita.example',
};

test('isPubliclyListedAgent: active atau status null/undefined saja (persis status.eq.active,status.is.null)', () => {
  assert.equal(isPubliclyListedAgent({ status: 'active' }), true);
  assert.equal(isPubliclyListedAgent({ status: null }), true);
  assert.equal(isPubliclyListedAgent({}), true, 'kolom status tidak ada = NULL');
  assert.equal(isPubliclyListedAgent({ status: 'inactive' }), false);
  assert.equal(isPubliclyListedAgent({ status: 'suspended' }), false);
  assert.equal(isPubliclyListedAgent({ status: '' }), false, 'string kosong bukan NULL di PostgREST');
  assert.equal(isPubliclyListedAgent({ status: 'ACTIVE' }), false, 'eq PostgREST peka huruf besar/kecil');
  assert.equal(isPubliclyListedAgent(null), false);
  assert.equal(isPubliclyListedAgent(undefined), false);
  assert.equal(isPubliclyListedAgent('active'), false);
});

test('toPublicAgent: hanya lima kolom daftar-putih, nilai mentah, kolom rahasia tidak bocor', () => {
  assert.deepEqual([...PUBLIC_AGENT_FIELDS], ['slug', 'name', 'website', 'phone', 'photo']);
  const out = toPublicAgent(SECRET_AGENT);
  assert.deepEqual(Object.keys(out), ['slug', 'name', 'website', 'phone', 'photo']);
  assert.deepEqual(out, {
    slug: 'nikita',
    name: 'Nikita',
    website: 'https://alhijaz.co/nikita',
    phone: '628123456789',
    photo: 'https://sb.alhijaz.co/storage/v1/object/public/agent-photos/nikita.webp',
  });
  for (const secret of ['id', 'email', 'password_hash', 'awapi_key', 'mcp_api_key', 'telegram_chat_id', 'jamaah_username', 'jamaah_password', 'custom_domain', 'status']) {
    assert.equal(secret in out, false, `${secret} tidak boleh ikut`);
  }
});

test('toPublicAgent: kolom kosong tetap null (tanpa transformasi ke string kosong)', () => {
  const out = toPublicAgent({ slug: 'baru', name: 'Agent Baru', website: null, phone: '0812-000', photo: undefined });
  assert.deepEqual(out, { slug: 'baru', name: 'Agent Baru', website: null, phone: '0812-000', photo: null });
});

test('listPublicAgents: menerima map per-id (bentuk cache getAgents) maupun array; filter status ikut', () => {
  const inactive = { ...SECRET_AGENT, id: 8, slug: 'nonaktif', status: 'inactive' };
  const legacy = { ...SECRET_AGENT, id: 9, slug: 'lama', status: null };
  const byId = { 7: SECRET_AGENT, 8: inactive, 9: legacy };

  const fromMap = listPublicAgents(byId);
  assert.deepEqual(fromMap.map((a) => a.slug), ['nikita', 'lama']);
  for (const row of fromMap) assert.deepEqual(Object.keys(row), ['slug', 'name', 'website', 'phone', 'photo']);

  const fromArray = listPublicAgents([SECRET_AGENT, inactive, legacy]);
  assert.deepEqual(fromArray, fromMap);

  assert.deepEqual(listPublicAgents({}), []);
  assert.deepEqual(listPublicAgents(null), []);
  assert.deepEqual(listPublicAgents(undefined), []);
});

test('server.js: /api/agents/public terdaftar sebelum /api/agents/:slug/public, publik, hanya proyeksi daftar-putih', () => {
  const source = readFileSync(new URL('../server.js', import.meta.url), 'utf8');
  const listRoute = source.indexOf("app.get('/api/agents/public'");
  const slugRoute = source.indexOf("app.get('/api/agents/:slug/public'");
  assert.ok(listRoute > -1, 'rute /api/agents/public tidak ditemukan');
  assert.ok(slugRoute > -1);
  assert.ok(listRoute < slugRoute, "'/api/agents/public' harus sebelum '/api/agents/:slug/public'");

  const handler = source.slice(listRoute, source.indexOf('\n});', listRoute));
  assert.match(handler, /const agents = await getAgents\(\);/, 'sumber = cache getAgents()');
  assert.match(handler, /const list = listPublicAgents\(agents\);/, 'hanya proyeksi lib/public-agents.js yang dikirim');
  assert.match(handler, /res\.json\(list\);/);
  // getAgents() mengembalikan {} saat query gagal pada cache dingin — daftar kosong
  // tidak boleh ter-cache 60 dtk; klien memakai cache localStorage-nya.
  assert.match(handler, /if \(list\.length === 0\) \{[\s\S]*?res\.set\('Cache-Control', 'no-store'\);[\s\S]*?res\.status\(503\)/, 'daftar kosong → 503 no-store');
  assert.match(handler, /res\.set\('Cache-Control', 'public, max-age=60'\)/);
  assert.doesNotMatch(handler, /requireAuth|authenticate|verifyToken|jwt/i, 'endpoint publik tanpa auth');
  assert.match(source, /import \{ listPublicAgents \} from '\.\/lib\/public-agents\.js';/);
});

test('frontend: src/data/agents.ts memakai /api/agents/public dan klien Supabase browser sudah dihapus', () => {
  const agents = readFileSync(new URL('../src/data/agents.ts', import.meta.url), 'utf8');
  assert.match(agents, /fetch\('\/api\/agents\/public'/);
  assert.doesNotMatch(agents, /from\s+['"][^'"]*(lib\/supabase|@supabase\/)/, 'tidak ada impor klien Supabase');
  assert.match(agents, /export async function loadAgentsFromSupabase\(/, 'nama fungsi dipertahankan untuk importer lama');
  assert.equal(
    (() => { try { readFileSync(new URL('../src/lib/supabase.ts', import.meta.url)); return true; } catch { return false; } })(),
    false,
    'src/lib/supabase.ts harus sudah dihapus (@supabase/* keluar dari bundle)',
  );
});
