/**
 * Calendar API — Scrape calendar events from internal legacy system
 *
 * Fetches Manasik/Keberangkatan/Kepulangan events from the internal
 * calendar at 115.124.86.220, parses them, and syncs to Supabase.
 *
 * Discovery findings:
 *   - FullCalendar v5 with events embedded as JSON array in page JS
 *   - 133 events pre-loaded, format: {title, start, color, extendedProps: {mjudul, aid, icon, apalah}}
 *   - Event detail popup: GET pages/_jmodal.php?.m={aid}&.g={apalah} → HTML table
 *   - eventClick handler: .load('_jmodal.php?.m='+aid+'&.g='+apalah)
 *   - Session: PHPSESSID cookie from cek_login.php
 */

import * as cheerio from 'cheerio';
import { PDFParse } from 'pdf-parse';
import { matchEventToSchedule, findSiblingKeberangkatan, tokenizeName, overlapScore } from './lib/calendar-jadwal-match.js';
import { buildCookieString, isSessionExpiredHtml } from './laporan-api.js';

const BASE = (process.env.INTERNAL_API_BASE || 'http://115.124.86.220') + '/aiw/staff';
// Dedicated calendar credential — terpisah dari agent agar tidak bentrok session
const CALENDAR_USERNAME = process.env.CALENDAR_USERNAME || 'SM148';
const CALENDAR_PASSWORD = process.env.CALENDAR_PASSWORD || 'ALHIJAZ';
const CALENDAR_KANTOR = process.env.CALENDAR_KANTOR || '2';

// ── Login to internal system ──
async function loginInternal() {

  const body = new URLSearchParams({
    kantor: CALENDAR_KANTOR,
    username: CALENDAR_USERNAME,
    password: CALENDAR_PASSWORD,
    z: '',
  });

  try {
    const res = await fetch(`${BASE}/cek_login.php`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      body: body.toString(),
      redirect: 'manual',
    });

    let cookies;
    if (typeof res.headers.getSetCookie === 'function') {
      cookies = res.headers.getSetCookie();
    } else if (typeof res.headers.raw === 'function') {
      cookies = res.headers.raw()['set-cookie'] || [];
    } else {
      const raw = res.headers.get('set-cookie');
      cookies = raw ? [raw] : [];
    }

    // Legacy bisa set PHPSESSID dua kali (regenerasi session saat login).
    // buildCookieString dedupe per nama — nilai terakhir yang menang; mengirim
    // keduanya membuat PHP membaca session pertama (mati) → "Sesi Anda habis".
    const cookieString = buildCookieString(cookies);
    if (!cookieString.includes('PHPSESSID')) {
      throw new Error('Calendar sync: login failed — no session cookie');
    }

    return cookieString;
  } catch (err) {
    if (err.cause?.code === 'ECONNREFUSED' || err.cause?.code === 'ETIMEDOUT') {
      throw new Error('Calendar sync: internal system unreachable');
    }
    throw err;
  }
}

// ── Fetch calendar page and extract events from FullCalendar JS ──
async function fetchAllCalendarEvents(cookie) {
  const url = `${BASE}/pages/main.php?route=home`;

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Cookie: cookie,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    },
  });

  const html = await res.text();

  if (isSessionExpiredHtml(html)) {
    throw new Error('Calendar sync: session expired');
  }

  // Extract the events JSON array from FullCalendar init
  // Pattern: events: [{...}, {...}],
  // Gagal ekstrak = THROW, bukan return [] — return kosong membuat sync
  // melaporkan "success 0 event" dan kegagalan tak terlihat (insiden 12 Jun 2026).
  const eventsMatch = html.match(/events:\s*(\[[\s\S]*?\])\s*,\s*\n/);
  if (!eventsMatch) {
    throw new Error('Calendar sync: events array tidak ditemukan di halaman — layout berubah atau session tidak valid');
  }

  try {
    const events = JSON.parse(eventsMatch[1]);
    console.log(`[Calendar] Parsed ${events.length} events from FullCalendar JS`);

    return events
      .filter(ev => ev.start && ev.start !== '0000-00-00') // skip invalid dates
      .map(ev => ({
        date: ev.start.split('T')[0],
        type: detectEventType(ev.title),
        title: ev.title || '',
        aid: ev.extendedProps?.aid || '',
        apalah: ev.extendedProps?.apalah || '',
        raw: ev,
      }));
  } catch (e) {
    throw new Error(`Calendar sync: gagal parse events JSON — ${e.message}`);
  }
}

// ── Detect event type from title ──
function detectEventType(title) {
  const t = (title || '').toLowerCase();
  if (t.includes('keberangkatan') || t.includes('berangkat')) return 'keberangkatan';
  if (t.includes('kepulangan') || t.includes('pulang')) return 'kepulangan';
  return 'manasik';
}

