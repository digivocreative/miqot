import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_PACKAGE_VALUE_ADVANTAGES,
  PACKAGE_VALUE_STYLES,
  buildPackageValueBannerPrompt,
  buildPackageValueContext,
  buildPackageValuePrompts,
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
  assert.ok(context.evidence.some((item) => item.fact.includes('HOTEL RAHMAH')));
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
  assert.match(prompts.systemPrompt, /Jangan jadikan aktivitas umum semua paket sebagai poin utama/);
  assert.match(prompts.systemPrompt, /prompt desain siap-tempel ke ChatGPT/);
  assert.match(prompts.systemPrompt, /Headline bukan label brosur/);
  assert.match(prompts.systemPrompt, /maksimal 4 kata dan harus menyebut pembeda konkret/);
  assert.match(prompts.systemPrompt, /NILAI PLUS 1 wajib memakai evidence dari itinerary/);
  assert.match(prompts.systemPrompt, /Headline wajib bertumpu langsung pada advantages\[0\]/);
  assert.match(prompts.systemPrompt, /Ziarah rutin Madinah/);
  assert.match(prompts.systemPrompt, /tepat satu kalimat faktual maksimal 12 kata/);
});

test('system prompt asks for experiential copywriting fields, not raw brochure copy', () => {
  const prompts = buildPackageValuePrompts(buildPackageValueContext(schedule, null, 'UHUD'));

  assert.match(prompts.systemPrompt, /ATURAN COPYWRITING/);
  assert.match(prompts.systemPrompt, /copy pengalaman maksimal 10 kata/);
  assert.match(prompts.systemPrompt, /kata kerja indrawi/);
  assert.match(prompts.systemPrompt, /visualIdea/);
  assert.match(prompts.systemPrompt, /Nama spesifik adalah bukti paling meyakinkan/);
  assert.match(prompts.systemPrompt, /"benefit":/);
  assert.match(prompts.systemPrompt, /"visualIdea":/);
});

test('style presets are distinct, complete, and rotate without repeating the excluded id', () => {
  assert.ok(PACKAGE_VALUE_STYLES.length >= 8, 'minimal 8 arah desain');
  const ids = new Set(PACKAGE_VALUE_STYLES.map((style) => style.id));
  assert.equal(ids.size, PACKAGE_VALUE_STYLES.length, 'id gaya unik');
  for (const style of PACKAGE_VALUE_STYLES) {
    for (const field of ['id', 'name', 'palette', 'typography', 'composition', 'heroTreatment', 'mood', 'finishing']) {
      assert.ok(typeof style[field] === 'string' && style[field].length > 0, `${style.id}.${field}`);
    }
  }

  const excluded = PACKAGE_VALUE_STYLES[0].id;
  for (let i = 0; i < 50; i += 1) {
    assert.notEqual(pickPackageValueStyle({ excludeId: excluded }).id, excluded);
  }
  // Deterministic pick via injected random
  assert.equal(pickPackageValueStyle({ random: () => 0 }).id, PACKAGE_VALUE_STYLES[0].id);
});

test('parsePackageValueResult keeps grounded fields, caps advantages, and stamps the style', () => {
  const evidenceCatalog = Array.from({ length: MAX_PACKAGE_VALUE_ADVANTAGES + 2 }, (_, index) => ({
    id: `B${index + 1}`,
    source: 'brosur',
    fact: `Fakta kanonis ${index + 1}`,
  }));
  const advantages = Array.from({ length: MAX_PACKAGE_VALUE_ADVANTAGES + 2 }, (_, index) => ({
    title: `Nilai ${index + 1}`,
    benefit: `Merasakan manfaat nyata nomor ${index + 1}`,
    description: 'Manfaat yang didukung data.',
    evidenceId: `B${index + 1}`,
    source: 'itinerary',
    sourceRef: 'Referensi buatan model yang harus diabaikan',
  }));
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
  assert.equal(result.advantages[0].source, 'brosur');
  assert.equal(result.advantages[0].sourceRef, 'Fakta kanonis 1');
  assert.match(result.advantages[0].benefit, /Merasakan manfaat nyata/);
  assert.equal(result.bestFor.length, 2);
  assert.equal(result.style.id, PACKAGE_VALUE_STYLES[0].id, 'gaya default = preset pertama');
  assert.match(result.bannerPrompt, /Buat SATU ad creative umroh/);
  assert.match(result.bannerPrompt, /Label paket: Umroh Plus Cairo 12 Hari/, 'nama paket di-title-case, bukan raw all-caps DB');
  assert.match(result.bannerPrompt, /anchor penawaran opsional: “Mulai Rp41\.000\.000 \(kamar berempat\)”/, 'satu anchor pre-picked tanpa jargon kamar');
  assert.match(result.bannerPrompt, /Hook utama: “Paket Kaya Pengalaman”/);
  assert.match(result.bannerPrompt, /Adegan hero: Menara masjid menjulang saat senja keemasan\./);
  assert.match(result.bannerPrompt, /arah desain yang menang/, 'jembatan adegan hero → arah desain');
  assert.match(result.bannerPrompt, /Copy pengalaman yang wajib tampil/);
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
      { title: 'Hotel Tier Aktif', description: 'Hotel ditampilkan sesuai tier yang dipilih.' },
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
  assert.match(fallback, new RegExp(`ARAH DESAIN — ${PACKAGE_VALUE_STYLES[0].name.toLocaleUpperCase('id-ID')}`));
});

