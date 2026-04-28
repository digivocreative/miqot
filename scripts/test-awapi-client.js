/**
 * Smoke test for awapi-client.js — exercises all 4 fetch functions
 * + normalizer, prints summary and a normalized sample.
 *
 * Usage:
 *   AWAPI_KEY="SM01078-kDUFDznksE4EC" node scripts/test-awapi-client.js
 */
import {
  awapiFetchUmrahByKeberangkatan,
  awapiFetchUmrahByPendaftaran,
  awapiFetchUmrahById,
  awapiFetchJamaahById,
  awapiFetchJadwal,
  normalizeAwapiRow,
  AwapiError,
} from '../awapi-client.js';

const apiKey = process.env.AWAPI_KEY;
if (!apiKey) {
  console.error('Missing AWAPI_KEY env');
  process.exit(1);
}
const code = apiKey.split('-')[0];
const tahunM = String(new Date().getFullYear());
const tahunH = '1447';

const FAKE_AGENT_ID = '00000000-0000-0000-0000-000000000000';

async function run(label, fn) {
  process.stdout.write(`\n=== ${label} ===\n`);
  const t0 = Date.now();
  try {
    const result = await fn();
    const dt = Date.now() - t0;
    console.log(`OK ${dt}ms — rows=${result.rows.length}`);
    if (result.rows.length > 0) {
      const norm = normalizeAwapiRow(result.rows[0], { agentId: FAKE_AGENT_ID });
      console.log('Normalized sample:');
      console.log(JSON.stringify(norm, null, 2).slice(0, 1200));
    }
    return result;
  } catch (err) {
    const dt = Date.now() - t0;
    if (err instanceof AwapiError) {
      console.log(`FAIL ${dt}ms — ${err.status} ${err.message}`);
    } else {
      console.log(`FAIL ${dt}ms — ${err.message}`);
    }
    return null;
  }
}

(async () => {
  await run(`Jadwal ${tahunH}`, () => awapiFetchJadwal(tahunH, apiKey));
  const bm = await run(`Umrah by keberangkatan Masehi ${tahunM}`,
    () => awapiFetchUmrahByKeberangkatan(apiKey, code, { tahun: tahunM }));
  await run(`Umrah by keberangkatan Masehi ${tahunM}/06`,
    () => awapiFetchUmrahByKeberangkatan(apiKey, code, { tahun: tahunM, bulan: 6 }));
  await run(`Umrah by keberangkatan Hijriah ${tahunH}`,
    () => awapiFetchUmrahByKeberangkatan(apiKey, code, { tahun: tahunH, hijriah: true }));
  await run(`Umrah by pendaftaran Masehi ${tahunM}`,
    () => awapiFetchUmrahByPendaftaran(apiKey, code, { tahun: tahunM }));

  // Use first row from /bm to probe by-id endpoints
  if (bm && bm.rows.length > 0) {
    const first = bm.rows[0];
    await run(`Umrah by id_umrah=${first.id_umrah}`,
      () => awapiFetchUmrahById(apiKey, code, first.id_umrah));
    await run(`Jamaah by id_jamaah=${first.id_jamaah}`,
      () => awapiFetchJamaahById(apiKey, code, first.id_jamaah));
  }

  // Negative test: bad agent code
  await run(`Negative test: invalid agentCode`,
    () => awapiFetchUmrahByKeberangkatan(apiKey, 'INVALID00', { tahun: tahunM }));
})();
