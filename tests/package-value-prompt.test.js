import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MIN_PACKAGE_VALUE_ADVANTAGES,
  MAX_PACKAGE_VALUE_ADVANTAGES,
  PACKAGE_VALUE_STYLES,
  buildPackageValueBannerPrompt,
  buildPackageValueChatBody,
  buildPackageValueContext,
  buildPackageValuePrompts,
  directFlightFactFromRoute,
  displayPackageName,
  formatCompactMillionPrice,
  parsePackageValueResult,
  pickPackageValueStyle,
} from '../lib/package-value-prompt.js';

const schedule = {
  jadwal_id: 'JBU1700',
  jadwal_nama: 'UMROH PLUS CAIRO 12 HARI',
  maskapai: 'SAUDIA',
  berangkat_tgl: '2026-10-01',
  berangkat_rute: 'CGK-JED/JED-CAI',
  berangkat_kode_penerbangan: 'SV 819',
  pulang_tgl: '2026-10-12',
  pulang_rute: 'JED-CGK',
  paket_harga: {
    UHUD: { Quard: '35000000' },
    RAHMAH: { Quard: '41000000' },
  },
  paket_hotel: {
    UHUD: { mekkah: 'HOTEL UHUD (★4)', madinah: 'HOTEL MADINAH (★4)' },
    RAHMAH: { mekkah: 'HOTEL RAHMAH (★5)', madinah: 'HOTEL PREMIUM (★5)' },
  },
};

test('buildPackageValueContext sends only the selected tier and cached itinerary', () => {
  const context = buildPackageValueContext(schedule, {
    days: [{
      dayNumber: 'Hari 2',
      title: 'City Tour Cairo',
      location: 'Cairo',
      activities: [{ time: 'Pagi', text: 'Mengunjungi Piramida Giza' }],
    }],
  }, 'rahmah');

  assert.equal(context.package.tier, 'RAHMAH');
  assert.equal(context.package.pricing.Quard, '41000000');
  assert.equal(context.package.hotel.mekkah, 'HOTEL RAHMAH (★5)');
  assert.doesNotMatch(JSON.stringify(context), /HOTEL UHUD/);
  assert.equal(context.sourceAvailability.itinerary, true);
  assert.equal(context.itinerary.days[0].activities[0].text, 'Mengunjungi Piramida Giza');
  assert.ok(context.evidence.some((item) => item.id === 'I01A01' && item.source === 'itinerary'));
  assert.ok(context.evidence.some((item) => item.fact.includes('City Tour Cairo') && item.fact.includes('Piramida Giza')));
  assert.ok(context.evidence.some((item) => item.fact.includes('HOTEL RAHMAH')));
});

test('routine umrah activities are excluded from the evidence catalog', () => {
  const context = buildPackageValueContext(schedule, {
    days: [{
      dayNumber: 'Hari 2',
      title: 'Raudhah dan Ziarah Madinah',
      location: 'Madinah',
      activities: [
        { time: 'Pagi', text: 'Masuk Raudhah' },
        { time: 'Menjelang Zuhur', text: 'Tawaf Sunnah dan mengenal tempat-tempat ijabah' },
        { time: 'Siang', text: 'Naik kereta cepat Haramain menuju Makkah' },
      ],
    }],
  }, 'UHUD');

  const itineraryFacts = context.evidence.filter((item) => item.source === 'itinerary');
  assert.doesNotMatch(JSON.stringify(itineraryFacts), /Raudhah|Ziarah Madinah|Tawaf Sunnah|tempat-tempat ijabah/i);
  assert.match(JSON.stringify(itineraryFacts), /kereta cepat Haramain/i);
});

test('package-like day titles are not copied into unrelated itinerary evidence', () => {
  const context = buildPackageValueContext(schedule, {
    days: [{
      dayNumber: 'Hari 1',
      title: 'Umrah Plus Turkey 15 Hari',
      location: 'Jakarta – Jeddah – Istanbul',
      activities: [
        { time: '06:35', text: 'Mengunjungi Museum Jeddah' },
        { time: '09:40', text: 'Melanjutkan perjalanan menuju Istanbul dengan pesawat Saudia' },
      ],
    }],
  }, 'UHUD');

  const arrival = context.evidence.find((item) => item.id === 'I01A01');
  const flight = context.evidence.find((item) => item.id === 'I01A02');
  assert.ok(arrival);
  assert.doesNotMatch(arrival.fact, /Turkey|Istanbul/);
  // Logistik transportasi rutin ("Melanjutkan perjalanan ... dengan pesawat")
  // tidak lagi menjadi evidence — leg penerbangan bukan nilai plus.
  assert.equal(flight, undefined);
});

test('prompt fails closed to brochure facts when itinerary cache is unavailable', () => {
  const context = buildPackageValueContext(schedule, null, 'UHUD');
  const prompts = buildPackageValuePrompts(context);

  assert.equal(context.itinerary, null);
  assert.equal(context.sourceAvailability.itinerary, false);
  assert.match(prompts.systemPrompt, /Itinerary belum tersedia/);
  assert.match(prompts.systemPrompt, /jangan menyebut atau mengasumsikan isi itinerary/i);
  assert.match(prompts.systemPrompt, /Jangan menganggap kota pada rute penerbangan sebagai destinasi wisata/);
  assert.match(prompts.systemPrompt, /evidenceId/);
  assert.match(prompts.systemPrompt, /Jangan jadikan aktivitas umum sebagai nilai plus/);
  assert.match(prompts.systemPrompt, /prompt desain siap-tempel ke ChatGPT/);
  assert.match(prompts.systemPrompt, /Headline bukan label brosur/);
  assert.match(prompts.systemPrompt, /maksimal 4 kata dan harus menyebut pembeda konkret/);
  assert.match(prompts.systemPrompt, /NILAI PLUS 1 wajib memakai evidence dari itinerary/);
  assert.match(prompts.systemPrompt, /Headline wajib bertumpu langsung pada advantages\[0\]/);
  assert.match(prompts.systemPrompt, /ziarah\/city tour standar Makkah–Madinah/);
  assert.match(prompts.systemPrompt, /utamakan tepat 4; gunakan 3 hanya bila/);
  assert.match(prompts.systemPrompt, /Raudhah/);
  assert.match(prompts.systemPrompt, /tepat satu kalimat faktual maksimal 12 kata/);
  assert.match(prompts.systemPrompt, /IKATAN EVIDENCE MUTLAK/);
  assert.match(prompts.systemPrompt, /evidence berbunyi "pesawat menuju Istanbul" tetapi title ditulis "Kereta Cepat ke Istanbul"/);
  assert.match(prompts.systemPrompt, /Nama paket hanya label metadata untuk banner, BUKAN evidence nilai plus/);
});

test('system prompt asks for experiential copywriting fields, not raw brochure copy', () => {
  const prompts = buildPackageValuePrompts(buildPackageValueContext(schedule, null, 'UHUD'));

  assert.match(prompts.systemPrompt, /ATURAN COPYWRITING/);
  assert.match(prompts.systemPrompt, /jawaban “kenapa ini menarik\?” maksimal 12 kata/);
  assert.match(prompts.systemPrompt, /mengapa pilih paket ini\?/);
  assert.match(prompts.systemPrompt, /kata kerja konkret/);
  assert.match(prompts.systemPrompt, /visualIdea/);
  assert.match(prompts.systemPrompt, /Nama spesifik adalah bukti paling meyakinkan/);
  assert.match(prompts.systemPrompt, /"benefit":/);
  assert.match(prompts.systemPrompt, /"visualIdea":/);
  const groundedContext = JSON.parse(prompts.userPrompt.slice(prompts.userPrompt.indexOf('{')));
  assert.equal(Object.hasOwn(groundedContext, 'itinerary'), false);
  assert.match(prompts.userPrompt, /katalog evidence yang telah disaring/);
});

