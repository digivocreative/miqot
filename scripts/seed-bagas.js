/**
 * Seed script: Create agent "bagas" with dummy jamaah data.
 * Run: node scripts/seed-bagas.js
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcrypt';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const AGENT_SLUG = 'bagas';
const AGENT_PASSWORD = 'bagas123';

// ── Step 1: Create agent ──
async function createAgent() {
  const hashedPassword = await bcrypt.hash(AGENT_PASSWORD, 12);
  
  // Check if already exists
  const { data: existing } = await supabase.from('agents').select('slug').eq('slug', AGENT_SLUG).single();
  if (existing) {
    console.log(`✓ Agent "${AGENT_SLUG}" already exists, skipping creation.`);
    return;
  }
  
  const { error } = await supabase.from('agents').insert({
    slug: AGENT_SLUG,
    name: 'Bagas',
    website: 'alhijaz.co/bagas',
    phone: '6281234567890',
    email: 'bagas@alhijaz.co',
    photo: `https://ui-avatars.com/api/?name=Bagas&background=10b981&color=fff&size=200`,
    password: hashedPassword,
    role: 'admin',
  });
  
  if (error) {
    console.error('✗ Failed to create agent:', error.message);
    process.exit(1);
  }
  console.log(`✓ Agent "${AGENT_SLUG}" created (password: ${AGENT_PASSWORD})`);
}

// ── Step 2: Seed dummy jamaah data ──
async function seedJamaah() {
  const now = new Date().toISOString();
  
  // Indonesian names for realistic dummy data
  const names = [
    { nama: 'Ahmad Fauzi', jk: 'L', wa: '6281234500001' },
    { nama: 'Siti Aisyah', jk: 'P', wa: '6281234500002' },
    { nama: 'Muhammad Rizki', jk: 'L', wa: '6281234500003' },
    { nama: 'Fatimah Zahra', jk: 'P', wa: '6281234500004' },
    { nama: 'Abdul Rahman', jk: 'L', wa: '6281234500005' },
    { nama: 'Nur Hasanah', jk: 'P', wa: '6281234500006' },
    { nama: 'Hasan Basri', jk: 'L', wa: '6281234500007' },
    { nama: 'Dewi Kartika', jk: 'P', wa: '6281234500008' },
    { nama: 'Umar Faruq', jk: 'L', wa: '6281234500009' },
    { nama: 'Rina Susanti', jk: 'P', wa: '6281234500010' },
    { nama: 'Bambang Setiawan', jk: 'L', wa: '6281234500011' },
    { nama: 'Yuliana Putri', jk: 'P', wa: '6281234500012' },
    { nama: 'Agus Salim', jk: 'L', wa: '6281234500013' },
    { nama: 'Nurul Hidayah', jk: 'P', wa: '6281234500014' },
    { nama: 'Budi Santoso', jk: 'L', wa: '6281234500015' },
    { nama: 'Aminah Lubis', jk: 'P', wa: '6281234500016' },
    { nama: 'Ridwan Kamil', jk: 'L', wa: '6281234500017' },
    { nama: 'Sri Wahyuni', jk: 'P', wa: '6281234500018' },
    { nama: 'Dedi Mulyadi', jk: 'L', wa: '6281234500019' },
    { nama: 'Fitri Handayani', jk: 'P', wa: '6281234500020' },
    { nama: 'Irfan Hakim', jk: 'L', wa: '6281234500021' },
    { nama: 'Lestari Dewi', jk: 'P', wa: '6281234500022' },
    { nama: 'Rahmat Hidayat', jk: 'L', wa: '6281234500023' },
    { nama: 'Kartini Wulandari', jk: 'P', wa: '6281234500024' },
    { nama: 'Syamsul Arifin', jk: 'L', wa: '6281234500025' },
  ];
  
  const pakets = [
    'UMROH REGULER 9 HARI',
    'UMROH REGULER 12 HARI',
    'UMROH PLUS TURKI 12 HARI',
    'UMROH PLUS ISTANBUL 14 HARI',
    'UMROH PROMO 9 HARI',
  ];
  
  const hargaPerPaket = {
    'UMROH REGULER 9 HARI': 28000000,
    'UMROH REGULER 12 HARI': 33000000,
    'UMROH PLUS TURKI 12 HARI': 42000000,
    'UMROH PLUS ISTANBUL 14 HARI': 48000000,
    'UMROH PROMO 9 HARI': 23000000,
  };

  // Departure dates spanning 1447 Hijriah year
  const departureDates = [
    '2025-08-15', '2025-09-20', '2025-10-10', '2025-11-05',
    '2025-12-18', '2026-01-12', '2026-02-08', '2026-03-15',
    '2026-04-20', '2026-05-10',
  ];
  
  // Registration dates (a few months before departure)
  function regDate(depDate) {
    const d = new Date(depDate);
    d.setMonth(d.getMonth() - Math.floor(Math.random() * 4 + 1));
    return d.toISOString().slice(0, 10);
  }
  
  function birthDate() {
    const year = 1960 + Math.floor(Math.random() * 40); // 1960-1999
    const month = String(Math.floor(Math.random() * 12) + 1).padStart(2, '0');
    const day = String(Math.floor(Math.random() * 28) + 1).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  const rows = names.map((person, i) => {
    const paket = pakets[i % pakets.length];
    const harga = hargaPerPaket[paket];
    const tglBerangkat = departureDates[i % departureDates.length];
    
    // Vary payment status: ~60% lunas, ~25% sebagian, ~15% belum bayar
    let bayar, sisa;
    const chance = Math.random();
    if (chance < 0.6) {
      bayar = harga; sisa = 0; // Lunas
    } else if (chance < 0.85) {
      bayar = Math.floor(harga * (0.3 + Math.random() * 0.5)); // 30-80% paid
      sisa = harga - bayar;
    } else {
      bayar = 0; sisa = harga; // Belum bayar
    }

    return {
      agent_slug: AGENT_SLUG,
      id_umroh: `DUMMY-${String(i + 1).padStart(3, '0')}`,
      nama: person.nama,
      jk: person.jk,
      wa: person.wa,
      tgl_lahir: birthDate(),
      paket: paket,
      bayar: bayar,
      sisa: sisa,
      tgl_berangkat: tglBerangkat,
      tgl_daftar: regDate(tglBerangkat),
      hijriah_year: '1447',
      perlengkapan: {
        koper: Math.random() > 0.3,
        baju_ihrom: Math.random() > 0.4,
        mukena: person.jk === 'P' ? Math.random() > 0.3 : false,
        sajadah: Math.random() > 0.5,
        tas_jinjing: Math.random() > 0.4,
      },
      dokumen: {
        paspor: Math.random() > 0.2,
        visa: Math.random() > 0.4,
        foto: Math.random() > 0.3,
        surat_mahrom: person.jk === 'P' ? Math.random() > 0.5 : false,
      },
      no_paspor: Math.random() > 0.3 ? `B${String(Math.floor(Math.random() * 9000000) + 1000000)}` : null,
      paspor_expired: Math.random() > 0.3 ? `202${7 + Math.floor(Math.random() * 3)}-${String(Math.floor(Math.random() * 12) + 1).padStart(2, '0')}-${String(Math.floor(Math.random() * 28) + 1).padStart(2, '0')}` : null,
      raw_data: null,
      synced_at: now,
    };
  });

  // Delete existing dummy data for this agent
  const { error: delError } = await supabase
    .from('jamaah')
    .delete()
    .eq('agent_slug', AGENT_SLUG);
  if (delError) console.warn('Warning deleting old data:', delError.message);

  // Insert new data
  const { error } = await supabase
    .from('jamaah')
    .insert(rows);
  
  if (error) {
    console.error('✗ Failed to seed jamaah:', error.message);
    process.exit(1);
  }
  console.log(`✓ Seeded ${rows.length} jamaah records for agent "${AGENT_SLUG}"`);
}

// ── Run ──
async function main() {
  console.log('\n🌱 Seeding agent "bagas" with dummy data...\n');
  await createAgent();
  await seedJamaah();
  console.log('\n✅ Done! Login with:');
  console.log(`   Username: ${AGENT_SLUG}`);
  console.log(`   Password: ${AGENT_PASSWORD}\n`);
}

main().catch(err => {
  console.error('Seed error:', err);
  process.exit(1);
});
