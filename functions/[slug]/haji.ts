/**
 * Cloudflare Pages Function — Haji Plus Landing Page
 * Served at /:slug/haji
 * Single-page, inline CSS/JS, mobile-first, high-converting
 * Modeled after elharamainwisata.com haji page
 */

const AGENTS: Record<string, { name: string; phone: string; website: string; photo: string }> = {
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

function formatPhone(phone: string): string {
  const local = '0' + phone.slice(2);
  if (local.length <= 12) {
    return local.slice(0, 4) + '-' + local.slice(4, 8) + '-' + local.slice(8);
  }
  return local.slice(0, 4) + '-' + local.slice(4, 8) + '-' + local.slice(8);
}

const WA_SVG = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>`;
const WA_SVG_SMALL = `<svg viewBox="0 0 24 24" fill="#25D366" style="width:14px;height:14px;vertical-align:middle;margin-right:3px"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>`;

interface PaketHaji {
  nama: string;
  featured?: boolean;
  dpPorsi: string;
  opsiKamar: string;
  durasi: string;
  maktab: string;
  jarakJamarat: string;
  hotelMakkah: string;
  hotelMadinah: string;
  maskapai: string;
  transportasi: string;
  bimbingan: string;
  programArbain: string;
  layanan: string;
  ctaText: string;
}

const PAKET_HAJI: PaketHaji[] = [
  {
    nama: 'Silver',
    dpPorsi: '4.000 USD',
    opsiKamar: '4 / 3 / 2 — Mulai USD 11.000 (±181 JT)',
    durasi: '23–24 Hari',
    maktab: '116',
    jarakJamarat: '900 mtr',
    hotelMakkah: 'Anjum / Setaraf (★5)',
    hotelMadinah: 'Concorde Dar Alkhair / Setaraf (★4)',
    maskapai: 'Saudia / Qatar / Emirates',
    transportasi: 'Bus VIP Terbaru',
    bimbingan: 'Asatidz Berilmu & Berpengalaman',
    programArbain: '–',
    layanan: 'Pendaftaran Mudah & Ringan',
    ctaText: 'Assalamualaikum%2C%20Saya%20mau%20tanya%20paket%20Haji%20Plus%20Silver%20di%20Alhijaz',
  },
  {
    nama: 'Gold',
    dpPorsi: '4.000 USD',
    opsiKamar: '4 / 3 / 2 — Mulai USD 15.000 (±247 JT)',
    durasi: '23–24 Hari',
    maktab: '113',
    jarakJamarat: '500 mtr',
    hotelMakkah: 'Anjum / Marwa Rotana / Setaraf (★5)',
    hotelMadinah: 'Al-Aqeeq / Setaraf (★5)',
    maskapai: 'Saudia / Qatar / Emirates',
    transportasi: 'Bus VIP Terbaru',
    bimbingan: 'Asatidz Berilmu & Berpengalaman',
    programArbain: '–',
    layanan: 'Pendaftaran Mudah & Ringan',
    ctaText: 'Assalamualaikum%2C%20Saya%20mau%20tanya%20paket%20Haji%20Plus%20Gold%20di%20Alhijaz',
  },
  {
    nama: 'Gold Arbain',
    featured: true,
    dpPorsi: '4.000 USD',
    opsiKamar: '4 / 3 / 2 — Mulai USD 16.500 (±272 JT)',
    durasi: '28–29 Hari',
    maktab: '113',
    jarakJamarat: '500 mtr',
    hotelMakkah: 'Marwa Rotana / Setaraf (★5)',
    hotelMadinah: 'Al-Aqeeq / Setaraf (★5)',
    maskapai: 'Saudia / Qatar / Emirates',
    transportasi: 'Bus VIP Terbaru',
    bimbingan: 'Asatidz Berilmu & Berpengalaman',
    programArbain: 'Termasuk',
    layanan: 'Pendaftaran Mudah & Ringan',
    ctaText: 'Assalamualaikum%2C%20Saya%20mau%20tanya%20paket%20Haji%20Plus%20Gold%20Arbain%20di%20Alhijaz',
  },
  {
    nama: 'Platinum',
    dpPorsi: '4.000 USD',
    opsiKamar: '4 / 3 / 2 — Mulai USD 19.500 (±321 JT)',
    durasi: '23–24 Hari',
    maktab: '111/112',
    jarakJamarat: '200 mtr',
    hotelMakkah: 'Fairmont / Setaraf (★5)',
    hotelMadinah: 'Movenpick / Setaraf (★5)',
    maskapai: 'Saudia / Qatar / Emirates',
    transportasi: 'Bus VIP Terbaru',
    bimbingan: 'Asatidz Berilmu & Berpengalaman',
    programArbain: '–',
    layanan: 'Layanan Premium Prioritas',
    ctaText: 'Assalamualaikum%2C%20Saya%20mau%20tanya%20paket%20Haji%20Plus%20Platinum%20di%20Alhijaz',
  },
];

function buildHajiCard(p: PaketHaji, phone: string): string {
  const url = `https://api.whatsapp.com/send?phone=${phone}&text=${p.ctaText}`;
  const isFeatured = p.featured || false;
  return `
  <div class="card${isFeatured ? ' card--featured' : ''}" data-anim>
    <div class="card__head">
      <h3 class="card__name">${p.nama}</h3>
      ${isFeatured ? '<span class="badge badge--arbain">⭐ TERMASUK ARBAIN</span>' : ''}
    </div>
    <table class="card__tbl">
      <tr><td class="tbl-label">💰 DP Porsi</td><td class="tbl-val"><strong>${p.dpPorsi}</strong></td></tr>
      <tr><td class="tbl-label">🏠 Opsi Kamar</td><td class="tbl-val">${p.opsiKamar}</td></tr>
      <tr><td class="tbl-label">⏱️ Durasi</td><td class="tbl-val">${p.durasi}</td></tr>
      <tr><td class="tbl-label">🕋 Maktab VIP</td><td class="tbl-val">${p.maktab}</td></tr>
      <tr><td class="tbl-label">📍 Jarak Jamarat</td><td class="tbl-val">${p.jarakJamarat}</td></tr>
      <tr><td class="tbl-label">🏨 Hotel Makkah</td><td class="tbl-val">${p.hotelMakkah}</td></tr>
      <tr><td class="tbl-label">🕌 Hotel Madinah</td><td class="tbl-val">${p.hotelMadinah}</td></tr>
      <tr><td class="tbl-label">✈️ Maskapai</td><td class="tbl-val">${p.maskapai}</td></tr>
      <tr><td class="tbl-label">🚌 Transportasi</td><td class="tbl-val">${p.transportasi}</td></tr>
      <tr><td class="tbl-label">👨‍🏫 Bimbingan</td><td class="tbl-val">${p.bimbingan}</td></tr>
      <tr><td class="tbl-label">🕐 Program Arbain</td><td class="tbl-val">${p.programArbain === 'Termasuk' ? '<b style="color:#C8A951">✓ Termasuk</b>' : p.programArbain}</td></tr>
      <tr><td class="tbl-label">📋 Layanan</td><td class="tbl-val">${p.layanan}</td></tr>
    </table>
    <a href="${url}" target="_blank" rel="noopener" class="btn btn--card">${WA_SVG} Tanya Detail Paket</a>
  </div>`;
}