test('repair chat body enforces 3–4 complete non-routine advantages', () => {
  const prompts = buildPackageValuePrompts(buildPackageValueContext(schedule, null, 'UHUD'));
  const body = buildPackageValueChatBody(prompts, { repair: true });

  assert.equal(body.temperature, 0.2);
  assert.match(body.messages[1].content, /PERBAIKAN VALIDASI WAJIB/);
  assert.match(body.messages[1].content, /TEPAT 4 advantages/);
  assert.match(body.messages[1].content, /title, benefit, description, dan evidenceId berbeda/);
  assert.match(body.messages[1].content, /DILARANG mengubah evidence pesawat menjadi kereta/);
  assert.match(body.messages[1].content, /Jangan pilih Raudhah/);
});

test('style presets match Buat Ulang Brosur and support explicit selection', () => {
  const expectedSharedStyles = new Map([
    ['modern', 'Modern premium'],
    ['elegan', 'Elegan emas'],
    ['mewah', 'Mewah & dramatis'],
    ['minimalis', 'Minimalis'],
    ['cerah', 'Cerah & ceria'],
    ['klasik', 'Klasik islami'],
    ['cinematic', 'Cinematic malam'],
    ['editorial', 'Editorial magazine'],
    ['earthy', 'Natural earthy'],
    ['monochrome', 'Monokrom bold'],
    ['futuristic', 'Futuristik glass'],
    ['pastel', 'Pastel lembut'],
  ]);
  assert.equal(PACKAGE_VALUE_STYLES.length, expectedSharedStyles.size);
  const ids = new Set(PACKAGE_VALUE_STYLES.map((style) => style.id));
  assert.equal(ids.size, PACKAGE_VALUE_STYLES.length, 'id gaya unik');
  for (const style of PACKAGE_VALUE_STYLES) {
    assert.equal(style.name, expectedSharedStyles.get(style.id), `${style.id} sama dengan pilihan Buat Ulang Brosur`);
    for (const field of ['id', 'name', 'palette', 'typography', 'composition', 'heroTreatment', 'mood', 'finishing']) {
      assert.ok(typeof style[field] === 'string' && style[field].length > 0, `${style.id}.${field}`);
    }
  }

  assert.equal(pickPackageValueStyle({ preferredId: 'modern' }).id, 'modern');
  assert.equal(pickPackageValueStyle({ preferredId: 'pastel' }).id, 'pastel');

  const excluded = PACKAGE_VALUE_STYLES[0].id;
  for (let i = 0; i < 50; i += 1) {
    assert.notEqual(pickPackageValueStyle({ excludeId: excluded }).id, excluded);
  }
  // Deterministic pick via injected random
  assert.equal(pickPackageValueStyle({ random: () => 0 }).id, PACKAGE_VALUE_STYLES[0].id);
});

test('parsePackageValueResult keeps grounded fields, caps advantages, and stamps the style', () => {
  const evidenceCatalog = [
    { id: 'B1', source: 'brosur', fact: 'Hotel Makkah: ANJUM' },
    { id: 'B2', source: 'brosur', fact: 'Hotel Madinah: AL RITZ' },
    { id: 'B3', source: 'brosur', fact: 'Maskapai penerbangan: SAUDIA' },
    { id: 'B4', source: 'brosur', fact: 'Harga paket: 41 JUTA' },
    { id: 'B5', source: 'brosur', fact: 'Rute berangkat: CGK-JED' },
    { id: 'B6', source: 'brosur', fact: 'Tanggal berangkat: 1 Oktober 2026' },
  ];
  const advantages = [
    // Copy ditulis sebagai kalimat, bukan salinan baris katalog ("Hotel Makkah:
    // Anjum") — bentuk mentah itu ditolak karena ikut tampil pada artwork.
    { title: 'Hotel Anjum', benefit: 'Hari Makkah dari Anjum', description: 'Menginap di Anjum selama berada di Makkah.', evidenceId: 'B1' },
    { title: 'Hotel Al Ritz', benefit: 'Hari Madinah dari Al Ritz', description: 'Menginap di Al Ritz selama berada di Madinah.', evidenceId: 'B2' },
    { title: 'Penerbangan Saudia', benefit: 'Terbang bersama Saudia', description: 'Penerbangan berangkat menggunakan Saudia.', evidenceId: 'B3' },
    { title: 'Harga 41 Juta', benefit: 'Harga tercantum 41 juta', description: 'Harga paket yang tercantum adalah 41 juta.', evidenceId: 'B4' },
    { title: 'Rute CGK JED', benefit: 'Memulai perjalanan melalui rute CGK-JED', description: 'Rute keberangkatan yang tercantum adalah CGK-JED.', evidenceId: 'B5' },
    { title: 'Berangkat 1 Oktober', benefit: 'Jadwal berangkat pada 1 Oktober 2026', description: 'Tanggal keberangkatan tercantum 1 Oktober 2026.', evidenceId: 'B6' },
  ];
  const packageData = buildPackageValueContext(schedule, null, 'RAHMAH').package;
  const result = parsePackageValueResult(JSON.stringify({
    headline: '<b>Paket Kaya Pengalaman</b>',
    summary: 'Ringkas dan konkret.',
    visualIdea: 'Menara masjid menjulang saat senja keemasan.',
    advantages,
    bestFor: ['Pencari destinasi tambahan', 'Pilihan hotel premium', 'Jadwal terstruktur', 'Ekstra'],
  }), { evidenceCatalog, packageData });

  assert.equal(result.headline, 'Paket Kaya Pengalaman');
  assert.equal(result.advantages.length, MAX_PACKAGE_VALUE_ADVANTAGES);
  assert.equal(MIN_PACKAGE_VALUE_ADVANTAGES, 3);
  assert.equal(result.advantages[0].source, 'brosur');
  assert.equal(result.advantages[0].sourceRef, 'Hotel Makkah: ANJUM');
  assert.match(result.advantages[0].benefit, /Makkah dari Anjum/);
  assert.equal(result.bestFor.length, 2);
  assert.equal(result.style.id, 'modern', 'gaya default sama dengan Buat Ulang Brosur');
  assert.match(result.bannerPrompt, /Buat SATU ad creative umroh/);
  assert.match(result.bannerPrompt, /Nama paket: “Umroh Plus Cairo 12 Hari”/, 'nama paket di-title-case, bukan raw all-caps DB');
  assert.match(result.bannerPrompt, /Tanggal keberangkatan: “1 Oktober 2026”/);
  assert.match(result.bannerPrompt, /price lockup “41 JUTA”/, 'harga dibuat ringkas dan outstanding');
  assert.match(result.bannerPrompt, /“kamar berempat” sebagai microcopy/, 'jenis kamar tetap menjadi konteks kecil');
  assert.match(result.bannerPrompt, /Hook utama: “Paket Kaya Pengalaman”/);
  assert.match(result.bannerPrompt, /Adegan hero: Menara masjid menjulang saat senja keemasan\./);
  assert.match(result.bannerPrompt, /arah desain yang menang/, 'jembatan adegan hero → arah desain');
  assert.match(result.bannerPrompt, /KENAPA MENARIK — wajib tampil/);
  assert.match(result.bannerPrompt, /jangan mengarang detail baru, klaim superlatif/);
});

