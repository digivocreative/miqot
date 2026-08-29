const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);
const FALSE_VALUES = new Set(['0', 'false', 'no', 'off']);

export function parseEnvBoolean(value) {
  if (value == null) return null;
  const normalized = String(value).trim().toLowerCase();
  if (TRUE_VALUES.has(normalized)) return true;
  if (FALSE_VALUES.has(normalized)) return false;
  return null;
}

export function shouldRunBackgroundJobs(env = process.env) {
  const explicit = parseEnvBoolean(env.ENABLE_BACKGROUND_JOBS);
  if (explicit !== null) return explicit;
  return env.NODE_ENV === 'production';
}

export function shouldRunLegacyBackgroundSync(env = process.env) {
  const disabled = parseEnvBoolean(env.DISABLE_LEGACY_BACKGROUND_SYNC);
  return disabled !== true;
}

export function shouldRunJamaahBackgroundSync(env = process.env) {
  const disabled = parseEnvBoolean(env.DISABLE_JAMAAH_BACKGROUND_SYNC);
  return disabled !== true;
}

// WIB tidak mengenal DST, jadi jam dinding WIB selalu = jam UTC + 7.
export const WIB_UTC_OFFSET_HOURS = 7;

// Jarak (ms) dari `now` ke kemunculan `wibHour`:00 WIB berikutnya. Dipakai cron
// harian supaya konversi zona waktunya dihitung sekali di satu tempat dan bisa
// diuji — salah zona di sini tidak bikin apa pun error, cuma menjalankan sync
// di jam yang keliru diam-diam selama berbulan-bulan.
export function msUntilNextWibHour(wibHour, now = new Date()) {
  if (!Number.isInteger(wibHour) || wibHour < 0 || wibHour > 23) {
    throw new RangeError(`wibHour harus bilangan bulat 0-23, dapat: ${wibHour}`);
  }
  const target = new Date(now);
  target.setUTCHours((wibHour - WIB_UTC_OFFSET_HOURS + 24) % 24, 0, 0, 0);
  // setUTCDate, BUKAN setDate: setDate memakai tanggal lokal proses, jadi di
  // server ber-TZ non-UTC ia bisa melompat ke hari yang salah.
  if (target <= now) target.setUTCDate(target.getUTCDate() + 1);
  return target.getTime() - now.getTime();
}
