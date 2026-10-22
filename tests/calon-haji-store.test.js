import test from 'node:test';
import assert from 'node:assert/strict';

import { loadCalonHaji, replaceCalonHaji } from '../lib/calon-haji-store.js';

// Supabase palsu: setiap query builder di-await → handler(query) memutuskan
// {data, error}. Semua query terekam berurutan untuk diperiksa.
function fakeSb(handler) {
  const log = [];
  const sb = {
    from(table) {
      const q = { table, ops: [] };
      const api = new Proxy({}, {
        get(_, prop) {
          if (prop === 'then') {
            return (resolve, reject) => {
              log.push(q);
              Promise.resolve().then(() => handler(q)).then(resolve, reject);
            };
          }
          return (...args) => { q.ops.push([prop, ...args]); return api; };
        },
      });
      return api;
    },
  };
  return { sb, log };
}
const op = (q, name) => q.ops.find((o) => o[0] === name);
const summary = (log) => log.map((q) => `${q.table}:${q.ops.map((o) => o[0]).join('.')}`);
const mkRows = (n) => Array.from({ length: n }, (_, i) => ({ no_urut: i + 1, nama: `N${i + 1}` }));
const header = { tanggalData: '2026-10-19', jumlah: 1416 };

test('replace: insert impor → baris (batch 500) → upsert penunjuk → hapus impor lama', async () => {
  const { sb, log } = fakeSb((q) => {
    if (q.table === 'calon_haji_imports' && op(q, 'insert')) return { data: { id: 'new-id' }, error: null };
    if (q.table === 'calon_haji_aktif' && op(q, 'select')) return { data: { import_id: 'old-id' }, error: null };
    return { data: null, error: null };
  });
  const res = await replaceCalonHaji(sb, { musim: 2027, header, rows: mkRows(1416), sumber: 'x.pdf' });
  assert.deepEqual(res, { importId: 'new-id', replacedImportId: 'old-id' });
  assert.deepEqual(summary(log), [
    'calon_haji_imports:insert.select.single',
    'calon_haji:insert', 'calon_haji:insert', 'calon_haji:insert',
    'calon_haji_aktif:select.eq.maybeSingle',
    'calon_haji_aktif:upsert',
    'calon_haji_imports:delete.eq',
  ]);
  const imp = op(log[0], 'insert')[1];
  assert.deepEqual(imp, { musim: 2027, tanggal_data: '2026-10-19', jumlah: 1416, sumber: 'x.pdf' });
  assert.deepEqual(log.slice(1, 4).map((q) => op(q, 'insert')[1].length), [500, 500, 416]);
  assert.ok(op(log[1], 'insert')[1].every((r) => r.import_id === 'new-id'));
  assert.equal(op(log[5], 'upsert')[1].import_id, 'new-id');
  assert.deepEqual(op(log[6], 'eq'), ['eq', 'id', 'old-id']);
});

test('replace: insert baris batch ke-2 gagal → penunjuk TIDAK diubah, impor baru dihapus, throw', async () => {
  let batch = 0;
  const { sb, log } = fakeSb((q) => {
    if (q.table === 'calon_haji_imports' && op(q, 'insert')) return { data: { id: 'new-id' }, error: null };
    if (q.table === 'calon_haji' && op(q, 'insert')) return ++batch === 2 ? { data: null, error: { message: 'boom' } } : { data: null, error: null };
    return { data: null, error: null };
  });
  await assert.rejects(replaceCalonHaji(sb, { musim: 2027, header, rows: mkRows(1416), sumber: 'x.pdf' }), /boom/);
  assert.ok(!log.some((q) => q.table === 'calon_haji_aktif'));
  const last = log.at(-1);
  assert.equal(last.table, 'calon_haji_imports');
  assert.deepEqual(op(last, 'eq'), ['eq', 'id', 'new-id']);
  assert.ok(op(last, 'delete'));
});

test('load: belum ada penunjuk → { rows: [] }', async () => {
  const { sb, log } = fakeSb(() => ({ data: null, error: null }));
  assert.deepEqual(await loadCalonHaji(sb, 2027), { rows: [] });
  assert.equal(log.length, 1);
});

test('load: 2.300 baris → paging range 0-999, 1000-1999, 2000-2999 → 2.300 kembali urut no_urut', async () => {
  const all = mkRows(2300);
  const { sb, log } = fakeSb((q) => {
    if (q.table === 'calon_haji_aktif') return { data: { import_id: 'act' }, error: null };
    if (q.table === 'calon_haji_imports') return { data: { jumlah: 2300 }, error: null };
    const [, from, to] = op(q, 'range');
    return { data: all.slice(from, to + 1), error: null };
  });
  const { rows } = await loadCalonHaji(sb, 2027);
  assert.equal(rows.length, 2300);
  assert.deepEqual(rows.map((r) => r.no_urut), all.map((r) => r.no_urut));
  const pages = log.filter((q) => q.table === 'calon_haji');
  assert.deepEqual(pages.map((q) => op(q, 'range').slice(1)), [[0, 999], [1000, 1999], [2000, 2999]]);
  assert.ok(pages.every((q) => op(q, 'eq')[2] === 'act' && op(q, 'order')[1] === 'no_urut'));
});

// Impor lain memindahkan penunjuk + menghapus impor lama (cascade) di sela
// halaman → halaman berikutnya kosong. Jangan kembalikan daftar terpotong.
function racingSb(truncatedAttempts) {
  const all = mkRows(2300);
  let attempt = 0;
  return fakeSb((q) => {
    if (q.table === 'calon_haji_aktif') { attempt += 1; return { data: { import_id: `imp${attempt}` }, error: null }; }
    if (q.table === 'calon_haji_imports') return { data: { jumlah: 2300 }, error: null };
    const [, from, to] = op(q, 'range');
    if (attempt <= truncatedAttempts && from > 0) return { data: [], error: null };
    return { data: all.slice(from, to + 1), error: null };
  });
}

test('load: halaman terpotong karena impor bersamaan → ulang sekali → lengkap', async () => {
  const { sb } = racingSb(1);
  const { rows } = await loadCalonHaji(sb, 2027);
  assert.equal(rows.length, 2300);
});

test('load: tetap tidak lengkap setelah diulang → throw, bukan daftar terpotong', async () => {
  const { sb } = racingSb(99);
  await assert.rejects(loadCalonHaji(sb, 2027), /tidak lengkap/);
});
