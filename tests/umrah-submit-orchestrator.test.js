import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  UMRAH_UPSTREAM_FAILURE_STATUS,
  buildUmrahSubmitFailure,
  executeUmrahSubmit,
  shouldUseBrowserUmrahSubmit,
} from '../lib/umrah-submit-orchestrator.js';

test('saved legacy password selects the browser/reCAPTCHA submit path only', async () => {
  const calls = [];
  const commonPayload = {
    fields: { ktp: '3276010101900001', paket: 'PKT001' },
    hiddenFields: { pin: 'stale-pin' },
    fileBuffer: Buffer.from('ktp'),
    fileName: 'ktp.jpg',
    fileFieldName: 'fktp',
    idb: 'AIW001.JBU001',
  };

  const output = await executeUmrahSubmit({
    username: 'SM00001',
    savedPassword: 'encrypted-password',
    kantor: '2',
    commonPayload,
    directPayload: { formAction: 'aksi_umrah.php', ...commonPayload },
    decryptPassword(value) {
      calls.push(['decrypt', value]);
      return 'plain-password';
    },
    async submitBrowser(payload) {
      calls.push(['browser', payload]);
      return { success: true, message: 'Pendaftaran berhasil' };
    },
    async submitDirect() {
      calls.push(['direct']);
      throw new Error('direct submit must not run');
    },
  });

  assert.equal(output.mode, 'browser');
  assert.equal(output.result.success, true);
  assert.deepEqual(calls.map(([name]) => name), ['decrypt', 'browser']);
  assert.deepEqual(calls[1][1], {
    username: 'SM00001',
    password: 'plain-password',
    kantor: '2',
    ...commonPayload,
  });
});

test('active legacy session without a saved password uses direct submit only', async () => {
  const calls = [];
  const directPayload = {
    formAction: 'route/data_umrah/aksi_umrah.php',
    fields: { ktp: '3276010101900001' },
  };

  const output = await executeUmrahSubmit({
    username: 'SM00002',
    savedPassword: '',
    commonPayload: {},
    directPayload,
    decryptPassword() {
      throw new Error('decrypt must not run');
    },
    async submitBrowser() {
      calls.push('browser');
      throw new Error('browser submit must not run');
    },
    async submitDirect(username, payload) {
      calls.push(['direct', username, payload]);
      return { success: false, reason: 'session_expired_remote', error: 'Session habis' };
    },
  });

  assert.equal(output.mode, 'direct');
  assert.equal(output.result.reason, 'session_expired_remote');
  assert.deepEqual(calls, [['direct', 'SM00002', directPayload]]);
});

test('browser rejection is returned without attempting the direct mutation path', async () => {
  const calls = [];
  const output = await executeUmrahSubmit({
    username: 'SM00003',
    savedPassword: 'encrypted-password',
    commonPayload: { fields: { ktp: '3276010101900001' } },
    directPayload: { formAction: 'aksi_umrah.php' },
    decryptPassword: () => 'plain-password',
    async submitBrowser() {
      calls.push('browser');
      return {
        success: false,
        reason: 'legacy_form_rejected',
        error: 'NIK sudah terdaftar',
      };
    },
    async submitDirect() {
      calls.push('direct');
      return { success: true };
    },
  });

  assert.deepEqual(calls, ['browser']);
  assert.equal(output.mode, 'browser');
  assert.equal(output.result.reason, 'legacy_form_rejected');
});

test('browser exception remains a handled failure and never falls through to direct submit', async () => {
  const calls = [];
  const output = await executeUmrahSubmit({
    username: 'SM00004',
    savedPassword: 'encrypted-password',
    commonPayload: {},
    directPayload: {},
    decryptPassword: () => 'plain-password',
    async submitBrowser() {
      calls.push('browser');
      throw new Error('chromium crashed');
    },
    async submitDirect() {
      calls.push('direct');
      return { success: true };
    },
  });

  assert.deepEqual(calls, ['browser']);
  assert.equal(output.result.success, false);
  assert.equal(output.result.reason, 'browser_submit_exception');
});

test('submit-mode selection rejects blank passwords and accepts stored ciphertext', () => {
  assert.equal(shouldUseBrowserUmrahSubmit(undefined), false);
  assert.equal(shouldUseBrowserUmrahSubmit('   '), false);
  assert.equal(shouldUseBrowserUmrahSubmit('ciphertext'), true);
});

test('handled upstream failures stay structured and use non-5xx status', () => {
  assert.equal(UMRAH_UPSTREAM_FAILURE_STATUS, 424);
  assert.deepEqual(buildUmrahSubmitFailure({
    reason: 'transport_error',
    error: 'Koneksi sistem internal terputus',
  }), {
    success: false,
    reason: 'transport_error',
    retryable: true,
    error: 'Koneksi sistem internal terputus',
  });
  assert.equal(buildUmrahSubmitFailure({ reason: 'legacy_form_rejected' }).retryable, false);
});
