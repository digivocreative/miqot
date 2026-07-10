/**
 * Alhijaz Official API client.
 *
 * Pure HTTP wrappers for the JSON endpoints exposed at:
 *   GET /jadwal/api-get/{TahunHijriah}
 *   GET /awapi/gu/{kode}/bm|bh|dm|dh/{Tahun}[/{Bulan}]
 *   GET /awapi/gu/{kode}/umrah/{IDUmrah}
 *   GET /awapi/gu/{kode}/jamaah/{IDJamaah}
 *   GET /awapi/gh/{kode}/bm|bh|dm|dh/{Tahun}[/{Bulan}]
 *   GET /awapi/gh/{kode}/haji/{IDHaji}
 *   GET /awapi/gh/{kode}/jamaah/{IDJamaah}
 *
 * Auth: header `x-api-key: {kode}-{secret}`. The upstream API does not currently
 * enforce key validation (only the {kode} segment in the URL matters), but we
 * always send the header for forward-compatibility.
 *
 * All `fetch*` functions throw a structured error `{ status, message, body }`
 * on non-2xx or network failure. Success returns `{ rows, raw }` where
 * `rows` is the `aaData` array (always an array, possibly empty).
 *
 * Use `normalizeAwapiRow(raw, { agentId })` to project a raw API row
 * into the shape of the `jamaah` Supabase table (excluding `hijriah_year`,
 * which is computed by the caller from `tgl_berangkat`).
 */

import {
  PAYMENT_SOURCE_AWAPI,
  isAwapiPaymentSource,
  stampPaymentRaw,
  stripLegacyPaymentRawForAwapi,
} from './lib/jamaah-payment-provenance.js';

const BASE = process.env.AWAPI_BASE || 'http://115.124.86.220';
const DEFAULT_TIMEOUT_MS = 20_000;
const RETRY_DELAY_MS = 800;

class AwapiError extends Error {
  constructor(message, { status, body } = {}) {
    super(message);
    this.name = 'AwapiError';
    this.status = status ?? 0;
    this.body = body;
  }
}

export function parseAwapiResponseText(text) {
  const raw = String(text || '');
  const jsonStart = raw.indexOf('{');
  if (jsonStart < 0) {
    throw new AwapiError('Upstream response is not JSON', { status: 0, body: raw.slice(0, 500) });
  }

  const jsonText = raw.slice(jsonStart);
  try {
    return JSON.parse(jsonText);
  } catch {
    throw new AwapiError('Upstream response is not JSON', { status: 0, body: raw.slice(0, 500) });
  }
}