test('each style produces a distinct art direction block in the banner prompt', () => {
  const packageData = buildPackageValueContext(schedule, null, 'UHUD').package;
  const analysis = {
    headline: 'Umroh dengan Pengalaman Cairo',
    summary: 'Perjalanan ibadah dengan agenda tambahan yang terbukti di itinerary.',
    visualIdea: 'Jamaah menatap Piramida Giza saat pagi berkabut.',
    advantages: [
      { title: 'Jelajah Piramida Giza', benefit: 'Menatap keajaiban Giza di sela perjalanan suci', description: 'Agenda Cairo memberi warna berbeda pada perjalanan.' },
      { title: 'Hotel Makkah', benefit: 'Menginap di hotel pilihan selama di Makkah', description: 'Hotel Makkah mengikuti paket terpilih.' },
      { title: 'Hotel Madinah', benefit: 'Menginap di hotel pilihan selama di Madinah', description: 'Hotel Madinah mengikuti paket terpilih.' },
      { title: 'Saudia', benefit: 'Terbang menuju perjalanan bersama Saudia', description: 'Penerbangan berangkat menggunakan Saudia.' },
    ],
    bestFor: ['Jamaah pencari destinasi tambahan'],
  };

  const prompts = PACKAGE_VALUE_STYLES.map((style) => buildPackageValueBannerPrompt(analysis, packageData, style));
  assert.equal(new Set(prompts).size, PACKAGE_VALUE_STYLES.length, 'tiap gaya menghasilkan prompt berbeda');
  for (const [index, prompt] of prompts.entries()) {
    const style = PACKAGE_VALUE_STYLES[index];
    assert.match(prompt, new RegExp(`ARAH DESAIN — ${style.name.toLocaleUpperCase('id-ID')}`));
    assert.ok(prompt.includes(style.palette), `${style.id} palette hadir`);
    assert.ok(prompt.length <= 5000, `${style.id} aman untuk native share (${prompt.length})`);
  }
  // Gaya tidak dikenal jatuh ke preset pertama, bukan crash.
  const fallback = buildPackageValueBannerPrompt(analysis, packageData, { id: 'tidak-ada' });
  assert.match(fallback, /ARAH DESAIN — MODERN PREMIUM/);
});

test('buildPackageValueBannerPrompt creates a focused ready-to-paste ChatGPT image prompt', () => {
  const packageData = buildPackageValueContext(schedule, null, 'UHUD').package;
  const prompt = buildPackageValueBannerPrompt({
    headline: 'Umroh dengan Pengalaman Cairo',
    summary: 'Perjalanan ibadah dengan agenda tambahan yang terbukti di itinerary.',
    advantages: [
      { title: 'Jelajah Piramida Giza', benefit: 'Piramida membuat perjalanan ibadah terasa berbeda', description: 'Agenda Cairo memberi warna berbeda pada perjalanan.' },
      { title: 'Hotel Makkah', benefit: 'Menginap di hotel pilihan selama di Makkah', description: 'Hotel Makkah mengikuti paket terpilih.' },
      { title: 'Hotel Madinah', benefit: 'Menginap di hotel pilihan selama di Madinah', description: 'Hotel Madinah mengikuti paket terpilih.' },
      { title: 'Saudia', benefit: 'Terbang menuju perjalanan bersama Saudia', description: 'Penerbangan berangkat menggunakan Saudia.' },
    ],
    bestFor: ['Jamaah pencari destinasi tambahan'],
  }, packageData);

  assert.match(prompt, /Output final WAJIB berupa kanvas potret rasio 4:5/);
  assert.match(prompt, /rasio 4:5—bukan 9:16, 1:1, landscape, atau rasio lain/);
  assert.doesNotMatch(prompt, /area tengah rasio 4:5|tepi dapat terpotong saat crop feed/);
  assert.match(prompt, /bukan brosur/);
  assert.match(prompt, /ARAH DESAIN — /);
  assert.match(prompt, /BIG IDEA/);
  assert.match(prompt, /BIG IDEA — KENAPA HARUS PILIH PAKET INI\?/);
  assert.match(prompt, /ALASAN MEMILIH PAKET INI — INTI IKLAN/);
  assert.match(prompt, /NILAI PLUS 1 — PESAN UTAMA/);
  assert.match(prompt, /Judul yang wajib tampil: “Jelajah Piramida Giza”/);
  assert.match(prompt, /KENAPA MENARIK — wajib tampil: “Piramida membuat perjalanan ibadah terasa berbeda”/);
  assert.match(prompt, /BUKTI KONKRET — wajib tampil: “Agenda Cairo memberi warna berbeda pada perjalanan\.”/);
  assert.match(prompt, /KENAPA MENARIK — wajib tampil: “Menginap di hotel pilihan selama di Makkah”/);
  assert.match(prompt, /Judul bagian yang WAJIB tampil persis: “Kenapa Paket Ini Menarik\?”/);
  assert.match(prompt, /Tampilkan 3–4 NILAI PLUS beserta baris KENAPA MENARIK/);
  assert.match(prompt, /NILAI PLUS 1 menjadi alasan utama/);
  assert.match(prompt, /BATAS TEKS LAIN YANG BOLEH TERLIHAT/);
  assert.match(prompt, /BONUS PAKET — WAJIB TAMPIL/);
  assert.match(prompt, /Bonus Ayam Al-Baik/);
  assert.match(prompt, /Gratis Zam-Zam 5 Liter/);
  assert.match(prompt, /HARGA — OUTSTANDING NAMUN PROPORSIONAL/);
  assert.match(prompt, /price lockup “35 JUTA”/);
  assert.match(prompt, /lebih kecil daripada hook/);
  assert.match(prompt, /maksimal sekitar 12–15% kanvas/);
  assert.doesNotMatch(prompt, /Rp35\.000\.000|Tanya Paket/);
  assert.match(prompt, /INFORMASI PAKET — WAJIB TAMPIL/);
  assert.match(prompt, /Nama paket: “Umroh Plus Cairo 12 Hari”/);
  assert.match(prompt, /Tanggal keberangkatan: “1 Oktober 2026”/);
  assert.match(prompt, /Setting ibadah yang selalu boleh digambarkan: Masjidil Haram/, 'paket miskin-fakta tetap boleh menggambar masjid');
  assert.match(prompt, /LAMPIRAN IDENTITAS AGENT/);
  assert.match(prompt, /Lampiran putih polos/);
  assert.match(prompt, /URL profil/);
  assert.match(prompt, /logo Alhijaz[\s\S]*POJOK KIRI ATAS/);
  assert.match(prompt, /SISI KANAN ATAS/);
  assert.match(prompt, /Seluruh cluster rata kanan/);
  assert.match(prompt, /center-aligned vertikal/);
  assert.match(prompt, /Foto maksimal setinggi blok tiga baris/);
  assert.match(prompt, /Identitas menyatu tanpa card, badge, atau panel latar/);
  assert.match(prompt, /SATU artwork iklan final siap posting/);
  assert.doesNotMatch(prompt, /Pilihan anchor/, 'tidak ada lagi dua pilihan anchor yang ambigu');
  assert.doesNotMatch(prompt, /Hotel:|Rute berangkat:|Kepulangan:/);
  assert.doesNotMatch(prompt, /undefined|null/);
  assert.ok(prompt.length < 5000, 'prompt harus tetap aman untuk dibagikan bersama lampiran');
});

test('ranking keeps the AI-chosen primary advantage when the headline echoes its grounded benefit copy', () => {
  // Regresi: overlap headline dulu hanya menghitung title/description/sourceRef
  // sehingga poin hotel (hook figuratif di benefit) tergeser oleh poin itinerary.
  const evidenceCatalog = [
    { id: 'BH01', source: 'brosur', fact: 'Hotel Mekkah tier VIP: PULLMAN ZAMZAM' },
    { id: 'I01', source: 'itinerary', fact: 'Hari 4 • City tour Thaif' },
    { id: 'B03', source: 'brosur', fact: 'Maskapai berangkat: SAUDIA' },
  ];
  const result = parsePackageValueResult(JSON.stringify({
    headline: 'Mulai Hari di Pullman',
    summary: 'Hari-hari Makkah berlangsung dari Pullman ZamZam.',
    advantages: [
      { title: 'Hotel Pullman ZamZam', benefit: 'Menjalani hari Makkah dari Pullman ZamZam', description: 'Menginap di Pullman ZamZam Makkah.', evidenceId: 'BH01' },
      { title: 'City Tour Thaif', benefit: 'Mengikuti city tour Thaif pada hari keempat', description: 'Itinerary hari keempat mencakup city tour Thaif.', evidenceId: 'I01' },
      { title: 'Terbang Saudia', benefit: 'Memulai penerbangan bersama Saudia', description: 'Penerbangan berangkat menggunakan Saudia.', evidenceId: 'B03' },
    ],
  }), { itineraryAvailable: true, evidenceCatalog });

  assert.equal(result.advantages[0].title, 'Hotel Pullman ZamZam');
  assert.match(result.bannerPrompt, /NILAI PLUS 1 — PESAN UTAMA[\s\S]*Hotel Pullman ZamZam/);
});

