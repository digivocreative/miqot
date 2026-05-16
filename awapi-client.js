/**
 * Alhijaz Official API client.
 *
 * Pure HTTP wrappers for the JSON endpoints exposed at:
 *   GET /jadwal/api-get/{TahunHijriah}
 *   GET /awapi/gu/{kode}/bm|bh|dm|dh/{Tahun}[/{Bulan}]
 *   GET /awapi/gu/{kode}/umrah/{IDUmrah}
 *   GET /awapi/gu/{kode}/jamaah/{IDJamaah}
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

  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new AwapiError('Upstream response is not JSON', { status: res.status, body: text.slice(0, 500) });
  }

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
  if (!v || v === PLACEHOLDER_DATE) return null;
  // Strip time portion if present ("YYYY-MM-DD HH:mm:ss" → "YYYY-MM-DD")
  const datePart = v.split(' ')[0];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return null;
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
    dokumen: raw.dokumen && typeof raw.dokumen === 'object' ? raw.dokumen : null,
    diskon_kantor: safeBigint(raw.diskon_kantor),
    diskon_marketing: safeBigint(raw.diskon_marketing),
    raw_data: raw,
    synced_at: new Date().toISOString(),
  };
}

export function hasSuspiciousAwapiPayment(row) {
  const bayar = safeBigint(row?.bayar);
  const sisa = safeBigint(row?.sisa ?? row?.bayar_sisa);
  return (bayar || 0) > 0 && (sisa || 0) < 0;
}

export function preserveExistingPaymentForSuspiciousAwapiRow(row, existing) {
  if (!hasSuspiciousAwapiPayment(row)) return row;
  if (!existing || hasSuspiciousAwapiPayment(existing)) return null;

  const preservedPayment = {
    bayar: safeBigint(existing.bayar) || 0,
    sisa: safeBigint(existing.sisa) || 0,
    diskon_kantor: safeBigint(existing.diskon_kantor) || 0,
    diskon_marketing: safeBigint(existing.diskon_marketing) || 0,
  };
  const rowRaw = row?.raw_data && typeof row.raw_data === 'object' ? row.raw_data : {};
  const existingRaw = existing?.raw_data && typeof existing.raw_data === 'object' ? existing.raw_data : {};

  return {
    ...row,
    ...preservedPayment,
    raw_data: {
      ...existingRaw,
      awapi_refresh_snapshot: rowRaw,
      payment_guard: 'preserved_existing_after_awapi_anomaly',
      suspicious_awapi_payment_snapshot: {
        bayar: safeBigint(row?.bayar) || 0,
        sisa: safeBigint(row?.sisa ?? rowRaw.bayar_sisa) || 0,
        diskon_kantor: safeBigint(row?.diskon_kantor ?? rowRaw.diskon_kantor) || 0,
        diskon_marketing: safeBigint(row?.diskon_marketing ?? rowRaw.diskon_marketing) || 0,
      },
      preserved_payment_snapshot: preservedPayment,
    },
  };
}

export { AwapiError };
