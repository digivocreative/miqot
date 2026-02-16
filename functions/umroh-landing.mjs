/**
 * Umroh Landing Page – Plain JS module for Node.js (server.js)
 * Source of truth: functions/[slug]/umroh.ts (Cloudflare/Vite dev)
 * This file mirrors the TS version but without type annotations.
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const AGENTS = {
  'bagas':       { name: 'Bagas Pramudita',     phone: '6287878573311', website: 'alhijaz.co',                  photo: '/agents/bagas.jpg' },
  'nikita':      { name: 'Nikita',              phone: '62822900020',   website: 'alhijazindonesia.com',        photo: '/agents/nikita.jpg' },
  'nila':        { name: 'Nila Novita Sari',    phone: '6285211209049', website: 'alhijaztourtravels.com',      photo: '/agents/nila.jpg' },
  'andra':       { name: 'Andra Olivia',        phone: '628129909795',  website: 'travelalhijazwisata.com',     photo: '/agents/andra.jpg' },
  'dyah':        { name: 'Dyah Ratna Witri',    phone: '6281385975678', website: 'alhijaztraveltours.com',      photo: '/agents/dyah.jpg' },
  'widi':        { name: 'Widi Purwanti',       phone: '6287820813228', website: 'alhijaz-hajiumroh.com',       photo: '/agents/widi.jpg' },
  'aulia':       { name: 'Aulia',               phone: '6282110407229', website: 'alhijazumrohtravel.com',      photo: '/agents/aulia.jpg' },
  'selfiah':     { name: 'Selfiah Handayani',   phone: '6281410478212', website: 'alhijaztourtravel.co.id',     photo: '/agents/selfiah.jpg' },
  'zakia':       { name: 'Rahima Zakia',        phone: '6285158005623', website: 'alhijazbirowisata.com',       photo: '/agents/zakia.jpg' },
  'dianwahyuni': { name: 'Dian Wahyuni',        phone: '6283197968407', website: 'alhijazindowisatatours.com', photo: '/agents/dianwahyuni.jpg' },
  'anne':        { name: 'Anne Suryani',        phone: '628129953424',  website: 'hajialhijaz.com',             photo: '/agents/anne.jpg' },
  'evi':         { name: 'Evi Chaniago',        phone: '6281806742789', website: 'alhijazbirohajiumroh.com',    photo: '/agents/evi.jpg' },
  'yenita':      { name: 'Yenita',              phone: '6281316803128', website: 'alhijazumrahtravel.com',      photo: '/agents/yenita.jpg' },
  'indah':       { name: 'Indah Permata',       phone: '6281943631008', website: 'alhijaztraveltour.com',       photo: '/agents/indah.jpg' },
  'aisyah':      { name: 'Siti Aisyah',         phone: '6281225600900', website: 'travelalhijazumrah.com',      photo: '/agents/aisyah.jpg' },
  'siska':       { name: 'Siska Fadia',         phone: '6281188885291', website: 'alhijazumroh.com',            photo: '/agents/siska.jpg' },
  'linda':       { name: 'Nurlinda Dewi',       phone: '6282112094089', website: 'alhijazcallcenter.com',       photo: '/agents/linda.jpg' },
  'nina':        { name: 'Nina',                phone: '6285943191075', website: 'alhijazumrahtours.com',       photo: '/agents/nina.jpg' },
  'sari':        { name: 'Sari',                phone: '6281907018220', website: 'alhijaz.co/sari',             photo: '/agents/sari.jpg' },
  'isti':        { name: 'Isti',                phone: '6281315002460', website: 'al-hijaztravelumroh.com',     photo: '/agents/isti.jpg' },
  'ferra':       { name: 'Ferra',               phone: '62811802789',  website: 'alhijaztourtravel.id',        photo: '/agents/ferra.jpg' },
  'jan-praba':   { name: 'Jan Praba',           phone: '62816728940',  website: 'alhijaz.co/jan-praba',        photo: '/agents/jan-praba.jpg' },
  'ekawati':     { name: 'Ekawati',             phone: '62816728904',  website: 'alhijaz.co/ekawati',          photo: '/agents/ekawati.jpg' },
};
const DEFAULT_PHONE = '62822900020';

function formatPhone(phone) {
  const local = '0' + phone.slice(2);
  return local.slice(0, 4) + '-' + local.slice(4, 8) + '-' + local.slice(8);
}

const WA_SVG = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>`;
const WA_SVG_SMALL = `<svg viewBox="0 0 24 24" fill="#25D366" style="width:14px;height:14px;vertical-align:middle;margin-right:3px"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>`;

const PAKET_LIST = [
  {
    nama: 'Promo Umroh Akbar',
    badge: '🔥 SEAT TERBATAS',
    featured: true,
    keberangkatan: '20 Juni 2026',
    harga: 'Rp 28 Juta-an',
    durasi: '9 Hari',
    airline: 'Saudi Airlines',
    hotelMekkah: '⭐⭐⭐⭐ Grand Al Massa / Setaraf',
    hotelMadinah: '⭐⭐⭐ ODST Al Madina / Setaraf',
    include: ['Perlengkapan', 'Handling Bandara', 'Makan 3x Sehari', 'Visa Umroh', 'FREE Ayam Al-Baik', 'FREE Zamzam 5L'],
    ctaText: 'Assalamualaikum%2C%20Saya%20mau%20tanya%20paket%20Promo%20Umroh%20Akbar%20(20%20Juni%202026)%20di%20Alhijaz',
    dateKey: 'promo-akbar',
  },
  {
    nama: 'Umroh Plus Haikou (China)',
    badge: '✈️ PLUS CHINA',
    keberangkatan: 'Agustus 2026',
    harga: 'Rp 29 Juta-an',
    durasi: '11 Hari',
    airline: 'Loong Air',
    hotelMekkah: '⭐⭐⭐⭐ Grand Al Massa / Setaraf',
    hotelMadinah: '⭐⭐⭐ ODST Al Madina / Setaraf',
    include: ['Perlengkapan', 'Handling Bandara', 'Makan 3x Sehari', 'Visa Umroh', 'FREE Ayam Al-Baik', 'FREE Zamzam 5L'],
    ctaText: 'Assalamualaikum%2C%20Saya%20mau%20tanya%20paket%20Umroh%20Plus%20Hainan%20(Haikou)%20China%20di%20Alhijaz',
    dateKey: 'haikou',
  },
  {
    nama: 'Umroh Reguler',
    keberangkatan: 'Juni – Oktober 2026',
    harga: 'Rp 31 Juta-an',
    durasi: '9 Hari',
    airline: 'Garuda Indonesia / Saudi Airlines',
    hotelMekkah: '⭐⭐⭐⭐⭐ Pullman ZamZam / Setaraf',
    hotelMadinah: '⭐⭐⭐⭐⭐ Maden & ⭐⭐⭐⭐ Al Ritz Al Madina',
    highlight: 'Tersedia pilihan Full Hotel Bintang 5',
    include: ['Perlengkapan', 'Handling Bandara', 'Makan 3x Sehari', 'Visa Umroh', 'FREE Ayam Al-Baik', 'FREE Zamzam 5L'],
    ctaText: 'Assalamualaikum%2C%20Saya%20mau%20tanya%20paket%20Umroh%20Reguler%20di%20Alhijaz',
    dateKey: 'reguler',
  },
  {
    nama: 'Umroh Plus Thaif',
    badge: '🕌 PLUS THAIF',
    keberangkatan: 'Juni – Oktober 2026',
    harga: 'Rp 32 Juta-an',
    durasi: '9, 10 & 12 Hari',
    airline: 'Garuda Indonesia / Saudi Airlines',
    hotelMekkah: '⭐⭐⭐⭐⭐ Pullman ZamZam & ⭐⭐⭐⭐ Prestige',
    hotelMadinah: '⭐⭐⭐⭐⭐ Maden & ⭐⭐⭐⭐ Al Ritz Al Madina',
    include: ['Perlengkapan', 'Handling Bandara', 'Makan 3x Sehari', 'FREE Ayam Al-Baik', 'FREE Zamzam 5L', 'Handling Lengkap'],
    ctaText: 'Assalamualaikum%2C%20Saya%20mau%20tanya%20paket%20Umroh%20Plus%20Thaif%20di%20Alhijaz',
    dateKey: 'thaif',
  },
  {
    nama: 'Umroh Plus Istanbul & Cappadocia',
    badge: '🇹🇷 PLUS TURKI',
    keberangkatan: 'Juni – Oktober 2026',
    harga: 'Rp 37 Juta-an',
    durasi: '12, 13 & 15 Hari',
    airline: 'Saudi Airlines',
    hotelMekkah: '⭐⭐⭐⭐⭐ Pullman ZamZam',
    hotelMadinah: '⭐⭐⭐⭐⭐ Maden',
    hotelLain: 'La Quinta By Wyndham (Istanbul) · DoubleTree by Hilton (Bursa) · Ramada (Cappadocia)',
    include: ['Perlengkapan', 'Handling Bandara', 'Makan 3x Sehari', 'Visa Umroh', 'FREE Ayam Al-Baik', 'FREE Zamzam 5L'],
    ctaText: 'Assalamualaikum%2C%20Saya%20mau%20tanya%20paket%20Umroh%20Plus%20Istanbul-Cappadocia%20di%20Alhijaz',
    dateKey: 'turkey',
  },
  {
    nama: 'Umroh Plus Cairo & Alexandria',
    badge: '🇪🇬 PLUS MESIR',
    keberangkatan: 'Juni – Oktober 2026',
    harga: 'Rp 41 Juta-an',
    durasi: '12 Hari',
    airline: 'Saudi Airlines',
    hotelMekkah: '⭐⭐⭐⭐ Prestige Ex Elaf',
    hotelMadinah: '⭐⭐⭐⭐ Al Ritz Al Madina',
    hotelLain: 'Taiba Pyramid ⭐⭐⭐⭐ (Cairo)',
    include: ['Perlengkapan', 'Handling Bandara', 'Makan 3x Sehari', 'Visa Umroh', 'FREE Ayam Al-Baik', 'FREE Zamzam 5L'],
    ctaText: 'Assalamualaikum%2C%20Saya%20mau%20tanya%20paket%20Umroh%20Plus%20Cairo-Alexandria%20di%20Alhijaz',
    dateKey: 'cairo',
  },
];

function buildCard(p, phone, dates) {
  const url = `https://api.whatsapp.com/send?phone=${phone}&text=${p.ctaText}`;
  const tanggal = dates[p.dateKey] || [];
  const datePills = tanggal.map(t => `<span class="date-pill">${t}</span>`).join('');
  return `
  <div class="card${p.featured ? ' card--promo' : ''}" data-anim>
    <div class="card__head">
      ${p.badge ? `<span class="badge${p.featured ? ' badge--gold' : ''}">${p.badge}</span>` : ''}
      <h3 class="card__name">${p.nama}</h3>
      <div class="card__price">Mulai <strong>${p.harga}</strong></div>
    </div>
    ${tanggal.length ? `<div class="card__dates">
      <span class="card__dates-t">📅 Tanggal Tersedia:</span>
      <div class="date-pills">${datePills}</div>
    </div>` : ''}
    <table class="card__tbl">
      <tr><td class="tbl-label">✈️ Penerbangan</td><td class="tbl-val">${p.airline}</td></tr>
      <tr><td class="tbl-label">⏱️ Durasi</td><td class="tbl-val">${p.durasi}</td></tr>
      <tr><td class="tbl-label">🕋 Mekkah</td><td class="tbl-val">${p.hotelMekkah}</td></tr>
      <tr><td class="tbl-label">🕌 Madinah</td><td class="tbl-val">${p.hotelMadinah}</td></tr>
      ${p.hotelLain ? `<tr><td class="tbl-label">🏨 Hotel Lain</td><td class="tbl-val">${p.hotelLain}</td></tr>` : ''}
      ${p.highlight ? `<tr class="tbl-hl"><td class="tbl-label">⭐ Highlight</td><td class="tbl-val"><b>${p.highlight}</b></td></tr>` : ''}
    </table>
    <div class="card__inc">
      <div class="tags">${p.include.map(i => `<span class="tag">${i}</span>`).join('')}</div>
    </div>
    <a href="${url}" target="_blank" rel="noopener" class="btn btn--card">${WA_SVG} Tanya Paket Ini</a>
  </div>`;
}

export function generateHTML(slug) {
  const agent = AGENTS[slug];
  const phone = agent?.phone || DEFAULT_PHONE;
  const website = agent?.website || 'alhijaz.co';
  const agentName = agent?.name || 'Alhijaz';
  const agentPhoto = agent?.photo || '/agents/nikita.jpg';
  const waGeneral = `https://api.whatsapp.com/send?phone=${phone}&text=Assalamualaikum%2C%20Saya%20mau%20tanya%20paket%20Umroh%20di%20Alhijaz`;

  // Read available dates from JSON (generated by scripts/sync-umroh-dates.mjs)
  let dates = {};
  try {
    const jsonPath = resolve(__dirname, 'umroh-dates.json');
    dates = JSON.parse(readFileSync(jsonPath, 'utf-8')).packages || {};
  } catch {
    console.warn('[umroh-landing] umroh-dates.json not found, using empty dates');
  }
  const cards = PAKET_LIST.map(p => buildCard(p, phone, dates)).join('');

  return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Paket Umroh 2026${agentName ? ` — ${agentName}` : ''} | Alhijaz Indowisata</title>
<meta name="description" content="Paket Umroh Pasti Berangkat mulai Rp 28 Juta. Travel Akreditasi A, Resmi Kemenag RI. PT Alhijaz Indowisata — 10.000+ jamaah per tahun.">
<meta property="og:title" content="Umroh Pasti Berangkat — Mulai 28 Juta | Alhijaz">
<meta property="og:description" content="Paket Umroh Juni–Oktober 2026. Akreditasi A, Resmi Kemenag RI. Direct Flight, Hotel Dekat Masjid.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Playfair+Display:ital,wght@0,700;0,800;1,700&display=swap" rel="stylesheet">
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html{scroll-behavior:smooth;-webkit-text-size-adjust:100%}
body{font-family:'Plus Jakarta Sans',sans-serif;color:#1E293B;background:#F8FAFB;line-height:1.6;-webkit-font-smoothing:antialiased;padding-bottom:76px}
a{text-decoration:none;color:inherit}ul{list-style:none}
:root{
  --r900:#1A0505;--r800:#3B0F0F;--r700:#6B1E1E;--r600:#8B2D2D;--r500:#A83838;--r400:#C45050;--r50:#FDF2F2;
  --gold:#C8A951;--gold-d:#A68523;--gold-l:#E8D9A0;--gold-bg:#FFFCF0;
  --w:#FFF;--b50:#F8FAFB;--b100:#F1F5F9;--b200:#E2E8F0;--b300:#CBD5E1;--b500:#64748B;--b700:#334155;--b900:#0F172A;
  --serif:'Playfair Display',Georgia,serif;--mx:480px;--r:16px;--rs:10px;
  --sh:0 4px 20px rgba(0,0,0,.06);--sh-lg:0 10px 36px rgba(0,0,0,.10);
}
.wrap{max-width:var(--mx);margin:0 auto;padding:0 20px}

/* ── GEO PATTERN ── */
.geo{position:absolute;inset:0;opacity:.05;pointer-events:none;
  background-image:linear-gradient(30deg,var(--gold) 12%,transparent 12.5%,transparent 87%,var(--gold) 87.5%),linear-gradient(150deg,var(--gold) 12%,transparent 12.5%,transparent 87%,var(--gold) 87.5%),linear-gradient(30deg,var(--gold) 12%,transparent 12.5%,transparent 87%,var(--gold) 87.5%),linear-gradient(150deg,var(--gold) 12%,transparent 12.5%,transparent 87%,var(--gold) 87.5%),linear-gradient(60deg,var(--gold-l) 25%,transparent 25.5%,transparent 75%,var(--gold-l) 75%),linear-gradient(60deg,var(--gold-l) 25%,transparent 25.5%,transparent 75%,var(--gold-l) 75%);
  background-size:56px 97px;background-position:0 0,0 0,28px 48px,28px 48px,0 0,28px 48px}

