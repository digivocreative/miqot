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
// 1. JAMAAH UMROH — 89 records
// ══════════════════════════════════════════════

async function seedJamaahUmroh() {
  const names = [
    // LUNAS (30)
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
    { nama: 'Zulkifli Anwar', jk: 'L' },
    { nama: 'Maisaroh', jk: 'P' },
    { nama: 'Tarmizi', jk: 'L' },
    { nama: 'Siti Rohmah', jk: 'P' },
    { nama: 'Ilham Akbar', jk: 'L' },
    { nama: 'Nurhayati', jk: 'P' },
    { nama: 'Faisal Amir', jk: 'L' },
    { nama: 'Winda Sari', jk: 'P' },
    { nama: 'Rudi Hartono', jk: 'L' },
    { nama: 'Sumiati', jk: 'P' },
    { nama: 'Arief Wicaksono', jk: 'L' },
    { nama: 'Ratna Juwita', jk: 'P' },
    { nama: 'Hendra Gunawan', jk: 'L' },
    { nama: 'Mariam Azzahra', jk: 'P' },
    { nama: 'Lukman Hakim', jk: 'L' },
    { nama: 'Ayu Lestari', jk: 'P' },
    { nama: 'Saiful Bahri', jk: 'L' },
    { nama: 'Khadijah Nur', jk: 'P' },
    { nama: 'Darmawan', jk: 'L' },
    { nama: 'Halimah Tusadiah', jk: 'P' },
    // CICILAN (30)
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
    { nama: 'Teguh Prasetya', jk: 'L' },
    { nama: 'Rosmawati', jk: 'P' },
    { nama: 'Joko Widodo', jk: 'L' },
    { nama: 'Sulastri', jk: 'P' },
    { nama: 'Fathur Rohman', jk: 'L' },
    { nama: 'Neng Komalasari', jk: 'P' },
    { nama: 'Hendri Setiabudi', jk: 'L' },
    { nama: 'Yanti Suryani', jk: 'P' },
    { nama: 'Mulyono Hadi', jk: 'L' },
    { nama: 'Puji Rahayu', jk: 'P' },
    { nama: 'Cecep Supriyadi', jk: 'L' },
    { nama: 'Imas Masitoh', jk: 'P' },
    { nama: 'Slamet Riyadi', jk: 'L' },
    { nama: 'Tuti Alawiyah', jk: 'P' },
    { nama: 'Andi Firmansyah', jk: 'L' },
    { nama: 'Rohimah', jk: 'P' },
    { nama: 'Dadang Hermawan', jk: 'L' },
    { nama: 'Neneng Hasanah', jk: 'P' },
    { nama: 'Ujang Suryana', jk: 'L' },
    { nama: 'Euis Komariah', jk: 'P' },
    // BELUM BAYAR (29)
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
    { nama: 'Asep Kurniawan', jk: 'L' },
    { nama: 'Siti Aminah', jk: 'P' },
    { nama: 'Yusuf Maulana', jk: 'L' },
    { nama: 'Dewi Safitri', jk: 'P' },
    { nama: 'Rizal Ramadhan', jk: 'L' },
    { nama: 'Nurlela', jk: 'P' },
    { nama: 'Adi Nugraha', jk: 'L' },
    { nama: 'Sari Mulyani', jk: 'P' },
    { nama: 'Guntur Prakoso', jk: 'L' },
    { nama: 'Fitriani', jk: 'P' },
    { nama: 'Bayu Segara', jk: 'L' },
    { nama: 'Aisyah Putri Nabila', jk: 'P' },
    { nama: 'Doni Prasetyo', jk: 'L' },
    { nama: 'Nurjanah', jk: 'P' },
    { nama: 'Fajar Sidiq', jk: 'L' },
    { nama: 'Siti Nurhaliza', jk: 'P' },
    { nama: 'Herman Sulaiman', jk: 'L' },
    { nama: 'Wulan Dari', jk: 'P' },
    { nama: 'Soleh Abdillah', jk: 'L' },
  ];

  const pakets = [
    { nama: 'UMROH REGULER 9 HARI', harga: 28500000 },
    { nama: 'UMROH REGULER 12 HARI', harga: 33000000 },
    { nama: 'UMROH PLUS CAIRO + ALEXANDRIA 12HR', harga: 42000000 },
    { nama: 'UMROH PLUS TURKEY 12HR', harga: 45000000 },
    { nama: 'UMROH PROMO AKBAR 9HR', harga: 23500000 },
  ];

  const departureDates = [
    '2026-04-05', '2026-04-10', '2026-04-15', '2026-04-20',
    '2026-04-25', '2026-05-10', '2026-06-05', '2026-07-01',
  ];

  const rows = names.map((person, i) => {
    const paket = pakets[i % pakets.length];
    const tglBerangkat = departureDates[i % departureDates.length];
    const tglDaftar = subtractDays(tglBerangkat, randomBetween(30, 90));

    let bayar, sisa;
    if (i < 30) {
      // LUNAS
      bayar = paket.harga;
      sisa = 0;
    } else if (i < 60) {
      // CICILAN — 30-70% paid
      const pct = 0.3 + Math.random() * 0.4;
      bayar = Math.round(paket.harga * pct / 100000) * 100000; // round to 100k
      sisa = paket.harga - bayar;
    } else {
      // BELUM BAYAR
      bayar = 0;
      sisa = paket.harga;
    }

    const hasPaspor = i < 60; // lunas & cicilan punya paspor
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
        batik: Math.random() > 0.3,
        buku_doa: Math.random() > 0.3,
        ikhram: person.jk === 'L' ? Math.random() > 0.3 : false,
        koper: Math.random() > 0.3,
        mukena: person.jk === 'P' ? Math.random() > 0.3 : false,
        sabuk: person.jk === 'P' ? Math.random() > 0.4 : false,
        tas_paspor: Math.random() > 0.3,
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
// 3. CALENDAR EVENTS — April 2026 focused
// ══════════════════════════════════════════════

async function seedCalendarEvents() {
  const rows = [];

  // ── April events (dense, for demo on April 15) ──
  const aprilGroups = [
    {
      group: 'A', dep: '2026-04-02', flight: 'SAUDIA - SV 821', depJam: '22.15',
      paket: 'UMROH REGULER 9 HARI', pax: 38,
      staff: 'Bagas', tl: 'Ustadz Ahmad',
      retFlight: 'SAUDIA - SV 822', retJam: '08.30',
    },
    {
      group: 'B', dep: '2026-04-10', flight: 'GARUDA INDONESIA - GA 980', depJam: '10.30',
      paket: 'UMROH PLUS CAIRO + ALEXANDRIA 12HR', pax: 42,
      staff: 'Nikita', tl: 'Ustadz Hasan',
      retFlight: 'GARUDA INDONESIA - GA 981', retJam: '16.00',
    },
    {
      group: 'Kloter 140', dep: '2026-04-14', flight: 'GARUDA INDONESIA - GA 982', depJam: '14.00',
      paket: 'UMROH REGULER 9 HARI', pax: 35,
      staff: 'Bagas', tl: 'Ustadzah Fatimah',
      retFlight: 'GARUDA INDONESIA - GA 983', retJam: '05.00',
    },
    {
      group: 'Kloter 141', dep: '2026-04-15', flight: 'SAUDIA - SV 821', depJam: '22.15',
      paket: 'UMROH PLUS TURKEY 12HR', pax: 40,
      staff: 'Andra', tl: 'Ustadz Rizki',
      retFlight: 'SAUDIA - SV 822', retJam: '08.30',
    },
    {
      group: 'E', dep: '2026-04-20', flight: 'EMIRATES - EK 357', depJam: '08.00',
      paket: 'UMROH PROMO AKBAR 9HR', pax: 44,
      staff: 'Nila', tl: 'Ustadz Farid',
      retFlight: 'EMIRATES - EK 358', retJam: '21.45',
    },
    {
      group: 'F', dep: '2026-04-25', flight: 'GARUDA INDONESIA - GA 980', depJam: '10.30',
      paket: 'UMROH REGULER 12 HARI', pax: 36,
      staff: 'Bagas', tl: 'Ustadz Ahmad',
      retFlight: 'GARUDA INDONESIA - GA 981', retJam: '16.00',
    },
  ];

  for (const g of aprilGroups) {
    const retDate = addDays(g.dep, g.paket.includes('12') ? 12 : 9);
    const manasikDate = subtractDays(g.dep, randomBetween(5, 10));

    // Keberangkatan
    rows.push({
      id: `_DEMO_${g.dep}_keberangkatan_${g.group}`,
      event_date: g.dep,
      event_type: 'keberangkatan',
      group_number: g.group,
      pesawat: g.flight,
      jam: g.depJam,
      paket: g.paket,
      pax: g.pax,
      staff: g.staff,
      tour_leader: g.tl,
      jam_kumpul: (() => {
        const [h, m] = g.depJam.split('.');
        const kumpulH = Math.max(0, parseInt(h) - 3);
        return `${String(kumpulH).padStart(2, '0')}.${m}`;
      })(),
      titik_kumpul: 'Terminal 3 Bandara Soekarno-Hatta',
      raw_data: {},
      synced_at: NOW,
    });

    // Kepulangan
    rows.push({
      id: `_DEMO_${retDate}_kepulangan_${g.group}`,
      event_date: retDate,
      event_type: 'kepulangan',
      group_number: g.group,
      pesawat: g.retFlight,
      jam: g.retJam,
      paket: g.paket,
      pax: g.pax,
      staff: g.staff,
      tour_leader: g.tl,
      jam_kumpul: null,
      titik_kumpul: null,
      raw_data: {},
      synced_at: NOW,
    });

    // Manasik
    rows.push({
      id: `_DEMO_${manasikDate}_manasik_${g.group}`,
      event_date: manasikDate,
      event_type: 'manasik',
      group_number: g.group,
      pesawat: null,
      jam: pick(['09.00', '13.00', '15.00']),
      paket: g.paket,
      pax: g.pax,
      staff: g.staff,
      tour_leader: g.tl,
      jam_kumpul: null,
      titik_kumpul: 'Gedung Alhijaz, Jl. Kramat Raya No. 35, Jakarta Pusat',
      raw_data: {},
      synced_at: NOW,
    });
  }

  // ── May–July events (future, sparser) ──
  const futureGroups = [
    { group: 'G', dep: '2026-05-10', flight: 'GARUDA INDONESIA - GA 980', pax: 38, paket: 'UMROH REGULER 9 HARI', staff: 'Bagas', tl: 'Ustadz Ahmad', retFlight: 'GARUDA INDONESIA - GA 981' },
    { group: 'H', dep: '2026-06-05', flight: 'SAUDIA - SV 821', pax: 42, paket: 'UMROH PLUS TURKEY 12HR', staff: 'Nikita', tl: 'Ustadz Hasan', retFlight: 'SAUDIA - SV 822' },
    { group: 'I', dep: '2026-07-01', flight: 'EMIRATES - EK 357', pax: 35, paket: 'UMROH PROMO AKBAR 9HR', staff: 'Andra', tl: 'Ustadzah Fatimah', retFlight: 'EMIRATES - EK 358' },
  ];

  for (const g of futureGroups) {
    const retDate = addDays(g.dep, g.paket.includes('12') ? 12 : 9);
    const manasikDate = subtractDays(g.dep, randomBetween(7, 14));

    rows.push({
      id: `_DEMO_${g.dep}_keberangkatan_${g.group}`,
      event_date: g.dep,
      event_type: 'keberangkatan',
      group_number: g.group,
      pesawat: g.flight,
      jam: pick(['10.30', '14.00', '22.15']),
      paket: g.paket,
      pax: g.pax,
      staff: g.staff,
      tour_leader: g.tl,
      jam_kumpul: pick(['07.30', '11.00', '19.00']),
      titik_kumpul: 'Terminal 3 Bandara Soekarno-Hatta',
      raw_data: {},
      synced_at: NOW,
    });

    rows.push({
      id: `_DEMO_${retDate}_kepulangan_${g.group}`,
      event_date: retDate,
      event_type: 'kepulangan',
      group_number: g.group,
      pesawat: g.retFlight,
      jam: pick(['05.00', '08.30', '16.00']),
      paket: g.paket,
      pax: g.pax,
      staff: g.staff,
      tour_leader: g.tl,
      jam_kumpul: null,
      titik_kumpul: null,
      raw_data: {},
      synced_at: NOW,
    });

    rows.push({
      id: `_DEMO_${manasikDate}_manasik_${g.group}`,
      event_date: manasikDate,
      event_type: 'manasik',
      group_number: g.group,
      pesawat: null,
      jam: pick(['09.00', '13.00']),
      paket: g.paket,
      pax: g.pax,
      staff: g.staff,
      tour_leader: g.tl,
      jam_kumpul: null,
      titik_kumpul: 'Gedung Alhijaz, Jl. Kramat Raya No. 35, Jakarta Pusat',
      raw_data: {},
      synced_at: NOW,
    });
  }

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
// 3b. FLIGHT STATUS — dummy for today/tomorrow flights
// ══════════════════════════════════════════════

async function seedFlightStatus() {
  // Flights around today (Apr 14-15) so the widget picks them up
  const flightRows = [
    // Kloter 140: departed today Apr 14, GA982 CGK→MED
    {
      id: '2026-04-14_GA982',
      event_date: '2026-04-14',
      flight_iata: 'GA982',
      airline_name: 'GARUDA INDONESIA',
      airline_iata: 'GA',
      airline_logo: null,
      group_number: 'Kloter 140',
      status: 'en-route',
      dep_iata: 'CGK',
      dep_city: 'Jakarta',
      dep_terminal: '2',
      dep_gate: 'D5',
      dep_scheduled: '2026-04-14 14:00',
      dep_actual: '2026-04-14 14:12',
      arr_iata: 'MED',
      arr_city: 'Madinah',
      arr_terminal: '1',
      arr_gate: null,
      arr_scheduled: '2026-04-14 20:30',
      arr_estimated: '2026-04-14 20:42',
      pax: 35,
      tour_leader: 'Ustadzah Fatimah',
      lat: 15.5,
      lng: 52.3,
      alt: 11278,
      speed: 890,
      direction: 305,
      progress: 45,
      delayed: 0,
      aircraft_icao: 'B789',
      aircraft_reg: 'PK-GIA',
      duration: 570,
      dep_delayed: 0,
      arr_delayed: 0,
      arr_baggage: null,
      raw_api: null,
      synced_at: NOW,
    },
    // Kloter 141: tomorrow Apr 15, SV821 CGK→MED
    {
      id: '2026-04-15_SV821',
      event_date: '2026-04-15',
      flight_iata: 'SV821',
      airline_name: 'SAUDI ARABIAN AIRLINES',
      airline_iata: 'SV',
      airline_logo: null,
      group_number: 'Kloter 141',
      status: 'scheduled',
      dep_iata: 'CGK',
      dep_city: 'Jakarta',
      dep_terminal: '3',
      dep_gate: null,
      dep_scheduled: '2026-04-15 22:15',
      dep_actual: null,
      arr_iata: 'MED',
      arr_city: 'Madinah',
      arr_terminal: '1',
      arr_gate: null,
      arr_scheduled: '2026-04-16 04:45',
      arr_estimated: null,
      pax: 40,
      tour_leader: 'Ustadz Rizki',
      lat: null,
      lng: null,
      alt: null,
      speed: null,
      direction: null,
      progress: 0,
      delayed: 0,
      aircraft_icao: 'B789',
      aircraft_reg: null,
      duration: 570,
      dep_delayed: 0,
      arr_delayed: 0,
      arr_baggage: null,
      raw_api: null,
      synced_at: NOW,
    },
  ];

  const { error } = await supabase
    .from('flight_status')
    .upsert(flightRows, { onConflict: 'id' });

  if (error) {
    console.error('  GAGAL seed flight status:', error.message);
    return 0;
  }
  console.log(`  OK ${flightRows.length} flight status`);
  return flightRows.length;
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
      today: 'Hari ini ada 2 penerbangan aktif: Group C (35 pax) via Garuda GA 982 berangkat pukul 14.00 WIB ke Madinah — saat ini sedang terbang. Group A (38 pax) via Saudia SV 822 tiba di Jakarta pukul 16.30 — selamat datang kembali! Besok Group D (40 pax) berangkat via SV 821 pukul 22.15.',
      weekly: 'Minggu ini: 2 keberangkatan (Senin & Selasa), 1 kepulangan (Senin), 1 manasik (Sabtu). Total 113 jamaah aktif terlibat. Group E berangkat 20 April — pastikan perlengkapan dan dokumen lengkap. 5 jamaah masih ada sisa pembayaran yang perlu di-follow up.',
      cuaca: 'Mekkah: 30-40\u00B0C (cerah, mulai panas). Madinah: 25-36\u00B0C (cerah berawan). April cuaca relatif nyaman untuk ibadah. Ingatkan jamaah tetap bawa payung dan air minum cukup.',
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
  results.flightStatus = await seedFlightStatus();
  results.analyticsEvents = await seedAnalyticsEvents();
  results.calendarInsights = await seedCalendarInsights();

  console.log('\n--- Ringkasan ---');
  console.log(`  Jamaah Umroh   : ${results.jamaahUmroh} records`);
  console.log(`  Jamaah Haji    : ${results.jamaahHaji} records`);
  console.log(`  Calendar Events: ${results.calendarEvents} records`);
  console.log(`  Flight Status  : ${results.flightStatus} records`);
  console.log(`  Analytics      : ${results.analyticsEvents} records`);
  console.log(`  Insights       : ${results.calendarInsights} records`);
  console.log('\nSelesai! Semua data dummy ber-tag _DEMO_ untuk cleanup.\n');
}

main().catch(err => {
  console.error('Seed error:', err);
  process.exit(1);
});
