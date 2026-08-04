// Bani — orchestrator function calling untuk asisten AI in-app agent.
//
// Alur: pertanyaan agent → model memilih tool dari BANI_TOOLS (lib/bani-tools.js,
// registry yang sama dengan MCP) → SERVER yang mengeksekusi tool memakai `agent`
// hasil JWT (model TIDAK PERNAH menentukan agent mana yang dibaca) → model
// merangkum → jawaban akhir JSON berisi teks + REFERENSI id.
//
// Anti-halusinasi: model hanya boleh MEMILIH id, tidak pernah menulis isi kartu.
// hydrateBaniCards mengisi kartu dari row hasil tool request ini; id yang tidak
// pernah muncul di hasil tool dibuang diam-diam.
//
// READ-ONLY: modul ini tidak boleh menulis ke database sama sekali — dijaga
// source grep di tests/bani-orchestrator.test.js.
//
// `callOpenAI` sengaja di-inject (bukan fetch langsung) supaya seluruh loop
// bisa diuji tanpa jaringan; implementasi HTTP-nya tinggal di server.js.
import { BANI_TOOLS, BANI_TOOL_BY_NAME } from './bani-tools.js';

// Maks putaran model yang boleh meminta tool. Pertanyaan agent yang wajar
// selesai dalam 1–2 putaran; 3 adalah rem, bukan target.
export const BANI_MAX_ROUNDS = 3;
// Plafon eksekusi tool per request — melindungi DB (IO-sensitif) dari model
// yang menembak tool bertubi-tubi.
export const BANI_MAX_TOOL_CALLS = 6;
// Hemat token: tool daftar dipangkas 20 baris walau MAX_LIMIT registry 50.
export const BANI_TOOL_ROW_LIMIT = 20;
export const BANI_MAX_CARDS_PER_TYPE = 4;
const BANI_LINK_TARGETS = new Set(['jamaah', 'calendar', 'jadwal']);
const BANI_FALLBACK_ANSWER = 'Maaf, jawabannya belum bisa dirangkum. Coba tanya ulang dengan lebih spesifik.';

// Tanggal hari ini dalam zona WIB — model TIDAK punya jam, dan tanpa ini
// pertanyaan relatif ("akhir tahun ini", "Desember nanti") diterjemahkan
// memakai tebakan tahun dari data latihnya, yang bisa meleset dan menghasilkan
// filter bulan kosong.
function todayWib(now) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Jakarta' }).format(new Date(now()));
}

