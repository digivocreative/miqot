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
import { fetchPublicCalendarEvents, fetchPublicEventDetail } from './lib/calendar-public-source.js';
import { validatePublicCalendarSnapshot } from './lib/calendar-public-snapshot.js';
import {
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
const parsedMaxStaleDeleteRatio = Number.parseFloat(
  process.env.CALENDAR_PUBLIC_MAX_STALE_DELETE_RATIO || '0.25',
);
const CALENDAR_PUBLIC_MAX_STALE_DELETE_RATIO = Number.isFinite(parsedMaxStaleDeleteRatio)
  && parsedMaxStaleDeleteRatio >= 0
  && parsedMaxStaleDeleteRatio <= 1
  ? parsedMaxStaleDeleteRatio
  : 0.25;

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

async function resolvePublicEventRows(event, scheduleFallbackById, forceFallback) {
  const failedKey = `${event.date}_${event.type}`;
  let details;

  try {
    details = await fetchPublicEventDetail(event, fetch, { forceFallback });
  } catch (err) {
    console.warn(`[Calendar] ${err.message} — baris lama event ini dipertahankan`);
    return { rows: [], failedKey, fallbackUsed: 0, emptyDetails: 0, detailUsesFallback: false };
  }

  const detailUsesFallback = details._calendarSource === 'fallback';
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
      return { rows: [], failedKey, fallbackUsed, emptyDetails, detailUsesFallback };
    }
  }

  const rows = details.map((detail, idx) => {
    const rowKey = detail.jadwal_id || detail.group_number || `row${idx + 1}`;
    const id = `${event.date}_${event.type}_${rowKey}`;
    const detailData = { ...detail };
    return {
      id,
      event_date: event.date,
      event_type: event.type,
      ...detailData,
      raw_data: detailData,
      _preserve_mutawif: detail._mutawifSourceAvailable !== true,
      synced_at: new Date().toISOString(),
    };
  });

  return { rows, failedKey: null, fallbackUsed, emptyDetails, detailUsesFallback };
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
export async function syncCalendar(supabase) {
  console.log('[Calendar] Starting sync...');

  const now = new Date();
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

  const detailConcurrency = publicPageUsesFallback
    ? CALENDAR_PUBLIC_FALLBACK_DETAIL_CONCURRENCY
    : CALENDAR_PUBLIC_DETAIL_CONCURRENCY;
  const detailResults = await mapWithConcurrency(
    filtered,
    detailConcurrency,
    async (event) => {
      const result = await resolvePublicEventRows(event, scheduleFallbackById, publicPageUsesFallback);
      detailsFetched += 1;
      if (detailsFetched % 10 === 0 || detailsFetched === filtered.length) {
        console.log(`[Calendar] Fetched details for ${detailsFetched}/${filtered.length} events...`);
      }
      return result;
    },
  );

  for (const result of detailResults) {
    if (result.failedKey) failedEventKeys.add(result.failedKey);
    fallbackUsed += result.fallbackUsed;
    emptyDetails += result.emptyDetails;
    if (result.detailUsesFallback) detailOriginFallbackUsed += 1;
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

  let rowsUpserted = 0;
  const resultMeta = () => ({
    count: rowsUpserted,
    rowsUpserted,
    eventsTotal: filtered.length,
    eventsSucceeded: filtered.length - failedEventKeys.size,
    failedEvents: failedEventKeys.size,
    source: syncSource,
    degraded: degradedReasons.length > 0,
    degradedReasons,
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
    .select('id, raw_data')
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
    delete row._preserve_mutawif;
    if (!preserveMutawif) continue;

    const existingMutawif = existingById.get(row.id)?.raw_data?.mutawif;
    if (existingMutawif && existingMutawif !== '-') {
      row.mutawif = existingMutawif;
      row.raw_data = { ...row.raw_data, mutawif: existingMutawif };
    }
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

  const degradedSnapshot = publicPageUsesFallback
    || detailOriginFallbackUsed > 0
    || fallbackUsed > 0
    || failedEventKeys.size > 0;

  if (!existingRowsError && existingRows && !degradedSnapshot) {
    const freshIds = new Set(allRows.map(row => row.id));
    const observedStaleIds = existingRows
      .map(row => row.id)
      .filter(id => !freshIds.has(id) && !id.startsWith('_DEMO_'));
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

    const staleDeleteRatio = existingRows.length > 0
      ? staleIds.length / existingRows.length
      : 0;

    if (staleDeleteRatio > CALENDAR_PUBLIC_MAX_STALE_DELETE_RATIO) {
      const syncError = `stale-delete ${staleIds.length}/${existingRows.length} row (${Math.round(staleDeleteRatio * 100)}%) melewati batas aman ${Math.round(CALENDAR_PUBLIC_MAX_STALE_DELETE_RATIO * 100)}%`;
      console.error(`[Calendar] ${syncError}`);
      return { success: false, error: syncError, ...resultMeta() };
    }

    const DELETE_BATCH = 50;
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
    }
    if (staleIds.length > 0) {
      console.log(`[Calendar] Removed ${staleIds.length} stale records from sync range`);
    }
  } else if (!existingRowsError && existingRows && degradedSnapshot) {
    console.warn('[Calendar] Stale-delete dilewati karena snapshot belum authoritative/complete');
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
  console.log(`[Calendar] Sync complete: ${rowsUpserted} rows upserted from ${detailsFetched} events`);

  if (existingRowsError) {
    const syncError = `sync data selesai, tetapi verifikasi row lama gagal: ${existingRowsError.message}`;
    return { success: false, error: syncError, ...resultMeta() };
  }
  if (failedEventKeys.size > 0) {
    const syncError = `${failedEventKeys.size}/${filtered.length} detail event gagal; ${rowsUpserted} row aman sudah diperbarui dan row lama dipertahankan`;
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

  // 1. Retry when either field is incomplete. Previously, a row with a known
  // time but a missing location was permanently skipped.
  const { data: eventRows, error } = await supabase
    .from('calendar_events')
    .select('id, event_date, paket, jam, jam_kumpul, titik_kumpul, jadwal_id')
    .eq('event_type', 'keberangkatan')
    .gt('pax', 0);

  if (error) {
    console.error('[KumpulParser] Query error:', error.message);
    return;
  }
  const events = (eventRows || []).filter(needsDepartureMeetingEnrichment);
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