test('buildPackageValueBannerPrompt creates a focused ready-to-paste ChatGPT image prompt', () => {
  const packageData = buildPackageValueContext(schedule, null, 'UHUD').package;
  const prompt = buildPackageValueBannerPrompt({
    headline: 'Umroh dengan Pengalaman Cairo',
    summary: 'Perjalanan ibadah dengan agenda tambahan yang terbukti di itinerary.',
    advantages: [
      { title: 'Jelajah Piramida Giza', description: 'Agenda Cairo memberi warna berbeda pada perjalanan.' },
      { title: 'Hotel Tier Aktif', description: 'Hotel ditampilkan sesuai tier yang dipilih.' },
    ],
    bestFor: ['Jamaah pencari destinasi tambahan'],
  }, packageData);

  assert.match(prompt, /Kanvas vertikal potret/);
  assert.match(prompt, /area tengah rasio 4:5/, 'safe-zone crop, bukan ukuran px yang tak didukung gpt-image');
  assert.match(prompt, /bukan brosur/);
  assert.match(prompt, /ARAH DESAIN — /);
  assert.match(prompt, /BIG IDEA/);
  assert.match(prompt, /NILAI PLUS — INTI IKLAN, WAJIB TERASA/);
  assert.match(prompt, /NILAI PLUS 1 — PESAN UTAMA/);
  assert.match(prompt, /Judul yang wajib tampil: “Jelajah Piramida Giza”/);
  assert.match(prompt, /Bukti singkat yang wajib tampil: “Agenda Cairo memberi warna berbeda pada perjalanan\.”/);
  // Anggaran teks image-gen: poin non-utama hanya judul + SATU baris pendukung.
  assert.match(prompt, /Satu baris pendukung yang wajib tampil: “Hotel ditampilkan sesuai tier yang dipilih\.”/);
  assert.match(prompt, /Tampilkan SEMUA nilai plus di atas/);
  assert.match(prompt, /NILAI PLUS 1 tampil paling menonjol/);
  assert.match(prompt, /BATAS TEKS LAIN YANG BOLEH TERLIHAT/);
  assert.match(prompt, /anchor penawaran opsional: “Mulai Rp35\.000\.000 \(kamar berempat\)”/);
  assert.match(prompt, /Audiens: Jamaah pencari destinasi tambahan/);
  assert.match(prompt, /Label paket: Umroh Plus Cairo 12 Hari/);
  assert.match(prompt, /Setting ibadah yang selalu boleh digambarkan: Masjidil Haram/, 'paket miskin-fakta tetap boleh menggambar masjid');
  assert.match(prompt, /LAMPIRAN IDENTITAS AGENT/);
  assert.match(prompt, /lembar aset identitas agent/);
  assert.match(prompt, /jangan pernah menampilkannya di artwork/, 'chip 01-06 lembar aset dilarang bocor ke artwork');
  assert.match(prompt, /bukan kartu ditempel mentah/);
  assert.match(prompt, /SATU artwork iklan final siap posting/);
  assert.doesNotMatch(prompt, /Pilihan anchor/, 'tidak ada lagi dua pilihan anchor yang ambigu');
  assert.doesNotMatch(prompt, /Hotel:|Rute berangkat:|Kepulangan:/);
  assert.doesNotMatch(prompt, /undefined|null/);
  assert.ok(prompt.length < 5000, 'prompt harus tetap aman untuk dibagikan bersama lampiran');
});

