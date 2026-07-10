import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const rootPath = new URL('..', import.meta.url).pathname;

function read(path) {
  return readFileSync(join(rootPath, path), 'utf8');
}

test('stored auth session must include a valid user before auto-login', () => {
  const login = read('src/components/LoginPage.tsx');
  const auth = read('src/utils/authUtils.ts');

  assert.match(login, /function isStoredAuthSession\(value: unknown\): value is AuthSession/);
  assert.match(login, /user\.role === 'admin' \|\| user\.role === 'agent'/);
  assert.match(login, /storage\.removeItem\('auth_session'\);/);
  assert.match(login, /function getBrowserStorage\(kind: 'local' \| 'session'\): Storage \| null/);
  assert.match(login, /return readStoredSession\(getBrowserStorage\('local'\)\) \|\| readStoredSession\(getBrowserStorage\('session'\)\);/);

  assert.match(auth, /function isStoredSession\(value: unknown\): value is StoredSession/);
  assert.match(auth, /user\.role === 'admin' \|\| user\.role === 'agent'/);
  assert.match(auth, /storage\.removeItem\('auth_session'\);/);
  assert.match(auth, /function getBrowserStorage\(kind: 'local' \| 'session'\): Storage \| null/);
  assert.match(auth, /return readStoredSession\(getBrowserStorage\('local'\)\) \|\| readStoredSession\(getBrowserStorage\('session'\)\);/);
});

test('dashboard clears rejected tokens but preserves sessions on network blips', () => {
  const main = read('src/main.tsx');

  assert.ok(main.includes("const shouldAutoRedirect = isSessionValid() && currentPath === '/'"));
  assert.ok(!main.includes("currentPath === '/login'"));
  assert.match(main, /err\.status = r\.status/);
  assert.match(main, /if \(err\?\.status === 401 \|\| err\?\.status === 403\)/);
  assert.match(main, /clearSession\(\)/);
  assert.match(main, /setSession\(null\)/);
  assert.match(main, /Network\/server blips should not force logout/);
  assert.match(main, /function LoginRouter\(\) \{[\s\S]*useEffect\(\(\) => \{[\s\S]*clearSession\(\)/);
});
