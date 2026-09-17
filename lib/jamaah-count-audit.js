// Jamaah count audit: compares an agent's jamaah rows in the DB against the
// COMPLETE AWAPI lists, independently of the sync code path. Catches every way a
// count can silently go wrong — rows the sync never inserted (hjmia 1447 backfill
// gap), stale rows it never removed (vikha +29 held back by the old 30% guard),
// rows filed under the wrong Hijri year, and agents whose API access broke
// (403 "Invalid or inactive User."). Born from the 2026-09-17 incident, when a
// silently truncated list endpoint deleted 101 jamaah before anyone noticed.
//
// Consumers: telegram-notifier.js (daily ops alert) and
// scripts/audit-jamaah-counts.mjs (manual CLI). IO is injected; the comparison
// functions are pure.

// Upstream rows registered this recently may simply not be synced yet.
export const AUDIT_RECENT_REGISTRATION_GRACE_MS = 3 * 60 * 60 * 1000;

const lower = (v) => String(v ?? '').trim().toLowerCase();

function isRecentRegistration(tglDaftar, now, graceMs) {
  if (!tglDaftar) return false;
  const ts = Date.parse(String(tglDaftar).replace(' ', 'T') + (String(tglDaftar).length <= 10 ? 'T00:00:00+07:00' : '+07:00'));
  return Number.isFinite(ts) && now - ts < graceMs;
}

// upstreamRows: raw AWAPI umroh rows (bh+dh of every audited year, duplicates fine)
// dbRows: { id, id_umroh, jm_id, nama, hijriah_year }
export function compareUmrohRows({
  upstreamRows,
  dbRows,
  normalize,
  hijriahYearOf,
  years,
  listYearOf = () => null,
  now = Date.now(),
  graceMs = AUDIT_RECENT_REGISTRATION_GRACE_MS,
}) {
  const yearSet = new Set(years.map(String));
  const expected = new Map();
  let unsyncable = 0;
  for (const raw of upstreamRows) {
    const norm = normalize(raw);
    const jm = String(norm?.jm_id || '').trim();
    if (!norm || !/^JM/i.test(jm) || jm.startsWith('__')) { unsyncable++; continue; }
    const yr = hijriahYearOf(norm.tgl_berangkat) || listYearOf(raw);
    if (!yr || !yearSet.has(String(yr))) continue;
    expected.set(lower(`${norm.id_umroh}_${norm.jm_id}`), {
      yr: String(yr), id_umroh: norm.id_umroh, jm_id: norm.jm_id, nama: norm.nama, tgl_daftar: raw?.tgl_daftar || null,
    });
  }

  const dbByKey = new Map(dbRows.map(row => [lower(`${row.id_umroh}_${row.jm_id}`), row]));
  const perYear = {};
  const stat = (yr) => (perYear[yr] ??= { upstream: 0, db: 0, missing: 0, extra: 0, wrongYear: 0 });
  const missing = [];
  const extra = [];
  const wrongYear = [];

  for (const [key, exp] of expected) {
    stat(exp.yr).upstream++;
    const db = dbByKey.get(key);
    if (!db) {
      if (isRecentRegistration(exp.tgl_daftar, now, graceMs)) continue;
      stat(exp.yr).missing++;
      missing.push(exp);
    } else if (String(db.hijriah_year) !== exp.yr) {
      stat(exp.yr).wrongYear++;
      wrongYear.push({ ...exp, dbYear: db.hijriah_year });
    }
  }
  for (const [key, db] of dbByKey) {
    const yr = String(db.hijriah_year);
    if (!yearSet.has(yr)) continue;
    stat(yr).db++;
    if (!expected.has(key)) {
      stat(yr).extra++;
      extra.push({ id_umroh: db.id_umroh, jm_id: db.jm_id, nama: db.nama, yr });
    }
  }
  return { perYear, missing, extra, wrongYear, unsyncable };
}

