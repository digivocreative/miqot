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

    // Build context for the AI
    const hotelData = pkg.hotel ? Object.values(pkg.hotel)[0] as any : {};
    const depDate = pkg.keberangkatan?.tgl || '';
    const retDate = pkg.kepulangan?.tgl || '';
    const airline = pkg.maskapai || '';
    const flightCode = pkg.keberangkatan?.kodePenerbangan || '';
    const route = pkg.keberangkatan?.rute || '';
    const seatSisa = pkg.seatSisa ?? '';
    const seatTotal = pkg.seatTotal ?? '';

    // Pricing info
    let pricingInfo = '';
    if (pkg.harga) {
      const firstTier = Object.values(pkg.harga)[0] as any;
      if (firstTier) {
        const prices: string[] = [];
        if (firstTier.Quard) prices.push(`Quad: Rp ${Number(firstTier.Quard).toLocaleString('id-ID')}`);
        if (firstTier.Triple) prices.push(`Triple: Rp ${Number(firstTier.Triple).toLocaleString('id-ID')}`);
        if (firstTier.Double) prices.push(`Double: Rp ${Number(firstTier.Double).toLocaleString('id-ID')}`);
        pricingInfo = prices.join(', ');
      }
    }

    const systemPrompt = `Kamu adalah copywriter profesional untuk travel umroh Alhijaz Indowisata. 
Tugas kamu menulis caption promosi WhatsApp yang menarik, persuasif, dan islami.
Gunakan emoji yang relevan. Gunakan format WhatsApp (*bold*, _italic_).
Tulis dalam Bahasa Indonesia yang sopan dan menyentuh hati calon jamaah.
Caption harus singkat, padat, mudah dibaca di layar HP (maks 800 karakter).
Jangan gunakan hashtag. Jangan gunakan markdown selain format WhatsApp.`;

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
        temperature: 0.8,
        max_tokens: 500,
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
