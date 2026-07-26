import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  normalizeInternalAccount,
  isSameInternalAccount,
  escapeInternalAccountLike,
  internalAccountTakenMessage,
} from '../lib/internal-account-guard.js';

const rootPath = new URL('..', import.meta.url).pathname;
const read = (p) => readFileSync(join(rootPath, p), 'utf8');

// ── normalizeInternalAccount ──────────────────────────────────────────────

test('normalizeInternalAccount trims and coerces null/undefined to empty', () => {
  assert.equal(normalizeInternalAccount('  SM406  '), 'SM406');
  assert.equal(normalizeInternalAccount('SM406'), 'SM406');
  assert.equal(normalizeInternalAccount(''), '');
  assert.equal(normalizeInternalAccount(null), '');
  assert.equal(normalizeInternalAccount(undefined), '');
});

// ── isSameInternalAccount (drives "owner may re-login") ───────────────────

test('owner re-login: same account matches case-insensitively and trimmed', () => {
  assert.equal(isSameInternalAccount('SM406', 'SM406'), true);
  assert.equal(isSameInternalAccount('sm406', 'SM406'), true);
  assert.equal(isSameInternalAccount('  SM406 ', 'SM406'), true);
});

test('different accounts never match (a switch is treated as a new claim)', () => {
  assert.equal(isSameInternalAccount('SM406', 'SM442'), false);
  assert.equal(isSameInternalAccount('SM406', 'SM4'), false); // not a substring match
});

test('a blank current account is never "mine" (unconnected agent claims fresh)', () => {
  assert.equal(isSameInternalAccount('', 'SM406'), false);
  assert.equal(isSameInternalAccount(null, 'SM406'), false);
  assert.equal(isSameInternalAccount(undefined, 'SM406'), false);
  assert.equal(isSameInternalAccount('', ''), false);
});

// ── escapeInternalAccountLike (keeps the DB lookup an exact match) ─────────

test('escapeInternalAccountLike leaves normal usernames untouched', () => {
  assert.equal(escapeInternalAccountLike('SM406'), 'SM406');
  assert.equal(escapeInternalAccountLike('  SM01078 '), 'SM01078');
});

test('escapeInternalAccountLike escapes ilike wildcards so no partial match leaks', () => {
  assert.equal(escapeInternalAccountLike('SM%'), 'SM\\%');
  assert.equal(escapeInternalAccountLike('SM_1'), 'SM\\_1');
  assert.equal(escapeInternalAccountLike('a\\b'), 'a\\\\b');
});

test('escapeInternalAccountLike returns empty for blank input (guard short-circuits)', () => {
  assert.equal(escapeInternalAccountLike(''), '');
  assert.equal(escapeInternalAccountLike(null), '');
});

// ── internalAccountTakenMessage ───────────────────────────────────────────

test('rejection message names the account and the current holder', () => {
  const msg = internalAccountTakenMessage('SM406', 'Sri Hastuti');
  assert.match(msg, /Akun internal SM406/);
  assert.match(msg, /Sri Hastuti/);
  assert.match(msg, /satu agent/);
});

test('rejection message falls back gracefully when holder name is missing', () => {
  const msg = internalAccountTakenMessage('SM406', '');
  assert.match(msg, /agent lain/);
  assert.match(msg, /SM406/);
});

// ── source guard: server.js wires the guard into the connect endpoint ─────

test('POST /api/laporan/login enforces one-account-per-agent before legacy login', () => {
  const server = read('server.js');

  // Helper + lib import present.
  assert.match(server, /import \{ isSameInternalAccount, escapeInternalAccountLike, internalAccountTakenMessage \} from '\.\/lib\/internal-account-guard\.js'/);
  assert.match(server, /async function findAgentUsingInternalAccount\(username, excludeAgentId\)/);
  assert.match(server, /\.neq\('id', excludeAgentId\)/);

  // The guard block: owner may re-login, others get a 409 with the taken code.
  assert.match(server, /const alreadyMine = isSameInternalAccount\(meNow\?\.jamaah_username, username\)/);
  assert.match(server, /if \(!alreadyMine\) \{[\s\S]*findAgentUsingInternalAccount\(username, req\.user\.id\)/);
  assert.match(server, /res\.status\(409\)\.json\(\{[\s\S]*code: 'internal_account_taken'[\s\S]*internalAccountTakenMessage\(username, claimant\.name\)/);

  // Guard must run BEFORE the legacy login call so a blocked claim never hits
  // the Alhijaz anti-bruteforce.
  const guardIdx = server.indexOf("code: 'internal_account_taken'");
  const loginIdx = server.indexOf('const result = await laporanLogin(username, password, k)');
  assert.ok(guardIdx > 0 && loginIdx > 0, 'both anchors present');
  assert.ok(guardIdx < loginIdx, 'guard runs before laporanLogin');

  // Fail-open: a DB lookup error must not block a legitimate connect.
  assert.match(server, /\[internal-account-guard\] lookup failed[\s\S]*return null;/);
});