// upstreamRows: raw AWAPI haji rows from bm/0 (every haji jamaah of the agent)
// dbRows: { id_haji, id_jamaah, nama }
export function compareHajiRows({ upstreamRows, dbRows, normalize, now = Date.now(), graceMs = AUDIT_RECENT_REGISTRATION_GRACE_MS }) {
  const expected = new Map();
  for (const raw of upstreamRows) {
    const norm = normalize(raw);
    if (!norm) continue;
    expected.set(lower(`${norm.id_haji}_${norm.id_jamaah}`), { id_haji: norm.id_haji, id_jamaah: norm.id_jamaah, nama: norm.nama, tgl_daftar: raw?.tgl_daftar || null });
  }
  const dbKeys = new Set(dbRows.map(row => lower(`${row.id_haji}_${row.id_jamaah}`)));
  const missing = [...expected]
    .filter(([key, exp]) => !dbKeys.has(key) && !isRecentRegistration(exp.tgl_daftar, now, graceMs))
    .map(([, exp]) => exp);
  const extra = dbRows
    .filter(row => !expected.has(lower(`${row.id_haji}_${row.id_jamaah}`)))
    .map(row => ({ id_haji: row.id_haji, id_jamaah: row.id_jamaah, nama: row.nama }));
  return { upstream: expected.size, db: dbRows.length, missing, extra };
}

// api: { umrohByKeberangkatan, umrohByPendaftaran, hajiAll } — each (agent, opts) => { rows }
// loadDbRows: (table, columns, agentId) => every row — use lib/fetch-all-rows.js,
// whose stable ordering keeps >1000-row reads from skipping rows (nikita, 1172
// rows, once read back as 163 phantom "missing").
export async function auditAgentJamaah(agent, { api, loadDbRows, normalizeUmroh, normalizeHaji, hijriahYearOf, years, now = Date.now() }) {
  const result = { slug: agent.slug, errors: [] };

  const umrohRows = [];
  const listYear = new WeakMap();
  let umrohComplete = true;
  for (const year of years) {
    for (const [endpoint, fetchList] of [['bh', api.umrohByKeberangkatan], ['dh', api.umrohByPendaftaran]]) {
      try {
        const { rows } = await fetchList(agent, { tahun: year, hijriah: true });
        for (const row of rows) { listYear.set(row, String(year)); umrohRows.push(row); }
      } catch (err) {
        umrohComplete = false;
        result.errors.push(`umroh ${endpoint}/${year}: ${err.message}`);
      }
    }
  }
  if (umrohComplete) {
    const dbRows = await loadDbRows('jamaah', 'id, id_umroh, jm_id, nama, hijriah_year', agent.id);
    result.umroh = compareUmrohRows({
      upstreamRows: umrohRows,
      dbRows,
      normalize: raw => normalizeUmroh(raw, agent),
      hijriahYearOf,
      listYearOf: raw => listYear.get(raw) || null,
      years,
      now,
    });
  }

  try {
    const { rows } = await api.hajiAll(agent);
    const dbRows = await loadDbRows('jamaah_haji', 'id_haji, id_jamaah, nama', agent.id);
    result.haji = compareHajiRows({ upstreamRows: rows, dbRows, normalize: raw => normalizeHaji(raw, agent), now });
  } catch (err) {
    result.errors.push(`haji bm/0: ${err.message}`);
  }
  return result;
}

export function auditProblemCount(result) {
  const u = result.umroh;
  const h = result.haji;
  return (result.errors?.length || 0)
    + (u ? u.missing.length + u.extra.length + u.wrongYear.length : 0)
    + (h ? h.missing.length + h.extra.length : 0);
}

