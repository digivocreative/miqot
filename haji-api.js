/**
 * Haji API — Scraper for Haji data from legacy internal system
 *
 * Reuses session cookies from laporan-api.js (same legacy system).
 * Caller (server.js) is responsible for passing valid session cookies.
 *
 * Functions:
 *   fetchHajiList(sessionCookies)            → array of haji list entries
 *   fetchHajiDetail(sessionCookies, idHaji)  → array of jamaah per id_haji
 *   syncHajiData(sessionCookies, agentId, supabase, agentSlug?) → full sync flow
 */

import * as cheerio from 'cheerio';

const BASE_URL = process.env.INTERNAL_API_BASE || 'http://115.124.86.220';

/**
 * Fetch and parse the haji list page.
 * Returns { rows: [...], complete: boolean } — complete=false means response was truncated
 * and the row list may be partial. Callers MUST NOT run cleanup when complete=false.
 */
export async function fetchHajiList(sessionCookies) {
  const res = await fetch(`${BASE_URL}/aiw/staff/pages/main.php?route=haji`, {
    headers: { 'Cookie': sessionCookies },
    redirect: 'manual',
  });

  // If redirect (302/301), session expired
  if (res.status === 302 || res.status === 301) {
    throw new Error('SESSION_EXPIRED');
  }

  const html = await res.text();
  const $ = cheerio.load(html);
  const rows = [];

  $('#example1 tbody tr').each((_, tr) => {
    const tds = $(tr).find('td');
    if (tds.length < 9) return; // skip incomplete rows

    const id_haji = $(tds[1]).text().trim();
    if (!id_haji || !id_haji.startsWith('HAJ')) return; // safety check

    rows.push({
      id_haji,
      thn_hijriyah: $(tds[2]).text().trim(),
      thn_masehi: $(tds[3]).text().trim(),
      perwakilan: $(tds[4]).text().trim(),
      marketing: $(tds[5]).text().trim(),
      paket: $(tds[6]).text().trim(),
      staff: $(tds[7]).text().trim(),
      jenis: $(tds[8]).text().trim(),
    });
  });

  const tail = html.slice(-4096).toLowerCase();
  const complete = tail.includes('</html>') || tail.includes('</body>');
  return { rows, complete };
}

/**
 * Fetch and parse haji detail page for a specific id_haji.
 * A single id_haji can have multiple jamaah (rows).
 * Returns array of { id_jamaah, nama, jk, alamat, telp, status_bayar, status_berangkat, bpih_url, surat_pernyataan_url }
 */