test('banner prompt sheds per-advantage source facts before breaching the share limit', () => {
  const packageData = buildPackageValueContext({
    ...schedule,
    jadwal_nama: 'UMROH PLUS TURKI ISTANBUL BURSA CAPPADOCIA 16 HARI KELUARGA BESAR SUPER LENGKAP EDISI SPESIAL AKHIR TAHUN BERSAMA KELUARGA',
  }, null, 'RAHMAH').package;
  const longText = (words) => Array(words).fill('katakata').join(' ');
  const analysis = {
    headline: longText(15),
    summary: longText(20),
    visualIdea: longText(24),
    advantages: [0, 1, 2, 3].map((i) => ({
      title: `Nilai Plus Panjang ${i}`,
      benefit: longText(16),
      description: longText(18),
      sourceRef: longText(20),
    })),
    bestFor: [longText(18), longText(18)],
  };

  for (const style of PACKAGE_VALUE_STYLES) {
    const prompt = buildPackageValueBannerPrompt(analysis, packageData, style);
    assert.ok(prompt.length <= 5000, `${style.id} tetap <= 5000 (${prompt.length})`);
    assert.match(prompt, /logo Alhijaz hanya di POJOK KIRI ATAS/, `${style.id} mempertahankan posisi logo`);
    assert.match(prompt, /SISI KANAN ATAS/, `${style.id} mempertahankan posisi identitas agent`);
    assert.match(prompt, /Foto maksimal setinggi blok tiga baris/, `${style.id} menjaga foto agent tetap proporsional`);
    assert.match(prompt, /KENAPA MENARIK — wajib tampil/, `${style.id} mempertahankan alasan memilih paket`);
    assert.match(prompt, /Bonus Ayam Al-Baik/, `${style.id} mempertahankan bonus Al-Baik`);
    assert.match(prompt, /Gratis Zam-Zam 5 Liter/, `${style.id} mempertahankan bonus Zam-Zam`);
    assert.match(prompt, /Nama paket: “Umroh Plus Turki Istanbul Bursa Cappadocia 16 Hari Keluarga Besar Super Lengkap Edisi Spesial Akhir Tahun Bersama Keluarga”/, `${style.id} mempertahankan nama paket`);
    assert.match(prompt, /Tanggal keberangkatan: “1 Oktober 2026”/, `${style.id} mempertahankan tanggal keberangkatan`);
    assert.match(prompt, /Output final WAJIB berupa kanvas potret rasio 4:5/, `${style.id} mempertahankan rasio final 4:5`);
  }
});

test('package name formatter adds Umroh and expands compact duration labels', () => {
  assert.equal(displayPackageName('Plus Turkey 15hr'), 'Umroh Plus Turkey 15 Hari');
  assert.equal(displayPackageName('UMROH PLUS CAIRO 12 HARI'), 'Umroh Plus Cairo 12 Hari');
  assert.equal(displayPackageName('Umrah Reguler 9hrs BY SAUDIA'), 'Umroh Reguler 9 Hari');
});

test('compact price formatter uses a clean JUTA lockup', () => {
  assert.equal(formatCompactMillionPrice('43.900.000'), '43.9 JUTA');
  assert.equal(formatCompactMillionPrice(35_000_000), '35 JUTA');
});

test('parsePackageValueResult drops itinerary claims when itinerary is unavailable', () => {
  const evidenceCatalog = [
    { id: 'I01', source: 'itinerary', fact: 'Hari 2' },
    { id: 'B01', source: 'brosur', fact: 'Hotel Makkah: ANJUM' },
    { id: 'B02', source: 'brosur', fact: 'Hotel Madinah: ODST' },
    { id: 'B03', source: 'brosur', fact: 'Maskapai SAUDIA' },
  ];
  const result = parsePackageValueResult(JSON.stringify({
    headline: 'Nilai Plus',
    summary: 'Ringkasan.',
    advantages: [
      { title: 'Klaim itinerary', benefit: 'Tidak boleh lolos', description: 'Tidak boleh lolos.', evidenceId: 'I01' },
      { title: 'Hotel Anjum', benefit: 'Menjalani hari Makkah dari Anjum', description: 'Hotel Makkah yang tercantum adalah Anjum.', evidenceId: 'B01' },
      { title: 'Hotel Odst', benefit: 'Menjalani hari Madinah dari Odst', description: 'Hotel Madinah yang tercantum adalah Odst.', evidenceId: 'B02' },
      { title: 'Maskapai Saudia', benefit: 'Terbang bersama Saudia', description: 'Maskapai yang tercantum adalah Saudia.', evidenceId: 'B03' },
    ],
  }), { itineraryAvailable: false, evidenceCatalog });

  assert.deepEqual(result.advantages.map((item) => item.title), ['Hotel Anjum', 'Hotel Odst', 'Maskapai Saudia']);
});

test('parsePackageValueResult removes routine activities and promotes the headline-aligned differentiator', () => {
  const evidenceCatalog = [
    { id: 'I01', source: 'itinerary', fact: 'Hari 2 • Ziarah Madinah ke Makam Rasulullah dan para sahabat' },
    { id: 'I02', source: 'itinerary', fact: 'Hari 6 • Madinah ke Mekkah menggunakan kereta cepat Haramain' },
    { id: 'B01', source: 'brosur', fact: 'Hotel Mekkah tier UHUD: ANJUM HOTEL' },
    { id: 'B02', source: 'brosur', fact: 'Hotel Madinah tier UHUD: ODST HOTEL' },
    { id: 'B03', source: 'brosur', fact: 'Maskapai penerbangan: SAUDIA' },
  ];
  const result = parsePackageValueResult(JSON.stringify({
    headline: 'Rasakan Perjalanan Kereta Cepat',
    summary: 'Perjalanan ibadah dengan perpindahan antarkota yang khas.',
    advantages: [
      { title: 'Ziarah Madinah', benefit: 'Mengikuti ziarah Madinah', description: 'Ziarah ke Makam Rasulullah dan para sahabat.', evidenceId: 'I01' },
      { title: 'Hotel Anjum', benefit: 'Menjalani hari Mekkah dari Hotel Anjum', description: 'Menginap di Hotel Anjum selama berada di Mekkah.', evidenceId: 'B01' },
      { title: 'Kereta Cepat Haramain', benefit: 'Melaju dari Madinah ke Mekkah dengan Haramain', description: 'Menuju Mekkah dengan kereta cepat dari Madinah.', evidenceId: 'I02' },
      { title: 'Hotel Odst', benefit: 'Menjalani hari Madinah dari Hotel Odst', description: 'Menginap di Hotel Odst selama berada di Madinah.', evidenceId: 'B02' },
      { title: 'Maskapai Saudia', benefit: 'Memulai penerbangan bersama Saudia', description: 'Penerbangan berangkat menggunakan Saudia.', evidenceId: 'B03' },
    ],
  }), { itineraryAvailable: true, evidenceCatalog });

  assert.deepEqual(result.advantages.map((item) => item.title), ['Kereta Cepat Haramain', 'Hotel Anjum', 'Hotel Odst', 'Maskapai Saudia']);
  assert.match(result.bannerPrompt, /NILAI PLUS 1 — PESAN UTAMA[\s\S]*Kereta Cepat Haramain/);
  assert.doesNotMatch(result.bannerPrompt, /Ziarah Madinah/);
});