async function generateHTML(slug: string): Promise<string> {
  const agent = AGENTS[slug];
  const phone = agent?.phone || DEFAULT_PHONE;
  const website = agent?.website || 'alhijaz.co';
  const agentName = agent?.name || 'Alhijaz';
  const agentPhoto = agent?.photo || '/agents/nikita.jpg';
  const waGeneral = `https://api.whatsapp.com/send?phone=${phone}&text=Assalamualaikum%2C%20Saya%20mau%20tanya%20paket%20Haji%20Plus%20di%20Alhijaz`;
  const cards = PAKET_HAJI.map(p => buildHajiCard(p, phone)).join('');

  return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Paket Haji Plus${agentName ? ` — ${agentName}` : ''} | Alhijaz Indowisata</title>
<meta name="description" content="Paket Haji Plus dengan masa tunggu 8-10 tahun. Penyelenggara Resmi PIHK Kemenag RI. Fasilitas Maktab VIP, Hotel Bintang 5, Maskapai Terbaik.">
<meta property="og:title" content="Paket Haji Plus — Alhijaz Indowisata">
<meta property="og:description" content="Haji Plus masa tunggu 8-10 tahun. DP hanya 4.000 USD. Maktab VIP, Hotel ★★★★★, Maskapai Terbaik.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Playfair+Display:ital,wght@0,700;0,800;1,700&display=swap" rel="stylesheet">
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html{scroll-behavior:smooth;-webkit-text-size-adjust:100%}
body{font-family:'Plus Jakarta Sans',sans-serif;color:#1E293B;background:#FAF8F5;line-height:1.6;-webkit-font-smoothing:antialiased;padding-bottom:76px}
a{text-decoration:none;color:inherit}ul{list-style:none}img{max-width:100%;height:auto}
:root{
  --gold:#C8A951;--gold-d:#A68523;--gold-l:#E8D9A0;--gold-bg:#FFFCF0;
  --dark:#1A0A00;--brown:#3B1F0F;--green-d:#0D3B2C;--green:#1B5E3A;
  --w:#FFF;--b50:#FAF8F5;--b100:#F5F0EB;--b200:#E8E0D8;--b300:#D4C8BC;--b500:#8B7355;--b700:#5C4A38;--b900:#2C1A0A;
  --serif:'Playfair Display',Georgia,serif;--mx:480px;--r:16px;--rs:10px;
  --sh:0 4px 20px rgba(0,0,0,.06);--sh-lg:0 10px 36px rgba(0,0,0,.10);
}
.wrap{max-width:var(--mx);margin:0 auto;padding:0 20px}

/* ── ISLAMIC PATTERN ── */
.geo{position:absolute;inset:0;opacity:.04;pointer-events:none;
  background-image:linear-gradient(30deg,var(--gold) 12%,transparent 12.5%,transparent 87%,var(--gold) 87.5%),linear-gradient(150deg,var(--gold) 12%,transparent 12.5%,transparent 87%,var(--gold) 87.5%),linear-gradient(30deg,var(--gold) 12%,transparent 12.5%,transparent 87%,var(--gold) 87.5%),linear-gradient(150deg,var(--gold) 12%,transparent 12.5%,transparent 87%,var(--gold) 87.5%),linear-gradient(60deg,var(--gold-l) 25%,transparent 25.5%,transparent 75%,var(--gold-l) 75%),linear-gradient(60deg,var(--gold-l) 25%,transparent 25.5%,transparent 75%,var(--gold-l) 75%);
  background-size:56px 97px;background-position:0 0,0 0,28px 48px,28px 48px,0 0,28px 48px}

/* ── HERO ── */
.hero{position:relative;background:linear-gradient(175deg,#FFFDF7 0%,#F0EBE0 15%,#D4CEBC 35%,#C8A951 60%,#8B6914 80%,#3B1F0F 100%);padding:64px 20px 56px;text-align:center;overflow:hidden}
.hero::after{content:'';position:absolute;top:20%;left:50%;transform:translateX(-50%);width:320px;height:320px;background:radial-gradient(circle,rgba(255,253,247,.12) 0%,transparent 70%);pointer-events:none}
.hero .geo{opacity:.03}
.hero__in{position:relative;z-index:2;max-width:var(--mx);margin:0 auto}
.hero__kicker{display:inline-block;font-size:10.5px;font-weight:700;letter-spacing:2.5px;text-transform:uppercase;color:#8B6914;margin-bottom:16px;padding:6px 16px;background:rgba(184,148,31,.12);border:1px solid rgba(184,148,31,.25);border-radius:100px}
.hero h1{font-family:var(--serif);font-size:34px;font-weight:800;color:#1A0A00;line-height:1.15;margin-bottom:20px}
.hero h1 span{color:var(--gold-d);display:block;font-style:italic;font-size:28px;margin-top:4px}
.hero__sub{font-size:13px;color:#5C4A38;line-height:1.7;margin-bottom:28px;max-width:360px;margin-left:auto;margin-right:auto}

/* ── HERO BADGES ── */
.hero__badges{display:flex;flex-direction:column;gap:10px;max-width:380px;margin:0 auto 32px}
.hero__badge{display:flex;align-items:center;gap:12px;background:rgba(255,255,255,.8);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border-radius:14px;padding:14px 16px;border:1px solid rgba(255,255,255,.5);box-shadow:0 4px 16px rgba(0,0,0,.06)}
.hero__badge-icon{width:40px;height:40px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0}
.hero__badge-icon.green{background:linear-gradient(135deg,#E8F5E9,#C8E6C9)}
.hero__badge-icon.gold{background:linear-gradient(135deg,#FFF0C8,#E8D48A)}
.hero__badge-icon.blue{background:linear-gradient(135deg,#E3F2FD,#BBDEFB)}
.hero__badge-text{font-size:12.5px;font-weight:600;color:#2C1A0A;line-height:1.4;text-align:left}

.btn{display:inline-flex;align-items:center;justify-content:center;gap:10px;font-family:inherit;font-weight:700;border:none;cursor:pointer;border-radius:var(--rs);transition:transform .15s,box-shadow .15s}
.btn:active{transform:scale(.97)}
.btn svg{width:20px;height:20px;flex-shrink:0}
.btn--hero{background:linear-gradient(135deg,#25D366,#1DA855);color:var(--w);font-size:16px;padding:16px 32px;width:100%;max-width:380px;box-shadow:0 4px 24px rgba(37,211,102,.35);border-radius:14px}
.btn--hero:hover{transform:translateY(-1px);box-shadow:0 8px 30px rgba(37,211,102,.4)}
.hero__micro{margin-top:12px;font-size:11.5px;color:rgba(90,70,50,.6);font-weight:500}

@keyframes fade-up{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:none}}
.hero__in>*{animation:fade-up .65s cubic-bezier(.16,1,.3,1) both}
.hero__in>:nth-child(1){animation-delay:.1s}.hero__in>:nth-child(2){animation-delay:.15s}.hero__in>:nth-child(3){animation-delay:.2s}.hero__in>:nth-child(4){animation-delay:.25s}.hero__in>:nth-child(5){animation-delay:.3s}.hero__in>:nth-child(6){animation-delay:.35s}.hero__in>:nth-child(7){animation-delay:.4s}

/* ── SECTION COMMON ── */
.sec{padding:48px 20px}
.sec__label{font-size:11px;font-weight:700;color:var(--gold-d);text-transform:uppercase;letter-spacing:1.5px;margin-bottom:6px;text-align:center}
.sec__title{font-family:var(--serif);font-size:26px;font-weight:700;color:var(--dark);line-height:1.28;margin-bottom:16px;text-align:center}
.sec__desc{font-size:14px;color:var(--b500);text-align:center;margin-bottom:28px;line-height:1.6;max-width:var(--mx);margin-left:auto;margin-right:auto}

/* ── PROFIL ── */
.profil{background:var(--w);border-bottom:1px solid var(--b200);padding:48px 20px}
.profil__in{max-width:var(--mx);margin:0 auto}
.profil p{font-size:14px;color:var(--b700);line-height:1.75;margin-bottom:12px}

/* ── KENAPA ── */
.kenapa{padding:48px 20px;background:linear-gradient(180deg,var(--b50) 0%,#F0EBE0 100%)}
.kenapa-grid{max-width:var(--mx);margin:0 auto;display:flex;flex-direction:column;gap:14px}
.kenapa-card{display:flex;align-items:flex-start;gap:14px;background:var(--w);border:1px solid var(--b200);border-radius:14px;padding:20px 16px;box-shadow:0 2px 12px rgba(0,0,0,.04)}
.kenapa-card .kic{width:44px;height:44px;border-radius:12px;background:linear-gradient(135deg,var(--gold-bg),#F0E6C8);display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0}
.kenapa-card h4{font-size:14px;font-weight:700;color:var(--dark);margin-bottom:4px}
.kenapa-card p{font-size:12.5px;color:var(--b500);line-height:1.5}

/* ── FASILITAS ── */
.fasilitas{padding:48px 20px;background:var(--w)}
.fas-grid{max-width:var(--mx);margin:0 auto;display:grid;grid-template-columns:1fr;gap:14px}
.fas-card{background:linear-gradient(135deg,#FFFDF7,#F8F0E0);border:1px solid var(--b200);border-radius:16px;padding:28px 20px;text-align:center;box-shadow:var(--sh);transition:transform .2s}
.fas-card:hover{transform:translateY(-2px)}
.fas-card .fic{font-size:36px;margin-bottom:12px}
.fas-card h4{font-family:var(--serif);font-size:17px;font-weight:700;color:var(--dark);margin-bottom:8px}
.fas-card p{font-size:13px;color:var(--b500);line-height:1.6}

/* ── CARDS ── */
.cards{max-width:var(--mx);margin:0 auto;display:flex;flex-direction:column;gap:18px}
.card{position:relative;background:var(--w);border-radius:16px;overflow:hidden;box-shadow:var(--sh);border:1px solid var(--b200);transition:transform .25s,box-shadow .25s}
.card:hover{transform:translateY(-2px);box-shadow:var(--sh-lg)}
.card--featured{background:linear-gradient(170deg,var(--gold-bg),var(--w) 50%);border:2px solid var(--gold);box-shadow:0 4px 20px rgba(200,169,81,.2)}
.card__head{padding:24px 20px 18px;background:linear-gradient(135deg,#F8F0E0 0%,#FFFDF7 100%);border-bottom:1px solid var(--b200);position:relative}
.card--featured .card__head{background:linear-gradient(135deg,#FFF0C8 0%,#FFF8E7 40%,#FFFDF5 100%);border-bottom:1px solid #E8D48A}
.card__name{font-family:var(--serif);font-size:24px;font-weight:700;color:var(--dark);line-height:1.25}
.badge{display:inline-block;font-size:10px;font-weight:700;padding:5px 14px;border-radius:100px;margin-top:8px;letter-spacing:.3px}
.badge--arbain{background:linear-gradient(135deg,var(--gold),var(--gold-d));color:var(--w);box-shadow:0 2px 8px rgba(200,169,81,.3)}
.card__tbl{width:100%;border-collapse:collapse;font-size:12.5px}
.card__tbl tr{border-bottom:1px solid #F0ECE6}
.card__tbl tr:last-child{border-bottom:none}
.card__tbl td{padding:12px 20px;vertical-align:top}
.tbl-label{width:120px;white-space:nowrap;color:var(--b700);font-weight:600;font-size:12px}
.tbl-val{color:var(--b700);line-height:1.5}
.btn--card{display:flex;align-items:center;justify-content:center;gap:8px;margin:0 20px 20px;padding:14px 18px;border-radius:12px;font-size:14.5px;font-weight:700;background:linear-gradient(135deg,#25D366,#128C7E);color:#fff;box-shadow:0 4px 14px rgba(37,211,102,.3);transition:transform .2s,box-shadow .2s}
.btn--card svg{width:18px;height:18px;flex-shrink:0}
.btn--card:hover{transform:translateY(-1px);box-shadow:0 6px 20px rgba(37,211,102,.4)}
.card--featured .btn--card{background:linear-gradient(135deg,var(--gold-d),var(--gold));box-shadow:0 3px 12px rgba(200,169,81,.28)}

/* ── PEMBIAYAAN ── */
.pembiayaan{padding:52px 20px;background:linear-gradient(135deg,#0D3B2C,#145A3E);position:relative;overflow:hidden;text-align:center}
.pembiayaan::before{content:'';position:absolute;top:-60px;right:-60px;width:200px;height:200px;background:radial-gradient(circle,rgba(200,169,81,.12) 0%,transparent 70%);pointer-events:none}
.pembiayaan__in{max-width:var(--mx);margin:0 auto;position:relative;z-index:1}
.pembiayaan h2{font-family:var(--serif);font-size:24px;font-weight:700;color:#fff;margin-bottom:14px;line-height:1.3}
.pembiayaan p{font-size:14px;color:rgba(255,255,255,.75);line-height:1.7;margin-bottom:24px}
.pembiayaan .btn--hero{background:linear-gradient(135deg,var(--gold),var(--gold-d));color:var(--w);box-shadow:0 4px 20px rgba(200,169,81,.3)}
.pembiayaan .btn--hero:hover{box-shadow:0 8px 30px rgba(200,169,81,.4)}

/* ── REVIEWS ── */
.reviews{padding:48px 20px;background:var(--b50)}
.reviews__grid{max-width:var(--mx);margin:0 auto;display:flex;flex-direction:column;gap:14px}
.review-card{background:var(--w);border:1px solid var(--b200);border-radius:14px;padding:20px;box-shadow:0 2px 8px rgba(0,0,0,.04)}
.review-card__head{display:flex;align-items:center;gap:10px;margin-bottom:10px}
.review-card__avatar{width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,var(--gold-bg),#F0E6C8);display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:700;color:var(--gold-d)}
.review-card__info strong{font-size:13px;color:var(--dark);display:block}
.review-card__info span{font-size:11px;color:var(--b500)}
.review-card__stars{font-size:13px;color:#F59E0B;margin-bottom:8px}
.review-card p{font-size:12.5px;color:var(--b700);line-height:1.6}
.reviews__badge{text-align:center;margin-top:18px;font-size:12px;color:var(--b500)}
.reviews__badge strong{color:var(--gold-d)}

/* ── CLOSING ── */
.closing{padding:56px 20px;text-align:center;background:linear-gradient(135deg,#2C1A0A 0%,#5C3A1A 50%,#8B6914 100%);position:relative;overflow:hidden}
.closing::before{content:'';position:absolute;top:-60px;right:-60px;width:200px;height:200px;background:radial-gradient(circle,rgba(200,169,81,.15) 0%,transparent 70%);pointer-events:none}
.closing__in{max-width:var(--mx);margin:0 auto;position:relative;z-index:1}
.closing__icon{font-size:40px;margin-bottom:12px}
.closing h2{font-family:var(--serif);font-size:26px;font-weight:700;color:#fff;line-height:1.3;margin-bottom:10px}
.closing h2 em{font-style:italic;color:var(--gold)}
.closing p{font-size:14.5px;color:rgba(255,255,255,.7);margin-bottom:24px}
.closing .btn--hero{font-size:16px;padding:16px 40px;background:#fff;color:var(--dark);font-weight:700;border-radius:14px;box-shadow:0 4px 20px rgba(0,0,0,.2)}
.closing .btn--hero:hover{transform:translateY(-2px);box-shadow:0 8px 30px rgba(0,0,0,.3)}
.closing .btn--hero svg{fill:#25D366}
.closing__hint{margin-top:16px;font-size:12.5px;color:rgba(255,255,255,.45)}

/* ── FOOTER ── */
footer{background:#1A0A00;padding:36px 20px 28px;text-align:center;border-top:3px solid var(--gold)}
footer .wrap{max-width:var(--mx);margin:0 auto}
.footer__brand{font-family:var(--serif);font-size:18px;font-weight:700;color:#fff;margin-bottom:4px}
.footer__tagline{font-size:11px;color:var(--gold);font-weight:600;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:18px}
.footer__info{display:flex;flex-direction:column;gap:6px;margin-bottom:16px}
.footer__info p{font-size:12px;color:rgba(255,255,255,.5);line-height:1.6;margin:0}
.footer__legal{padding-top:16px;border-top:1px solid rgba(255,255,255,.08);font-size:10.5px;color:rgba(255,255,255,.25)}

/* ── STICKY BAR ── */
.sticky{position:fixed;bottom:0;left:0;right:0;z-index:999;background:rgba(255,255,255,.96);backdrop-filter:blur(12px);border-top:1px solid var(--b200);padding:10px 16px;transform:translateY(100%);transition:transform .4s cubic-bezier(.16,1,.3,1)}
.sticky.show{transform:none}
.sticky__in{max-width:var(--mx);margin:0 auto;display:flex;align-items:center;gap:12px}
.sticky__avatar{position:relative;width:40px;height:40px;flex-shrink:0}
.sticky__avatar img{width:40px;height:40px;border-radius:50%;object-fit:cover;border:2px solid #F0E6C8}
.sticky__badge{position:absolute;bottom:-1px;right:-1px;width:16px;height:16px;border-radius:50%;background:#fff;display:flex;align-items:center;justify-content:center;box-shadow:0 1px 3px rgba(0,0,0,.1)}
.sticky__text{flex:1;min-width:0}
.sticky__text strong{font-size:13.5px;color:var(--dark);display:block;line-height:1.3}
.sticky__text p{font-size:11px;color:var(--gold-d);font-weight:600}
.btn--sticky{padding:11px 22px;border-radius:12px;font-size:13.5px;background:linear-gradient(135deg,#25D366,#1DA855);color:var(--w);white-space:nowrap;box-shadow:0 2px 10px rgba(37,211,102,.25)}

/* ── FAB ── */
.fab{position:fixed;bottom:20px;right:16px;z-index:998;width:56px;height:56px;background:#25D366;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 18px rgba(37,211,102,.4);transition:opacity .3s,transform .3s;animation:glow 2.5s infinite}
.fab svg{width:28px;height:28px;fill:var(--w)}
.fab.hide{opacity:0;transform:scale(.5);pointer-events:none}
@keyframes glow{0%,100%{box-shadow:0 4px 18px rgba(37,211,102,.4)}50%{box-shadow:0 4px 28px rgba(37,211,102,.6)}}

/* ── SCROLL ANIM ── */
[data-anim]{opacity:0;transform:translateY(20px);transition:opacity .6s cubic-bezier(.16,1,.3,1),transform .6s cubic-bezier(.16,1,.3,1)}
[data-anim].vis{opacity:1;transform:none}

@media(min-width:640px){:root{--mx:560px}.hero h1{font-size:38px}.hero h1 span{font-size:32px}.hero{padding:68px 28px 56px}.sec{padding:52px 28px}.fas-grid{grid-template-columns:1fr 1fr 1fr}}
@media(min-width:1024px){:root{--mx:720px}.hero h1{font-size:44px}.cards{display:grid;grid-template-columns:1fr 1fr;gap:20px}.kenapa-grid{flex-direction:row}}
</style>
</head>
<body>

<!-- HERO -->
<section class="hero">
  <div class="geo"></div>
  <div class="hero__in">
    <p class="hero__kicker">Haji Plus — Alhijaz Indowisata</p>
    <h1>Masa Tunggu Haji Plus Lebih Singkat<span>Pelayanan Terbaik & Fasilitas Eksklusif</span></h1>
    <p class="hero__sub">Wujudkan ibadah haji Anda dengan layanan premium, hotel bintang 5, maktab VIP dekat Jamarat, dan bimbingan ustadz berpengalaman.</p>
    <div class="hero__badges">
      <div class="hero__badge"><div class="hero__badge-icon green">🕋</div><div class="hero__badge-text">Program Haji Plus — Masa Tunggu 8-10 Tahun</div></div>
      <div class="hero__badge"><div class="hero__badge-icon gold">📋</div><div class="hero__badge-text">Penyelenggara Resmi — PIHK Kemenag RI (SK No.846/2020)</div></div>
      <div class="hero__badge"><div class="hero__badge-icon blue">🏅</div><div class="hero__badge-text">Terakreditasi A oleh KAN (Komite Akreditasi Nasional)</div></div>
    </div>
    <a href="${waGeneral}" target="_blank" rel="noopener" class="btn btn--hero">${WA_SVG} Konsultasi Sekarang</a>
    <p class="hero__micro">Gratis konsultasi · Tanpa komitmen</p>
  </div>
</section>

<!-- PROFIL -->
<section class="profil" data-anim>
  <div class="profil__in">
    <div class="sec__label">Profil</div>
    <h2 class="sec__title">PT Alhijaz Indowisata</h2>
    <p>PT Alhijaz Indowisata merupakan Penyelenggara Resmi Ibadah Haji Khusus (PIHK) dengan izin resmi dari Kementerian Agama Republik Indonesia.</p>
    <p>Alhijaz menghadirkan layanan Haji Plus Premium dengan fasilitas unggulan, hotel berkualitas bintang 5, maskapai terbaik, pembimbing berpengalaman, pelayanan personal, serta sistem perjalanan terencana demi ibadah yang aman, nyaman, khusyuk, dan penuh makna.</p>
  </div>
</section>

<!-- KENAPA BERHAJI -->
<section class="kenapa">
  <div class="sec__label" data-anim>Keunggulan</div>
  <h2 class="sec__title" data-anim>Kenapa Berhaji dengan Alhijaz?</h2>
  <p class="sec__desc" data-anim>Proses pendaftaran paling Ringan & Mudah. Masa Tunggu saat ini 8-10 Tahun — Semakin menunda, masa tunggu semakin panjang.</p>
  <div class="kenapa-grid">
    <div class="kenapa-card" data-anim><div class="kic">💰</div><div><h4>Pendaftaran Paling Ringan</h4><p>DP hanya 4.000 USD — jauh lebih terjangkau dibanding travel lain yang bisa 5.000–6.000 USD.</p></div></div>
    <div class="kenapa-card" data-anim><div class="kic">🎁</div><div><h4>Promo Cashback Langsung IDR 1.000.000</h4><p>Benefit instan saat DP pendaftaran. Langsung dipotong dari total biaya.</p></div></div>
    <div class="kenapa-card" data-anim><div class="kic">🎫</div><div><h4>Free Voucher Umroh IDR 5.000.000</h4><p>Bisa digunakan untuk perjalanan Umroh berikutnya. *Syarat & Ketentuan Berlaku.</p></div></div>
  </div>
</section>

<!-- FASILITAS -->
<section class="fasilitas">
  <div class="sec__label" data-anim>Fasilitas Premium</div>
  <h2 class="sec__title" data-anim>Fasilitas Terbaik di Kelasnya</h2>
  <div class="fas-grid">
    <div class="fas-card" data-anim><div class="fic">🕋</div><h4>Maktab VIP</h4><p>Jarak dekat dengan Jamarat, akses lebih mudah saat puncak haji.</p></div>
    <div class="fas-card" data-anim><div class="fic">🏨</div><h4>Hotel ★★★★★</h4><p>Hotel bintang 5 terbaik di kelasnya, lebih nyaman untuk istirahat jamaah.</p></div>
    <div class="fas-card" data-anim><div class="fic">✈️</div><h4>Airlines & Bus VIP</h4><p>Maskapai terbaik & transportasi Bus VIP terbaru. Perjalanan aman, nyaman, dan terjamin.</p></div>
  </div>
</section>

<!-- PAKET HAJI -->
<section class="sec" id="paket">
  <div class="sec__label" data-anim>Pilihan Paket Haji Plus</div>
  <h2 class="sec__title" data-anim>Paket Haji Plus Alhijaz</h2>
  <p class="sec__desc" data-anim>Pilih paket sesuai kebutuhan dan budget Anda. Semua paket termasuk fasilitas premium dengan pelayanan terbaik.</p>
  <div class="cards">${cards}</div>
</section>

<!-- PEMBIAYAAN -->
<section class="pembiayaan" data-anim>
  <div class="pembiayaan__in">
    <h2>Program Pembiayaan<br>Nomor Porsi Haji Plus</h2>
    <p>Program Pembiayaan Nomor Porsi Haji bekerja sama dengan Bank Muamalat hadir sebagai solusi syariah bagi Anda yang ingin segera mendaftar haji. Menggunakan prinsip syariah dan telah mendapatkan persetujuan DSN MUI.</p>
    <p>Dengan DP hanya <strong style="color:#fff">Rp 2,5 Juta</strong> dan cicilan mulai <strong style="color:#fff">satu jutaan per bulan</strong>, Anda sudah dapat memperoleh nomor porsi haji resmi.</p>
    <a href="${waGeneral}" target="_blank" rel="noopener" class="btn btn--hero">${WA_SVG} Tanya Program Pembiayaan</a>
  </div>
</section>

<!-- REVIEWS -->
<section class="reviews">
  <div class="sec__label" data-anim>Testimoni</div>
  <h2 class="sec__title" data-anim>Ulasan Google Review</h2>
  <p class="sec__desc" data-anim>Alhijaz memiliki rating bintang 5 dari ribuan ulasan jamaah.</p>
  <div class="reviews__grid">
    <div class="review-card" data-anim>
      <div class="review-card__head"><div class="review-card__avatar">R</div><div class="review-card__info"><strong>Resty Putri</strong><span>Google Review</span></div></div>
      <div class="review-card__stars">⭐⭐⭐⭐⭐</div>
      <p>Pengalaman pertama menjalankan ibadah umroh pada musim padat, namun dengan Alhijaz, kami sekeluarga dapat menjalankan ibadah dengan sangat berkesan. Bimbingan sangat baik dan semua anggota kelompok kompak.</p>
    </div>
    <div class="review-card" data-anim>
      <div class="review-card__head"><div class="review-card__avatar">B</div><div class="review-card__info"><strong>Bayu Adi Gunawan</strong><span>Google Review</span></div></div>
      <div class="review-card__stars">⭐⭐⭐⭐⭐</div>
      <p>Alhamdulillah, akhirnya Allah memanggil kami untuk menunaikan umroh pertama. Tim travel mendampingi dengan sangat baik dan profesional. Hotel dekat, konsumsi baik, transportasi lancar. Sangat recommended!</p>
    </div>
    <div class="review-card" data-anim>
      <div class="review-card__head"><div class="review-card__avatar">A</div><div class="review-card__info"><strong>Andika Mulrosha</strong><span>Google Review</span></div></div>
      <div class="review-card__stars">⭐⭐⭐⭐⭐</div>
      <p>Komitmen fasilitas dan pelayanan top, the best dibandingkan dari beberapa pengalaman tour travel yang pernah digunakan. Jamaah sangat kompak dan nuansa kekeluargaan sangat kental selama perjalanan ibadah.</p>
    </div>
  </div>
  <div class="reviews__badge" data-anim>⭐ Rating <strong>5.0</strong> dari <strong>6.200+</strong> ulasan di Google</div>
</section>

<!-- CLOSING CTA -->
<section class="closing" data-anim>
  <div class="closing__in">
    <div class="closing__icon">🕋</div>
    <h2>Niat Sudah Ada,<br>Tinggal <em>Satu Langkah Lagi.</em></h2>
    <p>Semakin menunda, masa tunggu semakin panjang. Daftarkan diri Anda sekarang.</p>
    <a href="${waGeneral}" target="_blank" rel="noopener" class="btn btn--hero">${WA_SVG} Konsultasi via WhatsApp</a>
    <p class="closing__hint">Konsultasi gratis, tanpa komitmen.</p>
  </div>
</section>

<!-- FOOTER -->
<footer>
  <div class="wrap">
    <div class="footer__brand">PT Alhijaz Indowisata</div>
    <div class="footer__tagline">Travel Haji & Umroh Terpercaya</div>
    <div class="footer__info">
      <p>📍 Jl. Dewi Sartika No. 239A, Cawang, Jakarta Timur</p>
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
      <div class="sticky__badge"><svg width="12" height="12" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="12" fill="#C8A951"/><path d="M9.5 12.5L11 14L15 10" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
    </div>
    <div class="sticky__text">
      <strong>${agentName}</strong>
      <p>Konsultasi Haji Plus</p>
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

export const onRequest = async (context: { params: { slug: string }; request: Request }) => {
  const slug = (context.params.slug || '').toLowerCase();
  return new Response(await generateHTML(slug), {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
  });
};
