/**
 * Umroh Landing Page – Plain JS module for Node.js (server.js)
 * Source of truth: functions/[slug]/umroh.ts (Cloudflare/Vite dev)
 * This file mirrors the TS version but without type annotations.
 */

const AGENTS = {
  'bagas':       { name: 'Bagas Pramudita',     phone: '6287878573311' },
  'nikita':      { name: 'Nikita',              phone: '62822900020' },
  'nila':        { name: 'Nila Novita Sari',    phone: '6285211209049' },
  'andra':       { name: 'Andra Olivia',        phone: '628129909795' },
  'dyah':        { name: 'Dyah Ratna Witri',    phone: '6281385975678' },
  'widi':        { name: 'Widi Purwanti',       phone: '6287820813228' },
  'aulia':       { name: 'Aulia',               phone: '6282110407229' },
  'selfiah':     { name: 'Selfiah Handayani',   phone: '6281410478212' },
  'zakia':       { name: 'Rahima Zakia',        phone: '6285158005623' },
  'dianwahyuni': { name: 'Dian Wahyuni',        phone: '6283197968407' },
  'anne':        { name: 'Anne Suryani',        phone: '628129953424' },
  'evi':         { name: 'Evi Chaniago',        phone: '6281806742789' },
  'yenita':      { name: 'Yenita',              phone: '6281316803128' },
  'indah':       { name: 'Indah Permata',       phone: '6281943631008' },
  'aisyah':      { name: 'Siti Aisyah',         phone: '6281225600900' },
  'siska':       { name: 'Siska Fadia',         phone: '6281188885291' },
  'linda':       { name: 'Nurlinda Dewi',       phone: '6282112094089' },
};
const DEFAULT_PHONE = '62822900020';

const WA_SVG = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>`;

const PAKET_LIST = [
  {
    nama: 'Promo Akbar',
    badge: '🔥 PROMO TERBATAS',
    featured: true,
    keberangkatan: '20 Juni 2026',
    harga: 'Rp 28 Juta-an',
    durasi: '9 Hari',
    airline: 'Saudi Airlines',
    hotelMekkah: '⭐⭐⭐⭐ Grand Al Massa / Setaraf',
    hotelMadinah: '⭐⭐⭐ ODST Al Madina / Setaraf',
    include: ['Perlengkapan Umroh', 'Handling Bandara', 'Makan 3x Sehari', 'FREE Ayam Al-Baik', 'FREE Zamzam 5L'],
    ctaText: 'Assalamualaikum%2C%20Saya%20mau%20tanya%20paket%20Promo%20Umroh%20Akbar%20(20%20Juni%202026)%20di%20Alhijaz',
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
    include: ['Perlengkapan Umroh', 'Handling Bandara', 'Makan 3x Sehari', 'FREE Ayam Al-Baik', 'FREE Zamzam 5L'],
    ctaText: 'Assalamualaikum%2C%20Saya%20mau%20tanya%20paket%20Umroh%20Plus%20Hainan%20(Haikou)%20China%20di%20Alhijaz',
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
    include: ['Perlengkapan Umroh', 'Handling Bandara', 'Makan 3x Sehari', 'FREE Ayam Al-Baik', 'FREE Zamzam 5L'],
    ctaText: 'Assalamualaikum%2C%20Saya%20mau%20tanya%20paket%20Umroh%20Reguler%20di%20Alhijaz',
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
    include: ['Perlengkapan Umroh', 'Handling Bandara', 'Makan 3x Sehari', 'FREE Ayam Al-Baik', 'FREE Zamzam 5L', 'Handling Lengkap'],
    ctaText: 'Assalamualaikum%2C%20Saya%20mau%20tanya%20paket%20Umroh%20Plus%20Thaif%20di%20Alhijaz',
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
    include: ['Perlengkapan Umroh', 'Handling Bandara', 'Makan 3x Sehari', 'FREE Ayam Al-Baik', 'FREE Zamzam 5L'],
    ctaText: 'Assalamualaikum%2C%20Saya%20mau%20tanya%20paket%20Umroh%20Plus%20Istanbul-Cappadocia%20di%20Alhijaz',
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
    include: ['Perlengkapan Umroh', 'Handling Bandara', 'Makan 3x Sehari', 'FREE Ayam Al-Baik', 'FREE Zamzam 5L'],
    ctaText: 'Assalamualaikum%2C%20Saya%20mau%20tanya%20paket%20Umroh%20Plus%20Cairo-Alexandria%20di%20Alhijaz',
  },
];

function buildCard(p, phone) {
  const url = `https://api.whatsapp.com/send?phone=${phone}&text=${p.ctaText}`;
  return `
  <div class="card${p.featured ? ' card--promo' : ''}" data-anim>
    ${p.badge ? `<span class="badge${p.featured ? ' badge--gold' : ''}">${p.badge}</span>` : ''}
    <h3 class="card__name">${p.nama}</h3>
    <div class="card__price">Mulai <strong>${p.harga}</strong></div>
    <ul class="card__info">
      <li>📅 <b>${p.keberangkatan}</b></li>
      <li>⏱️ ${p.durasi} · ✈️ ${p.airline}</li>
      <li>🕋 Mekkah: ${p.hotelMekkah}</li>
      <li>🕌 Madinah: ${p.hotelMadinah}</li>
      ${p.hotelLain ? `<li>🏨 ${p.hotelLain}</li>` : ''}
      ${p.highlight ? `<li>⭐ <b>${p.highlight}</b></li>` : ''}
    </ul>
    <div class="card__inc">
      <span class="card__inc-t">✅ Termasuk:</span>
      <div class="tags">${p.include.map(i => `<span class="tag">${i}</span>`).join('')}</div>
    </div>
    <a href="${url}" target="_blank" rel="noopener" class="btn btn--card">${WA_SVG} Tanya Paket Ini</a>
  </div>`;
}

