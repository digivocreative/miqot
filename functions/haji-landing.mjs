const AGENTS = {
  "bagas": { name: "Bagas Pramudita", phone: "6287878573311", website: "alhijaz.co", photo: "/agents/bagas.jpg" },
  "nikita": { name: "Nikita", phone: "62822900020", website: "alhijazindonesia.com", photo: "/agents/nikita.jpg" },
  "nila": { name: "Nila Novita Sari", phone: "6285211209049", website: "alhijaztourtravels.com", photo: "/agents/nila.jpg" },
  "andra": { name: "Andra Olivia", phone: "628129909795", website: "travelalhijazwisata.com", photo: "/agents/andra.jpg" },
  "dyah": { name: "Dyah Ratna Witri", phone: "6281385975678", website: "alhijaztraveltours.com", photo: "/agents/dyah.jpg" },
  "widi": { name: "Widi Purwanti", phone: "6287820813228", website: "alhijaz-hajiumroh.com", photo: "/agents/widi.jpg" },
  "aulia": { name: "Aulia", phone: "6282110407229", website: "alhijazumrohtravel.com", photo: "/agents/aulia.jpg" },
  "selfiah": { name: "Selfiah Handayani", phone: "6281410478212", website: "alhijaztourtravel.co.id", photo: "/agents/selfiah.jpg" },
  "zakia": { name: "Rahima Zakia", phone: "6285158005623", website: "alhijazbirowisata.com", photo: "/agents/zakia.jpg" },
  "dianwahyuni": { name: "Dian Wahyuni", phone: "6283197968407", website: "alhijazindowisatatours.com", photo: "/agents/dianwahyuni.jpg" },
  "anne": { name: "Anne Suryani", phone: "628129953424", website: "hajialhijaz.com", photo: "/agents/anne.jpg" },
  "evi": { name: "Evi Chaniago", phone: "6281806742789", website: "alhijazbirohajiumroh.com", photo: "/agents/evi.jpg" },
  "yenita": { name: "Yenita", phone: "6281316803128", website: "alhijazumrahtravel.com", photo: "/agents/yenita.jpg" },
  "indah": { name: "Indah Permata", phone: "6281943631008", website: "alhijaztraveltour.com", photo: "/agents/indah.jpg" },
  "aisyah": { name: "Siti Aisyah", phone: "6281225600900", website: "travelalhijazumrah.com", photo: "/agents/aisyah.jpg" },
  "siska": { name: "Siska Fadia", phone: "6281188885291", website: "alhijazumroh.com", photo: "/agents/siska.jpg" },
  "linda": { name: "Nurlinda Dewi", phone: "6282112094089", website: "alhijazcallcenter.com", photo: "/agents/linda.jpg" },
  "nina": { name: "Nina", phone: "6285943191075", website: "alhijazumrahtours.com", photo: "/agents/nina.jpg" },
  "sari": { name: "Sari", phone: "6281907018220", website: "alhijaz.co/sari", photo: "/agents/sari.jpg" },
  "isti": { name: "Isti", phone: "6281315002460", website: "al-hijaztravelumroh.com", photo: "/agents/isti.jpg" },
  "ferra": { name: "Ferra", phone: "62811802789", website: "alhijaztourtravel.id", photo: "/agents/ferra.jpg" },
  "jan-praba": { name: "Jan Praba", phone: "62816728940", website: "alhijaz.co/jan-praba", photo: "/agents/jan-praba.jpg" },
  "ekawati": { name: "Ekawati", phone: "62816728904", website: "alhijaz.co/ekawati", photo: "/agents/ekawati.jpg" }
};
const DEFAULT_PHONE = "62822900020";
const WA_PATH = "M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z";
const WA_SVG = '<svg viewBox="0 0 24 24" fill="currentColor" style="width:20px;height:20px"><path d="' + WA_PATH + '"/></svg>';
function buildStickyBarAndFab(agentName, agentPhoto, waUrl) {
  const css = [
    "<style>",
    ".alhijaz-sticky{position:fixed;bottom:0;left:0;right:0;z-index:99999;background:rgba(255,255,255,.96);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border-top:1px solid #e2e8f0;padding:10px 16px;transform:translateY(100%);transition:transform .4s cubic-bezier(.16,1,.3,1)}",
    ".alhijaz-sticky.show{transform:none}",
    ".alhijaz-sticky__in{max-width:520px;margin:0 auto;display:flex;align-items:center;gap:12px}",
    ".alhijaz-sticky__avatar{position:relative;width:40px;height:40px;flex-shrink:0}",
    ".alhijaz-sticky__avatar img{width:40px;height:40px;border-radius:50%;object-fit:cover;border:2px solid #F5E0E0}",
    ".alhijaz-sticky__badge{position:absolute;bottom:-1px;right:-1px;width:16px;height:16px;border-radius:50%;background:#fff;display:flex;align-items:center;justify-content:center;box-shadow:0 1px 3px rgba(0,0,0,.1)}",
    ".alhijaz-sticky__text{flex:1;min-width:0}",
    ".alhijaz-sticky__text strong{font-size:13.5px;color:#0F172A;display:block;line-height:1.3;font-family:'Inter','Montserrat',sans-serif}",
    ".alhijaz-sticky__text p{font-size:11px;color:#9A000C;font-weight:600;margin:0;font-family:'Inter','Montserrat',sans-serif}",
    ".alhijaz-btn--sticky{display:inline-flex!important;align-items:center!important;gap:8px!important;padding:11px 22px!important;border-radius:50px!important;font-size:13.5px!important;font-weight:700!important;font-family:'Inter','Montserrat',sans-serif!important;background:#28B83C!important;color:#fff!important;white-space:nowrap!important;box-shadow:0 2px 10px rgba(40,184,60,.25)!important;border:2px solid #149626!important;text-decoration:none!important;transition:transform .15s,box-shadow .15s!important;line-height:1.4!important}",
    ".alhijaz-btn--sticky:hover{transform:translateY(-1px)!important;box-shadow:0 4px 16px rgba(40,184,60,.35)!important;background:#28B83C!important;color:#fff!important;border-color:#149626!important}",
    ".alhijaz-btn--sticky:active{transform:scale(.97)!important}",
    ".alhijaz-btn--sticky svg{width:20px!important;height:20px!important;fill:currentColor!important}",
    ".alhijaz-fab{position:fixed;bottom:20px;right:16px;z-index:99998;width:56px;height:56px;background:#25D366;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 18px rgba(37,211,102,.4);transition:opacity .3s,transform .3s;animation:alhijaz-glow 2.5s infinite;text-decoration:none}",
    ".alhijaz-fab svg{width:28px;height:28px;fill:#fff}",
    ".alhijaz-fab.hide{opacity:0;transform:scale(.5);pointer-events:none}",
    "@keyframes alhijaz-glow{0%,100%{box-shadow:0 4px 18px rgba(37,211,102,.4)}50%{box-shadow:0 4px 28px rgba(37,211,102,.6)}}",
    "</style>"
  ].join("\n");
  const WA_PATH2 = "M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z";
  const stickyBar = '<div class="alhijaz-sticky" id="alhijazStickyBar"><div class="alhijaz-sticky__in"><div class="alhijaz-sticky__avatar"><img src="' + agentPhoto + '" alt="' + agentName + '" loading="eager"><div class="alhijaz-sticky__badge"><svg width="12" height="12" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="12" fill="#1DA1F2"/><path d="M9.5 12.5L11 14L15 10" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg></div></div><div class="alhijaz-sticky__text"><strong>' + agentName + '</strong><p>Konsultasi Gratis</p></div><a href="' + waUrl + '" target="_blank" rel="noopener" class="alhijaz-btn--sticky">' + WA_SVG + " Chat WA</a></div></div>";
  const fab = '<a href="' + waUrl + '" target="_blank" rel="noopener" class="alhijaz-fab" id="alhijazFab" aria-label="WhatsApp"><svg viewBox="0 0 24 24"><path d="' + WA_PATH2 + '"/></svg></a>';
  const js = "<script>(function(){var bar=document.getElementById('alhijazStickyBar'),fab=document.getElementById('alhijazFab');if(!bar||!fab)return;var hero=document.querySelector('.elementor-element-f55e3ca')||document.querySelector('.elementor-top-section');var hH=hero?hero.offsetHeight:400,on=false;function chk(){var y=window.scrollY||window.pageYOffset;if(y>hH&&!on){bar.classList.add('show');fab.classList.add('hide');on=true}else if(y<=hH&&on){bar.classList.remove('show');fab.classList.remove('hide');on=false}}window.addEventListener('scroll',chk,{passive:true});chk();})();</script>";
  return css + "\n" + stickyBar + "\n" + fab + "\n" + js;
}
async function generateHTML(slug, agentOverride) {
  const agent = AGENTS[slug];
  const phone = agentOverride?.phone || agent?.phone || DEFAULT_PHONE;
  const agentName = agentOverride?.name || agent?.name || slug.charAt(0).toUpperCase() + slug.slice(1);
  const agentPhoto = agentOverride?.photo || "https://xicthdsuvmwwuvwvvbqa.supabase.co/storage/v1/object/public/agent-photos/" + slug + ".jpg";
  const waGeneral = "https://api.whatsapp.com/send?phone=" + phone + "&text=Assalamualaikum%2C%20Saya%20mau%20tanya%20Paket%20Haji%20Khusus%20di%20Alhijaz";
  const waPembiayaan = "https://api.whatsapp.com/send?phone=" + phone + "&text=Assalamualaikum%2C%20Saya%20mau%20tanya%20Program%20Pembiayaan%20Haji%20Plus%20di%20Alhijaz";
  let html;
  try {
    const { readFileSync } = await import("fs");
    const { dirname, resolve } = await import("path");
    const { fileURLToPath } = await import("url");
    const __dir = dirname(fileURLToPath(import.meta.url));
    html = readFileSync(resolve(__dir, "../../public/haji-plus.html"), "utf-8");
  } catch {
    const res = await fetch("https://alhijaz.co/haji-plus.html");
    if (!res.ok)
      throw new Error("Failed to fetch haji-plus.html template: " + res.status);
    html = await res.text();
  }
  html = html.replace(
    /https:\/\/wa\.alhijazindonesia\.com\/\?message=Assalamualaikum,%20Saya%20mau%20tanya%20Paket%20Haji%20Khusus%20di%20Alhijaz/g,
    waGeneral
  );
  html = html.replace(
    /https:\/\/wa\.alhijazindonesia\.com\/\?message=Assalamualaikum,%20Saya%20mau%20tanya%20Program%20Pembiayaan%20Haji%20Plus%20di%20Alhijaz/g,
    waPembiayaan
  );
  const pageTitle = "Haji Plus | " + agentName + " | PT Alhijaz Indowisata";
  html = html.replace(
    /<title>Paket Haji Plus \| Haji Khusus \| PT Alhijaz Indowisata<\/title>/,
    "<title>" + pageTitle + "</title>"
  );
  html = html.replace(
    /(<meta property="og:title" content=")Paket Haji Plus \| Haji Khusus \| PT Alhijaz Indowisata(")/,
    "$1" + pageTitle + "$2"
  );
  html = html.replace(
    /(<meta property="og:image" content=")[^"]*(")/,
    "$1https://alhijaz.co/og/" + slug + ".png$2"
  );
  html = html.replace(/<link[^>]*elementor-icons-shared-0-css[^>]*\/>/g, "");
  html = html.replace(/<link[^>]*elementor-icons-fa-solid-css[^>]*\/>/g, "");
  html = html.replace(/<link[^>]*elementor-icons-fa-brands-css[^>]*\/>/g, "");
  html = html.replace(/<link[^>]*elementor-icons-fa-regular-css[^>]*\/>/g, "");
  html = html.replace(/<link[^>]*elementor-icons-css[^>]*\/>/g, "");
  html = html.replace(/<link[^>]*google-fonts-1-css[^>]*\/>/g, "");
  html = html.replace(
    "</head>",
    // Optimized Google Fonts: only Montserrat + Inter, only weights actually used
    '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Montserrat:wght@500;600;700;800&display=swap" rel="stylesheet"><link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.4/css/all.min.css" integrity="sha512-1ycn6IcaQQ40/MKBW2W4Rhis/DbILU74C1vSrLJxCq57o941Ym01SwNsOMqvEBFlcgUa6xLiPY/NS5R+E6ztJQ==" crossorigin="anonymous" referrerpolicy="no-referrer" />\n<style>.elementor-2333 .elementor-button{background-color:#28B83C!important;border-color:#149626!important;color:#fff!important;border-radius:50px!important;border-style:solid!important;border-width:3px!important;font-family:"Inter",sans-serif!important;font-weight:600!important;transition:background-color .2s,transform .2s!important}.elementor-2333 .elementor-button:hover,.elementor-2333 .elementor-button:focus{background-color:#1DA855!important;transform:translateY(-1px)!important}.elementor-2333 .elementor-button:active{transform:scale(.97)!important}@media(max-width:767px){.elementor-element-a80c529 .elementor-widget-container img{max-width:160px!important;height:auto!important}.elementor-element-a80c529{margin-bottom:0!important}.elementor-element-a80c529 .elementor-widget-container{margin:0!important;padding:0!important}.elementor-element-1bbf918 .elementor-heading-title{font-size:26px!important;line-height:34px!important}.elementor-element-1bbf918{margin-bottom:8px!important}.elementor-element-1bbf918 > .elementor-widget-container{padding:10px 0 0!important}.elementor-element-4626bd8 .elementor-heading-title{font-size:14px!important;line-height:24px!important}.elementor-element-4626bd8{margin-bottom:8px!important}.elementor-element-f55e3ca{padding:20px 0 10px!important}.elementor-element-7b80570 .elementor-heading-title{font-size:28px!important;line-height:36px!important}.elementor-element-7b80570 > .elementor-widget-container{padding:30px 0 0!important}.elementor-element-988fba5 .elementor-heading-title,.elementor-element-efc187a .elementor-heading-title,.elementor-element-dd9ad71 .elementor-heading-title,.elementor-element-dac095f .elementor-heading-title,.elementor-element-f0ad74c .elementor-heading-title,.elementor-element-a1c7e2d .elementor-heading-title,.elementor-element-9c09541 .elementor-heading-title,.elementor-element-21e0891 .elementor-heading-title,.elementor-element-f09fe04 .elementor-heading-title{font-size:24px!important;line-height:32px!important}.elementor-element-6f2dbdd .elementor-heading-title,.elementor-element-24369bd .elementor-heading-title,.elementor-element-14a6176 .elementor-heading-title{font-size:14px!important;line-height:24px!important}.elementor-element-2b0afe1 .elementor-icon-box-title,.elementor-element-153ede0 .elementor-icon-box-title,.elementor-element-09cae3b .elementor-icon-box-title{font-size:17px!important;line-height:24px!important}.elementor-element-2b0afe1 .elementor-icon-box-description,.elementor-element-153ede0 .elementor-icon-box-description,.elementor-element-09cae3b .elementor-icon-box-description{font-size:13px!important;line-height:20px!important}.elementor-element-7e1cd78 .elementor-image-box-title,.elementor-element-84b42ba .elementor-image-box-title,.elementor-element-ecbf32f .elementor-image-box-title{font-size:16px!important;line-height:22px!important}.elementor-element-7e1cd78 .elementor-image-box-description,.elementor-element-84b42ba .elementor-image-box-description,.elementor-element-ecbf32f .elementor-image-box-description{font-size:13px!important;line-height:20px!important}.elementor-element-a7d962c .elementor-icon-box-title,.elementor-element-a5492bb .elementor-icon-box-title,.elementor-element-bf86589 .elementor-icon-box-title{font-size:14px!important;line-height:20px!important}.elementor-element-94f52ce .elementor-icon,.elementor-element-3be1e29 .elementor-icon{font-size:40px!important}.elementor-element-94f52ce .elementor-icon-box-title,.elementor-element-3be1e29 .elementor-icon-box-title{font-size:20px!important;line-height:28px!important}.elementor-element-d74ff59 .elementor-heading-title,.elementor-element-20d6395 .elementor-heading-title{font-size:14px!important;line-height:22px!important}.elementor-element-68a1e72 .elementor-icon-list-text,.elementor-element-e9f801f .elementor-icon-list-text{font-size:13px!important}.elementor-element-1339e58 .elementor-heading-title{font-size:28px!important}.elementor-element-da0cba2 .elementor-icon-box-title,.elementor-element-c5d3acc .elementor-icon-box-title,.elementor-element-10f1321 .elementor-icon-box-title,.elementor-element-db62956 .elementor-icon-box-title,.elementor-element-cf0da53 .elementor-icon-box-title{font-size:13px!important;line-height:18px!important}.elementor-element-da0cba2 .elementor-icon,.elementor-element-c5d3acc .elementor-icon,.elementor-element-10f1321 .elementor-icon,.elementor-element-db62956 .elementor-icon,.elementor-element-cf0da53 .elementor-icon{font-size:28px!important}}</style>\n</head>'
  );
  html = html.replace(/<div class="heading-wa">[\s\S]*?<\/div>\s*<\/div>/g, "");
  const removeImages = [
    "2026/03/4-1.avif",
    "2026/03/3.avif",
    "2026/03/2.avif",
    "2026/03/1.avif"
  ];
  for (const img of removeImages) {
    const escaped = img.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    html = html.replace(new RegExp('<div class="swiper-slide"[^>]*>\\s*<figure[^>]*>\\s*<img[^>]*' + escaped + "[^>]*/>\\s*</figure>\\s*</div>", "g"), "");
  }
  html = html.replace(/<section[^>]*elementor-element-14608478[\s\S]*?<\/section>\s*(?=\s*<\/div>\s*<\/main>)/, "");
  html = html.replace(/<!-- Google Tag Manager \(noscript\) -->[\s\S]*?<!-- End Google Tag Manager \(noscript\) -->/g, "");
  html = html.replace(/<!-- Google Tag Manager -->[\s\S]*?<!-- End Google Tag Manager -->/g, "");
  html = html.replace(/<!-- Google tag \(gtag\.js\) -->/g, "");
  html = html.replace(/<script[^>]*googletagmanager\.com\/gtag[^>]*><\/script>/g, "");
  html = html.replace(/<script>\s*window\.dataLayer[\s\S]*?<\/script>/g, "");
  html = html.replace(/<meta name="facebook-domain-verification"[^>]*>/g, "");
  html = html.replace(/<!-- Facebook Pixel Code -->[\s\S]*?<!-- End Facebook Pixel Code -->/g, "");
  html = html.replace(/<script>\(function\(\)\{function c\(\)[\s\S]*?<\/script>/g, "");
  html = html.replace(/<script type="application\/ld\+json" class="yoast-schema-graph">[\s\S]*?<\/script>/g, "");
  html = html.replace(/<script[^>]*flying-press-vitals-js-extra[\s\S]*?<\/script>/g, "");
  html = html.replace(/<script[^>]*flying-press[^>]*><\/script>/g, "");
  html = html.replace(/<script[^>]*landingpress-js[^>]*><\/script>/g, "");
  html = html.replace(/<script>\s*\(function\(\)\{\s*function getCookie[\s\S]*?<\/script>/g, "");
  html = html.replace(/<script[^>]*elementor-sticky-js[^>]*><\/script>/g, "");
  html = html.replace(/<link rel="canonical"[^>]*\/>/g, "");
  html = html.replace(/<link rel='shortlink'[^>]*\/>/g, "");
  html = html.replace(/<meta name='robots'[^>]*\/>/g, "");
  html = html.replace(/(<img(?![^>]*loading=)[^>]*)(\/?>)/g, '$1 loading="lazy" $2');
  const stickyBarHtml = buildStickyBarAndFab(agentName, agentPhoto, waGeneral);
  html = html.replace("</body>", stickyBarHtml + "\n</body>");
  html = html.replace(
    /<body /,
    '<body style="padding-bottom:76px" '
  );
  html = html.replace(/<!--(?!\[if)[\s\S]*?-->/g, "");
  html = html.replace(/\n\s*\n/g, "\n");
  html = html.replace(/^\s+$/gm, "");
  html = html.replace(/>\s+</g, "> <");
  return html;
}
const onRequest = async (context) => {
  const slug = (context.params.slug || "").toLowerCase();
  const agentOverride = context.agentOverride;
  return new Response(await generateHTML(slug, agentOverride), {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=3600" }
  });
};
export {
  AGENTS,
  onRequest
};
