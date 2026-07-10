export const UMRAH_UPSTREAM_FAILURE_STATUS = 424;

export function shouldUseBrowserUmrahSubmit(savedPassword) {
  return typeof savedPassword === 'string'
    ? savedPassword.trim().length > 0
    : Boolean(savedPassword);
}

/**
 * Execute exactly one registration path.
 *
 * The legacy form now requires JavaScript-generated reCAPTCHA. When a saved
 * password is available, the real browser path is therefore the primary path;
 * the direct multipart request remains only for an already-active legacy
 * session that has no saved password.
 */
export async function executeUmrahSubmit({
  username,
  savedPassword,
  kantor = '2',
  commonPayload,
  directPayload,
  decryptPassword,
  submitBrowser,
  submitDirect,
}) {
  if (shouldUseBrowserUmrahSubmit(savedPassword)) {
    let password;
    try {
      password = decryptPassword(savedPassword);
    } catch (error) {
      return {
        mode: 'browser',
        result: {
          success: false,
          reason: 'credential_decrypt_failed',
          error: 'Kredensial sistem internal tidak dapat dibaca. Silakan hubungkan ulang akun Jamaah.',
          debug: { message: error?.message || String(error) },
        },
      };
    }

    try {
      const result = await submitBrowser({
        username,
        password,
        kantor,
        ...commonPayload,
      });
      return { mode: 'browser', result };
    } catch (error) {
      return {
        mode: 'browser',
        result: {
          success: false,
          reason: 'browser_submit_exception',
          error: 'Browser pendaftaran gagal dijalankan. Silakan coba lagi.',
          debug: { message: error?.message || String(error) },
        },
      };
    }
  }

  try {
    const result = await submitDirect(username, directPayload);
    return { mode: 'direct', result };
  } catch (error) {
    return {
      mode: 'direct',
      result: {
        success: false,
        reason: 'transport_error',
        error: 'Koneksi ke sistem internal terputus. Silakan coba lagi.',
        debug: { message: error?.message || String(error) },
      },
    };
  }
}

export function buildUmrahSubmitFailure(result) {
  const reason = result?.reason || 'upstream_rejected';
  return {
    success: false,
    reason,
    retryable: reason === 'transport_error' || reason === 'transport_timeout',
    error: result?.error || 'Sistem internal menolak pendaftaran',
  };
}
