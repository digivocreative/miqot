/**
 * Calendar API — Scrape calendar events from the public Alhijaz kegiatan page
 *
 * Fetches Manasik/Keberangkatan/Kepulangan events from:
 * https://alhijazindowisata.com/jadwal/kegiatan/alhijaz-indowisata
 *
 * The public page embeds FullCalendar events inline and loads detail tables
 * from /jadwal/_kmodal.php?.m={aid}&.g={apalah}. No legacy login or calendar
 * credential is required for Dashboard calendar ingestion.
 */

import { PDFParse } from 'pdf-parse';
import { matchEventToSchedule, findSiblingKeberangkatan, tokenizeName, overlapScore } from './lib/calendar-jadwal-match.js';
import { buildScheduleFallbackDetails, parseCalendarJadwalIds } from './lib/calendar-schedule-fallback.js';
import {
  CALENDAR_PUBLIC_READER_BASE_URL,
  CALENDAR_PUBLIC_READER_MIN_INTERVAL_MS,
  fetchPublicCalendarEvents,
  fetchPublicEventDetail,
  fetchPublicEventDetailFromReader,
} from './lib/calendar-public-source.js';
import { validatePublicCalendarSnapshot } from './lib/calendar-public-snapshot.js';
import {
  extractDepartureMeetingInfoFromItinerary,
  extractDepartureMeetingInfoFromText,
  needsDepartureMeetingEnrichment,
} from './lib/calendar-meeting-point.js';

export { validatePublicCalendarSnapshot } from './lib/calendar-public-snapshot.js';

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

// Origin publik me-rate-limit bila volume modal terlalu tinggi dalam
// satu jendela — sync penuh (~122 modal) di concurrency 6 menolak ~37 modal,
// nyaris semua kepulangan (tab "Pulang" jadi tanpa TL). Concurrency 2 = 0 ditolak
// (terverifikasi 20 Jun 2026 atas 45 modal kepulangan). Naikkan via env hanya
// kalau origin sudah melonggarkan limit.
const CALENDAR_PUBLIC_DETAIL_CONCURRENCY = parsePositiveInt(
  process.env.CALENDAR_PUBLIC_DETAIL_CONCURRENCY,
  2
);
const CALENDAR_PUBLIC_FALLBACK_DETAIL_CONCURRENCY = parsePositiveInt(
  process.env.CALENDAR_PUBLIC_FALLBACK_DETAIL_CONCURRENCY,
  1,
);
const CALENDAR_PUBLIC_MUTAWIF_READER_DAYS = parsePositiveInt(
  process.env.CALENDAR_PUBLIC_MUTAWIF_READER_DAYS,
  180,
);
// Dibaca saat dipakai, bukan saat modul dimuat: ambang ini perlu bisa diubah
// tanpa restart, dan tes tidak bisa menguji pagarnya kalau nilainya membeku
// pada impor pertama.
function maxStaleDeleteRatio() {
  const parsed = Number.parseFloat(
    process.env.CALENDAR_PUBLIC_MAX_STALE_DELETE_RATIO || '0.25',
  );
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : 0.25;
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index], index);
    }
  }

  const workerCount = Math.min(concurrency, items.length);
  await Promise.all(Array.from({ length: workerCount }, worker));
  return results;
}

async function loadScheduleFallbackMap(supabase, events) {
  const ids = [...new Set(events.flatMap(ev => parseCalendarJadwalIds(ev.apalah)))];
  if (ids.length === 0) return new Map();

  const { data, error } = await supabase
    .from('umroh_schedules')
    .select([
      'jadwal_id',
      'jadwal_nama',
      'seat_total',
      'seat_sisa',
      'maskapai',
      'berangkat_tgl',
      'berangkat_jam',
      'berangkat_rute',
      'berangkat_kode_penerbangan',
      'pulang_tgl',
      'pulang_jam',
      'pulang_rute',
      'pulang_kode_penerbangan',
      'manasik_tgl',
      'manasik_jam',
    ].join(','))
    .in('jadwal_id', ids);

  if (error) {
    console.error('[Calendar] Schedule fallback query error:', error.message);
    return new Map();
  }

  return new Map((data || []).map(row => [row.jadwal_id, row]));
}

function jakartaDateString(date) {
  return new Date(date.getTime() + (7 * 60 * 60 * 1000)).toISOString().slice(0, 10);
}

