export const PAYMENT_SOURCE_AWAPI = 'awapi';
export const PAYMENT_SOURCE_LEGACY = 'legacy';

export const JAMAAH_PAYMENT_COLUMNS = [
  'bayar',
  'sisa',
  'diskon_kantor',
  'diskon_marketing',
];

export const RAW_PAYMENT_FIELDS = [
  'bayar',
  'bayar_sisa',
  'bayar_gross',
  'bayar_status',
  'harga_paket',
  'paket_harga',
  'status_bayar',
  'diskon_kantor',
  'diskon_marketing',
  'payment_source',
  'payment_synced_at',
];

function safeRawObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

export function paymentSourceOf(value) {
  const raw = value?.raw_data && typeof value.raw_data === 'object'
    ? value.raw_data
    : safeRawObject(value);
  return raw.payment_source || null;
}

export function isAwapiPaymentSource(value) {
  return paymentSourceOf(value) === PAYMENT_SOURCE_AWAPI;
}

export function stampPaymentRaw(rawData, source, timestamp = new Date().toISOString()) {
  return {
    ...safeRawObject(rawData),
    payment_source: source,
    payment_synced_at: timestamp,
  };
}

export function markLegacyPaymentRow(row, timestamp = new Date().toISOString()) {
  if (!row) return row;
  return {
    ...row,
    raw_data: stampPaymentRaw(row.raw_data, PAYMENT_SOURCE_LEGACY, timestamp),
  };
}

export function stripLegacyPaymentRawForAwapi(rawData) {
  const raw = { ...safeRawObject(rawData) };
  for (const key of RAW_PAYMENT_FIELDS) {
    delete raw[key];
  }
  if (raw.source === 'umrah_detail') {
    delete raw.source;
  }
  return raw;
}

export function omitPaymentFieldsFromJamaahRow(row) {
  if (!row) return row;
  const out = { ...row };
  for (const key of JAMAAH_PAYMENT_COLUMNS) {
    delete out[key];
  }
  delete out.raw_data;
  return out;
}

export function prepareLegacyPaymentRowForUpsert(row, existing, timestamp = new Date().toISOString()) {
  if (isAwapiPaymentSource(existing)) {
    return omitPaymentFieldsFromJamaahRow(row);
  }
  return markLegacyPaymentRow(row, timestamp);
}
