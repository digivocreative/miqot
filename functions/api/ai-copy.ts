/**
 * Cloudflare Pages Function — AI Copywriting Generator
 * Proxies requests to OpenAI to generate WhatsApp marketing copy
 * 
 * POST /api/ai-copy
 * Body: { packageData: { nama, maskapai, keberangkatan, hotel, seatSisa, seatTotal, harga, ... }, agentName?, agentWebsite? }
 */

export async function onRequestPost(context: any) {
  const { request, env } = context;

  const OPENAI_KEY = env.OPENAI_API_KEY;
  if (!OPENAI_KEY) {
    return new Response(
      JSON.stringify({ error: 'OpenAI API key not configured' }),
      { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
    );
  }

  try {
    const body = await request.json() as any;
    const pkg = body.packageData;
    const agentName = body.agentName || '';
    const agentWebsite = body.agentWebsite || '';

    if (!pkg || !pkg.nama) {
      return new Response(
        JSON.stringify({ error: 'Missing packageData' }),
        { status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
      );
    }

    // Build context for the AI — payload is already flat from the client
    const hotelData = pkg.hotel || {};
    const depDate = pkg.keberangkatan?.tgl || '';
    const retDate = pkg.kepulangan?.tgl || '';
    const airline = pkg.maskapai || '';
    const flightCode = pkg.keberangkatan?.kodePenerbangan || '';
    const route = pkg.keberangkatan?.rute || '';
    const seatSisa = pkg.seatSisa ?? '';
    const seatTotal = pkg.seatTotal ?? '';

    // Pricing info
    let pricingInfo = '';
    const pricing = pkg.harga;
    if (pricing) {
      const prices: string[] = [];
      if (pricing.Quard) prices.push(`Quad: Rp ${Number(pricing.Quard).toLocaleString('id-ID')}`);
      if (pricing.Triple) prices.push(`Triple: Rp ${Number(pricing.Triple).toLocaleString('id-ID')}`);
      if (pricing.Double) prices.push(`Double: Rp ${Number(pricing.Double).toLocaleString('id-ID')}`);
      pricingInfo = prices.join(', ');
    }

    const systemPrompt = `Kamu adalah admin travel umroh "Alhijaz Indowisata" yang biasa broadcast info paket ke calon jamaah via WhatsApp.
Tulis pesan yang terasa natural, seperti orang betulan nge-chat — bukan template iklan.

Aturan:
- Bahasa Indonesia sehari-hari, sopan tapi santai. Boleh pakai "kak", "nih", "loh", "yuk".
- Emoji max 5-6 di seluruh pesan, taruh di tempat yang natural (bukan dipaksa tiap baris).
- Gunakan format WhatsApp: *bold* untuk nama paket dan info penting, _italic_ kalau perlu penekanan halus.
- JANGAN pakai kalimat hiperbola/salesy: "Jangan sampai ketinggalan!", "Buruan daftar!", "Kesempatan emas!", "Siapa yang siap?".
- JANGAN buka dengan pertanyaan retoris ("Siapa yang siap...", "Mau berangkat umroh?").
- JANGAN tutup dengan "Hubungi kami, ya!" — cukup tulis info kontak kalau ada.
- Jangan pakai hashtag. Jangan pakai markdown selain format WhatsApp.
- Total max 500 karakter. Langsung ke inti, tanpa basa-basi panjang.
- Variasikan pembuka setiap generate (salam, info langsung, atau kabar baik).`;

    const userPrompt = `Tulis pesan broadcast WhatsApp untuk paket umroh berikut:

*${pkg.nama}*
✈️ ${airline} (${flightCode}) — ${route}
📅 Berangkat: ${depDate} | Pulang: ${retDate}
🏨 Mekkah: ${hotelData?.mekkah_hotel || '-'} (${hotelData?.mekkah_bintang || '-'}⭐)
🏨 Madinah: ${hotelData?.madinah_hotel || '-'} (${hotelData?.madinah_bintang || '-'}⭐)
💺 Sisa seat: ${seatSisa}/${seatTotal}
💰 Harga: ${pricingInfo || 'Hubungi kami'}
${agentName ? `👤 ${agentName}` : ''}${agentWebsite ? ` — ${agentWebsite}` : ''}

Tulis pesan seolah kamu sedang menginfokan ini ke teman atau kenalan yang tertarik umroh. Jangan terdengar seperti iklan.`;

    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.85,
        max_tokens: 400,
      }),
    });

    if (!openaiRes.ok) {
      const errBody = await openaiRes.text();
      console.error('OpenAI error:', errBody);
      return new Response(
        JSON.stringify({ error: 'OpenAI API error', details: errBody }),
        { status: 502, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
      );
    }

    const result = await openaiRes.json() as any;
    const generatedText = result.choices?.[0]?.message?.content || '';

    return new Response(
      JSON.stringify({ text: generatedText }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );

  } catch (error: any) {
    console.error('AI Copy error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal error', message: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
    );
  }
};

// CORS preflight
export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    },
  });
};
