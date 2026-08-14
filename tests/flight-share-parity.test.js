import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Buffer } from 'node:buffer';
import { transformSync } from 'esbuild';

const dashboard = readFileSync(new URL('../src/components/FlightStatusCard.tsx', import.meta.url), 'utf8');
const sharePage = readFileSync(new URL('../src/components/FlightSharePage.tsx', import.meta.url), 'utf8');
const routeLine = readFileSync(new URL('../src/components/FlightRouteLine.tsx', import.meta.url), 'utf8');

async function importTsModule(path) {
  const source = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
  const { code } = transformSync(source, {
    loader: 'ts',
    format: 'esm',
    sourcemap: false,
  });
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
}

test('dashboard and public share page use the same status presentation and route bar', () => {
  assert.match(dashboard, /import FlightRouteLine from ['"]\.\/FlightRouteLine['"]/);
  assert.match(sharePage, /import FlightRouteLine from ['"]\.\/FlightRouteLine['"]/);
  assert.match(dashboard, /getFlightStatusPresentation\(summaryFlight\.status\)/);
  assert.match(sharePage, /getFlightStatusPresentation\(currentFlightStatus\)/);
  assert.match(dashboard, /<FlightRouteLine flight=\{summaryFlight\}/);
  assert.match(sharePage, /<FlightRouteLine[\s\S]*status: currentFlightStatus[\s\S]*progress: flight\.progress/);
  assert.doesNotMatch(sharePage, /flex-1 h-\[3px\] bg-emerald-500/);
  assert.doesNotMatch(sharePage, /flight\.is_live|status\.label\.toUpperCase\(\)/);
});

test('shared route bar preserves every dashboard status animation branch', () => {
  assert.match(routeLine, /status === 'scheduled'[\s\S]*stroke-dashoffset/);
  assert.match(routeLine, /status === 'en-route'[\s\S]*auroraGradientId/);
  assert.match(routeLine, /status === 'delayed'[\s\S]*stroke-dashoffset/);
  assert.match(routeLine, /status === 'landed'[\s\S]*values="3;6;5"/);
  assert.match(routeLine, /status === 'cancelled'[\s\S]*strokeDasharray="3 3"/);
});

test('public share page refreshes status and progress on the dashboard cadence', () => {
  assert.match(sharePage, /const FLIGHT_SHARE_REFRESH_MS = 30 \* 60 \* 1000/);
  assert.match(sharePage, /window\.setInterval\([\s\S]*loadFlight\(\)[\s\S]*FLIGHT_SHARE_REFRESH_MS/);
  assert.match(sharePage, /cache: 'no-store'/);
});

test('public share title uses kloter, flight number, and agent name', () => {
  assert.match(sharePage, /flightPageTitle\(data\.flight\.group_number, dfn, agentName\)/);
  assert.match(sharePage, /`Kloter \$\{kloterValue\}`/);
  assert.match(sharePage, /`Lacak Penerbangan \$\{kloterName\} \| \$\{flightNumber\} \| \$\{agentName\}`/);
});

test('unknown statuses safely use the same scheduled fallback', async () => {
  const { getFlightStatusPresentation, normalizeFlightStatus, FLIGHT_STATUS_PRESENTATION } =
    await importTsModule('src/lib/flightStatusPresentation.ts');

  assert.equal(normalizeFlightStatus('ACTIVE'), 'scheduled');
  assert.equal(normalizeFlightStatus('en-route'), 'en-route');

  // Kunci bawaan Object.prototype tidak boleh lolos jadi status. Probe-nya
  // WAJIB yang selamat dari .toLowerCase(): 'toString' turun jadi 'tostring',
  // yang memang bukan anggota prototype, jadi asersi itu dulu lolos karena
  // huruf kecilnya — bukan karena penjaga hasOwnProperty-nya bekerja. Uji
  // mutasi (mengganti penjaga itu jadi `[key] !== undefined`) tetap hijau
  // sampai probe-nya diganti ke 'constructor', yang huruf kecil semua.
  assert.equal(normalizeFlightStatus('constructor'), 'scheduled');
  assert.equal(normalizeFlightStatus('toString'), 'scheduled');

  // Status tak dikenal harus jatuh ke presentasi 'scheduled' yang sama PERSIS.
  // Yang dipaku identitasnya, bukan ejaan labelnya: 5c6ac00 mengganti
  // "Dijadwalkan" -> "Terjadwal" dengan sengaja (badge menutupi nomor
  // penerbangan), dan penjaga yang memaku literal copy ikut merah tiap kali
  // copy-nya sah berubah — persis yang membuat asersi ini basi.
  const fallback = getFlightStatusPresentation('unknown');
  assert.deepEqual(fallback, FLIGHT_STATUS_PRESENTATION.scheduled);
  assert.deepEqual(fallback, getFlightStatusPresentation('scheduled'));

  // ...dan jatuhnya bukan karena SEMUA status runtuh ke satu presentasi.
  const landed = getFlightStatusPresentation('landed');
  assert.deepEqual(landed, FLIGHT_STATUS_PRESENTATION.landed);
  assert.notDeepEqual(landed, fallback);

  // Anti-asersi hampa: tanpa ini, getFlightStatusPresentation() yang selalu
  // mengembalikan undefined membuat kedua deepEqual di atas lolos diam-diam.
  for (const [name, presentation] of [['fallback', fallback], ['landed', landed]]) {
    assert.ok(presentation, `presentasi ${name} kosong`);
    assert.ok(presentation.label?.length > 0, `presentasi ${name} tanpa label`);
  }

  // Label bebas berubah (copy), tapi tak boleh kembar — dua status yang tampil
  // dengan tulisan sama membuat badge-nya tak bisa dibedakan.
  const labels = Object.values(FLIGHT_STATUS_PRESENTATION).map(p => p.label);
  assert.equal(new Set(labels).size, labels.length, `label status kembar: ${labels.join(', ')}`);
});
