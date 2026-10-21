import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const serverSource = readFileSync(new URL('../server.js', import.meta.url), 'utf8');
const pageSource = readFileSync(new URL('../src/components/AnalyticsPage.tsx', import.meta.url), 'utf8');
const drillSource = readFileSync(new URL('../src/components/AgentDrillDownModal.tsx', import.meta.url), 'utf8');

function routeBody(decl) {
  const start = serverSource.indexOf(decl);
  assert.ok(start >= 0, `route ${decl} not found`);
  const rest = serverSource.slice(start);
  return rest.slice(0, rest.indexOf('\n});\n'));
}
const summary = routeBody("app.get('/api/analytics/summary'");
const drill = routeBody("app.get('/api/analytics/agent/:slug'");

test('summary: periode diselaraskan ke hari UTC rollup, bukan batas bulan WIB', () => {
  // Batas WIB memotong hari UTC; potongan yang mentahnya sudah terhapus hilang:
  // bulan lampau kehilangan seluruh hari terakhirnya (Sep 2026: 1.138 event).
  assert.match(summary, /const startOfMonth = `\$\{period\}-01T00:00:00\.000Z`/);
  assert.match(summary, /T23:59:59\.999Z`/);
  assert.doesNotMatch(summary, /new Date\(year, month - 1, 1\)\.toISOString\(\)/);
  // Bulan & jendela 7 hari berbagi ekor mentah: satu pemanggilan, endISO sama.
  assert.match(summary, /fetchEventsForRanges\(supabase, \[\s*\{ startISO: startOfMonth, endISO: endOfMonth \},\s*\{ startISO: sevenDaysAgoISO, endISO: nowISO \},/);
  assert.match(summary, /const endOfMonth = monthEndISO < nowISO \? monthEndISO : nowISO/);
});

test('summary: status/terakhir aktif dari jendela berjalan, bukan bulan terpilih, tanpa event pengunjung', () => {
  assert.match(summary, /const isAgentEvent = e => e\.event_type !== 'public'/);
  assert.match(summary, /for \(const e of last7dRawEvents\) if \(isAgentEvent\(e\)\) bumpLastActive/);
  assert.match(summary, /const activeAgents = agentList\.filter\(a => lastActiveMsById\.has\(a\.id\)\)\.length/);
  // Agen yang diam di jendela: lookback 30 hari di rollup, hanya untuk mereka.
  assert.match(summary, /\.in\('agent_id', idleAgentIds\)\s*\.neq\('event_type', 'public'\)/);
  // Status tak lagi dihitung dari rawForAgent/aggForAgent (= bulan terpilih).
  assert.doesNotMatch(summary, /rawForAgent\[0\]\?\.created_at/);
  assert.match(summary, /health: healthByAgent\.get\(agent\.id\) \|\| 'dormant'/);
  assert.doesNotMatch(summary, /agentList\.find\(g => g\.slug === a\.slug\)/);
  assert.match(summary, /if \(!e\.agent_id \|\| !isAgentEvent\(e\)\) continue;/);
});

test('summary: "Aktivitas Terbaru · Hari ini" memakai tanggal WIB', () => {
  assert.match(summary, /toJakartaDateStr\(e\.created_at\) === todayJakartaStr/);
  assert.doesNotMatch(summary, /const todayStr = now\.toISOString\(\)\.slice\(0, 10\)/);
});

test('drill-down: 7 hari kalender WIB, dipaginasi, tanpa metadata', () => {
  assert.match(drill, /const startISO = new Date\(todayJakartaMid - 6 \* DAY_MS - TZ_SHIFT\)\.toISOString\(\)/);
  assert.match(drill, /const events = await fetchAllRows\(/);
  assert.match(drill, /\.select\('event_type, event_name, created_at'\)/);
  assert.doesNotMatch(drill, /metadata/);
  assert.match(drill, /\.gte\('tgl_daftar', windowStartDate\)/);
  assert.match(drill, /activeDays: new Set\(evList\.filter\(e => e\.event_type !== 'public'\)/);
});

test('AnalyticsPage: pemilih bulan relatif ke hari ini, respons usang dibuang, muat ulang tak mengganti isi', () => {
  assert.match(pageSource, /const monthOptions = Array\.from\(\{ length: 12 \}, \(_, i\) => \{\s*const d = new Date\(now\.getFullYear\(\), now\.getMonth\(\) - i, 1\)/);
  assert.doesNotMatch(pageSource, /setSelectedYear\(selectedYear - 1\)/);
  assert.match(pageSource, /if \(requestId !== requestSeqRef\.current\) return;/);
  assert.match(pageSource, /if \(loading && !data\) \{/);
  assert.match(pageSource, /if \(error && !data\) \{/);
  assert.match(pageSource, /Total Login · \{periodLabel\}/);
  assert.doesNotMatch(pageSource, /Belum pernah login/);
});

test('AgentDrillDownModal mengunci gulir halaman di belakangnya', () => {
  assert.match(drillSource, /useEffect\(\(\) => lockDocumentScroll\(\), \[\]\)/);
});
