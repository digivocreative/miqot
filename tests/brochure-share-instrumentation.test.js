/**
 * Penjaga instrumentasi share brosur.
 *
 * Dulu file ini membaca teks sumber BrochurePromptModal.tsx dan mencari literal
 * `trackEvent('feature', 'brochure_prompt_share_payload'`. Tipe event-nya sudah
 * lama berubah jadi 'action', jadi DUA dari tiga tes di sini merah di pohon
 * bersih tanpa satu pun perilaku berubah — dan invarian sesungguhnya ("bukti
 * payload tetap ada walau share dibatalkan") tidak pernah benar-benar diuji:
 * urutan dua indexOf di dalam berkas tidak membuktikan apa yang terjadi saat
 * pengguna menekan Batal.
 *
 * Sekarang modalnya dirender sungguhan di chromium, share sheet-nya dibuat
 * gagal/batal, lalu event yang BENAR-BENAR terkirim yang diperiksa.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  HARNESS_APP_VERSION,
  SCHEDULE_TITLE_SENTINEL,
  readCalls,
  readTrackedEvents,
  schedulePromptProps,
  waitForShareButtonReady,
  withPromptModal,
} from './fixtures/brochure-prompt-modal-render.js';

const PROPS = schedulePromptProps();

/**
 * Server membuang event yang tidak terdaftar di peta labelnya, senyap. Peta itu
 * jadi otoritas: yang dibaca di sini bukan ejaan kode klien, tapi apakah pasangan
 * (eventType, eventName) yang benar-benar dikirim modal memang diterima server.
 *
 * Persis inilah yang dulu dijaga penjaga basi dengan memaku literal 'feature' —
 * tipe event-nya sudah lama pindah ke 'action' dan tesnya tidak pernah ikut.
 */