export async function fetchHajiDetail(sessionCookies, idHaji) {
  const res = await fetch(
    `${BASE_URL}/aiw/staff/pages/main.php?route=haji&act=detail&id=${idHaji}`,
    {
      headers: { 'Cookie': sessionCookies },
      redirect: 'manual',
    }
  );

  if (res.status === 302 || res.status === 301) {
    throw new Error('SESSION_EXPIRED');
  }

  const html = await res.text();
  const $ = cheerio.load(html);
  const jamaahList = [];

  // Detail table is inside .box-body .table tbody
  $('.box-body .table tbody tr').each((_, tr) => {
    const tds = $(tr).find('td');
    if (tds.length < 9) return;

    const id_jamaah = $(tds[1]).text().trim();
    if (!id_jamaah || !id_jamaah.startsWith('JM')) return;

    // Nama: trim spaces
    const nama = $(tds[2]).text().trim();

    // Alamat: may be wrapped in <small>
    const alamat = $(tds[3]).text().trim();

    // Kelamin: convert to L/P
    const kelaminRaw = $(tds[4]).text().trim().toLowerCase();
    const jk = kelaminRaw === 'laki-laki' ? 'L' : kelaminRaw === 'perempuan' ? 'P' : '';

    // Telp: format "0 / 081385226061" — take part after "/"
    const telpRaw = $(tds[5]).text().trim();
    const telpParts = telpRaw.split('/');
    const telp = (telpParts[telpParts.length - 1] || '').trim();

    // Status bayar: text in <b> tag, or fallback to all text
    const statusBayarEl = $(tds[6]);
    const statusBayar = statusBayarEl.find('b').text().trim()
      || statusBayarEl.text().trim();

    // Status berangkat
    const statusBerangkat = $(tds[7]).text().trim();

    // BPIH URL: look for <a> tag in last column
    const bpihLink = $(tds[8]).find('a');
    const bpihUrl = bpihLink.length ? bpihLink.attr('href') || '' : '';

    // Surat pernyataan URL: check dropdown in col 0 for link
    const pernyataanLink = $(tds[0]).find('a[href*="pendaftaran-haji"]');
    let suratPernyataanUrl = '';
    if (pernyataanLink.length) {
      suratPernyataanUrl = pernyataanLink.attr('href') || '';
      // Normalize: ensure relative paths start with /
      if (suratPernyataanUrl && !suratPernyataanUrl.startsWith('/') && !suratPernyataanUrl.startsWith('http')) {
        suratPernyataanUrl = `/aiw/staff/pages/${suratPernyataanUrl}`;
      }
    }

    jamaahList.push({
      id_jamaah,
      nama,
      jk,
      alamat,
      telp,
      status_bayar: statusBayar,
      status_berangkat: statusBerangkat,
      bpih_url: bpihUrl,
      surat_pernyataan_url: suratPernyataanUrl,
    });
  });

  return jamaahList;
}

/**
 * Full sync: fetch list → deduplicate → fetch details → merge → upsert to Supabase.
 *
 * @param {string} sessionCookies - Valid PHPSESSID cookie string
 * @param {string} agentId - Agent UUID
 * @param {object} supabase - Supabase client (service role)
 * @param {string} [agentSlug] - Agent slug (for logging only)
 * @returns {{ total: number, uniqueHaji: number }}
 */
export async function syncHajiData(sessionCookies, agentId, supabase, agentSlug = '') {
  const syncTime = new Date().toISOString();

  // Step 1: Fetch list
  const { rows: hajiList } = await fetchHajiList(sessionCookies);
  console.log(`[haji-sync] Found ${hajiList.length} haji entries for ${agentSlug || agentId}`);

  const allRows = [];

  // Step 2: Fetch detail per unique id_haji (deduplicate)
  // Use parallel batches of 5 for speed
  const uniqueIds = [...new Set(hajiList.map(h => h.id_haji))];
  const BATCH_SIZE = 5;

  for (let i = 0; i < uniqueIds.length; i += BATCH_SIZE) {
    const batch = uniqueIds.slice(i, i + BATCH_SIZE);

    const results = await Promise.allSettled(
      batch.map(async (idHaji) => {
        const details = await fetchHajiDetail(sessionCookies, idHaji);
        const listEntry = hajiList.find(h => h.id_haji === idHaji);
        return details.map(detail => ({
          agent_id: agentId,
          id_haji: idHaji,
          id_jamaah: detail.id_jamaah,
          nama: detail.nama,
          jk: detail.jk,
          alamat: detail.alamat,
          telp: detail.telp,
          thn_hijriyah: listEntry.thn_hijriyah,
          thn_masehi: listEntry.thn_masehi,
          perwakilan: listEntry.perwakilan,
          marketing: listEntry.marketing,
          paket: listEntry.paket,
          staff: listEntry.staff,
          jenis: listEntry.jenis,
          status_bayar: detail.status_bayar,
          status_berangkat: detail.status_berangkat,
          bpih_url: detail.bpih_url,
          surat_pernyataan_url: detail.surat_pernyataan_url,
          synced_at: syncTime,
        }));
      })
    );

    for (const result of results) {
      if (result.status === 'fulfilled') {
        allRows.push(...result.value);
      } else {
        const err = result.reason;
        console.error(`[haji-sync] Error fetching detail:`, err.message);
        if (err.message === 'SESSION_EXPIRED') throw err;
      }
    }

    // Small delay between batches
    if (i + BATCH_SIZE < uniqueIds.length) {
      await new Promise(r => setTimeout(r, 100));
    }

    console.log(`[haji-sync] ${agentSlug || agentId}: ${Math.min(i + BATCH_SIZE, uniqueIds.length)}/${uniqueIds.length} haji fetched`);
  }

  // Step 3: Upsert to Supabase
  if (allRows.length > 0) {
    const { error } = await supabase
      .from('jamaah_haji')
      .upsert(allRows, {
        onConflict: 'agent_id,id_haji,id_jamaah',
        defaultToNull: false,
      });

    if (error) {
      console.error('[haji-sync] Supabase upsert error:', error);
      throw error;
    }
  }

  // Step 4: Cleanup stale records no longer in internal system
  const { data: deleted, error: delErr } = await supabase
    .from('jamaah_haji')
    .delete()
    .eq('agent_id', agentId)
    .lt('synced_at', syncTime)
    .select('nama');
  if (delErr) console.error(`[haji-sync] ${agentSlug || agentId} cleanup error:`, delErr.message);
  else if (deleted?.length > 0) {
    console.log(`[haji-sync] ${agentSlug || agentId}: removed ${deleted.length} stale haji jamaah: ${deleted.map(d => d.nama).join(', ')}`);
  }

  console.log(`[haji-sync] Synced ${allRows.length} jamaah haji for ${agentSlug || agentId}`);
  return { total: allRows.length, uniqueHaji: uniqueIds.length };
}