export function buildBaniSystemPrompt(agent, { now = Date.now } = {}) {
  const nama = String(agent?.name || agent?.slug || 'agent ini').trim();
  return `Kamu Bani, asisten agent di Alhijaz.co — dashboard kerja agent umroh & haji.
Kamu sedang membantu ${nama}. Semua tool sudah otomatis terbatas pada data milik agent ini.
Hari ini ${todayWib(now)} (WIB). Pakai tanggal ini untuk menerjemahkan kata waktu relatif seperti "bulan ini", "akhir tahun", atau "tahun depan".

SUMBER JAWABAN
- Jawab HANYA dari hasil tool. Panggil tool yang relevan lebih dulu; jangan menebak.
- Dilarang mengarang angka, nama, tanggal, harga, atau ID. Kalau hasil tool kosong atau berisi error, bilang apa adanya bahwa datanya tidak ada, lalu sebut satu langkah lanjutan yang masuk akal.
- Jangan menampilkan nomor paspor atau data pribadi yang tidak ditanyakan.

GAYA — tulis seperti rekan kerja yang tahu datanya, bukan seperti mesin yang melapor
- Bahasa Indonesia sehari-hari, sapa pembacanya dengan "Anda". Langsung ke jawabannya; jangan membuka dengan mengulang pertanyaan.
- Pendek: 1–3 kalimat, maksimal sekitar 70 kata. Pertanyaan berupa angka cukup dijawab satu kalimat.
- Daftar maksimal 5 baris dan hanya bila memang berupa daftar. Kalau hasilnya lebih banyak, sebut yang paling relevan lalu tutup dengan "dan N lainnya" — jangan menyalin seluruh baris hasil tool, dan jangan memadatkan sisanya ke dalam satu baris.
- Maksimal 5 nama orang dalam satu jawaban. Sisanya cukup "dan N lainnya".
- Sebutkan yang berisi saja: kategori atau periode bernilai nol tidak perlu ditulis.
- Nominal besar boleh diringkas ke satu angka di belakang koma ("Rp31,9 juta", "Rp2,8 miliar") — bukan "Rp2,804 miliar" — dan konsisten dalam satu jawaban.
- Tanpa sapaan waktu (jangan "selamat pagi/siang/malam") dan tanpa kata ber-gender (jangan "Bapak", "Ibu", "beliau").
- JANGAN menyebut cara Anda memperoleh data: tanpa kata "tool", "sistem", "database", "sinkronisasi", "snapshot", "real-time", atau catatan seberapa baru datanya. Sebut angkanya saja seolah memang Anda hafal.
- Jangan menutup dengan basa-basi atau tawaran bantuan ("saya bisa bantu…", "silakan beri tahu…"). Berhenti begitu informasinya lengkap.
- Markdown terbatas: **tebal** hanya untuk angka/nama/tanggal kunci — secukupnya, bukan tiap kata — lalu baris baru dan daftar "- ". Dilarang heading, tabel, blok kode, dan tautan (link tidak bisa dirender, jadi jangan tulis URL).

FORMAT BALASAN
Selain pemanggilan tool, satu-satunya balasan yang valid adalah JSON polos tanpa pembungkus apa pun:
{"answer": "...", "package_ids": [], "jamaah_ids": [], "link": null}
- answer: teks jawaban untuk agent, mengikuti aturan GAYA di atas.
- package_ids: jadwal_id dari hasil list_jadwal_paket/get_jadwal_paket yang layak ditampilkan sebagai kartu. Maksimal 4, kosongkan bila tidak relevan.
- jamaah_ids: jm_id dari hasil list_jamaah/get_jamaah. Maksimal 4.
- link: "jamaah", "calendar", "jadwal", atau null — halaman dashboard yang sebaiknya dibuka untuk menindaklanjuti.
Cantumkan hanya ID yang benar-benar muncul di hasil tool. Kartu dirender terpisah, jadi jangan menyalin seluruh detailnya ke dalam answer.`;
}