function labelRegistry(constName) {
  const source = readFileSync(new URL('../server.js', import.meta.url), 'utf8');
  const start = source.indexOf(`const ${constName} = {`);
  assert.ok(start > -1, `${constName} tidak lagi ada di server.js — perbarui penjaganya, jangan hapus`);
  const end = source.indexOf('\n};', start);
  assert.ok(end > start, `blok ${constName} tidak berujung '};' — parser penjaga ini perlu diperbarui`);
  const block = source.slice(start, end).replace(/\/\/[^\n]*/g, '');
  const keys = [...block.matchAll(/[{,]\s*([a-z0-9_]+)\s*:/g)].map((m) => m[1]);
  assert.ok(keys.length > 5, `hanya ${keys.length} kunci terbaca dari ${constName}; parsernya rusak`);
  return new Set(keys);
}

const REGISTRIES = { feature: 'FEATURE_LABELS', action: 'ACTION_LABELS' };

/** Tiap event yang dikirim modal harus terdaftar di peta label yang sesuai. */
function assertEventsRegistered(events) {
  assert.ok(events.length > 0, 'tidak ada event sama sekali — asersi pendaftaran jadi hampa');
  for (const { eventType, eventName } of events) {
    const constName = REGISTRIES[eventType];
    assert.ok(constName, `eventType '${eventType}' tidak dikenal server untuk ${eventName}`);
    assert.ok(
      labelRegistry(constName).has(eventName),
      `${eventName} dikirim sebagai '${eventType}' tapi tidak terdaftar di ${constName} — server akan membuangnya senyap`,
    );
  }
}

/** Tekan tombol share dan tunggu handler-nya benar-benar selesai. */
async function pressShare(page, chatgptButton) {
  await waitForShareButtonReady(page);
  await chatgptButton.click();
  // Tombol dikunci selama openChatGPT berjalan; terbuka lagi = handler tuntas.
  await waitForShareButtonReady(page);
  return readTrackedEvents(page);
}

function payloadOf(events) {
  const event = events.find((e) => e.eventName === 'brochure_prompt_share_payload');
  assert.ok(event, `ringkasan payload tidak terkirim; yang tercatat: ${events.map((e) => e.eventName).join(', ') || '(kosong)'}`);
  return event.metadata;
}

test('payload evidence survives a share sheet the user cancels', async () => {
  await withPromptModal({ props: PROPS, shareResult: 'abort' }, async ({ page, chatgptButton }) => {
    const events = await pressShare(page, chatgptButton);
    const calls = await readCalls(page);

    assert.equal(calls.share.length, 1, 'skenario ini tidak berarti kalau share tidak pernah dicoba');
    // Inti penjaga ini: share GAGAL, buktinya tetap ada.
    assert.equal(payloadOf(events).file_count, 1);
    assert.ok(events.some((e) => e.eventName === 'brochure_prompt_share_cancelled'));
    assert.ok(!events.some((e) => e.eventName === 'brochure_prompt_share_chatgpt'), 'share yang dibatalkan tidak boleh dilaporkan sukses');
    assertEventsRegistered(events);
  });
});

test('payload evidence survives a share sheet that throws', async () => {
  await withPromptModal({ props: PROPS, shareResult: 'fail' }, async ({ page, chatgptButton }) => {
    const events = await pressShare(page, chatgptButton);
    const calls = await readCalls(page);

    assert.equal(calls.share.length, 1);
    assert.equal(payloadOf(events).file_count, 1);
    // Gagal ≠ batal: pengguna tetap diantar ke chatgpt.com sebagai cadangan.
    assert.equal(calls.open.length, 1);
    assert.ok(events.some((e) => e.eventName === 'brochure_prompt_open_chatgpt'));
    assertEventsRegistered(events);
  });
});

test('payload evidence survives a browser whose canShare refuses the payload', async () => {
  await withPromptModal({ props: PROPS, canShareResult: false }, async ({ page, chatgptButton }) => {
    const events = await pressShare(page, chatgptButton);
    const calls = await readCalls(page);

    // canShare wajib ditanya lebih dulu, dan jawabannya wajib dipatuhi.
    assert.deepEqual(calls.canShare, [['files', 'text']], 'payload harus diperiksa canShare sebelum dibagikan');
    assert.deepEqual(calls.share, [], 'jangan panggil navigator.share setelah canShare menolak');
    assert.equal(calls.open.length, 1, 'penolakan canShare harus jatuh ke chatgpt.com');
    // Dicatat sebelum gerbang canShare, jadi payload yang ditolak pun terlihat.
    assert.equal(payloadOf(events).payload_fields, 'files,text');
    assertEventsRegistered(events);
  });
});

test('payload summary carries bundle and file evidence', async () => {
  await withPromptModal({ props: PROPS }, async ({ page, file, chatgptButton }) => {
    const events = await pressShare(page, chatgptButton);
    const [shared] = (await readCalls(page)).share;
    const metadata = payloadOf(events);

    assert.equal(metadata.payload_fields, 'files,text');
    assert.equal(metadata.file_count, 1);
    assert.equal(metadata.file_name, file.name);
    assert.equal(metadata.file_type, file.type);
    assert.equal(metadata.file_size, file.size);
    assert.ok(file.size > 0, 'file contoh kosong membuat asersi file_size hampa');

    // Penanda bundle: log server memakainya untuk memastikan versi mana yang
    // benar-benar jalan di HP pengguna, jadi ia harus ikut apa adanya.
    assert.equal(metadata.app_version, HARNESS_APP_VERSION);
    assert.ok(['standalone', 'browser'].includes(metadata.display_mode), `display_mode tak terduga: ${metadata.display_mode}`);
    assert.equal(typeof metadata.sw_controlled, 'boolean');

    // Panjang prompt boleh; isinya tidak (lihat tes berikutnya).
    assert.equal(metadata.prompt_length, shared.text.length);
    assert.ok(metadata.prompt_length > 0);
    assertEventsRegistered(events);
  });
});

test('share instrumentation reports prompt length without shipping the prompt itself', async () => {
  await withPromptModal({ props: PROPS }, async ({ page, chatgptButton }) => {
    const events = await pressShare(page, chatgptButton);
    const [shared] = (await readCalls(page)).share;

    // Judul jadwal ikut apa adanya ke dalam prompt, jadi ia penanda kebocoran
    // yang tepat: begitu isi prompt masuk ke metadata mana pun, token ini ikut.
    assert.ok(shared.text.includes(SCHEDULE_TITLE_SENTINEL), 'probe kebocoran tidak lagi ada di dalam prompt');

    for (const event of events) {
      const serialized = JSON.stringify(event.metadata ?? {});
      assert.ok(
        !serialized.includes(SCHEDULE_TITLE_SENTINEL),
        `event ${event.eventName} membawa isi prompt ke analytics: ${serialized.slice(0, 200)}`,
      );
    }
  });
});
