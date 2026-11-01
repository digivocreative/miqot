/**
 * Gerbang Akun AIW di browser sungguhan, semua /api ditiru (DB lokal = produksi).
 *
 * Yang dijaga:
 * 1. Agent tanpa Akun AIW: beranda bergembok, tautan langsung dan /:slug berakhir di
 *    form menu Jamaah tanpa memasang halaman terkunci.
 * 2. Hubungkan Akun AIW membuka semuanya tanpa muat ulang; memutuskannya mengunci lagi.
 * 3. Pengunjung tanpa sesi, admin, dan agent dengan Akun AIW tidak terganggu.
 * 4. Status yang gagal dibaca tidak mengunci siapa pun.
 */
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';
import { createServer } from './fixtures/vite-test-server.js';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const AGENT_SLUG = 'nikita';
const TOKEN = 'uji-token';
const USER = {
  id: 'agent-uji', slug: AGENT_SLUG, name: 'Nikita Test', role: 'agent',
  photo: '', website: 'alhijaz.test', phone: '628123456789', email: '',
};

let viteServer;
let browser;
let appOrigin;

function makeSchedules() {
  const pkg = {
    jadwal_id: 'JBU9000', jadwal_nama: 'UMRAH RAHMAH 9HR', promo: '0', seat_total: '45', seat_sisa: '12',
    maskapai: 'SAUDIA', berangkat_tgl: '2027-03-10', berangkat_jam: '10.25', berangkat_rute: 'CGK - JED',
    berangkat_kode_penerbangan: 'SV 827', pulang_tgl: '2027-03-18', pulang_jam: '16.00', pulang_rute: 'JED - CGK',
    pulang_kode_penerbangan: 'SV 818', manasik_tgl: '2027-03-01', manasik_jam: '08:00:00', brosur: '', itinerary: '',
    perlengkapan_harga: '0',
    paket_harga: { RAHMAH: { Quard: '33900000', Triple: '35700000', Double: '38700000', Single: '49900000', Infant: '13900000' } },
    paket_hotel: { RAHMAH: { mekkah: 'ANJUM', madinah: 'AL RITZ AL MADINAH' } },
    journey_order: ['Madinah', 'Umroh'], journey_order_source: 'itinerary',
  };
  return { status: 'ok', iTotalDisplayRecords: 1, aaData: [pkg] };
}

const json = (status, body) => ({ status, contentType: 'application/json', body: JSON.stringify(body) });

/**
 * `seed`: isi user di auth_session (null = pengunjung). `server.me`: apa yang dijawab
 * /api/auth/me — 'ok', angka status, atau 'hang'. `server.has`: status Akun AIW di server.
 */
