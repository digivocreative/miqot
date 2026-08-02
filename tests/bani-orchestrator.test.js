import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  runBaniConversation,
  hydrateBaniCards,
  extractBaniJson,
  buildBaniToolSpecs,
  buildBaniSystemPrompt,
  BANI_MAX_ROUNDS,
  BANI_MAX_TOOL_CALLS,
  BANI_TOOL_ROW_LIMIT,
  BANI_MAX_CARDS_PER_TYPE,
} from '../lib/bani-orchestrator.js';
import { isBaniEnabledForAgent, requireBaniAccess } from '../lib/bani-access.js';

const root = new URL('..', import.meta.url);
const rootPath = root.pathname;

function read(path) {
  return readFileSync(join(rootPath, path), 'utf8');
}

const AGENT = { id: 'agent-1', slug: 'nikita', name: 'Nikita' };

// Stub PostgREST: chain mencatat panggilan, hasil per-tabel dari resolver.
function stubSupabase(resolver) {
  const calls = [];
  const make = (table) => {
    const chain = {};
    for (const m of ['select', 'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'not', 'or', 'ilike', 'order', 'range', 'limit']) {
      chain[m] = (...args) => { calls.push([m, ...args]); return chain; };
    }
    chain.maybeSingle = () => Promise.resolve(resolver(table));
    chain.then = (res, rej) => Promise.resolve(resolver(table)).then(res, rej);
    return chain;
  };
  return { calls, from(table) { calls.push(['from', table]); return make(table); } };
}

const PAKET_HARGA = { UHUD: { Quard: '33900000', Triple: '35900000', Double: '0', Single: '0', Infant: '9000000' } };
const SCHEDULE_ROWS = [
  { jadwal_id: 'JBU1484', jadwal_nama: 'REGULER UHUD 9HR', promo: '0', seat_total: '45', seat_sisa: '12', maskapai: 'SV', berangkat_tgl: '2026-12-05', pulang_tgl: '2026-12-13', paket_harga: PAKET_HARGA, synced_at: '2026-08-01T00:00:00Z' },
];
const JAMAAH_ROWS = [
  { jm_id: 'JM001', id_umroh: 'AIW1', nama: 'AHMAD', jk: 'L', wa: '0811', paket: 'HEMAT', bayar: 5000000, sisa: 28900000, tgl_berangkat: '2026-12-05' },
];

const okSupabase = () => stubSupabase((table) => (
  table === 'umroh_schedules' ? { data: SCHEDULE_ROWS, error: null }
    : table === 'jamaah' ? { data: JAMAAH_ROWS, error: null, count: JAMAAH_ROWS.length }
      : { data: [], error: null, count: 0 }
));

// callOpenAI terskrip: respons ke-n dipakai untuk panggilan ke-n; respons
// terakhir dipakai berulang (untuk menguji model yang tidak pernah berhenti).
function scriptedOpenAI(responses) {
  const calls = [];
  const fn = async (body) => {
    calls.push(body);
    const next = responses[Math.min(calls.length - 1, responses.length - 1)];
    return typeof next === 'function' ? next(body) : next;
  };
  fn.calls = calls;
  return fn;
}

const toolCall = (name, args = {}, id = `call_${name}`) => ({
  id, type: 'function', function: { name, arguments: JSON.stringify(args) },
});
const toolCallsResponse = (...calls) => ({ choices: [{ message: { role: 'assistant', content: null, tool_calls: calls } }] });
const textResponse = (content) => ({ choices: [{ message: { role: 'assistant', content } }] });
const jsonResponse = (obj) => textResponse(JSON.stringify(obj));

const toolMessages = (body) => (body?.messages || []).filter((m) => m.role === 'tool');

// ── loop function calling ────────────────────────────────────────────────────

test('loop berhenti di BANI_MAX_ROUNDS walau model terus minta tool', async () => {
  const callOpenAI = scriptedOpenAI([toolCallsResponse(toolCall('list_jadwal_paket', { month: '2026-12' }))]);
  const supabase = okSupabase();

  const out = await runBaniConversation({ question: 'paket Desember?', agent: AGENT, supabase, callOpenAI, model: 'stub' });

  // 3 putaran tool + 1 permintaan perbaikan format = 4 panggilan model, lalu berhenti.
  assert.equal(callOpenAI.calls.length, BANI_MAX_ROUNDS + 1);
  const executed = supabase.calls.filter(([m]) => m === 'from').length;
  assert.equal(executed, BANI_MAX_ROUNDS, 'satu eksekusi tool per putaran');
  assert.equal(out.degraded, true);
  assert.deepEqual(out.cards, []);
});

test('eksekusi tool dibatasi BANI_MAX_TOOL_CALLS walau model minta paralel', async () => {
  const callOpenAI = scriptedOpenAI([toolCallsResponse(
    toolCall('list_jadwal_paket', {}, 'c1'),
    toolCall('list_jadwal_paket', {}, 'c2'),
    toolCall('list_jadwal_paket', {}, 'c3'),
    toolCall('list_jadwal_paket', {}, 'c4'),
  )]);
  const supabase = okSupabase();

  await runBaniConversation({ question: 'x', agent: AGENT, supabase, callOpenAI, model: 'stub' });

  const executed = supabase.calls.filter(([m]) => m === 'from').length;
  assert.equal(executed, BANI_MAX_TOOL_CALLS, 'plafon eksekusi tool ditegakkan');
  // Setiap tool_call tetap dibalas (syarat protokol), yang lewat plafon dijawab error.
  const lastRound = toolMessages(callOpenAI.calls.at(-1));
  assert.equal(lastRound.length, 12, '3 putaran x 4 tool_call harus punya balasan semua');
  const refused = lastRound.filter((m) => m.content.includes('Batas jumlah pemanggilan tool'));
  assert.equal(refused.length, 6);
});

test('tool yang error diteruskan sebagai hasil tool, loop lanjut tanpa throw', async () => {
  const supabase = stubSupabase(() => ({ data: null, error: { message: 'relation "jamaah" does not exist' } }));
  const callOpenAI = scriptedOpenAI([
    toolCallsResponse(toolCall('list_jamaah', {})),
    jsonResponse({ answer: 'Datanya belum bisa diambil.', jamaah_ids: [], link: null }),
  ]);

  const out = await runBaniConversation({ question: 'siapa belum lunas?', agent: AGENT, supabase, callOpenAI, model: 'stub' });

  assert.equal(out.success, true);
  assert.equal(out.degraded, undefined);
  assert.deepEqual(out.tools_used, ['list_jamaah']);
  const [toolMsg] = toolMessages(callOpenAI.calls[1]);
  assert.equal(JSON.parse(toolMsg.content).error, 'Terjadi kesalahan internal saat mengambil data.');
  // Pesan Postgres mentah tidak boleh bocor ke model.
  assert.ok(!toolMsg.content.includes('does not exist'));
  // Hasil tool gagal tidak boleh jadi sumber kartu.
  assert.deepEqual(out.cards, []);
});

test('tool tak dikenal dan argumen non-JSON dibalas error, tidak menghentikan loop', async () => {
  const supabase = okSupabase();
  const callOpenAI = scriptedOpenAI([
    toolCallsResponse(
      { id: 'x1', type: 'function', function: { name: 'drop_database', arguments: '{}' } },
      { id: 'x2', type: 'function', function: { name: 'list_jamaah', arguments: '{bukan json' } },
    ),
    jsonResponse({ answer: 'Tidak ada data.' }),
  ]);

  const out = await runBaniConversation({ question: 'x', agent: AGENT, supabase, callOpenAI, model: 'stub' });

  assert.equal(out.success, true);
  assert.deepEqual(out.tools_used, [], 'panggilan invalid tidak dihitung terpakai');
  assert.equal(supabase.calls.length, 0, 'tidak ada query yang dijalankan');
  const msgs = toolMessages(callOpenAI.calls[1]);
  assert.match(msgs[0].content, /tidak dikenal/);
  assert.match(msgs[1].content, /bukan JSON valid/);
});

test('agent diambil dari deps, bukan dari argumen model (anti-spoof)', async () => {
  const supabase = okSupabase();
  // Model mencoba menyuntik agent lain lewat argumen tool.
  const callOpenAI = scriptedOpenAI([
    toolCallsResponse(toolCall('list_jamaah', { agent_id: 'agent-lain', limit: 50 })),
    jsonResponse({ answer: 'ok' }),
  ]);

  await runBaniConversation({ question: 'x', agent: AGENT, supabase, callOpenAI, model: 'stub' });

  const scoped = supabase.calls.filter(([m, col, val]) => m === 'eq' && col === 'agent_id' && val === AGENT.id);
  assert.equal(scoped.length, 1, 'query tetap ter-scope agent dari JWT');
  assert.equal(supabase.calls.some(([m, , val]) => m === 'eq' && val === 'agent-lain'), false);
  // limit dipangkas demi hemat token.
  const range = supabase.calls.find(([m]) => m === 'range');
  assert.deepEqual(range.slice(1), [0, BANI_TOOL_ROW_LIMIT - 1]);
});

// ── parsing jawaban akhir ────────────────────────────────────────────────────

test('jawaban akhir dengan ```json fence tetap terparse', async () => {
  const supabase = okSupabase();
  const fenced = '```json\n{"answer":"Ada **1** paket.","package_ids":["JBU1484"],"link":"jadwal"}\n```';
  const callOpenAI = scriptedOpenAI([
    toolCallsResponse(toolCall('list_jadwal_paket', { month: '2026-12' })),
    textResponse(fenced),
  ]);

  const out = await runBaniConversation({ question: 'paket Desember?', agent: AGENT, supabase, callOpenAI, model: 'stub' });

  assert.equal(out.degraded, undefined);
  assert.equal(out.answer, 'Ada **1** paket.');
  assert.equal(out.cards[0].type, 'package');
  assert.equal(out.cards[0].jadwal_id, 'JBU1484');
  assert.deepEqual(out.cards.at(-1), { type: 'link', target: 'jadwal' });
});

test('extractBaniJson toleran terhadap pembungkus, menolak yang bukan jawaban', () => {
  assert.equal(extractBaniJson('{"answer":"halo"}').answer, 'halo');
  assert.equal(extractBaniJson('```\n{"answer":"halo"}\n```').answer, 'halo');
  assert.equal(extractBaniJson('Berikut jawabannya: {"answer":"halo"} semoga membantu').answer, 'halo');
  assert.equal(extractBaniJson('bukan json'), null);
  assert.equal(extractBaniJson('{"answer":""}'), null);
  assert.equal(extractBaniJson('{"answer":123}'), null);
  assert.equal(extractBaniJson(''), null);
  assert.equal(extractBaniJson(null), null);
});

test('format gagal → satu retry; berhasil di retry tidak dianggap degradasi', async () => {
  const supabase = okSupabase();
  const callOpenAI = scriptedOpenAI([
    textResponse('Maaf ya, ini jawabannya tanpa JSON.'),
    jsonResponse({ answer: 'Sudah rapi.' }),
  ]);

  const out = await runBaniConversation({ question: 'x', agent: AGENT, supabase, callOpenAI, model: 'stub' });

  assert.equal(callOpenAI.calls.length, 2);
  const repair = callOpenAI.calls[1].messages.at(-1);
  assert.equal(repair.role, 'user');
  assert.match(repair.content, /HANYA JSON/);
  assert.equal(out.answer, 'Sudah rapi.');
  assert.equal(out.degraded, undefined);
});

test('format tetap gagal setelah retry → degradasi memakai teks mentah, tanpa kartu', async () => {
  const supabase = okSupabase();
  const callOpenAI = scriptedOpenAI([
    toolCallsResponse(toolCall('list_jadwal_paket', {})),
    textResponse('masih bukan JSON'),
    textResponse('tetap bukan JSON'),
  ]);

  const out = await runBaniConversation({ question: 'x', agent: AGENT, supabase, callOpenAI, model: 'stub' });

  assert.equal(out.success, true);
  assert.equal(out.degraded, true);
  assert.equal(out.answer, 'tetap bukan JSON');
  assert.deepEqual(out.cards, [], 'tanpa JSON tidak ada referensi id yang bisa dipercaya');
  assert.deepEqual(out.tools_used, ['list_jadwal_paket']);
});

// ── hydration (anti-halusinasi) ──────────────────────────────────────────────

const TOOL_RESULTS = [
  {
    name: 'list_jadwal_paket',
    ok: true,
    data: {
      rows: [
        { jadwal_id: 'JBU1484', nama: 'REGULER UHUD 9HR', berangkat_tgl: '2026-12-05', pulang_tgl: '2026-12-13', durasi_hari: 9, maskapai: 'SV', seat_sisa: 12, sold_out: false, harga_mulai: 33900000 },
        { jadwal_id: 'JBU1500', nama: 'PROMO DUBAI 11HR', berangkat_tgl: '2026-12-20', pulang_tgl: '2026-12-30', durasi_hari: 11, maskapai: 'EK', seat_sisa: 0, sold_out: true, harga_mulai: 29900000 },
      ],
    },
  },
  {
    name: 'list_jamaah',
    ok: true,
    data: { rows: JAMAAH_ROWS },
  },
];

test('hydrateBaniCards membuang id yang tidak ada di hasil tool', () => {
  const cards = hydrateBaniCards(TOOL_RESULTS, {
    answer: 'x',
    package_ids: ['JBU1484', 'JBU9999', 'TIDAK-ADA'],
    jamaah_ids: ['JM001', 'JM404'],
  });
  assert.deepEqual(cards.map((c) => c.type), ['package', 'jamaah']);
  assert.equal(cards[0].jadwal_id, 'JBU1484');
  assert.equal(cards[1].jm_id, 'JM001');
});

test('hydrateBaniCards mengisi kartu lengkap dari row hasil tool', () => {
  const cards = hydrateBaniCards(TOOL_RESULTS, { answer: 'x', package_ids: ['JBU1500'], jamaah_ids: ['JM001'] });
  assert.deepEqual(cards[0], {
    type: 'package',
    jadwal_id: 'JBU1500',
    nama: 'PROMO DUBAI 11HR',
    berangkat_tgl: '2026-12-20',
    pulang_tgl: '2026-12-30',
    durasi_hari: 11,
    maskapai: 'EK',
    seat_sisa: 0,
    sold_out: true,
    harga_mulai: 29900000,
  });
  assert.deepEqual(cards[1], {
    type: 'jamaah',
    jm_id: 'JM001',
    nama: 'AHMAD',
    jk: 'L',
    id_umroh: 'AIW1',
    paket: 'HEMAT',
    tgl_berangkat: '2026-12-05',
    sisa: 28900000,
    bayar: 5000000,
    wa: '0811',
  });
});

test('hydrateBaniCards membatasi 4 kartu per tipe dan membuang duplikat', () => {
  const rows = Array.from({ length: 8 }, (_, i) => ({ jm_id: `JM10${i}`, nama: `X${i}` }));
  const cards = hydrateBaniCards(
    [{ name: 'list_jamaah', ok: true, data: { rows } }],
    { answer: 'x', jamaah_ids: [...rows.map((r) => r.jm_id), 'JM100'] },
  );
  assert.equal(cards.length, BANI_MAX_CARDS_PER_TYPE);
  assert.deepEqual(cards.map((c) => c.jm_id), ['JM100', 'JM101', 'JM102', 'JM103']);
});

test('hydrateBaniCards mengambil hasil get_jamaah/get_jadwal_paket dan hanya link valid', () => {
  const results = [
    { name: 'get_jadwal_paket', ok: true, data: { paket: { jadwal_id: 'JBU777', nama: 'PAKET SATU' } } },
    { name: 'get_jamaah', ok: true, data: { jamaah: { jm_id: 'JM777', nama: 'BUDI' }, booking_members: [{ jm_id: 'JM778', nama: 'SITI' }] } },
  ];
  const cards = hydrateBaniCards(results, {
    answer: 'x',
    package_ids: ['jbu777'], // huruf kecil dari model tetap cocok
    jamaah_ids: ['JM778'],
    link: 'jamaah',
  });
  assert.equal(cards[0].jadwal_id, 'JBU777');
  assert.equal(cards[1].nama, 'SITI');
  assert.deepEqual(cards[2], { type: 'link', target: 'jamaah' });

  assert.deepEqual(hydrateBaniCards(results, { answer: 'x', link: 'pengaturan' }), []);
  assert.deepEqual(hydrateBaniCards(results, { answer: 'x', link: null }), []);
});

test('hasil tool yang gagal tidak pernah jadi sumber kartu', () => {
  const results = [{ name: 'list_jadwal_paket', ok: false, data: { rows: [{ jadwal_id: 'JBU1484' }] } }];
  assert.deepEqual(hydrateBaniCards(results, { answer: 'x', package_ids: ['JBU1484'] }), []);
});

// ── kontrak prompt & tool spec ───────────────────────────────────────────────

test('tool spec OpenAI dibangun dari registry bersama (8 tool)', () => {
  const specs = buildBaniToolSpecs();
  assert.equal(specs.length, 8);
  for (const spec of specs) {
    assert.equal(spec.type, 'function');
    assert.ok(spec.function.name);
    assert.ok(spec.function.description);
    assert.equal(spec.function.parameters.type, 'object');
  }
  assert.ok(specs.some((s) => s.function.name === 'list_jamaah'));
});

test('system prompt memuat aturan wajib Bani', () => {
  const prompt = buildBaniSystemPrompt(AGENT);
  assert.match(prompt, /Kamu Bani/);
  assert.match(prompt, /Nikita/);
  assert.match(prompt, /HANYA dari hasil tool/);
  assert.match(prompt, /snapshot/i);
  assert.match(prompt, /"answer"/);
  assert.match(prompt, /package_ids/);
  assert.match(prompt, /jamaah_ids/);
  // Gaya: tanpa sapaan waktu, tanpa kata ber-gender, sapa "Anda".
  assert.match(prompt, /selamat pagi/i);
  assert.match(prompt, /Bapak/);
  assert.match(prompt, /"Anda"/);
  assert.match(prompt, /120 kata/);
});

// ── gate rollout ─────────────────────────────────────────────────────────────

test('gate Bani hanya membuka slug pilot', () => {
  assert.equal(isBaniEnabledForAgent('nikita'), true);
  assert.equal(isBaniEnabledForAgent({ slug: 'NIKITA' }), true);
  assert.equal(isBaniEnabledForAgent({ slug: 'bagas' }), false);
  assert.equal(isBaniEnabledForAgent(''), false);
  assert.equal(isBaniEnabledForAgent(null), false);
  assert.equal(isBaniEnabledForAgent({}), false);
});

test('requireBaniAccess menolak agent non-pilot dengan 403', () => {
  let status = null; let body = null;
  const res = { status(code) { status = code; return this; }, json(payload) { body = payload; return this; } };

  assert.equal(requireBaniAccess({ slug: 'nikita' }, res), true);
  assert.equal(status, null, 'agent pilot tidak boleh menyentuh res');

  assert.equal(requireBaniAccess({ slug: 'agent-lain' }, res), false);
  assert.equal(status, 403);
  assert.deepEqual(body, { error: 'Fitur Bani belum tersedia untuk agent ini' });
});

// ── source contracts ─────────────────────────────────────────────────────────

// Cermin guard tests/bani-tools.test.js: jalur Bani dipakai asisten AI, tidak
// boleh ada jalur tulis ke database sama sekali.
for (const file of ['lib/bani-orchestrator.js', 'lib/bani-access.js']) {
  test(`${file} is strictly read-only against the database`, () => {
    const src = read(file);
    assert.doesNotMatch(src, /\.insert\(/);
    assert.doesNotMatch(src, /\.update\(\{/);
    assert.doesNotMatch(src, /\.upsert\(/);
    assert.doesNotMatch(src, /\.delete\(\)/);
    assert.doesNotMatch(src, /\.rpc\(/);
  });
}

test('orchestrator tidak memanggil jaringan sendiri — callOpenAI wajib diinjeksi', async () => {
  const src = read('lib/bani-orchestrator.js');
  assert.doesNotMatch(src, /fetch\(/);
  assert.doesNotMatch(src, /api\.openai\.com/);
  assert.doesNotMatch(src, /OPENAI_API_KEY/);
  await assert.rejects(
    () => runBaniConversation({ question: 'x', agent: AGENT, supabase: okSupabase() }),
    /callOpenAI wajib diinjeksi/,
  );
});

test('logging Bani mencatat nama parameter saja, tidak pernah nilainya', () => {
  const orchestrator = read('lib/bani-orchestrator.js');
  assert.match(orchestrator, /Object\.keys\(args\)\.join/);
  assert.doesNotMatch(orchestrator, /JSON\.stringify\(args\)/);

  const server = read('server.js');
  assert.doesNotMatch(server, /\[Bani\][^\n]*\$\{question\}/);
  // question_preview dipotong 100 karakter, sama seperti ask_ai_query.
  assert.match(server, /question_preview: question\.substring\(0, 100\)/);
});

test('kegagalan OpenAI dilempar keluar orchestrator supaya endpoint yang memutuskan pesannya', async () => {
  const boom = async () => { throw new Error('OpenAI 500: upstream meledak'); };
  await assert.rejects(
    () => runBaniConversation({ question: 'x', agent: AGENT, supabase: okSupabase(), callOpenAI: boom, model: 'stub' }),
    /upstream meledak/,
  );
  // Timeout fetch (AbortSignal.timeout) juga sampai keluar sebagai throw.
  const timeout = async () => { const e = new Error('The operation was aborted'); e.name = 'TimeoutError'; throw e; };
  await assert.rejects(
    () => runBaniConversation({ question: 'x', agent: AGENT, supabase: okSupabase(), callOpenAI: timeout, model: 'stub' }),
    /aborted/,
  );
});

test('endpoint Bani ter-gate, ter-rate-limit, dan tidak membocorkan error internal', () => {
  const server = read('server.js');
  assert.match(server, /app\.post\('\/api\/bani\/ask', authMiddleware,/);
  assert.match(server, /requireBaniAccess\(agent, res\)/);
  assert.match(server, /BANI_RATE_LIMIT_MAX = 20/);
  assert.match(server, /retryAfterSeconds/);
  // Gagal model/timeout dijawab 200 { success:false } — bukan 5xx, dan tanpa
  // pesan internal (body error OpenAI hanya masuk log server).
  assert.match(server, /return res\.json\(\{ success: false, error: 'Bani lagi tidak bisa menjawab\. Coba lagi sebentar lagi\.' \}\)/);
  assert.doesNotMatch(server, /\[Bani\][\s\S]{0,400}res\.status\(500\)\.json\(\{ error: error\.message/);
  // Param wajib gpt-5.x: max_completion_tokens, tanpa temperature.
  assert.match(server, /max_completion_tokens/);
  assert.doesNotMatch(server, /BANI_MODEL_PARAMS[\s\S]{0,120}temperature/);
  // Tidak ada cache jawaban — data jamaah berubah-ubah.
  assert.doesNotMatch(server, /bani_cache|baniCache/);
});
