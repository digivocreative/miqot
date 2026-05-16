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

  assert.match(source, /Paket\s+\{pkg\.name\}\s+\{selectedRoom\.label\}/);
  assert.match(source, /Simulasi Haji Plus\s+·\s+\{pkg\?\.name\}\s+\{selectedRoom\.label\}/);
  assert.match(source, /\{fmtUSD\(selectedPriceUSD\)\}\s*×\s*\{jumlahJamaah\}\s*jamaah/);
});
