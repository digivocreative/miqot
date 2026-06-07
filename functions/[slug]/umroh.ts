/**
 * Cloudflare Pages Function — Umroh Landing Page
 * Served at /:slug/umroh
 * Reads the original HTML from /public/umroh.html and replaces
 * WhatsApp links with agent-specific links, injects sticky agent bar.
 */
import { replaceFaIcons, rewriteAssetsToCdn, LANDING_FONT_CSS, SVG_FA_CSS, FONT_PRELOAD_HTML } from './fa-icons';

export const AGENTS: Record<string, { name: string; phone: string; website: string; photo: string }> = {
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

const WA_PATH = 'M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z';
const WA_SVG = '<svg viewBox="0 0 24 24" fill="currentColor" style="width:20px;height:20px"><path d="' + WA_PATH + '"/><' + '/svg>';

function buildStickyBarAndFab(agentName: string, agentPhoto: string, waUrl: string): string {
  const css = [
    '<st' + 'yle>',
    '.alhijaz-sticky{position:fixed;bottom:0;left:0;right:0;z-index:99999;background:rgba(255,255,255,.96);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border-top:1px solid #e2e8f0;padding:10px 16px;transform:translateY(100%);transition:transform .4s cubic-bezier(.16,1,.3,1)}',
    '.alhijaz-sticky.show{transform:none}',
    '.alhijaz-sticky__in{max-width:520px;margin:0 auto;display:flex;align-items:center;gap:12px}',
    '.alhijaz-sticky__avatar{position:relative;width:40px;height:40px;flex-shrink:0}',
    '.alhijaz-sticky__avatar img{width:40px;height:40px;border-radius:50%;object-fit:cover;border:2px solid #F5E0E0}',
    '.alhijaz-sticky__badge{position:absolute;bottom:-1px;right:-1px;width:16px;height:16px;border-radius:50%;background:#fff;display:flex;align-items:center;justify-content:center;box-shadow:0 1px 3px rgba(0,0,0,.1)}',
    '.alhijaz-sticky__text{flex:1;min-width:0}',
    ".alhijaz-sticky__text strong{font-size:13.5px;color:#0F172A;display:block;line-height:1.3;font-family:'Inter','Montserrat',sans-serif}",
    ".alhijaz-sticky__text p{font-size:11px;color:#9A000C;font-weight:600;margin:0;font-family:'Inter','Montserrat',sans-serif}",
    ".alhijaz-btn--sticky{display:inline-flex!important;align-items:center!important;gap:8px!important;padding:11px 22px!important;border-radius:50px!important;font-size:13.5px!important;font-weight:700!important;font-family:'Inter','Montserrat',sans-serif!important;background:#28B83C!important;color:#fff!important;white-space:nowrap!important;box-shadow:0 2px 10px rgba(40,184,60,.25)!important;border:2px solid #149626!important;text-decoration:none!important;transition:transform .15s,box-shadow .15s!important;line-height:1.4!important}",
    '.alhijaz-btn--sticky:hover{transform:translateY(-1px)!important;box-shadow:0 4px 16px rgba(40,184,60,.35)!important;background:#28B83C!important;color:#fff!important;border-color:#149626!important}',
    '.alhijaz-btn--sticky:active{transform:scale(.97)!important}',
    '.alhijaz-btn--sticky svg{width:20px!important;height:20px!important;fill:currentColor!important}',
    '.alhijaz-fab{position:fixed;bottom:20px;right:16px;z-index:99998;width:56px;height:56px;background:#25D366;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 18px rgba(37,211,102,.4);transition:opacity .3s,transform .3s;animation:alhijaz-glow 2.5s infinite;text-decoration:none}',
    '.alhijaz-fab svg{width:28px;height:28px;fill:#fff}',
    '.alhijaz-fab.hide{opacity:0;transform:scale(.5);pointer-events:none}',
    '@keyframes alhijaz-glow{0%,100%{box-shadow:0 4px 18px rgba(37,211,102,.4)}50%{box-shadow:0 4px 28px rgba(37,211,102,.6)}}',
    '</st' + 'yle>',
  ].join('\n');

  const WA_PATH = 'M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z';

  const stickyBar = '<div class="alhijaz-sticky" id="alhijazStickyBar"><div class="alhijaz-sticky__in">'
    + '<div class="alhijaz-sticky__avatar">'
    + '<img src="' + agentPhoto + '" alt="' + agentName + '" loading="eager">'
    + '<div class="alhijaz-sticky__badge"><svg width="12" height="12" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="12" fill="#1DA1F2"/><path d="M9.5 12.5L11 14L15 10" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg></div>'
    + '</div>'
    + '<div class="alhijaz-sticky__text"><strong>' + agentName + '</strong><p>Konsultasi Gratis</p></div>'
    + '<a href="' + waUrl + '" target="_blank" rel="noopener" class="alhijaz-btn--sticky">' + WA_SVG + ' Chat WA</a>'
    + '</div></div>';

  const fab = '<a href="' + waUrl + '" target="_blank" rel="noopener" class="alhijaz-fab" id="alhijazFab" aria-label="WhatsApp">'
    + '<svg viewBox="0 0 24 24"><path d="' + WA_PATH + '"/></svg></a>';

  const js = '<sc' + 'ript>'
    + '(function(){'
    + "var bar=document.getElementById('alhijazStickyBar'),fab=document.getElementById('alhijazFab');"
    + 'if(!bar||!fab)return;'
    + "var hero=document.querySelector('.elementor-element-64c34f3d')||document.querySelector('.elementor-top-section');"
    + 'var hH=hero?hero.offsetHeight:400,on=false;'
    + "function chk(){var y=window.scrollY||window.pageYOffset;if(y>hH&&!on){bar.classList.add('show');fab.classList.add('hide');on=true}else if(y<=hH&&on){bar.classList.remove('show');fab.classList.remove('hide');on=false}}"
    + "window.addEventListener('scroll',chk,{passive:true});chk();"
    + '})();'
    + '</sc' + 'ript>';

  return css + '\n' + stickyBar + '\n' + fab + '\n' + js;
}

interface AgentOverride {
  name?: string;
  phone?: string;
  photo?: string;
  landing?: {
    title?: string | null;
    description?: string | null;
    og_image_url?: string | null;
  };
}

function escapeHtmlAttr(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function generateHTML(slug: string, agentOverride?: AgentOverride): Promise<string> {
  const agent = AGENTS[slug];
  const phone = agentOverride?.phone || agent?.phone || DEFAULT_PHONE;
  const agentName = agentOverride?.name || agent?.name || slug.charAt(0).toUpperCase() + slug.slice(1);
  const agentPhoto = agentOverride?.photo
    || 'https://sb.alhijaz.co/storage/v1/object/public/agent-photos/' + slug + '.jpg';
  const waBase = 'https://api.whatsapp.com/send?phone=' + phone;

  // Read the original HTML template
  // Dev (Vite SSR): read from disk via fs
  // Production (Cloudflare Workers): fetch via HTTP from static asset
  let html: string;
  try {
    const { readFileSync, existsSync } = await import('fs');
    const { dirname, resolve } = await import('path');
    const { fileURLToPath } = await import('url');
    const __dir = dirname(fileURLToPath(import.meta.url));
    // Dev (Vite SSR): TS source lives at functions/[slug]/umroh.ts → ../../public.
    // Prod: esbuild output at functions/umroh-landing.mjs → ../public.
    const candidates = [
      resolve(__dir, '../public/umroh.html'),
      resolve(__dir, '../../public/umroh.html'),
    ];
    const fsPath = candidates.find((p) => existsSync(p));
    if (!fsPath) throw new Error('umroh.html not found in expected locations');
    html = readFileSync(fsPath, 'utf-8');
  } catch {
    // Cloudflare Workers: no fs — fetch from own origin as static asset
    const res = await fetch('https://alhijaz.co/umroh.html');
    if (!res.ok) throw new Error('Failed to fetch umroh.html template: ' + res.status);
    html = await res.text();
  }

  // 1. Replace WhatsApp links (generic regex approach)
  //    Template standalone memakai wa.me/<DEFAULT_PHONE>?text=... — rewrite ke nomor agent.
  //    With message param: preserve the original message text
  html = html.replace(/https:\/\/wa\.me\/\d+\?text=([^"]*)/g, waBase + '&text=$1');
  //    Bare link (no text param): add default umroh text
  html = html.replace(/https:\/\/wa\.me\/\d+(?=["'])/g, waBase + '&text=Assalamualaikum%2C%20Saya%20mau%20tanya%20Paket%20Umroh%20di%20Alhijaz');

  // 2. Update <title>, og:title, meta description, and og:image using landing config (or defaults)
  const customTitle = agentOverride?.landing?.title;
  const pageTitle = customTitle || ('Umroh | ' + agentName + ' | PT Alhijaz Indowisata');
  const safeTitle = escapeHtmlAttr(pageTitle);
  html = html.replace(
    /<title>Paket Umroh \| Travel Umroh Terbaik \| PT Alhijaz Indowisata<\/title>/,
    '<title>' + safeTitle + '<' + '/title>'
  );
  html = html.replace(
    /(<meta property="og:title" content=")Paket Umroh \| Travel Umroh Terbaik \| PT Alhijaz Indowisata(")/,
    '$1' + safeTitle + '$2'
  );

  // Meta description — only inject when agent has customized (keeps backward compat for everyone else)
  const customDescription = agentOverride?.landing?.description;
  if (customDescription) {
    const safeDesc = escapeHtmlAttr(customDescription);
    html = html.replace(
      /(<meta\s+name=["']description["']\s+content=["'])[^"']*(["'])/i,
      '$1' + safeDesc + '$2'
    );
    html = html.replace(
      /(<meta\s+property=["']og:description["']\s+content=["'])[^"']*(["'])/i,
      '$1' + safeDesc + '$2'
    );
  }

  // og:image — custom URL if set, otherwise the default generated /og/{slug}.png
  const customOg = agentOverride?.landing?.og_image_url;
  const ogImageUrl = customOg || ('https://alhijaz.co/og/' + slug + '.png');
  html = html.replace(
    /(<meta property="og:image" content=")[^"]*(")/,
    '$1' + escapeHtmlAttr(ogImageUrl) + '$2'
  );

  // ═══════════════════════════════════════════════════
  // 3. REMOVE UNNECESSARY CSS
  // ═══════════════════════════════════════════════════

  // Font Awesome: replace 3 individual CORS-blocked stylesheets with 1 CDN version
  html = html.replace(/<link[^>]*elementor-icons-shared-0-css[^>]*\/>/g, '');
  html = html.replace(/<link[^>]*elementor-icons-fa-solid-css[^>]*\/>/g, '');
  html = html.replace(/<link[^>]*elementor-icons-fa-brands-css[^>]*\/>/g, '');

  // Elementor Icons (eicons) — not used on this page, no eicon- classes found
  html = html.replace(/<link[^>]*elementor-icons-css[^>]*\/>/g, '');

  // Google Fonts: hapus link multi-family bawaan WP — font kini self-host (lihat fa-icons.ts)
  html = html.replace(/<link[^>]*google-fonts-1-css[^>]*\/>/g, '');
  // Hapus juga preconnect Google Fonts bawaan template (tidak relevan lagi)
  html = html.replace(/<link rel="preconnect" href="https:\/\/fonts\.gstatic\.com\/?"[^>]*>/g, '');
  //    Inject font self-host + preload LCP sebelum </head> (ikon: inline SVG, tanpa CSS eksternal)
  html = html.replace(
    '</head>',
    FONT_PRELOAD_HTML
    // Hero background = kandidat LCP; CSS bg baru ke-discover setelah parse CSS → preload.
    + '<link rel="preload" href="/wp-content/uploads/2024/09/pt-alhijaz-indowisata.webp" as="image" fetchpriority="high">'
    + '<st' + 'yle>'
    + LANDING_FONT_CSS
    + SVG_FA_CSS
    // ── Uniform all WA/CTA buttons (all screens) ──
    + '.elementor-1291 .elementor-button{background-color:#28B83C!important;border-color:#149626!important;color:#fff!important;border-radius:50px!important;border-style:solid!important;border-width:3px!important;font-family:"Inter",sans-serif!important;font-weight:600!important;transition:background-color .2s,transform .2s!important}'
    + '.elementor-1291 .elementor-button:hover,.elementor-1291 .elementor-button:focus{background-color:#1DA855!important;transform:translateY(-1px)!important}'
    + '.elementor-1291 .elementor-button:active{transform:scale(.97)!important}'
    // ── Hide lottie widget (CORS-blocked animation) ──
    + '.elementor-widget-lottie{display:none!important}'
    // ── Spacing after voucher section removed ──
    + '.elementor-element-4c9c46b3{margin-top:40px!important}'
    // ── Hero WA button fix (all screens) ──
    + '.elementor-element-796244f7 .elementor-button{font-size:16px!important;padding:14px 30px!important;border-color:#149626!important}'
    + '.elementor-element-796244f7 > .elementor-widget-container{margin:20px 0 0!important}'
    // ── Mobile responsive overrides ──
    + '@media(max-width:767px){'
    // Hero "Umroh Pasti Berangkat" heading (60px → 32px)
    + '.elementor-element-25901017 .elementor-heading-title{font-size:32px!important;line-height:40px!important}'
    // Hero WA button mobile
    + '.elementor-element-796244f7 .elementor-button{font-size:15px!important;padding:13px 24px!important}'
    + '.elementor-element-796244f7 > .elementor-widget-container{margin:15px 0 0!important}'
    // Section headings (46-50px → 24px)
    + '.elementor-element-83b623f .elementor-heading-title,'
    + '.elementor-element-7ef60bcc .elementor-heading-title,'
    + '.elementor-element-61fac271 .elementor-heading-title,'
    + '.elementor-element-14a03f8b .elementor-heading-title,'
    + '.elementor-element-1d41e06a .elementor-heading-title'
    + '{font-size:24px!important;line-height:32px!important}'
    // Icon box icons (41px → 28px)
    + '.elementor-element-6d00c198 .elementor-icon,'
    + '.elementor-element-5c4b7ac7 .elementor-icon,'
    + '.elementor-element-553ebb7e .elementor-icon,'
    + '.elementor-element-4baee391 .elementor-icon,'
    + '.elementor-element-18727aa0 .elementor-icon'
    + '{font-size:28px!important}'
    + '}'
    + '</st' + 'yle>\n'
    + '<' + '/head>'
  );

  // 4. Remove voucher promo section (element defd89e)
  html = html.replace(/<section[^>]*elementor-element-defd89e[\s\S]*?<\/section>\s*(?=\s*<section)/, '');

  // 5. Remove "Konsultasi via WA (Fast Response)" sticky bar from original page
  html = html.replace(/<div class="heading-wa">[\s\S]*?<\/div>\s*<\/div>/g, '');

  // 5. Remove 4 specific images from ulasan carousel
  const removeImages = [
    '2026/03/4-1.avif',
    '2026/03/3.avif',
    '2026/03/2.avif',
    '2026/03/1.avif',
  ];
  for (const img of removeImages) {
    // Each image is inside a <div class="swiper-slide" ...>...</div>
    const escaped = img.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    html = html.replace(new RegExp('<div class="swiper-slide"[^>]*>\\s*<figure[^>]*>\\s*<img[^>]*' + escaped + '[^>]*/>\\s*</figure>\\s*</div>', 'g'), '');
  }

  // 5. Remove footer section (Nikita profile, legalitas, rekening) — element id 26b2a887
  html = html.replace(/<section[^>]*elementor-element-26b2a887[\s\S]*?<\/section>\s*(?=\s*<\/div>\s*<\/main>)/, '');

  // ═══════════════════════════════════════════════════
  // 7. REMOVE TRACKING & UNNECESSARY SCRIPTS
  // ═══════════════════════════════════════════════════

  // GTM (inline + noscript)
  html = html.replace(/<!-- Google Tag Manager \(noscript\) -->[\s\S]*?<!-- End Google Tag Manager \(noscript\) -->/g, '');
  html = html.replace(/<!-- Google Tag Manager -->[\s\S]*?<!-- End Google Tag Manager -->/g, '');
  // Google Ads gtag
  html = html.replace(/<!-- Google tag \(gtag\.js\) -->/g, '');
  html = html.replace(/<script[^>]*googletagmanager\.com\/gtag[^>]*><\/script>/g, '');
  html = html.replace(/<script>\s*window\.dataLayer[\s\S]*?<\/script>/g, '');
  // Facebook Pixel (inline + noscript)
  html = html.replace(/<meta name="facebook-domain-verification"[^>]*>/g, '');
  html = html.replace(/<!-- Facebook Pixel Code -->[\s\S]*?<!-- End Facebook Pixel Code -->/g, '');
  // Cloudflare challenge script
  html = html.replace(/<script>\(function\(\)\{function c\(\)[\s\S]*?<\/script>/g, '');
  // Yoast JSON-LD (references alhijazindonesia.com, not relevant for agent page)
  html = html.replace(/<script type="application\/ld\+json" class="yoast-schema-graph">[\s\S]*?<\/script>/g, '');
  // flying-press vitals (analytics)
  html = html.replace(/<script[^>]*flying-press-vitals-js-extra[\s\S]*?<\/script>/g, '');
  html = html.replace(/<script[^>]*flying-press[^>]*><\/script>/g, '');
  // LandingPress theme JS
  html = html.replace(/<script[^>]*landingpress-js[^>]*><\/script>/g, '');
  // KEEP: jQuery UI core (Elementor frontend depends on it)
  // WA link cleaner script (was for wa.alhijazindonesia.com, no longer relevant)
  html = html.replace(/<script>\s*\(function\(\)\{\s*function getCookie[\s\S]*?<\/script>/g, '');

  // Remove lottie.min.js (animation JSON hosted on alhijazindonesia.com is CORS-blocked)
  html = html.replace(/<script[^>]*lottie-js[^>]*><\/script>/g, '');
  // Hide lottie widget via CSS (removing HTML is risky — breaks nested div structure)
  // The widget is already elementor-hidden-tablet elementor-hidden-mobile, just hide desktop too
  // Remove jQuery.noConflict inline script (runs before jQuery is loaded, causes ReferenceError)
  html = html.replace(/<script type="text\/javascript">\s*var \$jQuerySelf[\s\S]*?<\/script>/g, '');

  // KEEP: e-gallery.min.js, jquery.sticky.min.js (used on umroh page)
  // KEEP: waypoints, elementor-frontend-js-before config, elements-handlers (needed for Swiper carousel)

  // Remove canonical URL pointing to alhijazindonesia.com (not relevant for agent page)
  html = html.replace(/<link rel="canonical"[^>]*\/>/g, '');
  // Remove shortlink
  html = html.replace(/<link rel='shortlink'[^>]*\/>/g, '');
  // Remove robots meta (agent page indexing handled separately)
  html = html.replace(/<meta name='robots'[^>]*\/>/g, '');

  // ═══════════════════════════════════════════════════
  // 8. PERFORMANCE OPTIMIZATIONS
  // ═══════════════════════════════════════════════════

  // Ganti semua <i class="fa..."> dengan inline SVG (lepas dependensi icon-font/cdnjs)
  html = replaceFaIcons(html);

  // Gambar promo (LCP sekunder, above-fold) jangan kena blanket lazy di bawah
  html = html.replace(/(<img(?![^>]*loading=)[^>]*umroh-promo-milad[^>]*?)(\/?>)/, '$1 loading="eager" fetchpriority="high" $2');

  // Add lazy loading to all images that don't already have it
  html = html.replace(/(<img(?![^>]*loading=)[^>]*)(\/?>)/g, '$1 loading="lazy" $2');

  // Remove fetchpriority="high" from non-hero images (only first image should be high priority)
  // Keep decoding="async" for performance

  // 5. Inject sticky bar + FAB before </body>
  const stickyBarHtml = buildStickyBarAndFab(agentName, agentPhoto, waBase + '&text=Assalamualaikum%2C%20Saya%20mau%20tanya%20Paket%20Umroh%20di%20Alhijaz');

  // 6. Inject CAPI tracking script (PageView on load, Contact on WA click)
  const capiScript = '<sc' + 'ript>'
    + '(function(){'
    + 'var s="' + slug + '";'
    + 'function gc(n){var v="; "+document.cookie,p=v.split("; "+n+"=");if(p.length===2)return p.pop().split(";").shift();return""}'
    + 'function fire(k){try{var b={eventKey:k,eventId:k+"-"+Date.now()+"-"+Math.random().toString(36).slice(2,8),sourceUrl:location.href,userAgent:navigator.userAgent,fbc:gc("_fbc"),fbp:gc("_fbp"),timestamp:Math.floor(Date.now()/1000)};'
    + 'var u="/api/capi/"+s+"/event",bl=new Blob([JSON.stringify(b)],{type:"application/json"});'
    + 'if(navigator.sendBeacon)navigator.sendBeacon(u,bl);else fetch(u,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(b),keepalive:true}).catch(function(){})'
    + '}catch(e){}}'
    + 'console.log("[CAPI] \\ud83d\\udfe2 pageView",{slug:s,url:location.href});fire("pageView");'
    + 'document.addEventListener("click",function(e){var t=e.target;if(t.closest&&(t.closest("a[href*=\\"wa.me\\"]")||t.closest("a[href*=\\"whatsapp.com\\"]")||t.closest(".alhijaz-btn--sticky")||t.closest(".alhijaz-fab")||t.closest("a[href*=\\"api.whatsapp\\"]"))){console.log("[CAPI] \\ud83d\\udfe2 contact",{slug:s,url:location.href});fire("contact")}});'
    + '})();'
    + '</sc' + 'ript>';

  html = html.replace('</body>', stickyBarHtml + '\n' + capiScript + '\n</body>');

  // 6. Add padding-bottom to body so sticky bar doesn't overlap content
  html = html.replace(
    /<body /,
    '<body style="padding-bottom:76px" '
  );

  // ═══════════════════════════════════════════════════
  // 8b. BUNNY CDN REWRITE (env-gated; tanpa env tetap self-hosted/relatif)
  // ═══════════════════════════════════════════════════
  html = rewriteAssetsToCdn(html);

  // ═══════════════════════════════════════════════════
  // 9. MINIFY OUTPUT
  // ═══════════════════════════════════════════════════
  // Remove HTML comments (except conditional IE comments)
  html = html.replace(/<!--(?!\[if)[\s\S]*?-->/g, '');
  // Collapse multiple whitespace/newlines into single space (except inside <pre>, <script>, <style>)
  html = html.replace(/\n\s*\n/g, '\n');
  html = html.replace(/^\s+$/gm, '');
  // Remove whitespace between tags
  html = html.replace(/>\s+</g, '> <');

  return html;
}

export const onRequest = async (context: { params: { slug: string }; request: Request }) => {
  const slug = (context.params.slug || '').toLowerCase();
  const agentOverride = (context as any).agentOverride as AgentOverride | undefined;
  return new Response(await generateHTML(slug, agentOverride), {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
  });
};
