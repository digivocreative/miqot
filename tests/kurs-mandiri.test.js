import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const fixture = () => readFileSync(
  fileURLToPath(new URL('./fixtures/kursdollar-mandiri.html', import.meta.url)),
  'utf8',
);

async function loadKursModule() {
  try {
    return await import('../lib/kurs-mandiri.js');
  } catch {
    assert.fail('lib/kurs-mandiri.js should export testable Mandiri kurs helpers');
  }
}

test('parseKursdollarHtml reads the DD/TT sell rates of the newest date', async () => {
  const { parseKursdollarHtml } = await loadKursModule();

  const parsed = parseKursdollarHtml(fixture());

  // Diadu langsung dengan TT Counter di www.bankmandiri.co.id pada 1 Sep 2026
  // 09:54 WIB: USD 17820, SAR 4918, SGD 14099. DD/TT di kursdollar adalah seri
  // yang sama persis, jadi angka di dashboard tidak bergeser sedikit pun.
  assert.equal(parsed.rates.USD, 17820);
  assert.equal(parsed.rates.SAR, 4918);
  assert.equal(parsed.rates.SGD, 14099);
  assert.equal(parsed.updatedAt, '01/09/26 10:10 WIB');
});

test('parseKursdollarHtml refuses to read any section other than DD/TT', async () => {
  const { parseKursdollarHtml } = await loadKursModule();

  const parsed = parseKursdollarHtml(fixture());

  // Ini penjaga terpenting di berkas ini. Di halaman yang sama, Bank Notes
  // tanggal 01/09 kebetulan identik dengan DD/TT tanggal 31/08 di SEMUA mata
  // uang, jadi salah seksi menghasilkan angka yang tampak wajar dan lolos tanpa
  // satu pun gejala - persis mode gagal yang menyandera kurs seminggu penuh.
  assert.notEqual(parsed.rates.USD, 17830, 'itu Bank Notes, bukan DD/TT');
  assert.notEqual(parsed.rates.USD, 17720, 'itu Special Rate, bukan DD/TT');
});

test('parseKursdollarHtml returns nothing rather than guessing when DD/TT is gone', async () => {
  const { parseKursdollarHtml } = await loadKursModule();

  // Kalau kursdollar mengganti nama seksinya, diam-diam jatuh ke tabel pertama
  // jauh lebih berbahaya daripada kosong: kosong memicu alarm ops, angka yang
  // salah tidak.
  const parsed = parseKursdollarHtml(`
    <table>
      <tr><td>Bank Notes</td></tr>
      <tr><td>Tanggal Update</td><td>( USD ) US Dollar</td></tr>
      <tr><td>Selasa 01/09/2026 10:10</td><td>Beli</td><td>17.530,00</td></tr>
      <tr><td>Jual</td><td>17.830,00</td></tr>
    </table>
  `);

  assert.deepEqual(parsed.rates, {});
  assert.equal(parsed.updatedAt, null);
});

test('parseKursdollarHtml locates currencies by header, not by column position', async () => {
  const { parseKursdollarHtml } = await loadKursModule();

  // Urutan kolom kursdollar berbeda dari Mandiri dan bisa bergeser kapan saja.
  // Parser lama memaku TT Counter ke cells[4]; di sini kolomnya sengaja dibalik.
  const parsed = parseKursdollarHtml(`
    <table>
      <tr><td>DD/TT</td></tr>
      <tr><td>Tanggal Update</td><td>( SAR ) Saudi Riyal</td><td>( USD ) US Dollar</td></tr>
      <tr><td>Selasa 01/09/2026 10:10</td><td>Beli</td><td>507,00</td><td>17.520,00</td></tr>
      <tr><td>Jual</td><td>4.918,00</td><td>17.820,00</td></tr>
    </table>
  `);

  assert.equal(parsed.rates.SAR, 4918);
  assert.equal(parsed.rates.USD, 17820);
});

test('parseKursdollarHtml emits a timestamp the existing WIB contract understands', async () => {
  const { parseKursdollarHtml, parseMandiriTimestamp, isKursToday } = await loadKursModule();

  const { updatedAt } = parseKursdollarHtml(fixture());

  // Seluruh hilir - isKursToday, shouldReplaceKursCache, penanda stale, kartu
  // share - membaca format `DD/MM/YY HH:MM WIB`. Normalisasi di parser inilah
  // yang membuat pergantian sumber tidak menyentuh satu pun dari mereka.
  assert.ok(parseMandiriTimestamp(updatedAt), 'tanggal kursdollar wajib ternormalkan');
  assert.equal(isKursToday(updatedAt, new Date('2026-09-01T04:00:00Z')), true);
  assert.equal(isKursToday(updatedAt, new Date('2026-09-02T04:00:00Z')), false);
});

test('CURRENCY_NAMES matches exactly what kursdollar publishes', async () => {
  const { CURRENCY_NAMES } = await loadKursModule();

  // Menayangkan mata uang yang sumbernya tidak punya berarti angka beku yang
  // menyamar segar; CHF/DKK/NOK/SEK karena itu dibuang, dan KRW ikut masuk.
  assert.deepEqual(
    Object.keys(CURRENCY_NAMES).sort(),
    ['AUD', 'CAD', 'CNY', 'EUR', 'GBP', 'HKD', 'JPY', 'KRW', 'MYR', 'NZD', 'SAR', 'SGD', 'THB', 'USD'],
  );
});

test('pickSupportedRates drops currencies this build no longer publishes', async () => {
  const { pickSupportedRates } = await loadKursModule();

  // Baris `kurs_cache` bisa saja ditulis oleh deploy lama yang masih menayangkan
  // 17 mata uang. Mengadopsinya mentah-mentah setelah restart akan menghidupkan
  // lagi CHF/DKK/NOK/SEK — angka yang sumbernya sudah tidak punya, alias beku
  // yang menyamar segar. Cache tidak boleh bisa memperkenalkan kembali mata uang
  // yang kode berjalan sudah buang.
  const dariCacheLama = {
    USD: 17820, SAR: 4918, CHF: 22321, DKK: 2850, NOK: 1965, SEK: 1894,
  };

  assert.deepEqual(pickSupportedRates(dariCacheLama), { USD: 17820, SAR: 4918 });
});

test('pickSupportedRates survives a missing or malformed cache row', async () => {
  const { pickSupportedRates } = await loadKursModule();

  assert.deepEqual(pickSupportedRates(null), {});
  assert.deepEqual(pickSupportedRates({ USD: 'bukan angka', SAR: 4918 }), { SAR: 4918 });
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

test('fetchKursHtml abandons a hung source instead of holding the socket open', async () => {
  const { fetchKursHtml } = await loadKursModule();

  // Rantai anti-Akamai sudah dibongkar, tapi pagunya tidak: kursdollar yang
  // menggantung tetap tidak boleh menahan proses lebih lama dari satu siklus
  // penyegaran. Yang dijaga di sini adalah pagu itu diteruskan ke fetch, bukan
  // dibiarkan tak terbatas.
  let handed = null;

  await assert.rejects(
    fetchKursHtml({
      timeoutMs: 12000,
      fetchImpl: async (_url, opts) => {
        handed = opts?.signal ?? null;
        throw new Error('HTTP 503');
      },
    }),
    /HTTP 503/,
  );

  assert.ok(handed, 'fetch wajib menerima AbortSignal, bukan berjalan tanpa pagu');
});
