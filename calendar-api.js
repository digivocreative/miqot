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

const BASE = 'http://115.124.86.220/aiw/staff';
const CALENDAR_SYNC_SLUG = 'nikita';

// ── Login to internal system ──
async function loginInternal(supabase, decryptFn) {
  const { data: agent, error } = await supabase
    .from('agents')
    .select('jamaah_username, jamaah_password, jamaah_kantor')
    .eq('slug', CALENDAR_SYNC_SLUG)
    .single();

  if (error || !agent?.jamaah_username || !agent?.jamaah_password) {
    throw new Error(`Calendar sync: credential for '${CALENDAR_SYNC_SLUG}' not found`);
  }

  const password = decryptFn(agent.jamaah_password);
  const kantor = agent.jamaah_kantor || '2';

  const body = new URLSearchParams({
    kantor,
    username: agent.jamaah_username,
    password,
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

    const phpSessionCookie = cookies?.find(c => c.includes('PHPSESSID'));
    if (!phpSessionCookie) {
      throw new Error('Calendar sync: login failed — no session cookie');
    }

    return cookies.map(c => c.split(';')[0]).join('; ');
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

  if (html.includes('cek_login.php') || html.includes('Sign in to start your session')) {
    throw new Error('Calendar sync: session expired');
  }

  // Extract the events JSON array from FullCalendar init
  // Pattern: events: [{...}, {...}],
  const eventsMatch = html.match(/events:\s*(\[[\s\S]*?\])\s*,\s*\n/);
  if (!eventsMatch) {
    console.warn('[Calendar] Could not find events array in page source');
    return [];
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
    console.error('[Calendar] Failed to parse events JSON:', e.message);
    return [];
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
// Returns HTML table with columns: GROUP, PESAWAT, JAM, PAKET, PAX, STAFF, TL
async function fetchEventDetail(cookie, event) {
  if (!event.aid) return [];

  const detailUrl = `${BASE}/pages/_jmodal.php?.m=${encodeURIComponent(event.aid)}&.g=${encodeURIComponent(event.apalah)}`;

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
    if (html.includes('cek_login.php')) return [];

    return parseEventDetailHTML(html);
  } catch (err) {
    console.error(`[Calendar] Detail fetch error for ${event.date}/${event.type}:`, err.message);
    return [];
  }
}

// ── Parse event detail HTML table ──
// Columns: GROUP | PESAWAT | JAM | PAKET | PAX | STAFF | TL
function parseEventDetailHTML(html) {
  const $ = cheerio.load(html);
  const rows = [];

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
      staff: cols[5] || '-',
      tour_leader: cols[6] || '-',
    });
  });

  return rows;
}

// ── Main sync function ──
export async function syncCalendar(supabase, decryptFn) {
  console.log('[Calendar] Starting sync...');

  let cookie;
  try {
    cookie = await loginInternal(supabase, decryptFn);
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
    console.log('[Calendar] No events found');
    return { success: true, count: 0 };
  }

  // Filter to relevant range: 1 month back + 3 months ahead
  const now = new Date();
  const rangeStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const rangeEnd = new Date(now.getFullYear(), now.getMonth() + 4, 0);
  const rangeStartStr = rangeStart.toISOString().split('T')[0];
  const rangeEndStr = rangeEnd.toISOString().split('T')[0];

  const filtered = calendarEvents.filter(ev => ev.date >= rangeStartStr && ev.date <= rangeEndStr);
  console.log(`[Calendar] ${filtered.length} events in range (${rangeStartStr} → ${rangeEndStr})`);

  // Fetch details for each event
  const allRows = [];
  let detailsFetched = 0;

  for (const event of filtered) {
    const details = await fetchEventDetail(cookie, event);
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

  // Upsert to Supabase
  if (allRows.length > 0) {
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
    console.log(`[Calendar] Sync complete: ${upserted} rows upserted from ${detailsFetched} events`);
  } else {
    console.log('[Calendar] Sync complete: no rows generated');
  }

  return { success: true, count: allRows.length };
}
