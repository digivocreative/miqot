import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
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
  assert.match(source, /computeHajiPlusEscalation\(\{[\s\S]*basePriceUSD:\s*selectedPriceUSD/);
  assert.match(source, /calc\.escalatedTotalUSD/);
  assert.doesNotMatch(source, /Math\.pow\(1\.015,/); // inline kurs math moved into the helper
});

test('SimulasiHajiPlus on-screen result shows escalated total, base reference, and a ladder', () => {
  const source = read('src/components/SimulasiHajiPlus.tsx');
  assert.match(source, /import\s+PriceLadder\s+from\s+'\.\/PriceLadder'/);
  assert.match(source, /import\s+\{\s*computeHajiPlusEscalation,\s*condenseLadder[\s\S]*from\s+'@\/lib\/hajiPlusPricing'/);
  assert.match(source, /const fmtUSD = .*Math\.round/);
  assert.match(source, /fmtUSD\(calc\.escalatedTotalUSD\)/);
  assert.match(source, /harga dasar/);
  assert.match(source, /<PriceLadder[\s\S]*ladder=\{calc\.ladder\}/);
});

test('SimulasiHajiPlus starts departure-year choices at 2036', () => {
  const source = read('src/components/SimulasiHajiPlus.tsx');

  assert.match(source, /useState\(2036\)/);
  assert.match(source, /Array\.from\(\{\s*length:\s*6\s*\},\s*\(_,\s*i\)\s*=>\s*2036\s*\+\s*i\)/);
  assert.doesNotMatch(source, /useState\(2035\)/);
  assert.doesNotMatch(source, /=>\s*2035\s*\+\s*i/);
});

test('HajiPlusPage defaults to the leftmost Simulasi tab', () => {
  const source = read('src/components/HajiPlusPage.tsx');

  assert.match(source, /useState<HajiPlusTab>\(initialTab\s*\|\|\s*'simulasi'\)/);
  assert.match(source, /const\s+TAB_CONFIG\s*=\s*\[\s*\{\s*id:\s*'simulasi'[\s\S]*\{\s*id:\s*'statistik'/);
  assert.doesNotMatch(source, /useState<HajiPlusTab>\(initialTab\s*\|\|\s*'statistik'\)/);
});

test('AIToolsPage labels the Haji Plus tool as an offer simulation', () => {
  const source = read('src/components/AIToolsPage.tsx');

  assert.match(source, /name:\s*'Simulasi Haji Plus'/);
  assert.match(source, /desc:\s*'Buat penawaran untuk calon jamaah haji'/);
  assert.match(source, /id:\s*'haji-plus'[\s\S]*id:\s*'landing-page'/);
  assert.doesNotMatch(source, new RegExp(['Infografis', 'Haji', 'Plus'].join('\\s+')));
  assert.doesNotMatch(source, new RegExp(['Grafik data', 'jamaah haji plus', 'per tahun'].join('\\s+')));
});

test('SimulasiHajiPlus displays room type in the exported offer labels', () => {
  const source = read('src/components/SimulasiHajiPlus.tsx');

  assert.match(source, /Tipe kamar[\s\S]*\{selectedRoom\.label\}/);
  assert.match(source, /Simulasi Haji Plus\s+·\s+\{pkg\?\.name\}\s+\{selectedRoom\.label\}/);
  assert.match(source, /\{fmtUSD\(calc\.escalatedPriceUSD\)\}\s*×\s*\{jumlahJamaah\}\s*jamaah/);
});

test('SimulasiHajiPlus export waits for fonts and images before capture', () => {
  const source = read('src/components/SimulasiHajiPlus.tsx');

  assert.match(source, /document\.fonts\?\.ready/);
  assert.match(source, /querySelectorAll\('img'\)/);
  assert.match(source, /\.decode\(\)/);
  assert.match(source, /prepareOfferCardForCapture\(el\)/);
  assert.match(source, /if\s*\(agentPhotoFailed\)[\s\S]*setAgentPhotoFailed\(false\)[\s\S]*requestAnimationFrame/);
});

test('SimulasiHajiPlus export uses same-origin banner assets instead of remote agent photos', () => {
  const source = read('src/components/SimulasiHajiPlus.tsx');

  assert.match(source, /slug\?:\s*string/);
  assert.match(source, /getSameOriginAgentPhotoPath/);
  assert.match(source, /photo\.startsWith\('\/agents\/'\)/);
  assert.match(source, /\/agent-photos\//);
  assert.match(source, /split\('\/'\)\.pop\(\)/);
  assert.match(source, /resolveSelfHostedAgentPhoto/);
  assert.match(source, /`\/agents\/\$\{slug\}\.jpg`/);
  assert.match(source, /src=\{agentPhotoSrc\}/);
  assert.doesNotMatch(source, /src=\{agent\.photo\}/);
});

test('SimulasiHajiPlus has a self-hosted photo for Yeyen Alhijaz current agent slug', () => {
  assert.equal(existsSync(join(rootPath, 'public/agents/harga.jpg')), true);
});

test('SimulasiHajiPlus export uses stronger consultation copy and safer projection wording', () => {
  const source = read('src/components/SimulasiHajiPlus.tsx');

  assert.match(source, /Konsultan Haji Plus/);
  assert.match(source, /Amankan Porsi Haji Plus Sekarang/);
  assert.doesNotMatch(source, /Konsultasi & Booking Seat/);
  assert.match(source, /kurs \+\{pctLabel\(kursRate\)\}\/th/);
  assert.doesNotMatch(source, /inflasi ~1\.5%\/thn/);
  assert.doesNotMatch(source, /±\{calc\.diffMonths\} bulan dari sekarang/);
});

test('SimulasiHajiPlus exports the offer card at a fixed 4:6 ratio', () => {
  const source = read('src/components/SimulasiHajiPlus.tsx');

  assert.match(source, /const\s+OFFER_CARD_WIDTH\s*=\s*400/);
  assert.match(source, /const\s+OFFER_CARD_HEIGHT\s*=\s*646/);
  assert.match(source, /width:\s*OFFER_CARD_WIDTH/);
  assert.match(source, /height:\s*OFFER_CARD_HEIGHT/);
  assert.match(source, /gridTemplateRows:\s*'56px 60px 96px 206px 150px 78px'/);
  assert.match(source, /lineHeight:\s*1\.18/);
});

test('SimulasiHajiPlus export shows the price-projection ladder panel', () => {
  const source = read('src/components/SimulasiHajiPlus.tsx');
  assert.match(source, /Proyeksi Harga Paket/);
  assert.match(source, /exportLadder\.map/);
  assert.match(source, /Estimasi total \{tahunBerangkat\}/);
  assert.match(source, /fmtRp\(calc\.estTotalIDR\)/);
  assert.doesNotMatch(source, /Ringkasan Jadwal & Estimasi/);
});

test('SimulasiHajiPlus export uses compact copy that does not force package text wrapping', () => {
  const source = read('src/components/SimulasiHajiPlus.tsx');

  assert.match(source, /Hotel Bintang \{pkg\.stars\}/);
  assert.doesNotMatch(source, /\{pkg\.hotel\}/);
});

test('SimulasiHajiPlus export keeps compact text readable and prevents total-row overlap', () => {
  const source = read('src/components/SimulasiHajiPlus.tsx');

  assert.match(source, /gridTemplateColumns:\s*'1fr auto'[\s\S]*Total Estimasi/);
  assert.match(source, /Total Estimasi[\s\S]*whiteSpace:\s*'nowrap'/);
  assert.doesNotMatch(source, /fontSize:\s*7\.5/);
  assert.doesNotMatch(source, /#94a3b8/);
});

test('SimulasiHajiPlus export shows a blue verification check on the agent avatar', () => {
  const source = read('src/components/SimulasiHajiPlus.tsx');

  assert.match(source, /position:\s*'relative'[\s\S]*agentPhotoSrc/);
  assert.match(source, /top:\s*-1[\s\S]*right:\s*-1[\s\S]*width:\s*13[\s\S]*height:\s*13[\s\S]*background:\s*'#3b82f6'/);
  assert.match(source, /svg width="8" height="8"/);
  assert.match(source, /strokeWidth="1\.7"/);
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
  assert.match(source, /svg width="56" height="56"/);
  assert.match(source, /path d="M28 6L33 21L50 28L33 35L28 50L23 35L6 28L23 21Z"/);
  assert.match(source, /backgroundSize:\s*'56px 56px'/);
  assert.equal((source.match(/backgroundImage:\s*ISLAMIC_PATTERN_BACKGROUND/g) || []).length, 2);
  assert.doesNotMatch(source, /M20 4l4 8h-8l4-8/);
});

test('server serves agent photos through a same-origin self-hosted route', () => {
  const source = read('server.js');

  assert.match(source, /app\.get\('\/agents\/:file'/);
  assert.match(source, /loadAgentPhotoBuffer\(agent\?\.photo,\s*slug\)/);
  assert.match(source, /function\s+detectImageContentType/);
  assert.match(source, /0x89[\s\S]*0x50[\s\S]*image\/png/);
  assert.match(source, /detectImageContentType\(photoBuffer/);
  assert.match(source, /Cache-Control':\s*'public, max-age=3600/);
});

test('PriceLadder renders ladder rows with normalized bars and departure emphasis', () => {
  const source = read('src/components/PriceLadder.tsx');
  assert.match(source, /ladder\.map/);
  assert.match(source, /isDeparture/);
  assert.match(source, /45\s*\+/);          // bar-width floor
  assert.match(source, /\*\s*55/);          // bar-width span
  assert.match(source, /fmtUSD\(e\.priceUSD\)/);
});

test('SimulasiHajiPlus export invoice uses the departure-year price', () => {
  const source = read('src/components/SimulasiHajiPlus.tsx');
  assert.match(source, /Estimasi harga \{tahunBerangkat\}/);          // paket card label
  assert.match(source, /Proyeksi Harga Per Jamaah/);
  assert.match(source, /Estimasi harga di \{tahunBerangkat\}/);
  assert.doesNotMatch(source, /Proyeksi Harga Paket \/ jamaah/);
  assert.doesNotMatch(source, /Estimasi harga asli di \{tahunBerangkat\}/);
  assert.match(source, /fmtUSD\(calc\.escalatedPriceUSD\)/);          // paket card price
  assert.match(source, /fmtUSD\(calc\.escalatedTotalUSD\)/);          // invoice total
  assert.match(source, /harga dasar/);                                // base reference
  assert.doesNotMatch(source, /fmtUSD\(calc\.totalUSD\)/);            // old field gone
  assert.doesNotMatch(source, /fmtRp\(calc\.totalIDR\)/);
});

test('SimulasiHajiPlus lets the agent choose price and kurs escalation rates', () => {
  const source = read('src/components/SimulasiHajiPlus.tsx');
  // option lists + both rates defaulting to 1.5%
  assert.match(source, /const PRICE_RATE_OPTIONS = \[0\.01, 0\.015, 0\.02, 0\.025, 0\.03\]/);
  assert.match(source, /const KURS_RATE_OPTIONS = \[0\.005, 0\.01, 0\.015, 0\.02, 0\.025\]/);
  assert.match(source, /const \[priceRate, setPriceRate\] = useState\(0\.015\)/);
  assert.match(source, /const \[kursRate, setKursRate\] = useState\(0\.015\)/);
  assert.match(source, /setPriceRate\(Number\(e\.target\.value\)\)/);
  assert.match(source, /setKursRate\(Number\(e\.target\.value\)\)/);
  // threaded into the calc
  assert.match(source, /computeHajiPlusEscalation\(\{[\s\S]*priceRate,[\s\S]*kursRate,[\s\S]*\}\)/);
  // labels are dynamic, not hardcoded rate literals
  assert.match(source, /estimasi ~\{pctLabel\(priceRate\)\}\/th/);
  assert.match(source, /kurs \+\{pctLabel\(kursRate\)\}\/th/);
  assert.doesNotMatch(source, /~2\.5%\/th/);
});
