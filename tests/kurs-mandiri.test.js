import test from 'node:test';
import assert from 'node:assert/strict';

async function loadKursModule() {
  try {
    return await import('../lib/kurs-mandiri.js');
  } catch {
    assert.fail('lib/kurs-mandiri.js should export testable Mandiri kurs helpers');
  }
}

test('parseMandiriKursHtml reads TT Counter sell rates and timestamp', async () => {
  const { parseMandiriKursHtml } = await loadKursModule();
  const html = `
    <table>
      <thead>
        <tr>
          <th>Mata Uang</th>
          <th>Special Rate*<br>22/05/26 - 09:19 WIB</th>
          <th>TT Counter<br>22/05/26 - 09:35 WIB</th>
          <th>Bank Notes<br>22/05/26 - 09:32 WIB</th>
        </tr>
        <tr><th></th><th>Beli</th><th>Jual</th><th>Beli</th><th>Jual</th><th>Beli</th><th>Jual</th></tr>
      </thead>
      <tbody>
        <tr><td>USD</td><td>17.690,00</td><td>17.720,00</td><td>17.480,00</td><td>17.780,00</td><td>17.480,00</td><td>17.780,00</td></tr>
        <tr><td>SAR</td><td>4.703,00</td><td>4.722,00</td><td>4.500,00</td><td>4.909,00</td><td>4.500,00</td><td>4.909,00</td></tr>
      </tbody>
    </table>
  `;

  const parsed = parseMandiriKursHtml(html);

  assert.equal(parsed.updatedAt, '22/05/26 09:35 WIB');
  assert.equal(parsed.rates.USD, 17780);
  assert.equal(parsed.rates.SAR, 4909);
});

test('isKursCacheRefreshDue refreshes old same-day cache', async () => {
  const { isKursCacheRefreshDue } = await loadKursModule();
  const oldSameDayCache = {
    rates: { USD: 17750 },
    updatedAt: '22/05/26 09:11 WIB',
    fetchedAt: Date.parse('2026-05-22T02:11:00.000Z'),
  };

  assert.equal(
    isKursCacheRefreshDue(
      oldSameDayCache,
      Date.parse('2026-05-22T09:45:00.000Z'),
      30 * 60 * 1000
    ),
    true
  );
});

test('shouldReplaceKursCache rejects older Mandiri timestamps', async () => {
  const { shouldReplaceKursCache } = await loadKursModule();
  const current = {
    rates: { USD: 17780 },
    updatedAt: '22/05/26 09:35 WIB',
    fetchedAt: Date.parse('2026-05-22T02:35:00.000Z'),
  };
  const older = {
    rates: { USD: 17750 },
    updatedAt: '22/05/26 09:11 WIB',
    fetchedAt: Date.parse('2026-05-22T09:45:00.000Z'),
  };

  assert.equal(shouldReplaceKursCache(current, older), false);
  assert.equal(shouldReplaceKursCache(older, current), true);
});

test('fetchMandiriKursHtml falls back to the next client when Akamai answers 403', async () => {
  const { fetchMandiriKursHtml } = await loadKursModule();
  const tried = [];
  const fetchImpl = async (url, options) => {
    tried.push(options.dispatcher?.tag ?? 'default');
    if (tried.length === 1) {
      return { ok: false, status: 403, text: async () => '<title>Mandiri Maintenance</title>' };
    }
    return { ok: true, status: 200, text: async () => '<table>ok</table>' };
  };

  const result = await fetchMandiriKursHtml({
    fetchImpl,
    attempts: [
      { label: 'tls-chrome', dispatcher: { tag: 'tls-chrome' } },
      { label: 'default', dispatcher: null },
    ],
  });

  assert.deepEqual(tried, ['tls-chrome', 'default']);
  assert.equal(result.html, '<table>ok</table>');
  assert.equal(result.via, 'default');
});

test('fetchMandiriKursHtml surfaces the last error when every client is blocked', async () => {
  const { fetchMandiriKursHtml } = await loadKursModule();
  const failures = [];

  await assert.rejects(
    fetchMandiriKursHtml({
      fetchImpl: async () => ({ ok: false, status: 403, text: async () => '' }),
      attempts: [
        { label: 'tls-chrome', dispatcher: { tag: 'tls-chrome' } },
        { label: 'default', dispatcher: null },
      ],
      onAttemptFail: (label, err) => failures.push(`${label}:${err.message}`),
    }),
    /HTTP 403/
  );

  assert.deepEqual(failures, ['tls-chrome:HTTP 403', 'default:HTTP 403']);
});

test('kurs fetch leads with a TLS profile that is not Node default', async () => {
  const { MANDIRI_TLS_CIPHERS, createMandiriFetchAttempts } = await loadKursModule();
  const tls = await import('node:tls');

  // Akamai memblokir lewat sidik jari TLS: begitu daftar cipher-nya kembali
  // sama dengan bawaan Node, ClientHello-nya kembali dikenali dan 403 lagi.
  assert.notEqual(MANDIRI_TLS_CIPHERS, tls.DEFAULT_CIPHERS);

  const attempts = createMandiriFetchAttempts();
  assert.ok(attempts.length >= 2, 'butuh minimal satu fallback');
  assert.ok(attempts[0].dispatcher, 'percobaan pertama wajib memakai dispatcher sidik jari khusus');
  assert.equal(attempts.at(-1).dispatcher, null, 'percobaan terakhir memakai klien bawaan');
});

test('decideKursFetchAlert stays quiet when the scrape works but rates are not published yet', async () => {
  const { decideKursFetchAlert } = await loadKursModule();
  const now = Date.parse('2026-08-29T03:02:00.000Z');

  // Akhir pekan / libur: halaman terbaca normal, hanya tanggalnya masih kemarin.
  // Ini BUKAN insiden — kalau ikut dialarmkan, ops dapat notifikasi tiap Sabtu
  // dan Minggu sampai alertnya diabaikan.
  assert.equal(decideKursFetchAlert({ failed: false, alertedAt: null, nowMs: now }), 'quiet');
});

test('decideKursFetchAlert raises once, holds, then re-nudges a long outage', async () => {
  const { decideKursFetchAlert, KURS_ALERT_RENUDGE_MS } = await loadKursModule();
  const firstFailure = Date.parse('2026-08-25T05:02:00.000Z');

  assert.equal(decideKursFetchAlert({ failed: true, alertedAt: null, nowMs: firstFailure }), 'alert');
  assert.equal(
    decideKursFetchAlert({ failed: true, alertedAt: firstFailure, nowMs: firstFailure + KURS_ALERT_RENUDGE_MS - 1 }),
    'quiet'
  );
  assert.equal(
    decideKursFetchAlert({ failed: true, alertedAt: firstFailure, nowMs: firstFailure + KURS_ALERT_RENUDGE_MS }),
    'alert'
  );
});

test('decideKursFetchAlert reports recovery only to someone who got the alarm', async () => {
  const { decideKursFetchAlert } = await loadKursModule();
  const now = Date.parse('2026-08-31T05:02:00.000Z');

  assert.equal(decideKursFetchAlert({ failed: false, alertedAt: now - 60_000, nowMs: now }), 'recovered');
  assert.equal(decideKursFetchAlert({ failed: false, alertedAt: null, nowMs: now }), 'quiet');
});
