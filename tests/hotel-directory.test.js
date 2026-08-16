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
  hotelMediaCategories,
  buildHotelPayload,
  hotelListItem,
  hotelMediaUrlsRemoved,
  parseHotelDistanceMeters,
  hotelAreaCity,
  HOTEL_RATING_PLATFORMS,
  normalizeHotelRatingsInput,
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

test('hotelMediaUrlsRemoved: hanya URL yang hilang dari daftar baru DAN di bawah prefix media hotel', () => {
  const oldMedia = [
    { type: 'image', url: IMG_URL },
    { type: 'image', url: IMG_URL_2 },
    { type: 'video', url: VID_URL },
  ];

  // Sisa satu foto → dua sisanya jadi yatim.
  assert.deepEqual(
    hotelMediaUrlsRemoved(oldMedia, [{ type: 'image', url: IMG_URL }], PREFIXES),
    [IMG_URL_2, VID_URL]
  );

  // Urutan berubah tapi isi sama = tidak ada yang dihapus (kasus "Jadikan Cover").
  assert.deepEqual(
    hotelMediaUrlsRemoved(oldMedia, [{ type: 'video', url: VID_URL }, { type: 'image', url: IMG_URL_2 }, { type: 'image', url: IMG_URL }], PREFIXES),
    []
  );

  // Hapus hotel: daftar baru kosong → semua media hotel ikut.
  assert.deepEqual(hotelMediaUrlsRemoved(oldMedia, [], PREFIXES), [IMG_URL, IMG_URL_2, VID_URL]);

  // File di LUAR prefix media hotel tidak pernah ikut terhapus.
  const foreign = 'https://cdn.example.b-cdn.net/community/other-abc.jpg';
  assert.deepEqual(hotelMediaUrlsRemoved([{ type: 'image', url: foreign }], [], PREFIXES), []);

  // Tanpa prefix (Bunny mati) = tidak ada kandidat sama sekali — fail-closed.
  assert.deepEqual(hotelMediaUrlsRemoved(oldMedia, [], []), []);

  // Duplikat URL di baris lama hanya dilaporkan sekali; input non-array aman.
  assert.deepEqual(
    hotelMediaUrlsRemoved([{ type: 'image', url: IMG_URL }, { type: 'image', url: IMG_URL }], [], PREFIXES),
    [IMG_URL]
  );
  assert.deepEqual(hotelMediaUrlsRemoved(null, null, PREFIXES), []);
});

test('parseHotelDistanceMeters membaca label jarak apa adanya', () => {
  // Format yang benar-benar ada di data: "±450m" dan "±2.5km".
  assert.equal(parseHotelDistanceMeters('±450m'), 450);
  assert.equal(parseHotelDistanceMeters('±50m'), 50);
  assert.equal(parseHotelDistanceMeters('±2.5km'), 2500);
  // Desimal koma (gaya Indonesia) dan spasi sebelum satuan tetap terbaca.
  assert.equal(parseHotelDistanceMeters('±1,5 km'), 1500);
  assert.equal(parseHotelDistanceMeters('300 M'), 300);
  // km HARUS menang atas m — kalau tidak, 2.5km terbaca 2.5 meter dan jadi
  // hotel "terdekat" mengalahkan yang 50m.
  assert.ok(parseHotelDistanceMeters('±2.5km') > parseHotelDistanceMeters('±500m'));
  // Tak terbaca / kosong → null supaya bisa didorong ke akhir daftar.
  assert.equal(parseHotelDistanceMeters(''), null);
  assert.equal(parseHotelDistanceMeters(null), null);
  assert.equal(parseHotelDistanceMeters('dekat sekali'), null);
  // "menit" bukan jarak: tidak boleh diklaim sebagai meter.
  assert.equal(parseHotelDistanceMeters('5 menit'), null);
});

