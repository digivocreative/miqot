var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// api/ai-copy.ts
async function onRequestPost(context) {
  const { request, env } = context;
  const OPENAI_KEY = env.OPENAI_API_KEY;
  if (!OPENAI_KEY) {
    return new Response(
      JSON.stringify({ error: "OpenAI API key not configured" }),
      { status: 500, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
    );
  }
  try {
    const body = await request.json();
    const pkg = body.packageData;
    const agentName = body.agentName || "";
    const agentWebsite = body.agentWebsite || "";
    console.log("AI Copy request:", { nama: pkg?.nama, hasHotel: !!pkg?.hotel, hasHarga: !!pkg?.harga });
    if (!pkg || !pkg.nama) {
      return new Response(
        JSON.stringify({ error: "Missing packageData" }),
        { status: 400, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
      );
    }
    const hotelData = pkg.hotel || {};
    const depDate = pkg.keberangkatan?.tgl || "";
    const retDate = pkg.kepulangan?.tgl || "";
    const airline = pkg.maskapai || "";
    const flightCode = pkg.keberangkatan?.kodePenerbangan || "";
    const route = pkg.keberangkatan?.rute || "";
    const seatSisa = pkg.seatSisa ?? "";
    const seatTotal = pkg.seatTotal ?? "";
    let pricingInfo = "";
    const pricing = pkg.harga;
    if (pricing) {
      const prices = [];
      if (pricing.Quard) prices.push(`Quad: Rp ${Number(pricing.Quard).toLocaleString("id-ID")}`);
      if (pricing.Triple) prices.push(`Triple: Rp ${Number(pricing.Triple).toLocaleString("id-ID")}`);
      if (pricing.Double) prices.push(`Double: Rp ${Number(pricing.Double).toLocaleString("id-ID")}`);
      pricingInfo = prices.join(", ");
    }
    const systemPrompt = `Kamu adalah copywriter untuk travel umroh Alhijaz Indowisata.
Tugas kamu menulis caption promosi WhatsApp yang santai, hangat, dan persuasif tapi tetap islami.
Gunakan emoji secukupnya. Gunakan format WhatsApp (*bold*, _italic_) secukupnya.
Tulis dengan gaya ngobrol ke teman \u2014 friendly, tidak kaku, tidak terlalu formal.
Caption harus ringkas dan to the point, mudah dibaca di layar HP (maks 500 karakter).
Jangan gunakan hashtag. Jangan gunakan markdown selain format WhatsApp.
Jangan terlalu banyak baris kosong.`;
    const userPrompt = `Buatkan caption promosi WhatsApp untuk paket umroh ini:

Nama Paket: ${pkg.nama}
Maskapai: ${airline} (${flightCode})
Rute: ${route}
Tanggal Berangkat: ${depDate}
Tanggal Pulang: ${retDate}
Hotel Mekkah: ${hotelData?.mekkah_hotel || "-"} (${hotelData?.mekkah_bintang || "-"} bintang)
Hotel Madinah: ${hotelData?.madinah_hotel || "-"} (${hotelData?.madinah_bintang || "-"} bintang)
Sisa Seat: ${seatSisa} dari ${seatTotal}
Harga: ${pricingInfo || "Hubungi kami"}
${agentName ? `
Agent: ${agentName}` : ""}
${agentWebsite ? `Website: ${agentWebsite}` : ""}

Buat caption yang membuat orang tertarik untuk segera mendaftar.`;
    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENAI_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        temperature: 0.85,
        max_tokens: 380
      })
    });
    if (!openaiRes.ok) {
      const errBody = await openaiRes.text();
      console.error("OpenAI error:", errBody);
      return new Response(
        JSON.stringify({ error: "OpenAI API error", details: errBody }),
        { status: 502, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
      );
    }
    const result = await openaiRes.json();
    const generatedText = result.choices?.[0]?.message?.content || "";
    return new Response(
      JSON.stringify({ text: generatedText }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        }
      }
    );
  } catch (error) {
    console.error("AI Copy error:", error);
    return new Response(
      JSON.stringify({ error: "Internal error", message: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
    );
  }
}
__name(onRequestPost, "onRequestPost");
async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400"
    }
  });
}
__name(onRequestOptions, "onRequestOptions");

// api/[[path]].js
async function onRequest(context) {
  const { request, params } = context;
  const pathSegments = params.path || [];
  const path = pathSegments.join("/");
  if (path === "ai-copy") {
    return context.next();
  }
  const targetUrl = `https://jadwal.alhijaz.co/jadwal/${path}`;
  try {
    const response = await fetch(targetUrl, {
      method: request.method,
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json"
        // Don't forward host header
      }
    });
    const data = await response.text();
    return new Response(data, {
      status: response.status,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Cache-Control": "public, max-age=60"
        // Cache for 1 minute
      }
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: "Proxy error", message: error.message }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        }
      }
    );
  }
}
__name(onRequest, "onRequest");
async function onRequestOptions2() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400"
    }
  });
}
__name(onRequestOptions2, "onRequestOptions");

// brosur/[[path]].ts
var onRequest2 = /* @__PURE__ */ __name(async (context) => {
  const { request } = context;
  const url = new URL(request.url);
  const targetUrl = `https://jadwal.alhijaz.co${url.pathname}${url.search}`;
  try {
    const response = await fetch(targetUrl, {
      method: request.method,
      headers: {
        "User-Agent": request.headers.get("User-Agent") || "Mozilla/5.0",
        "Accept": request.headers.get("Accept") || "*/*"
      }
    });
    const newHeaders = new Headers(response.headers);
    newHeaders.set("Access-Control-Allow-Origin", "*");
    newHeaders.set("Access-Control-Allow-Methods", "GET, OPTIONS");
    newHeaders.set("Access-Control-Allow-Headers", "*");
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: newHeaders });
    }
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders
    });
  } catch (error) {
    return new Response("Proxy error", { status: 502 });
  }
}, "onRequest");

// itinerary/[[path]].ts
var onRequest3 = /* @__PURE__ */ __name(async (context) => {
  const { request } = context;
  const url = new URL(request.url);
  const targetUrl = `https://jadwal.alhijaz.co${url.pathname}${url.search}`;
  try {
    const response = await fetch(targetUrl, {
      method: request.method,
      headers: {
        "User-Agent": request.headers.get("User-Agent") || "Mozilla/5.0",
        "Accept": request.headers.get("Accept") || "*/*"
      }
    });
    const newHeaders = new Headers(response.headers);
    newHeaders.set("Access-Control-Allow-Origin", "*");
    newHeaders.set("Access-Control-Allow-Methods", "GET, OPTIONS");
    newHeaders.set("Access-Control-Allow-Headers", "*");
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: newHeaders });
    }
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders
    });
  } catch (error) {
    return new Response("Proxy error", { status: 502 });
  }
}, "onRequest");