async function awapiRequest(path, { apiKey, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const url = `${BASE}${path}`;
  const headers = { Accept: 'application/json' };
  if (apiKey) headers['x-api-key'] = apiKey;

  const doFetch = async () => {
    return await fetch(url, {
      headers,
      signal: AbortSignal.timeout(timeoutMs),
    });
  };

  let res;
  try {
    res = await doFetch();
    if (res.status >= 500 && res.status < 600) {
      await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
      res = await doFetch();
    }
  } catch (err) {
    throw new AwapiError(`Network error: ${err.message}`, { status: 0 });
  }

  const text = await res.text();
  if (!res.ok) {
    throw new AwapiError(`Upstream ${res.status}`, { status: res.status, body: text.slice(0, 500) });
  }

  const json = parseAwapiResponseText(text);

  const rows = Array.isArray(json?.aaData) ? json.aaData : [];
  return { rows, raw: json };
}

/**
 * List umrah jamaah by tahun keberangkatan.
 * @param {string} apiKey  Full x-api-key (`{kode}-{secret}`)
 * @param {string} agentCode  Agent code segment used in URL
 * @param {object} opts
 * @param {string|number} opts.tahun  Year (Masehi or Hijriah depending on `hijriah` flag)
 * @param {string|number} [opts.bulan]  Optional month (1-12, Masehi only)
 * @param {boolean} [opts.hijriah]  If true, use `/bh/` (Hijriah) endpoint
 */
export async function awapiFetchUmrahByKeberangkatan(apiKey, agentCode, { tahun, bulan, hijriah = false } = {}) {
  if (!agentCode) throw new AwapiError('agentCode required', { status: 0 });
  if (!tahun) throw new AwapiError('tahun required', { status: 0 });
  const segment = hijriah ? 'bh' : 'bm';
  let path = `/awapi/gu/${encodeURIComponent(agentCode)}/${segment}/${encodeURIComponent(tahun)}`;
  if (bulan && !hijriah) path += `/${encodeURIComponent(bulan)}`;
  return awapiRequest(path, { apiKey });
}

/**
 * List umrah jamaah by tahun pendaftaran.
 */
export async function awapiFetchUmrahByPendaftaran(apiKey, agentCode, { tahun, bulan, hijriah = false } = {}) {
  if (!agentCode) throw new AwapiError('agentCode required', { status: 0 });
  if (!tahun) throw new AwapiError('tahun required', { status: 0 });
  const segment = hijriah ? 'dh' : 'dm';
  let path = `/awapi/gu/${encodeURIComponent(agentCode)}/${segment}/${encodeURIComponent(tahun)}`;
  if (bulan && !hijriah) path += `/${encodeURIComponent(bulan)}`;
  return awapiRequest(path, { apiKey });
}

/** Fetch one booking (and all its jamaah) by id_umrah. */
export async function awapiFetchUmrahById(apiKey, agentCode, idUmrah) {
  if (!agentCode || !idUmrah) throw new AwapiError('agentCode and idUmrah required', { status: 0 });
  const path = `/awapi/gu/${encodeURIComponent(agentCode)}/umrah/${encodeURIComponent(idUmrah)}`;
  return awapiRequest(path, { apiKey });
}

/** Fetch one jamaah by id_jamaah. */
export async function awapiFetchJamaahById(apiKey, agentCode, idJamaah) {
  if (!agentCode || !idJamaah) throw new AwapiError('agentCode and idJamaah required', { status: 0 });
  const path = `/awapi/gu/${encodeURIComponent(agentCode)}/jamaah/${encodeURIComponent(idJamaah)}`;
  return awapiRequest(path, { apiKey });
}

/**
 * List haji jamaah by tahun keberangkatan.
 * @param {string} apiKey  Full x-api-key (`{kode}-{secret}`)
 * @param {string} agentCode  Agent code segment used in URL
 * @param {object} opts
 * @param {string|number} opts.tahun  Year (Masehi or Hijriah depending on `hijriah` flag)
 * @param {boolean} [opts.hijriah]  If true, use `/bh/` (Hijriah) endpoint
 */
export async function awapiFetchHajiByKeberangkatan(apiKey, agentCode, { tahun, hijriah = false } = {}) {
  if (!agentCode) throw new AwapiError('agentCode required', { status: 0 });
  if (!tahun) throw new AwapiError('tahun required', { status: 0 });
  const segment = hijriah ? 'bh' : 'bm';
  const path = `/awapi/gh/${encodeURIComponent(agentCode)}/${segment}/${encodeURIComponent(tahun)}`;
  return awapiRequest(path, { apiKey });
}

/**
 * List haji jamaah by tahun pendaftaran.
 */
export async function awapiFetchHajiByPendaftaran(apiKey, agentCode, { tahun, bulan, hijriah = false } = {}) {
  if (!agentCode) throw new AwapiError('agentCode required', { status: 0 });
  if (!tahun) throw new AwapiError('tahun required', { status: 0 });
  const segment = hijriah ? 'dh' : 'dm';
  let path = `/awapi/gh/${encodeURIComponent(agentCode)}/${segment}/${encodeURIComponent(tahun)}`;
  if (bulan && !hijriah) path += `/${encodeURIComponent(Number(bulan))}`;
  return awapiRequest(path, { apiKey });
}

/** Fetch one haji booking (and all its jamaah) by id_haji. */
export async function awapiFetchHajiById(apiKey, agentCode, idHaji) {
  if (!agentCode || !idHaji) throw new AwapiError('agentCode and idHaji required', { status: 0 });
  const path = `/awapi/gh/${encodeURIComponent(agentCode)}/haji/${encodeURIComponent(idHaji)}`;
  return awapiRequest(path, { apiKey });
}

/** Fetch one haji jamaah by id_jamaah. */
export async function awapiFetchHajiJamaahById(apiKey, agentCode, idJamaah) {
  if (!agentCode || !idJamaah) throw new AwapiError('agentCode and idJamaah required', { status: 0 });
  const path = `/awapi/gh/${encodeURIComponent(agentCode)}/jamaah/${encodeURIComponent(idJamaah)}`;
  return awapiRequest(path, { apiKey });
}

/** Fetch jadwal (umrah package schedules) for a Hijriah year. */
export async function awapiFetchJadwal(yearCode, apiKey = null) {
  if (!yearCode) throw new AwapiError('yearCode required', { status: 0 });
  const path = `/jadwal/api-get/${encodeURIComponent(yearCode)}`;
  return awapiRequest(path, { apiKey });
}

// ── Normalization helpers ──

const PLACEHOLDER_DATE = '0000-00-00';

function getJakartaDateKey(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const byType = Object.fromEntries(parts.map(p => [p.type, p.value]));
  return `${byType.year}-${byType.month}-${byType.day}`;
}

function safeDate(s) {
  if (!s || typeof s !== 'string') return null;
  const v = s.trim();
  if (!v) return null;
  // Strip time portion if present ("YYYY-MM-DD HH:mm:ss" → "YYYY-MM-DD")
  const datePart = v.split(/[ T]/)[0];
  if (!datePart || datePart === PLACEHOLDER_DATE) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(datePart);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1000 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }
  return datePart;
}

