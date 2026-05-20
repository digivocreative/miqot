import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const rootPath = new URL('..', import.meta.url).pathname;

function read(path) {
  return readFileSync(join(rootPath, path), 'utf8');
}

test('SimulasiHajiPlus defines room-type pricing for RAHMAH and UHUD', () => {
  const source = read('src/components/SimulasiHajiPlus.tsx');

  assert.match(source, /type\s+RoomTypeId\s*=\s*'double'\s*\|\s*'triple'\s*\|\s*'quad'/);
  assert.match(source, /const\s+ROOM_TYPES\s*=/);
  for (const id of ['double', 'triple', 'quad']) {
    assert.match(source, new RegExp(`id:\\s*'${id}'`));
  }

  assert.match(source, /id:\s*'rahmah'[\s\S]*pricesUSD:\s*\{[\s\S]*double:\s*17400[\s\S]*triple:\s*16400[\s\S]*quad:\s*15700[\s\S]*\}/);
  assert.match(source, /id:\s*'uhud'[\s\S]*pricesUSD:\s*\{[\s\S]*double:\s*14000[\s\S]*triple:\s*13000[\s\S]*quad:\s*12500[\s\S]*\}/);
});

test('SimulasiHajiPlus keeps Quad as default and calculates from selected room price', () => {
  const source = read('src/components/SimulasiHajiPlus.tsx');

  assert.match(source, /useState<RoomTypeId>\('quad'\)/);
  assert.match(source, /selectedPriceUSD\s*=\s*pkg\s*\?\s*pkg\.pricesUSD\[selectedRoomType\]\s*:\s*0/);
  assert.match(source, /const\s+totalUSD\s*=\s*selectedPriceUSD\s*\*\s*jumlahJamaah/);
  assert.doesNotMatch(source, /const\s+totalUSD\s*=\s*pkg\.priceUSD\s*\*\s*jumlahJamaah/);
});

test('SimulasiHajiPlus displays room type in the exported offer labels', () => {
  const source = read('src/components/SimulasiHajiPlus.tsx');

  assert.match(source, /Tipe kamar[\s\S]*\{selectedRoom\.label\}/);
  assert.match(source, /Simulasi Haji Plus\s+·\s+\{pkg\?\.name\}\s+\{selectedRoom\.label\}/);
  assert.match(source, /\{fmtUSD\(selectedPriceUSD\)\}\s*×\s*\{jumlahJamaah\}\s*jamaah/);
});

test('SimulasiHajiPlus export waits for fonts and images before capture', () => {
  const source = read('src/components/SimulasiHajiPlus.tsx');

  assert.match(source, /document\.fonts\?\.ready/);
  assert.match(source, /querySelectorAll\('img'\)/);
  assert.match(source, /\.decode\(\)/);
  assert.match(source, /prepareOfferCardForCapture\(el\)/);
});

test('SimulasiHajiPlus export uses stronger consultation copy and safer projection wording', () => {
  const source = read('src/components/SimulasiHajiPlus.tsx');

  assert.match(source, /Konsultan Haji Plus/);
  assert.match(source, /Amankan Porsi Haji Plus Sekarang/);
  assert.doesNotMatch(source, /Konsultasi & Booking Seat/);
  assert.match(source, /Simulasi kurs 1\.5%\/tahun/);
  assert.doesNotMatch(source, /inflasi ~1\.5%\/thn/);
  assert.doesNotMatch(source, /±\{calc\.diffMonths\} bulan dari sekarang/);
});

test('SimulasiHajiPlus exports the offer card at a fixed 4:6 ratio', () => {
  const source = read('src/components/SimulasiHajiPlus.tsx');

  assert.match(source, /const\s+OFFER_CARD_WIDTH\s*=\s*400/);
  assert.match(source, /const\s+OFFER_CARD_HEIGHT\s*=\s*600/);
  assert.match(source, /width:\s*OFFER_CARD_WIDTH/);
  assert.match(source, /height:\s*OFFER_CARD_HEIGHT/);
  assert.match(source, /gridTemplateRows:\s*'56px 60px 96px 206px 104px 78px'/);
  assert.match(source, /lineHeight:\s*1\.18/);
});

test('SimulasiHajiPlus condenses export schedule and projection into one compact panel', () => {
  const source = read('src/components/SimulasiHajiPlus.tsx');

  assert.match(source, /Ringkasan Jadwal & Estimasi/);
  assert.match(source, /Berangkat[\s\S]*Tahun \{tahunBerangkat\}/);
  assert.match(source, /Est\. IDR[\s\S]*\{fmtRp\(calc\.estTotalIDR\)\}/);
  assert.doesNotMatch(source, /\/\*\s*Jadwal Keberangkatan\s*\*\//);
  assert.doesNotMatch(source, /\/\*\s*Proyeksi Inflasi\s*\*\//);
});

test('SimulasiHajiPlus export uses compact copy that does not force package text wrapping', () => {
  const source = read('src/components/SimulasiHajiPlus.tsx');

  assert.match(source, /Hotel Bintang \{pkg\.stars\}/);
  assert.doesNotMatch(source, /\{pkg\.hotel\}/);
});

test('SimulasiHajiPlus export keeps compact text readable and prevents total-row overlap', () => {
  const source = read('src/components/SimulasiHajiPlus.tsx');

  assert.match(source, /gridTemplateColumns:\s*'1fr auto'[\s\S]*Total Biaya/);
  assert.match(source, /Total Biaya[\s\S]*whiteSpace:\s*'nowrap'/);
  assert.doesNotMatch(source, /fontSize:\s*7\.5/);
  assert.doesNotMatch(source, /#94a3b8/);
});

test('SimulasiHajiPlus export shows a blue verification check on the agent avatar', () => {
  const source = read('src/components/SimulasiHajiPlus.tsx');

  assert.match(source, /position:\s*'relative'[\s\S]*agent\.photo/);
  assert.match(source, /top:\s*-2[\s\S]*right:\s*-2[\s\S]*background:\s*'#3b82f6'/);
  assert.match(source, /border:\s*'1px solid #ffffff'/);
  assert.match(source, /path d="M2 5\.5L4 7\.5L8 3"/);
});

test('SimulasiHajiPlus export spaces the title, fills the total panel, and centers footer text', () => {
  const source = read('src/components/SimulasiHajiPlus.tsx');

  assert.match(source, /padding:\s*'12px 24px 8px'[\s\S]*Simulasi Biaya Haji Plus/);
  assert.match(source, /display:\s*'grid'[\s\S]*gridTemplateRows:\s*'34px 55px 55px 1fr'[\s\S]*Rincian Pembayaran/);
  assert.match(source, /padding:\s*'0 24px'[\s\S]*display:\s*'flex'[\s\S]*alignItems:\s*'center'[\s\S]*Amankan Porsi Haji Plus Sekarang/);
});

test('SimulasiHajiPlus export uses a richer Islamic geometric pattern in header and footer', () => {
  const source = read('src/components/SimulasiHajiPlus.tsx');

  assert.match(source, /const\s+ISLAMIC_PATTERN_BACKGROUND\s*=/);
  assert.match(source, /polygon points="48 8 56 32 80 40 56 48 48 72 40 48 16 40 40 32"/);
  assert.equal((source.match(/backgroundImage:\s*ISLAMIC_PATTERN_BACKGROUND/g) || []).length, 2);
  assert.doesNotMatch(source, /M20 4l4 8h-8l4-8/);
});
