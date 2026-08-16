import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  HOTEL_CITIES,
  HOTEL_CITY_LANDMARKS,
  HOTEL_MAX_MEDIA_ITEMS,
  isHotelDirectoryEnabledForAgent,
  requireHotelDirectoryAccess,
  slugifyHotelName,
  normalizeHotelMediaInput,
  buildHotelPayload,
  hotelListItem,
} from '../lib/hotel-directory.js';

const PREFIXES = ['https://cdn.example.b-cdn.net/hotels/'];
const IMG_URL = 'https://cdn.example.b-cdn.net/hotels/nikita-abc-123.jpg';
const IMG_URL_2 = 'https://cdn.example.b-cdn.net/hotels/bagas-def-456.webp';
const VID_URL = 'https://cdn.example.b-cdn.net/hotels/nikita-ghi-789.mp4';

function stubRes() {
  return {
    code: undefined,
    body: undefined,
    status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

test('konstanta kota: 4 kategori tetap dan landmark hanya untuk mekkah/madinah', () => {
  assert.deepEqual(HOTEL_CITIES, ['mekkah', 'madinah', 'turki', 'dubai']);
  assert.equal(HOTEL_CITY_LANDMARKS.mekkah, 'Masjidil Haram');
  assert.equal(HOTEL_CITY_LANDMARKS.madinah, 'Masjid Nabawi');
  assert.equal(HOTEL_CITY_LANDMARKS.turki, undefined);
  assert.equal(HOTEL_CITY_LANDMARKS.dubai, undefined);
});

test('gate: hanya nikita dan bagas yang boleh masuk', () => {
  assert.equal(isHotelDirectoryEnabledForAgent('nikita'), true);
  assert.equal(isHotelDirectoryEnabledForAgent({ slug: 'bagas' }), true);
  assert.equal(isHotelDirectoryEnabledForAgent(' Nikita '), true);
  assert.equal(isHotelDirectoryEnabledForAgent('budi'), false);
  assert.equal(isHotelDirectoryEnabledForAgent(''), false);
  assert.equal(isHotelDirectoryEnabledForAgent(null), false);
  assert.equal(isHotelDirectoryEnabledForAgent({ slug: undefined }), false);
});

test('requireHotelDirectoryAccess menolak agent lain dengan 403', () => {
  const res = stubRes();
  assert.equal(requireHotelDirectoryAccess({ slug: 'budi' }, res), false);
  assert.equal(res.code, 403);
  assert.equal(typeof res.body.error, 'string');

  const resOk = stubRes();
  assert.equal(requireHotelDirectoryAccess({ slug: 'nikita' }, resOk), true);
  assert.equal(resOk.code, undefined);
});

test('slugifyHotelName: normalisasi dan dedup suffix angka', () => {
  assert.equal(slugifyHotelName('Makkah Towers'), 'makkah-towers');
  assert.equal(slugifyHotelName('Al Eiman  Royal!!'), 'al-eiman-royal');
  assert.equal(slugifyHotelName('Makkah Towers', ['makkah-towers']), 'makkah-towers-2');
  assert.equal(
    slugifyHotelName('Makkah Towers', ['makkah-towers', 'makkah-towers-2']),
    'makkah-towers-3'
  );
  assert.equal(slugifyHotelName('***'), 'hotel');
});

test('normalizeHotelMediaInput: item valid lolos dan field ekstra dibuang', () => {
  const result = normalizeHotelMediaInput(
    [
      { type: 'image', url: IMG_URL, extra: 'x', caption: 'buang' },
      { type: 'video', url: VID_URL },
    ],
    PREFIXES
  );
  assert.deepEqual(result, [
    { type: 'image', url: IMG_URL },
    { type: 'video', url: VID_URL },
  ]);
});

test('normalizeHotelMediaInput: array kosong sah (hotel belum punya media)', () => {
  assert.deepEqual(normalizeHotelMediaInput([], PREFIXES), []);
});

test('normalizeHotelMediaInput: menolak bentuk dan URL yang menyimpang', () => {
  const reject = (value) => assert.equal(normalizeHotelMediaInput(value, PREFIXES), null);

  reject('bukan-array');
  reject([null]);
  reject([{ type: 'gif', url: IMG_URL }]);
  reject([{ type: 'image', url: 123 }]);
  reject([{ type: 'image', url: 'https://evil.com/hotels/x.jpg' }]);
  reject([{ type: 'image', url: 'https://cdn.example.b-cdn.net/community/nikita-a.jpg' }]);
  reject([{ type: 'image', url: `${IMG_URL}?width=100` }]);
  reject([{ type: 'image', url: `${IMG_URL}#frag` }]);
  reject([{ type: 'image', url: VID_URL }]);
  reject([{ type: 'video', url: IMG_URL }]);
  reject([
    { type: 'image', url: IMG_URL },
    { type: 'image', url: IMG_URL },
  ]);

  const tooMany = Array.from({ length: HOTEL_MAX_MEDIA_ITEMS + 1 }, (_, i) => ({
    type: 'image',
    url: `https://cdn.example.b-cdn.net/hotels/nikita-item-${i}.jpg`,
  }));
  reject(tooMany);
});

function validInput(overrides = {}) {
  return {
    name: 'Makkah Towers',
    city: 'mekkah',
    stars: 5,
    distance_label: '±250 m',
    walk_label: '±4 menit jalan kaki',
    area: 'Ajyad',
    address: 'Jalan Ajyad, Al Hajlah, Makkah',
    gmaps_url: 'https://maps.app.goo.gl/xK92hT',
    description: 'Hotel bintang 5 di kawasan Ajyad.',
    facilities: ['Wi-Fi', 'Lift'],
    agent_note: 'Minta lantai 8 ke atas.',
    media: [{ type: 'image', url: IMG_URL }],
    ...overrides,
  };
}

const OPTS = { mediaPrefixes: PREFIXES };

test('buildHotelPayload: input valid menghasilkan data whitelist', () => {
  const result = buildHotelPayload(validInput({ role: 'admin', id: 'x' }), OPTS);
  assert.equal(result.ok, true);
  assert.equal(result.data.name, 'Makkah Towers');
  assert.equal(result.data.city, 'mekkah');
  assert.equal(result.data.stars, 5);
  assert.equal(result.data.distance_label, '±250 m');
  assert.deepEqual(result.data.facilities, ['Wi-Fi', 'Lift']);
  assert.deepEqual(result.data.media, [{ type: 'image', url: IMG_URL }]);
  assert.equal('role' in result.data, false);
  assert.equal('id' in result.data, false);
});

test('buildHotelPayload: nama wajib', () => {
  for (const name of ['', '   ', undefined]) {
    const result = buildHotelPayload(validInput({ name }), OPTS);
    assert.equal(result.ok, false);
    assert.match(result.error, /nama/i);
  }
});

test('buildHotelPayload: kategori di luar 4 kota ditolak', () => {
  const result = buildHotelPayload(validInput({ city: 'cairo' }), OPTS);
  assert.equal(result.ok, false);
  assert.match(result.error, /kategori/i);
});

test('buildHotelPayload: bintang harus integer 1-5 atau null', () => {
  for (const stars of [0, 6, 2.5, '4']) {
    const result = buildHotelPayload(validInput({ stars }), OPTS);
    assert.equal(result.ok, false, `stars=${JSON.stringify(stars)} harusnya ditolak`);
    assert.match(result.error, /bintang/i);
  }
  const nullStars = buildHotelPayload(validInput({ stars: null }), OPTS);
  assert.equal(nullStars.ok, true);
  assert.equal(nullStars.data.stars, null);
});

test('buildHotelPayload: turki/dubai dipaksa tanpa jarak', () => {
  for (const city of ['turki', 'dubai']) {
    const result = buildHotelPayload(validInput({ city }), OPTS);
    assert.equal(result.ok, true);
    assert.equal(result.data.distance_label, null);
    assert.equal(result.data.walk_label, null);
  }
});

test('buildHotelPayload: gmaps_url harus https ke domain Google Maps', () => {
  const evil = buildHotelPayload(validInput({ gmaps_url: 'https://evil.com/maps' }), OPTS);
  assert.equal(evil.ok, false);
  assert.match(evil.error, /maps/i);

  const insecure = buildHotelPayload(
    validInput({ gmaps_url: 'http://maps.app.goo.gl/x' }),
    OPTS
  );
  assert.equal(insecure.ok, false);

  const empty = buildHotelPayload(validInput({ gmaps_url: '' }), OPTS);
  assert.equal(empty.ok, true);
  assert.equal(empty.data.gmaps_url, null);

  const ok = buildHotelPayload(
    validInput({ gmaps_url: 'https://www.google.com/maps/place/x' }),
    OPTS
  );
  assert.equal(ok.ok, true);
});

test('buildHotelPayload: fasilitas di-trim, dibatasi, dan wajib array', () => {
  const trimmed = buildHotelPayload(
    validInput({ facilities: [' Wi-Fi ', '', 'AC'] }),
    OPTS
  );
  assert.equal(trimmed.ok, true);
  assert.deepEqual(trimmed.data.facilities, ['Wi-Fi', 'AC']);

  const notArray = buildHotelPayload(validInput({ facilities: 'Wi-Fi' }), OPTS);
  assert.equal(notArray.ok, false);

  const tooMany = buildHotelPayload(
    validInput({ facilities: Array.from({ length: 21 }, (_, i) => `F${i}`) }),
    OPTS
  );
  assert.equal(tooMany.ok, false);

  const tooLong = buildHotelPayload(
    validInput({ facilities: ['x'.repeat(31)] }),
    OPTS
  );
  assert.equal(tooLong.ok, false);
});

test('buildHotelPayload: batas panjang teks dijaga', () => {
  const cases = [
    ['name', 'x'.repeat(121)],
    ['area', 'x'.repeat(121)],
    ['address', 'x'.repeat(301)],
    ['description', 'x'.repeat(2001)],
    ['agent_note', 'x'.repeat(1001)],
  ];
  for (const [field, value] of cases) {
    const result = buildHotelPayload(validInput({ [field]: value }), OPTS);
    assert.equal(result.ok, false, `${field} kepanjangan harusnya ditolak`);
  }
});

test('buildHotelPayload: media tak valid ditolak, media kosong default []', () => {
  const bad = buildHotelPayload(
    validInput({ media: [{ type: 'image', url: `${IMG_URL}?x=1` }] }),
    OPTS
  );
  assert.equal(bad.ok, false);
  assert.match(bad.error, /media/i);

  const omitted = buildHotelPayload(validInput({ media: undefined }), OPTS);
  assert.equal(omitted.ok, true);
  assert.deepEqual(omitted.data.media, []);
});

test('hotelListItem: proyeksi ringan dengan cover foto pertama dan hitungan media', () => {
  const row = {
    id: '1',
    slug: 'makkah-towers',
    name: 'Makkah Towers',
    city: 'mekkah',
    stars: 5,
    distance_label: '±250 m',
    walk_label: null,
    area: 'Ajyad',
    description: 'x',
    media: [
      { type: 'video', url: VID_URL },
      { type: 'image', url: IMG_URL },
      { type: 'image', url: IMG_URL_2 },
    ],
  };
  const item = hotelListItem(row);
  assert.equal(item.cover, IMG_URL);
  assert.equal(item.photo_count, 2);
  assert.equal(item.video_count, 1);
  assert.equal(item.slug, 'makkah-towers');
  assert.equal('media' in item, false);

  const emptyItem = hotelListItem({ ...row, media: [] });
  assert.equal(emptyItem.cover, null);
  assert.equal(emptyItem.photo_count, 0);

  const nullMedia = hotelListItem({ ...row, media: null });
  assert.equal(nullMedia.cover, null);
  assert.equal(nullMedia.video_count, 0);
});