// Spesifikasi tool untuk OpenAI dibangun dari registry bersama — deskripsi dan
// JSON Schema-nya sama persis dengan yang dilihat klien MCP.
export function buildBaniToolSpecs() {
  return BANI_TOOLS.map((tool) => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
}

// Ekstraksi JSON toleran: model kadang membungkus jawabannya dengan ```json
// fence atau menambah kalimat pengantar. Kembalikan null bila tidak ada objek
// dengan `answer` string — pemanggil yang memutuskan retry/degradasi.
export function extractBaniJson(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced ? fenced[1] : raw).trim();
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  let parsed;
  try {
    parsed = JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  if (typeof parsed.answer !== 'string' || !parsed.answer.trim()) return null;
  return parsed;
}

// Indeks row hasil tool request INI — satu-satunya sumber isi kartu.
function indexToolRows(toolResults) {
  const packages = new Map();
  const jamaah = new Map();
  const addPackage = (row) => { if (row?.jadwal_id) packages.set(String(row.jadwal_id).toUpperCase(), row); };
  const addJamaah = (row) => { if (row?.jm_id) jamaah.set(String(row.jm_id).toUpperCase(), row); };

  for (const result of toolResults || []) {
    if (!result?.ok) continue;
    const data = result.data;
    if (!data || typeof data !== 'object') continue;
    // list_jamaah / list_jadwal_paket / jamaah_birthdays → data.rows
    if (Array.isArray(data.rows)) {
      for (const row of data.rows) { addPackage(row); addJamaah(row); }
    }
    addPackage(data.paket);       // get_jadwal_paket
    addJamaah(data.jamaah);       // get_jamaah
    if (Array.isArray(data.booking_members)) for (const row of data.booking_members) addJamaah(row);
  }
  return { packages, jamaah };
}

export function hydrateBaniCards(toolResults, parsed) {
  const { packages, jamaah } = indexToolRows(toolResults);
  const cards = [];

  const collect = (ids, index, build) => {
    const seen = new Set();
    for (const id of Array.isArray(ids) ? ids : []) {
      if (seen.size >= BANI_MAX_CARDS_PER_TYPE) break;
      const key = String(id ?? '').trim().toUpperCase();
      if (!key || seen.has(key)) continue;
      const row = index.get(key);
      if (!row) continue; // id yang tidak ada di hasil tool → dibuang diam-diam
      seen.add(key);
      cards.push(build(row));
    }
  };

  collect(parsed?.package_ids, packages, (row) => ({
    type: 'package',
    jadwal_id: row.jadwal_id ?? null,
    nama: row.nama ?? row.jadwal_nama ?? null,
    berangkat_tgl: row.berangkat_tgl ?? null,
    pulang_tgl: row.pulang_tgl ?? null,
    durasi_hari: row.durasi_hari ?? null,
    maskapai: row.maskapai ?? null,
    seat_sisa: row.seat_sisa ?? null,
    sold_out: row.sold_out ?? null,
    harga_mulai: row.harga_mulai ?? null,
  }));

  collect(parsed?.jamaah_ids, jamaah, (row) => ({
    type: 'jamaah',
    jm_id: row.jm_id ?? null,
    nama: row.nama ?? null,
    jk: row.jk ?? null,
    id_umroh: row.id_umroh ?? null,
    paket: row.paket ?? null,
    tgl_berangkat: row.tgl_berangkat ?? null,
    sisa: row.sisa ?? null,
    bayar: row.bayar ?? null,
    wa: row.wa ?? null,
  }));

  const link = String(parsed?.link || '').trim().toLowerCase();
  if (BANI_LINK_TARGETS.has(link)) cards.push({ type: 'link', target: link });

  return cards;
}

// `note` pada hasil tool berisi kalimat provenance ("snapshot hasil sync, bukan
// real-time") — berguna untuk klien MCP, tapi model SELALU menyalinnya mentah ke
// akhir jawaban sehingga tiap balasan Bani ditutup disclaimer. Registry tool
// dipakai bersama MCP, jadi note-nya dibuang di sisi Bani saja, BUKAN di
// lib/bani-tools.js. `truncated_note` sengaja dibiarkan: itu memberi tahu model
// bahwa daftarnya terpotong, bukan basa-basi.
function stripToolProvenance(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return data;
  const { note, ...rest } = data;
  return rest;
}

// Satu pemanggilan tool. TIDAK PERNAH melempar keluar: error apa pun berubah
// jadi pesan role:'tool' supaya model bisa memperbaiki langkahnya sendiri, dan
// setiap tool_call tetap punya balasan (syarat protokol chat completions).
async function executeBaniToolCall({ call, agent, supabase, log, budgetLeft }) {
  const name = call?.function?.name || '';
  const fail = (error) => ({ name, counted: false, record: null, content: JSON.stringify({ error }) });

  const tool = BANI_TOOL_BY_NAME[name];
  if (!tool) return fail(`Tool "${name || '(kosong)'}" tidak dikenal.`);
  if (budgetLeft <= 0) return fail('Batas jumlah pemanggilan tool tercapai. Rangkum dengan data yang sudah ada.');

  let args;
  try {
    args = call.function?.arguments ? JSON.parse(call.function.arguments) : {};
  } catch {
    return fail('Argumen tool bukan JSON valid. Ulangi dengan JSON yang benar.');
  }
  if (!args || typeof args !== 'object' || Array.isArray(args)) args = {};

  // Hemat token: paginasi tool daftar dipangkas ke BANI_TOOL_ROW_LIMIT.
  if (tool.parameters?.properties?.limit) {
    const asked = Number(args.limit);
    args.limit = Number.isFinite(asked) && asked > 0 ? Math.min(asked, BANI_TOOL_ROW_LIMIT) : BANI_TOOL_ROW_LIMIT;
  }

  // Log hanya NAMA parameter, tidak pernah nilainya — search/jm_id bisa membawa
  // nama & nomor WA jamaah (PII) ke journald. Cermin logging mcp-server.js.
  log(`[Bani] ${agent?.slug}: ${name} (${Object.keys(args).join(',') || 'no args'})`);

  try {
    const out = await tool.run({ supabase, agent, log }, args);
    if (out?.ok) {
      return {
        name,
        counted: true,
        record: { name, ok: true, data: out.data },
        content: JSON.stringify(stripToolProvenance(out.data)),
      };
    }
    return {
      name,
      counted: true,
      record: { name, ok: false, data: null },
      content: JSON.stringify({ error: out?.error || 'Tool tidak mengembalikan hasil.' }),
    };
  } catch (err) {
    // Error DB/internal tinggal di log server; model cuma dapat pesan generik.
    log(`[Bani] ${agent?.slug}: ${name} ERROR ${err.message}`);
    return {
      name,
      counted: true,
      record: { name, ok: false, data: null },
      content: JSON.stringify({ error: 'Terjadi kesalahan internal saat mengambil data.' }),
    };
  }
}

export async function runBaniConversation({
  question,
  agent,
  supabase,
  log = () => {},
  callOpenAI,
  model,
  now = Date.now,
} = {}) {
  if (typeof callOpenAI !== 'function') throw new Error('runBaniConversation: callOpenAI wajib diinjeksi');
  const startedAt = now();
  const tools = buildBaniToolSpecs();
  const messages = [
    { role: 'system', content: buildBaniSystemPrompt(agent, { now }) },
    { role: 'user', content: String(question || '').trim() },
  ];

  const toolResults = [];
  const toolsUsed = [];
  let toolCallCount = 0;
  let finalText = null;

  for (let round = 0; round < BANI_MAX_ROUNDS; round += 1) {
    const completion = await callOpenAI({ model, messages, tools });
    const message = completion?.choices?.[0]?.message;
    if (!message) throw new Error('Balasan OpenAI tidak memuat message');
    messages.push(message);

    const calls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
    if (!calls.length) {
      finalText = typeof message.content === 'string' ? message.content : '';
      break;
    }

    for (const call of calls) {
      const outcome = await executeBaniToolCall({
        call,
        agent,
        supabase,
        log,
        budgetLeft: BANI_MAX_TOOL_CALLS - toolCallCount,
      });
      if (outcome.counted) {
        toolCallCount += 1;
        if (!toolsUsed.includes(outcome.name)) toolsUsed.push(outcome.name);
      }
      if (outcome.record) toolResults.push(outcome.record);
      messages.push({ role: 'tool', tool_call_id: call.id, content: outcome.content });
    }
  }

  // response_format sengaja TIDAK dipakai selama putaran tool: pada sebagian
  // model itu menekan tool_call. Kontrak JSON ditegakkan lewat system prompt +
  // ekstraksi toleran, dengan satu kali perbaikan bila gagal.
  let parsed = extractBaniJson(finalText);
  if (!parsed) {
    messages.push({ role: 'user', content: 'Balas ulang HANYA JSON sesuai format yang diminta, tanpa teks atau pembungkus lain.' });
    let retryText = '';
    const retry = await callOpenAI({ model, messages, tools });
    const retryMessage = retry?.choices?.[0]?.message;
    if (typeof retryMessage?.content === 'string') retryText = retryMessage.content;
    parsed = extractBaniJson(retryText);

    if (!parsed) {
      // Degradasi: teks mentah model lebih berguna bagi agent daripada error,
      // tapi TANPA kartu — tidak ada referensi id yang bisa dipercaya.
      const rawAnswer = String(retryText || finalText || '').trim();
      log(`[Bani] ${agent?.slug}: jawaban degradasi ${now() - startedAt}ms, tools=${toolsUsed.join(',') || '-'}`);
      return {
        success: true,
        answer: rawAnswer || BANI_FALLBACK_ANSWER,
        cards: [],
        tools_used: toolsUsed,
        degraded: true,
      };
    }
  }

  const cards = hydrateBaniCards(toolResults, parsed);
  log(`[Bani] ${agent?.slug}: jawaban siap ${now() - startedAt}ms, tools=${toolsUsed.join(',') || '-'}, cards=${cards.length}`);
  return {
    success: true,
    answer: parsed.answer.trim(),
    cards,
    tools_used: toolsUsed,
  };
}
