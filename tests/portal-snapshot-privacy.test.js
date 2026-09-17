import { test } from 'node:test';
import assert from 'node:assert/strict';
import { maskSnapshotForStorage } from '../src/components/portal-jamaah/lib/portalSnapshotPrivacy.ts';

// Salinan /me untuk portal offline disimpan di localStorage (bisa di HP keluarga yang
// dipakai bergantian). Nomor paspor tidak boleh tersimpan utuh; kehadirannya tetap
// dipakai checklist dokumen ("lengkap"), jadi nilainya dimasking, bukan dihapus.
test('nomor paspor dimasking di salinan tersimpan, kolom lain utuh', () => {
  const data = {
    booking: { id_umroh: 'U1' },
    jamaah: [
      { id: 1, nama: 'A', no_paspor: 'C1234567', paspor_expired: '2030-01-01', wa: '0812' },
      { id: 2, nama: 'B', no_paspor: null, paspor_expired: null, wa: null },
      { id: 3, nama: 'C', no_paspor: '  X99  ', paspor_expired: null, wa: null },
    ],
    agent: null,
    schedule: null,
  };
  const masked = maskSnapshotForStorage(data);
  assert.equal(masked.jamaah[0].no_paspor, '••••4567');
  assert.equal(masked.jamaah[1].no_paspor, null);
  assert.equal(masked.jamaah[2].no_paspor, '••••X99');
  assert.equal(masked.jamaah[0].paspor_expired, '2030-01-01');
  assert.equal(masked.jamaah[0].wa, '0812');
  // Data di memori (tampilan online) tidak ikut berubah.
  assert.equal(data.jamaah[0].no_paspor, 'C1234567');
});