async function open({
  seed = { ...USER, has_aiw_account: false }, server: serverOptions = {}, dark = false,
  storage = 'localStorage', customDomain = false,
} = {}) {
  const server = { has: false, role: USER.role, me: 'ok', loginStatus: 200, clearOnSync: false, ...serverOptions };
  const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 812 } });
  const page = await context.newPage();
  const calls = { api: [], documents: 0 };
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (request.resourceType() === 'document') calls.documents += 1;
  });

  await page.addInitScript(({ agents, session, darkMode, storageName, viaCustomDomain }) => {
    window.localStorage.setItem('agents_cache', JSON.stringify(agents));
    window.localStorage.setItem('jadwal-availability-hint-v1', '1');
    if (darkMode) window.localStorage.setItem('darkMode', 'true');
    if (viaCustomDomain) window.__AGENT_CONTEXT__ = { slug: 'nikita', viaCustomDomain: true, customDomain: 'contoh.test' };
    if (session && !window.sessionStorage.getItem('__seeded')) {
      window.sessionStorage.setItem('__seeded', '1');
      window[storageName].setItem('auth_session', JSON.stringify(session));
    }
  }, {
    agents: {
      [AGENT_SLUG]: { name: USER.name, website: USER.website, phone: USER.phone, photo: '' },
    },
    session: seed ? { token: TOKEN, user: seed } : null,
    darkMode: dark,
    storageName: storage,
    viaCustomDomain: customDomain,
  });

  await page.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== appOrigin) return route.abort();
    if (!url.pathname.startsWith('/api/')) return route.continue();

    calls.api.push(`${request.method()} ${url.pathname}`);
    if (url.pathname === '/api/auth/me') {
      if (server.me === 'hang') return undefined;
      if (typeof server.me === 'number') return route.fulfill(json(server.me, { error: 'gagal' }));
      return route.fulfill(json(200, { ...USER, role: server.role, has_aiw_account: server.has }));
    }
    if (url.pathname === '/api/telegram/status') {
      return route.fulfill(json(200, { success: true, data: { connected: false, chatId: null, hasCredentials: server.has } }));
    }
    if (url.pathname === '/api/laporan/sync' && server.clearOnSync) {
      server.has = false;
      return route.fulfill(json(200, { success: false, error: 'Akun ditolak', credentialsCleared: true }));
    }
    if (url.pathname === '/api/laporan/status') {
      return route.fulfill(json(200, {
        success: true,
        data: {
          hasCredentials: server.has, isConnected: server.has, username: server.has ? 'SM999' : null,
          kantor: '2', lastSync: null, syncHealth: server.has ? 'pending' : 'no_credentials', syncAgeHours: null,
        },
      }));
    }
    if (url.pathname === '/api/laporan/login') {
      if (server.loginStatus !== 200) {
        return route.fulfill(json(server.loginStatus, { success: false, error: 'Akun AIW ditolak: uji' }));
      }
      server.has = true;
      return route.fulfill(json(200, { success: true, username: 'SM999', kantor: '2' }));
    }
    if (url.pathname === '/api/laporan/credentials' && request.method() === 'DELETE') {
      server.has = false;
      return route.fulfill(json(200, { success: true }));
    }
    if (url.pathname.startsWith('/api/schedules/')) return route.fulfill(json(200, makeSchedules()));
    // Endpoint lain gagal: tiap halaman wajib tahan galat API, sedangkan bentuk data
    // tiruan yang salah justru meruntuhkannya dan menutupi yang sedang diuji.
    return route.fulfill(json(503, { success: false, error: 'tiruan' }));
  });

  return { page, calls, errors, server, close: () => context.close() };
}