// [slug]/haji.ts
var AGENTS = {
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
var DEFAULT_PHONE = "62822900020";
function formatPhone(phone) {
  const local = "0" + phone.slice(2);
  if (local.length <= 12) {
    return local.slice(0, 4) + "-" + local.slice(4, 8) + "-" + local.slice(8);
  }
  return local.slice(0, 4) + "-" + local.slice(4, 8) + "-" + local.slice(8);
}
__name(formatPhone, "formatPhone");
var WA_SVG = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>`;
var WA_SVG_SMALL = `<svg viewBox="0 0 24 24" fill="#25D366" style="width:14px;height:14px;vertical-align:middle;margin-right:3px"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>`;
var PAKET_HAJI = [
  {
    nama: "Silver",
    dpPorsi: "4.000 USD",
    opsiKamar: "4 / 3 / 2 \u2014 Mulai USD 11.000 (\xB1181 JT)",
    durasi: "23\u201324 Hari",
    maktab: "116",
    jarakJamarat: "900 mtr",
    hotelMakkah: "Anjum / Setaraf (\u26055)",
    hotelMadinah: "Concorde Dar Alkhair / Setaraf (\u26054)",
    maskapai: "Saudia / Qatar / Emirates",
    transportasi: "Bus VIP Terbaru",
    bimbingan: "Asatidz Berilmu & Berpengalaman",
    programArbain: "\u2013",
    layanan: "Pendaftaran Mudah & Ringan",
    ctaText: "Assalamualaikum%2C%20Saya%20mau%20tanya%20paket%20Haji%20Plus%20Silver%20di%20Alhijaz"
  },
  {
    nama: "Gold",
    dpPorsi: "4.000 USD",
    opsiKamar: "4 / 3 / 2 \u2014 Mulai USD 15.000 (\xB1247 JT)",
    durasi: "23\u201324 Hari",
    maktab: "113",
    jarakJamarat: "500 mtr",
    hotelMakkah: "Anjum / Marwa Rotana / Setaraf (\u26055)",
    hotelMadinah: "Al-Aqeeq / Setaraf (\u26055)",
    maskapai: "Saudia / Qatar / Emirates",
    transportasi: "Bus VIP Terbaru",
    bimbingan: "Asatidz Berilmu & Berpengalaman",
    programArbain: "\u2013",
    layanan: "Pendaftaran Mudah & Ringan",
    ctaText: "Assalamualaikum%2C%20Saya%20mau%20tanya%20paket%20Haji%20Plus%20Gold%20di%20Alhijaz"
  },
  {
    nama: "Gold Arbain",
    featured: true,
    dpPorsi: "4.000 USD",
    opsiKamar: "4 / 3 / 2 \u2014 Mulai USD 16.500 (\xB1272 JT)",
    durasi: "28\u201329 Hari",
    maktab: "113",
    jarakJamarat: "500 mtr",
    hotelMakkah: "Marwa Rotana / Setaraf (\u26055)",
    hotelMadinah: "Al-Aqeeq / Setaraf (\u26055)",
    maskapai: "Saudia / Qatar / Emirates",
    transportasi: "Bus VIP Terbaru",
    bimbingan: "Asatidz Berilmu & Berpengalaman",
    programArbain: "Termasuk",
    layanan: "Pendaftaran Mudah & Ringan",
    ctaText: "Assalamualaikum%2C%20Saya%20mau%20tanya%20paket%20Haji%20Plus%20Gold%20Arbain%20di%20Alhijaz"
  },
  {
    nama: "Platinum",
    dpPorsi: "4.000 USD",
    opsiKamar: "4 / 3 / 2 \u2014 Mulai USD 19.500 (\xB1321 JT)",
    durasi: "23\u201324 Hari",
    maktab: "111/112",
    jarakJamarat: "200 mtr",
    hotelMakkah: "Fairmont / Setaraf (\u26055)",
    hotelMadinah: "Movenpick / Setaraf (\u26055)",
    maskapai: "Saudia / Qatar / Emirates",
    transportasi: "Bus VIP Terbaru",
    bimbingan: "Asatidz Berilmu & Berpengalaman",
    programArbain: "\u2013",
    layanan: "Layanan Premium Prioritas",
    ctaText: "Assalamualaikum%2C%20Saya%20mau%20tanya%20paket%20Haji%20Plus%20Platinum%20di%20Alhijaz"
  }
];
function buildHajiCard(p, phone) {
  const url = `https://api.whatsapp.com/send?phone=${phone}&text=${p.ctaText}`;
  const isFeatured = p.featured || false;
  return `
  <div class="card${isFeatured ? " card--featured" : ""}" data-anim>
    <div class="card__head">
      <h3 class="card__name">${p.nama}</h3>
      ${isFeatured ? '<span class="badge badge--arbain">\u2B50 TERMASUK ARBAIN</span>' : ""}
    </div>
    <table class="card__tbl">
      <tr><td class="tbl-label">\u{1F4B0} DP Porsi</td><td class="tbl-val"><strong>${p.dpPorsi}</strong></td></tr>
      <tr><td class="tbl-label">\u{1F3E0} Opsi Kamar</td><td class="tbl-val">${p.opsiKamar}</td></tr>
      <tr><td class="tbl-label">\u23F1\uFE0F Durasi</td><td class="tbl-val">${p.durasi}</td></tr>
      <tr><td class="tbl-label">\u{1F54B} Maktab VIP</td><td class="tbl-val">${p.maktab}</td></tr>
      <tr><td class="tbl-label">\u{1F4CD} Jarak Jamarat</td><td class="tbl-val">${p.jarakJamarat}</td></tr>
      <tr><td class="tbl-label">\u{1F3E8} Hotel Makkah</td><td class="tbl-val">${p.hotelMakkah}</td></tr>
      <tr><td class="tbl-label">\u{1F54C} Hotel Madinah</td><td class="tbl-val">${p.hotelMadinah}</td></tr>
      <tr><td class="tbl-label">\u2708\uFE0F Maskapai</td><td class="tbl-val">${p.maskapai}</td></tr>
      <tr><td class="tbl-label">\u{1F68C} Transportasi</td><td class="tbl-val">${p.transportasi}</td></tr>
      <tr><td class="tbl-label">\u{1F468}\u200D\u{1F3EB} Bimbingan</td><td class="tbl-val">${p.bimbingan}</td></tr>
      <tr><td class="tbl-label">\u{1F550} Program Arbain</td><td class="tbl-val">${p.programArbain === "Termasuk" ? '<b style="color:#C8A951">\u2713 Termasuk</b>' : p.programArbain}</td></tr>
      <tr><td class="tbl-label">\u{1F4CB} Layanan</td><td class="tbl-val">${p.layanan}</td></tr>
    </table>
    <a href="${url}" target="_blank" rel="noopener" class="btn btn--card">${WA_SVG} Tanya Detail Paket</a>
  </div>`;
}
__name(buildHajiCard, "buildHajiCard");
async function generateHTML(slug) {
  const agent = AGENTS[slug];
  const phone = agent?.phone || DEFAULT_PHONE;
  const website = agent?.website || "alhijaz.co";
  const agentName = agent?.name || "Alhijaz";
  const agentPhoto = agent?.photo || "/agents/nikita.jpg";
  const waGeneral = `https://api.whatsapp.com/send?phone=${phone}&text=Assalamualaikum%2C%20Saya%20mau%20tanya%20paket%20Haji%20Plus%20di%20Alhijaz`;
  const cards = PAKET_HAJI.map((p) => buildHajiCard(p, phone)).join("");
  return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Paket Haji Plus${agentName ? ` \u2014 ${agentName}` : ""} | Alhijaz Indowisata</title>
<meta name="description" content="Paket Haji Plus dengan masa tunggu 8-10 tahun. Penyelenggara Resmi PIHK Kemenag RI. Fasilitas Maktab VIP, Hotel Bintang 5, Maskapai Terbaik.">
<meta property="og:title" content="Paket Haji Plus \u2014 Alhijaz Indowisata">
<meta property="og:description" content="Haji Plus masa tunggu 8-10 tahun. DP hanya 4.000 USD. Maktab VIP, Hotel \u2605\u2605\u2605\u2605\u2605, Maskapai Terbaik.">
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

/* \u2500\u2500 ISLAMIC PATTERN \u2500\u2500 */
.geo{position:absolute;inset:0;opacity:.04;pointer-events:none;
  background-image:linear-gradient(30deg,var(--gold) 12%,transparent 12.5%,transparent 87%,var(--gold) 87.5%),linear-gradient(150deg,var(--gold) 12%,transparent 12.5%,transparent 87%,var(--gold) 87.5%),linear-gradient(30deg,var(--gold) 12%,transparent 12.5%,transparent 87%,var(--gold) 87.5%),linear-gradient(150deg,var(--gold) 12%,transparent 12.5%,transparent 87%,var(--gold) 87.5%),linear-gradient(60deg,var(--gold-l) 25%,transparent 25.5%,transparent 75%,var(--gold-l) 75%),linear-gradient(60deg,var(--gold-l) 25%,transparent 25.5%,transparent 75%,var(--gold-l) 75%);
  background-size:56px 97px;background-position:0 0,0 0,28px 48px,28px 48px,0 0,28px 48px}

/* \u2500\u2500 HERO \u2500\u2500 */
.hero{position:relative;background:linear-gradient(175deg,#FFFDF7 0%,#F0EBE0 15%,#D4CEBC 35%,#C8A951 60%,#8B6914 80%,#3B1F0F 100%);padding:64px 20px 56px;text-align:center;overflow:hidden}
.hero::after{content:'';position:absolute;top:20%;left:50%;transform:translateX(-50%);width:320px;height:320px;background:radial-gradient(circle,rgba(255,253,247,.12) 0%,transparent 70%);pointer-events:none}
.hero .geo{opacity:.03}
.hero__in{position:relative;z-index:2;max-width:var(--mx);margin:0 auto}
.hero__kicker{display:inline-block;font-size:10.5px;font-weight:700;letter-spacing:2.5px;text-transform:uppercase;color:#8B6914;margin-bottom:16px;padding:6px 16px;background:rgba(184,148,31,.12);border:1px solid rgba(184,148,31,.25);border-radius:100px}
.hero h1{font-family:var(--serif);font-size:34px;font-weight:800;color:#1A0A00;line-height:1.15;margin-bottom:20px}
.hero h1 span{color:var(--gold-d);display:block;font-style:italic;font-size:28px;margin-top:4px}
.hero__sub{font-size:13px;color:#5C4A38;line-height:1.7;margin-bottom:28px;max-width:360px;margin-left:auto;margin-right:auto}

/* \u2500\u2500 HERO BADGES \u2500\u2500 */
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

/* \u2500\u2500 SECTION COMMON \u2500\u2500 */
.sec{padding:48px 20px}
.sec__label{font-size:11px;font-weight:700;color:var(--gold-d);text-transform:uppercase;letter-spacing:1.5px;margin-bottom:6px;text-align:center}
.sec__title{font-family:var(--serif);font-size:26px;font-weight:700;color:var(--dark);line-height:1.28;margin-bottom:16px;text-align:center}
.sec__desc{font-size:14px;color:var(--b500);text-align:center;margin-bottom:28px;line-height:1.6;max-width:var(--mx);margin-left:auto;margin-right:auto}

/* \u2500\u2500 PROFIL \u2500\u2500 */
.profil{background:var(--w);border-bottom:1px solid var(--b200);padding:48px 20px}
.profil__in{max-width:var(--mx);margin:0 auto}
.profil p{font-size:14px;color:var(--b700);line-height:1.75;margin-bottom:12px}

/* \u2500\u2500 KENAPA \u2500\u2500 */
.kenapa{padding:48px 20px;background:linear-gradient(180deg,var(--b50) 0%,#F0EBE0 100%)}
.kenapa-grid{max-width:var(--mx);margin:0 auto;display:flex;flex-direction:column;gap:14px}
.kenapa-card{display:flex;align-items:flex-start;gap:14px;background:var(--w);border:1px solid var(--b200);border-radius:14px;padding:20px 16px;box-shadow:0 2px 12px rgba(0,0,0,.04)}
.kenapa-card .kic{width:44px;height:44px;border-radius:12px;background:linear-gradient(135deg,var(--gold-bg),#F0E6C8);display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0}
.kenapa-card h4{font-size:14px;font-weight:700;color:var(--dark);margin-bottom:4px}
.kenapa-card p{font-size:12.5px;color:var(--b500);line-height:1.5}

/* \u2500\u2500 FASILITAS \u2500\u2500 */
.fasilitas{padding:48px 20px;background:var(--w)}
.fas-grid{max-width:var(--mx);margin:0 auto;display:grid;grid-template-columns:1fr;gap:14px}
.fas-card{background:linear-gradient(135deg,#FFFDF7,#F8F0E0);border:1px solid var(--b200);border-radius:16px;padding:28px 20px;text-align:center;box-shadow:var(--sh);transition:transform .2s}
.fas-card:hover{transform:translateY(-2px)}
.fas-card .fic{font-size:36px;margin-bottom:12px}
.fas-card h4{font-family:var(--serif);font-size:17px;font-weight:700;color:var(--dark);margin-bottom:8px}
.fas-card p{font-size:13px;color:var(--b500);line-height:1.6}

/* \u2500\u2500 CARDS \u2500\u2500 */
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

/* \u2500\u2500 PEMBIAYAAN \u2500\u2500 */
.pembiayaan{padding:52px 20px;background:linear-gradient(135deg,#0D3B2C,#145A3E);position:relative;overflow:hidden;text-align:center}
.pembiayaan::before{content:'';position:absolute;top:-60px;right:-60px;width:200px;height:200px;background:radial-gradient(circle,rgba(200,169,81,.12) 0%,transparent 70%);pointer-events:none}
.pembiayaan__in{max-width:var(--mx);margin:0 auto;position:relative;z-index:1}
.pembiayaan h2{font-family:var(--serif);font-size:24px;font-weight:700;color:#fff;margin-bottom:14px;line-height:1.3}
.pembiayaan p{font-size:14px;color:rgba(255,255,255,.75);line-height:1.7;margin-bottom:24px}
.pembiayaan .btn--hero{background:linear-gradient(135deg,var(--gold),var(--gold-d));color:var(--w);box-shadow:0 4px 20px rgba(200,169,81,.3)}
.pembiayaan .btn--hero:hover{box-shadow:0 8px 30px rgba(200,169,81,.4)}

/* \u2500\u2500 REVIEWS \u2500\u2500 */
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

/* \u2500\u2500 CLOSING \u2500\u2500 */
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

/* \u2500\u2500 FOOTER \u2500\u2500 */
footer{background:#1A0A00;padding:36px 20px 28px;text-align:center;border-top:3px solid var(--gold)}
footer .wrap{max-width:var(--mx);margin:0 auto}
.footer__brand{font-family:var(--serif);font-size:18px;font-weight:700;color:#fff;margin-bottom:4px}
.footer__tagline{font-size:11px;color:var(--gold);font-weight:600;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:18px}
.footer__info{display:flex;flex-direction:column;gap:6px;margin-bottom:16px}
.footer__info p{font-size:12px;color:rgba(255,255,255,.5);line-height:1.6;margin:0}
.footer__legal{padding-top:16px;border-top:1px solid rgba(255,255,255,.08);font-size:10.5px;color:rgba(255,255,255,.25)}

/* \u2500\u2500 STICKY BAR \u2500\u2500 */
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

/* \u2500\u2500 FAB \u2500\u2500 */
.fab{position:fixed;bottom:20px;right:16px;z-index:998;width:56px;height:56px;background:#25D366;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 18px rgba(37,211,102,.4);transition:opacity .3s,transform .3s;animation:glow 2.5s infinite}
.fab svg{width:28px;height:28px;fill:var(--w)}
.fab.hide{opacity:0;transform:scale(.5);pointer-events:none}
@keyframes glow{0%,100%{box-shadow:0 4px 18px rgba(37,211,102,.4)}50%{box-shadow:0 4px 28px rgba(37,211,102,.6)}}

/* \u2500\u2500 SCROLL ANIM \u2500\u2500 */
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
    <p class="hero__kicker">Haji Plus \u2014 Alhijaz Indowisata</p>
    <h1>Masa Tunggu Haji Plus Lebih Singkat<span>Pelayanan Terbaik & Fasilitas Eksklusif</span></h1>
    <p class="hero__sub">Wujudkan ibadah haji Anda dengan layanan premium, hotel bintang 5, maktab VIP dekat Jamarat, dan bimbingan ustadz berpengalaman.</p>
    <div class="hero__badges">
      <div class="hero__badge"><div class="hero__badge-icon green">\u{1F54B}</div><div class="hero__badge-text">Program Haji Plus \u2014 Masa Tunggu 8-10 Tahun</div></div>
      <div class="hero__badge"><div class="hero__badge-icon gold">\u{1F4CB}</div><div class="hero__badge-text">Penyelenggara Resmi \u2014 PIHK Kemenag RI (SK No.846/2020)</div></div>
      <div class="hero__badge"><div class="hero__badge-icon blue">\u{1F3C5}</div><div class="hero__badge-text">Terakreditasi A oleh KAN (Komite Akreditasi Nasional)</div></div>
    </div>
    <a href="${waGeneral}" target="_blank" rel="noopener" class="btn btn--hero">${WA_SVG} Konsultasi Sekarang</a>
    <p class="hero__micro">Gratis konsultasi \xB7 Tanpa komitmen</p>
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
  <p class="sec__desc" data-anim>Proses pendaftaran paling Ringan & Mudah. Masa Tunggu saat ini 8-10 Tahun \u2014 Semakin menunda, masa tunggu semakin panjang.</p>
  <div class="kenapa-grid">
    <div class="kenapa-card" data-anim><div class="kic">\u{1F4B0}</div><div><h4>Pendaftaran Paling Ringan</h4><p>DP hanya 4.000 USD \u2014 jauh lebih terjangkau dibanding travel lain yang bisa 5.000\u20136.000 USD.</p></div></div>
    <div class="kenapa-card" data-anim><div class="kic">\u{1F381}</div><div><h4>Promo Cashback Langsung IDR 1.000.000</h4><p>Benefit instan saat DP pendaftaran. Langsung dipotong dari total biaya.</p></div></div>
    <div class="kenapa-card" data-anim><div class="kic">\u{1F3AB}</div><div><h4>Free Voucher Umroh IDR 5.000.000</h4><p>Bisa digunakan untuk perjalanan Umroh berikutnya. *Syarat & Ketentuan Berlaku.</p></div></div>
  </div>
</section>

<!-- FASILITAS -->
<section class="fasilitas">
  <div class="sec__label" data-anim>Fasilitas Premium</div>
  <h2 class="sec__title" data-anim>Fasilitas Terbaik di Kelasnya</h2>
  <div class="fas-grid">
    <div class="fas-card" data-anim><div class="fic">\u{1F54B}</div><h4>Maktab VIP</h4><p>Jarak dekat dengan Jamarat, akses lebih mudah saat puncak haji.</p></div>
    <div class="fas-card" data-anim><div class="fic">\u{1F3E8}</div><h4>Hotel \u2605\u2605\u2605\u2605\u2605</h4><p>Hotel bintang 5 terbaik di kelasnya, lebih nyaman untuk istirahat jamaah.</p></div>
    <div class="fas-card" data-anim><div class="fic">\u2708\uFE0F</div><h4>Airlines & Bus VIP</h4><p>Maskapai terbaik & transportasi Bus VIP terbaru. Perjalanan aman, nyaman, dan terjamin.</p></div>
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
      <div class="review-card__stars">\u2B50\u2B50\u2B50\u2B50\u2B50</div>
      <p>Pengalaman pertama menjalankan ibadah umroh pada musim padat, namun dengan Alhijaz, kami sekeluarga dapat menjalankan ibadah dengan sangat berkesan. Bimbingan sangat baik dan semua anggota kelompok kompak.</p>
    </div>
    <div class="review-card" data-anim>
      <div class="review-card__head"><div class="review-card__avatar">B</div><div class="review-card__info"><strong>Bayu Adi Gunawan</strong><span>Google Review</span></div></div>
      <div class="review-card__stars">\u2B50\u2B50\u2B50\u2B50\u2B50</div>
      <p>Alhamdulillah, akhirnya Allah memanggil kami untuk menunaikan umroh pertama. Tim travel mendampingi dengan sangat baik dan profesional. Hotel dekat, konsumsi baik, transportasi lancar. Sangat recommended!</p>
    </div>
    <div class="review-card" data-anim>
      <div class="review-card__head"><div class="review-card__avatar">A</div><div class="review-card__info"><strong>Andika Mulrosha</strong><span>Google Review</span></div></div>
      <div class="review-card__stars">\u2B50\u2B50\u2B50\u2B50\u2B50</div>
      <p>Komitmen fasilitas dan pelayanan top, the best dibandingkan dari beberapa pengalaman tour travel yang pernah digunakan. Jamaah sangat kompak dan nuansa kekeluargaan sangat kental selama perjalanan ibadah.</p>
    </div>
  </div>
  <div class="reviews__badge" data-anim>\u2B50 Rating <strong>5.0</strong> dari <strong>6.200+</strong> ulasan di Google</div>
</section>

<!-- CLOSING CTA -->
<section class="closing" data-anim>
  <div class="closing__in">
    <div class="closing__icon">\u{1F54B}</div>
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
      <p>\u{1F4CD} Jl. Dewi Sartika No. 342, Cawang, Jakarta Timur</p>
      <p>\u{1F4DC} PPIU U.490 Tahun 2020 \xB7 PIHK 304 Tahun 2022</p>
      <p>${WA_SVG_SMALL} <a href="https://wa.me/${phone}" style="color:rgba(255,255,255,.7);text-decoration:none">${formatPhone(phone)}</a> \xB7 \u{1F310} <a href="https://${website}" style="color:rgba(255,255,255,.7);text-decoration:none">${website}</a></p>
    </div>
    <div class="footer__legal">\xA9 2026 PT Alhijaz Indowisata. All rights reserved.</div>
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
<\/script>
</body>
</html>`;
}
__name(generateHTML, "generateHTML");
var onRequest4 = /* @__PURE__ */ __name(async (context) => {
  const slug = (context.params.slug || "").toLowerCase();
  return new Response(await generateHTML(slug), {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=3600" }
  });
}, "onRequest");

// [slug]/umroh.ts
var AGENTS2 = {
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
var DEFAULT_PHONE2 = "62822900020";
function formatPhone2(phone) {
  const local = "0" + phone.slice(2);
  if (local.length <= 12) {
    return local.slice(0, 4) + "-" + local.slice(4, 8) + "-" + local.slice(8);
  }
  return local.slice(0, 4) + "-" + local.slice(4, 8) + "-" + local.slice(8);
}
__name(formatPhone2, "formatPhone");
var WA_SVG2 = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>`;
var WA_SVG_SMALL2 = `<svg viewBox="0 0 24 24" fill="#25D366" style="width:14px;height:14px;vertical-align:middle;margin-right:3px"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>`;
var PAKET_LIST = [
  {
    nama: "Promo Umroh Akbar",
    badge: "\u{1F525} SEAT TERBATAS",
    featured: true,
    keberangkatan: "20 Juni 2026",
    harga: "Rp 28 Juta-an",
    durasi: "9 Hari",
    airline: "Saudi Airlines",
    hotelMekkah: "\u2B50\u2B50\u2B50\u2B50 Grand Al Massa / Setaraf",
    hotelMadinah: "\u2B50\u2B50\u2B50 ODST Al Madina / Setaraf",
    include: ["Perlengkapan", "Handling Bandara", "Makan 3x Sehari", "Visa Umroh", "FREE Ayam Al-Baik", "FREE Zamzam 5L"],
    ctaText: "Assalamualaikum%2C%20Saya%20mau%20tanya%20paket%20Promo%20Umroh%20Akbar%20(20%20Juni%202026)%20di%20Alhijaz",
    dateKey: "promo-akbar"
  },
  {
    nama: "Umroh Plus Haikou (China)",
    badge: "\u2708\uFE0F PLUS CHINA",
    keberangkatan: "Agustus 2026",
    harga: "Rp 29 Juta-an",
    durasi: "11 Hari",
    airline: "Loong Air",
    hotelMekkah: "\u2B50\u2B50\u2B50\u2B50 Grand Al Massa / Setaraf",
    hotelMadinah: "\u2B50\u2B50\u2B50 ODST Al Madina / Setaraf",
    include: ["Perlengkapan", "Handling Bandara", "Makan 3x Sehari", "Visa Umroh", "FREE Ayam Al-Baik", "FREE Zamzam 5L"],
    ctaText: "Assalamualaikum%2C%20Saya%20mau%20tanya%20paket%20Umroh%20Plus%20Hainan%20(Haikou)%20China%20di%20Alhijaz",
    dateKey: "haikou"
  },
  {
    nama: "Umroh Reguler",
    keberangkatan: "Juni \u2013 Oktober 2026",
    harga: "Rp 31 Juta-an",
    durasi: "9 Hari",
    airline: "Garuda Indonesia / Saudi Airlines",
    hotelMekkah: "\u2B50\u2B50\u2B50\u2B50\u2B50 Pullman ZamZam / Setaraf",
    hotelMadinah: "\u2B50\u2B50\u2B50\u2B50\u2B50 Maden & \u2B50\u2B50\u2B50\u2B50 Al Ritz Al Madina",
    highlight: "Tersedia pilihan Full Hotel Bintang 5",
    include: ["Perlengkapan", "Handling Bandara", "Makan 3x Sehari", "Visa Umroh", "FREE Ayam Al-Baik", "FREE Zamzam 5L"],
    ctaText: "Assalamualaikum%2C%20Saya%20mau%20tanya%20paket%20Umroh%20Reguler%20di%20Alhijaz",
    dateKey: "reguler"
  },
  {
    nama: "Umroh Plus Thaif",
    badge: "\u{1F54C} PLUS THAIF",
    keberangkatan: "Juni \u2013 Oktober 2026",
    harga: "Rp 32 Juta-an",
    durasi: "9, 10 & 12 Hari",
    airline: "Garuda Indonesia / Saudi Airlines",
    hotelMekkah: "\u2B50\u2B50\u2B50\u2B50\u2B50 Pullman ZamZam & \u2B50\u2B50\u2B50\u2B50 Prestige",
    hotelMadinah: "\u2B50\u2B50\u2B50\u2B50\u2B50 Maden & \u2B50\u2B50\u2B50\u2B50 Al Ritz Al Madina",
    include: ["Perlengkapan", "Handling Bandara", "Makan 3x Sehari", "FREE Ayam Al-Baik", "FREE Zamzam 5L", "Handling Lengkap"],
    ctaText: "Assalamualaikum%2C%20Saya%20mau%20tanya%20paket%20Umroh%20Plus%20Thaif%20di%20Alhijaz",
    dateKey: "thaif"
  },
  {
    nama: "Umroh Plus Istanbul & Cappadocia",
    badge: "\u{1F1F9}\u{1F1F7} PLUS TURKI",
    keberangkatan: "Juni \u2013 Oktober 2026",
    harga: "Rp 37 Juta-an",
    durasi: "12, 13 & 15 Hari",
    airline: "Saudi Airlines",
    hotelMekkah: "\u2B50\u2B50\u2B50\u2B50\u2B50 Pullman ZamZam",
    hotelMadinah: "\u2B50\u2B50\u2B50\u2B50\u2B50 Maden",
    hotelLain: "La Quinta By Wyndham (Istanbul) \xB7 DoubleTree by Hilton (Bursa) \xB7 Ramada (Cappadocia)",
    include: ["Perlengkapan", "Handling Bandara", "Makan 3x Sehari", "Visa Umroh", "FREE Ayam Al-Baik", "FREE Zamzam 5L"],
    ctaText: "Assalamualaikum%2C%20Saya%20mau%20tanya%20paket%20Umroh%20Plus%20Istanbul-Cappadocia%20di%20Alhijaz",
    dateKey: "turkey"
  },
  {
    nama: "Umroh Plus Cairo & Alexandria",
    badge: "\u{1F1EA}\u{1F1EC} PLUS MESIR",
    keberangkatan: "Juni \u2013 Oktober 2026",
    harga: "Rp 41 Juta-an",
    durasi: "12 Hari",
    airline: "Saudi Airlines",
    hotelMekkah: "\u2B50\u2B50\u2B50\u2B50 Prestige Ex Elaf",
    hotelMadinah: "\u2B50\u2B50\u2B50\u2B50 Al Ritz Al Madina",
    hotelLain: "Taiba Pyramid \u2B50\u2B50\u2B50\u2B50 (Cairo)",
    include: ["Perlengkapan", "Handling Bandara", "Makan 3x Sehari", "Visa Umroh", "FREE Ayam Al-Baik", "FREE Zamzam 5L"],
    ctaText: "Assalamualaikum%2C%20Saya%20mau%20tanya%20paket%20Umroh%20Plus%20Cairo-Alexandria%20di%20Alhijaz",
    dateKey: "cairo"
  }
];
function buildCard(p, phone, dates) {
  const url = `https://api.whatsapp.com/send?phone=${phone}&text=${p.ctaText}`;
  const tanggal = dates[p.dateKey] || [];
  const datePills = tanggal.map((t) => `<span class="date-pill">${t}</span>`).join("");
  return `
  <div class="card${p.featured ? " card--promo" : ""}" data-anim>
    <div class="card__head">
      ${p.badge ? `<span class="badge${p.featured ? " badge--gold" : ""}">${p.badge}</span>` : ""}
      <h3 class="card__name">${p.nama}</h3>
      <div class="card__price">Mulai <strong>${p.harga}</strong></div>
    </div>
    ${tanggal.length ? `<div class="card__dates">
      <span class="card__dates-t">\u{1F4C5} Tanggal Tersedia:</span>
      <div class="date-pills">${datePills}</div>
    </div>` : ""}
    <table class="card__tbl">
      <tr><td class="tbl-label">\u2708\uFE0F Penerbangan</td><td class="tbl-val">${p.airline}</td></tr>
      <tr><td class="tbl-label">\u23F1\uFE0F Durasi</td><td class="tbl-val">${p.durasi}</td></tr>
      <tr><td class="tbl-label">\u{1F54B} Mekkah</td><td class="tbl-val">${p.hotelMekkah}</td></tr>
      <tr><td class="tbl-label">\u{1F54C} Madinah</td><td class="tbl-val">${p.hotelMadinah}</td></tr>
      ${p.hotelLain ? `<tr><td class="tbl-label">\u{1F3E8} Hotel Lain</td><td class="tbl-val">${p.hotelLain}</td></tr>` : ""}
      ${p.highlight ? `<tr class="tbl-hl"><td class="tbl-label">\u2B50 Highlight</td><td class="tbl-val"><b>${p.highlight}</b></td></tr>` : ""}
    </table>
    <div class="card__inc">
      <div class="tags">${p.include.map((i) => `<span class="tag">${i}</span>`).join("")}</div>
    </div>
    <a href="${url}" target="_blank" rel="noopener" class="btn btn--card">${WA_SVG2} Tanya Paket Ini</a>
  </div>`;
}
__name(buildCard, "buildCard");
async function generateHTML2(slug) {
  const agent = AGENTS2[slug];
  const phone = agent?.phone || DEFAULT_PHONE2;
  const website = agent?.website || "alhijaz.co";
  const agentName = agent?.name || "Alhijaz";
  const agentPhoto = agent?.photo || "/agents/nikita.jpg";
  const waGeneral = `https://api.whatsapp.com/send?phone=${phone}&text=Assalamualaikum%2C%20Saya%20mau%20tanya%20paket%20Umroh%20di%20Alhijaz`;
  let dates = {};
  try {
    const fs = await import("fs");
    const path = await import("path");
    const url = await import("url");
    const dir = path.dirname(url.fileURLToPath(import.meta.url));
    const jsonPath = path.resolve(dir, "..", "umroh-dates.json");
    dates = JSON.parse(fs.readFileSync(jsonPath, "utf-8")).packages || {};
  } catch {
  }
  const cards = PAKET_LIST.map((p) => buildCard(p, phone, dates)).join("");
  return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Paket Umroh 2026${agentName ? ` \u2014 ${agentName}` : ""} | Alhijaz Indowisata</title>
<meta name="description" content="Paket Umroh Pasti Berangkat mulai Rp 28 Juta. Travel Akreditasi A, Resmi Kemenag RI. PT Alhijaz Indowisata \u2014 10.000+ jamaah per tahun.">
<meta property="og:title" content="Umroh Pasti Berangkat \u2014 Mulai 28 Juta | Alhijaz">
<meta property="og:description" content="Paket Umroh Juni\u2013Oktober 2026. Akreditasi A, Resmi Kemenag RI. Direct Flight, Hotel Dekat Masjid.">
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

/* \u2500\u2500 GEO PATTERN \u2500\u2500 */
.geo{position:absolute;inset:0;opacity:.05;pointer-events:none;
  background-image:linear-gradient(30deg,var(--gold) 12%,transparent 12.5%,transparent 87%,var(--gold) 87.5%),linear-gradient(150deg,var(--gold) 12%,transparent 12.5%,transparent 87%,var(--gold) 87.5%),linear-gradient(30deg,var(--gold) 12%,transparent 12.5%,transparent 87%,var(--gold) 87.5%),linear-gradient(150deg,var(--gold) 12%,transparent 12.5%,transparent 87%,var(--gold) 87.5%),linear-gradient(60deg,var(--gold-l) 25%,transparent 25.5%,transparent 75%,var(--gold-l) 75%),linear-gradient(60deg,var(--gold-l) 25%,transparent 25.5%,transparent 75%,var(--gold-l) 75%);
  background-size:56px 97px;background-position:0 0,0 0,28px 48px,28px 48px,0 0,28px 48px}

/* \u2500\u2500 HERO \u2500\u2500 */
.hero{position:relative;background:linear-gradient(175deg,#FFFDF7 0%,#F0EBE0 20%,#D4CEBC 40%,#8FB88A 65%,#2D7A4A 82%,#0D3B2C 100%);padding:64px 20px 56px;text-align:center;overflow:hidden}
.hero::after{content:'';position:absolute;top:20%;left:50%;transform:translateX(-50%);width:300px;height:300px;background:radial-gradient(circle,rgba(255,253,247,.15) 0%,transparent 70%);pointer-events:none}
.hero .geo{opacity:.03}
.hero__in{position:relative;z-index:2;max-width:var(--mx);margin:0 auto}
.hero__kicker{display:inline-block;font-size:10.5px;font-weight:700;letter-spacing:2.5px;text-transform:uppercase;color:#8B6914;margin-bottom:16px;padding:6px 16px;background:rgba(184,148,31,.1);border:1px solid rgba(184,148,31,.2);border-radius:100px}
.hero h1{font-family:var(--serif);font-size:40px;font-weight:800;color:#0D2818;line-height:1.12;margin-bottom:20px}
.hero h1 span{color:var(--gold-d);display:block;font-style:italic}
.hero__sub{font-size:13px;color:#4A5B4E;line-height:1.7;margin-bottom:28px;max-width:340px;margin-left:auto;margin-right:auto}
.hero__stats{display:flex;align-items:center;justify-content:center;margin:0 auto 32px;max-width:380px;background:rgba(255,255,255,.75);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);border-radius:20px;border:1px solid rgba(255,255,255,.5);box-shadow:0 8px 32px rgba(13,59,44,.1),inset 0 1px 0 rgba(255,255,255,.6);padding:20px 0;position:relative;overflow:hidden}
.hero__stats::before{content:'';position:absolute;inset:0;border-radius:20px;background:linear-gradient(135deg,rgba(37,211,102,.04) 0%,transparent 50%,rgba(184,148,31,.04) 100%);pointer-events:none}
.hero__stat{flex:1;text-align:center;position:relative;padding:0 8px}
.hero__stat+.hero__stat::before{content:'';position:absolute;left:0;top:15%;bottom:15%;width:1px;background:linear-gradient(180deg,transparent,rgba(13,59,44,.12),transparent)}
.hero__stat-val{font-family:var(--serif);font-size:28px;font-weight:800;line-height:1;display:block;background:linear-gradient(135deg,#0D3B2C 0%,#1B5E3A 50%,#25D366 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
.hero__stat-label{font-size:9px;font-weight:700;color:#7A8A7E;margin-top:6px;display:block;text-transform:uppercase;letter-spacing:1.2px}
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

/* \u2500\u2500 SOCIAL PROOF \u2500\u2500 */
.proof{background:var(--w);border-bottom:1px solid var(--b200);padding:16px 20px}
.proof__in{max-width:var(--mx);margin:0 auto;display:flex;gap:8px 16px;align-items:center;justify-content:center;flex-wrap:wrap;font-size:12.5px;color:var(--b700);font-weight:500;text-align:center}
.proof__sep{color:var(--b300);display:none}
@media(min-width:640px){.proof__sep{display:inline}}

/* \u2500\u2500 SECTION COMMON \u2500\u2500 */
.sec{padding:44px 20px}
.sec__label{font-size:11px;font-weight:700;color:var(--gold-d);text-transform:uppercase;letter-spacing:1.5px;margin-bottom:6px;text-align:center}
.sec__title{font-family:var(--serif);font-size:28px;font-weight:700;color:var(--r900);line-height:1.28;margin-bottom:20px;text-align:center}
.sec__desc{font-size:14px;color:var(--b500);text-align:center;margin-bottom:28px;line-height:1.6}

/* \u2500\u2500 CARDS \u2500\u2500 */
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
.tag::before{content:'\u2713';font-size:10px;font-weight:800;color:#25D366}
.btn--card{display:flex;align-items:center;justify-content:center;gap:8px;margin:0 20px 20px;padding:14px 18px;border-radius:12px;font-size:14.5px;font-weight:700;background:linear-gradient(135deg,#25D366,#128C7E);color:#fff;box-shadow:0 4px 14px rgba(37,211,102,.3);transition:transform .2s,box-shadow .2s}
.btn--card svg{width:18px;height:18px;flex-shrink:0}
.btn--card:hover{transform:translateY(-1px);box-shadow:0 6px 20px rgba(37,211,102,.4)}
.card--promo .btn--card{background:linear-gradient(135deg,var(--gold-d),var(--gold));box-shadow:0 3px 12px rgba(200,169,81,.28)}

/* \u2500\u2500 TRUST \u2500\u2500 */
.trust{padding:52px 20px;background:linear-gradient(180deg,#F8FBF8 0%,#EDF5ED 100%);position:relative;overflow:hidden}
.trust .sec__label{color:#1B5E3A}
.trust .sec__title{color:#1A3A2A}
.trust-grid{max-width:var(--mx);margin:0 auto;display:grid;grid-template-columns:1fr 1fr;gap:12px}
.trust-card{background:var(--w);border:1px solid #E0EAE0;border-radius:14px;padding:20px 14px;text-align:center;box-shadow:0 2px 12px rgba(27,94,58,.06);transition:transform .2s,box-shadow .2s}
.trust-card:hover{transform:translateY(-2px);box-shadow:0 6px 20px rgba(27,94,58,.1)}
.trust-card .ic{display:flex;align-items:center;justify-content:center;width:44px;height:44px;border-radius:12px;background:linear-gradient(135deg,#E8F5E9,#C8E6C9);margin:0 auto 10px;font-size:22px}
.trust-card h4{font-size:13px;font-weight:700;color:#1A3A2A;margin-bottom:4px}
.trust-card p{font-size:11.5px;color:#6B7B6E;line-height:1.45}

/* \u2500\u2500 CLOSING \u2500\u2500 */
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

/* \u2500\u2500 FOOTER \u2500\u2500 */
footer{background:#091F18;padding:36px 20px 28px;text-align:center;border-top:3px solid #25D366}
footer .wrap{max-width:var(--mx);margin:0 auto}
.footer__brand{font-family:var(--serif);font-size:18px;font-weight:700;color:#fff;margin-bottom:4px}
.footer__tagline{font-size:11px;color:#25D366;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:18px}
.footer__info{display:flex;flex-direction:column;gap:6px;margin-bottom:16px}
.footer__info p{font-size:12px;color:rgba(255,255,255,.5);line-height:1.6;margin:0}
.footer__legal{padding-top:16px;border-top:1px solid rgba(255,255,255,.08);font-size:10.5px;color:rgba(255,255,255,.25)}

/* \u2500\u2500 STICKY BAR \u2500\u2500 */
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

/* \u2500\u2500 FAB \u2500\u2500 */
.fab{position:fixed;bottom:20px;right:16px;z-index:998;width:56px;height:56px;background:#25D366;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 18px rgba(37,211,102,.4);transition:opacity .3s,transform .3s;animation:glow 2.5s infinite}
.fab svg{width:28px;height:28px;fill:var(--w)}
.fab.hide{opacity:0;transform:scale(.5);pointer-events:none}
@keyframes glow{0%,100%{box-shadow:0 4px 18px rgba(37,211,102,.4)}50%{box-shadow:0 4px 28px rgba(37,211,102,.6)}}

/* \u2500\u2500 SCROLL ANIM \u2500\u2500 */
[data-anim]{opacity:0;transform:translateY(20px);transition:opacity .6s cubic-bezier(.16,1,.3,1),transform .6s cubic-bezier(.16,1,.3,1)}
[data-anim].vis{opacity:1;transform:none}

/* \u2500\u2500 RESPONSIVE \u2500\u2500 */
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
    <p class="hero__sub">Keberangkatan Juni\u2013Oktober 2026 \xB7 Direct Flight \xB7 Hotel Dekat Masjid \xB7 Travel Akreditasi "A"</p>
    <div class="hero__stats">
      <div class="hero__stat"><span class="hero__stat-val">"A"</span><span class="hero__stat-label">Akreditasi</span></div>
      <div class="hero__stat"><span class="hero__stat-val">10.000+</span><span class="hero__stat-label">Jamaah / Tahun</span></div>
      <div class="hero__stat"><span class="hero__stat-val">20+</span><span class="hero__stat-label">Tahun Pengalaman</span></div>
    </div>
    <a href="${waGeneral}" target="_blank" rel="noopener" class="btn btn--hero">${WA_SVG2} Konsultasi via WhatsApp</a>
    <p class="hero__micro">Gratis konsultasi \xB7 Tanpa komitmen</p>
    <p class="hero__legal">PPIU U.490 \xB7 PIHK 304 \xB7 Izin Resmi Kemenag RI</p>
  </div>
</section>

<!-- SOCIAL PROOF -->
<section class="proof" data-anim>
  <div class="proof__in">
    <span>\u2B50 4.7 Rating Google</span>
    <span class="proof__sep">\xB7</span>
    <span>\u{1F54B} 10.000+ Jamaah/tahun</span>
  </div>
</section>

<!-- PAKET -->
<section class="sec" id="paket">
  <div class="sec__label" data-anim>Pilihan Paket 2026</div>
  <h2 class="sec__title" data-anim>Pilih Paket Sesuai Kebutuhan Anda</h2>
  <p class="sec__desc" data-anim>Semua paket sudah termasuk tiket pesawat, hotel, makan 3\xD7 sehari, perlengkapan, dan handling. Tanggal berangkat pasti.</p>
  <div class="cards">${cards}</div>
</section>

<!-- TRUST -->
<section class="trust">
  <div class="sec__label" data-anim>MENGAPA ALHIJAZ?</div>
  <h2 class="sec__title" data-anim>Travel Umroh yang Bisa<br>Anda Percaya</h2>
  <div class="trust-grid" data-anim>
    <div class="trust-card"><div class="ic">\u{1F3C5}</div><h4>Akreditasi "A"</h4><p>Standar tertinggi dari KAN</p></div>
    <div class="trust-card"><div class="ic">\u{1F4CB}</div><h4>Resmi Kemenag RI</h4><p>PPIU & PIHK aktif dan diawasi</p></div>
    <div class="trust-card"><div class="ic">\u{1F54C}</div><h4>Hotel Dekat Masjid</h4><p>Lokasi Ring 1, menit dari Haram & Nabawi</p></div>
    <div class="trust-card"><div class="ic">\u{1F3E2}</div><h4>Gedung Milik Sendiri</h4><p>4 lantai di Cawang, Jakarta Timur</p></div>
    <div class="trust-card"><div class="ic">\u2708\uFE0F</div><h4>Direct Flight</h4><p>Penerbangan langsung tanpa transit</p></div>
    <div class="trust-card"><div class="ic">\u{1F465}</div><h4>10.000+ Jamaah/Tahun</h4><p>Pengalaman besar, sistem teruji</p></div>
  </div>
</section>

<!-- CLOSING CTA -->
<section class="closing" data-anim>
  <div class="closing__in">
    <div class="closing__icon">\u{1F54B}</div>
    <h2>Niat Sudah Ada,<br>Tinggal <em>Satu Langkah Lagi.</em></h2>
    <p>Kursi terbatas untuk setiap keberangkatan. Jangan tunda lagi.</p>
    <a href="${waGeneral}" target="_blank" rel="noopener" class="btn btn--hero">${WA_SVG2} Konsultasi via WhatsApp</a>
    <p class="closing__hint">Konsultasi gratis, tanpa komitmen.</p>
  </div>
</section>

<!-- FOOTER -->
<footer>
  <div class="wrap">
    <div class="footer__brand">PT Alhijaz Indowisata</div>
    <div class="footer__tagline">Travel Umroh Terpercaya Sejak 2000</div>
    <div class="footer__info">
      <p>\u{1F4CD} Jl. Dewi Sartika No. 239A, Cawang, Jakarta Timur</p>
      <p>\u{1F4DC} PPIU U.490 Tahun 2020 \xB7 PIHK 304 Tahun 2022</p>
      <p>${WA_SVG_SMALL2} <a href="https://wa.me/${phone}" style="color:rgba(255,255,255,.7);text-decoration:none">${formatPhone2(phone)}</a> \xB7 \u{1F310} <a href="https://${website}" style="color:rgba(255,255,255,.7);text-decoration:none">${website}</a></p>
    </div>
    <div class="footer__legal">\xA9 2026 PT Alhijaz Indowisata. All rights reserved.</div>
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
    <a href="${waGeneral}" target="_blank" rel="noopener" class="btn btn--sticky">${WA_SVG2} Chat WA</a>
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
<\/script>
</body>
</html>`;
}
__name(generateHTML2, "generateHTML");
var onRequest5 = /* @__PURE__ */ __name(async (context) => {
  const slug = (context.params.slug || "").toLowerCase();
  return new Response(await generateHTML2(slug), {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=3600" }
  });
}, "onRequest");

// brosur.js
async function onRequest6(context) {
  const { request } = context;
  const url = new URL(request.url);
  const targetUrl = url.searchParams.get("url");
  if (!targetUrl) {
    return new Response(JSON.stringify({ error: "Missing url parameter" }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }
  try {
    const response = await fetch(targetUrl, {
      headers: {
        "Accept": "image/webp,image/*,*/*"
      }
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch: ${response.status}`);
    }
    const data = await response.arrayBuffer();
    const contentType = response.headers.get("Content-Type") || "image/webp";
    return new Response(data, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Cache-Control": "public, max-age=3600"
        // Cache for 1 hour
      }
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: "Proxy error", message: error.message }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        }
      }
    );
  }
}
__name(onRequest6, "onRequest");
async function onRequestOptions3() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400"
    }
  });
}
__name(onRequestOptions3, "onRequestOptions");

// _middleware.ts
var AGENTS3 = {
  "bagas": { name: "Bagas Pramudita", website: "alhijazindonesia.com", phone: "6287878573311" },
  "nikita": { name: "Nikita", website: "alhijazindonesia.com", phone: "62822900020" },
  "nila": { name: "Nila Novita Sari", website: "alhijaztourtravels.com", phone: "6285211209049" },
  "andra": { name: "Andra Olivia", website: "travelalhijazwisata.com", phone: "628129909795" },
  "dyah": { name: "Dyah Ratna Witri", website: "alhijaztraveltours.com", phone: "6281385975678" },
  "widi": { name: "Widi Purwanti", website: "alhijaz-hajiumroh.com", phone: "6287820813228" },
  "aulia": { name: "Aulia", website: "alhijazumrohtravel.com", phone: "6282110407229" },
  "selfiah": { name: "Selfiah Handayani", website: "alhijaztourtravel.co.id", phone: "6281410478212" },
  "zakia": { name: "Rahima Zakia", website: "alhijazbirowisata.com", phone: "6285158005623" },
  "dianwahyuni": { name: "Dian Wahyuni", website: "alhijazindowisatatours.com", phone: "6283197968407" },
  "anne": { name: "Anne Suryani", website: "hajialhijaz.com", phone: "628129953424" },
  "evi": { name: "Evi Chaniago", website: "alhijazbirohajiumroh.com", phone: "6281806742789" },
  "yenita": { name: "Yenita", website: "alhijazumrahtravel.com", phone: "6281316803128" },
  "indah": { name: "Indah Permata", website: "alhijaztraveltour.com", phone: "6281943631008" },
  "aisyah": { name: "Siti Aisyah", website: "travelalhijazumrah.com", phone: "6281225600900" },
  "siska": { name: "Siska Fadia", website: "alhijazumroh.com", phone: "6281188885291" },
  "linda": { name: "Nurlinda Dewi", website: "alhijazcallcenter.com", phone: "6282112094089" }
};
var onRequest7 = /* @__PURE__ */ __name(async (context) => {
  const url = new URL(context.request.url);
  const host = url.hostname.replace(/^www\./, "");
  if (host === "miqot.com") {
    const destination = `https://alhijaz.co${url.pathname}${url.search}`;
    return Response.redirect(destination, 301);
  }
  const response = await context.next();
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/html")) {
    return response;
  }
  const slug = url.pathname.replace(/^\/+/, "").split("/")[0].toLowerCase();
  const agent = AGENTS3[slug];
  if (!agent) {
    return response;
  }
  const newTitle = `Jadwal Umroh Alhijaz | ${agent.name}`;
  const newDescription = `Dapatkan info lengkap paket umrah Alhijaz Indowisata bersama ${agent.name}. Klik untuk konsultasi via WhatsApp.`;
  const pageUrl = url.href;
  const ogImageUrl = `${url.origin}/og/${slug}.png`;
  let html = await response.text();
  html = html.replace(
    /<title>[^<]*<\/title>/i,
    `<title>${newTitle}</title>`
  );
  html = html.replace(
    /<meta\s+name="description"\s+content="[^"]*"\s*\/?>/i,
    `<meta name="description" content="${newDescription}" />`
  );
  html = html.replace(/<meta\s+property="og:[^"]*"\s+content="[^"]*"\s*\/?>\s*/gi, "");
  const metaTags = `
    <meta property="og:title" content="${newTitle}" />
    <meta property="og:description" content="${newDescription}" />
    <meta property="og:url" content="${pageUrl}" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="Alhijaz Indowisata" />
    <meta property="og:image" content="${ogImageUrl}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${newTitle}" />
    <meta name="twitter:description" content="${newDescription}" />
    <meta name="twitter:image" content="${ogImageUrl}" />
  `;
  html = html.replace("</head>", `${metaTags}</head>`);
  return new Response(html, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers
  });
}, "onRequest");

// ../.wrangler/tmp/pages-mAlhd0/functionsRoutes-0.43401618304043654.mjs
var routes = [
  {
    routePath: "/api/ai-copy",
    mountPath: "/api",
    method: "OPTIONS",
    middlewares: [],
    modules: [onRequestOptions]
  },
  {
    routePath: "/api/ai-copy",
    mountPath: "/api",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost]
  },
  {
    routePath: "/api/:path*",
    mountPath: "/api",
    method: "OPTIONS",
    middlewares: [],
    modules: [onRequestOptions2]
  },
  {
    routePath: "/api/:path*",
    mountPath: "/api",
    method: "",
    middlewares: [],
    modules: [onRequest]
  },
  {
    routePath: "/brosur/:path*",
    mountPath: "/brosur",
    method: "",
    middlewares: [],
    modules: [onRequest2]
  },
  {
    routePath: "/itinerary/:path*",
    mountPath: "/itinerary",
    method: "",
    middlewares: [],
    modules: [onRequest3]
  },
  {
    routePath: "/:slug/haji",
    mountPath: "/:slug",
    method: "",
    middlewares: [],
    modules: [onRequest4]
  },
  {
    routePath: "/:slug/umroh",
    mountPath: "/:slug",
    method: "",
    middlewares: [],
    modules: [onRequest5]
  },
  {
    routePath: "/brosur",
    mountPath: "/",
    method: "OPTIONS",
    middlewares: [],
    modules: [onRequestOptions3]
  },
  {
    routePath: "/brosur",
    mountPath: "/",
    method: "",
    middlewares: [],
    modules: [onRequest6]
  },
  {
    routePath: "/",
    mountPath: "/",
    method: "",
    middlewares: [onRequest7],
    modules: []
  }
];

// ../node_modules/path-to-regexp/dist.es2015/index.js
function lexer(str) {
  var tokens = [];
  var i = 0;
  while (i < str.length) {
    var char = str[i];
    if (char === "*" || char === "+" || char === "?") {
      tokens.push({ type: "MODIFIER", index: i, value: str[i++] });
      continue;
    }
    if (char === "\\") {
      tokens.push({ type: "ESCAPED_CHAR", index: i++, value: str[i++] });
      continue;
    }
    if (char === "{") {
      tokens.push({ type: "OPEN", index: i, value: str[i++] });
      continue;
    }
    if (char === "}") {
      tokens.push({ type: "CLOSE", index: i, value: str[i++] });
      continue;
    }
    if (char === ":") {
      var name = "";
      var j = i + 1;
      while (j < str.length) {
        var code = str.charCodeAt(j);
        if (
          // `0-9`
          code >= 48 && code <= 57 || // `A-Z`
          code >= 65 && code <= 90 || // `a-z`
          code >= 97 && code <= 122 || // `_`
          code === 95
        ) {
          name += str[j++];
          continue;
        }
        break;
      }
      if (!name)
        throw new TypeError("Missing parameter name at ".concat(i));
      tokens.push({ type: "NAME", index: i, value: name });
      i = j;
      continue;
    }
    if (char === "(") {
      var count = 1;
      var pattern = "";
      var j = i + 1;
      if (str[j] === "?") {
        throw new TypeError('Pattern cannot start with "?" at '.concat(j));
      }
      while (j < str.length) {
        if (str[j] === "\\") {
          pattern += str[j++] + str[j++];
          continue;
        }
        if (str[j] === ")") {
          count--;
          if (count === 0) {
            j++;
            break;
          }
        } else if (str[j] === "(") {
          count++;
          if (str[j + 1] !== "?") {
            throw new TypeError("Capturing groups are not allowed at ".concat(j));
          }
        }
        pattern += str[j++];
      }
      if (count)
        throw new TypeError("Unbalanced pattern at ".concat(i));
      if (!pattern)
        throw new TypeError("Missing pattern at ".concat(i));
      tokens.push({ type: "PATTERN", index: i, value: pattern });
      i = j;
      continue;
    }
    tokens.push({ type: "CHAR", index: i, value: str[i++] });
  }
  tokens.push({ type: "END", index: i, value: "" });
  return tokens;
}
__name(lexer, "lexer");
function parse(str, options) {
  if (options === void 0) {
    options = {};
  }
  var tokens = lexer(str);
  var _a = options.prefixes, prefixes = _a === void 0 ? "./" : _a, _b = options.delimiter, delimiter = _b === void 0 ? "/#?" : _b;
  var result = [];
  var key = 0;
  var i = 0;
  var path = "";
  var tryConsume = /* @__PURE__ */ __name(function(type) {
    if (i < tokens.length && tokens[i].type === type)
      return tokens[i++].value;
  }, "tryConsume");
  var mustConsume = /* @__PURE__ */ __name(function(type) {
    var value2 = tryConsume(type);
    if (value2 !== void 0)
      return value2;
    var _a2 = tokens[i], nextType = _a2.type, index = _a2.index;
    throw new TypeError("Unexpected ".concat(nextType, " at ").concat(index, ", expected ").concat(type));
  }, "mustConsume");
  var consumeText = /* @__PURE__ */ __name(function() {
    var result2 = "";
    var value2;
    while (value2 = tryConsume("CHAR") || tryConsume("ESCAPED_CHAR")) {
      result2 += value2;
    }
    return result2;
  }, "consumeText");
  var isSafe = /* @__PURE__ */ __name(function(value2) {
    for (var _i = 0, delimiter_1 = delimiter; _i < delimiter_1.length; _i++) {
      var char2 = delimiter_1[_i];
      if (value2.indexOf(char2) > -1)
        return true;
    }
    return false;
  }, "isSafe");
  var safePattern = /* @__PURE__ */ __name(function(prefix2) {
    var prev = result[result.length - 1];
    var prevText = prefix2 || (prev && typeof prev === "string" ? prev : "");
    if (prev && !prevText) {
      throw new TypeError('Must have text between two parameters, missing text after "'.concat(prev.name, '"'));
    }
    if (!prevText || isSafe(prevText))
      return "[^".concat(escapeString(delimiter), "]+?");
    return "(?:(?!".concat(escapeString(prevText), ")[^").concat(escapeString(delimiter), "])+?");
  }, "safePattern");
  while (i < tokens.length) {
    var char = tryConsume("CHAR");
    var name = tryConsume("NAME");
    var pattern = tryConsume("PATTERN");
    if (name || pattern) {
      var prefix = char || "";
      if (prefixes.indexOf(prefix) === -1) {
        path += prefix;
        prefix = "";
      }
      if (path) {
        result.push(path);
        path = "";
      }
      result.push({
        name: name || key++,
        prefix,
        suffix: "",
        pattern: pattern || safePattern(prefix),
        modifier: tryConsume("MODIFIER") || ""
      });
      continue;
    }
    var value = char || tryConsume("ESCAPED_CHAR");
    if (value) {
      path += value;
      continue;
    }
    if (path) {
      result.push(path);
      path = "";
    }
    var open = tryConsume("OPEN");
    if (open) {
      var prefix = consumeText();
      var name_1 = tryConsume("NAME") || "";
      var pattern_1 = tryConsume("PATTERN") || "";
      var suffix = consumeText();
      mustConsume("CLOSE");
      result.push({
        name: name_1 || (pattern_1 ? key++ : ""),
        pattern: name_1 && !pattern_1 ? safePattern(prefix) : pattern_1,
        prefix,
        suffix,
        modifier: tryConsume("MODIFIER") || ""
      });
      continue;
    }
    mustConsume("END");
  }
  return result;
}
__name(parse, "parse");
function match(str, options) {
  var keys = [];
  var re = pathToRegexp(str, keys, options);
  return regexpToFunction(re, keys, options);
}
__name(match, "match");
function regexpToFunction(re, keys, options) {
  if (options === void 0) {
    options = {};
  }
  var _a = options.decode, decode = _a === void 0 ? function(x) {
    return x;
  } : _a;
  return function(pathname) {
    var m = re.exec(pathname);
    if (!m)
      return false;
    var path = m[0], index = m.index;
    var params = /* @__PURE__ */ Object.create(null);
    var _loop_1 = /* @__PURE__ */ __name(function(i2) {
      if (m[i2] === void 0)
        return "continue";
      var key = keys[i2 - 1];
      if (key.modifier === "*" || key.modifier === "+") {
        params[key.name] = m[i2].split(key.prefix + key.suffix).map(function(value) {
          return decode(value, key);
        });
      } else {
        params[key.name] = decode(m[i2], key);
      }
    }, "_loop_1");
    for (var i = 1; i < m.length; i++) {
      _loop_1(i);
    }
    return { path, index, params };
  };
}
__name(regexpToFunction, "regexpToFunction");
function escapeString(str) {
  return str.replace(/([.+*?=^!:${}()[\]|/\\])/g, "\\$1");
}
__name(escapeString, "escapeString");
function flags(options) {
  return options && options.sensitive ? "" : "i";
}
__name(flags, "flags");
function regexpToRegexp(path, keys) {
  if (!keys)
    return path;
  var groupsRegex = /\((?:\?<(.*?)>)?(?!\?)/g;
  var index = 0;
  var execResult = groupsRegex.exec(path.source);
  while (execResult) {
    keys.push({
      // Use parenthesized substring match if available, index otherwise
      name: execResult[1] || index++,
      prefix: "",
      suffix: "",
      modifier: "",
      pattern: ""
    });
    execResult = groupsRegex.exec(path.source);
  }
  return path;
}
__name(regexpToRegexp, "regexpToRegexp");
function arrayToRegexp(paths, keys, options) {
  var parts = paths.map(function(path) {
    return pathToRegexp(path, keys, options).source;
  });
  return new RegExp("(?:".concat(parts.join("|"), ")"), flags(options));
}
__name(arrayToRegexp, "arrayToRegexp");
function stringToRegexp(path, keys, options) {
  return tokensToRegexp(parse(path, options), keys, options);
}
__name(stringToRegexp, "stringToRegexp");
function tokensToRegexp(tokens, keys, options) {
  if (options === void 0) {
    options = {};
  }
  var _a = options.strict, strict = _a === void 0 ? false : _a, _b = options.start, start = _b === void 0 ? true : _b, _c = options.end, end = _c === void 0 ? true : _c, _d = options.encode, encode = _d === void 0 ? function(x) {
    return x;
  } : _d, _e = options.delimiter, delimiter = _e === void 0 ? "/#?" : _e, _f = options.endsWith, endsWith = _f === void 0 ? "" : _f;
  var endsWithRe = "[".concat(escapeString(endsWith), "]|$");
  var delimiterRe = "[".concat(escapeString(delimiter), "]");
  var route = start ? "^" : "";
  for (var _i = 0, tokens_1 = tokens; _i < tokens_1.length; _i++) {
    var token = tokens_1[_i];
    if (typeof token === "string") {
      route += escapeString(encode(token));
    } else {
      var prefix = escapeString(encode(token.prefix));
      var suffix = escapeString(encode(token.suffix));
      if (token.pattern) {
        if (keys)
          keys.push(token);
        if (prefix || suffix) {
          if (token.modifier === "+" || token.modifier === "*") {
            var mod = token.modifier === "*" ? "?" : "";
            route += "(?:".concat(prefix, "((?:").concat(token.pattern, ")(?:").concat(suffix).concat(prefix, "(?:").concat(token.pattern, "))*)").concat(suffix, ")").concat(mod);
          } else {
            route += "(?:".concat(prefix, "(").concat(token.pattern, ")").concat(suffix, ")").concat(token.modifier);
          }
        } else {
          if (token.modifier === "+" || token.modifier === "*") {
            throw new TypeError('Can not repeat "'.concat(token.name, '" without a prefix and suffix'));
          }
          route += "(".concat(token.pattern, ")").concat(token.modifier);
        }
      } else {
        route += "(?:".concat(prefix).concat(suffix, ")").concat(token.modifier);
      }
    }
  }
  if (end) {
    if (!strict)
      route += "".concat(delimiterRe, "?");
    route += !options.endsWith ? "$" : "(?=".concat(endsWithRe, ")");
  } else {
    var endToken = tokens[tokens.length - 1];
    var isEndDelimited = typeof endToken === "string" ? delimiterRe.indexOf(endToken[endToken.length - 1]) > -1 : endToken === void 0;
    if (!strict) {
      route += "(?:".concat(delimiterRe, "(?=").concat(endsWithRe, "))?");
    }
    if (!isEndDelimited) {
      route += "(?=".concat(delimiterRe, "|").concat(endsWithRe, ")");
    }
  }
  return new RegExp(route, flags(options));
}
__name(tokensToRegexp, "tokensToRegexp");
function pathToRegexp(path, keys, options) {
  if (path instanceof RegExp)
    return regexpToRegexp(path, keys);
  if (Array.isArray(path))
    return arrayToRegexp(path, keys, options);
  return stringToRegexp(path, keys, options);
}
__name(pathToRegexp, "pathToRegexp");

// ../node_modules/wrangler/templates/pages-template-worker.ts
var escapeRegex = /[.+?^${}()|[\]\\]/g;
function* executeRequest(request) {
  const requestPath = new URL(request.url).pathname;
  for (const route of [...routes].reverse()) {
    if (route.method && route.method !== request.method) {
      continue;
    }
    const routeMatcher = match(route.routePath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const mountMatcher = match(route.mountPath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const matchResult = routeMatcher(requestPath);
    const mountMatchResult = mountMatcher(requestPath);
    if (matchResult && mountMatchResult) {
      for (const handler of route.middlewares.flat()) {
        yield {
          handler,
          params: matchResult.params,
          path: mountMatchResult.path
        };
      }
    }
  }
  for (const route of routes) {
    if (route.method && route.method !== request.method) {
      continue;
    }
    const routeMatcher = match(route.routePath.replace(escapeRegex, "\\$&"), {
      end: true
    });
    const mountMatcher = match(route.mountPath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const matchResult = routeMatcher(requestPath);
    const mountMatchResult = mountMatcher(requestPath);
    if (matchResult && mountMatchResult && route.modules.length) {
      for (const handler of route.modules.flat()) {
        yield {
          handler,
          params: matchResult.params,
          path: matchResult.path
        };
      }
      break;
    }
  }
}
__name(executeRequest, "executeRequest");
var pages_template_worker_default = {
  async fetch(originalRequest, env, workerContext) {
    let request = originalRequest;
    const handlerIterator = executeRequest(request);
    let data = {};
    let isFailOpen = false;
    const next = /* @__PURE__ */ __name(async (input, init) => {
      if (input !== void 0) {
        let url = input;
        if (typeof input === "string") {
          url = new URL(input, request.url).toString();
        }
        request = new Request(url, init);
      }
      const result = handlerIterator.next();
      if (result.done === false) {
        const { handler, params, path } = result.value;
        const context = {
          request: new Request(request.clone()),
          functionPath: path,
          next,
          params,
          get data() {
            return data;
          },
          set data(value) {
            if (typeof value !== "object" || value === null) {
              throw new Error("context.data must be an object");
            }
            data = value;
          },
          env,
          waitUntil: workerContext.waitUntil.bind(workerContext),
          passThroughOnException: /* @__PURE__ */ __name(() => {
            isFailOpen = true;
          }, "passThroughOnException")
        };
        const response = await handler(context);
        if (!(response instanceof Response)) {
          throw new Error("Your Pages function should return a Response");
        }
        return cloneResponse(response);
      } else if ("ASSETS") {
        const response = await env["ASSETS"].fetch(request);
        return cloneResponse(response);
      } else {
        const response = await fetch(request);
        return cloneResponse(response);
      }
    }, "next");
    try {
      return await next();
    } catch (error) {
      if (isFailOpen) {
        const response = await env["ASSETS"].fetch(request);
        return cloneResponse(response);
      }
      throw error;
    }
  }
};
var cloneResponse = /* @__PURE__ */ __name((response) => (
  // https://fetch.spec.whatwg.org/#null-body-status
  new Response(
    [101, 204, 205, 304].includes(response.status) ? null : response.body,
    response
  )
), "cloneResponse");

// ../node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// ../node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    return Response.json(error, {
      status: 500,
      headers: { "MF-Experimental-Error-Stack": "true" }
    });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// ../.wrangler/tmp/bundle-s5XRwu/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = pages_template_worker_default;

// ../node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// ../.wrangler/tmp/bundle-s5XRwu/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=functionsWorker-0.11964508701677379.mjs.map
