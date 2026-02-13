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

    console.log('AI Copy request:', { nama: pkg?.nama, hasHotel: !!pkg?.hotel, hasHarga: !!pkg?.harga });

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

    const systemPrompt = `Kamu adalah copywriter untuk travel umroh Alhijaz Indowisata.
Tugas kamu menulis caption promosi WhatsApp yang santai, hangat, dan persuasif tapi tetap islami.
Gunakan emoji secukupnya. Gunakan format WhatsApp (*bold*, _italic_) secukupnya.
Tulis dengan gaya ngobrol ke teman — friendly, tidak kaku, tidak terlalu formal.
Caption harus ringkas dan to the point, mudah dibaca di layar HP (maks 500 karakter).
Jangan gunakan hashtag. Jangan gunakan markdown selain format WhatsApp.
Jangan terlalu banyak baris kosong.`;

    const userPrompt = `Buatkan caption promosi WhatsApp untuk paket umroh ini:

Nama Paket: ${pkg.nama}
Maskapai: ${airline} (${flightCode})
Rute: ${route}
Tanggal Berangkat: ${depDate}
Tanggal Pulang: ${retDate}
Hotel Mekkah: ${hotelData?.mekkah_hotel || '-'} (${hotelData?.mekkah_bintang || '-'} bintang)
Hotel Madinah: ${hotelData?.madinah_hotel || '-'} (${hotelData?.madinah_bintang || '-'} bintang)
Sisa Seat: ${seatSisa} dari ${seatTotal}
Harga: ${pricingInfo || 'Hubungi kami'}
${agentName ? `\nAgent: ${agentName}` : ''}
${agentWebsite ? `Website: ${agentWebsite}` : ''}

Buat caption yang membuat orang tertarik untuk segera mendaftar.`;

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
        max_tokens: 380,
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