test('parsePackageValueResult rejects a transport or route borrowed from outside the selected evidence', () => {
  const evidenceCatalog = [
    { id: 'I08A03', source: 'itinerary', fact: 'Hari 8 • Perjalanan ke Istanbul • 13:20 • Dengan pesawat Saudi Arabia SV 275 menuju Istanbul' },
    { id: 'I09A02', source: 'itinerary', fact: 'Hari 9 • Citytour di Bursa • 10:00 • Sampai Bursa citytour ke Grand Mosque' },
    { id: 'I12A02', source: 'itinerary', fact: 'Hari 12 • Citytour di Istanbul • 08:30 • Citytour Bosphorus dengan private cruise' },
    { id: 'BH01', source: 'brosur', fact: 'Hotel Makkah tier UHUD: JUMEIRAH JABAL OMAR MAKKAH' },
  ];
  const fatalCachedOutput = {
    headline: 'Kereta Cepat Menuju Istanbul',
    summary: 'Kereta cepat dan Istanbul memberi pengalaman perjalanan berbeda.',
    visualIdea: 'Jamaah menaiki kereta cepat menuju Istanbul.',
    advantages: [
      {
        title: 'Kereta Cepat ke Istanbul',
        benefit: 'Perjalanan Medinah ke Istanbul menjadi lebih cepat dan nyaman.',
        description: 'Menggunakan pesawat Saudi Arabia SV 275 menuju Istanbul.',
        evidenceId: 'I08A03',
      },
      { title: 'Citytour Bursa', benefit: 'Menyusuri Grand Mosque saat citytour Bursa', description: 'Citytour Bursa mencakup Grand Mosque.', evidenceId: 'I09A02' },
      { title: 'Cruise Bosphorus', benefit: 'Berlayar di Bosphorus dengan private cruise', description: 'Citytour Bosphorus menggunakan private cruise.', evidenceId: 'I12A02' },
      { title: 'Hotel Jumeirah', benefit: 'Menjalani hari Makkah dari Jumeirah', description: 'Menginap di Jumeirah Jabal Omar Makkah.', evidenceId: 'BH01' },
    ],
  };

  assert.equal(parsePackageValueResult(JSON.stringify(fatalCachedOutput), {
    itineraryAvailable: true,
    evidenceCatalog,
  }), null, 'evidence pesawat tidak boleh dilabeli sebagai kereta cepat');

  const safelyRewritten = parsePackageValueResult(JSON.stringify(fatalCachedOutput), {
    itineraryAvailable: true,
    evidenceCatalog,
    allowEvidenceRewrite: true,
  });
  assert.ok(safelyRewritten, 'repair terakhir memakai copy deterministik dari evidence');
  assert.doesNotMatch(JSON.stringify(safelyRewritten), /kereta|lebih cepat|nyaman/i);
  assert.match(safelyRewritten.advantages[0].title, /Penerbangan.*Istanbul/);
  assert.match(safelyRewritten.advantages[0].sourceRef, /pesawat Saudi Arabia SV 275 menuju Istanbul/);

  const wrongDestination = structuredClone(fatalCachedOutput);
  wrongDestination.headline = 'Melaju Menuju Cappadocia';
  wrongDestination.summary = 'Perjalanan Cappadocia melengkapi agenda.';
  wrongDestination.visualIdea = 'Jamaah menuju Cappadocia.';
  wrongDestination.advantages[0] = {
    title: 'Menuju Cappadocia',
    benefit: 'Melanjutkan perjalanan menuju Cappadocia',
    description: 'Pesawat Saudi Arabia SV 275 menuju Cappadocia.',
    evidenceId: 'I08A03',
  };
  assert.equal(parsePackageValueResult(JSON.stringify(wrongDestination), {
    itineraryAvailable: true,
    evidenceCatalog,
  }), null, 'kota dari evidence lain tidak boleh dipindahkan ke evidence penerbangan');
});

test('parsePackageValueResult accepts the same Turkey facts when every point stays bound to its evidence', () => {
  const evidenceCatalog = [
    { id: 'I08A03', source: 'itinerary', fact: 'Hari 8 • Perjalanan ke Istanbul • 13:20 • Dengan pesawat Saudi Arabia SV 275 menuju Istanbul' },
    { id: 'I09A02', source: 'itinerary', fact: 'Hari 9 • Citytour di Bursa • 10:00 • Sampai Bursa citytour ke Grand Mosque' },
    { id: 'I12A02', source: 'itinerary', fact: 'Hari 12 • Citytour di Istanbul • 08:30 • Citytour Bosphorus dengan private cruise' },
    { id: 'BH01', source: 'brosur', fact: 'Hotel Makkah tier UHUD: JUMEIRAH JABAL OMAR MAKKAH' },
  ];
  const result = parsePackageValueResult(JSON.stringify({
    headline: 'Terbang Menuju Istanbul',
    summary: 'Istanbul, Bursa, Bosphorus, dan Jumeirah membedakan perjalanan.',
    visualIdea: 'Jamaah berada di pesawat menuju Istanbul.',
    advantages: [
      { title: 'Pesawat ke Istanbul', benefit: 'Terbang menuju Istanbul bersama Saudi Arabia', description: 'Pesawat Saudi Arabia SV 275 menuju Istanbul.', evidenceId: 'I08A03' },
      { title: 'Citytour Bursa', benefit: 'Menyusuri Grand Mosque saat citytour Bursa', description: 'Citytour Bursa mencakup Grand Mosque.', evidenceId: 'I09A02' },
      { title: 'Cruise Bosphorus', benefit: 'Berlayar di Bosphorus dengan private cruise', description: 'Citytour Bosphorus menggunakan private cruise.', evidenceId: 'I12A02' },
      { title: 'Hotel Jumeirah', benefit: 'Menjalani hari Makkah dari Jumeirah', description: 'Menginap di Jumeirah Jabal Omar Makkah.', evidenceId: 'BH01' },
    ],
  }), { itineraryAvailable: true, evidenceCatalog });

  assert.ok(result);
  assert.equal(result.advantages.length, 4);
  assert.doesNotMatch(JSON.stringify(result), /kereta/i);
  assert.match(result.advantages[0].sourceRef, /pesawat Saudi Arabia SV 275 menuju Istanbul/);
});

test('deterministic repair keeps fallback titles within four words and collapses duplicate flight points', () => {
  const evidenceCatalog = [
    { id: 'I15A01', source: 'itinerary', fact: 'Hari 15 • 10:00 • Dengan pesawat Saudi Arabia SV818 jamaah kembali ke tanah air' },
    { id: 'BH01', source: 'brosur', fact: 'Hotel Makkah tier HEMAT: AL MASSA DAR AL FAYZIN' },
    { id: 'BH02', source: 'brosur', fact: 'Hotel Madinah tier HEMAT: DURRAT AL EIMAN' },
    { id: 'B03', source: 'brosur', fact: 'Maskapai/penerbangan berangkat: SAUDIA' },
  ];
  const result = parsePackageValueResult(JSON.stringify({
    headline: 'Pulang Membawa Kenangan',
    summary: 'Empat fakta perjalanan yang tercantum dalam paket.',
    advantages: [
      { title: 'Penerbangan Saudi Arabia SV818 Jamaah Kembali Ke Tanah Air', benefit: 'Kembali ke tanah air dengan nyaman', description: 'Dengan pesawat Saudi Arabia SV818 jamaah kembali ke tanah air.', evidenceId: 'I15A01' },
      { title: 'Hotel Al Massa', benefit: 'Menjalani hari Makkah dari Al Massa', description: 'Menginap di Al Massa Dar Al Fayzin selama di Makkah.', evidenceId: 'BH01' },
      { title: 'Hotel Durrat', benefit: 'Menjalani hari Madinah dari Durrat', description: 'Menginap di Durrat Al Eiman selama di Madinah.', evidenceId: 'BH02' },
      { title: 'Penerbangan Saudia', benefit: 'Memulai perjalanan udara bersama Saudia', description: 'Penerbangan berangkat menggunakan Saudia.', evidenceId: 'B03' },
    ],
  }), { itineraryAvailable: true, evidenceCatalog, allowEvidenceRewrite: true });

  assert.ok(result);
  assert.ok(result.advantages.every((item) => item.title.split(/\s+/).length <= 4));
  // Keluhan "Penerbangan Saudia disebut dua kali": aspek penerbangan hanya
  // boleh muncul SEKALI meskipun model memilih dua evidence penerbangan.
  const flightPoints = result.advantages.filter((item) => /\b(?:pesawat|penerbangan|terbang|maskapai)\b/i
    .test(`${item.title} ${item.benefit} ${item.description}`));
  assert.equal(flightPoints.length, 1, 'aspek penerbangan tampil sekali saja');
  const visibleCopy = result.advantages.map(({ title, benefit, description }) => `${title} ${benefit} ${description}`).join(' ');
  assert.doesNotMatch(visibleCopy, /nyaman|tier|hemat/i);
});

