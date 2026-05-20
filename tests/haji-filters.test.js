import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url);
const server = readFileSync(join(root.pathname, 'server.js'), 'utf8');
const hajiPage = readFileSync(join(root.pathname, 'src/components/HajiPage.tsx'), 'utf8');

test('haji jamaah endpoint supports registration year, package, and follow-up filters', () => {
  assert.match(server, /daftar_year\s*=\s*''/);
  assert.match(server, /gte\('tgl_daftar', `\$\{daftarYear\}-01-01`\)/);
  assert.match(server, /lt\('tgl_daftar', `\$\{Number\(daftarYear\) \+ 1\}-01-01`\)/);
  assert.match(server, /paket_filter\s*=\s*''/);
  assert.match(server, /paket\.ilike\.\%\$\{safePaket\}\%/);
  assert.match(server, /follow_up\s*=\s*''/);
  assert.match(server, /case 'bpih_missing'/);
  assert.match(server, /case 'paspor_missing'/);
  assert.match(server, /case 'telp_missing'/);
  assert.match(server, /case 'has_notes'/);
  assert.match(server, /select\('thn_masehi, tgl_daftar'\)/);
  assert.match(server, /const daftarYears = \[\.\.\.new Set/);
  assert.match(server, /daftarYears,/);
});

test('haji page exposes agreed filters and sends them to the API', () => {
  assert.match(hajiPage, /const \[daftarYear, setDaftarYear\]/);
  assert.match(hajiPage, /const \[statusBayarFilter, setStatusBayarFilter\]/);
  assert.match(hajiPage, /const \[paketFilter, setPaketFilter\]/);
  assert.match(hajiPage, /params\.set\('daftar_year', daftarYear\)/);
  assert.match(hajiPage, /params\.set\('status_bayar', statusBayarFilter\)/);
  assert.match(hajiPage, /params\.set\('paket_filter', paketFilter\)/);
  assert.match(hajiPage, />Tahun Daftar</);
  assert.match(hajiPage, />Status Bayar</);
  assert.match(hajiPage, />Paket</);
  assert.doesNotMatch(hajiPage, />Follow-up</);
  assert.doesNotMatch(hajiPage, /const \[followUpFilter, setFollowUpFilter\]/);
  assert.doesNotMatch(hajiPage, /params\.set\('follow_up', followUpFilter\)/);
  assert.doesNotMatch(hajiPage, /\['DOUBLE', 'Double'\]/);
  assert.doesNotMatch(hajiPage, /\['TRIPLE', 'Triple'\]/);
  assert.doesNotMatch(hajiPage, /\['QUARD', 'Quard'\]/);
  assert.match(hajiPage, /jamaahList\.map\(item => String\(item\.tgl_daftar \|\| ''\)\.slice\(0, 4\)\)/);
  assert.doesNotMatch(hajiPage, /marketingFilter|setMarketingFilter|params\.set\('marketing'/);
  assert.doesNotMatch(hajiPage, /perwakilanFilter|setPerwakilanFilter|params\.set\('perwakilan'/);
  assert.doesNotMatch(hajiPage, /staffFilter|setStaffFilter|params\.set\('staff'/);
});

test('haji filter drawer uses animated expand and collapse', () => {
  assert.match(hajiPage, /<AnimatePresence initial=\{false\}>/);
  assert.match(hajiPage, /key="haji-filter-panel"/);
  assert.match(hajiPage, /<motion\.div[\s\S]*initial=\{\{ height: 0, opacity: 0 \}\}/);
  assert.match(hajiPage, /animate=\{\{ height: 'auto', opacity: 1 \}\}/);
  assert.match(hajiPage, /exit=\{\{ height: 0, opacity: 0 \}\}/);
  assert.match(hajiPage, /style=\{\{ overflow: 'hidden' \}\}/);
});
