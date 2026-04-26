/**
 * Probe Alhijaz official API to discover real response shape & field coverage.
 *
 * Usage:
 *   AWAPI_KEY="SM01078-kDUFDznksE4EC" AWAPI_CODE="SM01078" node scripts/test-awapi.js
 *
 * Optional env:
 *   AWAPI_TAHUN_M=2026          (Masehi year, default: current year)
 *   AWAPI_TAHUN_H=1447          (Hijriah year, default: 1447)
 *   AWAPI_BULAN=                (Masehi month 1-12, optional)
 *   AWAPI_ID_UMRAH=             (sample id_umrah to probe by-id endpoint)
 *   AWAPI_ID_JAMAAH=            (sample id_jamaah to probe by-id endpoint)
 *
 * The script does NOT touch Supabase. It only prints response status,
 * top-level keys, sample row keys, and a row count summary.
 */

const BASE = 'http://115.124.86.220';

const apiKey = process.env.AWAPI_KEY;
const code = process.env.AWAPI_CODE || (apiKey ? apiKey.split('-')[0] : null);
const tahunM = process.env.AWAPI_TAHUN_M || String(new Date().getFullYear());
const tahunH = process.env.AWAPI_TAHUN_H || '1447';
const bulan = process.env.AWAPI_BULAN || '';
const idUmrah = process.env.AWAPI_ID_UMRAH || '';
const idJamaah = process.env.AWAPI_ID_JAMAAH || '';

if (!apiKey || !code) {
  console.error('Missing AWAPI_KEY (and AWAPI_CODE could not be derived).');
  process.exit(1);
}

async function probe(label, url, { withKey = true } = {}) {
  const headers = { Accept: 'application/json' };
  if (withKey) headers['x-api-key'] = apiKey;

  const started = Date.now();
  let res, text;
  try {
    res = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
    text = await res.text();
  } catch (err) {
    console.log(`\n=== ${label} ===`);
    console.log(`URL: ${url}`);
    console.log(`NETWORK ERROR: ${err.message}`);
    return;
  }
  const elapsed = Date.now() - started;

  console.log(`\n=== ${label} ===`);
  console.log(`URL: ${url}`);
  console.log(`Status: ${res.status} ${res.statusText} (${elapsed}ms, ${text.length} bytes)`);

  let json;
  try {
    json = JSON.parse(text);
  } catch {
    console.log('Body (not JSON, first 500 chars):');
    console.log(text.slice(0, 500));
    return;
  }

  const topKeys = Array.isArray(json) ? `[Array length=${json.length}]` : Object.keys(json);
  console.log('Top-level shape:', topKeys);

  // Try common DataTables shape (aaData) and also raw arrays / nested data.
  let rows = null;
  if (Array.isArray(json)) rows = json;
  else if (Array.isArray(json.aaData)) rows = json.aaData;
  else if (Array.isArray(json.data)) rows = json.data;
  else if (Array.isArray(json.rows)) rows = json.rows;

  if (rows) {
    console.log(`Detected row array: ${rows.length} rows`);
    if (rows.length > 0) {
      const sample = rows[0];
      if (Array.isArray(sample)) {
        console.log('First row is positional array, length:', sample.length);
        console.log('Sample row:', JSON.stringify(sample).slice(0, 600));
      } else if (sample && typeof sample === 'object') {
        console.log('First row keys:', Object.keys(sample));
        console.log('First row sample:', JSON.stringify(sample).slice(0, 800));
      } else {
        console.log('First row primitive:', sample);
      }
    }
  } else {
    console.log('Body preview:', JSON.stringify(json).slice(0, 800));
  }
}

async function main() {
  console.log(`Agent code: ${code}`);
  console.log(`Tahun Masehi: ${tahunM} | Tahun Hijriah: ${tahunH} | Bulan: ${bulan || '(none)'}\n`);

  // Jadwal (hijriah). Screenshot did not show key requirement; try without first, then with.
  await probe('JADWAL (no key)', `${BASE}/jadwal/api-get/${tahunH}`, { withKey: false });
  await probe('JADWAL (with key)', `${BASE}/jadwal/api-get/${tahunH}`);

  // Umrah by keberangkatan
  await probe('UMRAH /bm (Masehi)', `${BASE}/awapi/gu/${code}/bm/${tahunM}`);
  if (bulan) {
    await probe('UMRAH /bm (Masehi+Bulan)', `${BASE}/awapi/gu/${code}/bm/${tahunM}/${bulan}`);
  }
  await probe('UMRAH /bh (Hijriah)', `${BASE}/awapi/gu/${code}/bh/${tahunH}`);

  // Umrah by pendaftaran
  await probe('UMRAH /dm (Masehi)', `${BASE}/awapi/gu/${code}/dm/${tahunM}`);
  if (bulan) {
    await probe('UMRAH /dm (Masehi+Bulan)', `${BASE}/awapi/gu/${code}/dm/${tahunM}/${bulan}`);
  }
  await probe('UMRAH /dh (Hijriah)', `${BASE}/awapi/gu/${code}/dh/${tahunH}`);

  // By ID
  if (idUmrah) {
    await probe('UMRAH /umrah/{ID}', `${BASE}/awapi/gu/${code}/umrah/${idUmrah}`);
  } else {
    console.log('\n(skip /umrah/{ID} — set AWAPI_ID_UMRAH to probe)');
  }
  if (idJamaah) {
    await probe('JAMAAH /jamaah/{ID}', `${BASE}/awapi/gu/${code}/jamaah/${idJamaah}`);
  } else {
    console.log('\n(skip /jamaah/{ID} — set AWAPI_ID_JAMAAH to probe)');
  }

  // Negative test: invalid key
  console.log('\n=== Negative test: invalid key ===');
  const bad = await fetch(`${BASE}/awapi/gu/${code}/bm/${tahunM}`, {
    headers: { 'x-api-key': 'INVALID-KEY', Accept: 'application/json' },
  }).catch((e) => ({ status: 'ERR', statusText: e.message }));
  console.log(`Invalid-key response: ${bad.status} ${bad.statusText || ''}`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
