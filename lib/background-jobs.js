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
