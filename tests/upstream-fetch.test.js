import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createUpstreamFetch, isRetryableConnectError } from '../lib/upstream-fetch.js';

function connectError(code) {
  return Object.assign(new TypeError('fetch failed'), { cause: Object.assign(new Error(code), { code }) });
}

async function withFakeFetch(impl, run) {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return impl(calls.length, url, options);
  };
  try {
    return await run(calls);
  } finally {
    globalThis.fetch = original;
  }
}

test('gagal-sambung diulang sampai tersambung, opsi diteruskan utuh + dispatcher', async () => {
  const upstreamFetch = createUpstreamFetch({ attempts: 5 });
  const failures = [connectError('UND_ERR_CONNECT_TIMEOUT'), connectError('ECONNRESET')];
  await withFakeFetch((n) => {
    if (n <= failures.length) throw failures[n - 1];
    return new Response('ok', { status: 200 });
  }, async (calls) => {
    const res = await upstreamFetch('http://upstream/x', { method: 'POST', redirect: 'manual', headers: { a: '1' } });
    assert.equal(await res.text(), 'ok');
    assert.equal(calls.length, 3);
    for (const { options } of calls) {
      assert.equal(options.method, 'POST');
      assert.equal(options.redirect, 'manual');
      assert.deepEqual(options.headers, { a: '1' });
      assert.ok(options.dispatcher, 'dispatcher sendiri dipasang');
    }
  });
});

test('berhenti setelah jumlah percobaan habis dan melempar error asli', async () => {
  const upstreamFetch = createUpstreamFetch({ attempts: 3 });
  await withFakeFetch(() => { throw connectError('UND_ERR_CONNECT_TIMEOUT'); }, async (calls) => {
    await assert.rejects(upstreamFetch('http://upstream/x'), (err) => err.cause?.code === 'UND_ERR_CONNECT_TIMEOUT');
    assert.equal(calls.length, 3);
  });
});

test('gagal yang bukan gagal-sambung (timeout keseluruhan, abort) tidak diulang', async () => {
  const upstreamFetch = createUpstreamFetch({ attempts: 5 });
  const timeout = new DOMException('The operation was aborted due to timeout', 'TimeoutError');
  await withFakeFetch(() => { throw timeout; }, async (calls) => {
    await assert.rejects(upstreamFetch('http://upstream/x'), (err) => err.name === 'TimeoutError');
    assert.equal(calls.length, 1);
  });
  assert.equal(isRetryableConnectError(timeout), false);
  assert.equal(isRetryableConnectError(connectError('ECONNREFUSED')), true);
});

test('respons non-2xx dikembalikan apa adanya (bukan urusan modul ini)', async () => {
  const upstreamFetch = createUpstreamFetch();
  await withFakeFetch(() => new Response('nope', { status: 503 }), async (calls) => {
    const res = await upstreamFetch('http://upstream/x');
    assert.equal(res.status, 503);
    assert.equal(calls.length, 1);
  });
});