test('hotelAreaCity hanya mengambil kota yang tertulis eksplisit', () => {
  assert.equal(hotelAreaCity('Görükle (Nilüfer), Bursa'), 'Bursa');
  assert.equal(hotelAreaCity('Ortahisar (Ürgüp), Kapadokya'), 'Kapadokya');
  assert.equal(hotelAreaCity('Melikgazi, Kayseri'), 'Kayseri');
  // Tanpa koma = distrik saja; menebak kota dari distrik akan salah label.
  assert.equal(hotelAreaCity('Al Barsha 1 (Sheikh Zayed Road)'), null);
  assert.equal(hotelAreaCity('Ajyad'), null);
  assert.equal(hotelAreaCity(''), null);
  assert.equal(hotelAreaCity(null), null);
  // Koma menggantung tidak menghasilkan kota kosong.
  assert.equal(hotelAreaCity('Ulus (Altındağ),'), null);
});

// ── Kategori media ───────────────────────────────────────────────────────────

test('media: kategori dipangkas, kosong membuang kuncinya, panjang/non-string ditolak', () => {
  const withCategory = normalizeHotelMediaInput(
    [{ type: 'image', url: IMG_URL, category: '  Lobby  ' }],
    PREFIXES
  );
  assert.deepEqual(withCategory, [{ type: 'image', url: IMG_URL, category: 'Lobby' }]);

  // String kosong TIDAK boleh tersimpan sebagai '' — itu melahirkan chip hantu.
  const blank = normalizeHotelMediaInput([{ type: 'image', url: IMG_URL, category: '   ' }], PREFIXES);
  assert.deepEqual(blank, [{ type: 'image', url: IMG_URL }]);
  assert.equal('category' in blank[0], false);

  // Tanpa kategori sama sekali tetap sah (media lama sebelum fitur ini).
  assert.deepEqual(
    normalizeHotelMediaInput([{ type: 'image', url: IMG_URL }], PREFIXES),
    [{ type: 'image', url: IMG_URL }]
  );

  assert.equal(
    normalizeHotelMediaInput([{ type: 'image', url: IMG_URL, category: 'x'.repeat(31) }], PREFIXES),
    null
  );
  assert.equal(
    normalizeHotelMediaInput([{ type: 'image', url: IMG_URL, category: 5 }], PREFIXES),
    null
  );
});

test('hotelMediaCategories: preset dulu sesuai urutannya, sisanya urut kemunculan', () => {
  const media = [
    { type: 'image', url: IMG_URL, category: 'Kolam Renang' },
    { type: 'image', url: IMG_URL_2, category: 'Restoran' },
    { type: 'video', url: VID_URL, category: 'Lobby' },
  ];
  assert.deepEqual(
    hotelMediaCategories(media),
    ['Lobby', 'Restoran', 'Kolam Renang'],
    'preset ikut urutan HOTEL_MEDIA_CATEGORY_PRESETS, bukan urutan media'
  );
});

test('hotelMediaCategories: dedup case-insensitive, ejaan preset menang', () => {
  const media = [
    { type: 'image', url: IMG_URL, category: 'lobby' },
    { type: 'image', url: IMG_URL_2, category: 'LOBBY' },
    { type: 'image', url: IMG_URL, category: 'kolam renang' },
    { type: 'image', url: IMG_URL_2, category: 'Kolam Renang' },
  ];
  assert.deepEqual(hotelMediaCategories(media), ['Lobby', 'kolam renang']);
});

test('hotelMediaCategories: media tanpa kategori tidak melahirkan entri kosong', () => {
  assert.deepEqual(hotelMediaCategories([{ type: 'image', url: IMG_URL }]), []);
  assert.deepEqual(hotelMediaCategories([{ type: 'image', url: IMG_URL, category: '  ' }]), []);
  assert.deepEqual(hotelMediaCategories(null), []);
  assert.deepEqual(hotelMediaCategories(undefined), []);
});

test('HOTEL_RATING_PLATFORMS: skala tiap platform sesuai aslinya', () => {
  const byId = Object.fromEntries(HOTEL_RATING_PLATFORMS.map((p) => [p.id, p]));
  // Booking & Agoda memakai skala 10; salah menyamakan ke 5 membuat 8,6
  // terbaca seolah lebih buruk dari 4,3 padahal keduanya bagus.
  assert.equal(byId.booking.max, 10);
  assert.equal(byId.agoda.max, 10);
  assert.equal(byId.google.max, 5);
  assert.equal(byId.tripadvisor.max, 5);
  assert.equal(byId.tripcom.max, 5);
  for (const p of HOTEL_RATING_PLATFORMS) {
    assert.equal(typeof p.label, 'string');
    assert.ok(p.label.length > 0);
  }
});

