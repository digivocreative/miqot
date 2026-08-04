import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cheapestTierOf, minPriceInTier } from '../src/lib/packagePricing.ts';

// Data nyata JBU1543 "UMRAH REGULER PAKET RAHMAH MIX UHUD": UHUD 38,9 jt,
// RAHMAH 53,9 jt. Harga header ("MULAI") dulu selalu memakai minimum lintas
// SEMUA tier, jadi kartu yang tab-nya di RAHMAH tetap memasang angka UHUD —
// dan di gambar hasil "Simpan" tab tier sudah dibuang (data-screenshot-ignore),
// sehingga angka UHUD itu jadi satu-satunya harga yang terbaca.
const MIX = {
  UHUD: { Quard: '38900000', Triple: '40900000', Double: '44900000' },
  RAHMAH: { Quard: '53900000', Triple: '58900000', Double: '68900000' },
};

test('minPriceInTier: harga terendah di antara tipe kamar dalam satu tier', () => {
  assert.equal(minPriceInTier(MIX.UHUD), 38900000);
  assert.equal(minPriceInTier(MIX.RAHMAH), 53900000);
});

test('minPriceInTier: tipe kamar termurah menang walau bukan Quard', () => {
  assert.equal(minPriceInTier({ Quard: '44000000', Triple: '39000000' }), 39000000);
});

test('minPriceInTier: nilai kosong/tak terbaca/nol diabaikan', () => {
  assert.equal(minPriceInTier({ Quard: 'tba', Triple: '35000000' }), 35000000);
  assert.equal(minPriceInTier({ Quard: '0', Triple: '' }), null);
  assert.equal(minPriceInTier({}), null);
  assert.equal(minPriceInTier(null), null);
});

test('cheapestTierOf: tier yang memuat harga terendah', () => {
  assert.equal(cheapestTierOf(MIX), 'UHUD');
  assert.equal(cheapestTierOf({ RAHMAH: MIX.RAHMAH }), 'RAHMAH');
});

test('cheapestTierOf: tanpa harga terpakai, jatuh ke tier pertama', () => {
  assert.equal(cheapestTierOf({ HEMAT: { Quard: 'N/A' }, UHUD: {} }), 'HEMAT');
  assert.equal(cheapestTierOf({}), null);
});

test('harga header mengikuti tier yang dipilih, bukan tier termurah', () => {
  // Inti bug: user memilih RAHMAH, header tetap menulis harga UHUD.
  const headerPrice = (harga, selectedTier) => {
    const activeTier = selectedTier && harga[selectedTier] ? selectedTier : cheapestTierOf(harga);
    return minPriceInTier(harga[activeTier]);
  };
  assert.equal(headerPrice(MIX, 'RAHMAH'), 53900000);
  assert.equal(headerPrice(MIX, 'UHUD'), 38900000);
});

test('tanpa pilihan tier, harga header tetap sama seperti sebelumnya (minimum lintas tier)', () => {
  // Jaring pengaman: perbaikan ini TIDAK boleh mengubah tampilan kartu yang
  // belum disentuh user. Tier termurah menurut definisinya memuat minimum
  // global, jadi keduanya wajib identik.
  const globalMin = Math.min(...Object.values(MIX).flatMap(t => Object.values(t).map(Number)));
  assert.equal(minPriceInTier(MIX[cheapestTierOf(MIX)]), globalMin);
});

test('PackageCard memakai tier aktif untuk harga header, bukan minimum lintas tier', () => {
  const source = readFileSync(new URL('../src/components/PackageCard.tsx', import.meta.url), 'utf8');
  const decl = source.slice(source.indexOf('const headerPriceLabel'), source.indexOf("'Hubungi kami'"));
  assert.ok(decl.length > 0, 'headerPriceLabel harus masih ada');
  assert.doesNotMatch(decl, /absoluteMinPrice/);
  assert.match(source, /const headerPrice = minPriceInTier\(pkg\.harga\[activeTier\]\)/);
});