function safeBirthDate(s) {
  const datePart = safeDate(s);
  if (!datePart) return null;
  const currentYear = Number(getJakartaDateKey().slice(0, 4));
  const birthYear = Number(datePart.slice(0, 4));
  if (!Number.isFinite(birthYear) || birthYear >= currentYear) return null;
  return datePart;
}

function safeText(s) {
  if (s === null || s === undefined) return null;
  const v = String(s).trim();
  return v === '' ? null : v;
}

function safeBigint(s) {
  if (s === null || s === undefined || s === '') return null;
  const n = typeof s === 'number' ? s : Number(String(s).replace(/[^\d-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function mapKelamin(v) {
  if (!v) return null;
  const s = String(v).toLowerCase();
  if (s.startsWith('l')) return 'L';
  if (s.startsWith('p') || s.startsWith('w')) return 'P';
  return null;
}

function safePaspor(v) {
  const t = safeText(v);
  if (!t) return null;
  // Upstream uses "0" as placeholder for "no paspor yet"
  if (t === '0') return null;
  return t;
}

function hasReadyDocument(v) {
  if (v === null || v === undefined) return false;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  const t = safeText(v);
  if (!t) return false;
  return !['0', 'false', 'null', 'undefined', '-'].includes(t.toLowerCase());
}

function normalizeUmrohDokumen(raw) {
  const dokumen = raw?.dokumen && typeof raw.dokumen === 'object' && !Array.isArray(raw.dokumen)
    ? { ...raw.dokumen }
    : {};

  if (Object.hasOwn(raw || {}, 'dokumen_pernyataan')) {
    dokumen.pernyataan = hasReadyDocument(raw.dokumen_pernyataan);
  }

  return Object.keys(dokumen).length > 0 ? dokumen : null;
}

function safeYear(v) {
  const t = safeText(v);
  if (!t || t === '0') return null;
  return /^\d{4}$/.test(t) ? t : null;
}

function normalizeStatusBayar(raw) {
  const status = safeText(raw?.bayar_status);
  if (status) return status.replace(/\s+/g, ' ').trim().toUpperCase();

  const bayar = safeBigint(raw?.bayar) || 0;
  const sisa = safeBigint(raw?.bayar_sisa);
  if (bayar <= 0) return 'BELUM BAYAR';
  if (sisa !== null && sisa <= 0) return 'LUNAS';
  return 'CICILAN';
}

/**
 * Project a raw API row into the shape of the `jamaah` table.
 * Caller is responsible for adding `hijriah_year` (computed from tgl_berangkat).
 *
 * @param {object} raw  Single row from aaData
 * @param {object} ctx
 * @param {string} ctx.agentId  agents.id (uuid)
 */
export function normalizeAwapiRow(raw, { agentId } = {}) {
  if (!raw || !agentId) return null;
  const id_umroh = safeText(raw.id_umrah);
  const jm_id = safeText(raw.id_jamaah);
  const nama = safeText(raw.nama);
  if (!id_umroh || !jm_id || !nama) return null;
  const syncedAt = new Date().toISOString();

  return {
    agent_id: agentId,
    id_umroh,
    jm_id,
    nama,
    jk: mapKelamin(raw.kelamin),
    wa: safeText(raw.hp),
    tgl_lahir: safeBirthDate(raw.tgl_lahir),
    paket: safeText(raw.paket),
    bayar: safeBigint(raw.bayar),
    sisa: safeBigint(raw.bayar_sisa),
    tgl_berangkat: safeDate(raw.tgl_berangkat),
    tgl_daftar: safeDate(raw.tgl_daftar),
    no_paspor: safePaspor(raw.paspor_nomor),
    paspor_expired: safeDate(raw.paspor_expired),
    perlengkapan: raw.perlengkapan && typeof raw.perlengkapan === 'object' ? raw.perlengkapan : null,
    dokumen: normalizeUmrohDokumen(raw),
    diskon_kantor: safeBigint(raw.diskon_kantor),
    diskon_marketing: safeBigint(raw.diskon_marketing),
    raw_data: stampPaymentRaw(raw, PAYMENT_SOURCE_AWAPI, syncedAt),
    synced_at: syncedAt,
  };
}

function safeRawObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function hasOwn(value, key) {
  return Object.hasOwn(safeRawObject(value), key);
}

export function applyManualUmrohOverrides(row, rawData) {
  if (!row) return row;
  const raw = safeRawObject(rawData);
  const overrides = safeRawObject(raw.manual_overrides);
  if (Object.keys(overrides).length === 0) return row;

  const out = { ...row };
  if (hasOwn(overrides, 'nama')) {
    const nama = safeText(overrides.nama);
    if (nama) out.nama = nama;
  }
  if (hasOwn(overrides, 'wa')) out.wa = safeText(overrides.wa);
  if (hasOwn(overrides, 'jk')) out.jk = safeText(overrides.jk);
  if (hasOwn(overrides, 'tgl_lahir')) out.tgl_lahir = safeBirthDate(overrides.tgl_lahir);
  if (hasOwn(overrides, 'no_paspor')) out.no_paspor = safePaspor(overrides.no_paspor);
  if (hasOwn(overrides, 'paspor_expired')) out.paspor_expired = safeDate(overrides.paspor_expired);
  return out;
}

export function preserveLegacyUmrohRawData(row, existing) {
  if (!row) return row;

  const incomingRaw = safeRawObject(row.raw_data);
  const existingRaw = safeRawObject(existing?.raw_data);
  const rawBase = isAwapiPaymentSource(incomingRaw)
    ? stripLegacyPaymentRawForAwapi(existingRaw)
    : existingRaw;
  const raw_data = { ...rawBase, ...incomingRaw };
  if (!hasReadyDocument(incomingRaw.dokumen_pernyataan) && hasReadyDocument(existingRaw.dokumen_pernyataan)) {
    raw_data.dokumen_pernyataan = existingRaw.dokumen_pernyataan;
  }

  const incomingStaff = safeText(incomingRaw.staf) || safeText(incomingRaw.staff);
  const existingStaff = safeText(existingRaw.staf) || safeText(existingRaw.staff);
  if (incomingStaff) {
    raw_data.staf = incomingStaff;
  } else if (!safeText(raw_data.staf) && existingStaff) {
    raw_data.staf = existingStaff;
  }

  const existingScheduleId = safeText(existingRaw.id_jadwal);
  if (!safeText(raw_data.id_jadwal) && existingScheduleId) {
    raw_data.id_jadwal = existingScheduleId;
  }

  const incomingDokumen = safeRawObject(row.dokumen);
  const existingDokumen = safeRawObject(existing?.dokumen);
  const dokumen = { ...existingDokumen, ...incomingDokumen };

  return applyManualUmrohOverrides({
    ...row,
    raw_data,
    dokumen: Object.keys(dokumen).length > 0 ? dokumen : row.dokumen,
  }, raw_data);
}

/**
 * Project a raw Haji API row into the shape of the `jamaah_haji` table.
 *
 * Legacy-only fields (`alamat`, `perwakilan`, `marketing`, `jenis`,
 * `status_berangkat`, `surat_pernyataan_url`) are intentionally omitted so
 * AWAPI upserts do not wipe values that the scheduled legacy enrichment fills.
 */
export function normalizeAwapiHajiRow(raw, { agentId } = {}) {
  if (!raw || !agentId) return null;
  const id_haji = safeText(raw.id_haji);
  const id_jamaah = safeText(raw.id_jamaah);
  const nama = safeText(raw.nama);
  if (!id_haji || !id_jamaah || !nama) return null;

  const tglBerangkat = safeDate(raw.tgl_berangkat);
  const paketDetail = safeText(raw.paket);

  return {
    agent_id: agentId,
    id_haji,
    id_jamaah,
    nomor_porsi: safeText(raw.nomor_porsi),
    nomor_spph: safeText(raw.nomor_spph),
    nama,
    jk: mapKelamin(raw.kelamin),
    telp: safeText(raw.hp),
    tgl_lahir: safeBirthDate(raw.tgl_lahir),
    no_paspor: safePaspor(raw.paspor_nomor),
    paspor_expired: safeDate(raw.paspor_expired),
    paket: paketDetail,
    paket_detail: paketDetail,
    paket_harga: safeBigint(raw.paket_harga),
    diskon_marketing: safeBigint(raw.diskon_marketing),
    diskon_kantor: safeBigint(raw.diskon_kantor),
    bayar: safeBigint(raw.bayar),
    sisa: safeBigint(raw.bayar_sisa),
    status_bayar: normalizeStatusBayar(raw),
    tgl_daftar: safeDate(raw.tgl_daftar),
    tgl_berangkat: tglBerangkat,
    thn_masehi: safeYear(raw.thn_berangkat_masehi) || (tglBerangkat ? tglBerangkat.slice(0, 4) : null),
    thn_hijriyah: safeYear(raw.thn_berangkat_hijriyah),
    staff: safeText(raw.staff),
    dokumen: raw.dokumen && typeof raw.dokumen === 'object' ? raw.dokumen : null,
    bpih_url: safeText(raw.dokumen_bpih),
    synced_at: new Date().toISOString(),
  };
}

export function hasSuspiciousAwapiPayment(row) {
  const bayar = safeBigint(row?.bayar);
  const sisa = safeBigint(row?.sisa ?? row?.bayar_sisa);
  return (bayar || 0) > 0 && (sisa || 0) < 0;
}

// Guard bookkeeping keys we stamp into raw_data below. They must NEVER be copied
// into a new awapi_refresh_snapshot: the incoming row's raw_data is merged with the
// existing DB raw_data (preserveLegacyUmrohRawData) before the guard runs, so the
// old snapshot would otherwise be re-embedded inside the new one on every sync —
// snapshot-in-snapshot recursion that grew raw_data unboundedly (observed up to 255
// levels / 14.7 KB per row, 83% of all jamaah raw_data bytes, 2026-06-05).
const PAYMENT_GUARD_BOOKKEEPING_KEYS = [
  'awapi_refresh_snapshot',
  'payment_guard',
  'payment_normalized',
  'payment_neutralized',
  'suspicious_awapi_payment_snapshot',
  'preserved_payment_snapshot',
];

function stripPaymentGuardBookkeeping(rawData) {
  const raw = { ...safeRawObject(rawData) };
  for (const key of PAYMENT_GUARD_BOOKKEEPING_KEYS) delete raw[key];
  return raw;
}

const AWAPI_LUNAS_STATUSES = new Set(['LUNAS', 'LEBIH BAYAR']);

/**
 * AWAPI list rows for a fully-paid multi-pax booking report `bayar` at the
 * BOOKING level (total across all pax) while `paket_harga`/`bayar_sisa` stay
 * per-pax — so bayar_sisa goes negative and bayar_status reads "LEBIH BAYAR".
 * That is a normal LUNAS signal, not corruption. The suspicious-payment guard
 * used to misread it as an anomaly and freeze the stale pre-lunas DP values
 * forever, so pelunasanReminder kept paging agents about jamaah who had already
 * paid off (false-reminder bug, 2026-06-05).
 *
 * IMPORTANT (A2/B2 refinement, 2026-06-06): "LEBIH BAYAR" + negative bayar_sisa
 * is NOT proof of lunas — the same shape appears on PARTIALLY paid multi-pax
 * bookings the moment the aggregate exceeds one pax's price (AIW0027949: 2 pax,
 * 72.8jt of 93.8jt paid, AWAPI still says LEBIH BAYAR). The earlier
 * "aggregate % paket_harga === 0" test had the same hole (k of n pax paying
 * full hits an exact multiple) and false-negatived mixed-price lunas bookings.
 * The only sound proof is booking-level: aggregate bayar >= Σ paket_harga over
 * EVERY pax in the booking — callers must pass that via `booking`
 * ({ priceTotal, paxCount, priceKnown }, see buildBookingPriceIndex). Partially
 * paid multi-pax bookings (0 < aggregate < Σ paket_harga) stay UNPROVEN here and
 * are handled by allocateAggregatePartialRow (proportional per-pax split) — they
 * must NOT be normalized to lunas (would false-lunas a booking that still owes).
 *
 * On proof, normalize to the per-pax truth: bayar = paket_harga, sisa = 0.
 * AWAPI records bayar GROSS for lunas rows — diskon is informational and never
 * deducted from bayar (verified in production 2026-06-05: 251/251 single-pax
 * LUNAS rows with diskon > 0 have bayar == paket_harga, none have
 * paket_harga - diskon), so the normalized row matches what AWAPI itself
 * reports once it switches to per-pax lunas values. Anything unprovable
 * (paket_harga missing/<= 0, incomplete price universe, aggregate below the
 * booking total) returns null and stays with the preserve guard.
 */
export function resolveAggregateBookingLunasRow(row, booking = null) {
  if (!hasSuspiciousAwapiPayment(row)) return null;

  const raw = safeRawObject(row?.raw_data);
  if (!AWAPI_LUNAS_STATUSES.has(normalizeStatusBayar(raw))) return null;

  const hargaPaket = safeBigint(raw.paket_harga) || 0;
  const aggregateBayar = safeBigint(row.bayar) || 0;
  if (hargaPaket <= 0 || aggregateBayar < hargaPaket) return null;

  const bookingPriceTotal = safeBigint(booking?.priceTotal) || 0;
  if (!booking?.priceKnown || bookingPriceTotal <= 0) return null;
  if (aggregateBayar < bookingPriceTotal) return null;

  return {
    ...row,
    bayar: hargaPaket,
    sisa: 0,
    raw_data: {
      ...stripPaymentGuardBookkeeping(raw),
      payment_normalized: {
        reason: 'aggregate_booking_lunas',
        awapi_bayar: aggregateBayar,
        awapi_sisa: safeBigint(row.sisa ?? raw.bayar_sisa) || 0,
        paket_harga: hargaPaket,
        booking_price_total: bookingPriceTotal,
        booking_pax: booking?.paxCount ?? null,
      },
    },
  };
}

/**
 * Partially-paid multi-pax aggregate booking allocator.
 *
 * When a booking is paid but NOT in full (0 < aggregate < Σ paket_harga), AWAPI
 * still reports the booking-level lump `bayar` replicated on every pax row, with
 * per-pax paket_harga → negative bayar_sisa / "LEBIH BAYAR". AWAPI carries NO
 * per-pax allocation, so we cannot know which individuals paid. The old guard
 * neutralized these rows to bayar=0 (hiding real payment → paid jamaah shown
 * belum-bayar, the Yulianti Kusuma report 2026-06-23) OR left stale values
 * (unpaid jamaah shown lunas). Both are wrong; the only money-conserving,
 * false-lunas-PROOF representation is to split the aggregate proportionally per
 * pax, capped at paket:
 *
 *   bayar_pax = min(paket_pax, floor(pot * paket_pax / target))
 *   sisa_pax  = paket_pax - bayar_pax
 *
 * where pot = aggregate - Σ(paket of manual-confirmed-lunas siblings) and
 * target = Σpaket - Σ(paket of those siblings), so an agent's per-pax "this one
 * is lunas" truth removes its paket from the unknown remainder and the rest stay
 * conserved. Because pot < target whenever the booking is partial, the floor can
 * never reach paket → sisa_pax is ALWAYS > 0: proportional NEVER fabricates a
 * per-pax lunas. Booking outstanding stays exact because we DO NOT touch
 * raw_data.bayar_sisa (stays negative) — collapseBookingOutstanding still detects
 * the aggregate shape and prices the booking via Σpaket - aggregate ONCE.
 *
 * Eligibility (mirrors provenAggregateOutstanding, lib/booking-outstanding.js):
 * suspicious shape + AWAPI lunas status + priceKnown + priceTotal>0 + this row's
 * paket>0 + 0 < aggregate < priceTotal + the booking is a SINGLE uniform aggregate
 * (distinctAggregateCount === 1). Multi-subgroup (independent sub-bookings sharing
 * one id_umroh), price-unknown, and paket<=0 companions return null and fall
 * through to the conservative preserve/neutralize guard.
 *
 * Idempotent: always recomputes from the raw aggregate/paket, never from a prior
 * allocated bayar, so re-syncs don't drift (jamaah-upsert byte-diff churn / the
 * Disk-IO 522 incident).
 */
export function allocateAggregatePartialRow(row, booking = null) {
  if (!hasSuspiciousAwapiPayment(row)) return null;

  const raw = safeRawObject(row?.raw_data);
  if (!AWAPI_LUNAS_STATUSES.has(normalizeStatusBayar(raw))) return null;

  const hargaPaket = safeBigint(raw.paket_harga) || 0;
  if (hargaPaket <= 0) return null;
  const aggregateBayar = safeBigint(row.bayar) || 0;
  if (aggregateBayar <= 0) return null;

  const bookingPriceTotal = safeBigint(booking?.priceTotal) || 0;
  if (!booking?.priceKnown || bookingPriceTotal <= 0) return null;
  // Full-paid is resolveAggregateBookingLunasRow's job; only PARTIAL bookings here.
  if (aggregateBayar >= bookingPriceTotal) return null;
  // Uniform single aggregate only — never proportional across sub-bookings.
  if (booking?.distinctAggregateCount !== 1) return null;

  const pinnedPaketTotal = safeBigint(booking?.pinnedPaketTotal) || 0;
  const target = bookingPriceTotal - pinnedPaketTotal;
  const pot = aggregateBayar - pinnedPaketTotal;
  // Manual-confirmed siblings consumed the whole pot → nothing left for this pax;
  // leave it to the guard rather than allocate from a non-positive remainder.
  if (target <= 0 || pot <= 0) return null;

  const allocated = Math.min(hargaPaket, Math.floor((pot * hargaPaket) / target));
  const sisa = hargaPaket - allocated;
  // Defensive: a partial booking must never yield a per-pax lunas (sisa<=0).
  if (allocated <= 0 || sisa <= 0) return null;

  const payment_normalized = {
    reason: 'aggregate_booking_partial_allocated',
    awapi_bayar: aggregateBayar,
    awapi_sisa: safeBigint(row.sisa ?? raw.bayar_sisa) || 0,
    paket_harga: hargaPaket,
    allocated_bayar: allocated,
    allocated_sisa: sisa,
    booking_price_total: bookingPriceTotal,
    booking_pax: booking?.paxCount ?? null,
  };
  if (pinnedPaketTotal > 0) payment_normalized.booking_pinned_paket_total = pinnedPaketTotal;

  return {
    ...row,
    bayar: allocated,
    sisa,
    raw_data: {
      ...stripPaymentGuardBookkeeping(raw),
      payment_guard: 'allocated_partial_after_awapi_anomaly',
      payment_normalized,
    },
  };
}

function suspiciousAwapiPaymentSnapshot(row) {
  const rowRaw = safeRawObject(row?.raw_data);
  return {
    bayar: safeBigint(row?.bayar) || 0,
    sisa: safeBigint(row?.sisa ?? rowRaw.bayar_sisa) || 0,
    diskon_kantor: safeBigint(row?.diskon_kantor ?? rowRaw.diskon_kantor) || 0,
    diskon_marketing: safeBigint(row?.diskon_marketing ?? rowRaw.diskon_marketing) || 0,
  };
}

export function guardNewSuspiciousAwapiPaymentRow(row) {
  if (!hasSuspiciousAwapiPayment(row)) return row;

  const rowRaw = safeRawObject(row?.raw_data);
  const paketHarga = safeBigint(rowRaw.paket_harga) || 0;
  const conservativeSisa = Math.max(0, paketHarga);
  const neutralizedPayment = {
    bayar: 0,
    sisa: conservativeSisa,
    diskon_kantor: safeBigint(row?.diskon_kantor ?? rowRaw.diskon_kantor) || 0,
    diskon_marketing: safeBigint(row?.diskon_marketing ?? rowRaw.diskon_marketing) || 0,
  };

  return {
    ...row,
    ...neutralizedPayment,
    raw_data: {
      ...stripPaymentGuardBookkeeping(rowRaw),
      awapi_refresh_snapshot: stripPaymentGuardBookkeeping(rowRaw),
      payment_guard: 'neutralized_new_after_awapi_anomaly',
      suspicious_awapi_payment_snapshot: suspiciousAwapiPaymentSnapshot(row),
      payment_neutralized: {
        reason: 'new_row_after_awapi_anomaly',
        ...neutralizedPayment,
      },
    },
  };
}

/**
 * Build the per-booking price universe resolveAggregateBookingLunasRow needs:
 * Map<id_umroh, { priceTotal, paxCount, priceKnown }>.
 *
 * The pax universe is the union of the sync payload rows and the agent's
 * existing DB rows for the booking, keyed by jm_id (fallback nama) — single
 * jamaah refresh payloads carry only one row of a multi-pax booking, and
 * payload rows cover pax the DB blocked as ghosts. Per-pax price comes from
 * the row's raw paket_harga (payload preferred, DB fallback); any pax without
 * a resolvable price marks the booking priceKnown=false so the resolver
 * leaves it to the guard instead of normalizing on an undercounted total.
 */
export function buildBookingPriceIndex(payloadRows, existingRows = []) {
  const bookings = new Map();

  const paxKey = (row) => {
    const jmId = String(row?.jm_id || '').trim().toLowerCase();
    if (jmId) return `jm:${jmId}`;
    const nama = String(row?.nama || '').trim().toLowerCase();
    return nama ? `nm:${nama}` : null;
  };

  const addRow = (row) => {
    const idUmroh = String(row?.id_umroh || '').trim();
    if (!idUmroh) return;
    const key = paxKey(row);
    if (!key) return;

    let entry = bookings.get(idUmroh);
    if (!entry) {
      entry = { prices: new Map(), aggregateValues: new Set(), pinnedPaket: new Map() };
      bookings.set(idUmroh, entry);
    }

    const raw = safeRawObject(row?.raw_data);
    // Aggregate fingerprint: the distinct raw `bayar` values seen on the booking's
    // LEBIH-BAYAR (aggregate-shape) rows. allocateAggregatePartialRow only fires when
    // exactly ONE distinct value spans the booking (uniform single aggregate); >1
    // means multiple independent sub-bookings share this id_umroh (group departure)
    // and proportional-over-all-pax would smear one sub-booking's payment across
    // unrelated pax — mirror of lib/booking-outstanding.js provenAggregateOutstanding.
    const rawBayar = safeBigint(raw.bayar);
    const rawSisa = safeBigint(raw.bayar_sisa);
    if (rawBayar !== null && rawBayar > 0 && rawSisa !== null && rawSisa < 0) {
      entry.aggregateValues.add(rawBayar);
    }
    // Manual-confirmed-lunas pax remove their paket from the partial-allocation pot
    // so a re-sync of their siblings stays money-conserving (the agent's per-pax
    // truth takes that paket out of the unknown remainder). Keyed by pax so a pax
    // appearing in both payload and DB is counted once.
    if (hasTrustedManualPaymentGuard(row)) {
      entry.pinnedPaket.set(key, safeBigint(raw.paket_harga) || 0);
    }

    const price = safeBigint(raw.paket_harga) || 0;
    const known = price > 0;
    const current = entry.prices.get(key);
    // First resolvable price wins; payload rows are added before DB rows, so a
    // fresh payload price beats the DB fallback, while a DB price still fills
    // pax whose payload row (or absence) left the price unknown.
    if (current && (current.known || !known)) return;
    entry.prices.set(key, { price, known });
  };

  for (const row of Array.isArray(payloadRows) ? payloadRows : []) addRow(row);
  for (const row of Array.isArray(existingRows) ? existingRows : []) addRow(row);

  const index = new Map();
  for (const [idUmroh, entry] of bookings) {
    let priceTotal = 0;
    let priceKnown = true;
    for (const { price, known } of entry.prices.values()) {
      if (!known) priceKnown = false;
      priceTotal += price;
    }
    let pinnedPaketTotal = 0;
    for (const paket of entry.pinnedPaket.values()) pinnedPaketTotal += paket;
    const booking = {
      priceTotal,
      paxCount: entry.prices.size,
      priceKnown,
      distinctAggregateCount: entry.aggregateValues.size,
    };
    if (pinnedPaketTotal > 0) booking.pinnedPaketTotal = pinnedPaketTotal;
    index.set(idUmroh, booking);
  }
  return index;
}

export function hasTrustedManualPaymentGuard(row) {
  const raw = safeRawObject(row?.raw_data);
  return raw.payment_guard === 'manual_departure_date_refresh_keep_awapi_payment'
    || raw.payment_guard === 'manual_confirmed_lunas_after_awapi_anomaly';
}

export function preserveExistingPaymentForSuspiciousAwapiRow(row, existing) {
  if (!hasSuspiciousAwapiPayment(row)) return row;
  if (!existing) return null;
  if (hasSuspiciousAwapiPayment(existing) && !hasTrustedManualPaymentGuard(existing)) return null;

  const preservedPayment = {
    bayar: safeBigint(existing.bayar) || 0,
    sisa: safeBigint(existing.sisa) || 0,
    diskon_kantor: safeBigint(existing.diskon_kantor) || 0,
    diskon_marketing: safeBigint(existing.diskon_marketing) || 0,
  };
  const rowRaw = row?.raw_data && typeof row.raw_data === 'object' ? row.raw_data : {};
  const existingRaw = safeRawObject(existing?.raw_data);
  const preservedRaw = preserveLegacyUmrohRawData(row, existing)?.raw_data || {};
  if (existingRaw.payment_source) preservedRaw.payment_source = existingRaw.payment_source;
  if (existingRaw.payment_synced_at) preservedRaw.payment_synced_at = existingRaw.payment_synced_at;

  // A manually-confirmed-LUNAS pax is authoritative: keep its trusted guard marker
  // (and audit fields) STICKY across syncs, otherwise the next sync would relabel it
  // 'preserved_existing_after_awapi_anomaly', lose hasTrustedManualPaymentGuard
  // protection, and stop excluding the pax from sibling partial-allocation. (The
  // other trusted guard, manual_departure_date_refresh_keep_awapi_payment, is a
  // one-shot keep-AWAPI-payment marker and intentionally relabels.)
  const isManualConfirmedLunas = existingRaw.payment_guard === 'manual_confirmed_lunas_after_awapi_anomaly';
  const manualAudit = {};
  if (isManualConfirmedLunas) {
    if (existingRaw.manual_confirmed_by) manualAudit.manual_confirmed_by = existingRaw.manual_confirmed_by;
    if (existingRaw.manual_confirmed_at) manualAudit.manual_confirmed_at = existingRaw.manual_confirmed_at;
  }

  return {
    ...row,
    ...preservedPayment,
    raw_data: {
      ...preservedRaw,
      awapi_refresh_snapshot: stripPaymentGuardBookkeeping(rowRaw),
      payment_guard: isManualConfirmedLunas ? existingRaw.payment_guard : 'preserved_existing_after_awapi_anomaly',
      ...manualAudit,
      suspicious_awapi_payment_snapshot: suspiciousAwapiPaymentSnapshot(row),
      preserved_payment_snapshot: preservedPayment,
    },
  };
}

export { AwapiError };
