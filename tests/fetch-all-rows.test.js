import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { fetchAllRows, withStableOrder } from '../lib/fetch-all-rows.js';

const sb = createClient('http://localhost:54321', 'anon-key-for-url-building-only');
const orderOf = (query) => query.url.searchParams.get('order');

test('jamaah reads get the unique id appended after the caller\'s own (non-unique) order', () => {
  assert.equal(orderOf(withStableOrder(sb.from('jamaah').select('id').eq('agent_id', 'a'))), 'id.asc');
  assert.equal(
    orderOf(withStableOrder(sb.from('jamaah').select('sisa').order('sisa', { ascending: false }).order('tgl_berangkat'))),
    'sisa.desc,tgl_berangkat.asc,id.asc',
  );
  assert.equal(orderOf(withStableOrder(sb.from('jamaah').select('id').order('id', { ascending: false }))), 'id.desc');
});

test('jamaah_haji reads are ordered by the full unique key; unknown tables are left alone', () => {
  assert.equal(
    orderOf(withStableOrder(sb.from('jamaah_haji').select('id_haji').order('id_haji'))),
    'id_haji.asc,agent_id.asc,id_jamaah.asc',
  );
  assert.equal(orderOf(withStableOrder(sb.from('agents').select('slug'))), null);
});

test('pages until a short page, over the stably ordered query', async () => {
  const pages = [];
  const rows = Array.from({ length: 2345 }, (_, i) => ({ id: i }));
  const fake = {
    url: new URL('http://x/rest/v1/jamaah'),
    order() { this.url.searchParams.set('order', 'id.asc'); return this; },
    async range(from, to) { pages.push([from, to, this.url.searchParams.get('order')]); return { data: rows.slice(from, to + 1), error: null }; },
  };
  const all = await fetchAllRows(fake);
  assert.equal(all.length, 2345);
  assert.deepEqual(pages, [[0, 999, 'id.asc'], [1000, 1999, 'id.asc'], [2000, 2999, 'id.asc']]);
});