test('normalizeHotelRatingsInput: entri sah lolos, skor dibulatkan wajar', () => {
  const out = normalizeHotelRatingsInput([
    { platform: 'google', score: 4.3, reviews: 1280, url: 'https://maps.app.goo.gl/x' },
    { platform: 'booking', score: 8.6, reviews: 940 },
  ]);
  assert.deepEqual(out, [
    { platform: 'google', score: 4.3, reviews: 1280, url: 'https://maps.app.goo.gl/x' },
    { platform: 'booking', score: 8.6, reviews: 940, url: null },
  ]);
});

test('normalizeHotelRatingsInput: skor di luar skala platform ditolak', () => {
  // 8,6 sah untuk Booking (skala 10) tapi mustahil untuk Google (skala 5).
  assert.equal(normalizeHotelRatingsInput([{ platform: 'google', score: 8.6 }]), null);
  assert.equal(normalizeHotelRatingsInput([{ platform: 'booking', score: 11 }]), null);
  assert.equal(normalizeHotelRatingsInput([{ platform: 'google', score: -1 }]), null);
  assert.ok(normalizeHotelRatingsInput([{ platform: 'booking', score: 8.6 }]));
});

test('normalizeHotelRatingsInput: bentuk menyimpang ditolak, kosong sah', () => {
  assert.deepEqual(normalizeHotelRatingsInput([]), []);
  assert.deepEqual(normalizeHotelRatingsInput(null), []);
  assert.equal(normalizeHotelRatingsInput('bukan-array'), null);
  assert.equal(normalizeHotelRatingsInput([{ platform: 'yelp', score: 4 }]), null);
  assert.equal(normalizeHotelRatingsInput([{ platform: 'google', score: 'empat' }]), null);
  assert.equal(normalizeHotelRatingsInput([{ platform: 'google' }]), null);
  // Platform kembar = ambigu, tolak daripada diam-diam memilih salah satu.
  assert.equal(
    normalizeHotelRatingsInput([{ platform: 'google', score: 4 }, { platform: 'google', score: 5 }]),
    null
  );
  // URL wajib https ke domain platform yang masuk akal, bukan sembarang tautan.
  assert.equal(
    normalizeHotelRatingsInput([{ platform: 'google', score: 4, url: 'http://maps.app.goo.gl/x' }]),
    null
  );
  assert.equal(
    normalizeHotelRatingsInput([{ platform: 'booking', score: 8, url: 'https://evil.com/x' }]),
    null
  );
});

test('normalizeHotelRatingsInput: jumlah ulasan harus bilangan bulat tak negatif', () => {
  assert.equal(normalizeHotelRatingsInput([{ platform: 'google', score: 4, reviews: -3 }]), null);
  assert.equal(normalizeHotelRatingsInput([{ platform: 'google', score: 4, reviews: 1.5 }]), null);
  const tanpaReviews = normalizeHotelRatingsInput([{ platform: 'google', score: 4 }]);
  assert.equal(tanpaReviews[0].reviews, null);
});

test('buildHotelPayload: ratings ikut whitelist dan tervalidasi', () => {
  const ok = buildHotelPayload(
    validInput({ ratings: [{ platform: 'agoda', score: 9.1, reviews: 12 }] }),
    OPTS
  );
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.data.ratings, [{ platform: 'agoda', score: 9.1, reviews: 12, url: null }]);

  const bad = buildHotelPayload(validInput({ ratings: [{ platform: 'agoda', score: 99 }] }), OPTS);
  assert.equal(bad.ok, false);
  assert.match(bad.error, /rating/i);

  // Tanpa field ratings sama sekali = daftar kosong, bukan galat.
  const absent = buildHotelPayload(validInput(), OPTS);
  assert.equal(absent.ok, true);
  assert.deepEqual(absent.data.ratings, []);
});