/* ── HERO ── */
.hero{position:relative;background:linear-gradient(175deg,#FFFDF7 0%,#F0EBE0 20%,#D4CEBC 40%,#8FB88A 65%,#2D7A4A 82%,#0D3B2C 100%);padding:64px 20px 56px;text-align:center;overflow:hidden}
.hero::after{content:'';position:absolute;top:20%;left:50%;transform:translateX(-50%);width:300px;height:300px;background:radial-gradient(circle,rgba(255,253,247,.15) 0%,transparent 70%);pointer-events:none}
.hero .geo{opacity:.03}
.hero__in{position:relative;z-index:2;max-width:var(--mx);margin:0 auto}
.hero__kicker{display:inline-block;font-size:10.5px;font-weight:700;letter-spacing:2.5px;text-transform:uppercase;color:#8B6914;margin-bottom:16px;padding:6px 16px;background:rgba(184,148,31,.1);border:1px solid rgba(184,148,31,.2);border-radius:100px}
.hero h1{font-family:var(--serif);font-size:40px;font-weight:800;color:#0D2818;line-height:1.12;margin-bottom:20px}
.hero h1 span{color:var(--gold-d);display:block;font-style:italic}
.hero__sub{font-size:13px;color:#4A5B4E;line-height:1.7;margin-bottom:28px;max-width:340px;margin-left:auto;margin-right:auto}
.hero__stats{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:32px;max-width:360px;margin-left:auto;margin-right:auto}
.hero__stat{text-align:center;padding:14px 4px;background:rgba(255,255,255,.8);border-radius:12px;backdrop-filter:blur(8px);border:1px solid rgba(27,94,58,.15);box-shadow:0 2px 12px rgba(0,0,0,.04)}
.hero__stat-val{font-family:var(--serif);font-size:21px;font-weight:800;color:#1B5E3A;display:block;line-height:1.1}
.hero__stat-label{font-size:9.5px;font-weight:700;color:#5A6B5E;margin-top:4px;display:block;text-transform:uppercase;letter-spacing:.5px}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:10px;font-family:inherit;font-weight:700;border:none;cursor:pointer;border-radius:var(--rs);transition:transform .15s,box-shadow .15s}
.btn:active{transform:scale(.97)}
.btn svg{width:20px;height:20px;flex-shrink:0}
.btn--hero{background:linear-gradient(135deg,#25D366,#1DA855);color:var(--w);font-size:16px;padding:16px 32px;width:100%;max-width:380px;box-shadow:0 4px 24px rgba(37,211,102,.35);border-radius:14px}
.btn--hero:hover{transform:translateY(-1px);box-shadow:0 8px 30px rgba(37,211,102,.4)}
.hero__micro{margin-top:12px;font-size:11.5px;color:rgba(255,255,255,.75);font-weight:500}
.hero__legal{margin-top:18px;font-size:10.5px;color:rgba(255,255,255,.45);letter-spacing:.3px}

@keyframes fade-up{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:none}}
.hero__in>*{animation:fade-up .65s cubic-bezier(.16,1,.3,1) both}
.hero__in>:nth-child(1){animation-delay:.1s}.hero__in>:nth-child(2){animation-delay:.15s}.hero__in>:nth-child(3){animation-delay:.2s}.hero__in>:nth-child(4){animation-delay:.25s}.hero__in>:nth-child(5){animation-delay:.3s}.hero__in>:nth-child(6){animation-delay:.35s}.hero__in>:nth-child(7){animation-delay:.4s}.hero__in>:nth-child(8){animation-delay:.45s}

/* ── SOCIAL PROOF ── */
.proof{background:var(--w);border-bottom:1px solid var(--b200);padding:16px 20px}
.proof__in{max-width:var(--mx);margin:0 auto;display:flex;gap:8px 16px;align-items:center;justify-content:center;flex-wrap:wrap;font-size:12.5px;color:var(--b700);font-weight:500;text-align:center}
.proof__sep{color:var(--b300);display:none}
@media(min-width:640px){.proof__sep{display:inline}}

/* ── SECTION COMMON ── */
.sec{padding:44px 20px}
.sec__label{font-size:11px;font-weight:700;color:var(--gold-d);text-transform:uppercase;letter-spacing:1.5px;margin-bottom:6px;text-align:center}
.sec__title{font-family:var(--serif);font-size:28px;font-weight:700;color:var(--r900);line-height:1.28;margin-bottom:20px;text-align:center}
.sec__desc{font-size:14px;color:var(--b500);text-align:center;margin-bottom:28px;line-height:1.6}

/* ── CARDS ── */
.cards{max-width:var(--mx);margin:0 auto;display:flex;flex-direction:column;gap:18px}
.card{position:relative;background:var(--w);border-radius:16px;overflow:hidden;box-shadow:var(--sh);border:1px solid var(--b200);transition:transform .25s,box-shadow .25s}
.card:hover{transform:translateY(-2px);box-shadow:var(--sh-lg)}
.card--promo{background:linear-gradient(170deg,var(--gold-bg),var(--w) 50%);border:2px solid var(--gold);box-shadow:0 4px 20px rgba(200,169,81,.2)}
.card__head{padding:24px 20px 18px;background:linear-gradient(135deg,#D5F0D5 0%,#E8F5E9 40%,#F5FBF5 100%);border-bottom:1px solid #B8DDB8}
.card--promo .card__head{background:linear-gradient(135deg,#FFF0C8 0%,#FFF8E7 40%,#FFFDF5 100%);border-bottom:1px solid #E8D48A}
.badge{display:inline-block;font-size:10px;font-weight:700;padding:5px 14px;border-radius:100px;background:#1B5E3A;color:#fff;margin-bottom:10px;letter-spacing:.3px;border:none}
.badge--gold{background:linear-gradient(135deg,var(--gold),var(--gold-d));color:var(--w);box-shadow:0 2px 8px rgba(200,169,81,.3);border:none}
.card__name{font-family:var(--serif);font-size:22px;font-weight:700;color:#0D2818;margin-bottom:6px;line-height:1.25}
.card--promo .card__name{color:var(--r900)}
.card__price{font-size:14px;color:#3D5A45}
.card__price strong{font-size:24px;font-weight:800;color:#0F6B30}
.card--promo .card__price strong{color:var(--gold-d)}
.card__dates{padding:14px 20px;border-bottom:1px solid var(--b200)}
.card__dates-t{font-size:11.5px;font-weight:600;color:#1B5E3A;display:block;margin-bottom:8px}
.date-pills{display:flex;flex-wrap:wrap;gap:5px}
.date-pill{font-size:11px;font-weight:600;padding:4px 11px;border-radius:100px;background:#EFF8EF;color:#1B5E3A;border:1px solid #C6E6C6}
.card__tbl{width:100%;border-collapse:collapse;margin:0;font-size:12.5px}
.card__tbl tr{border-bottom:1px solid #F0F0F0}
.card__tbl tr:last-child{border-bottom:none}
.card__tbl td{padding:12px 20px;vertical-align:top}
.tbl-label{width:110px;white-space:nowrap;color:#1B5E3A;font-weight:600;font-size:12px}
.tbl-val{color:var(--b700);line-height:1.5}
.tbl-hl td{background:#FFF8E7;padding:14px 20px}
.card__inc{margin:4px 20px 16px;background:linear-gradient(135deg,#F0F9F0,#E8F5E9);border-radius:var(--rs);padding:14px;border:1px solid #C8E6C9}
.tags{display:grid;grid-template-columns:1fr 1fr;gap:6px}
.tag{font-size:11px;font-weight:600;padding:6px 10px;border-radius:8px;background:#fff;color:#2E7D4F;border:1px solid #A5D6A7;display:flex;align-items:center;gap:5px}
.tag::before{content:'✓';font-size:10px;font-weight:800;color:#25D366}
.btn--card{display:flex;align-items:center;justify-content:center;gap:8px;margin:0 20px 20px;padding:14px 18px;border-radius:12px;font-size:14.5px;font-weight:700;background:linear-gradient(135deg,#25D366,#128C7E);color:#fff;box-shadow:0 4px 14px rgba(37,211,102,.3);transition:transform .2s,box-shadow .2s}
.btn--card svg{width:18px;height:18px;flex-shrink:0}
.btn--card:hover{transform:translateY(-1px);box-shadow:0 6px 20px rgba(37,211,102,.4)}
.card--promo .btn--card{background:linear-gradient(135deg,var(--gold-d),var(--gold));box-shadow:0 3px 12px rgba(200,169,81,.28)}

/* ── TRUST ── */
.trust{padding:52px 20px;background:linear-gradient(180deg,#F8FBF8 0%,#EDF5ED 100%);position:relative;overflow:hidden}
.trust .sec__label{color:#1B5E3A}
.trust .sec__title{color:#1A3A2A}
.trust-grid{max-width:var(--mx);margin:0 auto;display:grid;grid-template-columns:1fr 1fr;gap:12px}
.trust-card{background:var(--w);border:1px solid #E0EAE0;border-radius:14px;padding:20px 14px;text-align:center;box-shadow:0 2px 12px rgba(27,94,58,.06);transition:transform .2s,box-shadow .2s}
.trust-card:hover{transform:translateY(-2px);box-shadow:0 6px 20px rgba(27,94,58,.1)}
.trust-card .ic{display:flex;align-items:center;justify-content:center;width:44px;height:44px;border-radius:12px;background:linear-gradient(135deg,#E8F5E9,#C8E6C9);margin:0 auto 10px;font-size:22px}
.trust-card h4{font-size:13px;font-weight:700;color:#1A3A2A;margin-bottom:4px}
.trust-card p{font-size:11.5px;color:#6B7B6E;line-height:1.45}

/* ── CLOSING ── */
.closing{padding:56px 20px;text-align:center;background:linear-gradient(135deg,#0D3B2C 0%,#145A3E 50%,#1B7A52 100%);position:relative;overflow:hidden}
.closing::before{content:'';position:absolute;top:-60px;right:-60px;width:200px;height:200px;background:radial-gradient(circle,rgba(37,211,102,.12) 0%,transparent 70%);pointer-events:none}
.closing::after{content:'';position:absolute;bottom:-40px;left:-40px;width:160px;height:160px;background:radial-gradient(circle,rgba(37,211,102,.08) 0%,transparent 70%);pointer-events:none}
.closing__in{max-width:var(--mx);margin:0 auto;position:relative;z-index:1}
.closing__icon{font-size:40px;margin-bottom:12px}
.closing h2{font-family:var(--serif);font-size:26px;font-weight:700;color:#fff;line-height:1.3;margin-bottom:10px}
.closing h2 em{font-style:italic;color:#25D366}
.closing p{font-size:14.5px;color:rgba(255,255,255,.7);margin-bottom:24px}
.closing .btn--hero{font-size:16px;padding:16px 40px;background:#fff;color:#0D3B2C;font-weight:700;border-radius:14px;box-shadow:0 4px 20px rgba(0,0,0,.2);transition:transform .2s,box-shadow .2s}
.closing .btn--hero:hover{transform:translateY(-2px);box-shadow:0 8px 30px rgba(0,0,0,.3)}
.closing .btn--hero svg{fill:#25D366}
.closing__hint{margin-top:16px;font-size:12.5px;color:rgba(255,255,255,.45)}

/* ── FOOTER ── */
footer{background:#091F18;padding:36px 20px 28px;text-align:center;border-top:3px solid #25D366}
footer .wrap{max-width:var(--mx);margin:0 auto}
.footer__brand{font-family:var(--serif);font-size:18px;font-weight:700;color:#fff;margin-bottom:4px}
.footer__tagline{font-size:11px;color:#25D366;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:18px}
.footer__info{display:flex;flex-direction:column;gap:6px;margin-bottom:16px}
.footer__info p{font-size:12px;color:rgba(255,255,255,.5);line-height:1.6;margin:0}
.footer__legal{padding-top:16px;border-top:1px solid rgba(255,255,255,.08);font-size:10.5px;color:rgba(255,255,255,.25)}

/* ── STICKY BAR ── */
.sticky{position:fixed;bottom:0;left:0;right:0;z-index:999;background:rgba(255,255,255,.96);backdrop-filter:blur(12px);border-top:1px solid var(--b200);padding:10px 16px;transform:translateY(100%);transition:transform .4s cubic-bezier(.16,1,.3,1)}
.sticky.show{transform:none}
.sticky__in{max-width:var(--mx);margin:0 auto;display:flex;align-items:center;gap:12px}
.sticky__avatar{position:relative;width:40px;height:40px;flex-shrink:0}
.sticky__avatar img{width:40px;height:40px;border-radius:50%;object-fit:cover;border:2px solid #E8F5E9}
.sticky__badge{position:absolute;bottom:-1px;right:-1px;width:16px;height:16px;border-radius:50%;background:#fff;display:flex;align-items:center;justify-content:center;box-shadow:0 1px 3px rgba(0,0,0,.1)}
.sticky__text{flex:1;min-width:0}
.sticky__text strong{font-size:13.5px;color:var(--r900);display:block;line-height:1.3}
.sticky__text p{font-size:11px;color:#25D366;font-weight:600}
.btn--sticky{padding:11px 22px;border-radius:12px;font-size:13.5px;background:linear-gradient(135deg,#25D366,#1DA855);color:var(--w);white-space:nowrap;box-shadow:0 2px 10px rgba(37,211,102,.25)}

/* ── FAB ── */
.fab{position:fixed;bottom:20px;right:16px;z-index:998;width:56px;height:56px;background:#25D366;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 18px rgba(37,211,102,.4);transition:opacity .3s,transform .3s;animation:glow 2.5s infinite}
.fab svg{width:28px;height:28px;fill:var(--w)}
.fab.hide{opacity:0;transform:scale(.5);pointer-events:none}
@keyframes glow{0%,100%{box-shadow:0 4px 18px rgba(37,211,102,.4)}50%{box-shadow:0 4px 28px rgba(37,211,102,.6)}}

/* ── SCROLL ANIM ── */
[data-anim]{opacity:0;transform:translateY(20px);transition:opacity .6s cubic-bezier(.16,1,.3,1),transform .6s cubic-bezier(.16,1,.3,1)}
[data-anim].vis{opacity:1;transform:none}

/* ── RESPONSIVE ── */
@media(min-width:640px){:root{--mx:560px}.hero h1{font-size:44px}.hero{padding:68px 28px 56px}.hero__stats{max-width:400px}.sec{padding:52px 28px}.card{padding:28px 24px}}
@media(min-width:1024px){:root{--mx:640px}.hero h1{font-size:52px}.cards{display:grid;grid-template-columns:1fr 1fr;gap:20px}}
</style>
</head>
<body>

<!-- HERO -->
<section class="hero">
  <div class="geo"></div>
  <div class="hero__in">
    <p class="hero__kicker">Saatnya Menjawab Panggilan-Nya</p>
    <h1>Umroh 28 Juta.<span>Pasti Berangkat.</span></h1>
    <p class="hero__sub">Keberangkatan Juni–Oktober 2026 · Direct Flight · Hotel Dekat Masjid · Travel Akreditasi "A"</p>
    <div class="hero__stats">
      <div class="hero__stat"><span class="hero__stat-val">"A"</span><span class="hero__stat-label">Akreditasi</span></div>
      <div class="hero__stat"><span class="hero__stat-val">10.000+</span><span class="hero__stat-label">Jamaah/Thn</span></div>
      <div class="hero__stat"><span class="hero__stat-val">20+</span><span class="hero__stat-label">Thn Pengalaman</span></div>
    </div>
    <a href="${waGeneral}" target="_blank" rel="noopener" class="btn btn--hero">${WA_SVG} Konsultasi via WhatsApp</a>
    <p class="hero__micro">Gratis konsultasi · Tanpa komitmen</p>
    <p class="hero__legal">PPIU U.490 · PIHK 304 · Izin Resmi Kemenag RI</p>
  </div>
</section>

<!-- SOCIAL PROOF -->
<section class="proof" data-anim>
  <div class="proof__in">
    <span>⭐ 4.9 Rating Google</span>
    <span class="proof__sep">·</span>
    <span>🕋 10.000+ Jamaah/Thn</span>
  </div>
</section>

<!-- PAKET -->
<section class="sec" id="paket">
  <div class="sec__label" data-anim>Pilihan Paket 2026</div>
  <h2 class="sec__title" data-anim>Pilih Paket Sesuai Kebutuhan Anda</h2>
  <p class="sec__desc" data-anim>Semua paket sudah termasuk tiket pesawat, hotel, makan 3× sehari, perlengkapan, dan handling. Tanggal berangkat pasti.</p>
  <div class="cards">${cards}</div>
</section>

<!-- TRUST -->
<section class="trust">
  <div class="sec__label" data-anim>MENGAPA ALHIJAZ?</div>
  <h2 class="sec__title" data-anim>Travel Umroh yang Bisa<br>Anda Percaya</h2>
  <div class="trust-grid" data-anim>
    <div class="trust-card"><div class="ic">🏅</div><h4>Akreditasi "A"</h4><p>Standar tertinggi dari KAN</p></div>
    <div class="trust-card"><div class="ic">📋</div><h4>Resmi Kemenag RI</h4><p>PPIU & PIHK aktif dan diawasi</p></div>
    <div class="trust-card"><div class="ic">🕌</div><h4>Hotel Dekat Masjid</h4><p>Lokasi Ring 1, menit dari Haram & Nabawi</p></div>
    <div class="trust-card"><div class="ic">🏢</div><h4>Gedung Milik Sendiri</h4><p>4 lantai di Cawang, Jakarta Timur</p></div>
    <div class="trust-card"><div class="ic">✈️</div><h4>Direct Flight</h4><p>Penerbangan langsung tanpa transit</p></div>
    <div class="trust-card"><div class="ic">👥</div><h4>10.000+ Jamaah/Tahun</h4><p>Pengalaman besar, sistem teruji</p></div>
  </div>
</section>

<!-- CLOSING CTA -->
<section class="closing" data-anim>
  <div class="closing__in">
    <div class="closing__icon">🕋</div>
    <h2>Niat Sudah Ada,<br>Tinggal <em>Satu Langkah Lagi.</em></h2>
    <p>Kursi terbatas untuk setiap keberangkatan. Jangan tunda lagi.</p>
    <a href="${waGeneral}" target="_blank" rel="noopener" class="btn btn--hero">${WA_SVG} Konsultasi via WhatsApp</a>
    <p class="closing__hint">Konsultasi gratis, tanpa komitmen.</p>
  </div>
</section>

<!-- FOOTER -->
<footer>
  <div class="wrap">
    <div class="footer__brand">PT Alhijaz Indowisata</div>
    <div class="footer__tagline">Travel Umroh Terpercaya Sejak 2000</div>
    <div class="footer__info">
      <p>📍 Jl. Dewi Sartika No. 342, Cawang, Jakarta Timur</p>
      <p>📜 PPIU U.490 Tahun 2020 · PIHK 304 Tahun 2022</p>
      <p>${WA_SVG_SMALL} <a href="https://wa.me/${phone}" style="color:rgba(255,255,255,.7);text-decoration:none">${formatPhone(phone)}</a> · 🌐 <a href="https://${website}" style="color:rgba(255,255,255,.7);text-decoration:none">${website}</a></p>
    </div>
    <div class="footer__legal">© 2026 PT Alhijaz Indowisata. All rights reserved.</div>
  </div>
</footer>

<!-- STICKY BAR -->
<div class="sticky" id="stickyBar">
  <div class="sticky__in">
    <div class="sticky__avatar">
      <img src="${agentPhoto}" alt="${agentName}" loading="lazy">
      <div class="sticky__badge"><svg width="12" height="12" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="12" fill="#1DA1F2"/><path d="M9.5 12.5L11 14L15 10" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
    </div>
    <div class="sticky__text">
      <strong>${agentName}</strong>
      <p>Konsultasi Gratis</p>
    </div>
    <a href="${waGeneral}" target="_blank" rel="noopener" class="btn btn--sticky">${WA_SVG} Chat WA</a>
  </div>
</div>

<!-- FAB -->
<a href="${waGeneral}" target="_blank" rel="noopener" class="fab" id="fab" aria-label="WhatsApp">
  <svg viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
</a>

<script>
(function(){
  var els=document.querySelectorAll('[data-anim]');
  if('IntersectionObserver' in window){
    var obs=new IntersectionObserver(function(e){e.forEach(function(en){if(en.isIntersecting){en.target.classList.add('vis');obs.unobserve(en.target)}})},{threshold:.1,rootMargin:'0px 0px -20px 0px'});
    els.forEach(function(el){obs.observe(el)});
  }else{els.forEach(function(el){el.classList.add('vis')})}
  var bar=document.getElementById('stickyBar'),fab=document.getElementById('fab'),hH=document.querySelector('.hero').offsetHeight,on=false;
  function chk(){var y=window.scrollY||window.pageYOffset;if(y>hH&&!on){bar.classList.add('show');fab.classList.add('hide');on=true}else if(y<=hH&&on){bar.classList.remove('show');fab.classList.remove('hide');on=false}}
  window.addEventListener('scroll',chk,{passive:true});chk();
})();
</script>
</body>
</html>`;
}