// Keep only discrepancies seen in BOTH passes (the second pass runs after a sync
// cycle), so a registration or cancellation landing mid-audit is not reported.
export function confirmAuditAcrossPasses(first, second) {
  const keysOf = (items, fields) => new Set((items || []).map(item => fields.map(f => lower(item[f])).join('|')));
  const keep = (a, b, fields) => {
    if (!a || !b) return [];
    const seen = keysOf(b, fields);
    return a.filter(item => seen.has(fields.map(f => lower(item[f])).join('|')));
  };
  const confirmed = { slug: first.slug, errors: (first.errors || []).filter(err => (second.errors || []).some(e2 => e2.split(':')[0] === err.split(':')[0])) };
  if (first.umroh && second.umroh) {
    const missing = keep(first.umroh.missing, second.umroh.missing, ['id_umroh', 'jm_id']);
    const extra = keep(first.umroh.extra, second.umroh.extra, ['id_umroh', 'jm_id']);
    const wrongYear = keep(first.umroh.wrongYear, second.umroh.wrongYear, ['id_umroh', 'jm_id', 'yr']);
    // Per-year discrepancy counts must describe the confirmed rows only.
    const perYear = {};
    for (const [yr, stats] of Object.entries(second.umroh.perYear || {})) perYear[yr] = { ...stats, missing: 0, extra: 0, wrongYear: 0 };
    const bump = (item, field) => { (perYear[item.yr] ??= { upstream: 0, db: 0, missing: 0, extra: 0, wrongYear: 0 })[field]++; };
    missing.forEach(item => bump(item, 'missing'));
    extra.forEach(item => bump(item, 'extra'));
    wrongYear.forEach(item => bump(item, 'wrongYear'));
    confirmed.umroh = { ...second.umroh, perYear, missing, extra, wrongYear };
  }
  if (first.haji && second.haji) {
    confirmed.haji = {
      ...second.haji,
      missing: keep(first.haji.missing, second.haji.missing, ['id_haji', 'id_jamaah']),
      extra: keep(first.haji.extra, second.haji.extra, ['id_haji', 'id_jamaah']),
    };
  }
  return confirmed;
}

export function auditSignature(results) {
  return results
    .filter(r => auditProblemCount(r) > 0)
    .map(r => {
      const u = r.umroh;
      const h = r.haji;
      return `${r.slug}:${r.errors.length ? 'err' : ''}:${u ? `${u.missing.length}/${u.extra.length}/${u.wrongYear.length}` : '-'}:${h ? `${h.missing.length}/${h.extra.length}` : '-'}`;
    })
    .sort()
    .join(',');
}

const escHtml = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function formatAuditAlert(results, { frozenYears = [], confirmedTwice = true } = {}) {
  const problems = results.filter(r => auditProblemCount(r) > 0);
  if (problems.length === 0) return null;
  const frozen = new Set(frozenYears.map(String));
  const lines = problems.map(r => {
    const parts = [];
    if (r.errors.length) {
      const inactive = r.errors.some(e => /403/.test(e));
      parts.push(inactive ? 'API Alhijaz menolak akun (403)' : `API error: ${escHtml(r.errors[0])}`);
    }
    const u = r.umroh;
    if (u) {
      const years = Object.entries(u.perYear)
        .filter(([, s]) => s.missing || s.extra || s.wrongYear)
        .map(([y, s]) => {
          const bits = [s.missing ? `${s.missing} tak masuk DB` : '', s.extra ? `${s.extra} basi di DB` : '', s.wrongYear ? `${s.wrongYear} salah tahun` : ''].filter(Boolean).join(', ');
          return `${y}${frozen.has(y) ? ' (beku)' : ''}: ${bits} (Alhijaz ${s.upstream} vs DB ${s.db})`;
        });
      if (years.length) parts.push(`umroh ${years.join('; ')}`);
    }
    const h = r.haji;
    if (h && (h.missing.length || h.extra.length)) {
      parts.push(`haji: ${[h.missing.length ? `${h.missing.length} tak masuk DB` : '', h.extra.length ? `${h.extra.length} basi di DB` : ''].filter(Boolean).join(', ')} (Alhijaz ${h.upstream} vs DB ${h.db})`);
    }
    return `• <b>${escHtml(r.slug)}</b> — ${parts.join(' | ')}`;
  });
  return `🔎 <b>Audit hitungan jamaah</b>\n\n`
    + `${problems.length} agen jumlah jamaahnya di dashboard tidak sama dengan data Alhijaz${confirmedTwice ? ' (terkonfirmasi 2× berselang satu siklus sync)' : ''}:\n\n`
    + `${lines.join('\n')}\n\n`
    + `Detail per baris: <code>node scripts/audit-jamaah-counts.mjs --slug &lt;slug&gt;</code>. `
    + `Tahun beku (di luar sync otomatis) dipulihkan dengan sync terarah <code>hijriahYear</code>.`;
}