export function generateHTML(slug) {
  const agent = AGENTS[slug];
  const phone = agent?.phone || DEFAULT_PHONE;
  const agentName = agent?.name || '';
  const waGeneral = `https://api.whatsapp.com/send?phone=${phone}&text=Assalamualaikum%2C%20Saya%20mau%20tanya%20paket%20Umroh%20di%20Alhijaz`;
  const cards = PAKET_LIST.map(p => buildCard(p, phone)).join('');

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
.hero{position:relative;background:linear-gradient(165deg,var(--r900),var(--r800) 40%,var(--r700) 75%,var(--r600));padding:56px 20px 48px;text-align:center;overflow:hidden}
.hero__in{position:relative;z-index:2;max-width:var(--mx);margin:0 auto}
.hero__badges{display:flex;justify-content:center;gap:6px;flex-wrap:wrap;margin-bottom:20px}
.hero__badge{font-size:10.5px;font-weight:700;color:var(--gold-l);background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.12);padding:5px 12px;border-radius:100px;letter-spacing:.5px}
.hero h1{font-family:var(--serif);font-size:28px;font-weight:800;color:var(--w);line-height:1.22;margin-bottom:14px}
.hero h1 em{font-style:italic;color:var(--gold)}
.hero__sub{font-size:14.5px;color:rgba(255,255,255,.75);line-height:1.6;margin-bottom:28px;max-width:380px;margin-left:auto;margin-right:auto}
.hero__sub strong{color:var(--gold-l);font-weight:600}

.btn{display:inline-flex;align-items:center;justify-content:center;gap:10px;font-family:inherit;font-weight:700;border:none;cursor:pointer;border-radius:100px;transition:transform .15s,box-shadow .15s}
.btn:active{transform:scale(.97)}
.btn svg{width:20px;height:20px;flex-shrink:0}
.btn--hero{background:linear-gradient(135deg,var(--gold),var(--gold-d));color:var(--w);font-size:16px;padding:16px 36px;box-shadow:0 4px 24px rgba(200,169,81,.35)}
.hero__legal{margin-top:16px;font-size:11px;color:rgba(255,255,255,.4)}

