import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Buffer } from 'node:buffer';
import { transformSync } from 'esbuild';

async function importTsModule(path) {
  const source = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
  const { code } = transformSync(source, {
    loader: 'ts',
    format: 'esm',
    sourcemap: false,
  });
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
}

/**
 * Muat satu fungsi TOP-LEVEL yang tidak diekspor dari sebuah komponen, lalu
 * jalankan sungguhan.
 *
 * Kenapa lewat jalan ini dan bukan merender kartunya (bandingkan
 * fixtures/flight-card-render.js): default export FlightStatusCard mengambil
 * datanya sendiri di useEffect, dan useEffect tidak pernah jalan di
 * renderToStaticMarkup — kartunya akan selalu ter-render kosong, tanpa satu pun
 * nama tour leader. Menjalankan fungsi murninya adalah cara terdekat untuk
 * menguji PERILAKU alih-alih mencocokkan ejaan sumber.
 */
async function importPrivateFunction(path, name) {
  const source = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `fungsi ${name}() tidak ada lagi di ${path}`);
  // Sampai '}' di kolom 0 — bukan hitungan baris, supaya tubuh yang memanjang
  // tidak diam-diam memotong fungsinya di tengah.
  const end = source.indexOf('\n}\n', start);
  assert.notEqual(end, -1, `akhir fungsi ${name}() tidak ditemukan di ${path}`);
  const { code } = transformSync(`${source.slice(start, end)}\n}\nexport { ${name} };`, {
    loader: 'ts',
    format: 'esm',
    sourcemap: false,
  });
  const mod = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
  return mod[name];
}

test('flight card selects en-route, then delayed, then scheduled segment', async () => {
  const { selectActiveFlightSegment } = await importTsModule('src/lib/flightActiveSegment.ts');
  const fallback = { flightNumber: 'JOURNEY', status: 'scheduled' };
  const landed = { flightNumber: 'EK 802', status: 'landed' };
  const scheduled = { flightNumber: 'EK 358', status: 'scheduled' };
  const delayed = { flightNumber: 'EK 358', status: 'delayed' };
  const enRoute = { flightNumber: 'EK 802', status: 'en-route' };
  const unverified = { flightNumber: 'SV 261', status: 'unverified' };

  assert.equal(selectActiveFlightSegment(fallback, [landed, scheduled]), scheduled);
  assert.equal(selectActiveFlightSegment(fallback, [landed, scheduled, delayed]), delayed);
  assert.equal(selectActiveFlightSegment(fallback, [delayed, enRoute, scheduled]), enRoute);
  assert.equal(selectActiveFlightSegment(fallback, [landed, unverified]), unverified);
  assert.equal(selectActiveFlightSegment(fallback, [landed, scheduled, unverified]), scheduled);
  assert.equal(selectActiveFlightSegment(fallback, [landed, unverified, scheduled]), unverified);
  assert.equal(selectActiveFlightSegment(fallback, [landed]), landed);
});

test('pre-departure journey (no landed leg) surfaces the scheduled anchor over an earlier unverified leg', async () => {
  const { selectActiveFlightSegment } = await importTsModule('src/lib/flightActiveSegment.ts');
  const fallback = { flightNumber: 'JOURNEY', status: 'scheduled' };
  const unverifiedFirst = { flightNumber: 'EK 802', status: 'unverified' };
  const scheduledAnchor = { flightNumber: 'EK 358', status: 'scheduled' };

  // No landed leg → prefer the scheduled anchor even though it is the later leg.
  assert.equal(selectActiveFlightSegment(fallback, [unverifiedFirst, scheduledAnchor]), scheduledAnchor);

  // Once a leg has landed, an in-progress unverified leg must NOT be skipped.
  const landed = { flightNumber: 'EK 802', status: 'landed' };
  assert.equal(selectActiveFlightSegment(fallback, [landed, unverifiedFirst, scheduledAnchor]), unverifiedFirst);
});

