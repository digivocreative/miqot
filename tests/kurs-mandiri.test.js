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
