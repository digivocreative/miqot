import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url);
const rootPath = root.pathname;

function read(path) {
  return readFileSync(join(rootPath, path), 'utf8');
}

test('umrah registration refreshes legacy cookies and retries final submit after remote session expiry', () => {
  const laporanApi = read('laporan-api.js');
  const server = read('server.js');
  const registerPage = read('src/components/UmrahRegisterPage.tsx');
  const jamaahPage = read('src/components/JamaahPage.tsx');

  assert.match(laporanApi, /export function mergeCookieString/);
  assert.match(laporanApi, /function refreshSessionCookies\(session, headers\)/);
  assert.match(laporanApi, /refreshSessionCookies\(session, res\.headers\)/);
  assert.match(laporanApi, /'Origin': base\.replace\(/);
  assert.match(laporanApi, /reason: 'session_expired_remote', error: 'Session kedaluwarsa di sistem internal'/);
  assert.match(laporanApi, /export async function submitUmrahRegistrationWithBrowser/);
  assert.match(laporanApi, /async function getLegacyBrowserRecaptchaConfig\(page\)/);
  assert.match(laporanApi, /grecaptcha\\.execute\\\(\\s\*\['"\]\(\[\^'"\]\+\)\['"\]/);
  assert.match(laporanApi, /name\\s\*:\\s\*\['"\]\(\[\^'"\]\+\)\['"\]\\s\*,\\s\*value\\s\*:\\s\*isi/);
  assert.match(laporanApi, /window\.grecaptcha\.execute\(siteKey, \{ action: 'submit' \}\)/);
  assert.match(laporanApi, /UMRAH_RECAPTCHA_FIELD_NAME/);
  assert.match(laporanApi, /recaptchaSource: recaptchaConfig\.source/);
  assert.match(laporanApi, /function findBlockingLegacyDialog/);
  assert.match(laporanApi, /pickLegacyBrowserSelectName\(page, \['vjadwal', 'jadwal', 'berangkat', 'tgl_berangkat'\]\)/);
  assert.match(laporanApi, /Alhijaz menolak jadwal\/paket/);
  assert.match(laporanApi, /reason: 'legacy_form_rejected'/);
  assert.match(laporanApi, /Alhijaz menolak tambah jamaah/);
  assert.match(laporanApi, /Final submit HTTP 403 — retrying once with a fresh browser session/);
  assert.match(laporanApi, /retryBlocked: false/);

  assert.match(server, /let result = await submitUmrahRegistration/);
  assert.match(server, /result\.reason === 'session_expired_remote' && agent\.jamaah_password/);
  assert.match(server, /const fresh = await laporanLogin\(agent\.jamaah_username, decrypted, agent\.jamaah_kantor \|\| '2'\)/);
  assert.match(server, /const freshForm = await fetchUmrahFormOptions\(agent\.jamaah_username, \{ idb \}\)/);
  assert.match(server, /formAction: retryFormAction/);
  assert.match(server, /hiddenFields: retryHiddenFields/);
  assert.match(server, /submitUmrahRegistrationWithBrowser\(\{/);
  assert.match(server, /password: getDecryptedLegacyPassword\(\)/);

  assert.match(registerPage, /status:\s+\{\s+label: 'Status Nikah'/);
  assert.match(registerPage, /BELUM\\s\*KAWIN\|BELUM\\s\*MENIKAH/);
  assert.match(registerPage, /const responseText = await res\.text\(\)/);
  assert.match(registerPage, /JSON\.parse\(responseText\)/);
  assert.match(registerPage, /function summarizeSubmitErrorText\(text: string\)/);
  assert.match(registerPage, /cloudflare\|cf-error\|attention required/);

  assert.match(jamaahPage, /function getLegacyAddIdb/);
  assert.match(jamaahPage, /raw_data\?\.id_jadwal/);
  assert.match(jamaahPage, /idb: getLegacyAddIdb\(item\)/);
});