/**
 * Extract UHUD/RAHMAH (or other tier) from Surat Pernyataan response text.
 * The page contains a row like "PAKET HAJI: Non Arbain ~ UHUD Quard" — we
 * match the text after the tilde, taking the first 1–2 capitalized words.
 *
 * Returns the matched fragment (e.g. "UHUD Quard"), or null if not found.
 */
export function extractPaketDetail(html) {
  if (!html || typeof html !== 'string') return null;
  // Try most specific pattern first: "Non Arbain ~ UHUD Quard" or "Arbain ~ RAHMAH ..."
  const tildeMatch = html.match(/(?:Non\s+)?Arbain\s*[~≈]\s*([A-Za-z][A-Za-z0-9\s]{0,40})/i);
  if (tildeMatch) {
    return tildeMatch[1].replace(/\s+/g, ' ').trim().split(/\s*<|\s*[\n\r]/)[0].trim();
  }
  // Fallback: bare UHUD or RAHMAH word
  const fallback = html.match(/\b(UHUD|RAHMAH)\b[A-Za-z\s]{0,20}/i);
  if (fallback) return fallback[0].trim();
  return null;
}

/**
 * Fetch a Surat Pernyataan page and extract the paket detail string.
 * Accepts either an absolute URL or relative path.
 *
 * @param {string} sessionCookies - PHPSESSID cookie string
 * @param {string} urlPath - surat_pernyataan_url from jamaah_haji row
 * @returns {Promise<string|null>}
 */
export async function fetchSuratPernyataanPaketDetail(sessionCookies, urlPath) {
  if (!urlPath) return null;

  let target = urlPath;
  if (target.startsWith('/')) {
    target = `${BASE_URL}${target}`;
  } else if (!target.startsWith('http')) {
    target = `${BASE_URL}/aiw/staff/pages/${target}`;
  }

  try {
    const res = await fetch(target, {
      headers: { 'Cookie': sessionCookies, 'User-Agent': 'Mozilla/5.0' },
      redirect: 'follow',
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const html = await res.text();
    return extractPaketDetail(html);
  } catch (err) {
    console.warn(`[pernyataan] fetch failed for ${urlPath}:`, err.message);
    return null;
  }
}