test('single-segment departure route derives a grounded direct-flight fact', () => {
  assert.equal(directFlightFactFromRoute('CGK - JED'), 'Penerbangan langsung tanpa transit Jakarta-Jeddah');
  assert.equal(directFlightFactFromRoute('CGK-MED'), 'Penerbangan langsung tanpa transit Jakarta-Madinah');
  assert.equal(directFlightFactFromRoute('CGK-DXB / DXB-JED'), '', 'rute transit tidak boleh diklaim direct');
  assert.equal(directFlightFactFromRoute('CGK-JED/JED-CAI/CAI-MED'), '');
  assert.equal(directFlightFactFromRoute(''), '');

  const directContext = buildPackageValueContext({
    ...schedule,
    berangkat_rute: 'CGK - JED',
  }, null, 'UHUD');
  const b03 = directContext.evidence.find((item) => item.id === 'B03');
  assert.match(b03.fact, /Penerbangan langsung tanpa transit Jakarta-Jeddah/);

  const transitContext = buildPackageValueContext({
    ...schedule,
    berangkat_rute: 'CGK-DXB / DXB-JED',
  }, null, 'UHUD');
  const b03Transit = transitContext.evidence.find((item) => item.id === 'B03');
  assert.doesNotMatch(b03Transit.fact, /tanpa transit/);
});

test('weak airline copy is rewritten into the direct-flight selling point when the route proves it', () => {
  const evidenceCatalog = [
    { id: 'B03', source: 'brosur', fact: 'Maskapai/penerbangan berangkat: SAUDIA • SV 819 • Penerbangan langsung tanpa transit Jakarta-Jeddah' },
    { id: 'BH01', source: 'brosur', fact: 'Hotel Makkah tier HEMAT: AL MASSA DAR AL FAYZIN' },
    { id: 'BH02', source: 'brosur', fact: 'Hotel Madinah tier HEMAT: DURRAT AL EIMAN' },
  ];
  const result = parsePackageValueResult(JSON.stringify({
    headline: 'Berangkat Tanpa Ribet Transit',
    summary: 'Terbang langsung dan hotel bernama jelas dalam satu paket.',
    advantages: [
      // Copy lemah + klaim tak berdasar ("nyaman") memicu rewrite deterministik.
      { title: 'Penerbangan Saudia', benefit: 'Terbang nyaman bersama Saudia', description: 'Penerbangan berangkat menggunakan Saudia.', evidenceId: 'B03' },
      { title: 'Hotel Al Massa', benefit: 'Menjalani hari Makkah dari Al Massa', description: 'Menginap di Al Massa Dar Al Fayzin selama di Makkah.', evidenceId: 'BH01' },
      { title: 'Hotel Durrat', benefit: 'Menjalani hari Madinah dari Durrat', description: 'Menginap di Durrat Al Eiman selama di Madinah.', evidenceId: 'BH02' },
    ],
  }), { itineraryAvailable: false, evidenceCatalog, allowEvidenceRewrite: true });

  assert.ok(result);
  const flightPoint = result.advantages.find((item) => /terbang|penerbangan/i.test(item.title));
  assert.equal(flightPoint.title, 'Terbang Langsung ke Jeddah');
  assert.match(flightPoint.benefit, /langsung tanpa transit/i);
});

test('direct-flight claims are rejected when the route has a transit', () => {
  const evidenceCatalog = [
    { id: 'B03', source: 'brosur', fact: 'Maskapai/penerbangan berangkat: EMIRATES • EK 357' },
    { id: 'BH01', source: 'brosur', fact: 'Hotel Makkah tier HEMAT: AL MASSA DAR AL FAYZIN' },
    { id: 'BH02', source: 'brosur', fact: 'Hotel Madinah tier HEMAT: DURRAT AL EIMAN' },
  ];
  const result = parsePackageValueResult(JSON.stringify({
    headline: 'Terbang Langsung ke Tanah Suci',
    summary: 'Penerbangan tanpa transit menuju Jeddah.',
    advantages: [
      { title: 'Terbang Tanpa Transit', benefit: 'Penerbangan langsung tanpa transit menuju Jeddah', description: 'Penerbangan Emirates tanpa transit.', evidenceId: 'B03' },
      { title: 'Hotel Al Massa', benefit: 'Menjalani hari Makkah dari Al Massa', description: 'Menginap di Al Massa Dar Al Fayzin selama di Makkah.', evidenceId: 'BH01' },
      { title: 'Hotel Durrat', benefit: 'Menjalani hari Madinah dari Durrat', description: 'Menginap di Durrat Al Eiman selama di Madinah.', evidenceId: 'BH02' },
    ],
  }), { itineraryAvailable: false, evidenceCatalog });

  assert.equal(result, null, 'klaim tanpa transit tanpa bukti rute harus ditolak');
});

test('hotel names containing room words like TRIPLE ONE are not rejected as jargon', () => {
  const evidenceCatalog = [
    { id: 'B03', source: 'brosur', fact: 'Maskapai/penerbangan berangkat: SAUDIA • Penerbangan langsung tanpa transit Jakarta-Jeddah' },
    { id: 'BH01', source: 'brosur', fact: 'Hotel mekkah tier HEMAT: AL MASSA GRAND' },
    { id: 'BH02', source: 'brosur', fact: 'Hotel madinah tier HEMAT: TRIPLE ONE' },
  ];
  const advantages = [
    { title: 'Penerbangan Langsung', benefit: 'Terbang tanpa transit dari Jakarta ke Jeddah', description: 'Penerbangan langsung tanpa transit Jakarta-Jeddah.', evidenceId: 'B03' },
    { title: 'Hotel Al Massa Grand', benefit: 'Menjalani hari Makkah dari Al Massa Grand', description: 'Menginap di Al Massa Grand selama berada di Makkah.', evidenceId: 'BH01' },
    { title: 'Hotel Triple One', benefit: 'Menjalani hari Madinah dari Triple One', description: 'Menginap di Triple One selama berada di Madinah.', evidenceId: 'BH02' },
  ];
  const base = {
    headline: 'Umrah Tanpa Transit',
    summary: 'Terbang langsung dan hotel bernama jelas.',
  };

  const accepted = parsePackageValueResult(JSON.stringify({ ...base, advantages }), { itineraryAvailable: false, evidenceCatalog });
  assert.ok(accepted, 'nama hotel Triple One bukan jargon kamar');
  assert.ok(accepted.advantages.some((item) => item.title === 'Hotel Triple One'));

  // Kata kamar tetap ditolak bila BUKAN bagian nama sah pada evidence poin itu.
  const withRoomJargon = advantages.map((item, index) => (index === 1
    ? { ...item, benefit: 'Kamar triple luas untuk keluarga' }
    : item));
  const rejected = parsePackageValueResult(JSON.stringify({ ...base, advantages: withRoomJargon }), { itineraryAvailable: false, evidenceCatalog });
  assert.equal(rejected, null, 'kata kamar "triple" di luar nama hotel tetap ditolak');
});

