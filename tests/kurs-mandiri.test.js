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

test('fetchMandiriKursHtml moves to the next client when one is blocked', async () => {
  const { fetchMandiriKursHtml } = await loadKursModule();
  const tried = [];

  const result = await fetchMandiriKursHtml({
    attempts: [
      { label: 'curl', run: async () => { tried.push('curl'); throw new Error('spawn curl ENOENT'); } },
      { label: 'tls-chrome', run: async () => { tried.push('tls-chrome'); throw new Error('HTTP 403'); } },
      { label: 'default', run: async () => { tried.push('default'); return '<table>ok</table>'; } },
    ],
  });

  assert.deepEqual(tried, ['curl', 'tls-chrome', 'default']);
  assert.equal(result.html, '<table>ok</table>');
  assert.equal(result.via, 'default');
});

test('fetchMandiriKursHtml surfaces the last error when every client is blocked', async () => {
  const { fetchMandiriKursHtml } = await loadKursModule();
  const failures = [];

  await assert.rejects(
    fetchMandiriKursHtml({
      attempts: [
        { label: 'curl', run: async () => { throw new Error('spawn curl ENOENT'); } },
        { label: 'tls-chrome', run: async () => { throw new Error('HTTP 403'); } },
      ],
      onAttemptFail: (label, err) => failures.push(`${label}:${err.message}`),
    }),
    /HTTP 403/
  );

  assert.deepEqual(failures, ['curl:spawn curl ENOENT', 'tls-chrome:HTTP 403']);
});

test('kurs fetch leads with curl, then a TLS profile that is not Node default', async () => {
  const { MANDIRI_TLS_CIPHERS, createMandiriFetchAttempts } = await loadKursModule();
  const tls = await import('node:tls');

  // Akamai memblokir lewat sidik jari TLS: begitu daftar cipher-nya kembali
  // sama dengan bawaan Node, ClientHello-nya kembali dikenali dan 403 lagi.
  assert.notEqual(MANDIRI_TLS_CIPHERS, tls.DEFAULT_CIPHERS);

  const attempts = createMandiriFetchAttempts();
  // Urutan ini bukan selera. Dari server produksi, percobaan tls-chrome
  // MENGGANTUNG sampai timeout penuh, sementara curl punya sidik jari TLS
  // sendiri yang terbukti lolos. Menaruh curl belakangan berarti tiap siklus
  // penyegaran membuang satu timeout utuh sebelum sampai ke yang berpeluang jalan.
  assert.deepEqual(attempts.map(a => a.label), ['curl', 'tls-chrome', 'default']);
  assert.ok(attempts.every(a => typeof a.run === 'function'), 'tiap percobaan wajib punya run()');
});

test('shouldWaitForKursFetch never blocks a request that already has rates to serve', async () => {
  const { shouldWaitForKursFetch } = await loadKursModule();

  // Kurs basi seminggu masih jauh lebih berguna daripada dashboard yang
  // menggantung 15 detik menunggu upstream yang diblokir. Widget Kurs digerbangi
  // `{kursData && ...}` tanpa skeleton, jadi permintaan yang lambat = widget hilang.
  const basiSeminggu = {
    rates: { USD: 17780, SAR: 4906 },
    updatedAt: '24/08/26 09:51 WIB',
    fetchedAt: Date.parse('2026-08-24T02:51:00.000Z'),
  };
  assert.equal(shouldWaitForKursFetch(basiSeminggu), false);
});

test('shouldWaitForKursFetch waits only when there is nothing at all to serve', async () => {
  const { shouldWaitForKursFetch } = await loadKursModule();

  assert.equal(shouldWaitForKursFetch(null), true);
  assert.equal(shouldWaitForKursFetch(undefined), true);
  assert.equal(shouldWaitForKursFetch({ rates: {}, updatedAt: '', fetchedAt: 0 }), true);
});

test('canAttemptKursFetch keeps a cooldown between outbound attempts', async () => {
  const { canAttemptKursFetch, KURS_MIN_ATTEMPT_GAP_MS } = await loadKursModule();
  const now = Date.parse('2026-08-31T05:00:00.000Z');

  // isKursCacheRefreshDue() bernilai true TERUS selama data belum hari ini, tanpa
  // memandang kapan percobaan terakhir. Selama permintaan masih menunggu fetch,
  // hal itu tersamarkan karena percobaannya terserialisasi. Setelah penyegaran
  // dipindah ke latar belakang, tanpa jeda ini tiap permintaan akan menyalakan
  // fetch baru begitu yang sebelumnya selesai — palu bertubi ke Mandiri persis
  // saat reputasi IP server sedang jadi masalah.
  assert.equal(canAttemptKursFetch(null, now), true, 'belum pernah mencoba');
  assert.equal(canAttemptKursFetch(now - 60_000, now), false, 'baru semenit lalu');
  assert.equal(canAttemptKursFetch(now - KURS_MIN_ATTEMPT_GAP_MS, now), true, 'jeda sudah lewat');
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

test('fetchMandiriKursHtml honours one total deadline, not a fresh timeout per client', async () => {
  const { fetchMandiriKursHtml } = await loadKursModule();
  const handed = [];
  let clock = 0;

  // Pagu per-percobaan membuat rantai tiga klien bisa memakan 3x jatah penuh.
  // Rantai ini berjalan di latar belakang, tapi tetap tidak boleh menahan soket
  // dan proses curl jauh lebih lama daripada satu siklus penyegaran.
  const eatBudget = (ms) => async ({ timeoutMs }) => {
    handed.push(timeoutMs);
    clock += ms;
    throw new Error('HTTP 403');
  };

  await assert.rejects(
    fetchMandiriKursHtml({
      attempts: [
        { label: 'curl', run: eatBudget(9000) },
        { label: 'tls-chrome', run: eatBudget(9000) },
        { label: 'default', run: eatBudget(9000) },
      ],
      timeoutMs: 12000,
      totalBudgetMs: 15000,
      now: () => clock,
    }),
    /HTTP 403/
  );

  // Percobaan 1 dapat jatah penuh; percobaan 2 hanya sisa anggaran; percobaan 3
  // tidak pernah dijalankan karena anggarannya sudah habis.
  assert.deepEqual(handed, [12000, 6000]);
});
