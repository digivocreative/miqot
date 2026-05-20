import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url);
const server = readFileSync(join(root.pathname, 'server.js'), 'utf8');
const jamaahPage = readFileSync(join(root.pathname, 'src/components/JamaahPage.tsx'), 'utf8');

test('umroh jamaah endpoint supports operational follow-up filters', () => {
  assert.match(server, /payment_status\s*=\s*''/);
  assert.match(server, /departure_window\s*=\s*''/);
  assert.match(server, /document_filter\s*=\s*''/);
  assert.match(server, /equipment_filter\s*=\s*''/);
  assert.match(server, /notes_filter\s*=\s*''/);
  assert.match(server, /package_filter\s*=\s*''/);
  assert.match(server, /case 'belum_dp'/);
  assert.match(server, /case 'lebih_bayar'/);
  assert.match(server, /case 'paspor_missing'/);
  assert.match(server, /case 'documents_incomplete'/);
  assert.match(server, /case 'equipment_pending'/);
  assert.match(server, /case 'equipment_incomplete'/);
  assert.match(server, /case 'has_notes'/);
  assert.match(server, /case 'no_notes'/);
});

test('umroh page exposes useful filters and sends them to the API', () => {
  assert.match(jamaahPage, /const \[paymentFilter, setPaymentFilter\]/);
  assert.match(jamaahPage, /const \[departureFilter, setDepartureFilter\]/);
  assert.match(jamaahPage, /const \[documentFilter, setDocumentFilter\]/);
  assert.match(jamaahPage, /const \[equipmentFilter, setEquipmentFilter\]/);
  assert.match(jamaahPage, /const \[notesFilter, setNotesFilter\]/);
  assert.match(jamaahPage, /const \[packageFilter, setPackageFilter\]/);
  assert.match(jamaahPage, /params\.set\('payment_status', paymentFilter\)/);
  assert.match(jamaahPage, /params\.set\('departure_window', departureFilter\)/);
  assert.match(jamaahPage, /params\.set\('document_filter', documentFilter\)/);
  assert.match(jamaahPage, /params\.set\('equipment_filter', equipmentFilter\)/);
  assert.match(jamaahPage, /params\.set\('notes_filter', notesFilter\)/);
  assert.match(jamaahPage, /params\.set\('package_filter', packageFilter\.trim\(\)\)/);
  assert.match(jamaahPage, />Status Bayar</);
  assert.match(jamaahPage, />Keberangkatan</);
  assert.match(jamaahPage, />Dokumen</);
  assert.match(jamaahPage, />Perlengkapan</);
  assert.match(jamaahPage, />Catatan</);
  assert.match(jamaahPage, />Paket\/Jadwal</);
});

test('umroh advanced filter panel uses compact controls instead of crowded chip rows', () => {
  assert.doesNotMatch(jamaahPage, /grid grid-cols-5 gap-1\.5/);
  assert.match(jamaahPage, /value=\{paymentFilter\}[\s\S]*setPaymentFilter\(e\.target\.value as PaymentFilter\)/);
  assert.match(jamaahPage, /value=\{departureFilter\}[\s\S]*setDepartureFilter\(e\.target\.value as DepartureFilter\)/);
});