const goto = (page, path) => page.goto(`${appOrigin}${path}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
const pathOf = (page) => new URL(page.url()).pathname;
const atJamaahForm = async (page) => {
  await page.waitForURL('**/dashboard/jamaah', { timeout: 20_000 });
  await page.getByRole('heading', { name: 'Hubungkan Akun AIW' }).waitFor({ state: 'visible', timeout: 20_000 });
};
const lockedCard = (page, label) => page.getByRole('button', { name: `${label} terkunci` });
const banner = (page) => page.getByRole('button', { name: 'Hubungkan sekarang' });
const homeReady = (page) => page.getByRole('button', { name: 'Logout' }).waitFor({ state: 'visible', timeout: 20_000 });
const kurs = (page) => page.getByText('Kurs Hari Ini');

async function login(page) {
  await page.getByPlaceholder('SM12345').fill('SM999');
  await page.getByPlaceholder('Kata Sandi').fill('sandi-uji');
  await page.getByRole('button', { name: 'Hubungkan', exact: true }).click();
}

describe('Gerbang Akun AIW', { concurrency: false }, () => {
  before(async () => {
    viteServer = await createServer({
      root: projectRoot,
      logLevel: 'silent',
      server: { host: '127.0.0.1', port: 0, strictPort: true },
    });
    await viteServer.listen();
    appOrigin = `http://127.0.0.1:${viteServer.httpServer.address().port}`;
    browser = await chromium.launch({ headless: true });
  }, { timeout: 60_000 });

  after(async () => {
    await browser?.close();
    await viteServer?.close();
  });

  const scenario = (name, options, run) => test(name, { timeout: 90_000 }, async () => {
    const app = await open(options);
    try {
      await run(app);
      assert.deepEqual(app.errors, [], 'halaman tidak boleh melempar galat');
    } finally {
      await app.close();
    }
  });

  scenario('beranda: kartu bergembok, banner tampil, widget dan banner Telegram hilang', {}, async ({ page, calls }) => {
    await goto(page, '/dashboard');
    await homeReady(page);
    await banner(page).waitFor({ state: 'visible' });
    for (const label of ['Teras', 'Jadwal', 'Statistik', 'Brosur', 'Tools', 'Hotel', 'Calon Haji 2027']) {
      await lockedCard(page, label).waitFor({ state: 'visible' });
    }
    for (const label of ['Jamaah', 'Settings']) {
      assert.equal(await lockedCard(page, label).count(), 0, `${label} tidak boleh terkunci`);
      await page.getByRole('button', { name: label, exact: true }).last().waitFor({ state: 'visible' });
    }
    await page.waitForTimeout(500);
    assert.equal(await kurs(page).count(), 0, 'widget Kurs disembunyikan');
    assert.equal(await page.getByText('Status Penerbangan').count(), 0, 'widget Penerbangan disembunyikan');
    assert.equal(calls.api.filter((c) => c.includes('/community/')).length, 0, 'data Teras tidak dimuat');
  });

  scenario('kartu terkunci membuka dialog; Batal menutup tanpa pindah halaman', {}, async ({ page }) => {
    await goto(page, '/dashboard');
    await homeReady(page);
    await lockedCard(page, 'Brosur').click();
    const dialog = page.getByRole('dialog');
    await dialog.getByText('Menu Brosur masih terkunci').waitFor({ state: 'visible' });
    await dialog.getByText('Hubungkan akun AIW kantor untuk membukanya.').waitFor({ state: 'visible' });
    await dialog.getByRole('img', { name: 'Halaman login kantor Alhijaz Indowisata' }).waitFor({ state: 'visible' });
    await page.waitForFunction(() => {
      const element = document.querySelector('[role="dialog"] img');
      return element?.complete && element.naturalWidth > 0;
    }, undefined, { timeout: 10_000 });
    assert.equal(await dialog.getByText('Hubungkan Akun AIW', { exact: true }).count(), 0, 'judul tidak mengulang subjudul');
    await dialog.getByRole('button', { name: 'Batal' }).click();
    await dialog.waitFor({ state: 'detached' });
    assert.equal(pathOf(page), '/dashboard');
  });

  scenario('kartu Jadwal tidak keluar ke /:slug, dialog Login menuju form Jamaah', {}, async ({ page, calls }) => {
    await goto(page, '/dashboard');
    await homeReady(page);
    await lockedCard(page, 'Jadwal').click();
    const dialog = page.getByRole('dialog');
    await dialog.getByText('Menu Jadwal masih terkunci').waitFor({ state: 'visible' });
    assert.equal(calls.documents, 1, 'tidak ada navigasi dokumen');
    await dialog.getByRole('button', { name: 'Hubungkan', exact: true }).click();
    await atJamaahForm(page);
    assert.equal(await page.getByRole('dialog').count(), 0);
  });

  scenario('tombol back menutup dialog dan tetap di beranda', {}, async ({ page }) => {
    await goto(page, '/dashboard');
    await homeReady(page);
    await lockedCard(page, 'Statistik').click();
    await page.getByRole('dialog').waitFor({ state: 'visible' });
    await page.waitForFunction(() => window.history.state && '__overlay' in window.history.state);
    await page.goBack({ waitUntil: 'commit' });
    await page.getByRole('dialog').waitFor({ state: 'detached' });
    assert.equal(pathOf(page), '/dashboard');
    await homeReady(page);
  });

  scenario('Escape dan klik latar menutup dialog', {}, async ({ page }) => {
    await goto(page, '/dashboard');
    await homeReady(page);
    await lockedCard(page, 'Tools').click();
    await page.getByRole('dialog').waitFor({ state: 'visible' });
    await page.keyboard.press('Escape');
    await page.getByRole('dialog').waitFor({ state: 'detached' });
    await lockedCard(page, 'Tools').click();
    await page.getByRole('dialog').waitFor({ state: 'visible' });
    await page.mouse.click(10, 10);
    await page.getByRole('dialog').waitFor({ state: 'detached' });
  });

  scenario('dialog muat di layar pendek dan tombolnya bisa dijangkau', {}, async ({ page }) => {
    await page.setViewportSize({ width: 667, height: 320 });
    await goto(page, '/dashboard');
    await homeReady(page);
    await lockedCard(page, 'Brosur').click();
    const dialog = page.getByRole('dialog');
    await dialog.waitFor({ state: 'visible' });
    const box = await dialog.boundingBox();
    assert.ok(box.y >= 0 && box.y + box.height <= 320, `dialog tidak boleh keluar layar (${box.y}, ${box.height})`);
    await dialog.getByRole('button', { name: 'Hubungkan', exact: true }).click();
    await atJamaahForm(page);
  });

  scenario('banner menuju form Jamaah', {}, async ({ page }) => {
    await goto(page, '/dashboard');
    await homeReady(page);
    await banner(page).click();
    await atJamaahForm(page);
  });

  for (const path of [
    '/dashboard/brosur', '/dashboard/statistik', '/dashboard/ai-tools', '/dashboard/ai-tools/landing-page',
    '/dashboard/ai-tools/kalkulasi', '/dashboard/ai-tools/hotel', '/dashboard/hotel', '/dashboard/calon-haji-2027', '/dashboard/teras',
    '/dashboard/teras/post/abc', '/teras/nikita', '/dashboard/agents',
  ]) {
    scenario(`tautan langsung ${path} berakhir di form Jamaah`, {}, async ({ page, calls }) => {
      await goto(page, path);
      await atJamaahForm(page);
      assert.equal(calls.documents, 1, 'pengalihan tanpa memuat ulang dokumen');
      assert.equal(calls.api.filter((c) => /community|hotels|calon-haji/.test(c)).length, 0, 'halaman terkunci tidak terpasang');
    });
  }

  for (const path of [`/${AGENT_SLUG}`, `/${AGENT_SLUG}/kalkulasi`, '/compare', `/${AGENT_SLUG}/compare`, `/${AGENT_SLUG}/JBU9000`]) {
    scenario(`${path} mengalihkan agent ke form Jamaah`, {}, async ({ page, calls }) => {
      await goto(page, path);
      await atJamaahForm(page);
      assert.equal(calls.documents, 2, 'tepat satu pengalihan, tanpa putaran');
      await page.waitForTimeout(800);
      assert.equal(pathOf(page), '/dashboard/jamaah');
    });
  }

  for (const path of [`/${AGENT_SLUG}/bio`, `/${AGENT_SLUG}/JBU9000/itinerary`, `/${AGENT_SLUG}/hotel/hilton`, '/top-partner']) {
    scenario(`${path} tetap terbuka bagi agent tanpa Akun AIW`, {}, async ({ page }) => {
      await goto(page, path);
      await page.waitForTimeout(1500);
      assert.equal(pathOf(page), path);
    });
  }

  scenario('Settings dan sub-halaman Jamaah tetap terbuka', {}, async ({ page }) => {
    await goto(page, '/dashboard/settings/telegram');
    await page.waitForTimeout(1500);
    assert.equal(pathOf(page), '/dashboard/settings/telegram');
    await goto(page, '/dashboard/jamaah/haji');
    await page.waitForTimeout(1500);
    assert.equal(pathOf(page), '/dashboard/jamaah/haji');
  });

  scenario('login berhasil membuka semua menu tanpa muat ulang, lalu /:slug terbuka', {}, async ({ page, calls }) => {
    await goto(page, '/dashboard/jamaah');
    await atJamaahForm(page);
    await login(page);
    await page.getByRole('heading', { name: 'Hubungkan Akun AIW' }).waitFor({ state: 'detached', timeout: 20_000 });
    assert.equal(pathOf(page), '/dashboard/jamaah', 'agent tetap di Jamaah');
    await page.getByRole('button', { name: 'Kembali ke dashboard' }).click();
    await homeReady(page);
    await kurs(page).waitFor({ state: 'visible' });
    assert.equal(await banner(page).count(), 0, 'banner hilang');
    assert.equal(await lockedCard(page, 'Brosur').count(), 0, 'gembok hilang');
    assert.equal(calls.documents, 1, 'tanpa muat ulang');

    const stored = await page.evaluate(() => JSON.parse(window.localStorage.getItem('auth_session')));
    assert.equal(stored.user.has_aiw_account, true, 'status tersimpan di sesi');

    await goto(page, `/${AGENT_SLUG}`);
    await page.locator('[data-jadwal-id]').first().waitFor({ state: 'visible', timeout: 20_000 });
  });

  scenario('login ditolak: pesan tampil dan menu tetap terkunci', { server: { loginStatus: 401 } }, async ({ page }) => {
    await goto(page, '/dashboard/jamaah');
    await atJamaahForm(page);
    await login(page);
    await page.getByText('Akun AIW ditolak: uji').waitFor({ state: 'visible', timeout: 20_000 });
    const stored = await page.evaluate(() => JSON.parse(window.localStorage.getItem('auth_session')));
    assert.equal(stored.user.has_aiw_account, false);
  });

  scenario('Akun AIW yang tersambung dari perangkat lain terbaca saat beranda dibuka', {
    server: { has: true },
  }, async ({ page }) => {
    await goto(page, '/dashboard');
    await homeReady(page);
    await kurs(page).waitFor({ state: 'visible' });
    assert.equal(await banner(page).count(), 0);
  });

  scenario('memutuskan Akun AIW dari Settings mengunci menu lagi', {
    seed: { ...USER, has_aiw_account: true }, server: { has: true },
  }, async ({ page }) => {
    await goto(page, '/dashboard/settings/profil');
    await page.getByRole('button', { name: 'Putuskan', exact: true }).click();
    await page.getByText('Disconnect Account?').waitFor({ state: 'visible' });
    await page.getByRole('button', { name: 'Disconnect', exact: true }).click();
    await page.waitForFunction(() => {
      const session = JSON.parse(window.localStorage.getItem('auth_session'));
      return session.user.has_aiw_account === false;
    }, undefined, { timeout: 10_000 });
    await goto(page, '/dashboard/brosur');
    await atJamaahForm(page);
  });

  scenario('memutuskan dari Settings sesudah membuka Jamaah tetap berakhir di form login', {
    seed: { ...USER, has_aiw_account: true }, server: { has: true },
  }, async ({ page, calls }) => {
    await goto(page, '/dashboard');
    await homeReady(page);
    await page.getByRole('button', { name: 'Jamaah', exact: true }).click();
    await page.waitForURL('**/dashboard/jamaah');
    await page.waitForFunction(() => !document.body.innerText.includes('Hubungkan Akun AIW'));
    await page.waitForTimeout(800);
    await page.getByRole('button', { name: 'Kembali ke dashboard' }).click();
    await homeReady(page);
    await page.getByRole('button', { name: 'Settings', exact: true }).last().click();
    await page.getByRole('button', { name: 'Putuskan', exact: true }).click();
    await page.getByRole('button', { name: 'Disconnect', exact: true }).click();
    await page.getByRole('button', { name: 'Kembali ke dashboard' }).click();
    await homeReady(page);
    await banner(page).click();
    await atJamaahForm(page);
    assert.equal(calls.documents, 1, 'tanpa muat ulang');
  });

  scenario('admin tanpa Akun AIW tidak dikunci', {
    seed: { ...USER, role: 'admin', has_aiw_account: false }, server: { role: 'admin' },
  }, async ({ page }) => {
    await goto(page, '/dashboard');
    await homeReady(page);
    await kurs(page).waitFor({ state: 'visible' });
    assert.equal(await banner(page).count(), 0);
    await goto(page, `/${AGENT_SLUG}`);
    await page.locator('[data-jadwal-id]').first().waitFor({ state: 'visible', timeout: 20_000 });
  });

  scenario('agent dengan Akun AIW tidak dikunci dan /:slug tampil tanpa menunggu', {
    seed: { ...USER, has_aiw_account: true }, server: { has: true, me: 'hang' },
  }, async ({ page }) => {
    await goto(page, `/${AGENT_SLUG}`);
    await page.locator('[data-jadwal-id]').first().waitFor({ state: 'visible', timeout: 20_000 });
  });

  scenario('pengunjung tanpa sesi: jadwal, Kalkulasi, dan Compare tetap terbuka', { seed: null }, async ({ page, calls }) => {
    await goto(page, `/${AGENT_SLUG}`);
    await page.locator('[data-jadwal-id]').first().waitFor({ state: 'visible', timeout: 20_000 });
    assert.equal(calls.api.filter((c) => c.includes('/api/auth/me')).length, 0, 'pengunjung tidak mengecek status');
    await goto(page, `/${AGENT_SLUG}/kalkulasi`);
    await page.waitForTimeout(1000);
    assert.equal(pathOf(page), `/${AGENT_SLUG}/kalkulasi`);
    await goto(page, '/compare');
    await page.waitForTimeout(1000);
    assert.equal(pathOf(page), '/compare');
  });

  scenario('sesi lama tanpa status: /me false mengalihkan', { seed: { ...USER } }, async ({ page }) => {
    await goto(page, `/${AGENT_SLUG}`);
    await atJamaahForm(page);
  });

  scenario('sesi lama tanpa status: /me true membuka jadwal dan menyimpan status', {
    seed: { ...USER }, server: { has: true },
  }, async ({ page }) => {
    await goto(page, `/${AGENT_SLUG}`);
    await page.locator('[data-jadwal-id]').first().waitFor({ state: 'visible', timeout: 20_000 });
    const stored = await page.evaluate(() => JSON.parse(window.localStorage.getItem('auth_session')));
    assert.equal(stored.user.has_aiw_account, true);
  });

  for (const me of [500, 503, 404, 'hang']) {
    scenario(`/me ${me} tidak mengunci halaman /:slug`, { server: { me } }, async ({ page }) => {
      await goto(page, `/${AGENT_SLUG}`);
      await page.locator('[data-jadwal-id]').first().waitFor({ state: 'visible', timeout: 20_000 });
    });
  }

  scenario('/me 401 di /:slug memperlakukan token basi sebagai pengunjung', { server: { me: 401 } }, async ({ page }) => {
    await goto(page, `/${AGENT_SLUG}`);
    await page.locator('[data-jadwal-id]').first().waitFor({ state: 'visible', timeout: 20_000 });
  });

  scenario('/me 500 di dashboard tidak mengunci walau status tersimpan false', { server: { me: 500 } }, async ({ page }) => {
    await goto(page, '/dashboard');
    await homeReady(page);
    await kurs(page).waitFor({ state: 'visible' });
    assert.equal(await banner(page).count(), 0);
  });

  const BENEFITS = [
    'Semua menu terbuka, dari Jadwal sampai Tools',
    'Data jamaah umroh dan haji tersinkron otomatis',
    'Statistik dan komisi terhitung otomatis',
    'Notifikasi jamaah baru dan pembayaran di Telegram',
  ];
  const HELP_TEXT = 'Pakai akun yang sama dengan login kantor Alhijaz Indowisata (Kantor Cabang).';

  async function assertFormGuide(page, subtitle) {
    await page.getByRole('heading', { name: 'Hubungkan Akun AIW' }).waitFor({ state: 'visible', timeout: 20_000 });
    await page.getByText(subtitle, { exact: true }).waitFor({ state: 'visible' });
    await page.getByText('Apa manfaat menghubungkan akun?').waitFor({ state: 'visible' });
    for (const benefit of BENEFITS) await page.getByText(benefit).waitFor({ state: 'visible' });
    assert.equal(await page.getByText(HELP_TEXT).count(), 0, 'penjelasan tertutup saat form dibuka');
    assert.equal(await page.getByText('AIW Agent Login').count(), 0, 'judul lama tidak tersisa');
  }

  scenario('form Jamaah: subjudul baru, manfaat tampil, penjelasan terbuka saat diklik', {}, async ({ page, calls }) => {
    await goto(page, '/dashboard/jamaah');
    await assertFormGuide(page, 'Dapatkan manfaat maksimal penggunaan Alhijaz.co');
    assert.equal(await page.getByText('Login untuk sinkronisasi data jamaah.').count(), 0);

    const toggle = page.getByRole('button', { name: 'Akun yang mana?' });
    assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
    await toggle.click();
    await page.getByText(HELP_TEXT).waitFor({ state: 'visible' });
    assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
    const image = page.getByRole('img', { name: 'Halaman login kantor Alhijaz Indowisata' });
    await image.waitFor({ state: 'visible' });
    await page.waitForFunction(() => {
      const element = document.querySelector('img[alt="Halaman login kantor Alhijaz Indowisata"]');
      return element?.complete && element.naturalWidth > 0;
    }, undefined, { timeout: 10_000 });
    assert.equal(calls.api.filter((c) => c.includes('/api/laporan/login')).length, 0, 'tautan tidak mengirim form');

    await toggle.click();
    await page.getByText(HELP_TEXT).waitFor({ state: 'detached' });
  });

  /** Klik tautan lalu rekam tinggi panel, margin, dan posisi kotak manfaat tiap frame. */
  const toggleAndSample = (page) => page.evaluate(async () => {
    const toggle = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Akun yang mana?'));
    const samples = [];
    toggle.click();
    const start = performance.now();
    while (performance.now() - start < 600) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const panel = document.querySelector('[data-aiw-help]');
      samples.push({
        height: panel ? panel.getBoundingClientRect().height : 0,
        margin: panel ? parseFloat(getComputedStyle(panel).marginTop) : 0,
      });
    }
    return samples;
  });

  scenario('penjelasan membuka dan menutup dengan animasi tinggi', {}, async ({ page }) => {
    await goto(page, '/dashboard/jamaah');
    await atJamaahForm(page);
    const benefitsTop = () => page.getByText('Apa manfaat menghubungkan akun?').evaluate((el) => el.getBoundingClientRect().top);
    const closedTop = await benefitsTop();

    const opening = await toggleAndSample(page);
    const openHeight = opening.at(-1).height;
    assert.ok(openHeight > 100, `panel harus terbuka penuh (${openHeight}px)`);
    assert.ok(opening.some((s) => s.height > 0 && s.height < openHeight - 4), 'tinggi harus bergerak, bukan melompat');
    assert.ok(opening[0].margin < 16, `jarak atas ikut beranimasi (${opening[0].margin}px)`);
    assert.equal(opening.at(-1).margin, 16, 'jarak akhir sama dengan elemen form lain');

    const closing = await toggleAndSample(page);
    assert.ok(closing.some((s) => s.height > 0 && s.height < openHeight - 4), 'menutup juga beranimasi');
    assert.equal(closing.at(-1).height, 0, 'panel hilang setelah animasi');
    assert.equal(await page.locator('[data-aiw-help]').count(), 0);
    assert.equal(await benefitsTop(), closedTop, 'kotak manfaat kembali ke posisi semula');
  });

  scenario('ketukan cepat pada tautan berakhir di keadaan yang benar', {}, async ({ page }) => {
    await goto(page, '/dashboard/jamaah');
    await atJamaahForm(page);
    const toggle = page.getByRole('button', { name: 'Akun yang mana?' });
    await toggle.dblclick();
    await page.waitForTimeout(500);
    assert.equal(await page.locator('[data-aiw-help]').count(), 0, 'dua ketukan = tertutup');
    assert.equal(await toggle.getAttribute('aria-expanded'), 'false');

    await page.evaluate(() => {
      const button = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Akun yang mana?'));
      button.click();
      button.click();
      button.click();
    });
    await page.waitForTimeout(500);
    assert.equal(await toggle.getAttribute('aria-expanded'), 'true', 'tiga ketukan = terbuka');
    assert.ok(await page.locator('[data-aiw-help]').evaluate((el) => el.getBoundingClientRect().height) > 100);
  });

  scenario('pengguna yang mematikan animasi langsung melihat panel penuh', {}, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await goto(page, '/dashboard/jamaah');
    await atJamaahForm(page);
    const opening = await toggleAndSample(page);
    assert.ok(opening[1].height > 100, `tanpa transisi (${opening[1].height}px)`);
  });

  scenario('form Haji memakai subjudul dan panduan yang sama', {}, async ({ page }) => {
    await goto(page, '/dashboard/jamaah/haji');
    await assertFormGuide(page, 'Dapatkan manfaat maksimal penggunaan Alhijaz.co');
  });

  scenario('form CAPI tetap dengan subjudulnya dan mendapat panduan', {}, async ({ page }) => {
    await goto(page, '/dashboard/settings/capi');
    await assertFormGuide(page, 'Hubungkan akun untuk mengatur Meta CAPI.');
  });

  scenario('form Telegram tetap dengan subjudulnya dan mendapat panduan', {}, async ({ page }) => {
    await goto(page, '/dashboard/settings/telegram');
    await assertFormGuide(page, 'Hubungkan akun untuk mengaktifkan notifikasi Telegram.');
  });

  scenario('Enter di kolom password tetap mengirim form', {}, async ({ page, calls }) => {
    await goto(page, '/dashboard/jamaah');
    await atJamaahForm(page);
    await page.getByPlaceholder('SM12345').fill('SM999');
    await page.getByPlaceholder('Kata Sandi').fill('sandi-uji');
    await page.getByPlaceholder('Kata Sandi').press('Enter');
    await page.getByRole('heading', { name: 'Hubungkan Akun AIW' }).waitFor({ state: 'detached', timeout: 20_000 });
    assert.equal(calls.api.filter((c) => c.includes('/api/laporan/login')).length, 1);
  });

  scenario('login dari form CAPI di Settings membuka menu', {}, async ({ page, calls }) => {
    await goto(page, '/dashboard/settings/capi');
    await page.getByRole('heading', { name: 'Hubungkan Akun AIW' }).waitFor({ state: 'visible', timeout: 20_000 });
    await login(page);
    await page.getByRole('heading', { name: 'Hubungkan Akun AIW' }).waitFor({ state: 'detached', timeout: 20_000 });
    await page.getByRole('button', { name: 'Kembali ke dashboard' }).click();
    await homeReady(page);
    await kurs(page).waitFor({ state: 'visible' });
    assert.equal(calls.documents, 1);
  });

  scenario('login dari form Telegram di Settings membuka menu', {}, async ({ page, calls }) => {
    await goto(page, '/dashboard/settings/telegram');
    await page.getByRole('heading', { name: 'Hubungkan Akun AIW' }).waitFor({ state: 'visible', timeout: 20_000 });
    await login(page);
    await page.getByRole('heading', { name: 'Hubungkan Akun AIW' }).waitFor({ state: 'detached', timeout: 20_000 });
    await page.getByRole('button', { name: 'Kembali ke dashboard' }).click();
    await homeReady(page);
    await kurs(page).waitFor({ state: 'visible' });
    assert.equal(calls.documents, 1);
  });

  scenario('kredensial dicabut server saat sinkron pertama mengunci lagi', { server: { clearOnSync: true } }, async ({ page }) => {
    await goto(page, '/dashboard/jamaah');
    await atJamaahForm(page);
    await login(page);
    await page.waitForFunction(() => {
      const session = JSON.parse(window.localStorage.getItem('auth_session'));
      return session.user.has_aiw_account === false;
    }, undefined, { timeout: 10_000 });
    await page.getByRole('heading', { name: 'Hubungkan Akun AIW' }).waitFor({ state: 'visible', timeout: 20_000 });
  });

  scenario('tombol back ke tab terkunci sesudah diputuskan kembali ke form Jamaah', {
    seed: { ...USER, has_aiw_account: true }, server: { has: true },
  }, async ({ page, server }) => {
    await goto(page, '/dashboard');
    await homeReady(page);
    await page.getByRole('button', { name: 'Brosur', exact: true }).click();
    await page.waitForURL('**/dashboard/brosur');
    await page.evaluate(() => {
      window.history.pushState({}, '', '/dashboard/settings');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    server.has = false;
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('aiw-account-change', { detail: false }));
    });
    await page.goBack({ waitUntil: 'commit' });
    await atJamaahForm(page);
  });

  scenario('sesi di sessionStorage ikut diperbarui saat Akun AIW tersambung', {
    storage: 'sessionStorage',
  }, async ({ page }) => {
    await goto(page, '/dashboard/jamaah');
    await atJamaahForm(page);
    await login(page);
    await page.waitForFunction(() => {
      const session = JSON.parse(window.sessionStorage.getItem('auth_session'));
      return session.user.has_aiw_account === true;
    }, undefined, { timeout: 10_000 });
    assert.equal(await page.evaluate(() => window.localStorage.getItem('auth_session')), null);
  });

  scenario('dua ketukan cepat pada Login hanya menambah satu halaman', {}, async ({ page }) => {
    await goto(page, '/dashboard');
    await homeReady(page);
    await lockedCard(page, 'Brosur').click();
    const button = page.getByRole('dialog').getByRole('button', { name: 'Hubungkan', exact: true });
    await button.dblclick();
    await atJamaahForm(page);
    await page.waitForTimeout(400);
    const depth = await page.evaluate(() => window.history.length);
    await page.goBack({ waitUntil: 'commit' });
    await homeReady(page);
    assert.equal(pathOf(page), '/dashboard');
    assert.ok(depth >= 2);
  });

  scenario('keluar akun dari beranda terkunci menuju halaman login', {}, async ({ page }) => {
    await goto(page, '/dashboard');
    await homeReady(page);
    await page.getByRole('button', { name: 'Logout' }).click();
    await page.waitForURL('**/login', { timeout: 20_000 });
    assert.equal(await page.evaluate(() => window.localStorage.getItem('auth_session')), null);
  });

  scenario('custom domain tidak memakai gerbang', { customDomain: true }, async ({ page, calls }) => {
    await goto(page, '/kalkulasi');
    await page.waitForTimeout(1200);
    assert.equal(pathOf(page), '/kalkulasi');
    assert.equal(calls.api.filter((c) => c.includes('/api/auth/me')).length, 0);
  });

  scenario('mode gelap tetap menampilkan kartu terkunci', { dark: true }, async ({ page }) => {
    await goto(page, '/dashboard');
    await homeReady(page);
    await lockedCard(page, 'Brosur').waitFor({ state: 'visible' });
    await banner(page).waitFor({ state: 'visible' });
  });

  scenario('muat ulang di beranda tetap terkunci tanpa putaran', {}, async ({ page, calls }) => {
    await goto(page, '/dashboard');
    await homeReady(page);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await homeReady(page);
    await lockedCard(page, 'Brosur').waitFor({ state: 'visible' });
    assert.equal(calls.documents, 2);
  });
});