test('brochure hedge "atau setaraf" never reaches the visible copy', () => {
  const evidenceCatalog = [
    { id: 'BH01', source: 'brosur', fact: 'Hotel Makkah tier HEMAT: GRAND AL MASSA ATAU SETARAF' },
    { id: 'BH02', source: 'brosur', fact: 'Hotel Madinah tier HEMAT: DURRAT AL EIMAN' },
    { id: 'B03', source: 'brosur', fact: 'Maskapai/penerbangan berangkat: SAUDIA • Penerbangan langsung tanpa transit Jakarta-Jeddah' },
  ];
  const parsedInput = JSON.stringify({
    headline: 'Menginap Bernama, Bukan Sekadar Janji',
    summary: 'Hotel bernama jelas dan penerbangan langsung dalam satu paket.',
    advantages: [
      { title: 'Hotel Grand Al Massa', benefit: 'Menginap di Grand Al Massa atau setaraf di Makkah', description: 'Hotel Makkah adalah Grand Al Massa atau setaraf.', evidenceId: 'BH01' },
      { title: 'Hotel Durrat', benefit: 'Menjalani hari Madinah dari Durrat', description: 'Menginap di Durrat Al Eiman selama di Madinah.', evidenceId: 'BH02' },
      { title: 'Terbang Langsung ke Jeddah', benefit: 'Penerbangan Saudia langsung tanpa transit menuju Jeddah', description: 'Rute berangkat langsung Jakarta-Jeddah tanpa transit.', evidenceId: 'B03' },
    ],
  });

  // Fail-closed pada pass pertama: "setaraf" adalah jargon hedging brosur.
  assert.equal(parsePackageValueResult(parsedInput, { itineraryAvailable: false, evidenceCatalog }), null);

  // Jalur rewrite membangun ulang copy hotel tanpa kata "setaraf".
  const repaired = parsePackageValueResult(parsedInput, { itineraryAvailable: false, evidenceCatalog, allowEvidenceRewrite: true });
  assert.ok(repaired);
  const visibleCopy = repaired.advantages.map(({ title, benefit, description }) => `${title} ${benefit} ${description}`).join(' ');
  assert.doesNotMatch(visibleCopy, /setaraf?\b/i);
  assert.match(visibleCopy, /Grand Al Massa/);
});

test('station-only evidence cannot be promoted into an unsupported train ride', () => {
  const evidenceCatalog = [
    { id: 'I04A02', source: 'itinerary', fact: 'Hari 4 • 14:00 • Check out hotel, menuju stasiun kereta cepat' },
    { id: 'BH01', source: 'brosur', fact: 'Hotel Makkah: ANJUM' },
    { id: 'B03', source: 'brosur', fact: 'Maskapai/penerbangan berangkat: SAUDIA' },
  ];
  const raw = JSON.stringify({
    headline: 'Kereta Cepat Jadi Pembeda',
    summary: 'Kereta cepat, Anjum, dan Saudia tercantum dalam perjalanan.',
    advantages: [
      { title: 'Kereta Cepat', benefit: 'Melaju dengan kereta cepat', description: 'Menuju stasiun kereta cepat setelah check out.', evidenceId: 'I04A02' },
      { title: 'Hotel Anjum', benefit: 'Menjalani hari Makkah dari Anjum', description: 'Menginap di Anjum selama berada di Makkah.', evidenceId: 'BH01' },
      { title: 'Penerbangan Saudia', benefit: 'Memulai perjalanan udara bersama Saudia', description: 'Penerbangan berangkat menggunakan Saudia.', evidenceId: 'B03' },
    ],
  });

  assert.equal(parsePackageValueResult(raw, { itineraryAvailable: true, evidenceCatalog }), null);
  const repaired = parsePackageValueResult(raw, { itineraryAvailable: true, evidenceCatalog, allowEvidenceRewrite: true });
  assert.ok(repaired);
  assert.equal(repaired.advantages[0].title, 'Kereta Cepat');
  assert.equal(repaired.advantages[0].benefit, 'Perjalanan berlanjut lewat stasiun kereta cepat');
  assert.doesNotMatch(repaired.advantages[0].benefit, /melaju|naik|menggunakan/i);
});

test('parsePackageValueResult recovers a near-miss evidenceId from the fact the model copied', () => {
  // Model menyalin fakta I05A03 dengan benar tetapi menulis ID I05A04 yang tidak
  // ada di katalog. Sebelumnya seluruh respons ditolak dan percobaan perbaikan
  // mengulang salah ketik yang sama, sehingga paket itu selalu berakhir 502.
  const evidenceCatalog = [
    { id: 'I05A03', source: 'itinerary', fact: 'Hari 4 • Madinah – Makkah • 14:00 • Check-out hotel dengan memakai ihram, menuju stasiun kereta cepat Haramain' },
    { id: 'BH01', source: 'brosur', fact: 'Hotel mekkah tier UHUD: ANJUM' },
    { id: 'B03', source: 'brosur', fact: 'Maskapai/penerbangan berangkat: SAUDIA • SV 827 • Penerbangan langsung tanpa transit Jakarta-Jeddah' },
  ];
  const result = parsePackageValueResult(JSON.stringify({
    headline: 'Kereta Cepat Jadi Pembeda',
    summary: 'Perjalanan berlanjut lewat stasiun kereta cepat Haramain.',
    advantages: [
      // Deskripsi diparafrase (tambahan "dari Madinah"), bukan salinan persis.
      { title: 'Stasiun Kereta Cepat Haramain', benefit: 'Perjalanan berlanjut lewat stasiun kereta cepat Haramain', description: 'Menuju stasiun kereta cepat Haramain dari Madinah.', evidenceId: 'I05A04' },
      { title: 'Hotel Anjum', benefit: 'Menjalani hari Makkah dari Anjum', description: 'Menginap di Anjum selama berada di Makkah.', evidenceId: 'BH01' },
      { title: 'Penerbangan Langsung', benefit: 'Terbang tanpa transit menuju Jeddah', description: 'Penerbangan langsung tanpa transit Jakarta-Jeddah.', evidenceId: 'B03' },
    ],
  }), { itineraryAvailable: true, evidenceCatalog });

  assert.ok(result);
  const recovered = result.advantages.find((item) => /kereta cepat/i.test(item.title));
  assert.equal(recovered.evidenceId, 'I05A03');
  assert.match(recovered.sourceRef, /kereta cepat Haramain/);
});

test('catalog named terms never override a canonical place group spelling', () => {
  // Brosur menulis "…OMAR MAKKAH" (kapital) sementara itinerary mengeja
  // "Mekkah". Istilah named: dari katalog dulu menolak copy "Makkah" pada poin
  // kereta, sehingga paket dengan kombinasi ejaan ini selalu berakhir 502.
  const evidenceCatalog = [
    { id: 'I06A03', source: 'itinerary', fact: 'Hari 5 • Madinah – Makkah • 14:00 • Menuju Mekkah menggunakan kereta cepat melalui Stasiun Bir Ali.' },
    { id: 'BH01', source: 'brosur', fact: 'Hotel mekkah tier UHUD: JUMEIRAH JABAL OMAR MAKKAH' },
    { id: 'B03', source: 'brosur', fact: 'Maskapai/penerbangan berangkat: SAUDIA • SV 827 • Penerbangan langsung tanpa transit Jakarta-Jeddah' },
  ];
  const result = parsePackageValueResult(JSON.stringify({
    headline: 'Kereta Cepat Jadi Pembeda',
    advantages: [
      { title: 'Kereta Cepat', benefit: 'Melaju menuju Makkah dengan kereta cepat', description: 'Menuju Mekkah menggunakan kereta cepat melalui Stasiun Bir Ali.', evidenceId: 'I06A03' },
      { title: 'Hotel Jumeirah', benefit: 'Menjalani hari Makkah dari Jumeirah', description: 'Menginap di Jumeirah Jabal Omar selama berada di Makkah.', evidenceId: 'BH01' },
      { title: 'Penerbangan Langsung', benefit: 'Terbang tanpa transit menuju Jeddah', description: 'Penerbangan langsung tanpa transit Jakarta-Jeddah.', evidenceId: 'B03' },
    ],
  }), { itineraryAvailable: true, evidenceCatalog });

  assert.ok(result);
  assert.equal(result.advantages.length, 3);

  // Nama diri (hotel, maskapai) tetap harfiah: Jumeirah tidak boleh dipinjam
  // oleh poin yang evidence-nya kereta.
  assert.equal(parsePackageValueResult(JSON.stringify({
    headline: 'Nilai Plus',
    advantages: [
      { title: 'Kereta Cepat', benefit: 'Melaju menuju Makkah dengan kereta cepat', description: 'Menuju Mekkah dan menginap di Jumeirah.', evidenceId: 'I06A03' },
      { title: 'Hotel Jumeirah', benefit: 'Menjalani hari Makkah dari Jumeirah', description: 'Menginap di Jumeirah Jabal Omar selama berada di Makkah.', evidenceId: 'BH01' },
      { title: 'Penerbangan Langsung', benefit: 'Terbang tanpa transit menuju Jeddah', description: 'Penerbangan langsung tanpa transit Jakarta-Jeddah.', evidenceId: 'B03' },
    ],
  }), { itineraryAvailable: true, evidenceCatalog }), null);
});