// ── Fetch event detail popup ──
// URL pattern: pages/_jmodal.php?.m={aid}&.g={apalah}
// Returns HTML table — layout kolom BERBEDA per tipe event:
//   keberangkatan/kepulangan: GROUP | PESAWAT | JAM | PAKET | PAX | STAFF | TL | MUTAWIF
//   manasik:                  GROUP | PESAWAT | JAM | PAKET | PAX | TL | MUTAWIF (tanpa STAFF)
// Lempar error bila gagal — JANGAN return [] untuk kegagalan: [] berarti
// "modal benar-benar kosong"; kegagalan yang menyaru [] membuat sync menulis
// placeholder _0 dan stale-delete menghapus baris grup lama yang masih benar.
// err.sessionExpired = true → fatal utk seluruh run (modal berikutnya pasti gagal juga).
async function fetchEventDetail(cookie, event) {
  if (!event.aid) return [];

  const detailUrl = `${BASE}/pages/_jmodal.php?.m=${encodeURIComponent(event.aid)}&.g=${encodeURIComponent(event.apalah)}`;
  const MAX_TRIES = 2;
  let lastErr;

  for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
    try {
      const res = await fetch(detailUrl, {
        method: 'GET',
        headers: {
          Cookie: cookie,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/html, */*',
          'X-Requested-With': 'XMLHttpRequest',
          'Referer': `${BASE}/pages/main.php?route=home`,
        },
      });

      const html = await res.text();
      if (isSessionExpiredHtml(html)) {
        const err = new Error('Calendar sync: session expired di tengah run (modal)');
        err.sessionExpired = true;
        throw err;
      }
      if (!res.ok) throw new Error(`modal HTTP ${res.status}`);

      return parseEventDetailHTML(html);
    } catch (err) {
      if (err.sessionExpired) throw err;
      lastErr = err;
      if (attempt < MAX_TRIES) await new Promise(r => setTimeout(r, 2000));
    }
  }
  throw new Error(`Detail fetch gagal utk ${event.date}/${event.type}: ${lastErr.message}`);
}

// ── Parse event detail HTML table ──
// Posisi kolom STAFF/TL berbeda per tipe event (manasik tanpa kolom STAFF),
// jadi petakan berdasarkan teks header <th>, bukan index tetap.
function parseEventDetailHTML(html) {
  const $ = cheerio.load(html);
  const rows = [];

  const headers = $('table th').map((_, th) => $(th).text().trim().toUpperCase()).get();
  // Fallback ke layout lama (staff=5, tl=6) hanya bila header tidak terbaca sama sekali;
  // header ada tapi tanpa STAFF (manasik) berarti memang tidak ada kolom staff.
  const staffIdx = headers.length ? headers.indexOf('STAFF') : 5;
  const tlIdx = headers.length ? headers.indexOf('TL') : 6;

  $('table tr').each((i, el) => {
    if ($(el).find('th').length > 0) return; // skip header

    const cols = $(el).find('td').map((_, td) => $(td).text().trim()).get();
    if (cols.length < 5) return;

    rows.push({
      group_number: cols[0] || null,
      pesawat: cols[1] || null,
      jam: cols[2] || null,
      paket: cols[3] || null,
      pax: parseInt(cols[4]) || 0,
      staff: (staffIdx >= 0 ? cols[staffIdx] : null) || '-',
      tour_leader: (tlIdx >= 0 ? cols[tlIdx] : null) || '-',
    });
  });

  return rows;
}

// ── Main sync function ──
export async function syncCalendar(supabase) {
  console.log('[Calendar] Starting sync...');

  let cookie;
  try {
    cookie = await loginInternal();
    console.log('[Calendar] Login successful');
  } catch (err) {
    console.error('[Calendar] Login failed:', err.message);
    return { success: false, error: err.message };
  }

  // Fetch ALL events from the calendar page (they're all pre-loaded)
  let calendarEvents;
  try {
    calendarEvents = await fetchAllCalendarEvents(cookie);
  } catch (err) {
    console.error('[Calendar] Page fetch failed:', err.message);
    return { success: false, error: err.message };
  }

  if (calendarEvents.length === 0) {
    // Sumber selalu pre-load ~120 event — kosong berarti rusak, bukan "tidak ada jadwal"
    return { success: false, error: 'sumber tidak memuat event sama sekali — layout/login berubah?' };
  }

  // Filter to relevant range: 1 month back, tanpa batas atas — sumber hanya
  // preload set terbatas (~120 event); cap +3 bulan dulu membuat bulan
  // Oktober+ tampak kosong di dashboard padahal sumbernya ada.
  const now = new Date();
  const rangeStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const rangeStartStr = rangeStart.toISOString().split('T')[0];

  const filtered = calendarEvents.filter(ev => ev.date >= rangeStartStr);
  console.log(`[Calendar] ${filtered.length} events in range (${rangeStartStr} →)`);

  if (filtered.length === 0) {
    return { success: false, error: `0 dari ${calendarEvents.length} event masuk range sync (${rangeStartStr} →) — anomali` };
  }

  // Fetch details for each event
  const allRows = [];
  // Event yang detail-nya gagal di-fetch: di-skip dan baris LAMA-nya dipertahankan
  // (dikecualikan dari stale-delete) — kegagalan parsial tidak boleh merusak data baik.
  const failedEventKeys = new Set();
  let detailsFetched = 0;

  for (const event of filtered) {
    let details;
    try {
      details = await fetchEventDetail(cookie, event);
    } catch (err) {
      if (err.sessionExpired) throw err; // fatal — caller retry run penuh dengan login baru
      failedEventKeys.add(`${event.date}_${event.type}`);
      console.warn(`[Calendar] ${err.message} — baris lama event ini dipertahankan`);
      detailsFetched++;
      continue;
    }
    detailsFetched++;

    if (details.length === 0) {
      // No detail — store event as single row
      allRows.push({
        id: `${event.date}_${event.type}_0`,
        event_date: event.date,
        event_type: event.type,
        group_number: null,
        pesawat: null,
        jam: null,
        paket: null,
        pax: 0,
        staff: null,
        tour_leader: null,
        raw_data: event.raw || {},
        synced_at: new Date().toISOString(),
      });
    } else {
      for (const detail of details) {
        const id = `${event.date}_${event.type}_${detail.group_number || 'x'}`;
        allRows.push({
          id,
          event_date: event.date,
          event_type: event.type,
          ...detail,
          raw_data: detail,
          synced_at: new Date().toISOString(),
        });
      }
    }

    // Throttle: 500ms between detail requests
    if (detailsFetched % 10 === 0) {
      console.log(`[Calendar] Fetched details for ${detailsFetched}/${filtered.length} events...`);
    }
    await new Promise(r => setTimeout(r, 500));
  }

  if (allRows.length === 0) {
    return { success: false, error: `tidak ada baris dihasilkan dari ${filtered.length} event (${failedEventKeys.size} detail gagal)` };
  }

  // Delete stale records in the sync range that no longer exist in source.
  // This prevents ghost entries when groups get moved between dates.
  {
    const freshIds = new Set(allRows.map(r => r.id));
    const failedPrefixes = [...failedEventKeys].map(k => `${k}_`);

    // Fetch existing IDs in the sync range
    const { data: existingRows, error: fetchErr } = await supabase
      .from('calendar_events')
      .select('id')
      .gte('event_date', rangeStartStr);

    if (!fetchErr && existingRows) {
      const staleIds = existingRows
        .map(r => r.id)
        .filter(id =>
          !freshIds.has(id) &&
          !id.startsWith('_DEMO_') &&
          !failedPrefixes.some(p => id.startsWith(p)) // baris event yang gagal di-fetch: jangan dihapus
        );

      if (staleIds.length > 0) {
        const DEL_BATCH = 50;
        for (let i = 0; i < staleIds.length; i += DEL_BATCH) {
          const batch = staleIds.slice(i, i + DEL_BATCH);
          const { error: delErr } = await supabase
            .from('calendar_events')
            .delete()
            .in('id', batch);
          if (delErr) {
            console.error('[Calendar] Delete stale batch error:', delErr.message);
          }
        }
        console.log(`[Calendar] Removed ${staleIds.length} stale records from sync range`);
      }
    }

    // Upsert fresh data
    const BATCH = 50;
    let upserted = 0;
    for (let i = 0; i < allRows.length; i += BATCH) {
      const batch = allRows.slice(i, i + BATCH);
      const { error } = await supabase
        .from('calendar_events')
        .upsert(batch, { onConflict: 'id' });

      if (error) {
        console.error('[Calendar] Upsert batch error:', error.message);
      } else {
        upserted += batch.length;
      }
    }
    if (failedEventKeys.size > 0) {
      console.warn(`[Calendar] ${failedEventKeys.size} event dilewati (detail gagal) — baris lamanya dipertahankan`);
    }
    console.log(`[Calendar] Sync complete: ${upserted} rows upserted from ${detailsFetched} events`);
  }

  // Isi pax jamaah jaringan untuk baris yang baru di-sync
  try {
    await enrichCalendarPaxJamaah(supabase);
  } catch (err) {
    console.error('[PaxJamaah] Enrichment failed:', err.message);
  }

  // Fire-and-forget: enrich keberangkatan events with kumpul info from PDFs
  enrichKeberangkatanWithKumpul(supabase).catch(err => {
    console.error('[KumpulParser] Enrichment failed:', err.message);
  });

  return { success: true, count: allRows.length, failedEvents: failedEventKeys.size };
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

    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

    let jamKumpul = null;

    // Collect the full text block around "berkumpul" for location extraction
    let kumpulBlock = '';

    // Search for "berkumpul" or "kumpul di" in text (first occurrence only, Hari 1)
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!/berkumpul|kumpul\s+di/i.test(line)) continue;

      // Gather surrounding lines for context (kumpul line + next 2 lines)
      kumpulBlock = lines.slice(i, i + 3).join(' ');

      // Format A: "19.40 Rombongan tiba dan berkumpul di ..." (time + text same line)
      const sameLineMatch = line.match(/^(\d{1,2}[.:]\d{2})\s+/);
      if (sameLineMatch) {
        jamKumpul = sameLineMatch[1].replace(':', '.');
        break;
      }

      // Format B: time on previous line
      if (i > 0) {
        const prevLine = lines[i - 1];
        const timeMatch = prevLine.match(/^(\d{1,2}[.:]\d{2})$/);
        if (timeMatch) {
          jamKumpul = timeMatch[1].replace(':', '.');
          break;
        }
      }
    }

    // Extract titik kumpul from the text block: "nama tempat" + "Terminal X"
    let titikKumpul = null;
    if (kumpulBlock) {
      const parts = [];

      // Extract named place: hotel/café/cafe/resto + 1-2 words
      const placeMatch = kumpulBlock.match(/(?:hotel|caf[eé]|resto|restaurant|lounge)\s+[\w']+(?:\s+[\w']+)?/i);
      if (placeMatch) {
        let place = placeMatch[0].replace(/\s+Terminal\b.*$/i, '').trim();
        place = place.replace(/\b\w/g, c => c.toUpperCase());
        parts.push(place);
      }

      // Extract terminal number
      const terminalMatch = kumpulBlock.match(/Terminal\s+(\d)/i);
      if (terminalMatch) {
        parts.push('Terminal ' + terminalMatch[1]);
      }

      if (parts.length) titikKumpul = parts.join(', ');
    }

    if (jamKumpul) {
      console.log(`[KumpulParser] Extracted: jam=${jamKumpul}, titik=${titikKumpul}`);
    }

    return jamKumpul ? { jamKumpul, titikKumpul } : null;
  } catch (err) {
    console.error('[KumpulParser] PDF extract error:', err.message);
    return null;
  }
}

// ── Enrich keberangkatan events with kumpul data from itinerary PDFs ──
export async function enrichKeberangkatanWithKumpul(supabase) {
  console.log('[KumpulParser] Starting enrichment...');

  // 1. Get keberangkatan events missing jam_kumpul
  const { data: events, error } = await supabase
    .from('calendar_events')
    .select('id, event_date, paket, jam')
    .eq('event_type', 'keberangkatan')
    .is('jam_kumpul', null)
    .gt('pax', 0);

  if (error) {
    console.error('[KumpulParser] Query error:', error.message);
    return;
  }
  if (!events?.length) {
    console.log('[KumpulParser] No events need enrichment');
    return;
  }

  console.log(`[KumpulParser] ${events.length} keberangkatan events need kumpul data`);

  // 2. Fetch package data from both Hijri years (1447 + 1448)
  let packages = [];
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

  if (!packages.length) {
    console.log('[KumpulParser] No packages from API');
    return;
  }

  let enriched = 0;

  for (const event of events) {
    // 3. Match event → package by date first, then keyword overlap
    const dateCandidates = packages.filter(pkg => pkg.berangkat_tgl === event.event_date);
    if (!dateCandidates.length) {
      console.log(`[KumpulParser] No package match for: ${event.paket} (${event.event_date})`);
      continue;
    }

    // Find best match by keyword overlap
    const calWords = tokenizeName(event.paket);
    let matchedPkg = null;
    let bestScore = 0;
    for (const pkg of dateCandidates) {
      const score = overlapScore(calWords, pkg.jadwal_nama);
      if (score > bestScore) {
        bestScore = score;
        matchedPkg = pkg;
      }
    }

    // Require at least 50% keyword overlap
    if (!matchedPkg || bestScore < 0.5) {
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

    if (kumpulInfo?.jamKumpul) {
      await supabase
        .from('calendar_events')
        .update({
          jam_kumpul: kumpulInfo.jamKumpul,
          titik_kumpul: kumpulInfo.titikKumpul || null,
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
