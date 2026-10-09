/**
 * Audit profil bot Telegram dari isian penyusup (token bocor).
 *
 * BotFather hanya mengubah About/Description versi default. Penyusup yang
 * memegang token bisa menyetel versi per-bahasa (mis. `en`) yang menang atas
 * default untuk user berbahasa itu, plus daftar command per scope/bahasa.
 * Rotasi token TIDAK menghapus isian itu — wajib dibersihkan lewat API.
 *
 *   node scripts/audit-telegram-bot.mjs                                   # bot utama, baca saja
 *   node scripts/audit-telegram-bot.mjs --var=TELEGRAM_DEPLOY_BOT_TOKEN   # bot deploy
 *   node scripts/audit-telegram-bot.mjs --apply                           # hapus isian asing
 *
 * --apply mengosongkan semua About/Description/nama per-bahasa dan menghapus
 * semua daftar command kecuali command resmi bot utama (default scope + bahasa).
 */
import 'dotenv/config';
import { TELEGRAM_BOT_COMMANDS } from '../lib/telegram-bot-config.js';

const MAIN_BOT_VAR = 'TELEGRAM_BOT_TOKEN';
const varName = process.argv.find((a) => a.startsWith('--var='))?.slice(6) || MAIN_BOT_VAR;
const apply = process.argv.includes('--apply');
const BOT_TOKEN = String(process.env[varName] || '').trim();

if (!BOT_TOKEN) {
  console.error(`❌ ${varName} not set in .env`);
  process.exit(1);
}

// ISO 639-1 — Telegram menerima language_code dua huruf.
const LANGS = 'aa ab ae af ak am an ar as av ay az ba be bg bh bi bm bn bo br bs ca ce ch co cr cs cu cv cy da de dv dz ee el en eo es et eu fa ff fi fj fo fr fy ga gd gl gn gu gv ha he hi ho hr ht hu hy hz ia id ie ig ii ik io is it iu ja jv ka kg ki kj kk kl km kn ko kr ks ku kv kw ky la lb lg li ln lo lt lu lv mg mh mi mk ml mn mr ms mt my na nb nd ne ng nl nn no nr nv ny oc oj om or os pa pi pl ps pt qu rm rn ro ru rw sa sc sd se sg si sk sl sm sn so sq sr ss st su sv sw ta te tg th ti tk tl tn to tr ts tt tw ty ug uk ur uz ve vi vo wa wo xh yi yo za zh zu'.split(' ');
const COMMAND_SCOPES = ['default', 'all_private_chats', 'all_group_chats', 'all_chat_administrators'];
const BATCH = 4; // serentak kecil: lonjakan request bikin DNS lokal gagal (ENOTFOUND)

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function telegramApi(method, body = {}) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!data.ok) throw Object.assign(new Error(`${method} gagal: ${data.description}`), { fatal: true });
      return data.result;
    } catch (err) {
      if (err.fatal || attempt >= 5) throw err;
      await sleep(1000 * attempt);
    }
  }
}

async function inBatches(items, fn) {
  const out = [];
  for (let i = 0; i < items.length; i += BATCH) {
    out.push(...await Promise.all(items.slice(i, i + BATCH).map(fn)));
  }
  return out;
}

const sameCommands = (a, b) => JSON.stringify(a) === JSON.stringify(b);

async function audit() {
  const bot = await telegramApi('getMe');
  const isMainBot = varName === MAIN_BOT_VAR;
  console.log(`Bot: @${bot.username} (${varName})`);

  const [name, about, description, webhook] = await Promise.all([
    telegramApi('getMyName'),
    telegramApi('getMyShortDescription'),
    telegramApi('getMyDescription'),
    telegramApi('getWebhookInfo'),
  ]);
  console.log(`Default: name=${JSON.stringify(name.name)} about=${JSON.stringify(about.short_description)} description=${JSON.stringify(description.description)}`);
  console.log(`Webhook: ${webhook.url || '(tidak ada)'}${webhook.last_error_message ? ` — error terakhir: ${webhook.last_error_message}` : ''}`);

  const profileOverrides = (await inBatches(LANGS, async (lc) => {
    const [n, s, d] = await Promise.all([
      telegramApi('getMyName', { language_code: lc }),
      telegramApi('getMyShortDescription', { language_code: lc }),
      telegramApi('getMyDescription', { language_code: lc }),
    ]);
    return { lc, name: n.name, about: s.short_description, description: d.description };
  })).filter((o) => o.name || o.about || o.description);

  const commandJobs = COMMAND_SCOPES.flatMap((scope) => ['', ...LANGS].map((lc) => ({ scope, lc })));
  const commandSets = (await inBatches(commandJobs, async ({ scope, lc }) => {
    const body = { scope: { type: scope }, ...(lc ? { language_code: lc } : {}) };
    return { scope, lc, body, commands: await telegramApi('getMyCommands', body) };
  })).filter((c) => c.commands.length);
  const isOfficial = (c) => isMainBot && c.scope === 'default' && !c.lc
    && sameCommands(c.commands, TELEGRAM_BOT_COMMANDS);
  const foreignCommands = commandSets.filter((c) => !isOfficial(c));

  console.log(`\nProfil per-bahasa (${LANGS.length} bahasa): ${profileOverrides.length} isian`);
  for (const o of profileOverrides) {
    console.log(`  ⚠️  [${o.lc}] name=${JSON.stringify(o.name)} about=${JSON.stringify(o.about)} description=${JSON.stringify(o.description)}`);
  }
  console.log(`Command (${commandJobs.length} scope×bahasa): ${commandSets.length} daftar, ${foreignCommands.length} asing`);
  for (const c of commandSets) {
    console.log(`  ${isOfficial(c) ? '✅' : '⚠️ '} [${c.scope}/${c.lc || 'default'}] ${JSON.stringify(c.commands)}`);
  }

  if (!profileOverrides.length && !foreignCommands.length) {
    console.log('\n✅ Bersih');
    return;
  }
  if (!apply) {
    console.log('\nJalankan ulang dengan --apply untuk menghapus isian ⚠️');
    process.exitCode = 2;
    return;
  }

  console.log('\nMenghapus…');
  for (const o of profileOverrides) {
    const body = { language_code: o.lc };
    if (o.name) await telegramApi('setMyName', { ...body, name: '' });
    if (o.about) await telegramApi('setMyShortDescription', { ...body, short_description: '' });
    if (o.description) await telegramApi('setMyDescription', { ...body, description: '' });
    console.log(`  ✅ profil [${o.lc}] dikosongkan`);
  }
  for (const c of foreignCommands) {
    await telegramApi('deleteMyCommands', c.body);
    console.log(`  ✅ command [${c.scope}/${c.lc || 'default'}] dihapus`);
  }
  // Bot utama wajib tetap punya /start resmi untuk fitur Hubungkan Telegram.
  if (isMainBot && !commandSets.some(isOfficial)) {
    await telegramApi('setMyCommands', { commands: TELEGRAM_BOT_COMMANDS });
    console.log('  ✅ command resmi bot utama dipasang ulang');
  }
  console.log('\nJalankan ulang tanpa --apply untuk verifikasi.');
}

audit().catch((err) => {
  console.error(`❌ Audit Telegram gagal: ${err.message}`);
  process.exitCode = 1;
});