test('fakta harga multi-kamar diringkas per harga, bukan seluruh fakta', () => {
  // Meringkas seluruh fakta melumat "45.900.000, 44.900.000, 43.900.000" menjadi
  // satu bilangan raksasa, lalu mengesahkannya sebagai angka "terbukti" —
  // artwork bisa memajang "Harga 459000004490000060 JUTA".
  const evidenceCatalog = [
    { id: 'B09', source: 'brosur', fact: 'Harga paket: Double: 45.900.000, Triple: 44.900.000, Quard: 43.900.000' },
    { id: 'BH01', source: 'brosur', fact: 'Hotel mekkah: ANJUM' },
    { id: 'B03', source: 'brosur', fact: 'Penerbangan berangkat: SAUDIA SV 827' },
  ];
  const result = parsePackageValueResult(JSON.stringify({
    headline: 'Nilai Plus',
    advantages: [
      // Salinan mentah → poin ini masuk jalur tulis-ulang deterministik.
      { title: 'Harga Paket', benefit: 'Harga paket tercantum jelas', description: 'Harga paket: 45.900.000.', evidenceId: 'B09' },
      { title: 'Hotel Anjum', benefit: 'Menjalani hari Makkah dari Anjum', description: 'Menginap di Anjum selama berada di Makkah.', evidenceId: 'BH01' },
      { title: 'Penerbangan Saudia', benefit: 'Memulai perjalanan bersama Saudia', description: 'Penerbangan berangkat menggunakan Saudia.', evidenceId: 'B03' },
    ],
  }), { itineraryAvailable: false, evidenceCatalog, allowEvidenceRewrite: true });

  assert.ok(result);
  const priceAdvantage = result.advantages.find((item) => item.evidenceId === 'B09');
  // Jangkar = harga termurah, sama dengan price lockup pada banner.
  assert.match(priceAdvantage.title, /43[.,]9 JUTA/i);
  for (const field of [priceAdvantage.title, priceAdvantage.benefit, priceAdvantage.description]) {
    assert.doesNotMatch(field, /\d{10,}/, 'angka gabungan lintas harga tidak boleh muncul');
  }
});

test('salinan mentah baris katalog tidak boleh tampil sebagai copy artwork', () => {
  // Fakta katalog sengaja dibersihkan dari jargon internal supaya model yang
  // bertumpu pada sumber tidak otomatis ditolak. Konsekuensinya, larangan jargon
  // tidak lagi ikut menyaring salinan mentah — label barisnya harus dijegal
  // sendiri, kalau tidak "Hotel mekkah: ANJUM" mendarat di artwork.
  const evidenceCatalog = [
    { id: 'BH01', source: 'brosur', fact: 'Hotel mekkah: ANJUM' },
    { id: 'BH02', source: 'brosur', fact: 'Hotel madinah: AL RITZ AL MADINAH' },
    { id: 'B03', source: 'brosur', fact: 'Penerbangan berangkat: EMIRATES EK 357/809' },
  ];
  const rawDump = JSON.stringify({
    headline: 'Nilai Plus',
    advantages: [
      { title: 'Hotel Anjum', benefit: 'Menjalani hari Makkah dari Anjum', description: 'Hotel Makkah: ANJUM.', evidenceId: 'BH01' },
      { title: 'Hotel Al Ritz', benefit: 'Menjalani hari Madinah dari Al Ritz', description: 'Menginap di Al Ritz selama berada di Madinah.', evidenceId: 'BH02' },
      { title: 'Penerbangan Emirates', benefit: 'Memulai perjalanan bersama Emirates', description: 'Penerbangan berangkat: EMIRATES EK 357/809.', evidenceId: 'B03' },
    ],
  });

  assert.equal(parsePackageValueResult(rawDump, { itineraryAvailable: false, evidenceCatalog }), null);

  // Jalur perbaikan menulis ulang salinan mentah menjadi kalimat, bukan gagal.
  const repaired = parsePackageValueResult(rawDump, { itineraryAvailable: false, evidenceCatalog, allowEvidenceRewrite: true });
  assert.ok(repaired);
  for (const item of repaired.advantages) {
    assert.doesNotMatch(item.description, /hotel\s+\w+\s*:|penerbangan berangkat\s*:/i);
  }
});

test('parsePackageValueResult still rejects an unknown evidenceId whose claim is absent from the catalog', () => {
  const evidenceCatalog = [
    { id: 'I05A03', source: 'itinerary', fact: 'Hari 4 • Madinah – Makkah • 14:00 • Check-out hotel, menuju stasiun kereta cepat Haramain' },
    { id: 'BH01', source: 'brosur', fact: 'Hotel mekkah tier UHUD: ANJUM' },
    { id: 'B03', source: 'brosur', fact: 'Maskapai/penerbangan berangkat: SAUDIA' },
  ];
  const result = parsePackageValueResult(JSON.stringify({
    headline: 'Klaim tanpa sumber',
    summary: 'Ringkasan.',
    advantages: [
      { title: 'City Tour Thaif', benefit: 'Mengunjungi kebun mawar Thaif', description: 'City tour Thaif ke kebun mawar dan cable car.', evidenceId: 'I09A01' },
      { title: 'Hotel Anjum', benefit: 'Menjalani hari Makkah dari Anjum', description: 'Hotel mekkah tier UHUD: ANJUM.', evidenceId: 'BH01' },
      { title: 'Penerbangan Saudia', benefit: 'Memulai perjalanan bersama Saudia', description: 'Maskapai berangkat: SAUDIA.', evidenceId: 'B03' },
    ],
  }), { itineraryAvailable: true, evidenceCatalog });

  assert.equal(result, null);

  // Pemulihan rujukan tidak boleh menjadi pintu belakang: begitu ID dipulihkan,
  // seluruh copy tetap diuji terhadap fakta itu, jadi kota karangan tetap gugur.
  assert.equal(parsePackageValueResult(JSON.stringify({
    headline: 'Nilai Plus',
    advantages: [
      { title: 'Kereta Cepat Istanbul', benefit: 'Melaju dengan kereta cepat menuju Istanbul', description: 'Menuju stasiun kereta cepat Haramain lalu Istanbul.', evidenceId: 'I05A99' },
      { title: 'Hotel Anjum', benefit: 'Menjalani hari Makkah dari Anjum', description: 'Menginap di Anjum selama berada di Makkah.', evidenceId: 'BH01' },
      { title: 'Penerbangan Saudia', benefit: 'Memulai perjalanan bersama Saudia', description: 'Penerbangan berangkat menggunakan Saudia.', evidenceId: 'B03' },
    ],
  }), { itineraryAvailable: true, evidenceCatalog }), null);
});

test('parsePackageValueResult rejects malformed or ungrounded output', () => {
  assert.equal(parsePackageValueResult('bukan json'), null);
  assert.equal(parsePackageValueResult(JSON.stringify({
    headline: 'Tanpa bukti',
    advantages: [{ title: 'Klaim', description: 'Tidak ada sumber', source: 'brosur', sourceRef: '' }],
  })), null);
});
