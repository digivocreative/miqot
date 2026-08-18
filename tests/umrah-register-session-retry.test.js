import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url);
const rootPath = root.pathname;

function read(path) {
  return readFileSync(join(rootPath, path), 'utf8');
}

test('umrah registration uses browser/reCAPTCHA as primary and keeps upstream failures structured', () => {
  const laporanApi = read('laporan-api.js');
  const server = read('server.js');
  const orchestrator = read('lib/umrah-submit-orchestrator.js');
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
  assert.match(laporanApi, /actionMatch\s*=\s*scripts\.match\(/);
  assert.match(laporanApi, /tokenAction: recaptchaConfig\.action/);
  assert.match(laporanApi, /window\.grecaptcha\.execute\(siteKey, \{ action: tokenAction \|\| 'submit' \}\)/);
  assert.match(laporanApi, /--headless=new/);
  assert.match(laporanApi, /--disable-blink-features=AutomationControlled/);
  assert.match(laporanApi, /Chrome\/\$\{majorVersion\}\.0\.0\.0/);
  assert.match(laporanApi, /locale: 'id-ID'/);
  assert.match(laporanApi, /timezoneId: 'Asia\/Jakarta'/);
  assert.match(laporanApi, /await submitButton\.click\(\)/);
  assert.match(laporanApi, /name\\s\*:\\s\*\['"\]\(\[\^'"\]\+\)\['"\]\\s\*,\\s\*value\\s\*:\\s\*isi/);
  assert.match(laporanApi, /UMRAH_RECAPTCHA_FIELD_NAME/);
  assert.match(laporanApi, /recaptchaSource: recaptchaConfig\.source/);
  assert.match(laporanApi, /recaptchaAction: recaptchaConfig\.action/);
  assert.match(laporanApi, /function findBlockingLegacyDialog/);
  assert.match(laporanApi, /pickLegacyBrowserSelectName\(page, \['vjadwal', 'jadwal', 'berangkat', 'tgl_berangkat'\]\)/);
  assert.match(laporanApi, /Alhijaz menolak jadwal\/paket/);
  assert.match(laporanApi, /reason: 'legacy_form_rejected'/);
  assert.match(laporanApi, /Alhijaz menolak tambah jamaah/);
  assert.match(laporanApi, /Final submit HTTP 403 — retrying once with a fresh browser session/);
  assert.match(laporanApi, /retryBlocked: false/);
  assert.match(laporanApi, /const BROWSER_MANAGED_UMRAH_FIELDS = new Set/);
  assert.match(laporanApi, /const packagePrice = await readLegacyBrowserPackagePrice\(page\)/);
  assert.match(laporanApi, /reason: 'package_price_unresolved'/);
  assert.match(laporanApi, /reason: 'transport_error'/);
  assert.match(laporanApi, /causeCode: cause\?\.code/);
  assert.match(laporanApi, /bytesWritten: cause\?\.socket\?\.bytesWritten/);

  assert.match(server, /const useBrowserSubmit = shouldUseBrowserUmrahSubmit\(agent\.jamaah_password\)/);
  assert.match(server, /if \(!useBrowserSubmit\) \{\s*const sess = await ensureLegacySession\(agent\)/);
  assert.match(server, /const \{ mode: submitMode, result \} = await executeUmrahSubmit\(\{/);
  assert.match(server, /submitBrowser: submitUmrahRegistrationWithBrowser/);
  assert.match(server, /submitDirect: submitUmrahRegistration/);
  assert.match(server, /status\(UMRAH_UPSTREAM_FAILURE_STATUS\)/);
  assert.match(server, /app\.use\('\/api\/umrah\/register', express\.json\(\{ limit: '16mb' \}\)\)/);
  assert.doesNotMatch(server, /Remote session expired on submit — forcing re-login/);

  assert.match(orchestrator, /if \(shouldUseBrowserUmrahSubmit\(savedPassword\)\)/);
  assert.match(orchestrator, /const result = await submitBrowser\(\{/);
  assert.match(orchestrator, /const result = await submitDirect\(username, directPayload\)/);

  assert.match(registerPage, /status:\s+\{\s+label: 'Status Nikah'/);
  assert.match(registerPage, /tjamaah:\s+\{\s+label: 'No\. Telp\/HP Jamaah'[\s\S]*required: true/);
  assert.match(registerPage, /plahir:\s+\{\s+label: 'Tempat Lahir'[\s\S]*required: true/);
  assert.match(registerPage, /tlahir:\s+\{\s+label: 'Tanggal Lahir'[\s\S]*required: true/);
  assert.match(registerPage, /return '3276010101900001'/);
  assert.match(registerPage, /pendaftarPhone === '1111111111'/);
  assert.match(registerPage, /submitFields\[hpPendaftarName\] = submitFields\[hpJamaahName\]/);
  assert.match(registerPage, /BELUM\\s\*KAWIN\|BELUM\\s\*MENIKAH/);
  assert.match(registerPage, /const responseText = await res\.text\(\)/);
  assert.match(registerPage, /JSON\.parse\(responseText\)/);
  assert.match(registerPage, /function summarizeSubmitErrorText\(text: string, status\?: number\)/);
  assert.match(registerPage, /cloudflare\|cf-error\|attention required/);
  assert.match(registerPage, /'Accept': 'application\/json'/);
  assert.match(registerPage, /if \(!res\.ok \|\| data\.success === false\)/);

  assert.match(jamaahPage, /function getLegacyAddIdb/);
  assert.match(jamaahPage, /idb: getLegacyAddIdb\(first\)/);
  assert.match(registerPage, /const bindIdb = searchParams\.get\('idb'\) \|\| ''/);
  assert.match(registerPage, /idb: bindIdb \|\| undefined/);
  assert.match(jamaahPage, /onClick=\{\(\) => openEditJamaah\(item\)\}/);
});