@keyframes fade-up{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:none}}
.hero__in>*{animation:fade-up .65s cubic-bezier(.16,1,.3,1) both}
.hero__in>:nth-child(1){animation-delay:.1s}.hero__in>:nth-child(2){animation-delay:.18s}.hero__in>:nth-child(3){animation-delay:.26s}.hero__in>:nth-child(4){animation-delay:.34s}.hero__in>:nth-child(5){animation-delay:.42s}

/* ── SOCIAL PROOF ── */
.proof{background:var(--w);border-bottom:1px solid var(--b200);padding:20px 16px;overflow-x:auto;-webkit-overflow-scrolling:touch}
.proof__in{max-width:var(--mx);margin:0 auto;display:flex;gap:16px;align-items:center;justify-content:center;white-space:nowrap;font-size:13px;color:var(--b700);font-weight:500}
.proof__sep{color:var(--b300)}

/* ── SECTION COMMON ── */
.sec{padding:44px 20px}
.sec__label{font-size:11px;font-weight:700;color:var(--gold-d);text-transform:uppercase;letter-spacing:1.5px;margin-bottom:6px;text-align:center}
.sec__title{font-family:var(--serif);font-size:24px;font-weight:700;color:var(--r900);line-height:1.28;margin-bottom:8px;text-align:center}
.sec__desc{font-size:14px;color:var(--b500);text-align:center;margin-bottom:28px;line-height:1.6}

/* ── CARDS ── */
.cards{max-width:var(--mx);margin:0 auto;display:flex;flex-direction:column;gap:18px}
.card{position:relative;background:var(--w);border-radius:var(--r);padding:24px 20px;box-shadow:var(--sh);border:1px solid var(--b200);transition:transform .25s,box-shadow .25s}
.card:hover{transform:translateY(-2px);box-shadow:var(--sh-lg)}
.card--promo{background:linear-gradient(170deg,var(--gold-bg),var(--w) 50%);border:2px solid var(--gold);box-shadow:0 4px 20px rgba(200,169,81,.2)}
.badge{display:inline-block;font-size:10px;font-weight:700;padding:4px 12px;border-radius:100px;background:var(--r50);color:var(--r700);margin-bottom:10px;letter-spacing:.3px}
.badge--gold{background:linear-gradient(135deg,var(--gold),var(--gold-d));color:var(--w);box-shadow:0 2px 8px rgba(200,169,81,.3)}
.card__name{font-family:var(--serif);font-size:20px;font-weight:700;color:var(--r900);margin-bottom:4px;line-height:1.25}
.card__price{font-size:14px;color:var(--b700);margin-bottom:16px;padding-bottom:14px;border-bottom:1px solid var(--b200)}
.card__price strong{font-size:21px;font-weight:800;color:var(--r700)}
.card--promo .card__price strong{color:var(--gold-d)}
.card__info{display:flex;flex-direction:column;gap:7px;margin-bottom:16px}
.card__info li{font-size:13px;color:var(--b700);line-height:1.5}
.card__inc{background:var(--r50);border-radius:var(--rs);padding:12px 14px;margin-bottom:16px}
.card__inc-t{font-size:12px;font-weight:700;color:var(--r800);display:block;margin-bottom:8px}
.tags{display:flex;flex-wrap:wrap;gap:5px}
.tag{font-size:10.5px;font-weight:500;padding:3px 9px;border-radius:100px;background:var(--w);color:var(--r700);border:1px solid rgba(107,30,30,.12)}
.btn--card{width:100%;padding:13px 18px;border-radius:var(--rs);font-size:14px;background:linear-gradient(135deg,var(--r600),var(--r500));color:var(--w);box-shadow:0 3px 12px rgba(139,45,45,.25)}
.card--promo .btn--card{background:linear-gradient(135deg,var(--gold-d),var(--gold));box-shadow:0 3px 12px rgba(200,169,81,.28)}

