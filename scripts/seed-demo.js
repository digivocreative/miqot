/**
 * Seed script: Insert comprehensive dummy data for agent "bagas" demo.
 * Covers: jamaah umroh, jamaah haji, calendar events, analytics events, calendar insights.
 * All dummy data is tagged with _DEMO_ prefix for easy cleanup.
 *
 * Run: node scripts/seed-demo.js
 * Cleanup: node scripts/cleanup-demo.js
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const AGENT_SLUG = 'bagas';
const NOW = new Date().toISOString();

// ══════════════════════════════════════════════
// Helpers
// ══════════════════════════════════════════════

function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomDate(startStr, endStr) {
  const start = new Date(startStr).getTime();
  const end = new Date(endStr).getTime();
  return new Date(start + Math.random() * (end - start)).toISOString().slice(0, 10);
}

function addDays(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function subtractDays(dateStr, days) {
  return addDays(dateStr, -days);
}

function randomPhone() {
  return `6281${randomBetween(100000000, 999999999)}`;
}

function randomPassport() {
  return `B${randomBetween(1000000, 9999999)}`;
}

function randomPasporExpiry() {
  const year = randomBetween(2027, 2030);
  const month = String(randomBetween(1, 12)).padStart(2, '0');
  const day = String(randomBetween(1, 28)).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function randomBirthDate() {
  const year = randomBetween(1960, 2000);
  const month = String(randomBetween(1, 12)).padStart(2, '0');
  const day = String(randomBetween(1, 28)).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ══════════════════════════════════════════════
// 1. JAMAAH UMROH — 30 records
// ══════════════════════════════════════════════

async function seedJamaahUmroh() {
  const names = [
    // LUNAS (10)
    { nama: 'Ahmad Fauzi', jk: 'L' },
    { nama: 'Siti Aisyah', jk: 'P' },
    { nama: 'Muhammad Rizki', jk: 'L' },
    { nama: 'Fatimah Zahra', jk: 'P' },
    { nama: 'Abdul Rahman', jk: 'L' },
    { nama: 'Nur Hasanah', jk: 'P' },
    { nama: 'Hasan Basri', jk: 'L' },
    { nama: 'Dewi Kartika', jk: 'P' },
    { nama: 'Umar Faruq', jk: 'L' },
    { nama: 'Rina Susanti', jk: 'P' },
    // CICILAN (10)
    { nama: 'Bambang Setiawan', jk: 'L' },
    { nama: 'Yuliana Putri', jk: 'P' },
    { nama: 'Agus Salim', jk: 'L' },
    { nama: 'Nurul Hidayah', jk: 'P' },
    { nama: 'Budi Santoso', jk: 'L' },
    { nama: 'Aminah Lubis', jk: 'P' },
    { nama: 'Ridwan Hakim', jk: 'L' },
    { nama: 'Sri Wahyuni', jk: 'P' },
    { nama: 'Dedi Mulyadi', jk: 'L' },
    { nama: 'Fitri Handayani', jk: 'P' },
    // BELUM BAYAR (10)
    { nama: 'Irfan Saputra', jk: 'L' },
    { nama: 'Lestari Dewi', jk: 'P' },
    { nama: 'Rahmat Hidayat', jk: 'L' },
    { nama: 'Kartini Wulandari', jk: 'P' },
    { nama: 'Syamsul Arifin', jk: 'L' },
    { nama: 'Mutia Rahmawati', jk: 'P' },
    { nama: 'Eko Prasetyo', jk: 'L' },
    { nama: 'Anisa Maharani', jk: 'P' },
    { nama: 'Wahyu Nugroho', jk: 'L' },
    { nama: 'Indah Permata Sari', jk: 'P' },
  ];

  const pakets = [
    { nama: 'UMROH REGULER 9 HARI', harga: 28500000 },
    { nama: 'UMROH REGULER 12 HARI', harga: 33000000 },
    { nama: 'UMROH PLUS CAIRO + ALEXANDRIA 12HR', harga: 42000000 },
    { nama: 'UMROH PLUS TURKEY 12HR', harga: 45000000 },
    { nama: 'UMROH PROMO AKBAR 9HR', harga: 23500000 },
  ];

  const departureDates = [
    '2026-05-10', '2026-05-20', '2026-06-05', '2026-06-15', '2026-07-01',
  ];

  const rows = names.map((person, i) => {
    const paket = pakets[i % pakets.length];
    const tglBerangkat = departureDates[i % departureDates.length];
    const tglDaftar = subtractDays(tglBerangkat, randomBetween(30, 90));

    let bayar, sisa;
    if (i < 10) {
      // LUNAS
      bayar = paket.harga;
      sisa = 0;
    } else if (i < 20) {
      // CICILAN — 30-70% paid
      const pct = 0.3 + Math.random() * 0.4;
      bayar = Math.round(paket.harga * pct / 100000) * 100000; // round to 100k
      sisa = paket.harga - bayar;
    } else {
      // BELUM BAYAR
      bayar = 0;
      sisa = paket.harga;
    }

    const hasPaspor = i < 20; // lunas & cicilan punya paspor
    return {
      agent_slug: AGENT_SLUG,
      id_umroh: `_DEMO_UM${String(i + 1).padStart(3, '0')}`,
      nama: person.nama,
      jk: person.jk,
      wa: randomPhone(),
      tgl_lahir: randomBirthDate(),
      paket: paket.nama,
      bayar,
      sisa,
      tgl_berangkat: tglBerangkat,
      tgl_daftar: tglDaftar,
      hijriah_year: '1448',
      perlengkapan: {
        koper: Math.random() > 0.3,
        baju_ihrom: Math.random() > 0.3,
        mukena: person.jk === 'P' ? Math.random() > 0.3 : false,
        sajadah: Math.random() > 0.4,
        tas_jinjing: Math.random() > 0.4,
      },
      dokumen: {
        paspor: hasPaspor,
        visa: hasPaspor ? Math.random() > 0.3 : false,
        foto: Math.random() > 0.2,
        surat_mahrom: person.jk === 'P' ? Math.random() > 0.4 : false,
      },
      no_paspor: hasPaspor ? randomPassport() : null,
      paspor_expired: hasPaspor ? randomPasporExpiry() : null,
      raw_data: { staf: 'Bagas' },
      synced_at: NOW,
    };
  });

  const { error } = await supabase
    .from('jamaah')
    .upsert(rows, { onConflict: 'agent_slug,id_umroh,nama' });

  if (error) {
    console.error('  GAGAL seed jamaah umroh:', error.message);
    return 0;
  }
  console.log(`  OK ${rows.length} jamaah umroh`);
  return rows.length;
}

// ══════════════════════════════════════════════
// 2. JAMAAH HAJI — 15 records
// ══════════════════════════════════════════════

async function seedJamaahHaji() {
  const names = [
    // LUNAS (5)
    { nama: 'H. Surya Atmaja', jk: 'L' },
    { nama: 'Hj. Ratna Dewi', jk: 'P' },
    { nama: 'H. Zainal Abidin', jk: 'L' },
    { nama: 'Hj. Maryam Sholehah', jk: 'P' },
    { nama: 'H. Djoko Susilo', jk: 'L' },
    // CICILAN (5)
    { nama: 'H. Firman Prasetya', jk: 'L' },
    { nama: 'Hj. Sari Andini', jk: 'P' },
    { nama: 'H. Taufik Ismail', jk: 'L' },
    { nama: 'Hj. Widya Kusuma', jk: 'P' },
    { nama: 'H. Arief Budiman', jk: 'L' },
    // BELUM BAYAR (5)
    { nama: 'Hj. Nuraini', jk: 'P' },
    { nama: 'H. Santoso Wibowo', jk: 'L' },
    { nama: 'Hj. Endang Supriyati', jk: 'P' },
    { nama: 'H. Mulyono', jk: 'L' },
    { nama: 'Hj. Farida Hanum', jk: 'P' },
  ];

  const alamatList = [
    'Jl. Merdeka No. 10, Jakarta Selatan',
    'Jl. Sudirman No. 25, Bekasi',
    'Jl. Gatot Subroto No. 5, Tangerang',
    'Jl. Ahmad Yani No. 88, Jakarta Timur',
    'Jl. Diponegoro No. 32, Depok',
    'Jl. Veteran No. 15, Jakarta Pusat',
    'Jl. Pahlawan No. 7, Bogor',
    'Jl. Cendrawasih No. 12, Jakarta Barat',
    'Jl. Kartini No. 45, Tangerang Selatan',
    'Jl. Pemuda No. 99, Bekasi Timur',
    'Jl. Mawar No. 3, Jakarta Utara',
    'Jl. Anggrek No. 18, Depok',
    'Jl. Melati No. 27, Bogor',
    'Jl. Dahlia No. 8, Jakarta Selatan',
    'Jl. Kenanga No. 55, Tangerang',
  ];

  const statusBayar = ['LUNAS', 'LUNAS', 'LUNAS', 'LUNAS', 'LUNAS',
    'CICILAN', 'CICILAN', 'CICILAN', 'CICILAN', 'CICILAN',
    'BELUM BAYAR', 'BELUM BAYAR', 'BELUM BAYAR', 'BELUM BAYAR', 'BELUM BAYAR'];

  const rows = names.map((person, i) => ({
    agent_slug: AGENT_SLUG,
    id_haji: `_DEMO_HJ${String(i + 1).padStart(3, '0')}`,
    id_jamaah: `_DEMO_JH${String(i + 1).padStart(3, '0')}`,
    nama: person.nama,
    jk: person.jk,
    alamat: alamatList[i],
    telp: randomPhone(),
    thn_hijriyah: '1448',
    thn_masehi: '2026',
    perwakilan: 'JAKARTA',
    marketing: 'Bagas',
    paket: i % 3 === 0 ? 'HAJI FURODA' : 'HAJI PLUS',
    staff: 'Bagas',
    jenis: i % 3 === 0 ? 'FURODA' : 'PLUS',
    status_bayar: statusBayar[i],
    status_berangkat: statusBayar[i] === 'LUNAS' ? 'PROSES' : 'BELUM',
    bpih_url: null,
    surat_pernyataan_url: null,
    synced_at: NOW,
  }));

  const { error } = await supabase
    .from('jamaah_haji')
    .upsert(rows, { onConflict: 'agent_slug,id_haji,id_jamaah' });

  if (error) {
    console.error('  GAGAL seed jamaah haji:', error.message);
    return 0;
  }
  console.log(`  OK ${rows.length} jamaah haji`);
  return rows.length;
}

// ══════════════════════════════════════════════
// 3. CALENDAR EVENTS — 12 records
// ══════════════════════════════════════════════

async function seedCalendarEvents() {
  const flights = [
    { code: 'GA 980', airline: 'GARUDA' },
    { code: 'SV 821', airline: 'SAUDIA' },
    { code: 'EK 357', airline: 'EMIRATES' },
    { code: 'GA 982', airline: 'GARUDA' },
  ];

  const tourLeaders = ['Ustadz Ahmad', 'Ustadz Hasan', 'Ustadzah Fatimah', 'Ustadz Rizki'];
  const staffNames = ['Bagas', 'Nikita', 'Andra', 'Nila'];

  const keberangkatanDates = ['2026-05-10', '2026-05-20', '2026-06-05', '2026-06-15'];
  const rows = [];

  keberangkatanDates.forEach((date, i) => {
    const group = String.fromCharCode(65 + i); // A, B, C, D
    const flight = flights[i];
    const pax = randomBetween(30, 45);

    // Keberangkatan
    rows.push({
      id: `_DEMO_${date}_keberangkatan_${group}`,
      event_date: date,
      event_type: 'keberangkatan',
      group_number: group,
      pesawat: flight.code,
      jam: pick(['06.30', '10.30', '14.00', '22.15']),
      paket: pick(['UMROH REGULER 9 HARI', 'UMROH PLUS CAIRO + ALEXANDRIA 12HR', 'UMROH PLUS TURKEY 12HR', 'UMROH PROMO AKBAR 9HR']),
      pax,
      staff: staffNames[i],
      tour_leader: tourLeaders[i],
      jam_kumpul: pick(['04.30', '07.30', '11.00', '19.00']),
      titik_kumpul: 'Terminal 3 Bandara Soekarno-Hatta',
      raw_data: {},
      synced_at: NOW,
    });

    // Kepulangan (+9 to +12 days)
    const returnDate = addDays(date, randomBetween(9, 12));
    rows.push({
      id: `_DEMO_${returnDate}_kepulangan_${group}`,
      event_date: returnDate,
      event_type: 'kepulangan',
      group_number: group,
      pesawat: flight.code,
      jam: pick(['05.00', '08.30', '16.00', '21.45']),
      paket: rows[rows.length - 1].paket,
      pax,
      staff: staffNames[i],
      tour_leader: tourLeaders[i],
      jam_kumpul: null,
      titik_kumpul: null,
      raw_data: {},
      synced_at: NOW,
    });

    // Manasik (7-14 days before departure)
    const manasikDate = subtractDays(date, randomBetween(7, 14));
    rows.push({
      id: `_DEMO_${manasikDate}_manasik_${group}`,
      event_date: manasikDate,
      event_type: 'manasik',
      group_number: group,
      pesawat: null,
      jam: pick(['09.00', '13.00', '15.00']),
      paket: rows[rows.length - 2].paket,
      pax,
      staff: staffNames[i],
      tour_leader: tourLeaders[i],
      jam_kumpul: null,
      titik_kumpul: 'Gedung Alhijaz, Jl. Kramat Raya No. 35, Jakarta Pusat',
      raw_data: {},
      synced_at: NOW,
    });
  });

  const { error } = await supabase
    .from('calendar_events')
    .upsert(rows, { onConflict: 'id' });

  if (error) {
    console.error('  GAGAL seed calendar events:', error.message);
    return 0;
  }
  console.log(`  OK ${rows.length} calendar events`);
  return rows.length;
}

// ══════════════════════════════════════════════
// 4. ANALYTICS EVENTS — ~100 records
// ══════════════════════════════════════════════

async function seedAnalyticsEvents() {
  const events = [];
  const today = new Date();

  // Generate events over the last 30 days
  for (let daysAgo = 30; daysAgo >= 0; daysAgo--) {
    const date = new Date(today);
    date.setDate(date.getDate() - daysAgo);
    const dateStr = date.toISOString();

    const isWeekday = date.getDay() >= 1 && date.getDay() <= 5;
    const eventChance = isWeekday ? 0.85 : 0.4; // more active on weekdays

    // Login events (~20 total)
    if (Math.random() < eventChance) {
      events.push({
        agent_slug: AGENT_SLUG,
        event_type: 'auth',
        event_name: 'login',
        metadata: { source: '_DEMO_' },
        created_at: dateStr,
      });
    }

    // Page views (~30 total)
    if (Math.random() < eventChance) {
      events.push({
        agent_slug: AGENT_SLUG,
        event_type: 'ui',
        event_name: 'page_view',
        metadata: { source: '_DEMO_', page: pick(['dashboard', 'jamaah', 'kalkulasi', 'compare', 'statistik']) },
        created_at: dateStr,
      });
    }

    // WA clicks (~15)
    if (Math.random() < 0.45) {
      events.push({
        agent_slug: AGENT_SLUG,
        event_type: 'action',
        event_name: 'wa_click',
        metadata: { source: '_DEMO_', package_id: pick(['JBU1500', 'JBU1505', 'JBU1510', 'JBU1520']) },
        created_at: dateStr,
      });
    }

    // Kalkulasi open (~10)
    if (Math.random() < 0.3 && isWeekday) {
      events.push({
        agent_slug: AGENT_SLUG,
        event_type: 'feature',
        event_name: 'kalkulasi_open',
        metadata: { source: '_DEMO_' },
        created_at: dateStr,
      });
    }

    // Jamaah sync (~8)
    if (Math.random() < 0.25 && isWeekday) {
      events.push({
        agent_slug: AGENT_SLUG,
        event_type: 'sync',
        event_name: 'jamaah_sync',
        metadata: { source: '_DEMO_', count: randomBetween(5, 30) },
        created_at: dateStr,
      });
    }

    // PDF generate (~7)
    if (Math.random() < 0.2) {
      events.push({
        agent_slug: AGENT_SLUG,
        event_type: 'feature',
        event_name: 'pdf_generate',
        metadata: { source: '_DEMO_', type: pick(['quotation', 'brochure']) },
        created_at: dateStr,
      });
    }

    // Compare view (~5)
    if (Math.random() < 0.15) {
      events.push({
        agent_slug: AGENT_SLUG,
        event_type: 'feature',
        event_name: 'compare_view',
        metadata: { source: '_DEMO_', packages: randomBetween(2, 4) },
        created_at: dateStr,
      });
    }

    // AI copy generate (~5)
    if (Math.random() < 0.15 && isWeekday) {
      events.push({
        agent_slug: AGENT_SLUG,
        event_type: 'feature',
        event_name: 'ai_copy_generate',
        metadata: { source: '_DEMO_' },
        created_at: dateStr,
      });
    }
  }

  // Insert in batches of 50
  let inserted = 0;
  for (let i = 0; i < events.length; i += 50) {
    const batch = events.slice(i, i + 50);
    const { error } = await supabase.from('analytics_events').insert(batch);
    if (error) {
      console.error(`  GAGAL seed analytics batch ${i}:`, error.message);
    } else {
      inserted += batch.length;
    }
  }
  console.log(`  OK ${inserted} analytics events`);
  return inserted;
}

// ══════════════════════════════════════════════
// 5. CALENDAR INSIGHTS — 1 record
// ══════════════════════════════════════════════

async function seedCalendarInsights() {
  const insight = {
    id: 'latest',
    data: {
      today: 'Hari ini ada 1 grup keberangkatan (Group A, 38 pax) via Garuda GA 980 pukul 10.30 WIB dari Terminal 3 Soekarno-Hatta. Pastikan semua jamaah sudah kumpul pukul 07.30. Tour leader: Ustadz Ahmad.',
      weekly: 'Minggu ini: 1 keberangkatan (Sabtu), 1 kepulangan (Kamis), 2 manasik (Sabtu & Minggu). Total 78 jamaah aktif terlibat. 3 jamaah masih ada sisa pembayaran yang perlu di-follow up.',
      cuaca: 'Mekkah: 33-42\u00B0C (cerah, sangat panas siang hari). Madinah: 28-38\u00B0C (cerah berawan). Ingatkan jamaah untuk bawa payung, sunblock, dan air minum yang cukup.',
      generatedAt: NOW,
      _demo: true,
    },
    generated_at: NOW,
  };

  const { error } = await supabase
    .from('calendar_insights')
    .upsert(insight, { onConflict: 'id' });

  if (error) {
    console.error('  GAGAL seed calendar insights:', error.message);
    return 0;
  }
  console.log('  OK 1 calendar insight');
  return 1;
}

// ══════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════

async function main() {
  console.log('\n=== SEED DEMO DATA untuk agent "bagas" ===\n');

  const results = {};
  results.jamaahUmroh = await seedJamaahUmroh();
  results.jamaahHaji = await seedJamaahHaji();
  results.calendarEvents = await seedCalendarEvents();
  results.analyticsEvents = await seedAnalyticsEvents();
  results.calendarInsights = await seedCalendarInsights();

  console.log('\n--- Ringkasan ---');
  console.log(`  Jamaah Umroh   : ${results.jamaahUmroh} records`);
  console.log(`  Jamaah Haji    : ${results.jamaahHaji} records`);
  console.log(`  Calendar Events: ${results.calendarEvents} records`);
  console.log(`  Analytics      : ${results.analyticsEvents} records`);
  console.log(`  Insights       : ${results.calendarInsights} records`);
  console.log('\nSelesai! Semua data dummy ber-tag _DEMO_ untuk cleanup.\n');
}

main().catch(err => {
  console.error('Seed error:', err);
  process.exit(1);
});