test('flight status header renders the selected segment code, route, time and terminal', () => {
  const page = readFileSync(new URL('../src/components/FlightStatusCard.tsx', import.meta.url), 'utf8');

  assert.match(page, /selectActiveFlightSegment<FlightSegmentData>\(flight, segments\)/);
  assert.match(page, /function flightWithActiveSegment\(flight: FlightData\)/);
  assert.match(page, /\{summaryFlight\.flightNumber\}/);
  assert.match(page, /summaryFlight\.depActual \|\| summaryFlight\.depScheduled/);
  assert.match(page, /summaryFlight\.arrEstimated \|\| summaryFlight\.arrScheduled/);
  assert.match(page, /\{summaryFlight\.depCode \|\| '—'\}/);
  assert.match(page, /\{summaryFlight\.arrCode \|\| '—'\}/);
  assert.match(page, /T\{summaryFlight\.depTerminal\}/);
  assert.match(page, /<KloterDetail\s+flight=\{summaryFlight\}/);
  assert.doesNotMatch(page, /<KloterDetail\s+flight=\{first\}/);
  assert.doesNotMatch(page, /hasSegmentRows \? \(first\.transitLabel/);
});

test('route marker stays inside the SVG at both progress endpoints', () => {
  const routeLine = readFileSync(new URL('../src/components/FlightRouteLine.tsx', import.meta.url), 'utf8');

  assert.match(routeLine, /const markerEdgeInset = 8/);
  assert.match(routeLine, /const x1 = markerEdgeInset/);
  assert.match(routeLine, /const x2 = w - markerEdgeInset/);
  assert.match(routeLine, /Math\.min\(1, Math\.max\(0,[\s\S]*progress \/ 100/);
});

test('en-route traveled line renders a flowing aurora gradient without animated dashes', () => {
  const routeLine = readFileSync(new URL('../src/components/FlightRouteLine.tsx', import.meta.url), 'utf8');

  assert.match(routeLine, /<linearGradient[\s\S]*stopColor="#67e8f9"[\s\S]*stopColor="#dbeafe"/);
  assert.match(routeLine, /attributeName="x1"[\s\S]*dur="2\.8s"/);
  assert.match(routeLine, /attributeName="x2"[\s\S]*dur="2\.8s"/);
  assert.match(routeLine, /stroke=\{`url\(#\$\{auroraGradientId\}\)`\}/);
  assert.doesNotMatch(routeLine, /strokeDasharray="22 78"|strokeDasharray="10 90"/);
});

/**
 * Penjaga lama memaku `tlClean.toUpperCase()` dan menamai dirinya "in
 * uppercase". Invarian itu sudah DIBALIK dengan sengaja di b9a310b: nama tour
 * leader tidak lagi di-toUpperCase karena cleanTourLeader() memang sudah
 * menghasilkan Title Case — panel yang diperluas selama ini sudah begitu, baris
 * kloter yang belum. Jadi pin lamanya bukan sekadar bergeser, ia menjaga
 * kebalikan dari perilaku yang sekarang benar.
 *
 * Yang dijaga sekarang: normalisasinya Title Case (dibuktikan dengan
 * MENJALANKAN fungsinya), kedua titik render lewat normalisasi itu, dan tak ada
 * satu pun yang meneriakkannya kembali.
 */
test('tour leader names are normalised to Title Case, never shouted', async () => {
  const cleanTourLeader = await importPrivateFunction(
    'src/components/FlightStatusCard.tsx',
    'cleanTourLeader',
  );

  // Perilaku, bukan ejaan: TERIAK harus turun jadi Title Case.
  assert.equal(cleanTourLeader('•  h. AHMAD  zAiNi'), 'H. Ahmad Zaini');
  assert.equal(cleanTourLeader('USTADZ BUDI'), 'Ustadz Budi');
  assert.equal(cleanTourLeader('· KH. Abdul  Ghani'), 'Kh. Abdul Ghani');
  // Nilai kosong dari tabel jadwal jangan sampai jadi " · " menggantung.
  assert.equal(cleanTourLeader('-'), '');
  assert.equal(cleanTourLeader('   '), '');
  assert.equal(cleanTourLeader(undefined), '');

  const page = readFileSync(new URL('../src/components/FlightStatusCard.tsx', import.meta.url), 'utf8');

  // Kedua titik render harus lewat normalisasi itu. Dipasangkan dengan
  // importPrivateFunction di atas, rename cleanTourLeader jadi merah dua kali —
  // bukan lolos diam-diam.
  assert.match(page, /const tlClean = cleanTourLeader\(flight\.tourLeader\)/);
  assert.match(page, /const tlClean = cleanTourLeader\(kloter\.tourLeader\)/);

  // Dan tak boleh ada yang meneriakkannya lagi, atau melewati normalisasinya.
  assert.doesNotMatch(page, /tlClean\s*\.\s*toUpperCase\(\)/);
  assert.doesNotMatch(page, /\{\s*(?:flight|kloter)\.tourLeader\s*\}/);
});