/* ── TRUST ── */
.trust{padding:44px 20px;background:var(--r900);position:relative;overflow:hidden}
.trust .geo{opacity:.03}
.trust .sec__label{color:var(--gold)}.trust .sec__title{color:var(--w)}
.trust-grid{max-width:var(--mx);margin:0 auto;display:grid;grid-template-columns:1fr 1fr;gap:10px}
.trust-card{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.08);border-radius:var(--rs);padding:16px 12px;text-align:center}
.trust-card .ic{font-size:24px;display:block;margin-bottom:6px}
.trust-card h4{font-size:12.5px;font-weight:700;color:var(--w);margin-bottom:2px}
.trust-card p{font-size:11px;color:rgba(255,255,255,.5);line-height:1.4}

/* ── CLOSING ── */
.closing{padding:52px 20px;text-align:center;background:linear-gradient(180deg,var(--b50),var(--w))}
.closing__in{max-width:var(--mx);margin:0 auto}
.closing h2{font-family:var(--serif);font-size:24px;font-weight:700;color:var(--r900);line-height:1.28;margin-bottom:10px}
.closing h2 em{font-style:italic;color:var(--gold-d)}
.closing p{font-size:14.5px;color:var(--b500);margin-bottom:24px}
.closing .btn--hero{font-size:16px;padding:16px 40px}
.closing__hint{margin-top:14px;font-size:12.5px;color:var(--b500)}

/* ── FOOTER ── */
footer{background:var(--r900);padding:28px 20px;text-align:center;border-top:3px solid var(--gold)}
footer .wrap{max-width:var(--mx)}
.footer__brand{font-family:var(--serif);font-size:16px;font-weight:700;color:var(--gold);margin-bottom:8px}
footer p{font-size:11.5px;color:rgba(255,255,255,.4);line-height:1.7}
.footer__legal{margin-top:14px;padding-top:14px;border-top:1px solid rgba(255,255,255,.07);font-size:10.5px;color:rgba(255,255,255,.28)}

/* ── STICKY BAR ── */
.sticky{position:fixed;bottom:0;left:0;right:0;z-index:999;background:rgba(255,255,255,.94);backdrop-filter:blur(10px);border-top:1px solid var(--b200);padding:10px 16px;transform:translateY(100%);transition:transform .4s cubic-bezier(.16,1,.3,1)}
.sticky.show{transform:none}
.sticky__in{max-width:var(--mx);margin:0 auto;display:flex;align-items:center;gap:12px}
.sticky__text{flex:1;min-width:0}
.sticky__text strong{font-size:13px;color:var(--r900);display:block}
.sticky__text p{font-size:11px;color:var(--b500)}
.btn--sticky{padding:11px 22px;border-radius:var(--rs);font-size:13.5px;background:linear-gradient(135deg,var(--r600),var(--r500));color:var(--w);white-space:nowrap;box-shadow:0 2px 10px rgba(139,45,45,.22)}

