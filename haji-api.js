/**
 * Haji API — Scraper for Haji data from legacy internal system
 *
 * Reuses session cookies from laporan-api.js (same legacy system).
 * Caller (server.js) is responsible for passing valid session cookies.
 *
 * Functions:
 *   fetchHajiList(sessionCookies)            → array of haji list entries
 *   fetchHajiDetail(sessionCookies, idHaji)  → array of jamaah per id_haji
 *   syncHajiData(sessionCookies, agentSlug, supabase) → full sync flow
 */

import * as cheerio from 'cheerio';

const BASE_URL = 'http://115.124.86.220';

/**
 * Fetch and parse the haji list page.
 * Returns array of { id_haji, thn_hijriyah, thn_masehi, perwakilan, marketing, paket, staff, jenis }
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

  return rows;
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
 * @param {string} agentSlug - Agent identifier
 * @param {object} supabase - Supabase client (service role)
 * @returns {{ total: number, uniqueHaji: number }}
 */
export async function syncHajiData(sessionCookies, agentSlug, supabase) {
  // Step 1: Fetch list
  const hajiList = await fetchHajiList(sessionCookies);
  console.log(`[haji-sync] Found ${hajiList.length} haji entries for ${agentSlug}`);

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
          agent_slug: agentSlug,
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
          synced_at: new Date().toISOString(),
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

    console.log(`[haji-sync] ${agentSlug}: ${Math.min(i + BATCH_SIZE, uniqueIds.length)}/${uniqueIds.length} haji fetched`);
  }

  // Step 3: Upsert to Supabase
  if (allRows.length > 0) {
    const { error } = await supabase
      .from('jamaah_haji')
      .upsert(allRows, {
        onConflict: 'agent_slug,id_haji,id_jamaah',
      });

    if (error) {
      console.error('[haji-sync] Supabase upsert error:', error);
      throw error;
    }
  }

  console.log(`[haji-sync] Synced ${allRows.length} jamaah haji for ${agentSlug}`);
  return { total: allRows.length, uniqueHaji: uniqueIds.length };
}