function addIsoDateDays(isoDate, days) {
  const value = new Date(`${isoDate}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function withMutawifSourceAvailable(row) {
  Object.defineProperty(row, '_mutawifSourceAvailable', {
    value: true,
    enumerable: false,
  });
  return row;
}

export function isMeaningfulMutawif(value) {
  return String(value || '')
    .split(/[•·]/)
    .some(name => {
      const normalized = name.trim();
      return normalized !== '-' && /[\p{L}\p{N}]/u.test(normalized);
    });
}

export function mergeMutawifReaderDetails(details, readerDetails) {
  const readerByGroup = new Map(
    (readerDetails || [])
      .filter(row => row?._mutawifSourceAvailable === true && row.group_number)
      .map(row => [String(row.group_number), row]),
  );
  let rowsUpdated = 0;
  const rows = (details || []).map(detail => {
    const current = readerByGroup.get(String(detail?.group_number || ''));
    if (!current) return detail;
    rowsUpdated += 1;
    return withMutawifSourceAvailable({
      ...detail,
      mutawif: current.mutawif || '-',
    });
  });
  return { rows, rowsUpdated };
}

function eventCanUseMutawifReader(event, options) {
  return Boolean(
    options.readerBaseUrl
      && event?.type === 'keberangkatan'
      && event?.date >= options.readerRangeStart
      && event?.date <= options.readerRangeEnd,
  );
}

// Tabel detail publik kadang memuat GROUP yang sama dua kali (5 Sep 2026:
// grup 33 tampil kembar identik di modal berangkat & pulang). Karena `id`
// diturunkan dari GROUP, dua baris itu bertabrakan dalam satu perintah upsert
// dan Postgres menolak seluruh batch ("ON CONFLICT DO UPDATE command cannot
// affect row a second time"). Simpan kemunculan pertama; baris kedua yang
// isinya berbeda dicatat agar terlihat, tetapi tidak boleh menggagalkan sync.
export function dedupeDetailRowsById(event, rows) {
  const seen = new Map();
  for (const row of rows) {
    const first = seen.get(row.id);
    if (!first) {
      seen.set(row.id, row);
      continue;
    }
    const identical = JSON.stringify(first.raw_data) === JSON.stringify(row.raw_data);
    console.warn(
      `[Calendar] Baris kembar ${row.id} dari detail publik ${event.date}/${event.type} `
      + `(${identical ? 'identik' : 'BERBEDA isi'}) — kemunculan pertama dipakai`,
    );
  }
  return [...seen.values()];
}

async function resolvePublicEventRows(event, scheduleFallbackById, forceFallback, readerOptions) {
  const eventKey = `${event.date}_${event.type}`;
  let details;

  try {
    details = await fetchPublicEventDetail(event, fetch, { forceFallback });
  } catch (err) {
    console.warn(`[Calendar] ${err.message} — baris lama event ini dipertahankan`);
    return {
      rows: [],
      eventKey,
      authoritative: false,
      failedKey: eventKey,
      fallbackUsed: 0,
      emptyDetails: 0,
      detailUsesFallback: false,
      mutawifReaderEvents: 0,
      mutawifReaderRows: 0,
      mutawifReaderFailures: 0,
    };
  }

  const detailUsesFallback = details._calendarSource === 'fallback';
  let mutawifReaderEvents = 0;
  let mutawifReaderRows = 0;
  let mutawifReaderFailures = 0;
  const detailNeedsMutawif = details.length === 0
    || details.some(detail => detail._mutawifSourceAvailable !== true);
  if (detailUsesFallback && detailNeedsMutawif && eventCanUseMutawifReader(event, readerOptions)) {
    try {
      const readerDetails = await fetchPublicEventDetailFromReader(event, fetch, {
        readerBaseUrl: readerOptions.readerBaseUrl,
        minimumIntervalMs: readerOptions.readerMinimumIntervalMs,
      });
      if (details.length === 0) {
        details = readerDetails;
        mutawifReaderRows = readerDetails.length;
      } else {
        const expectedRows = details.filter(detail => detail?.group_number).length;
        const merged = mergeMutawifReaderDetails(details, readerDetails);
        details = merged.rows;
        mutawifReaderRows = merged.rowsUpdated;
        if (merged.rowsUpdated < expectedRows) {
          throw new Error(
            `hanya ${merged.rowsUpdated}/${expectedRows} GROUP cocok dengan detail fallback`,
          );
        }
      }
      if (mutawifReaderRows > 0) mutawifReaderEvents = 1;
    } catch (err) {
      mutawifReaderFailures = 1;
      console.warn(`[Calendar] Reader MUTAWIF gagal utk ${event.date}/${event.type}: ${err.message}`);
    }
  }

  let fallbackUsed = 0;
  let emptyDetails = 0;
  if (details.length === 0) {
    const fallback = buildScheduleFallbackDetails(event, scheduleFallbackById);
    if (fallback.length > 0) {
      details = fallback;
      fallbackUsed = 1;
    } else {
      // Detail kosong dari modal publik berarti detail tidak bisa dipercaya.
      // Jangan tulis placeholder _0 karena itu akan menghapus baris detail lama.
      emptyDetails = 1;
      console.warn(`[Calendar] Detail kosong utk ${event.date}/${event.type} dan fallback jadwal tidak lengkap — baris lama dipertahankan`);
      return {
        rows: [],
        eventKey,
        authoritative: false,
        failedKey: eventKey,
        fallbackUsed,
        emptyDetails,
        detailUsesFallback,
        mutawifReaderEvents,
        mutawifReaderRows,
        mutawifReaderFailures,
      };
    }
  }

  const rows = dedupeDetailRowsById(event, details.map((detail, idx) => {
    const rowKey = detail.jadwal_id || detail.group_number || `row${idx + 1}`;
    const id = `${event.date}_${event.type}_${rowKey}`;
    const detailData = { ...detail };
    const mutawifSourceAvailable = detail._mutawifSourceAvailable === true;
    const mutawifSourceValid = isMeaningfulMutawif(detail.mutawif);
    return {
      id,
      event_date: event.date,
      event_type: event.type,
      ...detailData,
      raw_data: detailData,
      // Data valid tidak boleh turun menjadi placeholder hanya karena sumber
      // sesaat mengosongkan nama. Flag regresi dibuang sebelum upsert.
      _preserve_mutawif: !mutawifSourceAvailable || !mutawifSourceValid,
      _mutawif_regression_candidate: mutawifSourceAvailable && !mutawifSourceValid,
      synced_at: new Date().toISOString(),
    };
  }));

  return {
    rows,
    eventKey,
    // `detailUsesFallback` sengaja TIDAK ikut menentukan: itu soal rute, bukan
    // mutu data. Origin fallback menyajikan isi yang sama lewat IP.
    authoritative: rows.length > 0 && fallbackUsed === 0 && emptyDetails === 0,
    failedKey: null,
    fallbackUsed,
    emptyDetails,
    detailUsesFallback,
    mutawifReaderEvents,
    mutawifReaderRows,
    mutawifReaderFailures,
  };
}

function isMissingMutawifColumnError(error) {
  const message = `${error?.code || ''} ${error?.message || ''} ${error?.details || ''}`;
  return /mutawif/i.test(message) && /(column|schema cache|pgrst204)/i.test(message);
}

async function upsertCalendarBatch(supabase, batch) {
  let result = await supabase
    .from('calendar_events')
    .upsert(batch, { onConflict: 'id' });

  // Deployment kode dapat mendahului eksekusi migration SQL. Jangan biarkan
  // seluruh sync gagal: MUTAWIF tetap tersimpan terpisah di raw_data.mutawif,
  // lalu kolom top-level otomatis dipakai setelah migration tersedia.
  if (isMissingMutawifColumnError(result.error)) {
    const compatibleBatch = batch.map(({ mutawif: _mutawif, ...row }) => row);
    result = await supabase
      .from('calendar_events')
      .upsert(compatibleBatch, { onConflict: 'id' });
    if (!result.error) {
      console.warn('[Calendar] Kolom mutawif belum tersedia; nilai disimpan sementara di raw_data.mutawif');
    }
  }

  return result;
}

const CALENDAR_STALE_CANDIDATES_ID = 'calendar_stale_candidates';

async function loadCalendarStaleCandidates(supabase) {
  const { data, error } = await supabase
    .from('calendar_insights')
    .select('data')
    .eq('id', CALENDAR_STALE_CANDIDATES_ID)
    .maybeSingle();
  if (error) return { ids: new Set(), error };
  const ids = Array.isArray(data?.data?.ids) ? data.data.ids : [];
  return { ids: new Set(ids), error: null };
}

async function saveCalendarStaleCandidates(supabase, ids) {
  const { error } = await supabase.from('calendar_insights').upsert({
    id: CALENDAR_STALE_CANDIDATES_ID,
    data: {
      ids: [...ids],
      observed_at: new Date().toISOString(),
    },
  }, { onConflict: 'id' });
  return error || null;
}

// ── Main sync function ──
export async function syncCalendar(supabase, options = {}) {
  console.log('[Calendar] Starting sync...');

  const now = options.now instanceof Date ? options.now : new Date();
  const readerBaseUrl = options.readerBaseUrl ?? CALENDAR_PUBLIC_READER_BASE_URL;
  const readerMinimumIntervalMs = options.readerMinimumIntervalMs
    ?? CALENDAR_PUBLIC_READER_MIN_INTERVAL_MS;
  const readerWindowDays = parsePositiveInt(
    options.readerWindowDays,
    CALENDAR_PUBLIC_MUTAWIF_READER_DAYS,
  );
  const readerRangeStart = jakartaDateString(now);
  const readerRangeEnd = addIsoDateDays(readerRangeStart, readerWindowDays);
  const readerOptions = {
    readerBaseUrl,
    readerMinimumIntervalMs,
    readerRangeStart,
    readerRangeEnd,
  };
  const rangeStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const rangeStartStr = rangeStart.toISOString().split('T')[0];
  let calendarEvents;
  let filtered;
  let snapshotError;
  try {
    calendarEvents = await fetchPublicCalendarEvents();
    filtered = calendarEvents.filter(event => event.date >= rangeStartStr);
    snapshotError = validatePublicCalendarSnapshot(filtered);

    if (snapshotError && calendarEvents._calendarSource === 'primary') {
      console.warn(`[Calendar] Snapshot primary untuk range aktif tidak aman (${snapshotError}); mencoba fallback`);
      calendarEvents = await fetchPublicCalendarEvents(fetch, { forceFallback: true });
      filtered = calendarEvents.filter(event => event.date >= rangeStartStr);
      snapshotError = validatePublicCalendarSnapshot(filtered);
    }
  } catch (err) {
    console.error('[Calendar] Public page fetch failed:', err.message);
    return { success: false, error: err.message };
  }

  if (snapshotError) {
    return {
      success: false,
      error: `snapshot range sync (${rangeStartStr} ->) tidak aman: ${snapshotError}`,
      source: calendarEvents._calendarSource || null,
    };
  }

  const publicPageUsesFallback = calendarEvents._calendarSource === 'fallback';
  if (publicPageUsesFallback) {
    console.warn('[Calendar] Snapshot berasal dari origin fallback; stale-delete akan dilewati');
  }

  console.log(`[Calendar] ${filtered.length} events in range (${rangeStartStr} →)`);

  const allRows = [];
  const failedEventKeys = new Set();
  let detailsFetched = 0;
  const scheduleFallbackById = await loadScheduleFallbackMap(supabase, filtered);
  let fallbackUsed = 0;
  let emptyDetails = 0;
  let detailOriginFallbackUsed = 0;
  let mutawifReaderEvents = 0;
  let mutawifReaderRows = 0;
  let mutawifReaderFailures = 0;
  let mutawifRegressionsPrevented = 0;

  const detailConcurrency = publicPageUsesFallback
    ? CALENDAR_PUBLIC_FALLBACK_DETAIL_CONCURRENCY
    : CALENDAR_PUBLIC_DETAIL_CONCURRENCY;
  const detailResults = await mapWithConcurrency(
    filtered,
    detailConcurrency,
    async (event) => {
      const result = await resolvePublicEventRows(
        event,
        scheduleFallbackById,
        publicPageUsesFallback,
        readerOptions,
      );
      detailsFetched += 1;
      if (detailsFetched % 10 === 0 || detailsFetched === filtered.length) {
        console.log(`[Calendar] Fetched details for ${detailsFetched}/${filtered.length} events...`);
      }
      return result;
    },
  );

  // Peta event key → himpunan id segar, hanya untuk event yang daftar grupnya
  // benar-benar berhasil di-scrape. Daftar itu otoritatif untuk (tanggal, tipe)
  // miliknya sendiri, sehingga baris DB di luar daftar boleh langsung dibuang.
  const authoritativeFreshIdsByEvent = new Map();

  for (const result of detailResults) {
    if (result.failedKey) failedEventKeys.add(result.failedKey);
    fallbackUsed += result.fallbackUsed;
    emptyDetails += result.emptyDetails;
    if (result.detailUsesFallback) detailOriginFallbackUsed += 1;
    mutawifReaderEvents += result.mutawifReaderEvents;
    mutawifReaderRows += result.mutawifReaderRows;
    mutawifReaderFailures += result.mutawifReaderFailures;
    if (result.authoritative) {
      authoritativeFreshIdsByEvent.set(
        result.eventKey,
        new Set(result.rows.map(row => row.id)),
      );
    }
    if (result.rows.length > 0) allRows.push(...result.rows);
  }

  const syncSource = publicPageUsesFallback || detailOriginFallbackUsed > 0
    ? 'fallback'
    : 'primary';
  const degradedReasons = [];
  if (publicPageUsesFallback) degradedReasons.push('page_fallback');
  if (detailOriginFallbackUsed > 0) degradedReasons.push('detail_fallback');
  if (fallbackUsed > 0) degradedReasons.push('schedule_fallback');
  if (failedEventKeys.size > 0) degradedReasons.push('detail_failures');
  if (mutawifReaderFailures > 0) degradedReasons.push('mutawif_reader_failures');

  let rowsUpserted = 0;
  let rowsDeletedPerEvent = 0;
  let rowsDeletedGlobal = 0;
  const resultMeta = () => ({
    count: rowsUpserted,
    rowsUpserted,
    rowsDeletedPerEvent,
    rowsDeletedGlobal,
    eventsTotal: filtered.length,
    eventsSucceeded: filtered.length - failedEventKeys.size,
    failedEvents: failedEventKeys.size,
    source: syncSource,
    degraded: degradedReasons.length > 0,
    degradedReasons,
    mutawifReaderEvents,
    mutawifReaderRows,
    mutawifReaderFailures,
    mutawifRegressionsPrevented,
  });

  if (allRows.length === 0) {
    return {
      success: false,
      error: `tidak ada baris dihasilkan dari ${filtered.length} event (${failedEventKeys.size} detail gagal)`,
      ...resultMeta(),
    };
  }

  const { data: existingRows, error: existingRowsError } = await supabase
    .from('calendar_events')
    .select('id, event_date, event_type, raw_data')
    .gte('event_date', rangeStartStr);

  const needsMutawifPreservation = allRows.some(row => row._preserve_mutawif);
  if (existingRowsError && needsMutawifPreservation) {
    const error = `gagal membaca data kalender lama untuk mempertahankan MUTAWIF: ${existingRowsError.message}`;
    console.error(`[Calendar] ${error}`);
    return { success: false, error, ...resultMeta() };
  }
  if (existingRowsError) {
    degradedReasons.push('existing_rows_read_failed');
    console.warn('[Calendar] Gagal membaca row lama; stale-delete dilewati:', existingRowsError.message);
  }

  const existingById = new Map((existingRows || []).map(row => [row.id, row]));
  for (const row of allRows) {
    const preserveMutawif = row._preserve_mutawif;
    const regressionCandidate = row._mutawif_regression_candidate;
    delete row._preserve_mutawif;
    delete row._mutawif_regression_candidate;
    if (!preserveMutawif) continue;

    const existingMutawif = existingById.get(row.id)?.raw_data?.mutawif;
    if (isMeaningfulMutawif(existingMutawif)) {
      row.mutawif = existingMutawif;
      row.raw_data = { ...row.raw_data, mutawif: existingMutawif };
      if (regressionCandidate) mutawifRegressionsPrevented += 1;
    }
  }
  if (mutawifRegressionsPrevented > 0) {
    degradedReasons.push('mutawif_regressions_prevented');
    console.warn(
      `[Calendar] ${mutawifRegressionsPrevented} nama MUTAWIF lama dipertahankan karena sumber mengirim placeholder`,
    );
  }

  // Upsert harus selesai seluruhnya sebelum stale-delete. Jika satu batch
  // gagal, retry tetap aman karena row lama belum disentuh.
  const UPSERT_BATCH = 50;
  for (let i = 0; i < allRows.length; i += UPSERT_BATCH) {
    const batch = allRows.slice(i, i + UPSERT_BATCH);
    const { error } = await upsertCalendarBatch(supabase, batch);
    if (error) {
      const syncError = `upsert calendar_events gagal setelah ${rowsUpserted}/${allRows.length} row: ${error.message}`;
      console.error(`[Calendar] ${syncError}`);
      return { success: false, error: syncError, ...resultMeta() };
    }
    rowsUpserted += batch.length;
  }

  const DELETE_BATCH = 50;

  // ── Jalur per-event ──
  // Untuk tiap (tanggal, tipe) yang daftar grupnya baru saja berhasil di-scrape,
  // daftar itu otoritatif: baris DB di luar daftar adalah hantu. Buktinya lokal
  // dan langsung, jadi tak perlu konfirmasi dua-langkah. Ini yang menangkap
  // penomoran ulang kloter oleh sistem hulu — sumber utama baris kembar.
  if (!existingRowsError && existingRows && authoritativeFreshIdsByEvent.size > 0) {
    const perEventStaleIds = [];
    for (const row of existingRows) {
      const id = String(row.id);
      if (id.startsWith('_DEMO_')) continue;
      const freshIds = authoritativeFreshIdsByEvent.get(`${row.event_date}_${row.event_type}`);
      if (!freshIds || freshIds.has(id)) continue;
      perEventStaleIds.push(id);
    }

    for (let i = 0; i < perEventStaleIds.length; i += DELETE_BATCH) {
      const batch = perEventStaleIds.slice(i, i + DELETE_BATCH);
      const { error: deleteError } = await supabase
        .from('calendar_events')
        .delete()
        .in('id', batch);
      if (deleteError) {
        const syncError = `delete stale per-event calendar_events gagal: ${deleteError.message}`;
        console.error(`[Calendar] ${syncError}`);
        return { success: false, error: syncError, ...resultMeta() };
      }
      rowsDeletedPerEvent += batch.length;
    }
    if (rowsDeletedPerEvent > 0) {
      console.log(
        `[Calendar] Hapus ${rowsDeletedPerEvent} baris hantu dari `
        + `${authoritativeFreshIdsByEvent.size} event otoritatif`,
      );
    }
  }

  // ── Jalur global ──
  // Untuk event key yang lenyap total dari snapshot. Rute cadangan
  // (page_fallback / detail_fallback) tidak lagi mengunci penghapusan: isinya
  // sama, cuma jalannya lewat IP, dan gerbang itulah yang membuat penyapu tak
  // pernah jalan selama origin utama membalas 403. Kegagalan detail pun tidak
  // relevan di sini karena buktinya adalah daftar event halaman, bukan baris
  // hasil detail. Konfirmasi dua-langkah tetap dipertahankan karena bukti
  // "absen dari daftar" lebih lemah daripada bukti per-event.
  if (!existingRowsError && existingRows) {
    // Bukti jalur ini adalah daftar event pada halaman, bukan baris hasil
    // detail. Dengan begitu satu detail yang gagal diambil tidak lagi membuat
    // seluruh barisnya tampak lenyap — dulu itulah sebabnya kegagalan detail
    // harus memblokir penghapusan sama sekali.
    const snapshotKeys = new Set(filtered.map(event => `${event.date}_${event.type}`));
    const observedStaleIds = existingRows
      .filter(row => !snapshotKeys.has(`${row.event_date}_${row.event_type}`))
      .map(row => String(row.id))
      .filter(id => !id.startsWith('_DEMO_'));
    const staleCandidates = await loadCalendarStaleCandidates(supabase);
    if (staleCandidates.error) {
      const syncError = `gagal membaca konfirmasi stale calendar: ${staleCandidates.error.message}`;
      console.error(`[Calendar] ${syncError}`);
      return { success: false, error: syncError, ...resultMeta() };
    }

    const staleIds = observedStaleIds.filter(id => staleCandidates.ids.has(id));
    const pendingStaleIds = observedStaleIds.filter(id => !staleCandidates.ids.has(id));
    const saveCandidatesError = await saveCalendarStaleCandidates(supabase, new Set(observedStaleIds));
    if (saveCandidatesError) {
      const syncError = `gagal menyimpan konfirmasi stale calendar: ${saveCandidatesError.message}`;
      console.error(`[Calendar] ${syncError}`);
      return { success: false, error: syncError, ...resultMeta() };
    }
    if (pendingStaleIds.length > 0) {
      degradedReasons.push('stale_confirmation_pending');
      console.warn(`[Calendar] ${pendingStaleIds.length} stale row menunggu konfirmasi snapshot berikutnya`);
    }

    // Pagar ini SENGAJA hanya menghitung stale jalur global. Penghapusan
    // per-event punya bukti langsung per (tanggal, tipe) dan jumlahnya bisa
    // besar saat backlog dikuras — memasukkannya ke sini akan menggagalkan
    // sync dan mengunci pembersihan, persis bug yang sedang diperbaiki.
    const ratioLimit = maxStaleDeleteRatio();
    const staleDeleteRatio = existingRows.length > 0
      ? staleIds.length / existingRows.length
      : 0;

    if (staleDeleteRatio > ratioLimit) {
      const syncError = `stale-delete ${staleIds.length}/${existingRows.length} row (${Math.round(staleDeleteRatio * 100)}%) melewati batas aman ${Math.round(ratioLimit * 100)}%`;
      console.error(`[Calendar] ${syncError}`);
      return { success: false, error: syncError, ...resultMeta() };
    }

    for (let i = 0; i < staleIds.length; i += DELETE_BATCH) {
      const batch = staleIds.slice(i, i + DELETE_BATCH);
      const { error: deleteError } = await supabase
        .from('calendar_events')
        .delete()
        .in('id', batch);
      if (deleteError) {
        const syncError = `delete stale calendar_events gagal: ${deleteError.message}`;
        console.error(`[Calendar] ${syncError}`);
        return { success: false, error: syncError, ...resultMeta() };
      }
      rowsDeletedGlobal += batch.length;
    }
    if (rowsDeletedGlobal > 0) {
      console.log(`[Calendar] Hapus ${rowsDeletedGlobal} baris dari event key yang lenyap`);
    }
  }

  if (failedEventKeys.size > 0) {
    console.warn(`[Calendar] ${failedEventKeys.size} event dilewati (detail gagal) — baris lamanya dipertahankan`);
  }
  if (fallbackUsed > 0 || emptyDetails > 0) {
    console.log(`[Calendar] Schedule fallback: ${fallbackUsed} event dipulihkan dari umroh_schedules, ${emptyDetails} event tetap kosong`);
  }
  if (detailOriginFallbackUsed > 0) {
    console.warn(`[Calendar] ${detailOriginFallbackUsed} detail memakai origin fallback`);
  }
  if (mutawifReaderEvents > 0 || mutawifReaderFailures > 0) {
    console.log(
      `[Calendar] Reader MUTAWIF: ${mutawifReaderRows} row dari ${mutawifReaderEvents} event, `
      + `${mutawifReaderFailures} gagal`,
    );
  }
  console.log(`[Calendar] Sync complete: ${rowsUpserted} rows upserted from ${detailsFetched} events`);

  if (existingRowsError) {
    const syncError = `sync data selesai, tetapi verifikasi row lama gagal: ${existingRowsError.message}`;
    return { success: false, error: syncError, ...resultMeta() };
  }
  if (mutawifReaderFailures > 0) {
    const syncError = `${mutawifReaderFailures} detail MUTAWIF gagal diverifikasi; nama lama dipertahankan dan sync akan dicoba ulang`;
    return { success: false, error: syncError, ...resultMeta() };
  }
  if (mutawifRegressionsPrevented > 0) {
    const syncError = `${mutawifRegressionsPrevented} regresi nama MUTAWIF dicegah; sumber mengirim placeholder dan perlu diperiksa`;
    return { success: false, error: syncError, ...resultMeta() };
  }
  if (failedEventKeys.size > 0) {
    const syncError = `${failedEventKeys.size}/${filtered.length} detail event gagal; ${rowsUpserted} row aman sudah diperbarui dan row lama event yang gagal dipertahankan`;
    return { success: false, error: syncError, ...resultMeta() };
  }

  try {
    await enrichCalendarPaxJamaah(supabase);
  } catch (err) {
    console.error('[PaxJamaah] Enrichment failed:', err.message);
  }

  enrichKeberangkatanWithKumpul(supabase).catch(err => {
    console.error('[KumpulParser] Enrichment failed:', err.message);
  });

  return { success: true, ...resultMeta() };
}

// ── Enrich calendar events with pax terisi & pax jamaah jaringan ──
// pax legacy = kuota grup nasional (== seat_total), bukan jumlah jamaah.
// Petakan tiap baris kalender → jadwal umroh_schedules, lalu isi:
//  - pax_terisi  = kursi terisi nasional (seat_total - seat_sisa) — angka
//    utama dashboard (keputusan user 10 Jun 2026: isi grup, bukan jaringan)
//  - pax_jamaah  = booking jaringan agent (view jamaah_network_pax) — metrik
//    sekunder utk MCP/analitik; bisa undercount bila sync agent macet
// Baris tak ter-map dibiarkan NULL — frontend fallback ke pax legacy.
// Dipanggil setelah syncCalendar dan tiap jam dari server.js.
export async function enrichCalendarPaxJamaah(supabase) {
  const now = new Date();
  const rangeStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const rangeStartStr = rangeStart.toISOString().split('T')[0];

  const [evRes, schedRes, paxRes] = await Promise.all([
    supabase
      .from('calendar_events')
      .select('id, event_date, event_type, group_number, paket, pax, jadwal_id, pax_jamaah, pax_terisi')
      .gte('event_date', rangeStartStr),
    supabase
      .from('umroh_schedules')
      .select('jadwal_id, jadwal_nama, berangkat_tgl, pulang_tgl, manasik_tgl, seat_total, seat_sisa')
      .order('jadwal_id'),
    supabase.from('jamaah_network_pax').select('jadwal_id, pax'),
  ]);

  const firstError = evRes.error || schedRes.error || paxRes.error;
  if (firstError) {
    console.error('[PaxJamaah] Query error:', firstError.message);
    return { success: false, error: firstError.message };
  }

  const events = evRes.data || [];
  const schedules = schedRes.data || [];
  const schedById = new Map(schedules.map(s => [s.jadwal_id, s]));
  const networkPax = new Map((paxRes.data || []).map(r => [r.jadwal_id, r.pax]));

  // Pass 1: match via tanggal + nama. Sticky: jadwal yang sudah berangkat
  // dihapus dari umroh_schedules oleh schedule sync (mengikuti API), jadi
  // mapping lama JANGAN diturunkan ke null hanya karena tidak bisa di-derive
  // ulang — kepulangan kloter yang sedang di tanah suci tetap butuh mappingnya.
  const resolved = new Map(); // event id → jadwal_id | null
  for (const ev of events) {
    const fresh = matchEventToSchedule(ev, schedules)?.jadwal_id || null;
    resolved.set(ev.id, fresh || ev.jadwal_id || null);
  }

  // Pass 2: kepulangan/manasik yang gagal match tanggal (mis. pulang_tgl API
  // ≠ tanggal pulang riil paket plus-negara) — warisi dari keberangkatan se-kloter
  const mappedKeberangkatan = events
    .filter(e => e.event_type === 'keberangkatan' && resolved.get(e.id))
    .map(e => ({ ...e, jadwal_id: resolved.get(e.id) }));
  for (const ev of events) {
    if (ev.event_type === 'keberangkatan' || resolved.get(ev.id)) continue;
    const sibling = findSiblingKeberangkatan(ev, mappedKeberangkatan);
    if (sibling) resolved.set(ev.id, sibling.jadwal_id);
  }

  let matched = 0;
  let unmatched = 0;
  let updated = 0;

  for (const ev of events) {
    const jadwalId = resolved.get(ev.id);
    // Ter-map tapi belum ada jamaah di jaringan = 0 (bukan NULL) — itu fakta.
    const paxJamaah = jadwalId ? (networkPax.get(jadwalId) ?? 0) : null;
    // Kursi terisi nasional. Jadwal yang sudah hilang dari API (kloter
    // berangkat) tidak punya seat lagi — pertahankan angka terakhir (sticky).
    let paxTerisi = ev.pax_terisi ?? null;
    if (!jadwalId) {
      paxTerisi = null;
    } else {
      const sched = schedById.get(jadwalId);
      if (sched) {
        const total = parseInt(sched.seat_total, 10);
        const sisa = parseInt(sched.seat_sisa, 10);
        if (Number.isFinite(total) && Number.isFinite(sisa)) {
          paxTerisi = Math.min(total, Math.max(0, total - sisa));
        }
      }
    }
    if (jadwalId) matched++; else unmatched++;

    // Skip-unchanged agar tidak membebani Disk-IO DB
    if (ev.jadwal_id === jadwalId && ev.pax_jamaah === paxJamaah && ev.pax_terisi === paxTerisi) continue;

    const { error } = await supabase
      .from('calendar_events')
      .update({ jadwal_id: jadwalId, pax_jamaah: paxJamaah, pax_terisi: paxTerisi })
      .eq('id', ev.id);
    if (error) {
      console.error(`[PaxJamaah] Update error ${ev.id}:`, error.message);
    } else {
      updated++;
    }
  }

  console.log(`[PaxJamaah] Enrichment: ${matched} matched, ${unmatched} unmatched, ${updated} rows updated`);
  return { success: true, matched, unmatched, updated };
}

// ── Extract jam kumpul & titik kumpul from itinerary PDF ──
async function extractKumpulFromPdf(itineraryUrl) {
  try {
    const pdfUrl = itineraryUrl.replace('http://', 'https://');
    const res = await fetch(pdfUrl, {
      headers: {
        'Referer': 'https://jadwal.alhijaz.co/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) return null;

    const buffer = Buffer.from(await res.arrayBuffer());
    const parser = new PDFParse({ data: buffer });
    await parser.load();
    const textResult = await parser.getText();
    await parser.destroy();
    const text = textResult?.text?.trim() || '';

    if (!text || text.length < 50) {
      console.log(`[KumpulParser] PDF text too short (${text.length} chars)`);
      return null;
    }

    const meetingInfo = extractDepartureMeetingInfoFromText(text);
    if (meetingInfo) {
      console.log(`[KumpulParser] Extracted: jam=${meetingInfo.jamKumpul}, titik=${meetingInfo.titikKumpul}`);
    }
    return meetingInfo;
  } catch (err) {
    console.error('[KumpulParser] PDF extract error:', err.message);
    return null;
  }
}

// ── Enrich keberangkatan events with kumpul data from itinerary PDFs ──
export async function enrichKeberangkatanWithKumpul(supabase) {
  console.log('[KumpulParser] Starting enrichment...');

  // 1. Load all departure rows. Besides filling incomplete legacy rows, the
  // structured itinerary cache below also repairs complete-but-stale values
  // after a source PDF changes.
  const { data: eventRows, error } = await supabase
    .from('calendar_events')
    .select('id, event_date, paket, jam, jam_kumpul, titik_kumpul, jadwal_id')
    .eq('event_type', 'keberangkatan')
    .gt('pax', 0);

  if (error) {
    console.error('[KumpulParser] Query error:', error.message);
    return;
  }
  const allEvents = eventRows || [];
  const mappedEventIds = [...new Set(allEvents
    .map(event => event.jadwal_id)
    .filter(Boolean)
    .map(String))];
  const cachedMeetingById = new Map();
  if (mappedEventIds.length > 0) {
    const { data: itineraryRows, error: itineraryError } = await supabase
      .from('itineraries')
      .select('jadwal_id, content')
      .in('jadwal_id', mappedEventIds);
    if (itineraryError) {
      console.warn('[KumpulParser] Structured itinerary lookup failed:', itineraryError.message);
    } else {
      for (const row of itineraryRows || []) {
        const meetingInfo = extractDepartureMeetingInfoFromItinerary(row.content);
        if (meetingInfo) cachedMeetingById.set(String(row.jadwal_id), meetingInfo);
      }
    }
  }

  let refreshed = 0;
  const events = [];
  for (const event of allEvents) {
    const current = event.jadwal_id
      ? cachedMeetingById.get(String(event.jadwal_id))
      : null;
    if (current) {
      const timeChanged = String(event.jam_kumpul || '').trim() !== current.jamKumpul;
      const pointChanged = String(event.titik_kumpul || '').trim() !== current.titikKumpul;
      if (timeChanged || pointChanged) {
        const { error: updateError } = await supabase
          .from('calendar_events')
          .update({
            jam_kumpul: current.jamKumpul,
            titik_kumpul: current.titikKumpul,
          })
          .eq('id', event.id);
        if (updateError) {
          console.error(`[KumpulParser] Structured refresh error ${event.id}:`, updateError.message);
        } else {
          refreshed++;
        }
      }
      continue;
    }

    if (needsDepartureMeetingEnrichment(event)) events.push(event);
  }

  if (refreshed > 0) {
    console.log(`[KumpulParser] ${refreshed} stale rows refreshed from structured itinerary cache`);
  }
  if (!events.length) {
    console.log('[KumpulParser] No events need enrichment');
    return;
  }

  console.log(`[KumpulParser] ${events.length} keberangkatan events need kumpul data`);

  // 2. Prefer the schedule row already mapped to the event. Besides avoiding
  // Hijri-year assumptions, this uses the mirrored CDN itinerary when present.
  let packages = [];
  const mappedIds = [...new Set(events.map(event => event.jadwal_id).filter(Boolean).map(String))];
  if (mappedIds.length > 0) {
    const { data: mappedPackages, error: mappedError } = await supabase
      .from('umroh_schedules')
      .select('jadwal_id, jadwal_nama, berangkat_tgl, itinerary, itinerary_cdn, year_code')
      .in('jadwal_id', mappedIds)
      .order('year_code', { ascending: false });
    if (mappedError) {
      console.error('[KumpulParser] Mapped schedule query failed:', mappedError.message);
    } else {
      const seenIds = new Set();
      for (const row of mappedPackages || []) {
        const id = String(row.jadwal_id);
        if (seenIds.has(id)) continue;
        seenIds.add(id);
        packages.push({ ...row, itinerary: row.itinerary_cdn || row.itinerary });
      }
    }
  }

  const needsLegacyPackages = events.some(event => (
    !event.jadwal_id
    || !packages.some(pkg => String(pkg.jadwal_id) === String(event.jadwal_id))
  ));
  if (needsLegacyPackages) {
    // Legacy fallback for old calendar rows that do not have jadwal_id yet.
    for (const year of ['1447', '1448']) {
      try {
        const res = await fetch(`https://jadwal.alhijaz.co/jadwal/api-get/${year}`, {
          headers: { 'User-Agent': 'Mozilla/5.0' },
          signal: AbortSignal.timeout(15000),
        });
        if (res.ok) {
          const json = await res.json();
          const items = json.aaData || [];
          packages.push(...items);
          console.log(`[KumpulParser] ${items.length} packages from API year ${year}`);
        }
      } catch (err) {
        console.error(`[KumpulParser] Package API ${year} failed:`, err.message);
      }
    }
  }

  if (!packages.length) {
    console.log('[KumpulParser] No packages from API');
    return;
  }

  let enriched = 0;

  for (const event of events) {
    // 3. Match event → package by date first, then keyword overlap
    const exactPackage = event.jadwal_id
      ? packages.find(pkg => String(pkg.jadwal_id) === String(event.jadwal_id))
      : null;
    const dateCandidates = packages.filter(pkg => pkg.berangkat_tgl === event.event_date);
    if (!exactPackage && !dateCandidates.length) {
      console.log(`[KumpulParser] No package match for: ${event.paket} (${event.event_date})`);
      continue;
    }

    // Find best match by keyword overlap
    const calWords = tokenizeName(event.paket);
    let matchedPkg = exactPackage;
    let bestScore = 0;
    for (const pkg of exactPackage ? [] : dateCandidates) {
      const score = overlapScore(calWords, pkg.jadwal_nama);
      if (score > bestScore) {
        bestScore = score;
        matchedPkg = pkg;
      }
    }

    // Require at least 50% keyword overlap
    if (!matchedPkg || (!exactPackage && bestScore < 0.5)) {
      console.log(`[KumpulParser] No package match for: ${event.paket} (${event.event_date}) [best score: ${bestScore.toFixed(2)}]`);
      continue;
    }
    console.log(`[KumpulParser] Matched: "${event.paket}" → "${matchedPkg.jadwal_nama}" (score: ${bestScore.toFixed(2)})`);

    if (!matchedPkg) {
      console.log(`[KumpulParser] No package match for: ${event.paket} (${event.event_date})`);
      continue;
    }
    if (!matchedPkg.itinerary) {
      console.log(`[KumpulParser] No itinerary URL for: ${matchedPkg.jadwal_nama}`);
      continue;
    }

    // 4. Extract kumpul info from PDF
    console.log(`[KumpulParser] Processing: ${event.paket} (${event.event_date}) → ${matchedPkg.itinerary}`);
    const kumpulInfo = await extractKumpulFromPdf(matchedPkg.itinerary);

    if (kumpulInfo?.jamKumpul && kumpulInfo?.titikKumpul) {
      await supabase
        .from('calendar_events')
        .update({
          jam_kumpul: kumpulInfo.jamKumpul,
          titik_kumpul: kumpulInfo.titikKumpul,
        })
        .eq('id', event.id);

      enriched++;
      console.log(`[KumpulParser] Found: Kumpul ${kumpulInfo.jamKumpul} di ${kumpulInfo.titikKumpul || '?'}`);
    }

    // Rate limit between PDF fetches
    await new Promise(r => setTimeout(r, 1000));
  }

  console.log(`[KumpulParser] Enrichment complete: ${enriched}/${events.length} events updated`);
}