/* ── FAB ── */
.fab{position:fixed;bottom:20px;right:16px;z-index:998;width:56px;height:56px;background:#25D366;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 18px rgba(37,211,102,.4);transition:opacity .3s,transform .3s;animation:glow 2.5s infinite}
.fab svg{width:28px;height:28px;fill:var(--w)}
.fab.hide{opacity:0;transform:scale(.5);pointer-events:none}
@keyframes glow{0%,100%{box-shadow:0 4px 18px rgba(37,211,102,.4)}50%{box-shadow:0 4px 28px rgba(37,211,102,.6)}}

/* ── SCROLL ANIM ── */
[data-anim]{opacity:0;transform:translateY(20px);transition:opacity .6s cubic-bezier(.16,1,.3,1),transform .6s cubic-bezier(.16,1,.3,1)}
[data-anim].vis{opacity:1;transform:none}

/* ── RESPONSIVE ── */
@media(min-width:640px){:root{--mx:560px}.hero h1{font-size:36px}.hero{padding:68px 28px 52px}.sec{padding:52px 28px}.card{padding:28px 24px}}
@media(min-width:1024px){:root{--mx:640px}.hero h1{font-size:42px}.cards{display:grid;grid-template-columns:1fr 1fr;gap:20px}}
</style>
</head>
<body>

<!-- HERO -->
<section class="hero">
  <div class="geo"></div>
  <div class="hero__in">
    <div class="hero__badges">
      <span class="hero__badge">Akreditasi "A"</span>
      <span class="hero__badge">Resmi Kemenag RI</span>
      <span class="hero__badge">10.000+ Jamaah/Tahun</span>
    </div>
    <h1>28 Juta Menuju<br><em>Baitullah.</em></h1>
    <p class="hero__sub">Umroh <strong>Pasti Berangkat</strong> mulai <strong>Rp 28 Juta-an</strong>.<br>Keberangkatan Juni–Oktober 2026, Direct Flight, Hotel Dekat Masjid.</p>
    <a href="${waGeneral}" target="_blank" rel="noopener" class="btn btn--hero">${WA_SVG} Konsultasi via WhatsApp</a>
    <p class="hero__legal">PPIU U.490 · PIHK 304 · Izin Resmi Kemenag RI</p>
  </div>
</section>

<!-- SOCIAL PROOF -->
<section class="proof" data-anim>
  <div class="proof__in">
    <span>⭐ 4.9 Rating Google</span>
    <span class="proof__sep">·</span>
    <span>🕋 10.000+ Jamaah/Thn</span>
    <span class="proof__sep">·</span>
    <span>🎬 Dipercaya Deddy Mizwar, Ferdian Ariyadi & tokoh publik lainnya</span>
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
  <div class="geo"></div>
  <div class="sec__label" data-anim>Mengapa Alhijaz?</div>
  <h2 class="sec__title" data-anim>Travel Umroh yang Bisa Anda Percaya</h2>
  <div class="trust-grid" data-anim>
    <div class="trust-card"><span class="ic">🏅</span><h4>Akreditasi "A"</h4><p>Standar tertinggi dari KAN</p></div>
    <div class="trust-card"><span class="ic">📋</span><h4>Resmi Kemenag RI</h4><p>PPIU & PIHK aktif dan diawasi</p></div>
    <div class="trust-card"><span class="ic">🕌</span><h4>Hotel Dekat Masjid</h4><p>Lokasi Ring 1, menit dari Haram & Nabawi</p></div>
    <div class="trust-card"><span class="ic">🏢</span><h4>Gedung Milik Sendiri</h4><p>4 lantai di Cawang, Jakarta Timur</p></div>
    <div class="trust-card"><span class="ic">✈️</span><h4>Direct Flight</h4><p>Penerbangan langsung tanpa transit</p></div>
    <div class="trust-card"><span class="ic">👥</span><h4>10.000+ Jamaah/Tahun</h4><p>Pengalaman besar, sistem teruji</p></div>
  </div>
</section>

<!-- CLOSING CTA -->
<section class="closing" data-anim>
  <div class="closing__in">
    <h2>Niat Sudah Ada,<br>Tinggal <em>Satu Langkah Lagi.</em></h2>
    <p>Kursi terbatas untuk setiap keberangkatan. Jangan tunda lagi.</p>
    <a href="${waGeneral}" target="_blank" rel="noopener" class="btn btn--hero">${WA_SVG} Konsultasi via WhatsApp</a>
    <p class="closing__hint">Tim kami siap membantu Anda memilih paket yang tepat. Konsultasi gratis, tanpa komitmen.</p>
  </div>
</section>

<!-- FOOTER -->
<footer>
  <div class="wrap">
    <div class="footer__brand">PT Alhijaz Indowisata</div>
    <p>Jl. Dewi Sartika, Cawang, Jakarta Timur</p>
    <p>PPIU U.490 Tahun 2020 · PIHK 304 Tahun 2022</p>
    <div class="footer__legal">© 2026 PT Alhijaz Indowisata. All rights reserved.</div>
  </div>
</footer>

<!-- STICKY BAR -->
<div class="sticky" id="stickyBar">
  <div class="sticky__in">
    <div class="sticky__text">
      <strong>Umroh Mulai Rp 28 Juta</strong>
      <p>Pasti Berangkat · Akreditasi "A"</p>
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