test('ranking keeps the AI-chosen primary advantage when the headline echoes its benefit copy', () => {
  // Regresi: overlap headline dulu hanya menghitung title/description/sourceRef
  // sehingga poin hotel (hook figuratif di benefit) tergeser oleh poin itinerary.
  const evidenceCatalog = [
    { id: 'BH01', source: 'brosur', fact: 'Hotel Mekkah tier VIP: PULLMAN ZAMZAM' },
    { id: 'I01', source: 'itinerary', fact: 'Hari 4 • City tour Thaif' },
  ];
  const result = parsePackageValueResult(JSON.stringify({
    headline: 'Buka Jendela, Langsung Kabah',
    summary: 'Pagi Makkah menyapa dari kamar Anda.',
    advantages: [
      { title: 'Hotel Pullman ZamZam', benefit: 'Membuka tirai, Kabah menyapa pagi Anda', description: 'Menginap di Pullman ZamZam Makkah.', evidenceId: 'BH01' },
      { title: 'City Tour Thaif', benefit: 'Menyusuri kota pegunungan Thaif', description: 'Itinerary hari keempat mencakup city tour Thaif.', evidenceId: 'I01' },
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
    advantages: [0, 1, 2].map((i) => ({
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
  }
});

test('parsePackageValueResult drops itinerary claims when itinerary is unavailable', () => {
  const evidenceCatalog = [
    { id: 'I01', source: 'itinerary', fact: 'Hari 2' },
    { id: 'B01', source: 'brosur', fact: 'Hotel UHUD' },
  ];
  const result = parsePackageValueResult(JSON.stringify({
    headline: 'Nilai Plus',
    summary: 'Ringkasan.',
    advantages: [
      { title: 'Klaim itinerary', description: 'Tidak boleh lolos.', evidenceId: 'I01' },
      { title: 'Hotel tier aktif', description: 'Boleh lolos.', evidenceId: 'B01' },
    ],
  }), { itineraryAvailable: false, evidenceCatalog });

  assert.deepEqual(result.advantages.map((item) => item.title), ['Hotel tier aktif']);
});

test('parsePackageValueResult removes routine activities and promotes the headline-aligned differentiator', () => {
  const evidenceCatalog = [
    { id: 'I01', source: 'itinerary', fact: 'Hari 2 • Ziarah Makam Rasulullah dan para sahabat' },
    { id: 'I02', source: 'itinerary', fact: 'Hari 6 • Madinah ke Mekkah menggunakan kereta cepat Haramain' },
    { id: 'B01', source: 'brosur', fact: 'Hotel Mekkah tier UHUD: ANJUM HOTEL' },
  ];
  const result = parsePackageValueResult(JSON.stringify({
    headline: 'Rasakan Perjalanan Kereta Cepat',
    summary: 'Perjalanan ibadah dengan perpindahan antarkota yang khas.',
    advantages: [
      { title: 'Ziarah Madinah', description: 'Ziarah ke Makam Rasulullah dan para sahabat.', evidenceId: 'I01' },
      { title: 'Hotel Anjum', description: 'Menginap di Hotel Anjum selama berada di Mekkah.', evidenceId: 'B01' },
      { title: 'Kereta Cepat Haramain', description: 'Menuju Mekkah dengan kereta cepat dari Madinah.', evidenceId: 'I02' },
    ],
  }), { itineraryAvailable: true, evidenceCatalog });

  assert.deepEqual(result.advantages.map((item) => item.title), ['Kereta Cepat Haramain', 'Hotel Anjum']);
  assert.match(result.bannerPrompt, /NILAI PLUS 1 — PESAN UTAMA[\s\S]*Kereta Cepat Haramain/);
  assert.doesNotMatch(result.bannerPrompt, /Ziarah Madinah/);
});

test('parsePackageValueResult rejects malformed or ungrounded output', () => {
  assert.equal(parsePackageValueResult('bukan json'), null);
  assert.equal(parsePackageValueResult(JSON.stringify({
    headline: 'Tanpa bukti',
    advantages: [{ title: 'Klaim', description: 'Tidak ada sumber', source: 'brosur', sourceRef: '' }],
  })), null);
});
