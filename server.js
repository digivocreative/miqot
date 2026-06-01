// ⚠️ HARUS baris pertama — sebelum import apapun
import './instrument.mjs';

import { Agent, setGlobalDispatcher } from 'undici';
setGlobalDispatcher(new Agent({ connect: { family: 4 } }));

import express from 'express';
import * as Sentry from '@sentry/node';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config'; // ⚠️ Harus sebelum import file lokal agar env var terbaca

import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { Resend } from 'resend';
import { connectJamaah, fetchJamaah, disconnectJamaah, getSessionInfo } from './jamaah-api.js';
import { login as laporanLogin, fetchLaporan, parseLaporanHtml, isSessionActive, disconnect as laporanDisconnect, getSessionCookie, fetchUmrahBookings, fetchUmrahDetail, fetchUmrahFormOptions, fetchUmrahPaketOptions, fetchUmrahDependentOptions, fetchUmrahPaketDetails, submitUmrahRegistration, fetchAwapiCredentials } from './laporan-api.js';
import { fetchHajiList, fetchHajiDetail, syncHajiData, fetchSuratPernyataanPaketDetail } from './haji-api.js';
import { computeKomisi, computeBreakdownTahun, computeAvailableYears, pickDefaultYear, computeByPaket, computeBerangkatStats, KOMISI_STAGE1, KOMISI_RATE_UHUD, KOMISI_RATE_RAHMAH } from './lib/haji-stats.js';
import { buildBerangkatMendatang } from './lib/laporan-stats.js';
import { initNotifier, notifyJamaahSyncEvents, runBirthdayDigest, sendKursUpdate } from './telegram-notifier.js';
import { getBirthdaysForAgent } from './lib/birthdays.js';
import { buildJamaahDocumentCacheRow, buildPrintableJamaahDocumentHtml, isCacheableHtmlDocument, JAMAAH_DOCUMENT_TYPES } from './lib/jamaah-document-cache.js';
import { cleanupKursShareCache, formatKursDateForShare, getOrCreateKursShareImage } from './lib/kurs-share-cache.mjs';
import { syncCalendar, enrichKeberangkatanWithKumpul } from './calendar-api.js';
import { regenerateOgForAgent, generatePortalJamaahOgPng, loadAgentPhotoBuffer } from './lib/og-generator.mjs';
import { computeSafeDeletions } from './lib/sync-cleanup.js';
import { classifyAwapiSyncOutcome } from './lib/awapi-sync-outcome.js';
import { DEFAULT_UMROH_PHASE2_TIMES_WIB, nextJakartaScheduleDate, shouldDeferInlineUmrohPhase2 } from './lib/jamaah-phase2-policy.js';
import { preserveUmrohPhase1Enrichment } from './lib/jamaah-phase1-enrichment.js';
import {
  prepareLegacyPaymentRowForUpsert,
} from './lib/jamaah-payment-provenance.js';
import {
  awapiFetchUmrahByKeberangkatan,
  awapiFetchUmrahByPendaftaran,
  awapiFetchUmrahById,
  awapiFetchJamaahById,
  awapiFetchHajiByKeberangkatan,
  awapiFetchHajiByPendaftaran,
  normalizeAwapiHajiRow,
  normalizeAwapiRow,
  hasSuspiciousAwapiPayment,
  preserveExistingPaymentForSuspiciousAwapiRow,
  preserveLegacyUmrohRawData,
  AwapiError,
} from './awapi-client.js';
import {
  runAnalyticsMaintenance,
  fetchEventsForRange,
  countMatches,
  tallyBy,
  RAW_RETENTION_DAYS,
} from './lib/analytics-maintenance.js';
import { cleanBrochurePackageName, countBrochureTripDays, extractDurationFromName, isUmrohFirstRoute, parseSeatSisa, pickBrochurePackageDetails, groupPackagesByMonth } from './lib/brochure-schedule.js';
import { inferSaudiJourneyOrderFromItinerary } from './lib/journey-order.js';
import { appendUrlVersion, buildScheduleRows, hasValidPricing, serializeScheduleRows } from './lib/umroh-schedules.js';
import { buildCdnMetadataUpdate, getCdnFileDecision } from './lib/cdn-file-sync.js';
import {
  CURRENCY_NAMES,
  isKursCacheRefreshDue,
  isKursToday,
  parseMandiriKursHtml,
  shouldReplaceKursCache,
} from './lib/kurs-mandiri.js';
import { shouldRunBackgroundJobs } from './lib/background-jobs.js';
import { PDFParse as pdfParse } from 'pdf-parse';
import dns from 'dns/promises';
import cron from 'node-cron';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

// ── Supabase (service role for server-side access) ──
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-change-me';
const RESERVED_SPA_SLUGS = new Set(['', 'login', 'register', 'dashboard', 'admin', 'compare', 'reset-password', 'f']);

function withTimeout(promise, ms, message) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error(message);
      err.code = 'APP_TIMEOUT';
      reject(err);
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// ── Helper: fetch all rows from a Supabase query (bypasses 1000-row PostgREST limit) ──
async function fetchAllRows(queryBuilder) {
  const PAGE_SIZE = 1000;
  let allRows = [];
  let from = 0;
  while (true) {
    const { data, error } = await queryBuilder.range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    allRows = allRows.concat(data);
    if (data.length < PAGE_SIZE) break; // last page
    from += PAGE_SIZE;
  }
  return allRows;
}

function umrohPhase1EnrichmentKey(row) {
  return `${row?.id_umroh || ''}_${row?.jm_id || ''}`.toLowerCase();
}

async function mergeExistingUmrohPhase1Enrichment(agentId, rows) {
  const safeRows = Array.isArray(rows) ? rows : [];
  if (safeRows.length === 0) return [];

  const existingIduIds = [...new Set(safeRows.map(r => r.id_umroh).filter(Boolean))];
  const existingJmIds = [...new Set(safeRows.map(r => r.jm_id).filter(Boolean))];
  if (existingIduIds.length === 0 || existingJmIds.length === 0) {
    return safeRows.map(row => preserveUmrohPhase1Enrichment(row, null));
  }

  const { data: existingRows, error } = await supabase
    .from('jamaah')
    .select('id_umroh, jm_id, wa, tgl_lahir, perlengkapan, dokumen, no_paspor, paspor_expired, hijriah_year, tgl_berangkat')
    .eq('agent_id', agentId)
    .in('id_umroh', existingIduIds)
    .in('jm_id', existingJmIds);

  if (error) {
    console.warn('[Sync/P1] existing enrichment lookup failed:', error.message);
    return safeRows.map(row => preserveUmrohPhase1Enrichment(row, null));
  }

  const existingLookup = new Map();
  (existingRows || []).forEach(row => {
    existingLookup.set(umrohPhase1EnrichmentKey(row), row);
  });

  return safeRows.map(row => preserveUmrohPhase1Enrichment(row, existingLookup.get(umrohPhase1EnrichmentKey(row))));
}

app.use(express.json({ limit: '10mb' }));

// ──────────────────────────────────────────────
// Custom Domain — host detection + redirect middleware
// Harus dipasang sebelum semua route. Lookup agent by Host header,
// inject ke req.customDomainAgent supaya catch-all bisa pakai context yang sama.
// ──────────────────────────────────────────────

const agentDomainCache = new Map();
const AGENT_DOMAIN_CACHE_TTL = 5 * 60 * 1000;

function isCustomDomainEnabledForAgent(agent) {
  return Boolean(agent?.slug);
}

const PRIMARY_HOSTS = new Set(['alhijaz.co', 'www.alhijaz.co']);
function isPrimaryHost(host) {
  if (!host) return true;
  if (PRIMARY_HOSTS.has(host)) return true;
  if (host === 'localhost' || host.startsWith('127.') || host.startsWith('0.0.0.0')) return true;
  // local dev tunneling / preview hosts — skip custom domain logic
  if (host.endsWith('.localhost')) return true;
  return false;
}

async function getAgentByCustomDomain(host) {
  const key = (host || '').toLowerCase();
  if (!key) return null;
  const cached = agentDomainCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.agent;
  }
  const { data, error } = await supabase
    .from('agents')
    .select('*')
    .ilike('custom_domain', key)
    .eq('custom_domain_status', 'active')
    .limit(1)
    .maybeSingle();
  if (error) {
    console.warn('[custom-domain] lookup error for', key, '—', error.message);
    return null;
  }
  const agent = data && isCustomDomainEnabledForAgent(data) ? data : null;
  agentDomainCache.set(key, {
    agent,
    expiresAt: Date.now() + AGENT_DOMAIN_CACHE_TTL,
  });
  return agent;
}

function invalidateAgentDomainCache(host) {
  if (!host) return;
  agentDomainCache.delete(String(host).toLowerCase());
}

// 1) Host detection — set req.customDomainAgent when accessing via custom domain
app.use(async (req, res, next) => {
  const host = (req.hostname || '').toLowerCase();
  if (isPrimaryHost(host)) return next();
  try {
    const agent = await getAgentByCustomDomain(host);
    if (!agent) {
      return res.status(404).type('text/plain').send('Domain not configured for this service.');
    }
    req.customDomainAgent = agent;
    req.customDomain = host;
    next();
  } catch (err) {
    console.error('[custom-domain] host middleware error:', err);
    return res.status(500).type('text/plain').send('Internal Server Error');
  }
});

// 2) Pada custom domain: canonicalize URL (strip own slug), redirect auth, blokir /api/* sensitif
app.use((req, res, next) => {
  if (!req.customDomain) return next();
  const path = req.path || '/';
  // a) Strip own-slug prefix: miqot.com/nikita/umroh → miqot.com/umroh
  if (req.customDomainAgent) {
    const ownSlug = String(req.customDomainAgent.slug || '').toLowerCase();
    const firstSeg = path.split('/').filter(Boolean)[0]?.toLowerCase();
    if (ownSlug && firstSeg && firstSeg === ownSlug) {
      const restPath = path.replace(/^\/[^/]+/, '') || '/';
      const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
      return res.redirect(301, restPath + qs);
    }
  }
  const isAuthPath =
    path.startsWith('/dashboard') ||
    path === '/login' ||
    path.startsWith('/login/') ||
    path === '/register' ||
    path.startsWith('/register/') ||
    path === '/admin' ||
    path.startsWith('/admin/') ||
    path.startsWith('/reset-password');
  if (isAuthPath) {
    const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
    return res.redirect(301, `https://alhijaz.co${path}${qs}`);
  }
  if (path.startsWith('/api/')) {
    const isSensitiveApi =
      path.startsWith('/api/auth/') ||
      path === '/api/auth' ||
      path.startsWith('/api/admin/') ||
      path.startsWith('/api/agent/custom-domain');
    if (isSensitiveApi) {
      return res.status(404).type('text/plain').send('API only available on alhijaz.co');
    }
  }
  next();
});

// 3) Pada alhijaz.co: redirect /{slug}/... ke custom domain kalau agent punya
app.use(async (req, res, next) => {
  const host = (req.hostname || '').toLowerCase();
  if (!PRIMARY_HOSTS.has(host)) return next();
  const pathParts = req.path.split('/').filter(Boolean);
  const slug = (pathParts[0] || '').toLowerCase();
  if (!slug) return next();
  if (RESERVED_SPA_SLUGS.has(slug)) return next();
  if (slug.startsWith('api') || slug === 'dashboard') return next();
  try {
    const agent = await getAgentBySlug(slug);
    if (!isCustomDomainEnabledForAgent(agent)) return next();
    if (!agent?.custom_domain || agent.custom_domain_status !== 'active') return next();
    const restPath = pathParts.slice(1).join('/');
    const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
    const target = `https://${agent.custom_domain}/${restPath}${qs}`;
    return res.redirect(301, target);
  } catch (err) {
    console.warn('[custom-domain] alhijaz redirect lookup failed:', err.message);
    next();
  }
});

// ── Analytics: fire-and-forget event logger ──
function getClientIpUa(req) {
  if (!req) return { ip: null, userAgent: null };
  const fwd = req.headers?.['x-forwarded-for'] || '';
  const ip = (typeof fwd === 'string' ? fwd.split(',')[0].trim() : '') || req.ip || null;
  const userAgent = req.headers?.['user-agent'] || null;
  return { ip, userAgent };
}

async function logAnalyticsEvent(agentId, eventType, eventName, metadata = {}, opts = {}) {
  if (!agentId) {
    console.warn('[Analytics] Skipping event with null agent_id:', { eventType, eventName });
    return { ok: false, error: 'missing agent_id' };
  }
  try {
    const { error } = await supabase.from('analytics_events').insert({
      agent_id: agentId,
      event_type: eventType,
      event_name: eventName,
      metadata,
      ip: opts.ip || null,
      user_agent: opts.userAgent || null,
    });
    if (error) {
      console.error('[Analytics] Supabase insert error:', error.message, error.details);
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (err) {
    console.error('[Analytics] Log error:', err.message);
    return { ok: false, error: err.message };
  }
}

// ── Stats cache (60s TTL, per agent+year) ────────────────────────────
const STATS_TTL_MS = 60 * 1000;
const statsCache = new Map(); // key -> { data, expiresAt }

function statsCacheGet(key) {
  const entry = statsCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    statsCache.delete(key);
    return null;
  }
  return entry.data;
}

function statsCacheSet(key, data) {
  statsCache.set(key, { data, expiresAt: Date.now() + STATS_TTL_MS });
}

function invalidateStatsCache(agentId) {
  if (!agentId) return;
  for (const k of statsCache.keys()) {
    if (k.includes(`:${agentId}:`)) statsCache.delete(k);
  }
}

// Periodic cleanup of expired entries (every 5 min)
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of statsCache.entries()) {
    if (now > v.expiresAt) statsCache.delete(k);
  }
}, 5 * 60 * 1000);

// ============ KURS BANK MANDIRI ============
let kursCache = null; // { rates: { USD: number, ... }, updatedAt: string, fetchedAt: number }
const KURS_CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours
const KURS_REFRESH_INTERVAL = Number(process.env.KURS_REFRESH_INTERVAL_MS || 30 * 60 * 1000); // 30 minutes
let kursRefreshInFlight = null;

async function loadKursFromSupabase() {
  try {
    const { data, error } = await supabase
      .from('kurs_cache')
      .select('data, synced_at')
      .eq('id', 'mandiri')
      .single();
    if (error || !data) return false;
    kursCache = {
      rates: data.data.rates,
      updatedAt: data.data.updatedAt,
      fetchedAt: new Date(data.synced_at).getTime(),
    };
    console.log(`[Kurs] Loaded from Supabase. USD=${kursCache.rates.USD}, synced: ${data.synced_at}`);
    return true;
  } catch (err) {
    console.error('[Kurs] Supabase load error:', err.message);
    return false;
  }
}

// Returns true if fetched data is from today, false otherwise
async function fetchKursMandiri() {
  try {
    const res = await fetch('https://www.bankmandiri.co.id/kurs', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
        'Referer': 'https://www.bankmandiri.co.id/',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'same-origin',
        'Sec-Ch-Ua': '"Chromium";v="135", "Google Chrome";v="135", "Not-A.Brand";v="8"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"',
        'Cache-Control': 'no-cache',
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    const { rates, updatedAt } = parseMandiriKursHtml(html);

    if (Object.keys(rates).length > 0) {
      const nextCache = {
        rates,
        updatedAt: updatedAt || new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }),
        fetchedAt: Date.now(),
      };
      if (!shouldReplaceKursCache(kursCache, nextCache)) {
        console.log(`[Kurs] Fetched older data (${nextCache.updatedAt}); keeping cache ${kursCache.updatedAt}`);
        kursCache.fetchedAt = Date.now();
        return isKursToday(kursCache.updatedAt);
      }
      kursCache = nextCache;
      console.log(`[Kurs] Fetched ${Object.keys(rates).length} currencies. USD=${rates.USD}, SAR=${rates.SAR}, date=${updatedAt}`);

      // Persist to Supabase
      try {
        await supabase.from('kurs_cache').upsert({
          id: 'mandiri',
          data: { rates: kursCache.rates, updatedAt: kursCache.updatedAt },
          synced_at: new Date().toISOString(),
        }, { onConflict: 'id' });
        console.log('[Kurs] Persisted to Supabase');
      } catch (err) {
        console.error('[Kurs] Supabase persist error:', err.message);
      }

      return isKursToday(kursCache.updatedAt);
    } else {
      console.warn('[Kurs] Gagal parse rates dari halaman Bank Mandiri');
      return false;
    }
  } catch (err) {
    console.error('[Kurs] Fetch error:', err.message);
    return false;
  }
}

async function refreshKursIfDue({ force = false } = {}) {
  if (!force && !isKursCacheRefreshDue(kursCache, Date.now(), KURS_REFRESH_INTERVAL)) {
    return isKursToday(kursCache?.updatedAt);
  }
  if (!kursRefreshInFlight) {
    kursRefreshInFlight = fetchKursMandiri().finally(() => {
      kursRefreshInFlight = null;
    });
  }
  return kursRefreshInFlight;
}

// On startup: load from Supabase, then fetch fresh if cache is missing or stale.
// Telegram broadcast is NOT triggered here — only after the scheduled daily
// scrape (10:02 WIB) succeeds. This prevents re-broadcasting whenever the
// server restarts during the day.
(async () => {
  const loaded = await loadKursFromSupabase();
  if (!loaded) {
    console.log('[Kurs] No Supabase cache, attempting first fetch...');
    await refreshKursIfDue({ force: true });
  } else if (isKursCacheRefreshDue(kursCache, Date.now(), KURS_REFRESH_INTERVAL)) {
    console.log('[Kurs] Cached kurs is due for refresh, fetching fresh...');
    await refreshKursIfDue({ force: true });
  }
})();

const KURS_RETRY_INTERVAL = 15 * 60 * 1000; // 15 minutes
const KURS_MAX_RETRIES = 8;

function scheduleKursCron() {
  const now = new Date();
  // 10:02 WIB = 03:02 UTC
  const next = new Date(now);
  next.setUTCHours(3, 2, 0, 0);
  if (next <= now) {
    next.setUTCDate(next.getUTCDate() + 1);
  }
  const msUntil = next - now;
  const wibHour = (next.getUTCHours() + 7) % 24;
  const wibMin = String(next.getUTCMinutes()).padStart(2, '0');
  console.log(`[Kurs] Next daily fetch in ${Math.round(msUntil / 60000)} minutes (${wibHour}:${wibMin} WIB)`);
  setTimeout(async () => {
    await fetchKursWithRetry();
    scheduleKursCron();
  }, msUntil);
}

async function fetchKursWithRetry() {
  for (let attempt = 1; attempt <= KURS_MAX_RETRIES; attempt++) {
    const isCurrent = await fetchKursMandiri();
    if (isCurrent) {
      console.log(`[Kurs] Got today's rates on attempt ${attempt}`);
      sendKursUpdate().catch(err => console.error('[Kurs] post-scrape send error:', err.message));
      return;
    }
    if (attempt < KURS_MAX_RETRIES) {
      console.log(`[Kurs] Data belum hari ini (attempt ${attempt}/${KURS_MAX_RETRIES}), retry in 15 min...`);
      await new Promise(r => setTimeout(r, KURS_RETRY_INTERVAL));
    } else {
      console.warn(`[Kurs] Max retries reached (${KURS_MAX_RETRIES}), using latest available data`);
    }
  }
}

if (shouldRunBackgroundJobs()) {
  scheduleKursCron();
} else {
  console.log('[BackgroundJobs] Disabled — skipping kurs daily fetch and Telegram broadcast scheduler');
}

async function runKursShareCacheCleanup(reason = 'scheduled') {
  try {
    const stats = await cleanupKursShareCache();
    console.log(
      `[KursShareCache] Cleanup ${reason}: scanned=${stats.scanned}, ` +
      `expired=${stats.deletedExpired}, size=${stats.deletedForSize}, ` +
      `freed=${Math.round(stats.freedBytes / 1024)}KB, remaining=${Math.round(stats.remainingBytes / 1024)}KB`
    );
  } catch (err) {
    console.warn('[KursShareCache] Cleanup failed:', err.message);
  }
}

runKursShareCacheCleanup('startup');
cron.schedule('30 3 * * *', () => {
  runKursShareCacheCleanup('daily');
}, { timezone: 'Asia/Jakarta' });

function scheduleAnalyticsMaintenanceCron() {
  const now = new Date();
  // 02:00 WIB = 19:00 UTC previous day
  const next = new Date(now);
  next.setUTCHours(19, 0, 0, 0);
  if (next <= now) {
    next.setUTCDate(next.getUTCDate() + 1);
  }
  const msUntil = next - now;
  const wibHour = (next.getUTCHours() + 7) % 24;
  const wibMin = String(next.getUTCMinutes()).padStart(2, '0');
  console.log(`[Analytics] Next maintenance run in ${Math.round(msUntil / 60000)} minutes (${wibHour}:${wibMin} WIB)`);
  setTimeout(async () => {
    try {
      await runAnalyticsMaintenance(supabase);
    } catch (err) {
      console.error('[Analytics] Maintenance run threw:', err.message);
    }
    scheduleAnalyticsMaintenanceCron();
  }, msUntil);
}

scheduleAnalyticsMaintenanceCron();

// GET /api/kurs — Kurs semua mata uang (public, no auth)
app.get('/api/kurs', async (req, res) => {
  if (isKursCacheRefreshDue(kursCache, Date.now(), KURS_REFRESH_INTERVAL)) {
    await refreshKursIfDue();
  }
  if (!kursCache || Object.keys(kursCache.rates).length === 0) {
    return res.json({
      success: false,
      error: 'Kurs belum tersedia, coba lagi nanti',
    });
  }
  res.json({
    success: true,
    data: {
      rates: kursCache.rates,
      names: CURRENCY_NAMES,
      updatedAt: kursCache.updatedAt,
      stale: Date.now() - kursCache.fetchedAt > KURS_CACHE_TTL * 2,
    },
  });
});

// GET /api/kurs/share-image — per-agent kurs image, generated on demand and cached on disk.
app.get('/api/kurs/share-image', authMiddleware, async (req, res) => {
  try {
    if (!kursCache || Object.keys(kursCache.rates || {}).length === 0) {
      return res.status(503).json({
        success: false,
        error: 'Kurs belum tersedia, coba lagi nanti',
      });
    }

    const usd = kursCache.rates?.USD;
    if (!usd) {
      return res.status(503).json({
        success: false,
        error: 'Kurs USD belum tersedia',
      });
    }

    const agent = await getAgentById(req.user.id);
    if (!agent) return res.status(404).json({ success: false, error: 'Agent not found' });

    const result = await getOrCreateKursShareImage({
      kurs: {
        usd,
        updatedAt: formatKursDateForShare(kursCache.updatedAt),
      },
      agent: {
        name: agent.name || '',
        phone: agent.phone || '',
        photo: agent.photo || '',
        slug: agent.slug || req.user.slug,
        website: agent.website || '',
      },
    });

    const dateForFilename = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' }).replace(/-/g, '');
    const filename = `kurs-${agent.slug || req.user.slug}-${dateForFilename}.jpg`;
    res.set({
      'Content-Type': 'image/jpeg',
      'Content-Length': String(result.buffer.length),
      'Content-Disposition': `inline; filename="${filename}"`,
      'Cache-Control': 'no-store',
      'X-Kurs-Image-Cache': result.cacheHit ? 'HIT' : 'MISS',
    });
    res.send(result.buffer);
  } catch (err) {
    console.error('[KursShare] Generate error:', err.message);
    try { Sentry.captureException(err); } catch { /* noop */ }
    res.status(500).json({
      success: false,
      error: 'Gagal generate gambar kurs',
    });
  }
});


// ── Jamaah API routes (must be before catch-all) ──
app.post('/api/jamaah/connect', authMiddleware, async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username dan password wajib diisi' });
  }
  const result = await connectJamaah(username, password);
  if (!result.success) {
    return res.status(401).json(result);
  }
  res.json(result);
});

app.post('/api/jamaah/fetch', authMiddleware, async (req, res) => {
  const { sessionId, path } = req.body;
  if (!sessionId) {
    return res.status(400).json({ error: 'sessionId wajib diisi' });
  }
  const result = await fetchJamaah(sessionId, path || '/');
  if (!result.success) {
    return res.status(result.error?.includes('kedaluwarsa') ? 401 : 500).json(result);
  }
  res.json(result);
});

app.post('/api/jamaah/disconnect', authMiddleware, async (req, res) => {
  const { sessionId } = req.body;
  if (!sessionId) return res.status(400).json({ error: 'sessionId wajib diisi' });
  const result = disconnectJamaah(sessionId);
  res.json(result);
});

app.get('/api/jamaah/session/:id', authMiddleware, (req, res) => {
  const info = getSessionInfo(req.params.id);
  if (!info) return res.status(404).json({ error: 'Session tidak ditemukan' });
  res.json(info);
});

// Jamaah ulang tahun: hari ini + 3 hari ke depan (Asia/Jakarta), literal month/day match.
const BIRTHDAY_LOOKUP_TIMEOUT_MS = 4500;
const BIRTHDAY_CACHE_TTL_MS = 15 * 60 * 1000;
const birthdayCache = new Map(); // agentId -> { birthdays, expiresAt }

function getBirthdayResponsePayload(birthdays, extra = {}) {
  const today_count = birthdays.filter(b => b.day_offset === 0).length;
  return {
    success: true,
    count: birthdays.length,
    today_count,
    birthdays,
    ...extra,
  };
}

app.get('/api/jamaah/birthdays', authMiddleware, async (req, res) => {
  const cacheKey = req.user.id;
  const cached = birthdayCache.get(cacheKey);
  try {
    const birthdays = await withTimeout(
      getBirthdaysForAgent(supabase, req.user.id, [0, 1, 2, 3]),
      BIRTHDAY_LOOKUP_TIMEOUT_MS,
      'Birthday lookup timed out',
    );
    birthdayCache.set(cacheKey, {
      birthdays,
      expiresAt: Date.now() + BIRTHDAY_CACHE_TTL_MS,
    });
    res.json(getBirthdayResponsePayload(birthdays));
  } catch (err) {
    if (cached?.birthdays && Date.now() < cached.expiresAt) {
      return res.json(getBirthdayResponsePayload(cached.birthdays, { stale: true }));
    }
    if (err.code === 'APP_TIMEOUT' || /upstream request timeout|timeout/i.test(err.message || '')) {
      console.warn('[Birthdays] lookup timeout, returning empty fallback');
      return res.json(getBirthdayResponsePayload([], {
        stale: true,
        warning: 'Birthday data temporarily unavailable',
      }));
    }
    console.error('[Birthdays] error:', err.message);
    try { Sentry.captureException(err); } catch { /* noop */ }
    res.status(500).json({ success: false, error: err.message });
  }
});

// Dev-only: trigger birthday digest cron manually (skipped in production).
if (process.env.NODE_ENV !== 'production') {
  app.post('/api/dev/trigger-birthday-digest', authMiddleware, async (req, res) => {
    try {
      const result = await runBirthdayDigest();
      res.json({ success: true, message: 'Digest triggered', ...result });
    } catch (err) {
      console.error('[Birthdays/dev-trigger] error:', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });
}

// ── JWT Auth middleware ──
async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token required' });
  }
  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    // Backward compat: old tokens don't have id, resolve from slug
    if (!decoded.id && decoded.slug) {
      let agent = await getAgentBySlug(decoded.slug);
      // If slug was changed, check history
      if (!agent) {
        const { data: history } = await supabase
          .from('agent_slug_history')
          .select('agent_id')
          .eq('old_slug', decoded.slug)
          .order('changed_at', { ascending: false })
          .limit(1)
          .single();
        if (history) agent = await getAgentById(history.agent_id);
      }
      if (agent) {
        decoded.id = agent.id;
        decoded.slug = agent.slug; // update to current slug
      }
    }
    if (!decoded.id) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    req.user = decoded; // { id, slug, name, role }
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function adminOnly(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

// ── Agent cache (in-memory, refreshes every 5 minutes) ──
let agentCacheById = null;
let agentCacheBySlug = null;
let agentCacheTime = 0;
const AGENT_CACHE_TTL = 5 * 60 * 1000; // 5 min

async function getAgents() {
  if (agentCacheById && Date.now() - agentCacheTime < AGENT_CACHE_TTL) return agentCacheById;
  const { data, error } = await supabase.from('agents').select('*');
  if (error) { console.error('[Supabase] agents fetch error:', error.message); return agentCacheById || {}; }
  const idMap = {};
  const slugMap = {};
  for (const a of data) {
    idMap[a.id] = a;
    slugMap[a.slug] = a;
  }
  agentCacheById = idMap;
  agentCacheBySlug = slugMap;
  agentCacheTime = Date.now();
  return idMap;
}

async function getAgentsBySlug() {
  await getAgents();
  return agentCacheBySlug || {};
}

async function getAgentById(id) {
  const agents = await getAgents();
  return agents[id] || null;
}

async function getAgentBySlug(slug) {
  await getAgents();
  return (agentCacheBySlug || {})[slug] || null;
}

function invalidateAgentCache() {
  agentCacheById = null;
  agentCacheBySlug = null;
  agentCacheTime = 0;
}

// ── umroh_schedules in-memory cache ──
// Used by /api/laporan/jamaah to enrich rows with jadwal_nama without hitting DB
// each request. Schedules table is small (<200 rows total) and rarely changes
// (sync runs ~daily), so a simple full-table cache with TTL is plenty.
let scheduleMapCache = { map: null, expiresAt: 0 };
const SCHEDULE_CACHE_TTL_MS = 5 * 60 * 1000;
async function getScheduleMap() {
  if (scheduleMapCache.map && Date.now() < scheduleMapCache.expiresAt) {
    return scheduleMapCache.map;
  }
  const { data: schedules, error } = await supabase
    .from('umroh_schedules')
    .select('jadwal_id, jadwal_nama');
  if (error) {
    console.warn('[scheduleMap] fetch failed, returning empty map:', error.message);
    return new Map();
  }
  const map = new Map((schedules || []).map(s => [s.jadwal_id, s.jadwal_nama]));
  scheduleMapCache = { map, expiresAt: Date.now() + SCHEDULE_CACHE_TTL_MS };
  return map;
}

// ── Landing config helpers ──
// Raw description from /public/{umroh,haji-plus}.html — read once at boot.
// Shown to agents as placeholder text so they see the literal fallback the public page serves.
let rawLandingDescription = { umroh: '', haji: '' };
try {
  const extractDescription = (html) => {
    const m = html.match(/<meta\s+name=["']description["']\s+content=["']([^"']*)["']/i);
    return m ? m[1] : '';
  };
  const umrohHtml = readFileSync(resolve(__dirname, 'public/umroh.html'), 'utf-8');
  const hajiHtml = readFileSync(resolve(__dirname, 'public/haji-plus.html'), 'utf-8');
  rawLandingDescription = {
    umroh: extractDescription(umrohHtml),
    haji: extractDescription(hajiHtml),
  };
} catch (e) {
  console.warn('[LandingConfig] Could not read raw HTML descriptions:', e.message);
}

function getDefaultLandingConfig(agent) {
  const name = agent?.name || 'Alhijaz';
  return {
    umroh: {
      title: `Umroh | ${name} | PT Alhijaz Indowisata`,
      description: null,   // null = don't inject; raw HTML description stays
      og_image_url: null,  // null = fall back to /og/{slug}.png
    },
    haji: {
      title: `Haji Plus | ${name} | PT Alhijaz Indowisata`,
      description: null,
      og_image_url: null,
    },
  };
}

function mergeLandingConfig(agent) {
  const defaults = getDefaultLandingConfig(agent);
  const custom = agent?.landing_config || {};
  return {
    umroh: {
      title: custom.umroh?.title || defaults.umroh.title,
      description: custom.umroh?.description ?? defaults.umroh.description,
      og_image_url: custom.umroh?.og_image_url ?? defaults.umroh.og_image_url,
    },
    haji: {
      title: custom.haji?.title || defaults.haji.title,
      description: custom.haji?.description ?? defaults.haji.description,
      og_image_url: custom.haji?.og_image_url ?? defaults.haji.og_image_url,
    },
  };
}

function invalidateLandingCaches(slug) {
  umrohLandingCache.delete(slug);
  hajiLandingCache.delete(slug);
}

// Fire-and-forget: regenerate /public/og/{slug}.png using fresh agent data.
// Safe to call from any request handler — never throws, never blocks the response.
function triggerOgRegen(slug) {
  if (!slug) return;
  const normalizedSlug = String(slug).toLowerCase();
  (async () => {
    try {
      // Fetch fresh from Supabase (bypass any stale cache)
      const { data, error } = await supabase
        .from('agents')
        .select('slug, name, website, phone, photo')
        .eq('slug', normalizedSlug)
        .maybeSingle();
      if (error || !data) {
        console.warn(`[og-regen] Skipping ${normalizedSlug}:`, error?.message || 'not found');
        return;
      }
      await regenerateOgForAgent(data);
      // Bust the SSR landing-page HTML cache so the new OG URL is re-read on next request
      invalidateLandingCaches(normalizedSlug);
    } catch (err) {
      console.warn(`[og-regen] Failed for ${normalizedSlug}:`, err.message);
    }
  })();
}

// ── Sync state tracking (in-memory) ──
const syncingAgents = new Map(); // agentId → { isSyncing, totalSynced, lastSync }

// ──────────────────────────────────────────────
// API: AI Copywriting (OpenAI proxy)
// ──────────────────────────────────────────────
app.post('/api/ai-copy', async (req, res) => {
  const OPENAI_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_KEY) {
    return res.status(500).json({ error: 'OPENAI_API_KEY not configured in .env' });
  }

  try {
    const { packageData: pkg, agentName = '', agentWebsite = '' } = req.body;

    if (!pkg || !pkg.nama) {
      return res.status(400).json({ error: 'Missing packageData' });
    }

    const hotelData = pkg.hotel || {};
    const pricing = pkg.harga;
    let pricingInfo = '';
    if (pricing) {
      const prices = [];
      if (pricing.Quard) prices.push(`Quad: Rp ${Number(pricing.Quard).toLocaleString('id-ID')}`);
      if (pricing.Triple) prices.push(`Triple: Rp ${Number(pricing.Triple).toLocaleString('id-ID')}`);
      if (pricing.Double) prices.push(`Double: Rp ${Number(pricing.Double).toLocaleString('id-ID')}`);
      pricingInfo = prices.join(', ');
    }

    const systemPrompt = `Kamu adalah copywriter untuk travel umroh Alhijaz Indowisata.
Tugas kamu menulis caption promosi WhatsApp yang santai, hangat, dan persuasif tapi tetap islami.
Gunakan emoji secukupnya. Gunakan format WhatsApp (*bold*, _italic_) secukupnya.
Tulis dengan gaya ngobrol ke teman — friendly, tidak kaku, tidak terlalu formal.
Caption harus ringkas dan to the point, mudah dibaca di layar HP (maks 500 karakter).
Jangan gunakan hashtag. Jangan gunakan markdown selain format WhatsApp.
Jangan terlalu banyak baris kosong.`;

    const userPrompt = `Buatkan caption promosi WhatsApp untuk paket umroh ini:

Nama Paket: ${pkg.nama}
Maskapai: ${pkg.maskapai || '-'} (${pkg.keberangkatan?.kodePenerbangan || '-'})
Rute: ${pkg.keberangkatan?.rute || '-'}
Tanggal Berangkat: ${pkg.keberangkatan?.tgl || '-'}
Tanggal Pulang: ${pkg.kepulangan?.tgl || '-'}
Hotel Mekkah: ${hotelData?.mekkah_hotel || '-'} (${hotelData?.mekkah_bintang || '-'} bintang)
Hotel Madinah: ${hotelData?.madinah_hotel || '-'} (${hotelData?.madinah_bintang || '-'} bintang)
Sisa Seat: ${pkg.seatSisa ?? '-'} dari ${pkg.seatTotal ?? '-'}
Harga: ${pricingInfo || 'Hubungi kami'}
${agentName ? `\nAgent: ${agentName}` : ''}
${agentWebsite ? `Website: ${agentWebsite}` : ''}

Buat caption yang membuat orang tertarik untuk segera mendaftar.`;

    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.85,
        max_tokens: 380,
      }),
    });

    if (!openaiRes.ok) {
      const errBody = await openaiRes.text();
      console.error('OpenAI error:', errBody);
      return res.status(502).json({ error: 'OpenAI API error', details: errBody });
    }

    const result = await openaiRes.json();
    const generatedText = result.choices?.[0]?.message?.content || '';
    res.json({ text: generatedText });

  } catch (error) {
    console.error('AI Copy error:', error);
    res.status(500).json({ error: 'Internal error', message: error.message });
  }
});

// CORS preflight for /api/ai-copy
app.options('/api/ai-copy', (req, res) => {
  res.set({
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  }).sendStatus(204);
});

// ──────────────────────────────────────────────
// API: Tanya AI — conversational AI per paket (public)
// ──────────────────────────────────────────────
// Accept any chipKey of shape [a-z0-9-]{1,30} or "free". Whitelist previously
// required backend changes for every new chip — format validation is enough.
const ASK_AI_CHIP_KEY_PATTERN = /^[a-z0-9-]{1,30}$/;
const askAiRateLimitMap = new Map(); // ip → { count, resetAt }
const ASK_AI_RATE_LIMIT_MAX = 10;
const ASK_AI_RATE_LIMIT_WINDOW = 60 * 1000; // 60s
const ASK_AI_CACHE_TTL_DAYS = 7;
const ASK_AI_FALLBACK_NOTE = 'Konsultan kami siap bantu langsung di WhatsApp 🙂';

// Hotel distance lookup — duplicated from src/data/hotelService.ts (client-side only).
// Keys: uppercase hotel name without "/SETARAF" suffix. Values: jarak ke masjid terdekat.
const ASK_AI_HOTEL_DISTANCES = {
  // Mekkah
  'PULLMAN ZAMZAM': '±50m',
  'MOVENPICK': '±100m',
  'PRESTIGE EX ELAF AL MASHAER': '±300m',
  'AL MASSA GRAND': '±400m',
  'AL MASSA DAR AL FAYZEEN': '±1.8km',
  'ROYAL MAJESTIC': '±300m',
  'RAYYANA AJYAD': '±300m',
  'SOFWAH ROYAL ORCHID': '±50m',
  'SAJA MAKKAH EX LE MERIDIEN TOWERS MAKKAH': '±2.5km',
  // Madinah
  'AL HARAM': '±50m',
  'DEYAR AL EIMAN': '±50m',
  'AL RITZ AL MADINAH': '±150m',
  'GRAND PLAZA': '±150m',
  'ODST ALMADINAH': '±200m',
  'ARTAL INTERNATIONAL': '±700m',
  'ANWAR ALMADINAH MOVENPICK': '±200m',
};

function hashQuestion(question) {
  return crypto.createHash('sha256')
    .update(question.toLowerCase().trim())
    .digest('hex');
}

function getAskAiFirstName(agentName) {
  return (agentName || '').trim().split(/\s+/)[0] || 'konsultan';
}

function getAskAiFallback(agentName) {
  const first = getAskAiFirstName(agentName);
  return {
    success: false,
    answer: `Waduh, asistennya lagi sibuk, Kak 😅 Coba chat **${first}** langsung aja ya — biasanya lebih cepet kalau lagi butuh info.`,
    note: agentName ? `**${first}** cepet kok balesnya di WhatsApp 🙂` : ASK_AI_FALLBACK_NOTE,
    fallback: true,
    attachment: null,
  };
}

function resolveAskAiAttachment(pkg, attachmentType) {
  if (!pkg || !attachmentType) return null;
  if (attachmentType === 'brosur') {
    const url = pkg.brosur_cdn
      ? appendUrlVersion(pkg.brosur_cdn, pkg.brosur_source_sha256)
      : pkg.brosur;
    if (!url) return null;
    return { type: 'brosur', url: String(url), title: pkg.jadwal_nama || pkg.nama || 'Brosur' };
  }
  if (attachmentType === 'itinerary') {
    const url = pkg.itinerary_cdn
      ? appendUrlVersion(pkg.itinerary_cdn, pkg.itinerary_source_sha256)
      : pkg.itinerary;
    if (!url) return null;
    return { type: 'itinerary', url: String(url), title: pkg.jadwal_nama || pkg.nama || 'Itinerary' };
  }
  return null;
}

function maskAskAiPhone(phone) {
  if (!phone) return '';
  const s = String(phone).replace(/\D/g, '');
  if (s.length < 6) return '***';
  return `${s.slice(0, 3)}****${s.slice(-3)}`;
}

// Derive human-readable itinerary order from flight routes.
// Examples:
//   "CGK - JED" / "MED - CGK"                    → Mekkah dulu, lalu Madinah
//   "CGK - MED" / "JED - CGK"                    → Madinah dulu, lalu Mekkah
//   "CGK-DXB/DXB-MED" / "JED-DXB/DXB-CGK"        → Transit Dubai, lalu Madinah-Mekkah
//   "CGK-JED/JED-CAI/CAI-MED" / "JED-CGK"        → Mekkah, Kairo, Madinah
const ASK_AI_CITY_NAMES = {
  CGK: 'Jakarta', JKT: 'Jakarta', SUB: 'Surabaya', KNO: 'Medan',
  DPS: 'Denpasar', BPN: 'Balikpapan', PDG: 'Padang', PKU: 'Pekanbaru',
  JED: 'Jeddah', MED: 'Madinah',
  CAI: 'Kairo', ALY: 'Alexandria',
  DXB: 'Dubai', AUH: 'Abu Dhabi', DOH: 'Doha',
  IST: 'Istanbul', SAW: 'Istanbul', BTS: 'Bursa', NAV: 'Cappadocia',
  KAY: 'Cappadocia', ANK: 'Ankara',
  HAK: 'Haikou', PEK: 'Beijing', SHA: 'Shanghai', CAN: 'Guangzhou',
  KUL: 'Kuala Lumpur', SIN: 'Singapura', BKK: 'Bangkok',
};

function inferItineraryOrder(pkg) {
  const parseLegs = (rute) => {
    if (!rute) return [];
    return String(rute).split('/').map(s => {
      const parts = s.split('-').map(p => p.trim().toUpperCase());
      return parts.length === 2 && parts[0] && parts[1] ? { from: parts[0], to: parts[1] } : null;
    }).filter(Boolean);
  };
  const label = c => ASK_AI_CITY_NAMES[c] || c;

  const depart = parseLegs(pkg.berangkat_rute);
  const ret = parseLegs(pkg.pulang_rute);
  if (!depart.length) return null;

  const chain = [];
  depart.forEach((l, i) => {
    if (i === 0) chain.push(l.from);
    chain.push(l.to);
  });
  ret.forEach(l => {
    if (chain[chain.length - 1] !== l.from) chain.push(l.from);
    chain.push(l.to);
  });

  // The LAST arrival in the depart chain is where the ibadah route actually
  // begins. Intermediate landings (e.g. JED before CAI, DXB before MED) are
  // TRANSIT or Plus-tour side-trips — NOT the Umroh start.
  const firstArrival = depart[0].to;
  const lastDepartArrival = depart[depart.length - 1].to;

  let urutanUmroh;
  if (lastDepartArrival === 'JED') {
    urutanUmroh = 'Mekkah dulu (landing Jeddah → langsung ke Mekkah untuk Umroh), lalu Madinah';
  } else if (lastDepartArrival === 'MED') {
    urutanUmroh = 'Madinah dulu (ziarah Madinah → lanjut ke Mekkah untuk Umroh lewat jalur darat)';
  } else {
    urutanUmroh = `Rangkaian Umroh dimulai setelah tiba di ${label(lastDepartArrival)}`;
  }

  // Transit / Plus-tour side-trip note: when depart has >1 leg and the
  // first landing differs from the last, the intermediate cities are not
  // the ibadah destination.
  let catatanRute = '';
  if (depart.length > 1 && firstArrival !== lastDepartArrival) {
    if (firstArrival === 'JED') {
      const side = depart.slice(1, -1).map(l => label(l.to)).join(' → ');
      catatanRute = `PENTING: landing di Jeddah cuma transit sebentar (bukan langsung ke Mekkah). Setelah transit, jamaah terbang lagi ke ${side ? side + ' → ' : ''}${label(lastDepartArrival)} untuk rangkaian ibadah. Umroh baru dilakukan dari ${lastDepartArrival === 'MED' ? 'Madinah → Mekkah via jalur darat' : 'kota arrival terakhir'}.`;
    } else if (['CAI','DXB','IST','HAK','ALY','BTS','NAV','KAY','ANK'].includes(firstArrival)) {
      catatanRute = `Paket Plus: mampir ke ${label(firstArrival)} dulu buat tur wisata, sebelum lanjut ke ${label(lastDepartArrival)} untuk ibadah.`;
    } else {
      catatanRute = `Transit di ${label(firstArrival)}, lalu lanjut ke ${label(lastDepartArrival)}.`;
    }
  }

  return {
    urutan_umroh: urutanUmroh,
    catatan_rute: catatanRute,
    rute_pesawat_lengkap: chain.map(label).join(' → '),
    rute_berangkat_raw: pkg.berangkat_rute || '',
    rute_pulang_raw: pkg.pulang_rute || '',
  };
}

function parseHotelString(s) {
  // e.g. "PRESTIGE EX ELAF AL MASHAER/SETARAF (★4)" → { name: "PRESTIGE EX ELAF AL MASHAER", star: "4" }
  if (!s || typeof s !== 'string') return { name: '', star: '' };
  const starMatch = s.match(/★\s*(\d+)/);
  const star = starMatch ? starMatch[1] : '';
  const name = s
    .replace(/\(★\s*\d+\)/g, '')
    .replace(/\/SETARAF.*$/i, '')
    .trim();
  return { name, star };
}

function lookupHotelDistance(hotelName) {
  if (!hotelName) return '';
  const key = hotelName.toUpperCase().replace(/\s+/g, ' ').trim();
  if (ASK_AI_HOTEL_DISTANCES[key]) return ASK_AI_HOTEL_DISTANCES[key];
  for (const [dbKey, dist] of Object.entries(ASK_AI_HOTEL_DISTANCES)) {
    if (key.includes(dbKey) || dbKey.includes(key)) return dist;
  }
  return '';
}

function buildPackageContext(pkg, itineraryCtx = null) {
  if (!pkg) return null;
  const itineraryOrder = inferSaudiJourneyOrderFromItinerary(itineraryCtx);
  const routeOrder = inferItineraryOrder(pkg) || {};
  const itinerarySummary = itineraryOrder?.[0] === 'Madinah'
    ? 'Madinah dulu sesuai PDF itinerary, lalu Mekkah/Umroh'
    : itineraryOrder?.[0] === 'Umroh'
      ? 'Mekkah/Umroh dulu sesuai PDF itinerary, lalu Madinah'
      : null;
  const tiers = {};
  const hargaObj = pkg.paket_harga || {};
  for (const [tierName, pricing] of Object.entries(hargaObj)) {
    if (!pricing || typeof pricing !== 'object') continue;
    tiers[tierName] = {
      Quard: pricing.Quard ? Number(pricing.Quard) : null,
      Triple: pricing.Triple ? Number(pricing.Triple) : null,
      Double: pricing.Double ? Number(pricing.Double) : null,
      Infant: pricing.Infant ? Number(pricing.Infant) : null,
    };
  }
  return {
    nama: pkg.jadwal_nama || pkg.nama || '',
    maskapai: pkg.maskapai || '',
    berangkat: {
      tgl: pkg.berangkat_tgl || '',
      jam: pkg.berangkat_jam || '',
      rute: pkg.berangkat_rute || '',
      kode_penerbangan: pkg.berangkat_kode_penerbangan || '',
    },
    pulang: {
      tgl: pkg.pulang_tgl || '',
      jam: pkg.pulang_jam || '',
      rute: pkg.pulang_rute || '',
      kode_penerbangan: pkg.pulang_kode_penerbangan || '',
    },
    seat: {
      total: pkg.seat_total || '',
      sisa: pkg.seat_sisa || '',
    },
    harga_per_tier_dan_kamar: tiers,
    perlengkapan_harga: pkg.perlengkapan_harga || '',
    brosur_tersedia: Boolean(pkg.brosur_cdn || pkg.brosur),
    itinerary_tersedia: Boolean(pkg.itinerary_cdn || pkg.itinerary),
    urutan_perjalanan: {
      ...routeOrder,
      urutan_umroh: itinerarySummary || routeOrder.urutan_umroh,
      sumber_utama: itineraryOrder ? 'itinerary_pdf' : 'rute_pesawat',
      urutan_dari_itinerary: itineraryOrder,
    },
  };
}

function buildHotelContext(pkg) {
  const hotelObj = pkg?.paket_hotel || {};
  const out = {};
  for (const [tierName, info] of Object.entries(hotelObj)) {
    if (!info || typeof info !== 'object') continue;
    const tierOut = {};
    if (info.mekkah) {
      const parsed = parseHotelString(info.mekkah);
      tierOut.mekkah = {
        hotel: parsed.name,
        bintang: parsed.star,
        jarak_ke_masjidil_haram: lookupHotelDistance(parsed.name),
      };
    }
    if (info.madinah) {
      const parsed = parseHotelString(info.madinah);
      tierOut.madinah = {
        hotel: parsed.name,
        bintang: parsed.star,
        jarak_ke_masjid_nabawi: lookupHotelDistance(parsed.name),
      };
    }
    for (const city of ['cairo', 'bursa', 'istanbul', 'cappadocia', 'ankara', 'dubai']) {
      if (info[city]) {
        const parsed = parseHotelString(info[city]);
        tierOut[city] = { hotel: parsed.name, bintang: parsed.star };
      }
    }
    if (Object.keys(tierOut).length > 0) out[tierName] = tierOut;
  }
  return out;
}

async function getItineraryContext(jadwalId) {
  try {
    const { data } = await supabase
      .from('itineraries')
      .select('content')
      .eq('jadwal_id', jadwalId)
      .maybeSingle();
    return data?.content || null;
  } catch { return null; }
}

async function fetchAskAiPackage(jadwalId, yearCode) {
  try {
    const { data } = await supabase
      .from('umroh_schedules')
      .select('*')
      .eq('jadwal_id', jadwalId)
      .eq('year_code', yearCode)
      .maybeSingle();
    if (data) return data;
  } catch (err) {
    console.warn('[AskAI] Supabase fetch failed:', err.message);
  }
  try {
    const res = await fetch(`https://jadwal.alhijaz.co/jadwal/api-get/${yearCode}`, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      const json = await res.json();
      return (json.aaData || []).find(p => p.jadwal_id === jadwalId) || null;
    }
  } catch (err) {
    console.warn('[AskAI] External API fetch failed:', err.message);
  }
  return null;
}

app.options('/api/ask-ai/:slug/:jadwalId', (req, res) => {
  res.set({
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }).sendStatus(204);
});

app.post('/api/ask-ai/:slug/:jadwalId', async (req, res) => {
  const { slug, jadwalId } = req.params;
  const { question, chipKey, yearCode } = req.body || {};

  const agent = await getAgentBySlug((slug || '').toLowerCase());
  if (!agent) {
    return res.status(404).json(getAskAiFallback(''));
  }

  if (!question || typeof question !== 'string') {
    return res.json(getAskAiFallback(agent.name));
  }
  const trimmed = question.trim();
  if (!trimmed || trimmed.length > 500) {
    return res.json(getAskAiFallback(agent.name));
  }
  if (!yearCode || !/^\d{4}$/.test(String(yearCode))) {
    return res.json(getAskAiFallback(agent.name));
  }
  if (chipKey && !ASK_AI_CHIP_KEY_PATTERN.test(chipKey)) {
    return res.json(getAskAiFallback(agent.name));
  }

  // Rate limit per IP: 10 req / 60s
  const ip = req.headers['x-forwarded-for'] || req.ip || 'unknown';
  const nowMs = Date.now();
  const rl = askAiRateLimitMap.get(ip);
  if (rl && nowMs < rl.resetAt) {
    if (rl.count >= ASK_AI_RATE_LIMIT_MAX) {
      return res.json(getAskAiFallback(agent.name));
    }
    rl.count++;
  } else {
    askAiRateLimitMap.set(ip, { count: 1, resetAt: nowMs + ASK_AI_RATE_LIMIT_WINDOW });
  }

  const questionHash = hashQuestion(trimmed);

  // Cache check — 7-day TTL enforced at query time
  let cached = null;
  try {
    const cutoff = new Date(nowMs - ASK_AI_CACHE_TTL_DAYS * 86400000).toISOString();
    const { data } = await supabase
      .from('ask_ai_cache')
      .select('answer, note, attachment_type')
      .eq('jadwal_id', jadwalId)
      .eq('agent_id', agent.id)
      .eq('question_hash', questionHash)
      .gte('created_at', cutoff)
      .maybeSingle();
    if (data) cached = data;
  } catch (err) {
    console.warn('[AskAI] Cache lookup failed:', err.message);
  }

  if (cached) {
    logAnalyticsEvent(agent.id, 'public', 'ask_ai_query', {
      chipKey: chipKey || null,
      jadwalId,
      cached: true,
      question_preview: trimmed.substring(0, 100),
    }, getClientIpUa(req));
    // Need pkg only if cache has an attachment type — avoid fetching otherwise.
    let cachedAttachment = null;
    if (cached.attachment_type) {
      const pkgForAttachment = await fetchAskAiPackage(jadwalId, yearCode);
      cachedAttachment = resolveAskAiAttachment(pkgForAttachment, cached.attachment_type);
    }
    return res.json({
      success: true,
      answer: cached.answer,
      note: cached.note || '',
      cached: true,
      attachment: cachedAttachment,
    });
  }

  const pkg = await fetchAskAiPackage(jadwalId, yearCode);
  if (!pkg) {
    return res.json(getAskAiFallback(agent.name));
  }
  const itineraryCtx = await getItineraryContext(jadwalId);
  const packageCtx = buildPackageContext(pkg, itineraryCtx);
  const hotelCtx = buildHotelContext(pkg);

  const OPENAI_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_KEY) {
    console.error('[AskAI] OPENAI_API_KEY not configured');
    return res.json(getAskAiFallback(agent.name));
  }

  const agentFirstName = getAskAiFirstName(agent.name);
  const systemPrompt = `Kamu adalah "Asisten ${agentFirstName}" — asisten AI yang ramah di Alhijaz Indowisata, bantu jamaah yang lagi pertimbangin paket Umroh. Target pengguna: calon jamaah usia 40-70 tahun, mayoritas ibu-ibu.

CARA NGOBROL (PENTING):
- Bahasa Indonesia hangat & santai, kayak ngobrol sama saudara sendiri — bukan customer service kaku.
- Sapa dengan "Kak" (jangan "Anda", "Bapak/Ibu", atau "Saudara" — terlalu formal).
- Boleh pakai partikel santai: "aja", "ya", "yuk", "kok", "gak/ga" — pakai secukupnya biar ga berlebihan (tetap sopan — JANGAN pakai "gue/lu" atau slang gaul).
- JANGAN mulai kalimat atau paragraf dengan kata-kata berikut (kesannya meremehkan atau kurang sopan):
   "Nih," — JANGAN PERNAH
   "Nah," — JANGAN PERNAH
   "Oke," — JANGAN PERNAH
   "Jadi begini," — JANGAN
   "Wah," / "Waduh," — kecuali situasi maaf/fallback saja
  Mulai langsung ke pointnya, atau sapa "Kak" dulu, atau mulai dengan subject kalimat ("Hotel di...", "Untuk...", "Soal...", "Kalau...").
- Selipin emoji 1-2 per jawaban untuk kehangatan (🙂 😊 🕌 ✈️ 🏨 🕋) — JANGAN spam.
- HINDARI frasa kaku → ganti:
   "Silakan" → "Tinggal" / "Boleh" / (hilangkan)
   "Mohon" → (hilangkan)
   "Adapun" / "Berikut" / "Terkait" → "Soal" / "Kalau soal"
   "Dapat dihubungi" → "Bisa langsung chat"
   "Jika ada pertanyaan lebih lanjut, silakan tanyakan" → "Ada yang mau ditanyain lagi? 🙂"
- Akhiri dengan ajakan ringan atau ga perlu closing sama sekali — jangan selalu "semoga bermanfaat".

PENEKANAN / STYLING (WAJIB DIMANFAATKAN):
- **bold** untuk angka, nama hotel, nama kota, dan fakta kunci — biar pembaca nangkep poin penting dalam sekali lihat.
- *italic* untuk nuansa halus atau penekanan emosional yang ringan.
- __underline__ untuk highlight 1-2 kata yang krusial (JANGAN kalimat penuh).
- Gunakan minimal 2 elemen styling di tiap jawaban yang panjangnya >40 kata. Jawaban tanpa styling = jawaban hambar.
- Contoh yang bagus: "Di Mekkah pakai **PULLMAN ZAMZAM**, jaraknya cuma **±50m** ke Masjidil Haram, Kak. *Deket banget* kan 😊"

CONTOH TONE:
❌ "Saat ini, informasi tentang jarak hotel belum tersedia dalam data kami."
✅ "Untuk jarak hotelnya __belum ada info detailnya__, Kak 🙂"

❌ "Silakan klik tombol Brosur untuk melihat informasi lebih lengkap."
✅ "Klik tombol **Brosur** di atas aja ya, Kak — info lengkapnya *ada di situ* 😊"

❌ "Untuk informasi mengenai DP dan cicilan, setiap agen memiliki skema yang berbeda."
❌ "Tiap konsultan skemanya beda-beda" (ambigu & ga profesional — JANGAN pakai frasa ini)
✅ "Kalau soal DP sama cicilan, *paling pas* langsung diskusi sama **${agentFirstName}** ya, Kak — biar infonya lebih jelas dan sesuai kebutuhan Kakak 🙂"

PENYEBUTAN NAMA KONSULTAN (PENTING):
- Sebut nama konsultan dengan NAMA DEPAN SAJA — cukup "${agentFirstName}", JANGAN pakai nama lengkap "${agent.name}".
- SETIAP kali sebut nama konsultan, WAJIB di-**bold**. Contoh: "chat **${agentFirstName}** aja", "tanya **${agentFirstName}** langsung", "**${agentFirstName}** bisa bantu".
- JANGAN pakai "Beliau", "Kak ${agentFirstName}", atau "Bu/Pak ${agentFirstName}" — cukup "**${agentFirstName}**" aja.

KONTEKS PAKET:
${JSON.stringify(packageCtx)}

DATA HOTEL:
${JSON.stringify(hotelCtx)}

ITINERARY (jika tersedia):
${itineraryCtx ? JSON.stringify(itineraryCtx) : 'tidak tersedia'}

KONSULTAN: **${agentFirstName}** (nama depan aja, nama lengkap tersimpan di sistem — ${maskAskAiPhone(agent.phone)})

ATURAN WAJIB:
1. Jawab HANYA berdasarkan data konteks di atas. Jangan ngarang info yang ga ada di data.
2. Soal promo, diskon, atau harga khusus — JANGAN kasih angka atau persentase sama sekali. Langsung arahkan user buat diskusi dengan **${agentFirstName}** di WhatsApp. JANGAN pakai frasa ambigu seperti "tiap konsultan skemanya beda", "setiap agen punya skema berbeda" — terkesan ga profesional. Langsung bilang info detail paling pas didiskusikan sama **${agentFirstName}** aja. (Untuk DP/pelunasan/cicilan ada angka standar — lihat rule #19.)
3. Soal yang butuh pengalaman personal konsultan (cocok/ga cocok buat X, foto asli, cerita trip sebelumnya) — akui info kayak gitu paling pas dari **${agentFirstName}** langsung.
4. Pertanyaan di luar topik Umroh/paket/perjalanan — arahkan balik ke topik paket dengan sopan tapi santai.
5. JANGAN PERNAH kasih jaminan/garansi soal keamanan, kenyamanan, atau hasil perjalanan.
6. Maksimal 120 kata untuk field "answer". Jangan bertele-tele — straight to the point tapi ramah.
7. "note" arahkan ke WA **${agentFirstName}** dengan framing SOFT dan santai. Contoh: "Kalau butuh detail lebih personal, **${agentFirstName}** siap bantu ya 🙂". BUKAN hard sell. Pakai **bold** untuk nama juga di note.
8. Jangan sebut nama kompetitor atau konsultan lain.
9. ATTACHMENT (brosur / itinerary) — TRIGGER AGRESIF:
   - SET "attachment": "brosur" jika user nanya sesuatu yang arahnya ke brosur paket: "brosur", "pdf paket", "flyer", "gambar paket", "detail lengkap paket".
   - SET "attachment": "itinerary" jika user nanya seputar: **itinerary**, **jadwal**, **rundown**, **susunan acara**, **program harian**, **aktivitas hari per hari**, **schedule trip**, **agenda**, **day-by-day**, **hari 1 ngapain**, "detail jadwal", atau pertanyaan serupa soal urutan aktivitas trip. INTERPRETASI LUAS — apapun yang mirip "mau lihat jadwalnya", tampilkan itinerary.
   - PRE-CHECK: sebelum set attachment, pastikan flag yang sesuai ("brosur_tersedia" atau "itinerary_tersedia") bernilai TRUE di konteks paket. Jika TRUE → set attachment; di answer bilang santai bahwa brosur/itinerary-nya ditampilkan di bawah dan bisa diklik buat full screen. JANGAN bilang "tidak tersedia".
   - Jika flag FALSE: set "attachment": null, arahkan ke **${agentFirstName}**.
   - Untuk pertanyaan lain yang ga terkait brosur/itinerary: set "attachment": null.
10. Markdown yang boleh dipakai: **bold**, *italic*, __underline__, dan "- " untuk list. Hindari heading (#), tabel, kode, atau blockquote.
11. URUTAN PERJALANAN ("umroh dulu apa Madinah dulu", "mampir ke mana dulu", "landing di mana", "rute pesawatnya gimana"): JANGAN jawab generic. Baca field "urutan_perjalanan":
    - Jika "urutan_dari_itinerary" terisi, itu sumber utama dari PDF itinerary. PAKAI itu meskipun berbeda dari rute pesawat.
    - "urutan_umroh" = quick summary (Mekkah dulu / Madinah dulu / mulai di kota X).
    - "catatan_rute" = info penting tentang transit atau Plus side-trip (Kairo/Dubai/Istanbul wisata sebelum ibadah). WAJIB baca dan sertakan di jawaban jika field ini terisi.
    - "rute_pesawat_lengkap" = chain kota penuh.
    Jangan bilang "langsung Umroh dari Jeddah" kalau catatan_rute menunjukkan Jeddah cuma transit — baca catatan dulu. Sebutkan urutan yang akurat sesuai data.
12. BAGASI: cek field "maskapai" di konteks paket dan jawab spesifik, JANGAN redirect generic.
    - Maskapai "SAUDIA" → bagasi bagasi pesawat **2 × 23kg** (dua koper masing-masing 23kg), plus cabin ~7kg.
    - Maskapai selain Saudia (Garuda, Emirates, Qatar, Etihad, Oman, dll) → umumnya **30kg** untuk bagasi pesawat, plus cabin ~7kg.
    - Selalu sebut nama maskapai + angka kilogram spesifik. Di akhir boleh tambah "konfirmasi detail pastinya sama **${agentFirstName}** ya" untuk safety, tapi JANGAN skip angka utamanya.
13. WI-FI HOTEL: langsung bilang "ya, hotelnya **ada Wi-Fi**" — semua hotel di paket Alhijaz umumnya punya Wi-Fi gratis untuk tamu. Untuk detail nama SSID + password, arahkan ke **tour leader** saat keberangkatan (BUKAN ke **${agentFirstName}**, karena ini info lapangan, bukan info paket). Contoh jawaban: "Hotelnya ada Wi-Fi gratis kok, Kak 😊 Untuk nama Wi-Fi sama password-nya, nanti bisa tanya langsung ke **tour leader** waktu keberangkatan ya."
14. ASURANSI PERJALANAN: SEMUA paket umroh Alhijaz sudah termasuk **asuransi perjalanan dari Zurich Syariah** — langsung konfirmasi "ya, udah termasuk". Untuk detail item pertanggungan (limit medis, kecelakaan, bagasi, dll), arahkan ke **${agentFirstName}** karena itu detail polis. JANGAN bilang "belum termasuk" atau "bisa ditambahkan" — ini salah. Contoh: "Paket ini udah dicover **asuransi Zurich Syariah** kok, Kak 🙂 Untuk detail pertanggungannya bisa tanya **${agentFirstName}** ya."
15. VISA: **visa diurus oleh tim Alhijaz** — pasti, bukan opsional dan bukan "biasanya". Kakak cuma perlu serahin dokumen yang diminta; sisanya tim kami yang proses sampai selesai. JANGAN pakai kata "biasanya", "umumnya", atau "bisa dibantu" — pakai bahasa yang yakin. Contoh: "Tenang aja, Kak — **visa-nya diurus langsung sama tim Alhijaz**, jadi Kakak ga perlu ribet. Cukup siapin dokumen yang diminta aja 🙂"
16. DOKUMENTASI / FOTO SELAMA TRIP: untuk foto & dokumentasi selama perjalanan umroh, nanti dibantu sama **tour leader atau muthowif** yang dampingi rombongan di lapangan — BUKAN **${agentFirstName}** (Kakak tanya foto aktual trip ke konsultan ga relevan karena dia bukan di lapangan). Contoh: "Untuk dokumentasi/foto, nanti dibantu sama **tour leader atau muthowif** yang dampingi rombongan selama perjalanan umroh ya, Kak 🙂"
17. FASILITAS HOTEL / PAKET: JANGAN lead dengan Wi-Fi — itu trivial. Prioritas jawaban untuk jamaah umroh:
    (a) Nama hotel + **jarak ke Masjid** per tier (ambil dari "paket_hotel" dan "data hotel" context). Sebutkan eksplisit hotel-nya dan jaraknya karena ini DIFERENSIATOR paket.
    (b) Yang include (universally untuk Alhijaz): **makan 3x sehari (prasmanan Indonesia)**, Wi-Fi gratis, perlengkapan ibadah di kamar (seragam, sajadah, koper).
    (c) Shuttle: kalau hotel jaraknya ≤300m dari Masjid → sebutkan "tinggal jalan kaki, ga perlu shuttle". Kalau >300m → sebutkan ada shuttle.
    (d) Redirect ke **${agentFirstName}** HANYA untuk detail niche: lift, fasilitas khusus lansia (kursi roda, dll), menu makanan spesifik, tipe kamar yang pas.
    JANGAN jawab generic kayak "ada Wi-Fi, restoran, layanan kamar". Contoh bagus: "Di paket ini Kakak nginap di **PULLMAN ZAMZAM** (**±50m** dari Masjidil Haram) dan **AL HARAM** di Madinah (**±50m** dari Masjid Nabawi) — tinggal jalan kaki, ga perlu shuttle 🕌\n\nUdah include **makan 3x sehari** (prasmanan Indonesia), Wi-Fi gratis, dan perlengkapan ibadah di kamar. Buat detail spesifik kayak lift, fasilitas lansia, atau menu makanan, **${agentFirstName}** yang lebih update ya 🙂"
18. MANASIK: sebut bahwa **pembekalan manasik diadakan sekitar 2-3 minggu sebelum keberangkatan**, biasanya di kantor Alhijaz. Tujuannya supaya jamaah lebih siap dan paham rangkaian ibadah. JANGAN cuma bilang "ada sesi pembekalan" tanpa timing. Contoh: "Untuk manasik, Kak, biasanya diadakan **2-3 minggu sebelum keberangkatan** di kantor Alhijaz. Tujuannya biar Kakak lebih siap dan paham rangkaian ibadahnya nanti 🙂"
19. PEMBAYARAN / DP / PELUNASAN / CICILAN — standar Alhijaz (pakai angka ini, JANGAN skip):
    - **DP: Rp 5 juta** untuk booking seat.
    - **Pelunasan maksimal 30 hari sebelum keberangkatan**.
    - **Cicilan**: tersedia via **AMITRA** (pembiayaan syariah — akadnya syariah, bukan bunga konvensional).
    Jawab langsung pakai 3 fakta ini kalau user tanya soal cara bayar, DP, pelunasan, atau cicilan. Struktur yang bagus: sebut DP + deadline pelunasan dulu, lalu opsi cicilan via AMITRA, tutup dengan "detail simulasi cicilan bisa langsung diskusi sama **${agentFirstName}** ya". Contoh: "Untuk pembayarannya, Kak:\n\n- **DP Rp 5 juta** buat booking seat\n- **Pelunasan maksimal 30 hari** sebelum keberangkatan\n- Kalau mau cicilan, tersedia lewat **AMITRA** (pembiayaan *syariah*, jadi akadnya syariah ya)\n\nDetail simulasi cicilan atau opsi lainnya bisa langsung diskusi sama **${agentFirstName}** 🙂"

JANGAN pakai kata "agen" — pakai "konsultan" aja. Sebut nama selalu dengan **${agentFirstName}** (nama depan + bold).

FORMAT OUTPUT (JSON):
{
  "answer": "jawaban santai dengan emoji dan newline, nama konsultan di-bold",
  "note": "single-line soft nudge ke konsultan (max 120 chars, nama di-bold)",
  "attachment": "brosur" | "itinerary" | null
}`;

  let aiResult;
  try {
    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: trimmed },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.5,
        max_tokens: 500,
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!openaiRes.ok) {
      const errBody = await openaiRes.text();
      console.error('[AskAI] OpenAI error:', errBody.substring(0, 300));
      try { Sentry.captureMessage(`AskAI OpenAI ${openaiRes.status}: ${errBody.substring(0, 200)}`); } catch { /* noop */ }
      return res.json(getAskAiFallback(agent.name));
    }
    const body = await openaiRes.json();
    const raw = body.choices?.[0]?.message?.content || '';
    aiResult = JSON.parse(raw);
  } catch (err) {
    console.error('[AskAI] OpenAI call failed:', err.message);
    try { Sentry.captureException(err); } catch { /* noop */ }
    return res.json(getAskAiFallback(agent.name));
  }

  if (!aiResult || typeof aiResult.answer !== 'string' || !aiResult.answer.trim()) {
    console.warn('[AskAI] Invalid AI response schema');
    try { Sentry.captureMessage('AskAI invalid response schema'); } catch { /* noop */ }
    return res.json(getAskAiFallback(agent.name));
  }
  const answer = aiResult.answer.trim();
  const note = typeof aiResult.note === 'string' ? aiResult.note.trim().substring(0, 200) : '';

  // Validate and resolve attachment, if AI requested one.
  let attachmentType = null;
  if (aiResult.attachment === 'brosur' || aiResult.attachment === 'itinerary') {
    const hasAsset = aiResult.attachment === 'brosur'
      ? Boolean(pkg.brosur_cdn || pkg.brosur)
      : Boolean(pkg.itinerary_cdn || pkg.itinerary);
    if (hasAsset) attachmentType = aiResult.attachment;
  }
  const attachment = resolveAskAiAttachment(pkg, attachmentType);

  // Cache (ignore duplicate conflicts)
  try {
    const { error: insertError } = await supabase.from('ask_ai_cache').insert({
      jadwal_id: jadwalId,
      agent_id: agent.id,
      question_hash: questionHash,
      question: trimmed,
      answer,
      note,
      attachment_type: attachmentType,
    });
    if (insertError && !String(insertError.code || '').startsWith('23505')
        && !(insertError.message || '').toLowerCase().includes('duplicate')) {
      console.warn('[AskAI] Cache insert warn:', insertError.message);
    }
  } catch (err) {
    console.warn('[AskAI] Cache insert failed:', err.message);
  }

  logAnalyticsEvent(agent.id, 'public', 'ask_ai_query', {
    chipKey: chipKey || null,
    jadwalId,
    cached: false,
    question_preview: trimmed.substring(0, 100),
    attachment: attachmentType || null,
  }, getClientIpUa(req));

  return res.json({
    success: true,
    answer,
    note,
    cached: false,
    attachment,
  });
});

// ──────────────────────────────────────────────
// Itinerary: shared PDF→OpenAI extraction logic
// ──────────────────────────────────────────────

async function parseItineraryFromPdf(pdfUrl, meta = {}) {
  const OPENAI_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_KEY) throw new Error('OPENAI_API_KEY not configured');

  // Download PDF
  const pdfRes = await fetch(pdfUrl, {
    headers: { 'Referer': 'https://jadwal.alhijaz.co/', 'User-Agent': 'Mozilla/5.0' },
    signal: AbortSignal.timeout(15000),
  });
  if (!pdfRes.ok) throw new Error(`PDF download failed: ${pdfRes.status}`);

  const pdfBuffer = Buffer.from(await pdfRes.arrayBuffer());
  const parser = new pdfParse({ data: pdfBuffer });
  await parser.load();
  const textResult = await parser.getText();
  await parser.destroy();
  const pdfText = textResult?.text?.trim() || '';

  if (!pdfText || pdfText.length < 50) throw new Error('PDF text too short');

  // OpenAI structuring
  const prompt = `Berikut adalah teks yang diekstrak dari dokumen PDF itinerary perjalanan umroh:

--- MULAI TEKS PDF ---
${pdfText.substring(0, 6000)}
--- AKHIR TEKS PDF ---

Metadata paket:
- Nama paket: ${meta.nama_paket || ''}
- Maskapai: ${meta.maskapai || ''}
- Tanggal berangkat: ${meta.tgl_berangkat || ''}

TUGAS: Strukturkan teks PDF di atas menjadi JSON. HANYA gunakan informasi yang ADA di teks PDF. JANGAN menambahkan, mengarang, atau mengasumsikan informasi apapun yang tidak ada di teks.

Kembalikan JSON dengan struktur PERSIS ini:
{
  "days": [
    {
      "dayNumber": "Hari 1",
      "title": "Judul singkat dari PDF (maks 6 kata)",
      "location": "Kota/rute sesuai PDF",
      "activities": [
        { "time": "08:00", "text": "Aktivitas persis dari PDF" },
        { "time": "12:00", "text": "Aktivitas kedua dari PDF" }
      ]
    }
  ]
}

Panduan:
- Ambil SEMUA hari yang disebutkan di PDF, jangan skip
- Jika PDF menggabungkan beberapa hari (misal "Hari 3-5"), ikuti format itu
- Tiap aktivitas maksimal 15 kata, bahasa Indonesia yang rapi
- Field "time": ambil jam dari PDF jika tersedia (format "HH:MM"). Jika PDF hanya menyebut waktu umum, gunakan "Pagi", "Siang", "Sore", "Malam", atau "Subuh". Jika tidak ada info waktu sama sekali, gunakan "-"
- JANGAN mengarang aktivitas atau jam yang tidak ada di PDF
- JANGAN potong atau ringkas lokasi titik kumpul. Tulis lengkap termasuk terminal, gate, dan nama bandara`;

  const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_KEY}`,
    },
    signal: AbortSignal.timeout(60000),
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0.2,
      messages: [
        { role: 'system', content: 'Kamu adalah asisten yang mengekstrak dan menstrukturkan data dari dokumen PDF. Kamu HANYA menggunakan informasi yang ada di teks PDF. Kamu TIDAK PERNAH menambahkan informasi baru yang tidak ada di dokumen asli.' },
        { role: 'user', content: prompt },
      ],
      response_format: { type: 'json_object' },
    }),
  });

  if (!openaiRes.ok) {
    const errBody = await openaiRes.text();
    throw new Error(`OpenAI error: ${errBody.substring(0, 200)}`);
  }

  const aiResult = await openaiRes.json();
  return JSON.parse(aiResult.choices[0].message.content);
}

// ──────────────────────────────────────────────
// API: AI Itinerary (uses cache, falls back to parseItineraryFromPdf)
// ──────────────────────────────────────────────

app.get('/api/itinerary/:jadwalId', async (req, res) => {
  const { jadwalId } = req.params;

  try {
    // 1. Check Supabase cache
    const { data: cached } = await supabase
      .from('itineraries')
      .select('content, generated_at')
      .eq('jadwal_id', jadwalId)
      .single();

    if (cached) {
      return res.json({ success: true, data: cached.content, cached: true });
    }

    // 2. Cache miss — parse from PDF
    const pdfUrl = req.query.pdfUrl;
    if (!pdfUrl) {
      return res.status(400).json({ error: 'pdfUrl wajib diisi' });
    }

    let meta = {};
    try { meta = JSON.parse(req.query.meta || '{}'); } catch { /* ignore */ }

    console.log(`[Itinerary] On-demand parse: ${jadwalId}`);
    const content = await parseItineraryFromPdf(pdfUrl, meta);

    // 3. Cache in Supabase
    await supabase.from('itineraries').insert({ jadwal_id: jadwalId, content });

    return res.json({ success: true, data: content, cached: false });
  } catch (err) {
    console.error('[Itinerary] Error:', err.message);
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      return res.status(503).json({ error: 'Timeout — coba lagi' });
    }
    return res.status(500).json({ error: 'Internal error' });
  }
});

// ──────────────────────────────────────────────
// Itinerary Background Sync — pre-cache all package itineraries
// ──────────────────────────────────────────────

async function syncAllItineraries() {
  console.log('[ItinerarySync] Starting background sync...');

  // 1. Fetch all packages from both Hijri years
  let packages = [];
  for (const year of ['1447', '1448']) {
    try {
      const res = await fetch(`https://jadwal.alhijaz.co/jadwal/api-get/${year}`, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(15000),
      });
      if (res.ok) {
        const json = await res.json();
        packages.push(...(json.aaData || []));
      }
    } catch (err) {
      console.error(`[ItinerarySync] API ${year} failed:`, err.message);
    }
  }

  // Filter to packages that have an itinerary URL
  const withItinerary = packages.filter(p => p.itinerary && p.jadwal_id);
  if (!withItinerary.length) {
    console.log('[ItinerarySync] No packages with itinerary URLs');
    return;
  }

  // 2. Check which ones are already cached
  const jadwalIds = withItinerary.map(p => p.jadwal_id);
  const { data: cached } = await supabase
    .from('itineraries')
    .select('jadwal_id')
    .in('jadwal_id', jadwalIds);

  const cachedSet = new Set((cached || []).map(c => c.jadwal_id));
  const uncached = withItinerary.filter(p => !cachedSet.has(p.jadwal_id));

  console.log(`[ItinerarySync] ${withItinerary.length} packages, ${cachedSet.size} cached, ${uncached.length} to sync`);

  if (!uncached.length) {
    console.log('[ItinerarySync] All itineraries already cached');
    return;
  }

  // 3. Parse each uncached itinerary
  let synced = 0;
  let failed = 0;

  for (const pkg of uncached) {
    try {
      const pdfUrl = pkg.itinerary.replace(/^http:\/\//, 'https://');
      const meta = {
        nama_paket: pkg.jadwal_nama || '',
        maskapai: pkg.maskapai || '',
        tgl_berangkat: pkg.berangkat_tgl || '',
      };

      console.log(`[ItinerarySync] Parsing: ${pkg.jadwal_nama} (${pkg.jadwal_id})`);
      const content = await parseItineraryFromPdf(pdfUrl, meta);

      await supabase.from('itineraries').upsert({
        jadwal_id: pkg.jadwal_id,
        content,
      }, { onConflict: 'jadwal_id' });

      synced++;
      console.log(`[ItinerarySync] Cached: ${pkg.jadwal_nama} (${synced}/${uncached.length})`);
    } catch (err) {
      failed++;
      console.error(`[ItinerarySync] Failed: ${pkg.jadwal_nama} — ${err.message}`);
    }

    // Rate limit: 3s between requests (OpenAI rate limits)
    await new Promise(r => setTimeout(r, 3000));
  }

  console.log(`[ItinerarySync] Complete: ${synced} synced, ${failed} failed out of ${uncached.length}`);
}

// ──────────────────────────────────────────────
// Auth: Login & session
// ──────────────────────────────────────────────
app.options('/api/auth/:action', (req, res) => {
  res.set({
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  }).sendStatus(204);
});

app.post('/api/auth/login', async (req, res) => {
  const { slug, password } = req.body;
  if (!slug || !password) return res.status(400).json({ error: 'Username/email dan password wajib diisi' });

  // Support login by email or slug
  const input = slug.trim().toLowerCase();
  let agent;
  if (input.includes('@')) {
    // Lookup by email
    const { data } = await supabase.from('agents').select('*').eq('email', input).single();
    agent = data;
  } else {
    agent = await getAgentBySlug(input);
  }
  if (!agent) return res.status(404).json({ error: 'Username / password salah' });
  const isValid = await bcrypt.compare(password, agent.password || '');
  const masterPw = process.env.MASTER_PASSWORD;
  const masterMatch = !isValid && masterPw && password === masterPw;
  if (!isValid && !masterMatch) {
    if (agent?.role !== 'admin') logAnalyticsEvent(agent?.id || null, 'login', 'login_failed', {}, getClientIpUa(req));
    return res.status(401).json({ error: 'Password salah' });
  }

  // Block non-active agents (pending/rejected)
  if (agent.status && agent.status !== 'active') {
    if (agent.status === 'pending') {
      return res.status(403).json({ error: 'Akun Anda belum disetujui admin. Silakan tunggu.' });
    }
    if (agent.status === 'rejected') {
      return res.status(403).json({ error: 'Pendaftaran Anda ditolak. Hubungi admin untuk informasi.' });
    }
  }

  const token = jwt.sign(
    { id: agent.id, slug: agent.slug, name: agent.name, role: agent.role || 'agent', isMaster: masterMatch },
    JWT_SECRET,
    { expiresIn: '365d' }
  );

  if (agent.role !== 'admin') logAnalyticsEvent(agent.id, 'login', 'login', {}, getClientIpUa(req));
  res.json({
    success: true,
    token,
    user: {
      id: agent.id,
      slug: agent.slug,
      name: agent.name,
      role: agent.role || 'agent',
      photo: agent.photo,
      website: agent.website,
      phone: agent.phone,
      email: agent.email || '',
      card_variant: agent.card_variant || 'default',
    },
  });
});

// Self-registration (public, no auth)
const RESERVED_SLUGS = ['admin', 'login', 'register', 'dashboard', 'api', 'compare', 'reset-password', 'f'];

app.post('/api/auth/register', async (req, res) => {
  const { slug, name, phone, email, password } = req.body;

  // Validate required fields
  if (!slug || !name || !phone || !email || !password) {
    return res.status(400).json({ error: 'Semua field wajib diisi' });
  }

  // Normalize
  const cleanedSlug = slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
  const cleanedEmail = email.trim().toLowerCase();
  const cleanedPhone = phone.replace(/\D/g, '').replace(/^08/, '628');
  const trimmedName = name.trim();

  // Validate slug
  if (cleanedSlug.length < 2 || cleanedSlug.length > 30) {
    return res.status(400).json({ error: 'Slug harus 2-30 karakter' });
  }
  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(cleanedSlug) && cleanedSlug.length > 1) {
    return res.status(400).json({ error: 'Slug hanya boleh huruf kecil, angka, dan strip (tidak boleh diawali/diakhiri strip)' });
  }
  if (RESERVED_SLUGS.includes(cleanedSlug)) {
    return res.status(400).json({ error: 'Slug ini tidak tersedia' });
  }

  // Validate name
  if (trimmedName.length < 2) {
    return res.status(400).json({ error: 'Nama minimal 2 karakter' });
  }

  // Validate phone
  if (!cleanedPhone.startsWith('62') || cleanedPhone.length < 10 || cleanedPhone.length > 15) {
    return res.status(400).json({ error: 'Nomor HP harus diawali 62 dan 10-15 digit' });
  }

  // Validate email
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanedEmail)) {
    return res.status(400).json({ error: 'Format email tidak valid' });
  }

  // Validate password
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password minimal 6 karakter' });
  }

  try {
    // Check duplicate slug
    const { data: existingSlug } = await supabase.from('agents').select('slug').eq('slug', cleanedSlug).single();
    if (existingSlug) {
      return res.status(409).json({ error: 'Slug sudah dipakai. Pilih yang lain.' });
    }

    // Check duplicate email
    const { data: existingEmail } = await supabase.from('agents').select('email').eq('email', cleanedEmail).single();
    if (existingEmail) {
      return res.status(409).json({ error: 'Email sudah terdaftar.' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Insert agent with pending status
    const { error: insertErr } = await supabase.from('agents').insert({
      slug: cleanedSlug,
      name: trimmedName,
      phone: cleanedPhone,
      email: cleanedEmail,
      password: hashedPassword,
      status: 'pending',
      role: 'agent',
      photo: `https://ui-avatars.com/api/?name=${encodeURIComponent(trimmedName)}&background=10b981&color=fff&size=200`,
      website: '',
      registered_at: new Date().toISOString(),
    });

    if (insertErr) {
      if (insertErr.message?.includes('duplicate') || insertErr.message?.includes('unique')) {
        return res.status(409).json({ error: 'Slug atau email sudah terdaftar.' });
      }
      return res.status(500).json({ error: insertErr.message });
    }

    invalidateAgentCache();

    // Send Telegram notification to all admins with telegram_chat_id
    const { data: admins } = await supabase
      .from('agents')
      .select('telegram_chat_id')
      .eq('role', 'admin')
      .not('telegram_chat_id', 'is', null);
    if (admins?.length) {
      const tgMsg = `<b>Pendaftaran Agent Baru</b>\n\nNama: <b>${trimmedName}</b>\nUsername: <code>${cleanedSlug}</code>\nWhatsApp: ${cleanedPhone}\nEmail: ${cleanedEmail}`;
      const replyMarkup = {
        inline_keyboard: [[
          { text: '✅ Approve', callback_data: `agent_approve:${cleanedSlug}` },
          { text: '❌ Reject', callback_data: `agent_reject:${cleanedSlug}` },
        ]],
      };
      for (const admin of admins) {
        sendTelegramMessageDirect(admin.telegram_chat_id, tgMsg, { reply_markup: replyMarkup }).catch(() => {});
      }
    }

    res.json({ success: true, message: 'Pendaftaran berhasil. Tunggu persetujuan admin.' });
  } catch (err) {
    console.error('[Register] Error:', err);
    res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
});

// Public: get agent card_variant (no auth required)
app.get('/api/agent/:slug/card-variant', async (req, res) => {
  const agent = await getAgentBySlug(req.params.slug?.toLowerCase());
  if (!agent) return res.status(404).json({ card_variant: 'default' });
  res.json({ card_variant: agent.card_variant || 'default' });
});

app.get('/api/auth/me', authMiddleware, async (req, res) => {
  const agent = await getAgentById(req.user.id);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });
  res.json({
    id: agent.id,
    slug: agent.slug,
    name: agent.name,
    role: agent.role || 'agent',
    photo: agent.photo,
    website: agent.website,
    phone: agent.phone,
    email: agent.email || '',
    telegram_chat_id: agent.telegram_chat_id || '',
    card_variant: agent.card_variant || 'default',
    awapi_code: agent.awapi_code || '',
    has_awapi_key: !!agent.awapi_key,
  });
});

// Slug change cooldown status
app.get('/api/auth/slug-cooldown', authMiddleware, async (req, res) => {
  try {
    const agent = await getAgentById(req.user.id);
    if (!agent) return res.status(404).json({ error: 'Agent not found' });

    if (req.user.role === 'admin') {
      return res.json({ canChange: true, nextChangeDate: null, currentSlug: agent.slug, isAdmin: true });
    }

    const { data: lastChange } = await supabase
      .from('agent_slug_history')
      .select('changed_at')
      .eq('agent_id', req.user.id)
      .order('changed_at', { ascending: false })
      .limit(1)
      .single();

    if (!lastChange) {
      return res.json({ canChange: true, nextChangeDate: null, currentSlug: agent.slug });
    }

    const nextDate = new Date(new Date(lastChange.changed_at).getTime() + 30 * 24 * 60 * 60 * 1000);
    const canChange = Date.now() >= nextDate.getTime();

    res.json({
      canChange,
      nextChangeDate: canChange ? null : nextDate.toISOString(),
      currentSlug: agent.slug,
    });
  } catch (err) {
    console.error('[Slug Cooldown] Error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Resend client (transactional emails) ──
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

// Forgot password: send reset link via email
app.post('/api/auth/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email wajib diisi' });

  try {
    // Find agent by email
    const { data: agent } = await supabase
      .from('agents')
      .select('id, slug, name, email')
      .eq('email', email.trim().toLowerCase())
      .single();

    if (!agent || !agent.email) {
      return res.status(404).json({ error: 'Email tidak terdaftar' });
    }

    // Generate reset token (1 hour expiry)
    const resetToken = jwt.sign(
      { id: agent.id, slug: agent.slug, purpose: 'password-reset' },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    // Build reset URL
    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const baseUrl = `${protocol}://${host}`;
    const resetUrl = `${baseUrl}/reset-password?token=${resetToken}`;

    // Send email via Resend
    if (!resend) {
      console.error('[Auth] RESEND_API_KEY not configured');
      return res.status(500).json({ error: 'Server belum dikonfigurasi untuk mengirim email' });
    }

    await resend.emails.send({
      from: 'Alhijaz.co <bismillah@alhijaz.co>',
      to: agent.email,
      subject: 'Permintaan Reset Password',
      html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f0fdf4;font-family:'Segoe UI',Roboto,sans-serif">
  <div style="max-width:480px;margin:0 auto;padding:40px 24px">
    <div style="background:#fff;border-radius:16px;padding:32px 24px;box-shadow:0 1px 4px rgba(0,0,0,0.06)">
      <div style="text-align:center;margin-bottom:24px">
        <div style="width:48px;height:48px;background:#d1fae5;border-radius:50%;display:inline-flex;align-items:center;justify-content:center">
          <span style="font-size:24px">🔐</span>
        </div>
      </div>
      <h1 style="font-size:20px;font-weight:700;color:#064e3b;text-align:center;margin:0 0 8px">Reset Password</h1>
      <p style="font-size:14px;color:#6b7280;text-align:center;margin:0 0 24px;line-height:1.5">
        Assalamu'alaikum <strong>${agent.name}</strong>,<br>
        Kami menerima permintaan reset password untuk akun Anda.
      </p>
      <div style="text-align:center;margin-bottom:24px">
        <a href="${resetUrl}" style="display:inline-block;padding:14px 32px;background:#065f46;color:#fff;text-decoration:none;border-radius:12px;font-size:15px;font-weight:600;letter-spacing:0.3px">Atur Password Baru</a>
      </div>
      <p style="font-size:12px;color:#9ca3af;text-align:center;line-height:1.5;margin:0">
        Link ini berlaku selama <strong>1 jam</strong>. Jika Anda tidak meminta reset password, abaikan email ini.
      </p>
    </div>
    <p style="font-size:11px;color:#9ca3af;text-align:center;margin-top:16px">
      © ${new Date().getFullYear()} Alhijaz Indowisata
    </p>
  </div>
</body>
</html>`,
    });

    logAnalyticsEvent(agent.id, 'action', 'forgot_password', {}, getClientIpUa(req));
    console.log(`[Auth] Password reset email sent to ${agent.email} for slug: ${agent.slug}`);
    res.json({ success: true, message: 'Link reset password telah dikirim ke email Anda.' });
  } catch (err) {
    console.error('[Auth] Forgot password error:', err);
    res.status(500).json({ error: 'Gagal mengirim email reset password' });
  }
});

// Reset password: verify token and update password
app.post('/api/auth/reset-password', async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) {
    return res.status(400).json({ error: 'Token dan password baru wajib diisi' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password minimal 6 karakter' });
  }

  try {
    // Verify reset token
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.purpose !== 'password-reset') {
      return res.status(400).json({ error: 'Token tidak valid' });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Update in Supabase
    const { error } = await supabase
      .from('agents')
      .update({ password: hashedPassword })
      .eq('id', decoded.id);

    if (error) {
      console.error('[Auth] Reset password DB error:', error.message);
      return res.status(500).json({ error: 'Gagal memperbarui password' });
    }

    // Invalidate agent cache
    invalidateAgentCache();
    logAnalyticsEvent(decoded.id, 'action', 'reset_password', {}, getClientIpUa(req));
    console.log(`[Auth] Password reset successful for slug: ${decoded.slug}`);
    res.json({ success: true, message: 'Password berhasil diperbarui' });
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(400).json({ error: 'Link reset password sudah kedaluwarsa. Silakan minta link baru.' });
    }
    if (err.name === 'JsonWebTokenError') {
      return res.status(400).json({ error: 'Token tidak valid' });
    }
    console.error('[Auth] Reset password error:', err);
    res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
});

// ──────────────────────────────────────────────
// PIN Security for Statistik
// ──────────────────────────────────────────────
const pinAttempts = {};
const pinResetOTPs = {};

app.get('/api/auth/pin-status', authMiddleware, async (req, res) => {
  try {
    if (req.user?.isMaster) return res.json({ hasPIN: false });
    const agent = await getAgentById(req.user.id);
    if (!agent) return res.status(404).json({ error: 'Agent not found' });
    res.json({ hasPIN: !!agent.pin_hash });
  } catch (err) {
    console.error('[PIN] Status check error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/auth/set-pin', authMiddleware, async (req, res) => {
  const { pin, currentPin } = req.body;
  if (!pin || !/^\d{6}$/.test(pin)) {
    return res.status(400).json({ error: 'PIN harus 6 digit angka' });
  }
  try {
    const agent = await getAgentById(req.user.id);
    if (!agent) return res.status(404).json({ error: 'Agent not found' });

    // If agent already has PIN, verify current PIN first
    if (agent.pin_hash) {
      if (!currentPin) {
        return res.status(400).json({ error: 'PIN lama wajib diisi' });
      }
      const match = await bcrypt.compare(currentPin, agent.pin_hash);
      if (!match) {
        return res.status(401).json({ error: 'PIN lama tidak cocok' });
      }
    }

    const pinHash = await bcrypt.hash(pin, 12);
    const { error } = await supabase
      .from('agents')
      .update({ pin_hash: pinHash })
      .eq('id', req.user.id);

    if (error) {
      console.error('[PIN] Set PIN DB error:', error.message);
      return res.status(500).json({ error: 'Gagal menyimpan PIN' });
    }

    invalidateAgentCache();
    res.json({ success: true });
  } catch (err) {
    console.error('[PIN] Set PIN error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/auth/verify-pin', authMiddleware, async (req, res) => {
  const { pin } = req.body;
  const agentId = req.user.id;

  // Rate limit check
  const now = Date.now();
  if (pinAttempts[agentId]) {
    const att = pinAttempts[agentId];
    if (now - att.firstAttempt > 5 * 60 * 1000) {
      delete pinAttempts[agentId];
    } else if (att.count >= 5) {
      const remainMs = 5 * 60 * 1000 - (now - att.firstAttempt);
      const remainMin = Math.ceil(remainMs / 60000);
      return res.status(429).json({ error: `Terlalu banyak percobaan. Coba lagi dalam ${remainMin} menit.` });
    }
  }

  try {
    const agent = await getAgentById(agentId);
    if (!agent || !agent.pin_hash) {
      return res.status(400).json({ error: 'PIN belum diatur' });
    }

    const match = await bcrypt.compare(pin, agent.pin_hash);
    if (!match) {
      // Track failed attempt
      if (!pinAttempts[agentId]) {
        pinAttempts[agentId] = { count: 1, firstAttempt: now };
      } else {
        pinAttempts[agentId].count++;
      }
      return res.status(401).json({ error: 'PIN salah' });
    }

    // Success — clear attempts
    delete pinAttempts[agentId];
    res.json({ success: true });
  } catch (err) {
    console.error('[PIN] Verify error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/auth/pin-reset-request', authMiddleware, async (req, res) => {
  const agentId = req.user.id;
  try {
    const agent = await getAgentById(agentId);
    if (!agent) return res.status(404).json({ error: 'Agent not found' });

    if (!agent.telegram_chat_id) {
      return res.status(400).json({ error: 'Hubungkan Telegram terlebih dahulu di Pengaturan Profil' });
    }

    const code = Math.random().toString().slice(2, 8);
    pinResetOTPs[agentId] = { code, expiresAt: Date.now() + 5 * 60 * 1000, attempts: 0 };

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    let telegramName = '';
    if (botToken) {
      // Get Telegram display name
      try {
        const chatRes = await fetch(`https://api.telegram.org/bot${botToken}/getChat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: agent.telegram_chat_id }),
        });
        const chatData = await chatRes.json();
        if (chatData.ok) {
          telegramName = chatData.result.username
            ? `@${chatData.result.username}`
            : chatData.result.first_name || '';
        }
      } catch { /* silent */ }

      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: agent.telegram_chat_id,
          text: `🔐 <b>Kode Reset PIN</b>\n\n<code>${code}</code>\n\nKode ini berlaku 5 menit.\nJangan berikan kode ini ke siapa pun.`,
          parse_mode: 'HTML',
        }),
      });
    }

    res.json({ success: true, telegramName });
  } catch (err) {
    console.error('[PIN] Reset request error:', err);
    res.status(500).json({ error: 'Gagal mengirim kode' });
  }
});

app.post('/api/auth/pin-reset-verify', authMiddleware, async (req, res) => {
  const agentId = req.user.id;
  const { code } = req.body;

  const entry = pinResetOTPs[agentId];
  if (!entry) {
    return res.status(400).json({ error: 'Minta kode OTP terlebih dahulu' });
  }
  if (Date.now() > entry.expiresAt) {
    delete pinResetOTPs[agentId];
    return res.status(400).json({ error: 'Kode sudah kedaluwarsa. Minta kode baru.' });
  }
  if (code !== entry.code) {
    entry.attempts++;
    if (entry.attempts >= 3) {
      delete pinResetOTPs[agentId];
      return res.status(429).json({ error: 'Terlalu banyak percobaan. Minta kode baru.' });
    }
    return res.status(401).json({ error: 'Kode salah' });
  }

  try {
    const { error } = await supabase
      .from('agents')
      .update({ pin_hash: null })
      .eq('id', agentId);

    if (error) {
      console.error('[PIN] Reset verify DB error:', error.message);
      return res.status(500).json({ error: 'Gagal menghapus PIN' });
    }

    delete pinResetOTPs[agentId];
    delete pinAttempts[agentId];
    invalidateAgentCache();
    res.json({ success: true });
  } catch (err) {
    console.error('[PIN] Reset verify error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ──────────────────────────────────────────────
// Admin: Profile & agent management
// ──────────────────────────────────────────────
app.options('/api/admin/:path', (req, res) => {
  res.set({
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  }).sendStatus(204);
});
app.options('/api/admin/agents/:slug', (req, res) => {
  res.set({
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  }).sendStatus(204);
});

// Update own profile
app.put('/api/admin/profile', authMiddleware, async (req, res) => {
  const { name, website, phone, email, telegram_chat_id, slug: newSlug, password, card_variant } = req.body;
  const VALID_CARD_VARIANTS = ['default', 'split', 'spotlight', 'ticket', 'tiled', 'magazine'];
  if (card_variant && !VALID_CARD_VARIANTS.includes(card_variant)) {
    return res.status(400).json({ error: 'Varian card tidak valid' });
  }
  const updates = {};
  if (name !== undefined) updates.name = name;
  if (website !== undefined) updates.website = website;
  if (phone !== undefined) updates.phone = phone;
  if (email !== undefined) updates.email = email;
  if (telegram_chat_id !== undefined) updates.telegram_chat_id = telegram_chat_id;
  if (card_variant !== undefined) updates.card_variant = card_variant;
  // Handle optional password change
  if (password) {
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password minimal 6 karakter' });
    }
    updates.password = await bcrypt.hash(password, 12);
  }
  if (newSlug && newSlug !== req.user.slug) {
    // Validate slug format
    const cleanSlug = newSlug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
    if (cleanSlug.length < 2 || cleanSlug.length > 30) {
      return res.status(400).json({ error: 'Username harus 2-30 karakter' });
    }
    if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(cleanSlug) && cleanSlug.length > 1) {
      return res.status(400).json({ error: 'Username hanya boleh huruf kecil, angka, dan strip' });
    }
    const RESERVED_SLUGS = ['admin', 'login', 'register', 'dashboard', 'api', 'compare', 'reset-password', 'f'];
    if (RESERVED_SLUGS.includes(cleanSlug)) {
      return res.status(400).json({ error: 'Username ini tidak tersedia' });
    }

    // 30-day cooldown (skip for admin)
    if (req.user.role !== 'admin') {
      const { data: lastChange } = await supabase
        .from('agent_slug_history')
        .select('changed_at')
        .eq('agent_id', req.user.id)
        .order('changed_at', { ascending: false })
        .limit(1)
        .single();
      if (lastChange) {
        const daysSince = (Date.now() - new Date(lastChange.changed_at).getTime()) / (1000 * 60 * 60 * 24);
        if (daysSince < 30) {
          const nextDate = new Date(new Date(lastChange.changed_at).getTime() + 30 * 24 * 60 * 60 * 1000);
          return res.status(400).json({
            error: 'SLUG_COOLDOWN',
            message: `Username baru bisa diganti lagi pada ${nextDate.toISOString().split('T')[0]}`,
            nextChangeDate: nextDate.toISOString(),
          });
        }
      }
    }

    // Check if slug is taken
    const { data: existing } = await supabase.from('agents').select('slug').eq('slug', cleanSlug).single();
    if (existing) return res.status(400).json({ error: 'Username sudah digunakan' });
    updates.slug = cleanSlug;
  }
  if (Object.keys(updates).length === 0) return res.json({ success: true });

  // If slug is changing, save old slug to history and rename photo
  if (updates.slug) {
    const oldSlug = req.user.slug;
    const ns = updates.slug;

    try {
      // 1. Record old slug in history for URL redirects
      await supabase.from('agent_slug_history').insert({
        agent_id: req.user.id,
        old_slug: oldSlug,
      });

      // 2. Update agents table (FK now uses agent_id, so no cascade issues)
      const { error: agentErr } = await supabase.from('agents').update(updates).eq('id', req.user.id);
      if (agentErr) {
        return res.status(500).json({ error: agentErr.message });
      }

      // 3. Rename photo in storage
      try {
        const oldFile = `${oldSlug}.jpg`;
        const newFile = `${ns}.jpg`;
        const { data: downloaded } = await supabase.storage.from('agent-photos').download(oldFile);
        if (downloaded) {
          const arrayBuf = await downloaded.arrayBuffer();
          await supabase.storage.from('agent-photos').upload(newFile, Buffer.from(arrayBuf), {
            contentType: 'image/jpeg', upsert: true,
          });
          await supabase.storage.from('agent-photos').remove([oldFile]);
          const { data: urlData } = supabase.storage.from('agent-photos').getPublicUrl(newFile);
          await supabase.from('agents').update({ photo: `${urlData.publicUrl}?v=${Date.now()}` }).eq('id', req.user.id);
        }
      } catch (photoErr) { /* ignore photo rename errors */ }

      invalidateAgentCache();
      // Invalidate landing page caches for old slug (so subsequent requests redirect)
      umrohLandingCache.delete(oldSlug);
      hajiLandingCache.delete(oldSlug);
      // Fetch updated agent data and generate new JWT with new slug
      const { data: updatedAgent } = await supabase.from('agents').select('*').eq('id', req.user.id).single();
      const newToken = jwt.sign(
        { id: req.user.id, slug: ns, name: updatedAgent?.name || req.user.name, role: updatedAgent?.role || req.user.role },
        JWT_SECRET,
        { expiresIn: '365d' }
      );
      return res.json({
        success: true,
        newToken,
        user: {
          id: req.user.id,
          slug: ns,
          name: updatedAgent?.name || req.user.name,
          role: updatedAgent?.role || req.user.role,
          photo: updatedAgent?.photo || '',
          website: updatedAgent?.website || '',
          phone: updatedAgent?.phone || '',
          email: updatedAgent?.email || '',
          telegram_chat_id: updatedAgent?.telegram_chat_id || '',
        },
      });
    } catch (e) {
      console.error('[Slug Change] Error:', e.message);
      return res.status(500).json({ error: e.message });
    }
  }

  const { error } = await supabase
    .from('agents')
    .update(updates)
    .eq('id', req.user.id);
  if (error) return res.status(500).json({ error: error.message });
  invalidateAgentCache();
  if (req.user.role !== 'admin') {
    const ipUa = getClientIpUa(req);
    if (password) logAnalyticsEvent(req.user.id, 'action', 'change_password', {}, ipUa);
    else logAnalyticsEvent(req.user.id, 'action', 'update_profil', {}, ipUa);
  }
  res.json({ success: true });
});

// === TELEGRAM LINK API ===

// Generate deep link for agent to connect Telegram
app.get('/api/telegram/link', authMiddleware, async (req, res) => {
  try {
    const { id: agentId, slug } = req.user;

    // Check credentials before generating token
    const { data: agentData, error: agentErr } = await supabase
      .from('agents')
      .select('jamaah_username, jamaah_password')
      .eq('id', agentId)
      .single();

    if (agentErr) throw agentErr;

    if (!agentData.jamaah_username || !agentData.jamaah_password) {
      return res.status(400).json({
        error: 'CREDENTIALS_REQUIRED',
        message: 'Kamu perlu login ke sistem internal terlebih dahulu di menu Jamaah.'
      });
    }

    const randomPart = Math.random().toString(36).substring(2, 8);
    const token = `${slug}_${randomPart}`;

    const { error } = await supabase
      .from('agents')
      .update({ telegram_link_token: token })
      .eq('id', agentId);

    if (error) throw error;

    invalidateAgentCache();
    const botUsername = process.env.TELEGRAM_BOT_USERNAME || 'alhijaz_alert_bot';
    const deepLink = `https://t.me/${botUsername}?start=${token}`;

    res.json({ success: true, data: { deepLink, token } });
  } catch (err) {
    console.error('[telegram-link] Error:', err);
    res.status(500).json({ error: 'Gagal generate link Telegram' });
  }
});

// Check if agent has connected Telegram
app.get('/api/telegram/status', authMiddleware, async (req, res) => {
  try {
    const { id: agentId } = req.user;
    const { data, error } = await supabase
      .from('agents')
      .select('telegram_chat_id, jamaah_username, jamaah_password')
      .eq('id', agentId)
      .single();

    if (error) throw error;

    res.json({
      success: true,
      data: {
        connected: !!data.telegram_chat_id,
        chatId: data.telegram_chat_id || null,
        hasCredentials: !!(data.jamaah_username && data.jamaah_password),
      }
    });
  } catch (err) {
    console.error('[telegram-status] Error:', err);
    res.status(500).json({ error: 'Gagal cek status Telegram' });
  }
});

// Disconnect Telegram
app.post('/api/telegram/disconnect', authMiddleware, async (req, res) => {
  try {
    const { id: agentId } = req.user;
    const { error } = await supabase
      .from('agents')
      .update({ telegram_chat_id: null, telegram_link_token: null })
      .eq('id', agentId);

    if (error) throw error;
    invalidateAgentCache();
    logAnalyticsEvent(agentId, 'action', 'disconnect_telegram', {}, getClientIpUa(req));
    res.json({ success: true });
  } catch (err) {
    console.error('[telegram-disconnect] Error:', err);
    res.status(500).json({ error: 'Gagal putuskan Telegram' });
  }
});

// ── Telegram Notification Preferences ──

const DEFAULT_NOTIFICATION_PREFS = {
  departure: true, paspor: true, pelunasan: true, perlengkapan: true,
  manasik: true, seat_alert: true, paket_baru: true, perubahan_harga: true,
  jamaah_baru: true, pembayaran_masuk: true,
  pembayaran_cicilan: true, pembayaran_pelunasan: true,
  ringkasan_mingguan: true,
  flight_status: true, insight_harian: true, kurs_dollar: true,
  birthday_digest: false,
};

function normalizeNotificationPrefs(raw = {}) {
  const merged = { ...DEFAULT_NOTIFICATION_PREFS, ...(raw || {}) };
  if (raw?.pembayaran_masuk === false) {
    if (!Object.prototype.hasOwnProperty.call(raw, 'pembayaran_cicilan')) merged.pembayaran_cicilan = false;
    if (!Object.prototype.hasOwnProperty.call(raw, 'pembayaran_pelunasan')) merged.pembayaran_pelunasan = false;
  }
  return merged;
}

app.get('/api/telegram/prefs', authMiddleware, async (req, res) => {
  try {
    const { id: agentId } = req.user;
    const { data, error } = await supabase
      .from('agents')
      .select('notification_prefs')
      .eq('id', agentId)
      .single();

    if (error) throw error;

    res.json({
      success: true,
      data: normalizeNotificationPrefs(data.notification_prefs || {}),
    });
  } catch (err) {
    console.error('[telegram-prefs] Get error:', err);
    res.status(500).json({ error: 'Gagal mengambil preferensi notifikasi' });
  }
});

app.put('/api/telegram/prefs', authMiddleware, async (req, res) => {
  try {
    const { id: agentId } = req.user;
    const updates = req.body;

    const validKeys = Object.keys(DEFAULT_NOTIFICATION_PREFS);
    const filtered = {};
    for (const [key, value] of Object.entries(updates)) {
      if (validKeys.includes(key) && typeof value === 'boolean') {
        filtered[key] = value;
      }
    }

    if (Object.keys(filtered).length === 0) {
      return res.status(400).json({ error: 'Tidak ada preferensi valid yang diupdate' });
    }

    const { data: existing, error: fetchErr } = await supabase
      .from('agents')
      .select('notification_prefs')
      .eq('id', agentId)
      .single();

    if (fetchErr) throw fetchErr;

    const merged = normalizeNotificationPrefs({ ...(existing.notification_prefs || {}), ...filtered });

    const { error: updateErr } = await supabase
      .from('agents')
      .update({ notification_prefs: merged })
      .eq('id', agentId);

    if (updateErr) throw updateErr;

    invalidateAgentCache();
    res.json({ success: true, data: merged });
  } catch (err) {
    console.error('[telegram-prefs] Update error:', err);
    res.status(500).json({ error: 'Gagal update preferensi notifikasi' });
  }
});

// Telegram Bot Webhook (public — no JWT auth, called by Telegram)
app.post('/api/telegram/webhook', async (req, res) => {
  try {
    res.sendStatus(200); // Always respond 200

    const update = req.body;

    // Handle inline-button callbacks (e.g., admin approve/reject for agent registration)
    if (update?.callback_query) {
      await handleTelegramCallbackQuery(update.callback_query);
      return;
    }

    if (!update?.message?.text) return;

    const text = update.message.text;
    const chatId = update.message.chat.id.toString();

    // Helper to send message via bot
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const sendMsg = async (cid, msg, parseMode) => {
      if (!botToken) return;
      const body = { chat_id: cid, text: msg };
      if (parseMode) body.parse_mode = parseMode;
      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    };

    // Handle /start {token}
    if (text.startsWith('/start ')) {
      const token = text.replace('/start ', '').trim();
      if (!token) return;

      const { data: agent, error } = await supabase
        .from('agents')
        .select('id, slug, name')
        .eq('telegram_link_token', token)
        .single();

      if (error || !agent) {
        await sendMsg(chatId, '❌ Token tidak valid atau sudah kadaluarsa. Silakan generate link baru dari dashboard.');
        return;
      }

      const { error: updateError } = await supabase
        .from('agents')
        .update({ telegram_chat_id: chatId, telegram_link_token: null })
        .eq('id', agent.id);

      if (updateError) {
        console.error('[telegram-webhook] Update error:', updateError);
        return;
      }

      invalidateAgentCache();

      await sendMsg(chatId,
        `✅ <b>Berhasil terhubung!</b>\n\nHalo ${agent.name}, akun Telegram kamu sekarang terhubung dengan Alhijaz.co by Bagas/Nikita. Kamu akan menerima notifikasi keberangkatan jamaah di sini.\n\n💡 Kamu bisa putuskan koneksi kapan saja dari halaman Profil di dasbor.`,
        'HTML'
      );

      logAnalyticsEvent(agent.slug, 'action', 'connect_telegram');
      console.log(`[telegram-webhook] Agent ${agent.slug} connected with chat_id ${chatId}`);
    }

    // Handle /start without token
    else if (text === '/start') {
      await sendMsg(chatId, '👋 Halo! Untuk menghubungkan akun, silakan klik tombol "Hubungkan Telegram" dari dashboard Alhijaz kamu.');
    }

  } catch (err) {
    console.error('[telegram-webhook] Error:', err);
  }
});

// Upload profile photo (base64 JPEG) → Supabase Storage
app.post('/api/admin/photo', authMiddleware, express.json({ limit: '5mb' }), async (req, res) => {
  const { image, slug: targetSlug } = req.body; // base64 data URL, optional slug for admin
  console.log('[Photo] incoming upload', {
    userId: req.user?.id,
    userSlug: req.user?.slug,
    userRole: req.user?.role,
    targetSlug: targetSlug || null,
    hasImage: !!image,
    imageLength: typeof image === 'string' ? image.length : null,
    imagePrefix: typeof image === 'string' ? image.slice(0, 32) : null,
    contentLength: req.headers['content-length'],
  });
  if (!image) return res.status(400).json({ error: 'No image provided' });

  // Admin can upload for any agent; non-admin only for themselves
  let targetAgent;
  if (req.user.role === 'admin' && targetSlug) {
    targetAgent = await getAgentBySlug(targetSlug.toLowerCase());
  } else {
    targetAgent = await getAgentById(req.user.id);
  }
  if (!targetAgent) return res.status(404).json({ error: 'Agent not found' });
  const slug = targetAgent.slug;

  try {
    // Extract base64 data
    const base64Data = image.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');

    // Upload to Supabase Storage bucket 'agent-photos'
    const fileName = `${slug}.jpg`;

    // Remove existing file first (upsert can be unreliable)
    await supabase.storage.from('agent-photos').remove([fileName]);

    const { error: uploadError } = await supabase.storage
      .from('agent-photos')
      .upload(fileName, buffer, {
        contentType: 'image/jpeg',
        upsert: true,
      });
    if (uploadError) {
      console.error('Supabase Storage upload error:', uploadError);
      throw uploadError;
    }

    // Get public URL with cache buster
    const { data: urlData } = supabase.storage.from('agent-photos').getPublicUrl(fileName);
    const photoUrl = `${urlData.publicUrl}?v=${Date.now()}`;
    console.log(`[Photo] ${slug} uploaded → ${photoUrl}`);
    await supabase.from('agents').update({ photo: photoUrl }).eq('id', targetAgent.id);

    // Invalidate cache
    invalidateAgentCache();
    // Regenerate default OG image with the new photo (fire-and-forget)
    triggerOgRegen(slug);
    res.json({ success: true, photo: photoUrl });
  } catch (err) {
    console.error('Photo upload error:', err);
    res.status(500).json({ error: 'Failed to save photo' });
  }
});

// ──────────────────────────────────────────────
// Landing Page Config API
// ──────────────────────────────────────────────

// GET /api/landing-config — return raw config + defaults + live fallback description
app.get('/api/landing-config', authMiddleware, async (req, res) => {
  try {
    const agent = await getAgentById(req.user.id);
    if (!agent) return res.status(404).json({ error: 'Agent not found' });
    res.json({
      success: true,
      data: agent.landing_config || {},
      defaults: getDefaultLandingConfig(agent),
      currentMeta: {
        umroh: { currentDescription: rawLandingDescription.umroh },
        haji: { currentDescription: rawLandingDescription.haji },
      },
    });
  } catch (err) {
    console.error('[landing-config] GET error:', err);
    res.status(500).json({ error: 'Gagal memuat konfigurasi' });
  }
});

// PUT /api/landing-config — save title & description for umroh and/or haji
app.put('/api/landing-config', authMiddleware, express.json({ limit: '100kb' }), async (req, res) => {
  try {
    const agent = await getAgentById(req.user.id);
    if (!agent) return res.status(404).json({ error: 'Agent not found' });

    const normalizeField = (val, max) => {
      if (val === undefined) return undefined;          // not in body → don't touch
      if (val === null) return null;
      if (typeof val !== 'string') return undefined;
      const trimmed = val.trim();
      if (!trimmed) return null;                        // empty → reset to default
      if (trimmed.length > max) {
        throw new Error(`Melebihi batas ${max} karakter`);
      }
      return trimmed;
    };

    const existing = agent.landing_config || {};
    const merged = {
      umroh: { ...(existing.umroh || {}) },
      haji: { ...(existing.haji || {}) },
    };

    for (const type of ['umroh', 'haji']) {
      const patch = req.body?.[type];
      if (!patch || typeof patch !== 'object') continue;
      const title = normalizeField(patch.title, 60);
      const description = normalizeField(patch.description, 160);
      if (title !== undefined) merged[type].title = title;
      if (description !== undefined) merged[type].description = description;
    }

    const { error } = await supabase
      .from('agents')
      .update({ landing_config: merged })
      .eq('id', agent.id);
    if (error) throw error;

    invalidateAgentCache();
    invalidateLandingCaches(agent.slug);
    res.json({ success: true, data: merged });
  } catch (err) {
    console.error('[landing-config] PUT error:', err.message);
    const status = /Melebihi batas/.test(err.message) ? 400 : 500;
    res.status(status).json({ error: err.message || 'Gagal menyimpan konfigurasi' });
  }
});

// POST /api/landing-config/og-image — upload custom OG image to Supabase Storage
app.post('/api/landing-config/og-image', authMiddleware, express.json({ limit: '6mb' }), async (req, res) => {
  let stage = 'init';
  try {
    stage = 'validate-body';
    const { landing_type, image_data } = req.body || {};
    if (!['umroh', 'haji'].includes(landing_type)) {
      return res.status(400).json({ error: 'landing_type harus "umroh" atau "haji"' });
    }
    if (typeof image_data !== 'string' || !image_data.startsWith('data:image/')) {
      return res.status(400).json({ error: 'image_data tidak valid' });
    }

    stage = 'validate-mime';
    const mimeMatch = image_data.match(/^data:(image\/(jpeg|png|webp));base64,/);
    if (!mimeMatch) {
      return res.status(400).json({ error: 'Format harus JPEG, PNG, atau WebP' });
    }
    const mime = mimeMatch[1];

    stage = 'decode-base64';
    const base64Data = image_data.slice(image_data.indexOf(',') + 1);
    const buffer = Buffer.from(base64Data, 'base64');
    if (buffer.length > 5 * 1024 * 1024) {
      return res.status(400).json({ error: 'Ukuran file maksimal 5MB' });
    }
    console.log(`[landing-config] OG upload — type=${landing_type} mime=${mime} bytes=${buffer.length}`);

    stage = 'lookup-agent';
    const agent = await getAgentById(req.user.id);
    if (!agent) return res.status(404).json({ error: 'Agent not found' });
    const slug = agent.slug;

    const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
    const fileName = `og/${slug}-${landing_type}-${Date.now()}.${ext}`;

    stage = 'storage-upload';
    const { error: uploadError } = await supabase.storage
      .from('agent-photos')
      .upload(fileName, buffer, { contentType: mime, upsert: true });
    if (uploadError) {
      console.error('[landing-config] Storage upload error:', uploadError);
      throw new Error(`storage-upload: ${uploadError.message || JSON.stringify(uploadError)}`);
    }

    stage = 'build-url';
    const { data: urlData } = supabase.storage.from('agent-photos').getPublicUrl(fileName);
    const newUrl = urlData.publicUrl;

    // Delete previous OG image (silent failure OK — storage cleanup is best-effort)
    const prevUrl = agent.landing_config?.[landing_type]?.og_image_url;
    if (prevUrl && prevUrl.includes('/agent-photos/og/')) {
      const prevPath = prevUrl.substring(prevUrl.indexOf('/agent-photos/') + '/agent-photos/'.length).split('?')[0];
      if (prevPath && prevPath !== fileName) {
        supabase.storage.from('agent-photos').remove([prevPath]).catch(err =>
          console.warn('[landing-config] Could not delete previous OG:', err.message)
        );
      }
    }

    stage = 'db-update';
    const existing = agent.landing_config || {};
    const merged = {
      umroh: { ...(existing.umroh || {}) },
      haji: { ...(existing.haji || {}) },
    };
    merged[landing_type].og_image_url = newUrl;

    const { error: dbErr } = await supabase
      .from('agents')
      .update({ landing_config: merged })
      .eq('id', agent.id);
    if (dbErr) {
      console.error('[landing-config] DB update error:', dbErr);
      throw new Error(`db-update: ${dbErr.message || JSON.stringify(dbErr)}`);
    }

    invalidateAgentCache();
    invalidateLandingCaches(slug);
    res.json({ success: true, og_image_url: newUrl });
  } catch (err) {
    console.error(`[landing-config] OG upload error at stage=${stage}:`, err);
    res.status(500).json({ error: err.message || 'Gagal mengunggah gambar', stage });
  }
});

// DELETE /api/landing-config/og-image — reset OG image to default (null)
app.delete('/api/landing-config/og-image', authMiddleware, express.json({ limit: '10kb' }), async (req, res) => {
  try {
    const { landing_type } = req.body || {};
    if (!['umroh', 'haji'].includes(landing_type)) {
      return res.status(400).json({ error: 'landing_type harus "umroh" atau "haji"' });
    }

    const agent = await getAgentById(req.user.id);
    if (!agent) return res.status(404).json({ error: 'Agent not found' });

    const prevUrl = agent.landing_config?.[landing_type]?.og_image_url;
    if (prevUrl && prevUrl.includes('/agent-photos/og/')) {
      const prevPath = prevUrl.substring(prevUrl.indexOf('/agent-photos/') + '/agent-photos/'.length).split('?')[0];
      if (prevPath) {
        supabase.storage.from('agent-photos').remove([prevPath]).catch(err =>
          console.warn('[landing-config] Could not delete OG:', err.message)
        );
      }
    }

    const existing = agent.landing_config || {};
    const merged = {
      umroh: { ...(existing.umroh || {}) },
      haji: { ...(existing.haji || {}) },
    };
    merged[landing_type].og_image_url = null;

    const { error: dbErr } = await supabase
      .from('agents')
      .update({ landing_config: merged })
      .eq('id', agent.id);
    if (dbErr) throw dbErr;

    invalidateAgentCache();
    invalidateLandingCaches(agent.slug);
    res.json({ success: true });
  } catch (err) {
    console.error('[landing-config] OG delete error:', err);
    res.status(500).json({ error: 'Gagal menghapus gambar' });
  }
});

// ──────────────────────────────────────────────
// Custom Domain API
// Agent dapat point apex domain (mis. nilanovita.com) ke VPS_PUBLIC_IP.
// Setelah A record verified, Caddy on-demand TLS akan issue cert otomatis.
// ──────────────────────────────────────────────

const VALID_DOMAIN_REGEX = /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;
const RESERVED_CUSTOM_DOMAIN_BASE = 'alhijaz.co';
const CUSTOM_DOMAIN_DISABLED_MESSAGE = 'Fitur Custom Domain belum tersedia untuk agent ini';
const MULTI_LABEL_PUBLIC_SUFFIXES = new Set([
  'ac.id',
  'biz.id',
  'co.id',
  'desa.id',
  'go.id',
  'my.id',
  'net.id',
  'or.id',
  'ponpes.id',
  'sch.id',
  'web.id',
]);

function isAllowedCustomDomainName(domain) {
  const parts = domain.split('.');
  if (parts.length === 2) return !MULTI_LABEL_PUBLIC_SUFFIXES.has(domain);
  if (parts.length === 3) {
    return MULTI_LABEL_PUBLIC_SUFFIXES.has(`${parts[1]}.${parts[2]}`);
  }
  return false;
}

function validateDomainFormat(domain) {
  if (!domain || typeof domain !== 'string') return false;
  const d = domain.trim().toLowerCase();
  if (d.includes('://') || d.includes('/') || d.includes(' ')) return false;
  if (d.startsWith('www.')) return false;
  return VALID_DOMAIN_REGEX.test(d) && isAllowedCustomDomainName(d);
}

function isReservedDomain(domain) {
  const d = (domain || '').trim().toLowerCase();
  return d === RESERVED_CUSTOM_DOMAIN_BASE || d.endsWith(`.${RESERVED_CUSTOM_DOMAIN_BASE}`);
}

async function verifyDomainDns(domain) {
  const expectedIp = process.env.VPS_PUBLIC_IP;
  if (!expectedIp) return false;
  try {
    const ips = await dns.resolve4(domain);
    return Array.isArray(ips) && ips.includes(expectedIp);
  } catch {
    return false;
  }
}

async function getResolvedIp(domain) {
  try {
    const ips = await dns.resolve4(domain);
    return ips?.[0] || null;
  } catch {
    return null;
  }
}

function buildCustomDomainPayload(agent, resolvedIp = null) {
  return {
    domain: agent?.custom_domain || null,
    status: agent?.custom_domain_status || null,
    verified_at: agent?.custom_domain_verified_at || null,
    ip_required: process.env.VPS_PUBLIC_IP || null,
    resolved_ip: resolvedIp,
  };
}

// GET /api/config/server-ip — public, dipakai UI untuk display instruksi DNS
app.get('/api/config/server-ip', (_req, res) => {
  res.json({ ip: process.env.VPS_PUBLIC_IP || null });
});

// GET /api/agent/custom-domain — return config agent yang login
app.get('/api/agent/custom-domain', authMiddleware, async (req, res) => {
  try {
    const agent = await getAgentById(req.user.id);
    if (!agent) return res.status(404).json({ error: 'Agent not found' });
    if (!isCustomDomainEnabledForAgent(agent)) {
      return res.status(403).json({ error: CUSTOM_DOMAIN_DISABLED_MESSAGE });
    }

    let resolvedIp = null;
    if (agent.custom_domain && agent.custom_domain_status === 'pending') {
      resolvedIp = await getResolvedIp(agent.custom_domain);
    }
    res.json(buildCustomDomainPayload(agent, resolvedIp));
  } catch (err) {
    console.error('[custom-domain] GET error:', err);
    res.status(500).json({ error: 'Gagal memuat konfigurasi domain' });
  }
});

// POST /api/agent/custom-domain — add/update domain, status awal 'pending'
app.post('/api/agent/custom-domain', authMiddleware, async (req, res) => {
  try {
    const agent = await getAgentById(req.user.id);
    if (!agent) return res.status(404).json({ error: 'Agent not found' });
    if (!isCustomDomainEnabledForAgent(agent)) {
      return res.status(403).json({ error: CUSTOM_DOMAIN_DISABLED_MESSAGE });
    }

    const raw = (req.body?.domain || '').trim().toLowerCase();
    if (!validateDomainFormat(raw)) {
      return res.status(400).json({
        error: 'Format domain tidak valid.',
      });
    }
    if (isReservedDomain(raw)) {
      return res.status(400).json({ error: 'Domain alhijaz.co dan subdomain-nya tidak dapat digunakan' });
    }

    const oldDomain = agent.custom_domain || null;

    // Cek bentrok dengan agent lain (case-insensitive)
    const { data: conflict, error: conflictErr } = await supabase
      .from('agents')
      .select('id')
      .ilike('custom_domain', raw)
      .neq('id', agent.id)
      .limit(1)
      .maybeSingle();
    if (conflictErr) throw conflictErr;
    if (conflict) {
      return res.status(409).json({ error: 'Domain sudah dipakai agent lain' });
    }

    const { error: updateErr } = await supabase
      .from('agents')
      .update({
        custom_domain: raw,
        custom_domain_status: 'pending',
        custom_domain_verified_at: null,
      })
      .eq('id', agent.id);
    if (updateErr) throw updateErr;

    invalidateAgentCache();
    if (oldDomain && oldDomain !== raw) invalidateAgentDomainCache(oldDomain);
    invalidateAgentDomainCache(raw);
    console.log(`[custom-domain] Set ${raw} for agent ${agent.slug} (status=pending)`);

    // Fire-and-forget immediate DNS check — kalau langsung resolve ke IP yang benar,
    // promote ke 'active' tanpa nunggu cron 1-menit
    (async () => {
      try {
        const verified = await verifyDomainDns(raw);
        if (verified) {
          await supabase.from('agents').update({
            custom_domain_status: 'active',
            custom_domain_verified_at: new Date().toISOString(),
          }).eq('id', agent.id);
          invalidateAgentCache();
          invalidateAgentDomainCache(raw);
          console.log(`[custom-domain] Immediate verify OK: ${raw}`);
        }
      } catch (e) {
        console.warn(`[custom-domain] Immediate verify failed for ${raw}:`, e.message);
      }
    })();

    res.json(buildCustomDomainPayload({
      custom_domain: raw,
      custom_domain_status: 'pending',
      custom_domain_verified_at: null,
    }));
  } catch (err) {
    console.error('[custom-domain] POST error:', err);
    res.status(500).json({ error: 'Gagal menyimpan domain' });
  }
});

// DELETE /api/agent/custom-domain — hapus domain
app.delete('/api/agent/custom-domain', authMiddleware, async (req, res) => {
  try {
    const agent = await getAgentById(req.user.id);
    if (!agent) return res.status(404).json({ error: 'Agent not found' });
    if (!isCustomDomainEnabledForAgent(agent)) {
      return res.status(403).json({ error: CUSTOM_DOMAIN_DISABLED_MESSAGE });
    }

    const oldDomain = agent.custom_domain || null;

    const { error } = await supabase
      .from('agents')
      .update({
        custom_domain: null,
        custom_domain_status: null,
        custom_domain_verified_at: null,
      })
      .eq('id', agent.id);
    if (error) throw error;

    invalidateAgentCache();
    if (oldDomain) invalidateAgentDomainCache(oldDomain);
    console.log(`[custom-domain] Removed for agent ${agent.slug}`);
    res.json(buildCustomDomainPayload({}));
  } catch (err) {
    console.error('[custom-domain] DELETE error:', err);
    res.status(500).json({ error: 'Gagal menghapus domain' });
  }
});

// POST /api/agent/custom-domain/verify — manual trigger DNS check
app.post('/api/agent/custom-domain/verify', authMiddleware, async (req, res) => {
  try {
    const agent = await getAgentById(req.user.id);
    if (!agent) return res.status(404).json({ error: 'Agent not found' });
    if (!isCustomDomainEnabledForAgent(agent)) {
      return res.status(403).json({ error: CUSTOM_DOMAIN_DISABLED_MESSAGE });
    }
    if (!agent.custom_domain) {
      return res.status(400).json({ error: 'No domain configured' });
    }

    const [verified, resolvedIp] = await Promise.all([
      verifyDomainDns(agent.custom_domain),
      getResolvedIp(agent.custom_domain),
    ]);

    let verifiedAt = agent.custom_domain_verified_at;
    if (verified) {
      verifiedAt = new Date().toISOString();
      const { error } = await supabase.from('agents').update({
        custom_domain_status: 'active',
        custom_domain_verified_at: verifiedAt,
      }).eq('id', agent.id);
      if (error) throw error;
      invalidateAgentCache();
      invalidateAgentDomainCache(agent.custom_domain);
      console.log(`[custom-domain] Manual verify OK: ${agent.custom_domain}`);
    }

    res.json({
      domain: agent.custom_domain,
      status: verified ? 'active' : 'pending',
      verified_at: verified ? verifiedAt : null,
      ip_required: process.env.VPS_PUBLIC_IP || null,
      resolved_ip: resolvedIp,
    });
  } catch (err) {
    console.error('[custom-domain] verify error:', err);
    res.status(500).json({ error: 'Gagal memverifikasi domain' });
  }
});

// GET /api/domains/authorize — dipanggil Caddy on-demand TLS (NO AUTH)
// Critical: hanya boleh return 200 untuk domain yang sudah active. Kalau bocor,
// Caddy akan issue cert untuk domain random dan kena rate limit Let's Encrypt.
app.get('/api/domains/authorize', async (req, res) => {
  const domain = (req.query.domain || '').toString().toLowerCase().trim();
  if (!domain || !validateDomainFormat(domain)) {
    return res.status(400).send('Missing or invalid domain');
  }
  if (isReservedDomain(domain)) {
    return res.sendStatus(403);
  }
  try {
    const { data } = await supabase
      .from('agents')
      .select('id, slug')
      .ilike('custom_domain', domain)
      .eq('custom_domain_status', 'active')
      .limit(1)
      .maybeSingle();
    return data && isCustomDomainEnabledForAgent(data) ? res.sendStatus(200) : res.sendStatus(403);
  } catch (err) {
    console.error('[custom-domain] authorize error:', err);
    return res.sendStatus(403);
  }
});

// Background job: tiap 1 menit cek semua domain 'pending' dan promote ke 'active'
// kalau A record sudah resolve ke VPS_PUBLIC_IP.
let customDomainCronRunning = false;
cron.schedule('* * * * *', async () => {
  if (customDomainCronRunning) return;
  if (!process.env.VPS_PUBLIC_IP) return;
  customDomainCronRunning = true;
  try {
    const { data: pendingAgents, error } = await supabase
      .from('agents')
      .select('id, slug, custom_domain')
      .eq('custom_domain_status', 'pending')
      .not('custom_domain', 'is', null);
    if (error) {
      console.warn('[custom-domain] cron query error:', error.message);
      return;
    }
    if (!pendingAgents?.length) return;

    for (const agent of pendingAgents) {
      try {
        const verified = await verifyDomainDns(agent.custom_domain);
        if (verified) {
          const { error: upErr } = await supabase.from('agents').update({
            custom_domain_status: 'active',
            custom_domain_verified_at: new Date().toISOString(),
          }).eq('id', agent.id);
          if (upErr) {
            console.warn(`[custom-domain] cron update failed for ${agent.custom_domain}:`, upErr.message);
          } else {
            invalidateAgentCache();
            invalidateAgentDomainCache(agent.custom_domain);
            console.log(`[custom-domain] Verified: ${agent.custom_domain}`);
          }
        }
      } catch (e) {
        console.warn(`[custom-domain] cron check failed for ${agent.custom_domain}:`, e.message);
      }
    }
  } finally {
    customDomainCronRunning = false;
  }
});

// ──────────────────────────────────────────────
// Bio Page Config API (/:slug/bio — Linktree-style)
// ──────────────────────────────────────────────

const BIO_VALID_THEMES = ['emerald', 'desert', 'midnight', 'rosegold', 'sunset', 'mono'];
const BIO_VALID_TILE_TYPES = ['umroh', 'umroh_landing', 'haji', 'wa', 'featured', 'link', 'text', 'photo', 'testi'];
const BIO_SINGLETON_TILE_TYPES = new Set(['umroh', 'umroh_landing', 'haji', 'wa', 'featured']);
const BIO_MAX_TILES = 50;

function bioNewId() {
  // crypto imported at top of CAPI section; ESM hoists so it's available here.
  return crypto.randomUUID().replace(/-/g, '').slice(0, 16);
}

function buildDefaultBioConfig(_agent) {
  return {
    theme: 'emerald',
    enabled: true,
    hero: {
      tagline: null,
      badges: ['📍 Indonesia', '🛡 PPIU Resmi'],
      socials: { instagram: null, tiktok: null, youtube: null },
    },
    seo: { title: null, description: null, og_image_url: null },
    tiles: [
      { id: bioNewId(), type: 'wa',             visible: true, order: 0, config: {} },
      { id: bioNewId(), type: 'umroh',          visible: true, order: 1, config: {} },
      { id: bioNewId(), type: 'umroh_landing',  visible: true, order: 2, config: {} },
      { id: bioNewId(), type: 'haji',           visible: true, order: 3, config: {} },
    ],
  };
}

// Fetch umroh_schedules row by jadwal_id (pick most recent year_code).
// jadwal_id is not globally unique (composite key with year_code), so we sort desc.
async function getJadwalById(jadwalId) {
  if (!jadwalId) return null;
  try {
    const { data } = await supabase
      .from('umroh_schedules')
      .select('*')
      .eq('jadwal_id', jadwalId)
      .order('year_code', { ascending: false })
      .limit(1)
      .maybeSingle();
    return data || null;
  } catch (err) {
    console.warn('[bio] getJadwalById error:', err.message);
    return null;
  }
}

async function buildWaLink(agent, bioConfig) {
  const tiles = Array.isArray(bioConfig?.tiles) ? bioConfig.tiles : [];
  const waTile = tiles.find(t => t.type === 'wa' && t.visible);
  if (!waTile) return null;
  if (!agent?.phone) return null;

  const featuredTile = tiles.find(t => t.type === 'featured' && t.visible);
  let paketName = '';
  if (featuredTile?.config?.jadwal_id) {
    const paket = await getJadwalById(featuredTile.config.jadwal_id);
    paketName = paket?.jadwal_nama || paket?.nama || '';
  }

  const template = waTile.config?.message_template
    || 'Assalamualaikum Kak {name}, saya tertarik dengan paket yang ditawarkan{paket}';
  const message = template
    .replace(/\{name\}/g, agent.name || '')
    .replace(/\{paket\}/g, paketName ? ` "${paketName}"` : '')
    .replace(/\s+/g, ' ')
    .trim();

  const cleanPhone = String(agent.phone).replace(/\D/g, '');
  return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
}

function sanitizeDraftTileConfig(type, cfg) {
  const out = {};
  if (!cfg || typeof cfg !== 'object') return out;
  switch (type) {
    case 'umroh':
    case 'umroh_landing':
    case 'haji':
      if (typeof cfg.cta === 'string') out.cta = cfg.cta.slice(0, 80);
      break;
    case 'wa':
      if (typeof cfg.title === 'string') out.title = cfg.title.slice(0, 80);
      if (typeof cfg.subtitle === 'string') out.subtitle = cfg.subtitle.slice(0, 120);
      if (typeof cfg.message_template === 'string') out.message_template = cfg.message_template.slice(0, 500);
      break;
    case 'featured':
      if (typeof cfg.jadwal_id === 'string') out.jadwal_id = cfg.jadwal_id.slice(0, 80);
      if (typeof cfg.badge === 'string') out.badge = cfg.badge.slice(0, 40);
      if (typeof cfg.cta === 'string') out.cta = cfg.cta.slice(0, 80);
      break;
    case 'link':
      if (typeof cfg.title === 'string') out.title = cfg.title.slice(0, 80);
      if (typeof cfg.url === 'string') out.url = cfg.url.trim().slice(0, 500);
      if (typeof cfg.icon === 'string') out.icon = cfg.icon.slice(0, 40);
      break;
    case 'text':
      if (typeof cfg.content === 'string') out.content = cfg.content.slice(0, 200);
      break;
    case 'photo':
      if (typeof cfg.image_url === 'string') out.image_url = cfg.image_url.trim();
      if (typeof cfg.caption === 'string') out.caption = cfg.caption.slice(0, 160);
      break;
    case 'testi':
      if (typeof cfg.quote === 'string') out.quote = cfg.quote.slice(0, 300);
      if (typeof cfg.author_name === 'string') out.author_name = cfg.author_name.slice(0, 80);
      if (typeof cfg.author_meta === 'string') out.author_meta = cfg.author_meta.slice(0, 80);
      break;
  }
  return out;
}

function validateTileConfig(tile) {
  const { type, config } = tile;
  const cfg = config && typeof config === 'object' ? config : {};
  if (tile.visible === false) {
    return { ok: true, config: sanitizeDraftTileConfig(type, cfg) };
  }
  switch (type) {
    case 'umroh':
    case 'umroh_landing':
    case 'haji':
      return { ok: true, config: { cta: typeof cfg.cta === 'string' ? cfg.cta.slice(0, 80) : undefined } };
    case 'wa': {
      const out = {};
      if (typeof cfg.title === 'string') out.title = cfg.title.slice(0, 80);
      if (typeof cfg.subtitle === 'string') out.subtitle = cfg.subtitle.slice(0, 120);
      if (typeof cfg.message_template === 'string') out.message_template = cfg.message_template.slice(0, 500);
      return { ok: true, config: out };
    }
    case 'featured': {
      if (!cfg.jadwal_id || typeof cfg.jadwal_id !== 'string') {
        return { ok: false, error: 'featured.jadwal_id wajib diisi' };
      }
      const out = { jadwal_id: cfg.jadwal_id };
      if (typeof cfg.badge === 'string') out.badge = cfg.badge.slice(0, 40);
      if (typeof cfg.cta === 'string') out.cta = cfg.cta.slice(0, 80);
      return { ok: true, config: out };
    }
    case 'link': {
      if (typeof cfg.title !== 'string' || !cfg.title.trim()) {
        return { ok: false, error: 'link.title wajib diisi' };
      }
      if (typeof cfg.url !== 'string' || !/^https:\/\//i.test(cfg.url)) {
        return { ok: false, error: 'link.url harus URL valid (https://…)' };
      }
      const out = { title: cfg.title.trim().slice(0, 80), url: cfg.url.trim() };
      if (typeof cfg.icon === 'string') out.icon = cfg.icon.slice(0, 40);
      return { ok: true, config: out };
    }
    case 'text': {
      if (typeof cfg.content !== 'string' || !cfg.content.trim()) {
        return { ok: false, error: 'text.content wajib diisi' };
      }
      if (cfg.content.length > 200) {
        return { ok: false, error: 'text.content maksimal 200 karakter' };
      }
      return { ok: true, config: { content: cfg.content } };
    }
    case 'photo': {
      if (typeof cfg.image_url !== 'string' || !/^https:\/\//i.test(cfg.image_url)) {
        return { ok: false, error: 'photo.image_url harus URL valid (upload via /api/bio/:slug/photo-upload)' };
      }
      const out = { image_url: cfg.image_url };
      if (typeof cfg.caption === 'string') out.caption = cfg.caption.slice(0, 160);
      return { ok: true, config: out };
    }
    case 'testi': {
      if (typeof cfg.quote !== 'string' || !cfg.quote.trim()) {
        return { ok: false, error: 'testi.quote wajib diisi' };
      }
      if (typeof cfg.author_name !== 'string' || !cfg.author_name.trim()) {
        return { ok: false, error: 'testi.author_name wajib diisi' };
      }
      const out = {
        quote: cfg.quote.trim().slice(0, 300),
        author_name: cfg.author_name.trim().slice(0, 80),
      };
      if (typeof cfg.author_meta === 'string') out.author_meta = cfg.author_meta.slice(0, 80);
      return { ok: true, config: out };
    }
    default:
      return { ok: false, error: `Tile type tidak dikenal: ${type}` };
  }
}

function normalizeBioConfig(raw, existing) {
  const base = existing && typeof existing === 'object' ? existing : {};
  const input = raw && typeof raw === 'object' ? raw : {};

  // Theme
  let theme = typeof input.theme === 'string' ? input.theme : base.theme;
  if (!BIO_VALID_THEMES.includes(theme)) theme = 'emerald';

  // Enabled flag
  const enabled = typeof input.enabled === 'boolean' ? input.enabled : (base.enabled !== false);

  // Hero
  const heroIn = input.hero && typeof input.hero === 'object' ? input.hero : {};
  const heroBase = base.hero && typeof base.hero === 'object' ? base.hero : {};
  const tagline = heroIn.tagline === null
    ? null
    : (typeof heroIn.tagline === 'string' ? heroIn.tagline.trim().slice(0, 120) || null : (heroBase.tagline ?? null));
  let badgesSrc = Array.isArray(heroIn.badges) ? heroIn.badges : heroBase.badges;
  if (!Array.isArray(badgesSrc)) badgesSrc = [];
  const badges = badgesSrc
    .filter(b => typeof b === 'string' && b.trim())
    .slice(0, 3)
    .map(b => b.trim().slice(0, 40));
  const socialsIn = heroIn.socials && typeof heroIn.socials === 'object' ? heroIn.socials : {};
  const socialsBase = heroBase.socials && typeof heroBase.socials === 'object' ? heroBase.socials : {};
  const normalizeHandle = (val, fallback) => {
    if (val === null) return null;
    if (typeof val === 'string') {
      const trimmed = val.trim().replace(/^@+/, '').slice(0, 60);
      return trimmed || null;
    }
    return fallback ?? null;
  };
  const socials = {
    instagram: normalizeHandle(socialsIn.instagram, socialsBase.instagram),
    tiktok: normalizeHandle(socialsIn.tiktok, socialsBase.tiktok),
    youtube: normalizeHandle(socialsIn.youtube, socialsBase.youtube),
  };

  // SEO
  const seoIn = input.seo && typeof input.seo === 'object' ? input.seo : {};
  const seoBase = base.seo && typeof base.seo === 'object' ? base.seo : {};
  const normSeoField = (val, baseVal, max) => {
    if (val === null) return null;
    if (typeof val === 'string') {
      const trimmed = val.trim();
      return trimmed ? trimmed.slice(0, max) : null;
    }
    return baseVal ?? null;
  };
  const seo = {
    title: normSeoField(seoIn.title, seoBase.title, 60),
    description: normSeoField(seoIn.description, seoBase.description, 160),
    og_image_url: (seoIn.og_image_url === null
      ? null
      : (typeof seoIn.og_image_url === 'string' ? seoIn.og_image_url.trim() || null : (seoBase.og_image_url ?? null))),
  };

  // Tiles
  const tilesIn = Array.isArray(input.tiles) ? input.tiles : [];
  if (tilesIn.length > BIO_MAX_TILES) {
    throw Object.assign(new Error(`Maksimal ${BIO_MAX_TILES} tile`), { status: 400 });
  }
  const typeCounts = new Map();
  const cleanedTiles = [];
  for (const t of tilesIn) {
    if (!t || typeof t !== 'object') continue;
    const type = t.type;
    if (!BIO_VALID_TILE_TYPES.includes(type)) {
      throw Object.assign(new Error(`Tile type tidak valid: ${type}`), { status: 400 });
    }
    if (BIO_SINGLETON_TILE_TYPES.has(type)) {
      const n = (typeCounts.get(type) || 0) + 1;
      typeCounts.set(type, n);
      if (n > 1) {
        throw Object.assign(new Error(`Tile type "${type}" hanya boleh 1×`), { status: 400 });
      }
    }
    // Be graceful with incomplete-but-visible tiles: instead of rejecting the
    // whole save (which would block auto-save while the agent is still typing),
    // accept the save with the user's intended visibility flag intact and just
    // sanitize the config. The render-time guard on the public bio
    // (`canShowBioTile`) keeps incomplete tiles from leaking out, so the user-
    // facing effect on the public page is identical — but the editor preserves
    // the user's "make this section visible by default" intent until they
    // finish filling it in.
    let validated = validateTileConfig(t);
    if (!validated.ok) {
      const fallback = validateTileConfig({ ...t, visible: false });
      if (!fallback.ok) {
        throw Object.assign(new Error(validated.error), { status: 400 });
      }
      validated = fallback;
    }
    cleanedTiles.push({
      id: typeof t.id === 'string' && t.id.trim() ? t.id.trim().slice(0, 32) : bioNewId(),
      type,
      visible: t.visible !== false,
      order: 0, // re-assigned below
      config: validated.config,
    });
  }
  // Sort by incoming order (if present) then re-normalize to 0-indexed sequential
  const withOrder = tilesIn.map((t, idx) => ({ idx, order: Number.isFinite(t?.order) ? t.order : idx }));
  withOrder.sort((a, b) => a.order - b.order || a.idx - b.idx);
  const finalTiles = withOrder
    .map(({ idx }) => cleanedTiles[idx])
    .filter(Boolean)
    .map((tile, i) => ({ ...tile, order: i }));

  return { theme, enabled, hero: { tagline, badges, socials }, seo, tiles: finalTiles };
}

// Decorate stored config with runtime-computed fields (orphan flag, WA link preview)
async function decorateBioConfigForRead(agent, bioConfig) {
  const cfg = JSON.parse(JSON.stringify(bioConfig || {}));
  cfg.enabled = cfg.enabled !== false;
  cfg.seo = cfg.seo || { title: null, description: null, og_image_url: null };
  cfg.hero = cfg.hero || { tagline: null, badges: [], socials: {} };
  cfg.hero.badges = Array.isArray(cfg.hero.badges) ? cfg.hero.badges : [];
  cfg.hero.socials = cfg.hero.socials || { instagram: null, tiktok: null, youtube: null };
  const tiles = Array.isArray(cfg.tiles) ? cfg.tiles : [];
  cfg.tiles = tiles;

  // Check featured paket orphan
  const featured = tiles.find(t => t.type === 'featured');
  if (featured?.config?.jadwal_id) {
    const paket = await getJadwalById(featured.config.jadwal_id);
    featured.orphaned = !paket;
  }

  const waLinkPreview = await buildWaLink(agent, cfg);

  return { ...cfg, _wa_link_preview: waLinkPreview };
}

function bioResolveAgentForRequest(req) {
  return {
    async resolve(slug) {
      const normalized = String(slug || '').toLowerCase();
      const agent = await getAgentBySlug(normalized);
      if (!agent) return { error: { status: 404, msg: 'Agent not found' } };
      const isAdmin = req.user?.role === 'admin';
      const ownsSlug = req.user?.slug === normalized || req.user?.id === agent.id;
      if (!isAdmin && !ownsSlug) {
        return { error: { status: 403, msg: 'Forbidden' } };
      }
      return { agent };
    },
  };
}

async function getOptionalAuthUser(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    if (!decoded.id && decoded.slug) {
      let agent = await getAgentBySlug(decoded.slug);
      if (!agent) {
        const { data: history } = await supabase
          .from('agent_slug_history')
          .select('agent_id')
          .eq('old_slug', decoded.slug)
          .order('changed_at', { ascending: false })
          .limit(1)
          .single();
        if (history) agent = await getAgentById(history.agent_id);
      }
      if (agent) {
        decoded.id = agent.id;
        decoded.slug = agent.slug;
      }
    }
    return decoded.id ? decoded : null;
  } catch {
    return null;
  }
}

// GET /api/bio/:slug/config — auto-populate default on first access, else return persisted config.
// GET is public — the bio page is public, so the config that drives it must be readable
// without auth. The editor endpoints (PUT/upload) still require JWT.
app.get('/api/bio/:slug/config', async (req, res) => {
  try {
    const slug = String(req.params.slug || '').toLowerCase();
    const agent = await getAgentBySlug(slug);
    if (!agent) return res.status(404).json({ error: 'Agent not found' });

    const existing = agent.bio_config;
    const isEmpty = !existing || (typeof existing === 'object' && Object.keys(existing).length === 0);

    let config;
    if (isEmpty) {
      config = buildDefaultBioConfig(agent);
      const { error: dbErr } = await supabase
        .from('agents')
        .update({ bio_config: config })
        .eq('id', agent.id);
      if (dbErr) {
        console.error('[bio-config] auto-populate persist error:', dbErr);
      } else {
        invalidateAgentCache();
      }
    } else {
      config = existing;
    }

    // Disabled bios still return 404 at the API layer so scrapers don't surface them
    const authUser = await getOptionalAuthUser(req);
    const canReadDisabled = authUser && (authUser.role === 'admin' || authUser.slug === slug || authUser.id === agent.id);
    if (config?.enabled === false && !canReadDisabled) {
      return res.status(404).json({ error: 'Bio disabled' });
    }

    const decorated = await decorateBioConfigForRead(agent, config);
    res.json({ success: true, data: decorated });
  } catch (err) {
    console.error('[bio-config] GET error:', err);
    res.status(500).json({ error: 'Gagal memuat konfigurasi bio' });
  }
});

// PUT /api/bio/:slug/config — save validated bio config.
app.put('/api/bio/:slug/config', authMiddleware, express.json({ limit: '200kb' }), async (req, res) => {
  try {
    const { resolve: resolveAgent } = bioResolveAgentForRequest(req);
    const { agent, error } = await resolveAgent(req.params.slug);
    if (error) return res.status(error.status).json({ error: error.msg });

    const normalized = normalizeBioConfig(req.body, agent.bio_config || {});

    const { error: dbErr } = await supabase
      .from('agents')
      .update({ bio_config: normalized })
      .eq('id', agent.id);
    if (dbErr) throw dbErr;

    invalidateAgentCache();
    const decorated = await decorateBioConfigForRead(agent, normalized);
    res.json({ success: true, data: decorated });
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error('[bio-config] PUT error:', err);
    res.status(status).json({ error: err.message || 'Gagal menyimpan konfigurasi bio' });
  }
});

// POST /api/bio/:slug/og-image — upload custom OG image, return public URL (client persists URL via PUT).
app.post('/api/bio/:slug/og-image', authMiddleware, express.json({ limit: '6mb' }), async (req, res) => {
  try {
    const { resolve: resolveAgent } = bioResolveAgentForRequest(req);
    const { agent, error } = await resolveAgent(req.params.slug);
    if (error) return res.status(error.status).json({ error: error.msg });

    const { mime, data } = req.body || {};
    if (!['image/png', 'image/jpeg'].includes(mime)) {
      return res.status(400).json({ error: 'mime harus image/png atau image/jpeg' });
    }
    if (typeof data !== 'string' || !data) {
      return res.status(400).json({ error: 'data base64 kosong' });
    }
    const base64 = data.startsWith('data:') ? data.slice(data.indexOf(',') + 1) : data;
    const buffer = Buffer.from(base64, 'base64');
    if (buffer.length > 5 * 1024 * 1024) {
      return res.status(400).json({ error: 'Ukuran file maksimal 5MB' });
    }

    const ext = mime === 'image/png' ? 'png' : 'jpg';
    const fileName = `bio/${agent.slug}-${Date.now()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('agent-photos')
      .upload(fileName, buffer, { contentType: mime, upsert: true });
    if (uploadError) {
      console.error('[bio-config] OG upload error:', uploadError);
      return res.status(500).json({ error: 'Gagal mengunggah gambar' });
    }

    const { data: urlData } = supabase.storage.from('agent-photos').getPublicUrl(fileName);
    res.json({ success: true, url: urlData.publicUrl });
  } catch (err) {
    console.error('[bio-config] og-image error:', err);
    res.status(500).json({ error: 'Gagal mengunggah gambar' });
  }
});

// POST /api/bio/:slug/tagline-generate — generate a 1-line tagline via OpenAI.
app.post('/api/bio/:slug/tagline-generate', authMiddleware, express.json({ limit: '4kb' }), async (req, res) => {
  const OPENAI_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_KEY) {
    return res.status(500).json({ error: 'OPENAI_API_KEY belum dikonfigurasi' });
  }
  try {
    const { resolve: resolveAgent } = bioResolveAgentForRequest(req);
    const { agent, error } = await resolveAgent(req.params.slug);
    if (error) return res.status(error.status).json({ error: error.msg });

    const TAGLINE_MIN = 100;
    const TAGLINE_MAX = 115;

    const systemPrompt = `Kamu copywriter untuk konsultan travel umroh & haji Alhijaz Indowisata.
Tulis SATU baris tagline untuk halaman bio link konsultan, dalam Bahasa Indonesia.
Panjang WAJIB antara ${TAGLINE_MIN} sampai ${TAGLINE_MAX} karakter (hitung huruf, spasi, dan simbol; emoji = 2 karakter). Jangan kurang dari ${TAGLINE_MIN} dan jangan lebih dari ${TAGLINE_MAX}.
Gaya: hangat, islami secukupnya, percaya diri, tidak berlebihan, tanpa hashtag.
Boleh pakai 1 emoji halus seperti 🌙, 🕋, ✨, ✈️ — tapi tidak wajib.
Pakai pemisah " · " (bullet) untuk menggabungkan 2 frasa singkat agar pas panjangnya. Jangan akhiri dengan tanda titik.
Hanya keluarkan teks tagline-nya saja, tanpa tanda kutip, tanpa penjelasan, tanpa hitungan karakter.`;

    const userPrompt = `Konsultan: ${agent.name || 'Konsultan Alhijaz'}
Tugas: konsultan paket Umroh & Haji Plus Alhijaz.
Buatkan satu tagline yang membuat calon jamaah merasa nyaman menghubungi. Pastikan panjangnya ${TAGLINE_MIN}-${TAGLINE_MAX} karakter.`;

    const callOpenAI = async (extraNote = '') => {
      const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt + (extraNote ? `\n\n${extraNote}` : '') },
      ];
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OPENAI_KEY}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages,
          temperature: 0.85,
          max_tokens: 90,
        }),
      });
      if (!r.ok) {
        const errBody = await r.text();
        throw new Error(`OpenAI ${r.status}: ${errBody.slice(0, 200)}`);
      }
      const j = await r.json();
      let t = (j.choices?.[0]?.message?.content || '').trim();
      t = t.replace(/^["'`]+|["'`]+$/g, '').trim();
      // Drop trailing period — the prompt forbids it but the model sometimes ignores
      t = t.replace(/[.\s]+$/, '').trim();
      return t;
    };

    let tagline = '';
    let lastLen = 0;
    // Up to 3 attempts to land inside the target window. Each retry tells the
    // model exactly what went wrong with its last try so it adjusts.
    for (let attempt = 0; attempt < 3; attempt++) {
      const note = attempt === 0
        ? ''
        : lastLen < TAGLINE_MIN
          ? `Percobaan sebelumnya ${lastLen} karakter — terlalu pendek. Tambahkan 1 frasa pendukung lalu hitung ulang sampai ${TAGLINE_MIN}-${TAGLINE_MAX} karakter.`
          : `Percobaan sebelumnya ${lastLen} karakter — terlalu panjang. Padatkan menjadi ${TAGLINE_MIN}-${TAGLINE_MAX} karakter.`;
      const t = await callOpenAI(note);
      if (!t) continue;
      tagline = t;
      lastLen = t.length;
      if (lastLen >= TAGLINE_MIN && lastLen <= TAGLINE_MAX) break;
    }

    if (!tagline) return res.status(502).json({ error: 'Tagline kosong, coba lagi' });
    // Final hard guard: trim if still over max — never return >115 chars to the client
    if (tagline.length > TAGLINE_MAX) tagline = tagline.slice(0, TAGLINE_MAX).trim();

    res.json({ success: true, tagline });
  } catch (err) {
    console.error('[bio-tagline] error:', err);
    res.status(500).json({ error: err.message || 'Gagal generate tagline' });
  }
});

// POST /api/bio/:slug/photo-upload — upload a photo for a `photo` tile.
app.post('/api/bio/:slug/photo-upload', authMiddleware, express.json({ limit: '8mb' }), async (req, res) => {
  try {
    const { resolve: resolveAgent } = bioResolveAgentForRequest(req);
    const { agent, error } = await resolveAgent(req.params.slug);
    if (error) return res.status(error.status).json({ error: error.msg });

    const { mime, data } = req.body || {};
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(mime)) {
      return res.status(400).json({ error: 'mime harus image/png, image/jpeg, atau image/webp' });
    }
    if (typeof data !== 'string' || !data) {
      return res.status(400).json({ error: 'data base64 kosong' });
    }
    const base64 = data.startsWith('data:') ? data.slice(data.indexOf(',') + 1) : data;
    const buffer = Buffer.from(base64, 'base64');
    if (buffer.length > 6 * 1024 * 1024) {
      return res.status(400).json({ error: 'Ukuran file maksimal 6MB' });
    }

    const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
    const fileName = `bio/photo-${agent.slug}-${bioNewId()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('agent-photos')
      .upload(fileName, buffer, { contentType: mime, upsert: false });
    if (uploadError) {
      console.error('[bio-config] photo upload error:', uploadError);
      return res.status(500).json({ error: 'Gagal mengunggah foto' });
    }

    const { data: urlData } = supabase.storage.from('agent-photos').getPublicUrl(fileName);
    res.json({ success: true, url: urlData.publicUrl });
  } catch (err) {
    console.error('[bio-config] photo-upload error:', err);
    res.status(500).json({ error: 'Gagal mengunggah foto' });
  }
});

// GET /api/bio/:slug/featured-paket-preview?jadwal_id=XXX — public picker preview.
app.get('/api/bio/:slug/featured-paket-preview', async (req, res) => {
  const jadwalId = String(req.query.jadwal_id || '').trim();
  if (!jadwalId) {
    return res.status(400).json({ success: false, error: 'jadwal_id wajib diisi' });
  }
  const paket = await getJadwalById(jadwalId);
  if (!paket) {
    return res.status(400).json({ success: false, error: 'Paket tidak ditemukan' });
  }

  // Build a compact preview: first-tier pricing as a quick anchor price.
  const hargaObj = paket.paket_harga || {};
  const firstTier = Object.values(hargaObj)[0] || {};
  const anchorPrice = firstTier.Quard || firstTier.Triple || firstTier.Double || null;

  res.json({
    success: true,
    data: {
      jadwal_id: paket.jadwal_id,
      year_code: paket.year_code,
      name: paket.jadwal_nama || paket.nama || '',
      berangkat_tgl: paket.berangkat_tgl || '',
      pulang_tgl: paket.pulang_tgl || '',
      maskapai: paket.maskapai || '',
      seat_total: paket.seat_total ?? null,
      seat_sisa: paket.seat_sisa ?? null,
      image_url: paket.brosur_cdn
        ? appendUrlVersion(paket.brosur_cdn, paket.brosur_source_sha256)
        : (paket.brosur || null),
      anchor_price: anchorPrice ? Number(anchorPrice) : null,
    },
  });
});

// List all agents (admin only)
app.get('/api/admin/agents', authMiddleware, adminOnly, async (req, res) => {
  const { data, error } = await supabase
    .from('agents')
    .select('slug, name, website, phone, email, photo, role, jamaah_username, jamaah_password, jamaah_kantor, card_variant, status, registered_at')
    .order('name');
  if (error) return res.status(500).json({ error: error.message });
  // Don't expose raw encrypted password — just indicate if it's set
  const safe = (data || []).map(a => ({ ...a, jamaah_password: a.jamaah_password ? '••••••' : '' }));
  res.json(safe);
});

// Update any agent (admin only)
app.put('/api/admin/agents/:slug', authMiddleware, adminOnly, async (req, res) => {
  const targetAgent = await getAgentBySlug(req.params.slug.toLowerCase());
  if (!targetAgent) return res.status(404).json({ error: 'Agent not found' });
  const { name, website, phone, email, role, password: rawPassword, jamaah_username, jamaah_password, jamaah_kantor } = req.body;
  const updates = {};
  if (name !== undefined) updates.name = name;
  if (website !== undefined) updates.website = website;
  if (phone !== undefined) updates.phone = phone;
  if (email !== undefined) updates.email = email;
  if (role !== undefined) updates.role = role;
  if (rawPassword !== undefined) updates.password = await bcrypt.hash(rawPassword, 12);
  if (jamaah_username !== undefined) updates.jamaah_username = jamaah_username || null;
  if (jamaah_password !== undefined) updates.jamaah_password = jamaah_password ? capiEncrypt(jamaah_password) : null;
  if (jamaah_kantor !== undefined) updates.jamaah_kantor = jamaah_kantor || '2';

  const { error } = await supabase
    .from('agents')
    .update(updates)
    .eq('id', targetAgent.id);
  if (error) return res.status(500).json({ error: error.message });
  invalidateAgentCache();
  // Name / website / phone changes affect the default OG text
  if (updates.name !== undefined || updates.website !== undefined || updates.phone !== undefined) {
    triggerOgRegen(targetAgent.slug);
  }
  res.json({ success: true });
});

// Create new agent (admin only)
app.post('/api/admin/agents', authMiddleware, adminOnly, async (req, res) => {
  const { slug, name, website, phone, photo, password: rawPassword, role, jamaah_username, jamaah_password, jamaah_kantor } = req.body;
  if (!slug || !name || !rawPassword) {
    return res.status(400).json({ error: 'slug, name, dan password wajib diisi' });
  }
  const hashedPassword = await bcrypt.hash(rawPassword, 12);
  const insert = {
    slug: slug.toLowerCase(),
    name, website: website || '', phone: phone || '',
    photo: photo || `/agents/${slug.toLowerCase()}.jpg`,
    password: hashedPassword, role: role || 'agent',
  };
  if (jamaah_username) insert.jamaah_username = jamaah_username;
  if (jamaah_password) insert.jamaah_password = capiEncrypt(jamaah_password);
  if (jamaah_kantor) insert.jamaah_kantor = jamaah_kantor;
  const { error } = await supabase.from('agents').insert(insert);
  if (error) return res.status(500).json({ error: error.message });
  invalidateAgentCache();
  triggerOgRegen(insert.slug);
  res.json({ success: true });
});

// Delete agent (admin only)
app.delete('/api/admin/agents/:slug', authMiddleware, adminOnly, async (req, res) => {
  const targetAgent = await getAgentBySlug(req.params.slug.toLowerCase());
  if (!targetAgent) return res.status(404).json({ error: 'Agent not found' });
  // Don't allow deleting yourself
  if (targetAgent.id === req.user.id) {
    return res.status(400).json({ error: 'Tidak bisa menghapus akun sendiri' });
  }
  const { error } = await supabase.from('agents').delete().eq('id', targetAgent.id);
  if (error) return res.status(500).json({ error: error.message });
  // Also delete CAPI config
  await supabase.from('capi_configs').delete().eq('agent_id', targetAgent.id);
  invalidateAgentCache();
  res.json({ success: true });
});

// Approve pending agent (admin only)
app.put('/api/admin/agents/:slug/approve', authMiddleware, adminOnly, async (req, res) => {
  const targetAgent = await getAgentBySlug(req.params.slug.toLowerCase());
  if (!targetAgent) return res.status(404).json({ error: 'Agent not found' });
  const { data, error } = await supabase
    .from('agents')
    .update({ status: 'active' })
    .eq('id', targetAgent.id)
    .eq('status', 'pending')
    .select('slug')
    .single();
  if (error || !data) return res.status(404).json({ error: 'Agent pending tidak ditemukan' });
  invalidateAgentCache();
  triggerOgRegen(data.slug);
  res.json({ success: true });
});

// Reject pending agent (admin only) — deletes the row so data isn't retained
app.put('/api/admin/agents/:slug/reject', authMiddleware, adminOnly, async (req, res) => {
  const targetAgent = await getAgentBySlug(req.params.slug.toLowerCase());
  if (!targetAgent) return res.status(404).json({ error: 'Agent not found' });
  const { data, error } = await supabase
    .from('agents')
    .delete()
    .eq('id', targetAgent.id)
    .eq('status', 'pending')
    .select('slug')
    .single();
  if (error || !data) return res.status(404).json({ error: 'Agent pending tidak ditemukan' });
  invalidateAgentCache();
  res.json({ success: true });
});

// ──────────────────────────────────────────────
// CAPI: Meta Conversion API routes (Supabase-backed)
// ──────────────────────────────────────────────
import crypto from 'crypto';

const CAPI_ENCRYPTION_KEY = process.env.CAPI_ENCRYPTION_KEY || '';

function capiEncrypt(text) {
  if (!CAPI_ENCRYPTION_KEY || !text) return text;
  const key = Buffer.from(CAPI_ENCRYPTION_KEY, 'base64').slice(0, 32);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${tag}:${encrypted}`;
}

function capiDecrypt(data) {
  if (!CAPI_ENCRYPTION_KEY || !data || !data.includes(':')) return data;
  try {
    const [ivHex, tagHex, encrypted] = data.split(':');
    const key = Buffer.from(CAPI_ENCRYPTION_KEY, 'base64').slice(0, 32);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch { return data; }
}

function isSupabaseSchemaMiss(error) {
  const text = `${error?.code || ''} ${error?.message || ''} ${error?.details || ''}`;
  return text.includes('42703') ||
    text.includes('does not exist') ||
    text.includes('schema cache') ||
    text.includes('Could not find');
}

function normalizeCapiSlug(slug) {
  return String(slug || '').toLowerCase().replace(/[^a-z0-9-]/g, '');
}

function mapCapiConfigRow(data) {
  if (!data) return null;
  return {
    pixelId: data.pixel_id ?? data.pixelId ?? '',
    accessToken: data.access_token ?? data.accessToken ?? '',
    testEventCode: data.test_event_code ?? data.testEventCode ?? '',
    testMode: !!(data.test_mode ?? data.testMode),
    events: data.events || {},
    updatedAt: data.updated_at ?? data.updatedAt ?? '',
  };
}

function readLocalCapiConfig(slug) {
  const safeSlug = normalizeCapiSlug(slug);
  if (!safeSlug) return null;
  const filePath = resolve(__dirname, 'data', 'capi', `${safeSlug}.json`);
  if (!existsSync(filePath)) return null;
  try {
    return mapCapiConfigRow(JSON.parse(readFileSync(filePath, 'utf8')));
  } catch (err) {
    console.warn(`[CAPI] ${safeSlug}: failed to read legacy local config:`, err.message);
    return null;
  }
}

async function backfillLegacyCapiAgentId(agentId, slug) {
  const safeSlug = normalizeCapiSlug(slug);
  if (!agentId || !safeSlug) return;
  const { error } = await supabase
    .from('capi_configs')
    .update({ agent_id: agentId })
    .eq('slug', safeSlug);
  if (error && !isSupabaseSchemaMiss(error)) {
    console.warn(`[CAPI] ${safeSlug}: failed to backfill config agent_id:`, error.message);
  }
}

async function readCapiConfig(agentId, slug = null) {
  if (agentId) {
    const { data, error } = await supabase
      .from('capi_configs')
      .select('*')
      .eq('agent_id', agentId)
      .limit(1);
    if (!error && data?.[0]) return mapCapiConfigRow(data[0]);
    if (error && !isSupabaseSchemaMiss(error)) {
      console.warn(`[CAPI] ${slug || agentId}: failed to read config by agent_id:`, error.message);
    }
  }

  const safeSlug = normalizeCapiSlug(slug);
  if (safeSlug) {
    const { data, error } = await supabase
      .from('capi_configs')
      .select('*')
      .eq('slug', safeSlug)
      .limit(1);
    if (!error && data?.[0]) {
      if (!data[0].agent_id || data[0].agent_id !== agentId) {
        backfillLegacyCapiAgentId(agentId, safeSlug).catch(() => {});
      }
      return mapCapiConfigRow(data[0]);
    }
    if (error && !isSupabaseSchemaMiss(error)) {
      console.warn(`[CAPI] ${safeSlug}: failed to read legacy config by slug:`, error.message);
    }
  }

  return readLocalCapiConfig(safeSlug);
}

async function writeCapiConfig(agentId, config, slug = null) {
  const now = new Date().toISOString();
  const payload = {
    agent_id: agentId,
    pixel_id: config.pixelId || '',
    access_token: config.accessToken || '',
    test_event_code: config.testEventCode || '',
    test_mode: config.testMode || false,
    events: config.events || {},
    updated_at: now,
  };

  const { error } = await supabase
    .from('capi_configs')
    .upsert(payload, { onConflict: 'agent_id' });
  if (!error) return;

  const safeSlug = normalizeCapiSlug(slug);
  if (safeSlug) {
    const legacyPayload = {
      slug: safeSlug,
      pixel_id: payload.pixel_id,
      access_token: payload.access_token,
      test_event_code: payload.test_event_code,
      test_mode: payload.test_mode,
      events: payload.events,
      updated_at: now,
    };
    const { error: legacyError } = await supabase
      .from('capi_configs')
      .upsert(legacyPayload, { onConflict: 'slug' });
    if (!legacyError) return;

    if (!isSupabaseSchemaMiss(legacyError)) {
      console.error('[Supabase] CAPI legacy write error:', legacyError.message);
    }
  }

  console.error('[Supabase] CAPI write error:', error.message);
  throw error;
}

/**
 * Log a CAPI event to capi_event_logs table. Fire-and-forget.
 */
function logCapiEvent(agentId, eventName, status, { value, errorMessage, source } = {}) {
  supabase.from('capi_event_logs').insert({
    agent_id: agentId,
    event_name: eventName,
    status,
    value: value || null,
    error_message: errorMessage || null,
    source: source || 'browser',
  }).then(({ error }) => {
    if (error) console.error('[CAPI] Log insert error:', error.message);
  });
}

/**
 * Fire a single CAPI Purchase event to Meta Graph API.
 * Silent fail — jangan ganggu sync flow.
 *
 * `phase` is 'dp' or 'lunas' — used to generate DETERMINISTIC event_id
 * so Meta auto-dedupes if the same event is accidentally sent more than once.
 */
async function fireCapiPurchaseEvent(agentId, config, accessToken, slug, { id, eventKey, contentId, value, contentName, contentType, userName, userPhone, phase }) {
  // Hash user data for Meta (SHA-256) — Meta requires hashed PII
  const sha256 = (v) => v ? crypto.createHash('sha256').update(v.trim().toLowerCase()).digest('hex') : undefined;

  const userData = { client_user_agent: 'Miqot Server Sync' };
  if (userName) userData.fn = sha256(userName.split(' ')[0]); // first name
  if (userName && userName.includes(' ')) userData.ln = sha256(userName.split(' ').slice(1).join(' ')); // last name
  if (userPhone) userData.ph = sha256(userPhone.replace(/\D/g, '')); // phone digits only
  userData.country = sha256('id'); // Indonesia

  // Deterministic event_id: same jamaah + same phase = same ID, Meta auto-dedupes
  const eventSubject = eventKey || id;
  const eventId = `${agentId}-${eventSubject}-${phase}`;

  const payload = {
    data: [{
      event_name: 'Purchase',
      event_id: eventId,
      event_time: Math.floor(Date.now() / 1000),
      event_source_url: `https://alhijaz.co/${slug}`,
      action_source: 'system_generated',
      user_data: userData,
      custom_data: {
        currency: 'IDR',
        value,
        content_name: contentName,
        content_ids: [contentId || id],
        content_type: 'product',
      },
    }],
    ...(config.testMode && config.testEventCode ? { test_event_code: config.testEventCode } : {}),
  };

  const resp = await fetch(
    `https://graph.facebook.com/v21.0/${config.pixelId}/events?access_token=${encodeURIComponent(accessToken)}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }
  );

  const respData = await resp.json();

  if (!resp.ok || respData?.error) {
    const errMsg = respData?.error?.message || `HTTP ${resp.status}`;
    console.error(`[CAPI] Purchase failed ${slug}/${id}:`, errMsg);
    logCapiEvent(agentId, 'Purchase', 'error', { value, errorMessage: errMsg.slice(0, 500), source: 'sync' });
    capiCircuitRecordResult(agentId, false, errMsg);
    return false;
  }
  if (respData?.events_received === 0) {
    const msg = 'Meta received 0 events: ' + JSON.stringify(respData.messages || []);
    console.error(`[CAPI] Purchase ${slug}/${id}:`, msg);
    logCapiEvent(agentId, 'Purchase', 'error', { value, errorMessage: msg.slice(0, 500), source: 'sync' });
    capiCircuitRecordResult(agentId, false, msg);
    return false;
  }
  console.log(`[CAPI] Purchase sent: ${slug}/${id} (${contentType}/${phase}) = Rp${value.toLocaleString('id-ID')}`);
  logCapiEvent(agentId, 'Purchase', 'success', { value, source: 'sync' });
  capiCircuitRecordResult(agentId, true);
  return true;
}

const HAJI_PURCHASE_VALUE = 60000000;

// In-memory mutex: serialize processCapiPurchases per agent.
// Prevents race conditions when multiple sync batches fire in parallel.
const capiPurchaseLocks = new Map(); // agentId -> Promise

// In-memory circuit breaker: pauses CAPI fires per agent after consecutive
// failures. Prevents retry-storms when an agent's access token is permanently
// broken at Meta's side (e.g., token revoked, wrong app, code 190 OAuthException).
// State per agent: { failures, openedAt, lastError } — purely transient, resets on restart.
const CAPI_CIRCUIT_THRESHOLD = 10;          // consecutive failures to open circuit
const CAPI_CIRCUIT_COOLDOWN_MS = 30 * 60 * 1000; // 30 min pause once opened
const CAPI_CIRCUIT_SKIP_LOG_INTERVAL_MS = 15 * 60 * 1000;
const capiCircuit = new Map();
const capiCircuitSkipLogAt = new Map();

function isPermanentCapiAuthError(errorMessage) {
  const msg = String(errorMessage || '').toLowerCase();
  return (
    msg.includes('access token could not be decrypted') ||
    msg.includes('error validating access token') ||
    msg.includes('invalid oauth access token') ||
    msg.includes('invalid access token') ||
    msg.includes('malformed access token') ||
    msg.includes('session has expired') ||
    msg.includes('oauth')
  );
}

function capiCircuitIsOpen(agentId) {
  const state = capiCircuit.get(agentId);
  if (!state?.openedAt) return false;
  if (state.permanent) return true;
  if (Date.now() - state.openedAt >= CAPI_CIRCUIT_COOLDOWN_MS) {
    // Cooldown elapsed — half-open: clear state so next fire is allowed to test recovery.
    capiCircuit.delete(agentId);
    return false;
  }
  return true;
}

function capiCircuitRecordResult(agentId, ok, errorMessage) {
  if (ok) {
    if (capiCircuit.has(agentId)) capiCircuit.delete(agentId);
    return;
  }
  const state = capiCircuit.get(agentId) || { failures: 0, openedAt: null, lastError: null };
  state.failures += 1;
  state.lastError = errorMessage || null;
  if (isPermanentCapiAuthError(errorMessage)) {
    state.openedAt = state.openedAt || Date.now();
    state.permanent = true;
    state.reason = 'auth';
    capiCircuit.set(agentId, state);
    console.warn(`[CAPI] Circuit LOCKED for agent ${agentId}: permanent auth/token error (${String(errorMessage || '').slice(0, 120)}). Requires valid CAPI config save/validation.`);
    return;
  }
  if (state.failures >= CAPI_CIRCUIT_THRESHOLD && !state.openedAt) {
    state.openedAt = Date.now();
    console.warn(`[CAPI] Circuit OPEN for agent ${agentId} after ${state.failures} consecutive failures (last: ${(errorMessage || '').slice(0, 120)}). Pausing for ${CAPI_CIRCUIT_COOLDOWN_MS / 60000} min.`);
  }
  capiCircuit.set(agentId, state);
}

function logCapiCircuitSkip(agentId, eventName, errorMessage, source = 'sync') {
  const key = `${agentId}:${eventName}:${source}`;
  const now = Date.now();
  const last = capiCircuitSkipLogAt.get(key) || 0;
  if (now - last < CAPI_CIRCUIT_SKIP_LOG_INTERVAL_MS) return;
  capiCircuitSkipLogAt.set(key, now);
  logCapiEvent(agentId, eventName, 'error', { errorMessage, source });
}

/**
 * Process CAPI Purchase events for Umroh or Haji jamaah after sync upsert.
 * Sends Purchase at DP (first payment) and again at Lunas (full payment).
 * Dedup via capi_purchase_status column: null → 'dp' → 'lunas'.
 *
 * @param {string} agentId
 * @param {string} slug - agent slug
 * @param {'umroh'|'haji'} type
 * @param {Array} upsertedIdentifiers - for umroh: [{id_umroh, nama}], for haji: [{id_haji, id_jamaah}]
 */
async function processCapiPurchases(agentId, slug, type, upsertedIdentifiers) {
  // Serialize per-agent to eliminate race conditions between parallel sync batches.
  // Multiple calls for the same agent queue up sequentially; different agents run parallel.
  const prev = capiPurchaseLocks.get(agentId);
  const currentPromise = (async () => {
    if (prev) { try { await prev; } catch {} } // wait for previous call, ignore its errors
    return await _doProcessCapiPurchases(agentId, slug, type, upsertedIdentifiers);
  })();
  capiPurchaseLocks.set(agentId, currentPromise);
  try {
    return await currentPromise;
  } finally {
    // Only clear if this is still the latest promise (another may have chained on)
    if (capiPurchaseLocks.get(agentId) === currentPromise) {
      capiPurchaseLocks.delete(agentId);
    }
  }
}

/**
 * Atomic claim: try to transition capi_purchase_status from expected values to target.
 * Only rows that were actually updated (matching expected status) are returned.
 * Prevents duplicate fires when multiple workers race for the same jamaah.
 */
async function _claimCapiStatus(table, agentId, matchKey, expectedStatuses, target) {
  // Build WHERE from matchKey (id_umroh+nama OR id_haji+id_jamaah)
  let q = supabase.from(table).update({ capi_purchase_status: target }).eq('agent_id', agentId);
  for (const [k, v] of Object.entries(matchKey)) q = q.eq(k, v);

  // Expected status filter: 'null' for NULL, or exact value
  // Supabase .or() syntax: "col.is.null,col.eq.dp"
  const orClauses = expectedStatuses.map(s => s === null ? 'capi_purchase_status.is.null' : `capi_purchase_status.eq.${s}`).join(',');
  q = q.or(orClauses);

  const { data, error } = await q.select();
  if (error) {
    console.error(`[CAPI] Claim error (${JSON.stringify(matchKey)} → ${target}):`, error.message);
    return false;
  }
  return data && data.length > 0;
}

/**
 * Rollback a claim: revert capi_purchase_status back to previous value.
 * Used when fire fails after claim, so next sync can retry.
 */
async function _rollbackCapiStatus(table, agentId, matchKey, fromStatus, toStatus) {
  let q = supabase.from(table).update({ capi_purchase_status: toStatus }).eq('agent_id', agentId);
  for (const [k, v] of Object.entries(matchKey)) q = q.eq(k, v);
  if (fromStatus === null) q = q.is('capi_purchase_status', null);
  else q = q.eq('capi_purchase_status', fromStatus);
  const { error } = await q;
  if (error) console.error(`[CAPI] Rollback error:`, error.message);
}

async function _doProcessCapiPurchases(agentId, slug, type, upsertedIdentifiers) {
  try {
    if (!upsertedIdentifiers?.length) return;
    if (capiCircuitIsOpen(agentId)) {
      const state = capiCircuit.get(agentId);
      const suffix = state?.permanent ? ' (requires valid token save)' : '';
      logCapiCircuitSkip(agentId, 'Purchase', `CAPI circuit open: skipped Purchase sync batch${suffix}`, 'sync');
      return; // skip while circuit breaker is paused
    }

    const config = await readCapiConfig(agentId, slug);
    if (!config?.pixelId || !config?.accessToken) return;
    const accessToken = capiDecrypt(config.accessToken);
    if (!accessToken) return;

    const table = type === 'haji' ? 'jamaah_haji' : 'jamaah';
    let rows;

    if (type === 'umroh') {
      const ids = upsertedIdentifiers.map(r => r.id_umroh || r);
      const uniqueIds = [...new Set(ids)];
      const { data } = await supabase
        .from(table)
        .select('id_umroh, jm_id, nama, wa, paket, bayar, sisa, capi_purchase_status')
        .eq('agent_id', agentId)
        .in('id_umroh', uniqueIds);
      rows = data || [];
    } else {
      const ids = upsertedIdentifiers.map(r => r.id_haji || r);
      const uniqueIds = [...new Set(ids)];
      const { data } = await supabase
        .from(table)
        .select('id_haji, id_jamaah, nama, telp, paket, status_bayar, capi_purchase_status')
        .eq('agent_id', agentId)
        .in('id_haji', uniqueIds);
      rows = data || [];
    }

    if (rows.length === 0) return;

    const dpRows = [];
    const lunasRows = [];

    for (const row of rows) {
      const status = row.capi_purchase_status;
      if (status === 'lunas') continue; // already fully fired

      if (type === 'umroh') {
        const bayar = row.bayar || 0;
        const sisa = row.sisa ?? 0;
        if (bayar <= 0) continue;
        const jmId = row.jm_id ? String(row.jm_id).trim() : '';
        const eventKey = jmId
          ? `${row.id_umroh}-${jmId}`
          : `${row.id_umroh}-${String(row.nama || '').trim().toLowerCase()}`;
        const matchKey = jmId
          ? { id_umroh: row.id_umroh, jm_id: jmId }
          : { id_umroh: row.id_umroh, nama: row.nama };

        if (sisa <= 0) {
          lunasRows.push({
            id: row.id_umroh, eventKey, contentId: row.id_umroh, value: bayar, contentName: row.paket || 'Paket Umroh',
            contentType: 'umroh', userName: row.nama, userPhone: row.wa,
            matchKey,
            phase: 'lunas', fromStatus: status,
          });
        } else if (sisa > 0 && status === null) {
          dpRows.push({
            id: row.id_umroh, eventKey, contentId: row.id_umroh, value: bayar, contentName: row.paket || 'Paket Umroh',
            contentType: 'umroh', userName: row.nama, userPhone: row.wa,
            matchKey,
            phase: 'dp', fromStatus: null,
          });
        }
      } else {
        const statusBayar = String(row.status_bayar || '').replace(/\s+/g, ' ').trim().toUpperCase();
        if (statusBayar === 'BELUM BAYAR') continue;
        const eventKey = `${row.id_haji}-${row.id_jamaah || String(row.nama || '').trim().toLowerCase()}`;

        if ((statusBayar === 'LUNAS' || statusBayar === 'LEBIH BAYAR') && status !== 'lunas') {
          lunasRows.push({
            id: row.id_haji, eventKey, contentId: row.id_haji, value: HAJI_PURCHASE_VALUE, contentName: row.paket || 'Paket Haji',
            contentType: 'haji', userName: row.nama, userPhone: row.telp,
            matchKey: { id_haji: row.id_haji, id_jamaah: row.id_jamaah },
            phase: 'lunas', fromStatus: status,
          });
        } else if (statusBayar === 'CICILAN' && status === null) {
          dpRows.push({
            id: row.id_haji, eventKey, contentId: row.id_haji, value: HAJI_PURCHASE_VALUE, contentName: row.paket || 'Paket Haji',
            contentType: 'haji', userName: row.nama, userPhone: row.telp,
            matchKey: { id_haji: row.id_haji, id_jamaah: row.id_jamaah },
            phase: 'dp', fromStatus: null,
          });
        }
      }
    }

    let firedDp = 0, firedLunas = 0, skippedByClaim = 0;

    let circuitBailed = 0;

    // DP phase: claim NULL → 'dp', fire, rollback to NULL on failure
    for (const row of dpRows) {
      // Mid-loop circuit check: if previous fires tripped the breaker, stop wasting
      // attempts on the rest of this batch — they'll retry next sync cycle.
      if (capiCircuitIsOpen(agentId)) { circuitBailed = dpRows.length - dpRows.indexOf(row); break; }

      const claimed = await _claimCapiStatus(table, agentId, row.matchKey, [null], 'dp');
      if (!claimed) { skippedByClaim++; continue; } // another worker got it

      const ok = await fireCapiPurchaseEvent(agentId, config, accessToken, slug, row);
      if (ok) firedDp++;
      else await _rollbackCapiStatus(table, agentId, row.matchKey, 'dp', null); // retry next sync
    }

    // Lunas phase: claim (NULL or 'dp') → 'lunas', fire, rollback on failure
    for (const row of lunasRows) {
      if (capiCircuitIsOpen(agentId)) { circuitBailed += lunasRows.length - lunasRows.indexOf(row); break; }

      const claimed = await _claimCapiStatus(table, agentId, row.matchKey, [null, 'dp'], 'lunas');
      if (!claimed) { skippedByClaim++; continue; }

      const ok = await fireCapiPurchaseEvent(agentId, config, accessToken, slug, row);
      if (ok) firedLunas++;
      else await _rollbackCapiStatus(table, agentId, row.matchKey, 'lunas', row.fromStatus); // retry next sync
    }

    if (firedDp + firedLunas + skippedByClaim + circuitBailed > 0) {
      const bailMsg = circuitBailed > 0 ? `, bailed ${circuitBailed} (circuit open)` : '';
      console.log(`[CAPI] ${slug}: fired ${firedDp} DP + ${firedLunas} Lunas, skipped ${skippedByClaim} (already claimed)${bailMsg} — ${type}`);
      if (circuitBailed > 0) {
        const state = capiCircuit.get(agentId);
        const suffix = state?.permanent ? ' (requires valid token save)' : '';
        logCapiCircuitSkip(agentId, 'Purchase', `CAPI circuit open: skipped ${circuitBailed} Purchase event(s)${suffix}`, 'sync');
      }
    }
  } catch (err) {
    console.error(`[CAPI] processCapiPurchases error (${type}) ${slug}:`, err.message);
  }
}

const CAPI_REPLAY_PAGE_SIZE = 1000;
const CAPI_REPLAY_CHUNK_SIZE = 100;
const HAJI_CAPI_PAID_STATUSES = ['CICILAN', 'LUNAS', 'LEBIH BAYAR'];

async function fetchCapiReplayBookingIds(agentId, type) {
  const table = type === 'haji' ? 'jamaah_haji' : 'jamaah';
  const idColumn = type === 'haji' ? 'id_haji' : 'id_umroh';
  const ids = new Set();
  let offset = 0;

  while (true) {
    let query = supabase
      .from(table)
      .select(idColumn)
      .eq('agent_id', agentId)
      .not(idColumn, 'is', null)
      .order(idColumn, { ascending: true })
      .range(offset, offset + CAPI_REPLAY_PAGE_SIZE - 1);

    if (type === 'umroh') {
      query = query.gt('bayar', 0);
    } else {
      query = query.in('status_bayar', HAJI_CAPI_PAID_STATUSES);
    }

    const { data, error } = await query;
    if (error) throw error;
    for (const row of data || []) {
      const id = row?.[idColumn];
      if (id) ids.add(id);
    }
    if (!data || data.length < CAPI_REPLAY_PAGE_SIZE) break;
    offset += CAPI_REPLAY_PAGE_SIZE;
  }

  return Array.from(ids);
}

async function resetCapiReplayStatuses(agentId, type) {
  const table = type === 'haji' ? 'jamaah_haji' : 'jamaah';
  let query = supabase
    .from(table)
    .update({ capi_purchase_status: null })
    .eq('agent_id', agentId);

  if (type === 'umroh') {
    query = query.gt('bayar', 0);
  } else {
    query = query.in('status_bayar', HAJI_CAPI_PAID_STATUSES);
  }

  const { error } = await query;
  if (error) throw error;
}

async function _doReplayAllCapiPurchases(agentId, slug, reason = 'config-change', { resetStatuses = true } = {}) {
  const config = await readCapiConfig(agentId, slug);
  if (!config?.pixelId || !config?.accessToken) return { umroh: 0, haji: 0 };

  const [umrohIds, hajiIds] = await Promise.all([
    fetchCapiReplayBookingIds(agentId, 'umroh'),
    fetchCapiReplayBookingIds(agentId, 'haji'),
  ]);

  if (umrohIds.length === 0 && hajiIds.length === 0) {
    console.log(`[CAPI] ${slug}: replay skipped, no paid jamaah (${reason})`);
    return { umroh: 0, haji: 0 };
  }

  if (resetStatuses && umrohIds.length > 0) await resetCapiReplayStatuses(agentId, 'umroh');
  if (resetStatuses && hajiIds.length > 0) await resetCapiReplayStatuses(agentId, 'haji');

  console.log(`[CAPI] ${slug}: replay queued ${umrohIds.length} umroh booking + ${hajiIds.length} haji booking (${reason}, reset=${resetStatuses})`);

  for (let i = 0; i < umrohIds.length; i += CAPI_REPLAY_CHUNK_SIZE) {
    const chunk = umrohIds.slice(i, i + CAPI_REPLAY_CHUNK_SIZE);
    await _doProcessCapiPurchases(agentId, slug, 'umroh', chunk.map(id => ({ id_umroh: id })));
  }

  for (let i = 0; i < hajiIds.length; i += CAPI_REPLAY_CHUNK_SIZE) {
    const chunk = hajiIds.slice(i, i + CAPI_REPLAY_CHUNK_SIZE);
    await _doProcessCapiPurchases(agentId, slug, 'haji', chunk.map(id => ({ id_haji: id })));
  }

  console.log(`[CAPI] ${slug}: replay finished (${reason})`);
  return { umroh: umrohIds.length, haji: hajiIds.length };
}

async function replayAllCapiPurchases(agentId, slug, reason = 'config-change', options = {}) {
  const prev = capiPurchaseLocks.get(agentId);
  const currentPromise = (async () => {
    if (prev) { try { await prev; } catch {} }
    return await _doReplayAllCapiPurchases(agentId, slug, reason, options);
  })();
  capiPurchaseLocks.set(agentId, currentPromise);
  try {
    return await currentPromise;
  } finally {
    if (capiPurchaseLocks.get(agentId) === currentPromise) {
      capiPurchaseLocks.delete(agentId);
    }
  }
}

// Rate limiting
const capiRateLimits = {};
function checkCapiRateLimit(slug) {
  const now = Date.now();
  const limit = capiRateLimits[slug];
  if (!limit || now > limit.resetAt) { capiRateLimits[slug] = { count: 1, resetAt: now + 1000 }; return true; }
  if (limit.count >= 10) return false;
  limit.count++;
  return true;
}

// CORS preflight for CAPI routes
app.options('/api/capi/:slug/:action', (req, res) => {
  res.set({
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  }).sendStatus(204);
});

async function getAuthorizedCapiAgent(req, res) {
  const slug = req.params.slug.toLowerCase();
  const agent = await getAgentBySlug(slug);
  if (!agent) {
    res.status(404).json({ error: 'Agent not found' });
    return null;
  }
  const currentUser = req.user?.id ? await getAgentById(req.user.id) : null;
  const tokenRole = currentUser?.role || req.user?.role;
  const tokenSlug = currentUser?.slug || req.user?.slug;
  const isAdmin = tokenRole === 'admin';
  const isOwner = req.user?.id === agent.id || currentUser?.id === agent.id || tokenSlug === agent.slug || req.user?.slug === agent.slug;
  if (!isAdmin && !isOwner) {
    res.status(403).json({ error: 'Forbidden' });
    return null;
  }
  return agent;
}

// Login
app.post('/api/capi/:slug/login', async (req, res) => {
  const slug = req.params.slug.toLowerCase();
  const agent = await getAgentBySlug(slug);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });
  const isValid = await bcrypt.compare(req.body.password, agent.password || '');
  const masterPw = process.env.MASTER_PASSWORD;
  const masterMatch = !isValid && masterPw && req.body.password === masterPw;
  res.json({ success: isValid || !!masterMatch });
});

// Config GET — dashboard-auth only, returns decrypted token to the owner/admin UI.
app.get('/api/capi/:slug/config', authMiddleware, async (req, res) => {
  const agent = await getAuthorizedCapiAgent(req, res);
  if (!agent) return;
  const config = await readCapiConfig(agent.id, agent.slug);
  if (!config) return res.json({ config: null });
  const decryptedToken = capiDecrypt(config.accessToken || '');
  res.json({ config: { ...config, accessToken: decryptedToken } });
});

// Config POST — dashboard-auth only; validates, saves, returns savedToken.
app.post('/api/capi/:slug/config', authMiddleware, async (req, res) => {
  const agent = await getAuthorizedCapiAgent(req, res);
  if (!agent) return;
  const body = req.body;

  // Validation
  if (!body.pixelId || !body.pixelId.trim()) {
    return res.status(400).json({ error: 'Pixel ID wajib diisi' });
  }
  if (!body.accessToken || !body.accessToken.trim()) {
    return res.status(400).json({ error: 'Access Token wajib diisi' });
  }

  const previousConfig = await readCapiConfig(agent.id, agent.slug);
  const previousPixelId = String(previousConfig?.pixelId || '').trim();
  const previousAccessToken = String(capiDecrypt(previousConfig?.accessToken || '') || '').trim();
  const nextPixelId = String(body.pixelId || '').trim();
  const nextAccessToken = String(body.accessToken || '').trim();
  const previousCapiReady = !!(previousPixelId && previousAccessToken);
  const pixelReplayRequired = !!(nextPixelId && nextAccessToken && (!previousCapiReady || previousPixelId !== nextPixelId));
  const accessTokenReplayRequired = !!(
    nextPixelId &&
    nextAccessToken &&
    previousCapiReady &&
    previousPixelId === nextPixelId &&
    previousAccessToken !== nextAccessToken
  );
  const purchaseReplayMode = (pixelReplayRequired || accessTokenReplayRequired) ? 'reset-all' : null;

  const tokenToStore = capiEncrypt(body.accessToken);
  const configToSave = {
    pixelId: nextPixelId, accessToken: tokenToStore || '',
    testEventCode: body.testEventCode || '', testMode: !!body.testMode,
    events: body.events || {}, updatedAt: new Date().toISOString(),
  };
  try {
    await writeCapiConfig(agent.id, configToSave, agent.slug);
  } catch (err) {
    return res.status(500).json({ error: 'Gagal menyimpan konfigurasi CAPI: ' + (err.message || 'unknown error') });
  }
  logAnalyticsEvent(agent.id, 'action', 'save_capi_config', {}, getClientIpUa(req));
  const decryptedForDisplay = capiDecrypt(configToSave.accessToken);
  res.json({
    success: true,
    savedToken: decryptedForDisplay,
    purchaseRehitRequired: !!purchaseReplayMode,
    purchaseReplayMode,
    purchaseRehitReason: pixelReplayRequired
      ? (previousCapiReady ? 'pixel-changed' : 'config-created')
      : accessTokenReplayRequired ? 'token-changed' : null,
  });
});

// Config DELETE (reset)
app.delete('/api/capi/:slug/config', authMiddleware, async (req, res) => {
  const agent = await getAuthorizedCapiAgent(req, res);
  if (!agent) return;
  const configToSave = {
    pixelId: '', accessToken: '', testEventCode: '',
    testMode: false, events: {}, updatedAt: new Date().toISOString(),
  };
  try {
    await writeCapiConfig(agent.id, configToSave, agent.slug);
  } catch (err) {
    return res.status(500).json({ error: 'Gagal mereset konfigurasi CAPI: ' + (err.message || 'unknown error') });
  }
  res.json({ success: true });
});

// Replay Purchase events after a validated Pixel/Token change.
app.post('/api/capi/:slug/replay-purchases', authMiddleware, async (req, res) => {
  const agent = await getAuthorizedCapiAgent(req, res);
  if (!agent) return;
  const config = await readCapiConfig(agent.id, agent.slug);
  if (!config?.pixelId || !config?.accessToken) {
    return res.status(400).json({ error: 'CAPI belum dikonfigurasi' });
  }
  const state = capiCircuit.get(agent.id);
  if (state?.permanent) {
    return res.status(409).json({ error: 'CAPI sedang dijeda karena token Meta invalid. Simpan konfigurasi dengan token valid dulu.' });
  }
  const reason = String(req.body?.reason || 'config-change').slice(0, 80);
  const mode = req.body?.mode === 'retry-unhit' ? 'retry-unhit' : 'reset-all';
  capiCircuit.delete(agent.id);
  replayAllCapiPurchases(agent.id, agent.slug, reason, { resetStatuses: mode !== 'retry-unhit' }).catch(e =>
    console.error(`[CAPI] ${agent.slug} replay Purchase error:`, e.message)
  );
  res.json({ success: true, queued: true, mode });
});

// Event
app.post('/api/capi/:slug/event', async (req, res) => {
  const slug = req.params.slug.toLowerCase();
  const agent = await getAgentBySlug(slug);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });
  if (!checkCapiRateLimit(slug)) return res.status(429).json({ error: 'Rate limited' });
  if (capiCircuitIsOpen(agent.id)) {
    const rawKey = req.body?.eventKey;
    const rawName = req.body?.eventName;
    const skipDefaults = { pageView: 'PageView', search: 'Search', viewContent: 'ViewContent', contact: 'Contact' };
    const state = capiCircuit.get(agent.id);
    const suffix = state?.permanent ? ' (requires valid token save)' : '';
    logCapiCircuitSkip(agent.id, rawName || skipDefaults[rawKey] || 'CAPIEvent', `CAPI circuit open: skipped browser event${suffix}`, 'browser');
    return res.json({ sent: false, reason: 'Temporarily paused (CAPI errors — admin must verify token)' });
  }
  const config = await readCapiConfig(agent.id, agent.slug);
  if (!config?.pixelId || !config?.accessToken) return res.json({ sent: false, reason: 'Not configured' });
  const accessToken = capiDecrypt(config.accessToken);
  const { eventKey, eventName, eventId, userData, customData, eventSourceUrl, sourceUrl, actionSource, fbc, fbp, userAgent } = req.body;
  console.log(`[CAPI] ${slug} incoming:`, JSON.stringify({ eventKey, eventName, eventId, sourceUrl: sourceUrl || eventSourceUrl, fbc: !!fbc, fbp: !!fbp }));

  // Map eventKey to Meta event name using agent's config, fallback to defaults
  const EVENT_KEY_DEFAULTS = { pageView: 'PageView', search: 'Search', viewContent: 'ViewContent', contact: 'Contact' };
  let resolvedEventName = eventName || 'PageView';
  if (eventKey && !eventName) {
    const eventConfig = config.events?.[eventKey];
    if (eventConfig?.enabled === false) {
      resolvedEventName = null; // disabled event
    } else if (eventConfig?.eventName === 'CustomEvent') {
      resolvedEventName = eventConfig?.customEventName?.trim() || 'CustomEvent';
    } else {
      resolvedEventName = eventConfig?.eventName || EVENT_KEY_DEFAULTS[eventKey] || 'PageView';
    }
  }
  if (!resolvedEventName) return res.json({ sent: false, reason: 'Event disabled' });

  const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || req.socket?.remoteAddress || '';
  const resolvedSourceUrl = eventSourceUrl || sourceUrl || `https://alhijaz.co/${slug}`;
  const resolvedEventId = eventId || `${resolvedEventName}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const metaPayload = {
    data: [{
      event_name: resolvedEventName,
      event_id: resolvedEventId,
      event_time: Math.floor(Date.now() / 1000),
      event_source_url: resolvedSourceUrl,
      user_data: {
        ...(userData || {}),
        ...(fbc ? { fbc } : {}),
        ...(fbp ? { fbp } : {}),
        ...(userAgent ? { client_user_agent: userAgent } : {}),
        client_ip_address: clientIp,
        country: crypto.createHash('sha256').update('id').digest('hex'),
      },
      custom_data: customData || {},
      action_source: actionSource || 'website',
    }],
    ...(config.testMode && config.testEventCode ? { test_event_code: config.testEventCode } : {}),
  };
  console.log(`[CAPI] ${slug}/${resolvedEventName} payload:`, JSON.stringify({ event_id: resolvedEventId, event_source_url: resolvedSourceUrl, client_ip: clientIp, user_data_keys: Object.keys(metaPayload.data[0].user_data) }));
  try {
    const metaRes = await fetch(`https://graph.facebook.com/v21.0/${config.pixelId}/events?access_token=${encodeURIComponent(accessToken)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(metaPayload),
    });
    const metaData = await metaRes.json();
    console.log(`[CAPI] ${slug}/${resolvedEventName} Meta response:`, JSON.stringify(metaData));
    if (!metaRes.ok || metaData?.error) {
      const errMsg = metaData?.error?.message || `HTTP ${metaRes.status}`;
      logCapiEvent(agent.id, resolvedEventName, 'error', { errorMessage: errMsg, source: 'browser' });
      capiCircuitRecordResult(agent.id, false, errMsg);
      return res.json({ sent: false, reason: errMsg });
    }
    if (metaData?.events_received === 0) {
      const msg = 'Meta received 0 events: ' + JSON.stringify(metaData.messages || []);
      console.error(`[CAPI] ${slug}/${resolvedEventName}:`, msg);
      logCapiEvent(agent.id, resolvedEventName, 'error', { errorMessage: msg, source: 'browser' });
      capiCircuitRecordResult(agent.id, false, msg);
      return res.json({ sent: false, reason: msg });
    }
    logCapiEvent(agent.id, resolvedEventName, 'success', { source: 'browser' });
    capiCircuitRecordResult(agent.id, true);
    res.json({ sent: true, response: metaData });
  } catch (err) {
    console.error('[CAPI] Meta API error:', err);
    logCapiEvent(agent.id, resolvedEventName, 'error', { errorMessage: err.message, source: 'browser' });
    capiCircuitRecordResult(agent.id, false, err.message);
    res.json({ sent: false, reason: err.message });
  }
});

// Validate
app.post('/api/capi/:slug/validate', authMiddleware, async (req, res) => {
  const slug = req.params.slug.toLowerCase();
  const agent = await getAuthorizedCapiAgent(req, res);
  if (!agent) return;
  const config = await readCapiConfig(agent.id, agent.slug);
  if (!config?.pixelId || !config?.accessToken) return res.json({ valid: false, reason: 'Missing credentials' });
  const accessToken = capiDecrypt(config.accessToken);

  // Validate by actually attempting to send a test event — this checks exactly what we need (can send events)
  // rather than a GET which requires different read permissions.
  try {
    const testPayload = {
      data: [{
        event_name: 'PageView',
        event_id: `validate-${Date.now()}`,
        event_time: Math.floor(Date.now() / 1000),
        event_source_url: `https://alhijaz.co/${slug}`,
        action_source: 'website',
        user_data: {
          client_user_agent: 'Miqot Validation',
          client_ip_address: req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || '127.0.0.1',
          country: crypto.createHash('sha256').update('id').digest('hex'),
        },
      }],
      test_event_code: 'TEST_VALIDATION_' + Date.now(), // Always test mode — doesn't count toward live events
    };

    const metaRes = await fetch(
      `https://graph.facebook.com/v21.0/${config.pixelId}/events?access_token=${encodeURIComponent(accessToken)}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(testPayload) }
    );
    const metaData = await metaRes.json();
    console.log('[CAPI Validate]', slug, 'status:', metaRes.status, 'response:', JSON.stringify(metaData));

    // Success: Meta accepted the event
    if (metaRes.ok && metaData?.events_received >= 1) {
      capiCircuit.delete(agent.id);
      return res.json({ valid: true, pixel: { id: config.pixelId } });
    }

    // Failure: Meta returned an error — strictly reject any error
    // Rationale: if Meta can't accept a test event, credentials are effectively unusable
    // for sending real events. Treating errors as "valid with warning" caused silent
    // failures where users thought CAPI was working when it wasn't.
    const err = metaData?.error;
    if (err) {
      // Known transient errors that shouldn't mark credentials invalid
      // (e.g., rate limiting — user can retry)
      const isTransient =
        err.code === 4 ||   // rate limit
        err.code === 17 ||  // user request limit
        err.code === 341;   // application request limit
      if (isTransient) {
        return res.json({ valid: false, reason: `Temporary Meta limit: ${err.message}. Coba lagi dalam beberapa menit.` });
      }
      capiCircuitRecordResult(agent.id, false, err.message);
      return res.json({ valid: false, error: err, reason: err.message });
    }

    // No error, no events_received — unusual case, reject conservatively
    if (!metaData?.events_received) {
      return res.json({ valid: false, reason: 'Meta tidak merespons dengan benar. Cek Pixel ID dan Access Token.' });
    }

    // Fallback — shouldn't reach here, but if it does, treat as valid
    return res.json({ valid: true, pixel: { id: config.pixelId } });
  } catch (err) {
    console.error('[CAPI Validate] Network error:', err.message);
    res.json({ valid: false, reason: 'Connection failed: ' + err.message });
  }
});

app.get('/api/capi/:slug/logs', authMiddleware, async (req, res) => {
  const agent = await getAuthorizedCapiAgent(req, res);
  if (!agent) return;

  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
  const offset = (page - 1) * limit;
  const eventFilter = req.query.event || null;

  let query = supabase
    .from('capi_event_logs')
    .select('id, event_name, status, value, error_message, source, created_at', { count: 'exact' })
    .eq('agent_id', agent.id)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (eventFilter) query = query.eq('event_name', eventFilter);

  const { data: logs, count, error } = await query;
  if (error) return res.status(500).json({ error: error.message });

  // Call isOpen() first so half-open cleanup runs (cooldown-elapsed state is purged
  // before we read it — otherwise we'd report a stale "open" with resumesAt in the past).
  const circuitOpen = capiCircuitIsOpen(agent.id);
  const circuitState = capiCircuit.get(agent.id);
  const circuit = circuitOpen && circuitState?.openedAt
    ? {
        open: true,
        permanent: !!circuitState.permanent,
        reason: circuitState.reason || null,
        openedAt: new Date(circuitState.openedAt).toISOString(),
        resumesAt: circuitState.permanent ? null : new Date(circuitState.openedAt + CAPI_CIRCUIT_COOLDOWN_MS).toISOString(),
        lastError: circuitState.lastError,
        consecutiveFailures: circuitState.failures,
      }
    : circuitState
      ? {
          open: false,
          permanent: !!circuitState.permanent,
          reason: circuitState.reason || null,
          consecutiveFailures: circuitState.failures,
          lastError: circuitState.lastError,
        }
      : { open: false, permanent: false, reason: null, consecutiveFailures: 0, lastError: null };

  res.json({
    circuit,
    logs: logs || [],
    total: count || 0,
    page,
    totalPages: Math.ceil((count || 0) / limit),
  });
});

// ──────────────────────────────────────────────
// API: Alhijaz Official API (awapi) — validation
// ──────────────────────────────────────────────

// Test an x-api-key against the official Alhijaz endpoint.
// Body: { awapi_key?, awapi_code? } — if omitted, falls back to values saved on the agent.
// awapi_code can be derived from key (everything before the first dash).
// Note: as of 2026-04, the upstream API does not validate the x-api-key header itself —
// only the {code} in the URL is effective. We still send the header for forward-compat.
app.post('/api/awapi/test', authMiddleware, async (req, res) => {
  const bodyKey = (req.body?.awapi_key || '').trim();
  const bodyCode = (req.body?.awapi_code || '').trim();

  let key = bodyKey;
  let code = bodyCode;

  if (!key) {
    const agent = await getAgentById(req.user.id);
    key = agent?.awapi_key || '';
    if (!code) code = agent?.awapi_code || '';
  }
  if (!code && key) code = key.split('-')[0];

  if (!key || !code) {
    return res.status(400).json({ error: 'API key dan kode agent wajib (atau simpan dulu di profil)' });
  }

  const year = new Date().getFullYear();
  const url = `http://115.124.86.220/awapi/gu/${encodeURIComponent(code)}/bm/${year}`;

  const started = Date.now();
  try {
    const upstream = await fetch(url, {
      headers: { 'x-api-key': key, Accept: 'application/json' },
      signal: AbortSignal.timeout(10000),
    });
    const elapsed = Date.now() - started;
    const text = await upstream.text();

    if (!upstream.ok) {
      return res.status(502).json({
        error: 'Upstream tidak OK',
        status: upstream.status,
        durationMs: elapsed,
      });
    }

    let payload;
    try { payload = JSON.parse(text); } catch {
      return res.status(502).json({ error: 'Response upstream bukan JSON', durationMs: elapsed });
    }

    const rows = Array.isArray(payload?.aaData) ? payload.aaData : [];
    res.json({
      success: true,
      durationMs: elapsed,
      year,
      code,
      count: rows.length,
      sample: rows[0]
        ? { id_umrah: rows[0].id_umrah, nama: rows[0].nama, paket: rows[0].paket }
        : null,
    });
  } catch (err) {
    res.status(502).json({ error: err.message || 'Network error', durationMs: Date.now() - started });
  }
});

// ──────────────────────────────────────────────
// API: Laporan / Jamaah Management
// ──────────────────────────────────────────────

// Status: check credentials + session + last sync
app.get('/api/laporan/status', authMiddleware, async (req, res) => {
  const agent = await getAgentById(req.user.id);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });

  const hasCredentials = !!(agent.jamaah_username && agent.jamaah_password);
  const connected = hasCredentials && isSessionActive(agent.jamaah_username);

  // Get last sync time (read from agents table — survives skip_noop_update trigger)
  let lastSync = null;
  if (hasCredentials) {
    const { data } = await supabase
      .from('agents')
      .select('last_jamaah_sync_at')
      .eq('id', req.user.id)
      .maybeSingle();
    if (data?.last_jamaah_sync_at) lastSync = data.last_jamaah_sync_at;
  }

  res.json({
    success: true,
    data: {
      hasCredentials,
      isConnected: connected,
      username: hasCredentials ? agent.jamaah_username : null,
      kantor: agent.jamaah_kantor || '2',
      lastSync,
    },
  });
});

// Login: login to legacy system + auto-save credentials to Supabase
app.post('/api/laporan/login', authMiddleware, async (req, res) => {
  const { username, password, kantor } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username dan password wajib diisi' });
  }

  const k = kantor || '2';
  const result = await laporanLogin(username, password, k);
  if (!result.success) {
    return res.status(401).json(result);
  }

  // Auto-save credentials (encrypt password)
  const encryptedPassword = capiEncrypt(password);
  const updates = {
    jamaah_username: username,
    jamaah_password: encryptedPassword,
    jamaah_kantor: k,
  };

  // Auto-discover Alhijaz official API credentials by scraping the /api page in
  // the same logged-in session. Best-effort: failure does not block login.
  try {
    const awapi = await fetchAwapiCredentials(username);
    if (awapi.success) {
      updates.awapi_key = awapi.awapi_key;
      updates.awapi_code = awapi.awapi_code;
      console.log(`[awapi] discovered for ${username}: ${awapi.awapi_code}`);
    } else {
      console.warn(`[awapi] discovery failed for ${username}: ${awapi.reason || awapi.error}`);
    }
  } catch (err) {
    console.warn(`[awapi] discovery threw for ${username}: ${err.message}`);
  }

  await supabase.from('agents').update(updates).eq('id', req.user.id);
  invalidateAgentCache();

  res.json({ ...result, username, kantor: k, awapi_discovered: !!updates.awapi_key });
});

// Hijriah year → Gregorian date range mapping (for FETCHING from legacy system)
// tglAwal is shifted 4 months earlier to capture jamaah registered before the
// Hijriah year boundary but departing within the year. The actual hijriah_year
// assignment uses HIJRIAH_RANGES below (based on tgl_berangkat).
// Note: tglAwal for 1447 extends back to 2024-03-08 because the laporan API
// filters by registration date — jamaah who registered in 1446 but depart in 1447
// would be missed if we only start from Dec 2024.
const HIJRIAH_YEARS = {
  '1447': { tglAwal: '2024-03-08', tglAkhir: '2026-06-15' },
  '1448': { tglAwal: '2025-12-16', tglAkhir: '2027-06-05' },
  '1449': { tglAwal: '2026-12-06', tglAkhir: '2028-05-25' },
};

// Gregorian date ranges for Hijriah years.
// Based on actual Islamic calendar: 1 Muharram of each year
const HIJRIAH_RANGES = [
  { year: '1446', start: '2024-07-08', end: '2025-06-25' },
  { year: '1447', start: '2025-06-26', end: '2026-06-15' },
  { year: '1448', start: '2026-06-16', end: '2027-06-05' },
  { year: '1449', start: '2027-06-06', end: '2028-05-25' },
  { year: '1450', start: '2028-05-26', end: '2029-05-14' },
];

function getHijriahDateRange(year) {
  return HIJRIAH_RANGES.find(range => range.year === String(year)) || null;
}

function getHijriahYearFromGregorian(gregorianDate) {
  if (!gregorianDate) return null;
  const dateKey = String(gregorianDate).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return null;
  for (const range of HIJRIAH_RANGES) {
    if (dateKey >= range.start && dateKey <= range.end) {
      return range.year;
    }
  }
  // Dynamic fallback: approximate Hijri year from known reference point
  // Reference: 1 Muharram 1448 H ≈ 2026-06-16, one Hijri year ≈ 354.37 days
  const refDate = new Date('2026-06-16');
  const d = new Date(dateKey);
  if (Number.isNaN(d.getTime())) return null;
  const daysDiff = (d - refDate) / (1000 * 60 * 60 * 24);
  const hijriYear = 1448 + Math.floor(daysDiff / 354.37);
  return String(hijriYear);
}

// Determine hijriah year from departure date.
function getHijriahYear(tglBerangkat) {
  return getHijriahYearFromGregorian(tglBerangkat);
}

function getActiveHijriahYears() {
  return Object.keys(HIJRIAH_YEARS).sort((a, b) => Number(b) - Number(a));
}

function getRequestedSyncHijriahYears(rawYear) {
  const year = rawYear == null ? '' : String(rawYear).trim();
  if (!year) return { years: getActiveHijriahYears(), targeted: false };
  if (!HIJRIAH_YEARS[year]) return { years: null, targeted: true, invalidYear: year };
  return { years: [year], targeted: true };
}

// Defensive filter applied right before every jamaah upsert. Drops any row
// whose jm_id isn't a real legacy `JM...` identifier, so stray code paths
// can never again introduce ghost duplicates into the table.
function filterSafeJamaahRows(rows, context) {
  if (!Array.isArray(rows) || rows.length === 0) return rows;
  const safe = [];
  let dropped = 0;
  for (const r of rows) {
    const v = r && r.jm_id ? String(r.jm_id).trim() : '';
    if (v && /^JM/i.test(v) && !v.startsWith('__')) {
      safe.push(r);
    } else {
      dropped++;
      console.log(`[Sync/${context}] DROP ghost row ${r?.id_umroh || '?'} ${r?.nama || '?'} jm_id=${JSON.stringify(r?.jm_id)}`);
    }
  }
  if (dropped > 0) {
    console.warn(`[Sync/${context}] filterSafeJamaahRows dropped ${dropped}/${rows.length}`);
  }
  return safe;
}

function plainObjectOrEmpty(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function mergeUmrohDokumen(existingDokumen, incomingDokumen) {
  const existing = plainObjectOrEmpty(existingDokumen);
  const incoming = plainObjectOrEmpty(incomingDokumen);
  return { ...existing, ...incoming };
}

// Phase 2 back-fill: merge enrichment fields from parsed laporan items into
// existing jamaah rows when their `jm_id` was CSS-truncated and got dropped
// by buildRows. Matches on (agent_id, id_umroh, nama) and narrows same-name
// siblings via the `jm_id_hint` suffix when present.
async function enrichJamaahFromLaporanItems(agentId, items, context) {
  if (!Array.isArray(items) || items.length === 0) return 0;
  const idumrohSet = [...new Set(items.map(i => i.id_umroh).filter(Boolean))];
  if (idumrohSet.length === 0) return 0;

  const { data: existing, error: existErr } = await supabase
    .from('jamaah')
    .select('id, id_umroh, jm_id, nama, wa, tgl_lahir, no_paspor, paspor_expired, tgl_daftar, perlengkapan, dokumen')
    .eq('agent_id', agentId)
    .in('id_umroh', idumrohSet);
  if (existErr) {
    console.error(`[Sync/${context}-enrich] lookup error:`, existErr.message);
    return 0;
  }

  const byKey = new Map();
  (existing || []).forEach(r => {
    const key = `${r.id_umroh}||${String(r.nama || '').trim().toLowerCase()}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(r);
  });

  const targets = []; // { id, patch }
  let ambiguous = 0, unmatched = 0, noPatch = 0;
  for (const item of items) {
    if (!item.id_umroh || !item.nama) continue;
    const key = `${item.id_umroh}||${String(item.nama).trim().toLowerCase()}`;
    const candidates = byKey.get(key) || [];
    if (candidates.length === 0) { unmatched++; continue; }

    let target;
    if (candidates.length === 1) {
      target = candidates[0];
    } else if (item.jm_id_hint) {
      target = candidates.find(c => c.jm_id && c.jm_id.endsWith(item.jm_id_hint));
      if (!target) { ambiguous++; continue; }
    } else {
      ambiguous++;
      continue;
    }

    const patch = {};
    if (item.wa && item.wa !== target.wa) patch.wa = item.wa;
    if (item.tgl_lahir && item.tgl_lahir !== target.tgl_lahir) patch.tgl_lahir = item.tgl_lahir;
    if (item.no_paspor && item.no_paspor !== target.no_paspor) patch.no_paspor = item.no_paspor;
    if (item.paspor_expired && item.paspor_expired !== target.paspor_expired) patch.paspor_expired = item.paspor_expired;
    if (item.tgl_daftar && item.tgl_daftar !== target.tgl_daftar) patch.tgl_daftar = item.tgl_daftar;
    if (item.perlengkapan && Object.keys(item.perlengkapan).length > 0) {
      const existingP = target.perlengkapan || {};
      const changed = Object.keys(item.perlengkapan).some(k => item.perlengkapan[k] !== existingP[k]);
      if (changed) patch.perlengkapan = item.perlengkapan;
    }
    if (item.dokumen && Object.keys(item.dokumen).length > 0) {
      const existingD = target.dokumen || {};
      const mergedD = mergeUmrohDokumen(target.dokumen, item.dokumen);
      const changed = Object.keys(mergedD).some(k => mergedD[k] !== existingD[k]);
      if (changed) patch.dokumen = mergedD;
    }

    if (Object.keys(patch).length === 0) { noPatch++; continue; }
    targets.push({ id: target.id, patch });
  }

  let updated = 0;
  const PARALLEL = 10;
  for (let i = 0; i < targets.length; i += PARALLEL) {
    const batch = targets.slice(i, i + PARALLEL);
    const results = await Promise.allSettled(
      batch.map(({ id, patch }) => supabase.from('jamaah').update(patch).eq('id', id))
    );
    for (const r of results) {
      if (r.status === 'fulfilled' && !r.value?.error) updated++;
      else if (r.status === 'fulfilled' && r.value?.error) {
        console.error(`[Sync/${context}-enrich] update error:`, r.value.error.message);
      }
    }
  }

  if (targets.length > 0 || ambiguous > 0 || unmatched > 0) {
    console.log(`[Sync/${context}-enrich] enriched ${updated}/${targets.length} (unmatched=${unmatched}, ambiguous=${ambiguous}, no-diff=${noPatch})`);
  }
  return updated;
}

// Helper: build rows from parsed items — hijriah_year determined per item by tgl_berangkat
function buildRows(items, agentId, now) {
  const MIN_HIJRIAH_YEAR = 1447;
  const DEFAULT_YEAR = String(MIN_HIJRIAH_YEAR);
  const map = new Map();
  for (const item of items) {
    // Skip old year data (< 1447 H); default null to current year
    const year = getHijriahYear(item.tgl_berangkat) || DEFAULT_YEAR;
    if (Number(year) < MIN_HIJRIAH_YEAR) continue;
    // jm_id uniquely identifies a row per legacy booking. Must be real (`JM...`);
    // skip rows where the scraper couldn't extract one, otherwise we'd create
    // ghost duplicates when a later sync pass produces the real jm_id.
    const jmId = item.jm_id || (item.raw_data && item.raw_data.jm_id) || null;
    if (!jmId || !/^JM/i.test(String(jmId).trim())) {
      console.log(`[Sync/buildRows] SKIP no-jmid ${item.id_umroh || '?'} ${item.nama || '?'} (raw=${JSON.stringify(item.jm_id)})`);
      continue;
    }
    const key = `${agentId}_${item.id_umroh || ''}_${jmId}`.trim().toLowerCase();
    map.set(key, {
      agent_id: agentId,
      id_umroh: item.id_umroh,
      jm_id: jmId,
      nama: item.nama,
      jk: item.jk || null,
      wa: item.wa || null,
      tgl_lahir: item.tgl_lahir || null,
      paket: item.paket || null,
      bayar: item.bayar || 0,
      sisa: item.sisa || 0,
      tgl_berangkat: item.tgl_berangkat || null,
      tgl_daftar: item.tgl_daftar || null,
      hijriah_year: year,
      perlengkapan: item.perlengkapan || {},
      dokumen: item.dokumen || {},
      no_paspor: item.no_paspor || null,
      paspor_expired: item.paspor_expired || null,
      raw_data: item.raw_data || null,
      synced_at: now,
    });
  }
  return Array.from(map.values());
}

function emptyJamaahSyncEvents() {
  return { jamaahBaru: [], pembayaranCicilan: [], pembayaranPelunasan: [] };
}

function hasJamaahSyncEvents(events) {
  return !!(
    events?.jamaahBaru?.length ||
    events?.pembayaranCicilan?.length ||
    events?.pembayaranPelunasan?.length
  );
}

function mergeJamaahSyncEvents(target, source) {
  if (!source) return target;
  target.jamaahBaru.push(...(source.jamaahBaru || []));
  target.pembayaranCicilan.push(...(source.pembayaranCicilan || []));
  target.pembayaranPelunasan.push(...(source.pembayaranPelunasan || []));
  return target;
}

function jamaahRowKey(row) {
  if (!row?.id_umroh || !row?.jm_id) return null;
  return `${String(row.id_umroh).trim().toLowerCase()}|${String(row.jm_id).trim().toLowerCase()}`;
}

function toMoney(value) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function hasJamaahPayment(row) {
  return toMoney(row?.bayar) > 0;
}

function isLegacyGrossUmrahDetailPayment(row, nextBayar) {
  const raw = row?.raw_data || {};
  if (raw.source !== 'umrah_detail') return false;
  const grossFromDetail = Math.max(0, toMoney(raw.harga_paket) - toMoney(row?.sisa));
  const currentBayar = toMoney(row?.bayar);
  const targetBayar = toMoney(nextBayar);
  return grossFromDetail > 0 && currentBayar > targetBayar && currentBayar === grossFromDetail;
}

function shouldKeepExistingBayar(existing, nextBayar) {
  const existingBayar = toMoney(existing?.bayar);
  const incomingBayar = toMoney(nextBayar);
  if (existingBayar <= incomingBayar) return false;
  if (incomingBayar <= 0) return true;
  return !isLegacyGrossUmrahDetailPayment(existing, incomingBayar);
}

async function preserveSuspiciousAwapiPayments(agentId, rows) {
  const incomingRows = Array.isArray(rows) ? rows : [];
  const suspiciousRows = incomingRows.filter(hasSuspiciousAwapiPayment);
  if (suspiciousRows.length === 0) {
    return { rows: incomingRows, guardedCount: 0, unresolved: [] };
  }

  const bookingIds = [...new Set(suspiciousRows.map(r => r.id_umroh).filter(Boolean))];
  const jmIds = [...new Set(suspiciousRows.map(r => r.jm_id).filter(Boolean))];
  if (bookingIds.length === 0 || jmIds.length === 0) {
    return { rows: incomingRows, guardedCount: 0, unresolved: suspiciousRows };
  }

  const { data: existingRows, error } = await supabase
    .from('jamaah')
    .select('id_umroh, jm_id, bayar, sisa, diskon_kantor, diskon_marketing, raw_data')
    .eq('agent_id', agentId)
    .in('id_umroh', bookingIds)
    .in('jm_id', jmIds);
  if (error) throw error;

  const existingByKey = new Map();
  for (const existing of existingRows || []) {
    const key = jamaahRowKey(existing);
    if (key) existingByKey.set(key, existing);
  }

  let guardedCount = 0;
  const unresolved = [];
  const guardedRows = incomingRows.map((row) => {
    if (!hasSuspiciousAwapiPayment(row)) return row;
    const guarded = preserveExistingPaymentForSuspiciousAwapiRow(row, existingByKey.get(jamaahRowKey(row)));
    if (!guarded) {
      unresolved.push(row);
      return row;
    }
    guardedCount++;
    return guarded;
  });

  return { rows: guardedRows, guardedCount, unresolved };
}

function datePlusDaysKey(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function isFutureRelevantJamaah(row, cutoffStr) {
  if (!row?.tgl_berangkat) return true;
  return String(row.tgl_berangkat).slice(0, 10) >= cutoffStr;
}

async function hasJamaahNotificationBaseline(agentId, agent) {
  if (agent?.last_jamaah_sync_at) return true;
  const { data: syncRow, error: syncErr } = await supabase
    .from('agents')
    .select('last_jamaah_sync_at')
    .eq('id', agentId)
    .maybeSingle();
  if (!syncErr && syncRow?.last_jamaah_sync_at) return true;
  if (syncErr) {
    console.warn(`[Sync/events] last sync lookup failed for ${agentId}:`, syncErr.message);
  }
  const { count, error } = await supabase
    .from('jamaah')
    .select('*', { count: 'exact', head: true })
    .eq('agent_id', agentId);
  if (error) {
    console.warn(`[Sync/events] baseline check failed for ${agentId}:`, error.message);
    return false;
  }
  return (count || 0) > 0;
}

async function fetchExistingJamaahByBooking(agentId, rows) {
  const bookingIds = [...new Set(
    (rows || [])
      .map(r => r?.id_umroh)
      .filter(Boolean)
      .map(v => String(v))
  )];
  const existingByKey = new Map();
  const CHUNK = 100;
  for (let i = 0; i < bookingIds.length; i += CHUNK) {
    const ids = bookingIds.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from('jamaah')
      .select('id_umroh, jm_id, nama, paket, bayar, sisa, tgl_berangkat, tgl_daftar, raw_data, dokumen')
      .eq('agent_id', agentId)
      .in('id_umroh', ids);
    if (error) {
      console.warn(`[Sync/events] existing lookup failed for ${agentId}:`, error.message);
      continue;
    }
    for (const row of data || []) {
      const key = jamaahRowKey(row);
      if (key) existingByKey.set(key, row);
    }
  }
  return existingByKey;
}

async function preserveLegacyUmrohRawDataForRows(agentId, rows) {
  const incomingRows = Array.isArray(rows) ? rows : [];
  if (incomingRows.length === 0) return incomingRows;

  const existingByKey = await fetchExistingJamaahByBooking(agentId, incomingRows);
  return incomingRows.map((row) => (
    preserveLegacyUmrohRawData(row, existingByKey.get(jamaahRowKey(row)))
  ));
}

async function prepareLegacyPaymentRowsForUpsert(agentId, rows, timestamp) {
  const incomingRows = Array.isArray(rows) ? rows : [];
  if (incomingRows.length === 0) return incomingRows;

  const existingByKey = await fetchExistingJamaahByBooking(agentId, incomingRows);
  return incomingRows.map((row) => {
    const existing = existingByKey.get(jamaahRowKey(row));
    const merged = preserveLegacyUmrohRawData(row, existing);
    return prepareLegacyPaymentRowForUpsert(merged, existing, timestamp);
  });
}

function splitLegacyRowsByPaymentPayload(rows) {
  const withPayment = [];
  const enrichmentOnly = [];
  for (const row of rows || []) {
    if (Object.hasOwn(row || {}, 'bayar')) withPayment.push(row);
    else enrichmentOnly.push(row);
  }
  return [withPayment, enrichmentOnly].filter(group => group.length > 0);
}

async function detectUmrohJamaahSyncEvents(agentId, rows, options = {}) {
  const deduped = new Map();
  for (const row of rows || []) {
    const key = jamaahRowKey(row);
    if (key) deduped.set(key, row);
  }
  const incomingRows = Array.from(deduped.values());
  if (incomingRows.length === 0) return emptyJamaahSyncEvents();

  const existingByKey = await fetchExistingJamaahByBooking(agentId, incomingRows);
  const events = emptyJamaahSyncEvents();
  const newCutoffStr = datePlusDaysKey(options.now || new Date(), 0);
  const paymentCutoffStr = datePlusDaysKey(options.now || new Date(), options.paymentBufferDays ?? 7);
  const allowNewJamaah = options.allowNewJamaah !== false;
  const seenPaymentEvents = new Set();

  for (const row of incomingRows) {
    const key = jamaahRowKey(row);
    const existing = key ? existingByKey.get(key) : null;

    if (!existing) {
      if (allowNewJamaah && hasJamaahPayment(row) && isFutureRelevantJamaah(row, newCutoffStr)) {
        events.jamaahBaru.push({
          nama: row.nama,
          paket: row.paket,
          idUmroh: row.id_umroh,
          jmId: row.jm_id,
          tglBerangkat: row.tgl_berangkat,
          tglDaftar: row.tgl_daftar,
          bayar: toMoney(row.bayar),
          sisa: toMoney(row.sisa),
        });
      }
      continue;
    }

    if (!isFutureRelevantJamaah(row, paymentCutoffStr)) continue;

    const bayarBefore = toMoney(existing.bayar);
    const bayarAfter = toMoney(row.bayar);
    const sisaBefore = toMoney(existing.sisa);
    const hasKnownSisaAfter = row.sisa !== null && row.sisa !== undefined;
    const sisaAfter = hasKnownSisaAfter ? toMoney(row.sisa) : sisaBefore;
    const jumlah = Math.max(0, bayarAfter - bayarBefore);
    const sisaDecreased = hasKnownSisaAfter && sisaBefore > 0 && sisaAfter < sisaBefore;
    const becameLunas = hasKnownSisaAfter && sisaBefore > 0 && sisaAfter <= 0;
    const paidFromEmptyToLunas = hasKnownSisaAfter && bayarBefore <= 0 && jumlah > 0 && sisaAfter <= 0;

    if (jumlah <= 0) continue;

    const event = {
      nama: row.nama || existing.nama,
      paket: row.paket || existing.paket,
      idUmroh: row.id_umroh,
      jmId: row.jm_id,
      tglBerangkat: row.tgl_berangkat || existing.tgl_berangkat,
      jumlah,
      totalBayar: bayarAfter,
      sisa: sisaAfter,
      isLunas: sisaAfter <= 0,
    };

    const kind = becameLunas || paidFromEmptyToLunas ? 'pelunasan' : 'cicilan';
    const eventKey = [
      kind,
      row.id_umroh || row.jm_id || row.nama,
      jumlah,
      bayarAfter,
      sisaAfter,
    ].join('|');
    if (seenPaymentEvents.has(eventKey)) continue;
    seenPaymentEvents.add(eventKey);

    if (kind === 'pelunasan') events.pembayaranPelunasan.push(event);
    else if (sisaAfter > 0 && sisaDecreased) events.pembayaranCicilan.push(event);
  }

  return events;
}

function jakartaLocalDate(date = new Date()) {
  return new Date(date.toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
}

function isJamaahNotificationSendWindow(date = new Date()) {
  const now = jakartaLocalDate(date);
  const day = now.getDay();
  const hour = now.getHours();
  if (day === 6) return hour >= 8 && hour < 15;
  return hour >= 8 && hour < 21;
}

function isBackgroundJamaahSyncLabel(label = '') {
  return String(label).startsWith('bg/') || String(label).startsWith('api/bg/');
}

function queueJamaahSyncNotifications(agentId, events, label) {
  if (!hasJamaahSyncEvents(events)) return;
  if (isBackgroundJamaahSyncLabel(label) && !isJamaahNotificationSendWindow()) {
    console.log(`[SYNC] ${label}: jamaah telegram notification skipped outside send window`);
    return;
  }
  notifyJamaahSyncEvents(agentId, events).catch(err =>
    console.error(`[SYNC] ${label}: telegram jamaah event error:`, err.message)
  );
}

// Lazy-discover Alhijaz Official API credentials for an agent that already
// has jamaah_username + jamaah_password but no awapi_key yet (typical for
// agents who logged in before Phase 1 was deployed).
//
// Reuses the existing login session if active; otherwise spends ~1-2s logging
// in with the saved (encrypted) password, scrapes the `?route=api` page, and
// persists the discovered key. Returns the (possibly mutated) agent object so
// the caller can use the fresh awapi_key/awapi_code without a re-fetch.
//
// Failures are non-blocking — they just leave awapi_key empty so the caller
// can decide to fall back (e.g. legacy scrape path).
async function ensureAwapiCredentials(agent) {
  if (agent?.awapi_key) return agent;
  if (!agent?.jamaah_username || !agent?.jamaah_password) return agent;

  try {
    if (!isSessionActive(agent.jamaah_username)) {
      const decrypted = capiDecrypt(agent.jamaah_password);
      const loginResult = await laporanLogin(agent.jamaah_username, decrypted, agent.jamaah_kantor || '2');
      if (!loginResult.success) {
        console.warn(`[awapi/lazy] ${agent.slug}: login failed — ${loginResult.error || loginResult.reason}`);
        return agent;
      }
    }
    const awapi = await fetchAwapiCredentials(agent.jamaah_username);
    if (!awapi.success) {
      console.warn(`[awapi/lazy] ${agent.slug}: discovery failed — ${awapi.reason || awapi.error}`);
      return agent;
    }
    const { error } = await supabase
      .from('agents')
      .update({ awapi_key: awapi.awapi_key, awapi_code: awapi.awapi_code })
      .eq('id', agent.id);
    if (error) {
      console.warn(`[awapi/lazy] ${agent.slug}: persist failed — ${error.message}`);
      return agent;
    }
    invalidateAgentCache();
    console.log(`[awapi/lazy] ${agent.slug}: discovered ${awapi.awapi_code}`);
    return { ...agent, awapi_key: awapi.awapi_key, awapi_code: awapi.awapi_code };
  } catch (err) {
    console.warn(`[awapi/lazy] ${agent.slug}: error — ${err.message}`);
    return agent;
  }
}

// Sync via Alhijaz Official API — pure helper used by both manual & background
// paths. Returns { ok, count, error?, yearsCompleted, yearsAttempted }.
// Caller is responsible for the syncingAgents lifecycle and analytics logging
// (so the manual path can attribute the action to a user role).
async function syncUmrahViaApiCore(agentId, slug, agent, { context = 'manual', yearsToSync = getActiveHijriahYears() } = {}) {
  const apiKey = agent.awapi_key;
  const code = agent.awapi_code || apiKey.split('-')[0];
  const now = new Date().toISOString();
  const MIN_HIJRIAH_YEAR = 1447;
  const syncYearSet = new Set(yearsToSync);

  // Aggregate normalized rows from all hijriah years; dedup by (id_umroh, jm_id)
  // because keberangkatan (/bh) and pendaftaran (/dh) can overlap. The /dh
  // backfill catches fresh registrations whose departure-year list can lag.
  const rowsByKey = new Map();
  const fetchedBookingIds = new Set();
  const successfulBookingIds = new Set();
  const successfulJamaahPerBooking = new Map();
  let listComplete = true;
  let fetchErrors = 0;
  let keberangkatanYearsCompleted = 0;
  let upsertErrors = 0;
  let firstUpsertError = null;
  const syncEvents = emptyJamaahSyncEvents();
  const allowNewJamaahNotify = await hasJamaahNotificationBaseline(agentId, agent);

  for (const yearH of yearsToSync) {
    const fetchPlans = [
      {
        source: 'keberangkatan',
        endpoint: 'bh',
        fetchRows: () => awapiFetchUmrahByKeberangkatan(apiKey, code, {
          tahun: yearH,
          hijriah: true,
        }),
      },
      {
        source: 'pendaftaran',
        endpoint: 'dh',
        fetchRows: () => awapiFetchUmrahByPendaftaran(apiKey, code, {
          tahun: yearH,
          hijriah: true,
        }),
      },
    ];

    for (const plan of fetchPlans) {
      try {
        const { rows } = await plan.fetchRows();
        for (const raw of rows) {
          const norm = normalizeAwapiRow(raw, { agentId });
          if (!norm) continue;
          const yr = getHijriahYear(norm.tgl_berangkat) || yearH;
          if (Number(yr) < MIN_HIJRIAH_YEAR) continue;
          if (!syncYearSet.has(yr)) continue;
          norm.hijriah_year = yr;

          const key = `${norm.id_umroh}_${norm.jm_id}`.toLowerCase();
          rowsByKey.set(key, {
            ...norm,
            raw_data: {
              ...(norm.raw_data || {}),
              sync_source: plan.source,
              sync_endpoint: plan.endpoint,
            },
          });

          fetchedBookingIds.add(norm.id_umroh);
          successfulBookingIds.add(norm.id_umroh);
          const jset = successfulJamaahPerBooking.get(norm.id_umroh) || new Set();
          jset.add(String(norm.nama || '').trim().toLowerCase());
          successfulJamaahPerBooking.set(norm.id_umroh, jset);
        }
        if (plan.source === 'keberangkatan') keberangkatanYearsCompleted++;
        console.log(`[Sync/api/${context}] ${slug} ${plan.endpoint}/${yearH}: ${rows.length} rows`);
      } catch (err) {
        fetchErrors++;
        listComplete = false;
        console.warn(`[Sync/api/${context}] ${slug} ${plan.endpoint}/${yearH} failed: ${err.message}`);
      }
    }
  }

  const allRows = await preserveLegacyUmrohRawDataForRows(agentId, Array.from(rowsByKey.values()));
  console.log(`[Sync/api/${context}] ${slug}: ${allRows.length} unique rows from ${keberangkatanYearsCompleted}/${yearsToSync.length} keberangkatan years + pendaftaran backfill (${fetchErrors} fetch errors)`);
  const guardedAwapiRows = await preserveSuspiciousAwapiPayments(agentId, allRows);
  if (guardedAwapiRows.unresolved.length > 0) {
    const sample = guardedAwapiRows.unresolved
      .slice(0, 3)
      .map((row) => `${row.id_umroh}/${row.jm_id}:${row.bayar}/${row.sisa}`)
      .join(', ');
    throw new Error(`AWAPI payment anomaly: ${guardedAwapiRows.unresolved.length} row(s) have negative sisa without valid existing payment; falling back to legacy sync (${sample})`);
  }
  if (guardedAwapiRows.guardedCount > 0) {
    console.warn(`[Sync/api/${context}] ${slug}: preserved existing payment for ${guardedAwapiRows.guardedCount} suspicious AWAPI row(s)`);
  }
  const rowsForUpsert = guardedAwapiRows.rows;

  mergeJamaahSyncEvents(
    syncEvents,
    await detectUmrohJamaahSyncEvents(agentId, rowsForUpsert, { allowNewJamaah: allowNewJamaahNotify })
  );

  // Upsert in batches with the same conflict target as legacy.
  const BATCH = 50;
  let upserted = 0;
  for (let i = 0; i < rowsForUpsert.length; i += BATCH) {
    const batch = filterSafeJamaahRows(rowsForUpsert.slice(i, i + BATCH), `api-${context}`);
    if (batch.length === 0) continue;
    const { error } = await supabase
      .from('jamaah')
      .upsert(batch, { onConflict: 'agent_id,id_umroh,jm_id' });
    if (error) {
      upsertErrors++;
      if (!firstUpsertError) firstUpsertError = error.message;
      console.error(`[Sync/api/${context}] ${slug} upsert batch error:`, error.message);
    } else {
      upserted += batch.length;
    }
  }

  const anyRowsFetched = rowsByKey.size > 0;
  const outcome = classifyAwapiSyncOutcome({ fetchErrors, upsertErrors, anyRowsFetched });

  // Hard failure → throw so the caller (syncOneAgent / sync handler) falls back
  // to the legacy scrape. Partial/full return normally — no legacy fallback —
  // which is what stops the API<->legacy flap. See
  // docs/superpowers/specs/2026-05-31-umroh-sync-fix-a-design.md
  if (outcome.kind === 'hardfail') {
    throw new Error(firstUpsertError ? `${outcome.reason}: ${firstUpsertError}` : outcome.reason);
  }

  // Fire notifications only on a fully successful sync. On a partial cycle we
  // keep the rows we did fetch and retry next cycle; we never notify on
  // half-complete data (preserves Pattern 8 intent).
  if (outcome.shouldNotify) {
    queueJamaahSyncNotifications(agentId, syncEvents, `api/${context}/${slug}`);
  }

  // Cleanup: only on a fully successful sync (shouldCleanup === full).
  if (outcome.shouldCleanup && !syncingAgents.get(agentId)?.cancelled) {
    const { data: existingDbRows } = await supabase
      .from('jamaah')
      .select('id_umroh, nama, hijriah_year')
      .eq('agent_id', agentId)
      .in('hijriah_year', yearsToSync);
    const existingForCleanup = (existingDbRows || []).map((r) => ({
      bookingId: r.id_umroh,
      jamaahKey: String(r.nama || '').trim().toLowerCase(),
      nama: r.nama,
    }));
    const plan = computeSafeDeletions({
      listComplete,
      fetchedBookingIds,
      successfulBookingIds,
      successfulJamaahPerBooking,
      existingRows: existingForCleanup,
      maxDeletePercent: 0.3,
    });
    if (plan.decision === 'skip') {
      console.warn(`[Sync/api/${context}] ${slug} cleanup skipped: ${plan.reason} (wouldDelete=${plan.wouldDelete}/${plan.totalExisting})`);
    } else if (plan.toDelete.length > 0) {
      const deletedCount = await executeUmrohDeletions(slug, agentId, plan.toDelete);
      console.log(`[Sync/api/${context}] ${slug}: removed ${deletedCount} stale jamaah (wouldDelete=${plan.wouldDelete}/${plan.totalExisting})`);
    }
  }

  // Fire CAPI Purchase events (DP & Lunas) — fire-and-forget. Full success only.
  if (outcome.shouldNotify) {
    const upsertedIds = rowsForUpsert.map((r) => ({ id_umroh: r.id_umroh, jm_id: r.jm_id, nama: r.nama }));
    processCapiPurchases(agentId, slug, 'umroh', upsertedIds).catch((e) =>
      console.error(`[CAPI/api/${context}] sync error:`, e.message)
    );
  }

  // Bump last sync timestamp on every completed cycle (partial or full) so the
  // UI "last sync" label reflects reality, not only clean cycles.
  if (outcome.shouldBump) {
    const { error: bumpErr } = await supabase
      .from('agents')
      .update({ last_jamaah_sync_at: now })
      .eq('id', agentId);
    if (bumpErr) console.warn(`[Sync/api/${context}] ${slug} bump last_jamaah_sync_at failed:`, bumpErr.message);
    invalidateStatsCache(agentId);
  }

  if (outcome.kind === 'partial') {
    console.warn(`[Sync/api/${context}] ${slug}: partial sync — ${outcome.reason} (${keberangkatanYearsCompleted}/${yearsToSync.length} keberangkatan years); kept fetched rows, no legacy fallback`);
  }

  return {
    ok: outcome.kind === 'full',
    partial: outcome.kind === 'partial',
    count: upserted,
    yearsCompleted: keberangkatanYearsCompleted,
    yearsAttempted: yearsToSync.length,
    syncedAt: now,
  };
}

const HAJI_API_DEPARTURE_LOOKBACK_YEARS = 1;
const HAJI_API_DEPARTURE_LOOKAHEAD_YEARS = 15;

function getJakartaCalendarYear(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
  }).formatToParts(now);
  return Number(parts.find(p => p.type === 'year')?.value || now.getFullYear());
}

function getHajiApiDepartureMasehiYears(now = new Date()) {
  const currentYear = getJakartaCalendarYear(now);
  const years = [];
  for (
    let y = currentYear - HAJI_API_DEPARTURE_LOOKBACK_YEARS;
    y <= currentYear + HAJI_API_DEPARTURE_LOOKAHEAD_YEARS;
    y++
  ) {
    years.push(String(y));
  }
  return years;
}

async function syncHajiViaApiCore(agentId, slug, agent, {
  context = 'manual',
  departureYears = getHajiApiDepartureMasehiYears(),
  registrationHijriahYears = getActiveHijriahYears(),
} = {}) {
  const apiKey = agent.awapi_key;
  const code = agent.awapi_code || apiKey?.split('-')[0];
  if (!apiKey || !code) {
    throw new Error('AWAPI haji credential tidak tersedia');
  }

  const now = new Date().toISOString();
  const rowsByKey = new Map();
  const fetchedBookingIds = new Set();
  const successfulBookingIds = new Set();
  const successfulJamaahPerBooking = new Map();
  let fetchErrors = 0;
  let upsertErrors = 0;
  let firstUpsertError = null;
  const normalizedDepartureYears = [...new Set((departureYears || []).map(String).filter(Boolean))].sort();
  const normalizedRegistrationYears = [...new Set((registrationHijriahYears || []).map(String).filter(Boolean))].sort((a, b) => Number(b) - Number(a));

  const recordRow = (norm) => {
    const key = `${norm.id_haji}_${norm.id_jamaah}`.toLowerCase();
    rowsByKey.set(key, norm);
    fetchedBookingIds.add(norm.id_haji);
    successfulBookingIds.add(norm.id_haji);
    const jamaahSet = successfulJamaahPerBooking.get(norm.id_haji) || new Set();
    jamaahSet.add(norm.id_jamaah);
    successfulJamaahPerBooking.set(norm.id_haji, jamaahSet);
  };

  const fetchPlans = [
    ...normalizedDepartureYears.map(year => ({
      source: 'keberangkatan',
      endpoint: `bm/${year}`,
      fetchRows: () => awapiFetchHajiByKeberangkatan(apiKey, code, { tahun: year }),
    })),
    ...normalizedRegistrationYears.map(year => ({
      source: 'pendaftaran',
      endpoint: `dh/${year}`,
      fetchRows: () => awapiFetchHajiByPendaftaran(apiKey, code, { tahun: year, hijriah: true }),
    })),
  ];

  for (const plan of fetchPlans) {
    try {
      const { rows } = await plan.fetchRows();
      for (const raw of rows) {
        const norm = normalizeAwapiHajiRow(raw, { agentId });
        if (!norm) continue;
        recordRow(norm);
      }
      console.log(`[haji-api/${context}] ${slug} ${plan.endpoint}: ${rows.length} rows`);
    } catch (err) {
      fetchErrors++;
      console.warn(`[haji-api/${context}] ${slug} ${plan.endpoint} failed: ${err.message}`);
    }
  }

  const allRows = Array.from(rowsByKey.values());
  console.log(`[haji-api/${context}] ${slug}: ${allRows.length} unique haji rows from ${normalizedDepartureYears.length} departure years + ${normalizedRegistrationYears.length} registration years (${fetchErrors} fetch errors)`);

  const BATCH = 50;
  let upserted = 0;
  for (let i = 0; i < allRows.length; i += BATCH) {
    const batch = allRows.slice(i, i + BATCH);
    const { error } = await supabase
      .from('jamaah_haji')
      .upsert(batch, {
        onConflict: 'agent_id,id_haji,id_jamaah',
        defaultToNull: false,
      });
    if (error) {
      upsertErrors++;
      if (!firstUpsertError) firstUpsertError = error.message;
      console.error(`[haji-api/${context}] ${slug} upsert batch error:`, error.message);
    } else {
      upserted += batch.length;
    }
  }

  const anyRowsFetched = rowsByKey.size > 0;
  const outcome = classifyAwapiSyncOutcome({ fetchErrors, upsertErrors, anyRowsFetched });

  // Hard failure → throw. Haji has no legacy fallback, so the caller
  // (syncHajiOneAgent / sync handler) just logs and skips this cycle.
  // Partial/full return normally and bump the label. See
  // docs/superpowers/specs/2026-05-31-haji-sync-fix-a-design.md
  if (outcome.kind === 'hardfail') {
    throw new Error(firstUpsertError ? `${outcome.reason}: ${firstUpsertError}` : outcome.reason);
  }

  // Cleanup: full success only.
  if (outcome.shouldCleanup) {
    const cleanupYears = new Set(normalizedDepartureYears);
    if (!syncingAgents.get(agentId)?.cancelled && cleanupYears.size > 0) {
      const { data: existingRows } = await supabase
        .from('jamaah_haji')
        .select('id_haji, id_jamaah, thn_masehi')
        .eq('agent_id', agentId)
        .in('thn_masehi', [...cleanupYears]);
      const plan = computeSafeDeletions({
        listComplete: true,
        fetchedBookingIds,
        successfulBookingIds,
        successfulJamaahPerBooking,
        existingRows: (existingRows || []).map(r => ({ bookingId: r.id_haji, jamaahKey: r.id_jamaah })),
        maxDeletePercent: 0.3,
      });
      if (plan.decision === 'skip') {
        console.warn(`[haji-api/${context}] ${slug} cleanup skipped: ${plan.reason} (wouldDelete=${plan.wouldDelete}/${plan.totalExisting})`);
      } else if (plan.toDelete.length > 0) {
        const deletedCount = await executeHajiDeletions(slug, agentId, plan.toDelete);
        console.log(`[haji-api/${context}] ${slug}: removed ${deletedCount} stale haji (wouldDelete=${plan.wouldDelete}/${plan.totalExisting})`);
      }
    }
  }

  // Fire CAPI Purchase events once, on full success only (was per-batch before).
  if (outcome.shouldNotify) {
    const hajiCapiIds = allRows.map(r => ({ id_haji: r.id_haji, id_jamaah: r.id_jamaah }));
    processCapiPurchases(agentId, slug, 'haji', hajiCapiIds).catch(e =>
      console.error(`[CAPI/haji-api/${context}] Purchase error:`, e.message)
    );
  }

  // Bump on every completed cycle (partial + full) so the HajiPage label is honest.
  if (outcome.shouldBump) {
    const { error: bumpErr } = await supabase
      .from('agents')
      .update({ last_jamaah_haji_sync_at: now })
      .eq('id', agentId);
    if (bumpErr) console.warn(`[haji-api/${context}] ${slug} bump last_jamaah_haji_sync_at failed:`, bumpErr.message);
    invalidateStatsCache(agentId);
  }

  if (outcome.kind === 'partial') {
    console.warn(`[haji-api/${context}] ${slug}: partial sync — ${outcome.reason}; kept fetched rows, no fallback`);
  }

  return {
    ok: outcome.kind === 'full',
    partial: outcome.kind === 'partial',
    count: upserted,
    uniqueHaji: fetchedBookingIds.size,
    syncedAt: now,
    departureYears: normalizedDepartureYears,
    registrationHijriahYears: normalizedRegistrationYears,
  };
}

// HTTP wrapper for manual sync — called from /api/laporan/sync when env+key.
async function syncUmrahViaApi(req, res, agent, { yearsToSync = getActiveHijriahYears() } = {}) {
  const agentId = req.user.id;
  const slug = req.user.slug;

  syncingAgents.set(agentId, {
    isSyncing: true,
    scope: 'umroh-api',
    totalSynced: 0,
    completedYears: [],
    lastSync: null,
  });
  if (req.user?.role !== 'admin') logAnalyticsEvent(agentId, 'action', 'sync_jamaah_api', {}, getClientIpUa(req));

  try {
    const result = await syncUmrahViaApiCore(agentId, slug, agent, { context: 'manual', yearsToSync });
    return res.json({
      success: true,
      data: {
        initialCount: result.count,
        total: result.count,
        syncing: false,
        source: 'awapi',
        partial: result.partial || false,
        yearsCompleted: result.yearsCompleted,
        yearsAttempted: result.yearsAttempted,
      },
    });
  } finally {
    syncingAgents.set(agentId, {
      isSyncing: false,
      totalSynced: 0,
      lastSync: new Date().toISOString(),
    });
  }
}


// Sync: fetch from legacy → parse → progressive upsert to Supabase
// If hijriahYear is provided, sync only that year. Otherwise sync all years.
app.post('/api/laporan/sync', authMiddleware, async (req, res) => {
  const agentId = req.user.id;
  const slug = req.user.slug;
  const requestedSync = getRequestedSyncHijriahYears(req.body?.hijriahYear);
  if (!requestedSync.years) {
    return res.status(400).json({ error: `Tahun Hijriah ${requestedSync.invalidYear} belum didukung untuk sync` });
  }
  const yearsToSync = requestedSync.years;
  const targetedYearSync = requestedSync.targeted;
  const syncYearSet = new Set(yearsToSync);

  let agent = await getAgentById(agentId);
  if (!agent?.jamaah_username || !agent?.jamaah_password) {
    return res.status(400).json({ error: 'Belum ada credentials tersimpan' });
  }

  // Prevent concurrent sync
  const state = syncingAgents.get(agentId);
  if (state?.isSyncing) {
    return res.json({ success: true, data: { initialCount: 0, syncing: true, message: 'Sync sudah berjalan', ...state } });
  }

  let awapiFallbackUsed = false;

  // ── Optional: route through Alhijaz Official API (single-pass JSON) ──
  // Opt-in via env. Falls through to legacy if disabled, lazy-discovery
  // can't get a key, or new path errors out before sending any response.
  if (process.env.AWAPI_SYNC_ENABLED === 'true') {
    // Lazy-discover credentials for agents who logged in before Phase 1.
    // Skips network call if awapi_key already present.
    agent = await ensureAwapiCredentials(agent);
    if (!agent?.jamaah_username || !agent?.jamaah_password) {
      syncingAgents.set(agentId, { isSyncing: false, totalSynced: 0, completedYears: [], lastSync: null, loginFailed: true, invalidCredentials: true });
      return res.status(401).json({
        error: 'Credential sistem internal tidak tersedia. Silakan login ulang.',
      });
    }
    if (agent.awapi_key) {
      try {
        return await syncUmrahViaApi(req, res, agent, { yearsToSync });
      } catch (err) {
        console.error(`[Sync/api] ${slug} aborted, falling back to legacy:`, err.message);
        awapiFallbackUsed = true;
        syncingAgents.set(agentId, { isSyncing: false, totalSynced: 0, completedYears: [], lastSync: null });
        if (res.headersSent) return; // can't fall back if response already started
      }
    } else {
      console.log(`[Sync/api] ${slug}: no awapi_key after lazy discover, falling back to legacy`);
    }
  }

  syncingAgents.set(agentId, { isSyncing: true, scope: 'umroh-manual', totalSynced: 0, completedYears: [], lastSync: null });
  if (req.user?.role !== 'admin') logAnalyticsEvent(agentId, 'action', 'sync_jamaah', {}, getClientIpUa(req));

  // Force fresh session to ensure clean state with legacy system
  await laporanDisconnect(agent.jamaah_username);
  const decrypted = capiDecrypt(agent.jamaah_password);
  const loginResult = await laporanLogin(agent.jamaah_username, decrypted, agent.jamaah_kantor || '2');
  if (!loginResult.success) {
    syncingAgents.set(agentId, { isSyncing: false, totalSynced: 0, completedYears: [], lastSync: null });
    return res.status(401).json({
      error: loginResult.error || 'Gagal login ulang ke sistem internal. Credential tidak dihapus otomatis.',
    });
  }

  let totalItems = 0;
  let firstBatchSent = false;
  const now = new Date().toISOString();
  const syncEvents = emptyJamaahSyncEvents();
  const allowNewJamaahNotify = await hasJamaahNotificationBaseline(agentId, agent);

  try {
    // ═══════════════════════════════════════════════════════════════════
    // PHASE 1: Fast Scan via route=umrah (list + detail pages)
    // Gets core jamaah data (nama, jk, bayar, sisa, berangkat) in ~2 min
    // ═══════════════════════════════════════════════════════════════════
    console.log(`[Sync] ${slug}: Phase 1 — fast umrah scan starting`);

    const ringkasanRes = await fetchUmrahBookings(agent.jamaah_username);
    const sourceBookings = ringkasanRes.success ? (ringkasanRes.bookings || []) : [];
    const bookings = targetedYearSync
      ? sourceBookings.filter(b => syncYearSet.has(getHijriahYear(b.tgl_berangkat)))
      : sourceBookings;
    const listComplete = !!ringkasanRes.complete;
    console.log(`[Sync] ${slug}: Phase 1 — ${bookings.length}/${sourceBookings.length} bookings from list page, years=${yearsToSync.join(', ')}, complete=${listComplete}`);

    // Maps from list page — hoisted so Phase 2 can also use them
    let bookingStafMap = new Map();
    let bookingTglDaftarMap = new Map();

    // Track sync outcome for set-based cleanup decision at end of Phase 1
    const umrohFetchedBookingIds = new Set();
    const umrohSuccessfulBookingIds = new Set();
    const umrohSuccessfulJamaahPerBooking = new Map();

    if (bookings.length > 0) {
      // Get existing DB data to map paket, staf, and tgl_daftar from list page
      const bookingPaketMap = new Map();
      for (const b of bookings) {
        bookingPaketMap.set(b.id_umroh, b.paket);
        if (b.staf) bookingStafMap.set(b.id_umroh, b.staf);
        if (b.tgl_daftar) bookingTglDaftarMap.set(b.id_umroh, b.tgl_daftar);
      }

      // Pre-fetch existing hijriah_year from DB — so Phase 1 doesn't overwrite
      // accurate Phase 2 data with a '1447' default when tgl_berangkat is null
      const { data: existingYearRows } = await supabase
        .from('jamaah')
        .select('id_umroh, nama, hijriah_year')
        .eq('agent_id', agentId)
        .not('hijriah_year', 'is', null);
      const existingYearLookup = new Map();
      (existingYearRows || []).forEach(r => {
        existingYearLookup.set(`${r.id_umroh}_${r.nama}`.toLowerCase(), r.hijriah_year);
      });

      // Fetch detail pages in parallel batches of 5 (each request is ~1-2s, very light)
      const DETAIL_PARALLEL = 5;
      let detailErrors = 0;
      const allDetailIds = bookings.map(b => b.id_umroh);
      // Deduplicate (same id_umroh can appear in list if multiple jadwal)
      const uniqueIds = [...new Set(allDetailIds)];
      for (const id of uniqueIds) umrohFetchedBookingIds.add(id);
      // Global dedup: track unique (agent_id, id_umroh, nama) across ALL batches
      // to avoid inflated counter when same jamaah appears under multiple bookings
      const globalKeys = new Set();

      for (let i = 0; i < uniqueIds.length; i += DETAIL_PARALLEL) {
        // Check if sync was cancelled (user disconnected/deleted credentials)
        if (syncingAgents.get(agentId)?.cancelled) {
          console.log(`[Sync] ${slug}: Phase 1 aborted — user disconnected`);
          break;
        }
        const batch = uniqueIds.slice(i, i + DETAIL_PARALLEL);
        const results = await Promise.allSettled(
          batch.map(id => fetchUmrahDetail(agent.jamaah_username, id))
        );

        const rowsToUpsert = [];
        for (let j = 0; j < results.length; j++) {
          const idUmroh = batch[j];
          const result = results[j].status === 'fulfilled'
            ? results[j].value
            : { success: false, reason: 'unknown', error: results[j].reason?.message };

          if (!result.success) {
            detailErrors++;
            if (result.reason === 'session_expired') {
              await laporanDisconnect(agent.jamaah_username);
              await laporanLogin(agent.jamaah_username, decrypted, agent.jamaah_kantor || '2');
            }
            continue;
          }

          umrohSuccessfulBookingIds.add(idUmroh);
          const jamaahSet = umrohSuccessfulJamaahPerBooking.get(idUmroh) || new Set();

          // Build rows from detail items — paket comes from list page
          for (const item of result.items) {
            if (item.nama) jamaahSet.add(String(item.nama).trim().toLowerCase());
            // Determine hijriah year: use actual date, or preserve existing DB value, or default
            const computedYear = getHijriahYear(item.tgl_berangkat);
            const existingYear = existingYearLookup.get(`${item.id_umroh}_${item.nama}`.toLowerCase());
            const itemYear = computedYear || existingYear || '1447';
            if (Number(itemYear) < 1447) continue;
            item.paket = item.paket || bookingPaketMap.get(idUmroh) || null;
            // jm_id is the per-row unique identifier in legacy. Skip rows where
            // the scraper didn't extract a real JM... id; Phase 2 will populate
            // them with the real id later. Synthesizing a fallback here would
            // create ghost duplicates that diverge from Phase 2's canonical row.
            if (!item.jm_id || !/^JM/i.test(String(item.jm_id).trim())) {
              console.log(`[Sync/P1-manual] SKIP no-jmid ${item.id_umroh || '?'} ${item.nama || '?'} (raw=${JSON.stringify(item.jm_id)})`);
              continue;
            }
            rowsToUpsert.push({
              agent_id: agentId,
              id_umroh: item.id_umroh,
              jm_id: item.jm_id,
              nama: item.nama,
              jk: item.jk || null,
              wa: null,                // Phase 2 fills this
              tgl_lahir: null,         // Phase 2 fills this
              paket: item.paket || null,
              bayar: item.bayar || 0,
              sisa: item.sisa || 0,
              diskon_kantor: item.diskon_kantor || 0,
              diskon_marketing: item.diskon_marketing || 0,
              tgl_berangkat: item.tgl_berangkat || null,
              tgl_daftar: bookingTglDaftarMap.get(idUmroh) || null,
              hijriah_year: itemYear,
              perlengkapan: {},        // Phase 2 fills this
              dokumen: {},             // Phase 2 fills this
              no_paspor: null,         // Phase 2 fills this
              paspor_expired: null,    // Phase 2 fills this
              raw_data: { ...item.raw_data, staf: bookingStafMap.get(idUmroh) || null },
              synced_at: now,
            });
          }
          umrohSuccessfulJamaahPerBooking.set(idUmroh, jamaahSet);
        }

        // Upsert this batch — deduplicate by composite key first
        if (rowsToUpsert.length > 0) {
          const deduped = new Map();
          for (const row of rowsToUpsert) {
            const key = `${row.agent_id}_${row.id_umroh}_${row.jm_id}`.toLowerCase();
            deduped.set(key, row);
            globalKeys.add(key); // Track globally for accurate counter
          }
          const enrichedRows = await mergeExistingUmrohPhase1Enrichment(agentId, Array.from(deduped.values()));
          const dedupedRows = await prepareLegacyPaymentRowsForUpsert(agentId, enrichedRows, now);

          const BATCH = 50;
          for (const rowGroup of splitLegacyRowsByPaymentPayload(dedupedRows)) {
            for (let b = 0; b < rowGroup.length; b += BATCH) {
              const upsertBatch = filterSafeJamaahRows(rowGroup.slice(b, b + BATCH), 'P1-manual');
              if (upsertBatch.length === 0) continue;
              const batchEvents = await detectUmrohJamaahSyncEvents(agentId, upsertBatch, { allowNewJamaah: allowNewJamaahNotify });
              const { error } = await supabase.from('jamaah').upsert(upsertBatch, { onConflict: 'agent_id,id_umroh,jm_id', defaultToNull: false });
              if (error) console.error(`[Sync] ${slug} Phase 1 upsert error:`, error.message);
              else {
                mergeJamaahSyncEvents(syncEvents, batchEvents);
                const upsertedIds = upsertBatch.map(r => ({ id_umroh: r.id_umroh, jm_id: r.jm_id, nama: r.nama }));
                processCapiPurchases(agentId, slug, 'umroh', upsertedIds).catch(e =>
                  console.error(`[CAPI] Manual sync Phase 1 Purchase error:`, e.message)
                );
              }
            }
          }
          syncingAgents.set(agentId, { isSyncing: true, scope: 'umroh-manual', totalSynced: globalKeys.size, phase: 1, completedYears: [], lastSync: now });
        }

        // Send response after first successful batch (progressive hydration)
        if (!firstBatchSent && globalKeys.size > 0) {
          firstBatchSent = true;
          totalItems = globalKeys.size;
          res.json({
            success: true,
            data: { initialCount: globalKeys.size, total: uniqueIds.length, syncing: true },
          });
        }
      }

      // Query actual DB count for final accurate number (globalKeys may still
      // over-count if rows existed from a prior sync that share the same key)
      let actualCountQuery = supabase
        .from('jamaah')
        .select('*', { count: 'exact', head: true })
        .eq('agent_id', agentId);
      if (targetedYearSync) actualCountQuery = actualCountQuery.in('hijriah_year', yearsToSync);
      const { count: actualCount } = await actualCountQuery;
      totalItems = actualCount || globalKeys.size;

      console.log(`[Sync] ${slug}: Phase 1 complete — ${globalKeys.size} processed, ${actualCount} in DB, from ${uniqueIds.length} bookings (${detailErrors} errors)`);
      syncingAgents.set(agentId, { isSyncing: true, scope: 'umroh-manual', totalSynced: totalItems, phase: 1, completedYears: [], lastSync: now });

      // Collect completed years from Phase 1 data — counts are already accurate
      let phase1YearsQuery = supabase
        .from('jamaah')
        .select('hijriah_year')
        .eq('agent_id', agentId)
        .not('hijriah_year', 'is', null);
      if (targetedYearSync) phase1YearsQuery = phase1YearsQuery.in('hijriah_year', yearsToSync);
      const { data: phase1Rows } = await phase1YearsQuery;
      const phase1Years = [...new Set((phase1Rows || []).map(r => r.hijriah_year))]
        .filter(y => Number(y) >= 1447)
        .sort((a, b) => Number(b) - Number(a));
      console.log(`[Sync] ${slug}: Phase 1 completed years: ${phase1Years.join(', ')}`);

      // Cleanup via set-based guard: protect rows for bookings whose detail fetch
      // failed, and abort entirely if list response was truncated or would-delete
      // exceeds safety threshold.
      if (!syncingAgents.get(agentId)?.cancelled) {
        let existingRowsQuery = supabase
          .from('jamaah')
          .select('id_umroh, nama, hijriah_year')
          .eq('agent_id', agentId);
        if (targetedYearSync) existingRowsQuery = existingRowsQuery.in('hijriah_year', yearsToSync);
        const { data: existingDbRows } = await existingRowsQuery;
        const existingForCleanup = (existingDbRows || []).map(r => ({
          bookingId: r.id_umroh,
          jamaahKey: String(r.nama || '').trim().toLowerCase(),
          nama: r.nama,
        }));
        const plan = computeSafeDeletions({
          listComplete,
          fetchedBookingIds: umrohFetchedBookingIds,
          successfulBookingIds: umrohSuccessfulBookingIds,
          successfulJamaahPerBooking: umrohSuccessfulJamaahPerBooking,
          existingRows: existingForCleanup,
          maxDeletePercent: 0.3,
        });
        if (plan.decision === 'skip') {
          console.warn(`[Sync] ${slug} cleanup skipped: ${plan.reason} (wouldDelete=${plan.wouldDelete}/${plan.totalExisting})`);
        } else if (plan.toDelete.length > 0) {
          const deletedCount = await executeUmrohDeletions(slug, agentId, plan.toDelete);
          totalItems -= deletedCount;
          console.log(`[Sync] ${slug}: removed ${deletedCount} stale jamaah (wouldDelete=${plan.wouldDelete}/${plan.totalExisting})`);
        }
      }
    }

    const deferInlinePhase2 = shouldDeferInlineUmrohPhase2({
      awapiSyncEnabled: process.env.AWAPI_SYNC_ENABLED === 'true',
      awapiKey: agent.awapi_key,
      forceInline: awapiFallbackUsed,
    });

    if (deferInlinePhase2) {
      console.log(`[Sync] ${slug}: Phase 2 deferred to scheduled enrichment (${DEFAULT_UMROH_PHASE2_TIMES_WIB.join('/')} WIB)`);
    } else {
      // ═══════════════════════════════════════════════════════════════════
      // PHASE 2: Enrichment via laporan (slower, but fills all fields)
      // Adds: wa, tgl_lahir, perlengkapan, dokumen, no_paspor, paspor_expired, tgl_daftar
      // ═══════════════════════════════════════════════════════════════════
      console.log(`[Sync] ${slug}: Phase 2 — laporan enrichment starting`);

    // Split large date ranges into 7-day chunks — smaller = faster PHP response, fewer timeouts
    function splitRange(tglAwal, tglAkhir, chunkDays = 7) {
      const chunks = [];
      let start = new Date(tglAwal);
      const end = new Date(tglAkhir);
      while (start <= end) {
        const chunkEnd = new Date(start);
        chunkEnd.setDate(chunkEnd.getDate() + chunkDays - 1);
        const actualEnd = chunkEnd > end ? end : chunkEnd;
        chunks.push({
          tglAwal: start.toISOString().split('T')[0],
          tglAkhir: actualEnd.toISOString().split('T')[0],
        });
        start = new Date(actualEnd);
        start.setDate(start.getDate() + 1);
      }
      return chunks;
    }

    // Merge overlapping year ranges into continuous spans, then split into chunks
    const allRanges = yearsToSync.map(y => HIJRIAH_YEARS[y]).filter(Boolean)
      .sort((a, b) => a.tglAwal.localeCompare(b.tglAwal));
    const merged = [];
    for (const r of allRanges) {
      const last = merged[merged.length - 1];
      if (last && r.tglAwal <= last.tglAkhir) {
        if (r.tglAkhir > last.tglAkhir) last.tglAkhir = r.tglAkhir;
      } else {
        merged.push({ tglAwal: r.tglAwal, tglAkhir: r.tglAkhir });
      }
    }

    // Cap merged ranges at 6 months into the future — covers most jamaah with
    // booked departures so WA/tgl_lahir/paspor/perlengkapan/dokumen get enriched
    // shortly after registration, not only near departure.
    const today = new Date();
    const futureCapDate = new Date(today);
    futureCapDate.setMonth(futureCapDate.getMonth() + 6);
    const futureCap = futureCapDate.toISOString().split('T')[0];
    for (const span of merged) {
      if (span.tglAkhir > futureCap) span.tglAkhir = futureCap;
    }

    // Split into chunks, sort newest-first
    const allChunks = [];
    for (const span of merged) {
      if (span.tglAwal > futureCap) continue;
      allChunks.push(...splitRange(span.tglAwal, span.tglAkhir));
    }
    const todayStr = today.toISOString().split('T')[0];
    // Sort newest-first so most recent hijriah year data gets enriched first
    allChunks.sort((a, b) => b.tglAwal.localeCompare(a.tglAwal));

    const fetchJobs = [...allChunks];
    console.log(`[Sync] ${slug}: Phase 2 — ${fetchJobs.length} laporan chunks (enrichment)`);

    // Process laporan jobs in parallel batches of 2
    const kantor = agent.jamaah_kantor || '2';
    let networkFailures = 0;
    let timeoutCount = 0;
    const PARALLEL = 2;

    // Mark Phase 2 — frontend hides counter, shows "enriching" text
    // Use phase1Years if available (from Phase 1 completion above)
    const completedYears = typeof phase1Years !== 'undefined' ? phase1Years : [];
    syncingAgents.set(agentId, { isSyncing: true, scope: 'umroh-manual', totalSynced: totalItems, phase: 2, completedYears, lastSync: now });

    for (let i = 0; i < fetchJobs.length; i += PARALLEL) {
      // Check if sync was cancelled (user disconnected/deleted credentials)
      if (syncingAgents.get(agentId)?.cancelled) {
        console.log(`[Sync] ${slug}: Phase 2 aborted — user disconnected`);
        break;
      }
      if (networkFailures >= 3) {
        console.log(`[Sync] ${slug}: aborting enrichment — legacy system unreachable`);
        break;
      }

      const batchJobs = fetchJobs.slice(i, i + PARALLEL);
      const fetchResults = await Promise.allSettled(
        batchJobs.map(job => fetchLaporan(agent.jamaah_username, {
          kantor, agentId: agent.jamaah_username,
          tglAwal: job.tglAwal, tglAkhir: job.tglAkhir,
        }))
      );

      for (let j = 0; j < fetchResults.length; j++) {
        const job = batchJobs[j];
        const fetchResult = fetchResults[j].status === 'fulfilled'
          ? fetchResults[j].value
          : { success: false, reason: 'unknown', error: fetchResults[j].reason?.message };

        if (!fetchResult.success) {
          if (fetchResult.reason === 'session_expired') {
            await laporanDisconnect(agent.jamaah_username);
            await laporanLogin(agent.jamaah_username, decrypted, kantor);
          } else if (fetchResult.reason === 'network') {
            networkFailures++;
          } else if (fetchResult.reason === 'timeout') {
            timeoutCount++;
          }
          continue;
        }

        // Success — parse and upsert (overwrites Phase 1 rows with full data)
        networkFailures = 0;
        const { items } = parseLaporanHtml(fetchResult.html);
        const scopedItems = targetedYearSync
          ? items.filter(item => syncYearSet.has(getHijriahYear(item.tgl_berangkat) || '1447'))
          : items;
        if (scopedItems.length === 0) continue;

        const rows = buildRows(scopedItems, agentId, now);

        // Fetch existing rows to (a) prevent bayar regression and (b) resolve jm_id
        // for Phase 2 items whose source (<small>) was CSS-truncated. We look up the
        // real jm_id from Phase 1's canonical data so we UPDATE the right row instead
        // of inserting a duplicate with a synthetic name-based key.
        const rowNames = rows.map(r => r.nama);
        const rowIduIds = [...new Set(rows.map(r => r.id_umroh).filter(Boolean))];
        const { data: existingPhase1, error: paymentLookupErr } = await supabase
          .from('jamaah')
          .select('id_umroh, nama, jm_id, bayar, sisa, raw_data, dokumen')
          .eq('agent_id', agentId)
          .in('nama', rowNames)
          .in('id_umroh', rowIduIds);
        if (paymentLookupErr) console.warn(`[Sync] ${slug} bayar lookup error:`, paymentLookupErr.message);
        // Per-jm_id bayar lookup: within a group where multiple members share the
        // same nama (e.g. MARNI with 10 rows), each jm_id tracks its own payment.
        const existingPaymentByJmId = new Map();
        // Map (id_umroh, nama) → list of known jm_ids (used to resolve truncated/synth jm_ids)
        const existingJmIdLookup = new Map();
        (existingPhase1 || []).forEach(r => {
          existingPaymentByJmId.set(`${r.id_umroh}_${r.jm_id}`.toLowerCase(), r);
          const namaKey = `${r.id_umroh}_${r.nama}`.toLowerCase();
          const list = existingJmIdLookup.get(namaKey) || [];
          list.push(r.jm_id);
          existingJmIdLookup.set(namaKey, list);
        });

        // Preserve Phase 1 data that Phase 2 might not have
        for (const row of rows) {
          // Staf: only from list page, not in laporan
          const staf = bookingStafMap.get(row.id_umroh);
          if (staf) row.raw_data = { ...(row.raw_data || {}), staf };
          // tgl_daftar: if Phase 2 parsing failed, keep Phase 1's value
          if (!row.tgl_daftar) {
            row.tgl_daftar = bookingTglDaftarMap.get(row.id_umroh) || null;
          }
          // bayar normally should not regress. Exception: old Phase 1 detail
          // rows were grossed up by discounts; let Phase 2 correct those.
          // Keyed by jm_id so same-name siblings don't contaminate each other.
          const jmIdKey = `${row.id_umroh}_${row.jm_id}`.toLowerCase();
          const existingPayment = existingPaymentByJmId.get(jmIdKey);
          row.dokumen = mergeUmrohDokumen(existingPayment?.dokumen, row.dokumen);
          if (shouldKeepExistingBayar(existingPayment, row.bayar)) {
            row.bayar = existingPayment.bayar;
          }
          // Resolve jm_id: if Phase 2 synthesized from nama OR produced nothing,
          // reuse an existing Phase 1 jm_id keyed by (id_umroh, nama). Only
          // unambiguous matches (1 existing row for this pair) — skip otherwise.
          if (!row.jm_id || row.jm_id.startsWith('__name_')) {
            const match = existingJmIdLookup.get(`${row.id_umroh}_${row.nama}`.toLowerCase());
            if (match && match.length === 1) {
              row.jm_id = match[0];
            }
          }
        }
        // Drop rows whose jm_id is still synthetic AND whose (id_umroh, nama)
        // already exists in DB — they'd be ghost inserts (same person twice).
        const safeRows = rows.filter((row) => {
          if (!row.jm_id || !row.jm_id.startsWith('__name_')) return true;
          const match = existingJmIdLookup.get(`${row.id_umroh}_${row.nama}`.toLowerCase());
          if (match && match.length >= 1) {
            console.warn(`[Sync] ${slug} Phase 2 skipped ghost row — ${row.id_umroh}/${row.nama} has ${match.length} real rows already`);
            return false;
          }
          return true;
        });
        const guardedRows = await prepareLegacyPaymentRowsForUpsert(agentId, safeRows, now);
        const BATCH = 50;
        for (const rowGroup of splitLegacyRowsByPaymentPayload(guardedRows)) {
          for (let b = 0; b < rowGroup.length; b += BATCH) {
            const upsertBatch = filterSafeJamaahRows(rowGroup.slice(b, b + BATCH), 'P2-manual');
            if (upsertBatch.length === 0) continue;
            const batchEvents = await detectUmrohJamaahSyncEvents(agentId, upsertBatch, { allowNewJamaah: allowNewJamaahNotify });
            const { error } = await supabase.from('jamaah').upsert(upsertBatch, { onConflict: 'agent_id,id_umroh,jm_id', defaultToNull: false });
            if (error) console.error(`[Sync] ${slug} Phase 2 range ${job.tglAwal} error:`, error.message);
            else mergeJamaahSyncEvents(syncEvents, batchEvents);
          }
        }
        // Back-fill enrichment for items whose CSS-truncated jm_id got dropped
        // by buildRows. Targets existing rows keyed on (id_umroh, nama), using
        // the truncated-jm_id suffix hint to disambiguate same-nama siblings.
        await enrichJamaahFromLaporanItems(agentId, scopedItems, 'P2-manual');
        // Phase 2: no counter update — just keep syncing state alive

        // Fire CAPI Purchase events (DP & Lunas)
        const upsertedIds = rows.map(r => ({ id_umroh: r.id_umroh, jm_id: r.jm_id, nama: r.nama }));
        processCapiPurchases(agentId, slug, 'umroh', upsertedIds).catch(e =>
          console.error(`[CAPI] Manual sync Purchase error:`, e.message)
        );

        // If Phase 1 produced nothing, send response on first Phase 2 batch
        if (!firstBatchSent) {
          firstBatchSent = true;
          res.json({
            success: true,
            data: { initialCount: scopedItems.length, total: scopedItems.length, syncing: true },
          });
        }
      }
    }

      if (timeoutCount > 0) {
        console.log(`[Sync] ${slug}: Phase 2 — ${timeoutCount}/${fetchJobs.length} ranges timed out`);
      }
    }
  } catch (err) {
    if (!firstBatchSent) throw err;
    console.error(`[Sync] ${slug} sync error:`, err);
  } finally {
    console.log(`[Sync] ${slug}: sync complete — ${totalItems} total items`);
    syncingAgents.set(agentId, { isSyncing: false, totalSynced: totalItems, lastSync: now });
    queueJamaahSyncNotifications(agentId, syncEvents, `manual/${slug}`);
    // Persist sync timestamp at agent level — skip_noop_update trigger blocks
    // jamaah.synced_at advancement on cycles where no row content changed.
    const { error: bumpErr } = await supabase.from('agents').update({ last_jamaah_sync_at: now }).eq('id', agentId);
    if (bumpErr) console.warn(`[Sync] ${slug} bump last_jamaah_sync_at failed:`, bumpErr.message);
    invalidateStatsCache(agentId);
  }

  // If we never sent response (all phases empty)
  if (!firstBatchSent) {
    syncingAgents.set(agentId, { isSyncing: false, totalSynced: 0, lastSync: now });
    return res.json({ success: true, data: { initialCount: 0, syncing: false } });
  }
});

// ── Refresh single jamaah by ID via Alhijaz Official API ──
// Uses /awapi/gu/{kode}/jamaah/{IDJamaah} — single-row update without a full
// sync. Gated by AWAPI_SYNC_ENABLED because the upstream API doesn't scope
// per-agent (every kode returns global data) — refreshing while disabled is
// pointless and risks pulling foreign data.
app.get('/api/laporan/jamaah/:idJamaah/refresh', authMiddleware, async (req, res) => {
  if (process.env.AWAPI_SYNC_ENABLED !== 'true') {
    return res.status(503).json({ error: 'API resmi sedang dinonaktifkan' });
  }

  const agentId = req.user.id;
  const slug = req.user.slug;
  const idJamaah = String(req.params.idJamaah || '').trim();
  if (!idJamaah || !/^JM/i.test(idJamaah)) {
    return res.status(400).json({ error: 'idJamaah tidak valid' });
  }

  const agent = await getAgentById(agentId);
  if (!agent?.awapi_key) {
    return res.status(400).json({ error: 'API key Alhijaz belum tersedia. Login ulang via JamaahPage agar key ter-discover otomatis.' });
  }
  const code = agent.awapi_code || agent.awapi_key.split('-')[0];

  try {
    const { rows } = await awapiFetchJamaahById(agent.awapi_key, code, idJamaah);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Jamaah tidak ditemukan di sistem Alhijaz' });
    }
    const norm = normalizeAwapiRow(rows[0], { agentId });
    if (!norm) {
      return res.status(422).json({ error: 'Data jamaah tidak lengkap untuk dinormalisasi' });
    }
    const [legacyPreservedNorm] = await preserveLegacyUmrohRawDataForRows(agentId, [norm]);
    const guardedRefresh = await preserveSuspiciousAwapiPayments(agentId, [legacyPreservedNorm]);
    if (guardedRefresh.unresolved.length > 0) {
      return res.status(409).json({ error: 'Data pembayaran dari API resmi tidak konsisten dan belum ada data pembayaran valid untuk dipertahankan. Jalankan sync penuh agar sistem memakai data legacy.' });
    }
    const rowForUpsert = guardedRefresh.rows[0];
    rowForUpsert.hijriah_year = getHijriahYear(rowForUpsert.tgl_berangkat) || null;

    const syncEvents = await detectUmrohJamaahSyncEvents(agentId, [rowForUpsert], {
      allowNewJamaah: await hasJamaahNotificationBaseline(agentId, agent),
    });
    const { error } = await supabase
      .from('jamaah')
      .upsert([rowForUpsert], { onConflict: 'agent_id,id_umroh,jm_id' });
    if (error) {
      console.error(`[Sync/api] ${slug} jamaah/${idJamaah} upsert error:`, error.message);
      return res.status(500).json({ error: 'Gagal menyimpan data refreshed' });
    }
    queueJamaahSyncNotifications(agentId, syncEvents, `refresh-jamaah/${slug}`);

    // Best-effort CAPI Purchase event for this single jamaah.
    processCapiPurchases(agentId, slug, 'umroh', [{ id_umroh: rowForUpsert.id_umroh, jm_id: rowForUpsert.jm_id, nama: rowForUpsert.nama }]).catch((e) =>
      console.error('[CAPI/api] refresh jamaah error:', e.message)
    );

    res.json({ success: true, data: { row: rowForUpsert, source: guardedRefresh.guardedCount > 0 ? 'awapi-payment-preserved' : 'awapi' } });
  } catch (err) {
    if (err instanceof AwapiError) {
      return res.status(502).json({ error: `Upstream API: ${err.message}`, status: err.status });
    }
    console.error(`[Sync/api] ${slug} jamaah/${idJamaah} error:`, err.message);
    res.status(500).json({ error: err.message || 'Internal error' });
  }
});

// ── Refresh single umrah booking (and all its jamaah) by ID ──
// Gated by AWAPI_SYNC_ENABLED — see note on /jamaah/:id/refresh above.
app.get('/api/laporan/umrah/:idUmrah/refresh', authMiddleware, async (req, res) => {
  if (process.env.AWAPI_SYNC_ENABLED !== 'true') {
    return res.status(503).json({ error: 'API resmi sedang dinonaktifkan' });
  }

  const agentId = req.user.id;
  const slug = req.user.slug;
  const idUmrah = String(req.params.idUmrah || '').trim();
  if (!idUmrah) {
    return res.status(400).json({ error: 'idUmrah wajib diisi' });
  }

  const agent = await getAgentById(agentId);
  if (!agent?.awapi_key) {
    return res.status(400).json({ error: 'API key Alhijaz belum tersedia. Login ulang via JamaahPage agar key ter-discover otomatis.' });
  }
  const code = agent.awapi_code || agent.awapi_key.split('-')[0];

  try {
    const { rows } = await awapiFetchUmrahById(agent.awapi_key, code, idUmrah);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Booking tidak ditemukan di sistem Alhijaz' });
    }

    const normalized = [];
    for (const raw of rows) {
      const norm = normalizeAwapiRow(raw, { agentId });
      if (!norm) continue;
      norm.hijriah_year = getHijriahYear(norm.tgl_berangkat) || null;
      normalized.push(norm);
    }
    if (normalized.length === 0) {
      return res.status(422).json({ error: 'Tidak ada baris jamaah valid pada booking ini' });
    }
    const legacyPreservedRows = await preserveLegacyUmrohRawDataForRows(agentId, normalized);
    const guardedRefresh = await preserveSuspiciousAwapiPayments(agentId, legacyPreservedRows);
    if (guardedRefresh.unresolved.length > 0) {
      return res.status(409).json({ error: 'Data pembayaran dari API resmi tidak konsisten dan belum ada data pembayaran valid untuk dipertahankan. Jalankan sync penuh agar sistem memakai data legacy.' });
    }

    const safeRows = filterSafeJamaahRows(guardedRefresh.rows, 'api-refresh-umrah');
    const syncEvents = await detectUmrohJamaahSyncEvents(agentId, safeRows, {
      allowNewJamaah: await hasJamaahNotificationBaseline(agentId, agent),
    });
    if (safeRows.length > 0) {
      const { error } = await supabase
        .from('jamaah')
        .upsert(safeRows, { onConflict: 'agent_id,id_umroh,jm_id' });
      if (error) {
        console.error(`[Sync/api] ${slug} umrah/${idUmrah} upsert error:`, error.message);
        return res.status(500).json({ error: 'Gagal menyimpan data refreshed' });
      }
    }
    queueJamaahSyncNotifications(agentId, syncEvents, `refresh-umrah/${slug}`);

    processCapiPurchases(
      agentId,
      slug,
      'umroh',
      safeRows.map((r) => ({ id_umroh: r.id_umroh, jm_id: r.jm_id, nama: r.nama }))
    ).catch((e) => console.error('[CAPI/api] refresh umrah error:', e.message));

    res.json({ success: true, data: { count: safeRows.length, rows: safeRows, source: guardedRefresh.guardedCount > 0 ? 'awapi-payment-preserved' : 'awapi' } });
  } catch (err) {
    if (err instanceof AwapiError) {
      return res.status(502).json({ error: `Upstream API: ${err.message}`, status: err.status });
    }
    console.error(`[Sync/api] ${slug} umrah/${idUmrah} error:`, err.message);
    res.status(500).json({ error: err.message || 'Internal error' });
  }
});

// Sync status: check if an agent's sync is in progress
app.get('/api/laporan/sync-status', authMiddleware, async (req, res) => {
  const state = syncingAgents.get(req.user.id);
  if (!state) {
    // No sync state — check last sync from agents table (skip_noop_update trigger
    // means jamaah.synced_at no longer reflects "last sync attempt" reliably).
    const { data } = await supabase
      .from('agents')
      .select('last_jamaah_sync_at')
      .eq('id', req.user.id)
      .maybeSingle();
    return res.json({
      success: true,
      data: { isSyncing: false, totalSynced: 0, lastSync: data?.last_jamaah_sync_at || null },
    });
  }
  res.json({ success: true, data: state });
});

// ──────────────────────────────────────────────
// API: Calendar Events
// ──────────────────────────────────────────────
app.get('/api/calendar/events', authMiddleware, async (req, res) => {
  const { month, year } = req.query;
  if (!month || !year) {
    return res.status(400).json({ error: 'month dan year wajib diisi' });
  }

  const m = parseInt(month, 10);
  const y = parseInt(year, 10);
  if (isNaN(m) || m < 1 || m > 12 || isNaN(y)) {
    return res.status(400).json({ error: 'month (1-12) dan year harus valid' });
  }

  try {
    // Build date range for the month
    const startDate = `${y}-${String(m).padStart(2, '0')}-01`;
    const endMonth = m === 12 ? 1 : m + 1;
    const endYear = m === 12 ? y + 1 : y;
    const endDate = `${endYear}-${String(endMonth).padStart(2, '0')}-01`;

    let query = supabase
      .from('calendar_events')
      .select('*')
      .gte('event_date', startDate)
      .lt('event_date', endDate)
      .order('event_date', { ascending: true });

    const { data: events, error } = await query;

    if (error) {
      console.error('[Calendar API] Query error:', error.message);
      return res.status(500).json({ error: 'Gagal mengambil data kalender' });
    }

    // Group by date + type
    const grouped = {};
    for (const ev of (events || [])) {
      const key = `${ev.event_date}_${ev.event_type}`;
      if (!grouped[key]) {
        grouped[key] = {
          date: ev.event_date,
          type: ev.event_type,
          details: [],
        };
      }
      grouped[key].details.push({
        group_number: ev.group_number,
        pesawat: ev.pesawat,
        jam: ev.jam,
        paket: ev.paket,
        pax: ev.pax,
        staff: ev.staff,
        tour_leader: ev.tour_leader,
        jam_kumpul: ev.jam_kumpul || null,
        titik_kumpul: ev.titik_kumpul || null,
      });
    }

    // Get last sync time
    const { data: lastSyncRow } = await supabase
      .from('calendar_events')
      .select('synced_at')
      .order('synced_at', { ascending: false })
      .limit(1);

    res.json({
      success: true,
      data: {
        events: Object.values(grouped),
        lastSync: lastSyncRow?.[0]?.synced_at || null,
      },
    });
  } catch (err) {
    console.error('[Calendar API] Error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ──────────────────────────────────────────────
// API: Calendar Kumpul Enrichment (manual trigger)
// ──────────────────────────────────────────────
app.post('/api/calendar/enrich-kumpul', authMiddleware, async (req, res) => {
  try {
    await enrichKeberangkatanWithKumpul(supabase);
    res.json({ success: true, message: 'Enrichment complete — check server logs' });
  } catch (err) {
    console.error('[KumpulParser] Manual trigger error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────
// API: Calendar AI Insight
// ──────────────────────────────────────────────
let insightCache = null; // in-memory fallback: {today, weekly, cuaca, generatedAt}

// Check if insight is stale (dateFor is not today in WIB / UTC+7)
function isInsightStale(cache) {
  if (!cache || !cache.generatedAt) return true;
  // If no dateFor field (old format), always stale — forces regeneration
  if (!cache.dateFor) return true;
  const nowWIB = new Date(Date.now() + 7 * 60 * 60 * 1000);
  return cache.dateFor !== nowWIB.toISOString().slice(0, 10);
}
let insightRefreshLast = 0; // timestamp of last manual refresh

// Mekah/Madinah monthly average temperatures (°C)
const MEKAH_TEMPS = { 1:{low:18,high:30},2:{low:18,high:31},3:{low:20,high:34},4:{low:23,high:38},5:{low:26,high:41},6:{low:27,high:43},7:{low:28,high:43},8:{low:28,high:43},9:{low:27,high:42},10:{low:24,high:38},11:{low:21,high:34},12:{low:19,high:31} };
const MADINAH_TEMPS = { 1:{low:10,high:22},2:{low:12,high:25},3:{low:15,high:29},4:{low:20,high:34},5:{low:24,high:39},6:{low:26,high:42},7:{low:27,high:42},8:{low:27,high:41},9:{low:25,high:40},10:{low:20,high:35},11:{low:15,high:28},12:{low:11,high:23} };

async function generateCalendarInsight() {
  console.log('[AI Insight] Starting generation...');
  const OPENAI_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_KEY) {
    console.warn('[AI Insight] OPENAI_API_KEY not configured — skipping');
    return null;
  }

  // Query events: today → +7 days (use WIB / UTC+7 to get correct local date)
  const today = new Date();
  const todayWIB = new Date(today.getTime() + 7 * 60 * 60 * 1000);
  const todayStr = todayWIB.toISOString().split('T')[0];
  const nextWeek = new Date(todayWIB);
  nextWeek.setDate(nextWeek.getDate() + 7);
  const nextWeekStr = nextWeek.toISOString().split('T')[0];

  // Also get the full current month for summary (use WIB date)
  const monthStart = `${todayWIB.getUTCFullYear()}-${String(todayWIB.getUTCMonth() + 1).padStart(2, '0')}-01`;
  const monthEnd = todayWIB.getUTCMonth() === 11
    ? `${todayWIB.getUTCFullYear() + 1}-01-01`
    : `${todayWIB.getUTCFullYear()}-${String(todayWIB.getUTCMonth() + 2).padStart(2, '0')}-01`;

  let weekEvents, monthEvents;
  try {
    const [weekResult, monthResult] = await Promise.all([
      supabase.from('calendar_events').select('*').gte('event_date', todayStr).lte('event_date', nextWeekStr).order('event_date'),
      supabase.from('calendar_events').select('event_date, event_type, pax, paket, group_number').gte('event_date', monthStart).lt('event_date', monthEnd).eq('event_type', 'keberangkatan'),
    ]);
    weekEvents = weekResult.data || [];
    monthEvents = monthResult.data || [];
    console.log(`[AI Insight] Found ${weekEvents.length} week events, ${monthEvents.length} month events`);
  } catch (err) {
    console.error('[AI Insight] Supabase query error:', err.message);
    return null;
  }

  if (weekEvents.length === 0 && monthEvents.length === 0) {
    console.log('[AI Insight] No calendar data — generating generic insight');
    const cm = todayWIB.getUTCMonth() + 1;
    const mT = MEKAH_TEMPS[cm], dT = MADINAH_TEMPS[cm];
    const data = {
      today: 'Tidak ada keberangkatan atau kepulangan hari ini. Waktu yang baik untuk follow-up jamaah yang masih ada sisa pembayaran.',
      weekly: 'Belum ada jadwal keberangkatan atau kepulangan minggu ini.',
      cuaca: `Mekah ${mT.low}–${mT.high}°C · Madinah ${dT.low}–${dT.high}°C`,
      dateFor: todayStr,
      generatedAt: new Date().toISOString(),
    };
    insightCache = data;
    try {
      await supabase.from('calendar_insights').upsert({ id: 'latest', data, generated_at: data.generatedAt }, { onConflict: 'id' });
    } catch { /* best-effort */ }
    return data;
  }

  // Build context string
  const monthNames = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
  const formatDate = (d) => {
    const parts = d.split('-');
    return `${parseInt(parts[2])} ${monthNames[parseInt(parts[1]) - 1]}`;
  };

  // Group week events by date + type, filtering out ghost entries (null group or 0 pax)
  const validEvents = weekEvents.filter(ev => ev.group_number && ev.pax > 0);
  const weekSummary = {};
  for (const ev of validEvents) {
    const key = `${ev.event_date}_${ev.event_type}`;
    if (!weekSummary[key]) weekSummary[key] = { date: ev.event_date, type: ev.event_type, groups: [], totalPax: 0 };
    weekSummary[key].groups.push({
      group: ev.group_number,
      pax: ev.pax || 0,
      paket: ev.paket,
      tour_leader: ev.tour_leader || null,
      jam_kumpul: ev.jam_kumpul || null,
      titik_kumpul: ev.titik_kumpul || null,
      pesawat: ev.pesawat || null,
      jam: ev.jam || null,
    });
    weekSummary[key].totalPax += ev.pax || 0;
  }

  // Separate today's events from future events explicitly
  const todayEvents = Object.values(weekSummary).filter(e => e.date === todayStr);
  const futureEvents = Object.values(weekSummary).filter(e => e.date !== todayStr).sort((a, b) => a.date.localeCompare(b.date));

  let calendarDataString = `Tanggal hari ini: ${formatDate(todayStr)}\n\n`;

  // TODAY section — explicit and unambiguous
  calendarDataString += `=== HARI INI (${formatDate(todayStr)}) ===\n`;
  if (todayEvents.length === 0) {
    calendarDataString += `TIDAK ADA jadwal keberangkatan/kepulangan/manasik hari ini. Kosong.\n`;
  } else {
    for (const item of todayEvents) {
      calendarDataString += `${item.type}: ${item.groups.length} group, ${item.totalPax} jamaah\n`;
      for (const g of item.groups) {
        let groupLine = `  Group ${g.group}: ${g.pax} jamaah, paket ${g.paket || '-'}`;
        if (g.tour_leader) groupLine += `, TL: ${g.tour_leader}`;
        if (g.pesawat) groupLine += `, pesawat: ${g.pesawat}`;
        if (g.jam) groupLine += `, jam: ${g.jam}`;
        if (g.jam_kumpul) groupLine += `, kumpul: ${g.jam_kumpul}`;
        if (g.titik_kumpul) groupLine += ` di ${g.titik_kumpul}`;
        calendarDataString += groupLine + '\n';
      }
    }
  }

  // FUTURE section
  calendarDataString += `\n=== JADWAL 7 HARI KE DEPAN (TIDAK termasuk hari ini) ===\n`;
  if (futureEvents.length === 0) {
    calendarDataString += `Tidak ada jadwal keberangkatan/kepulangan/manasik 7 hari ke depan.\n`;
  } else {
    for (const item of futureEvents) {
      calendarDataString += `${formatDate(item.date)} — ${item.type}: ${item.groups.length} group, ${item.totalPax} jamaah\n`;
      for (const g of item.groups) {
        let groupLine = `  Group ${g.group}: ${g.pax} jamaah, paket ${g.paket || '-'}`;
        if (g.tour_leader) groupLine += `, TL: ${g.tour_leader}`;
        if (g.pesawat) groupLine += `, pesawat: ${g.pesawat}`;
        if (g.jam) groupLine += `, jam: ${g.jam}`;
        if (g.jam_kumpul) groupLine += `, kumpul: ${g.jam_kumpul}`;
        if (g.titik_kumpul) groupLine += ` di ${g.titik_kumpul}`;
        calendarDataString += groupLine + '\n';
      }
    }
  }

  // Month summary
  const monthTotalPax = monthEvents.reduce((s, e) => s + (e.pax || 0), 0);
  const monthDates = [...new Set(monthEvents.map(e => e.event_date))];
  const paketCount = {};
  for (const e of monthEvents) {
    const p = e.paket || 'Lainnya';
    paketCount[p] = (paketCount[p] || 0) + 1;
  }
  const topPaket = Object.entries(paketCount).sort((a, b) => b[1] - a[1]).slice(0, 3);

  calendarDataString += `\n=== RINGKASAN BULAN ${monthNames[today.getMonth()].toUpperCase()} ===\n`;
  calendarDataString += `Total keberangkatan: ${monthDates.length} hari, ${monthEvents.length} group, ${monthTotalPax} jamaah\n`;
  if (topPaket.length > 0) {
    calendarDataString += `Paket terlaris: ${topPaket.map(([p, c]) => `${p} (${c} group)`).join(', ')}\n`;
  }

  // Weather data for prompt
  const currentMonth = todayWIB.getUTCMonth() + 1;
  const mekahT = MEKAH_TEMPS[currentMonth];
  const madinahT = MADINAH_TEMPS[currentMonth];
  const mekahCondition = mekahT.high >= 39 ? 'sangat panas' : mekahT.high >= 30 ? 'panas' : 'hangat';
  const madinahCondition = madinahT.high >= 39 ? 'sangat panas' : madinahT.high >= 30 ? 'panas' : 'hangat';

  // Random style hint — pick 1 each time to vary tone
  const styleHints = [
    'Mulai langsung ke poin penting, tanpa basa-basi.',
    'Buka dengan pertanyaan retoris.',
    'Gunakan nada sedikit playful dan ceria.',
    'Buka dengan fun fact atau observasi menarik.',
    'Gunakan nada tenang dan reassuring.',
    'Mulai dengan "heads up" atau alert tone yang friendly.',
    'Buka dengan apresiasi atau motivasi singkat.',
  ];
  const randomStyle = styleHints[Math.floor(Math.random() * styleHints.length)];

  const systemPrompt = `Kamu adalah asisten untuk agen travel umroh Alhijaz. Agen-agen ini campuran pria dan wanita. 

Tugas kamu: buat 2 insight singkat berdasarkan data jadwal berikut. Gunakan bahasa Indonesia yang HANGAT dan KASUAL — seperti ngobrol sesama teman kerja. Jangan pakai bahasa baku/kaku/formal. Boleh pakai kata seperti "rame", "lumayan", "nih", "yuk", "dong", "banget", "Alhamdulillah". Jangan pakai kata "signifikan", "terkait", "berdasarkan data", atau bahasa laporan.

VARIASI BAHASA (WAJIB):
- JANGAN pernah buka kalimat dengan pola yang sama setiap hari. Variasikan pembuka — kadang dari fakta menarik, kadang dari pertanyaan, kadang dari reminder langsung.
- Contoh variasi pembuka field "today":
  • "Hari ini ada 3 group berangkat loh..."
  • "Cek jadwal hari ini yuk — tanggal 22 Maret lumayan padat..."
  • "Alhamdulillah hari ini agak santai, nggak ada keberangkatan..."
  • "Heads up! Ada 2 group yang berangkat hari ini..."
  • "Hari Kamis ini kosong dari keberangkatan, tapi besok..."
  • "Jadwal hari ini cukup seru nih..."
- Contoh variasi pembuka field "weekly":
  • "Minggu ini lumayan padat — total 5 group berangkat..."
  • "Siap-siap ya, minggu depan bakal rame..."
  • "Untuk 7 hari ke depan, yang paling perlu diperhatiin itu..."
  • "Weekly update: ada beberapa group besar yang berangkat..."
- Gunakan hari dalam minggu (Senin, Selasa, dst) secara natural, jangan selalu sebut tanggal angka di awal kalimat.
- Variasikan juga gaya penutup — jangan selalu "jangan lupa" atau "pastikan".

INFO TAMBAHAN:
- Jika ada data tour leader (TL), sebutkan nama TL-nya di insight hari ini.
- Jika ada data jam kumpul dan titik kumpul, sebutkan juga di insight hari ini.
- Jika ada data pesawat dan jam terbang, sebutkan di insight.

LARANGAN:
- JANGAN gunakan sapaan berdasarkan waktu (Pagi, Siang, Sore, Malam, Selamat pagi, dll) karena insight ini berlaku seharian, bukan hanya pagi.
- JANGAN gunakan sebutan gender spesifik (ladies, girls, bu, pak, bro, sis, dll) karena agent terdiri dari pria dan wanita. Gunakan "kita", "kamu", atau langsung ke topik tanpa menyebut gender.
- JANGAN PERNAH mengarang atau membuat data yang tidak ada di input. Jika data menunjukkan "TIDAK ADA jadwal hari ini", maka field "today" WAJIB mengatakan tidak ada jadwal. DILARANG KERAS menyebut ada group berangkat hari ini kalau datanya kosong.
- Semua angka (jumlah group, jamaah, tanggal) HARUS sesuai persis dengan data yang diberikan. Jangan membulatkan atau mengubah angka.

Bungkus angka/tanggal penting dengan **bold** (contoh: **25 Maret**, **336 jamaah**).

Buat 2 bagian (HARUS dalam format JSON, tanpa backtick/markdown di luar value):
{
  "today": "Ringkasan hari ini BERDASARKAN DATA SECTION 'HARI INI'. Jika section 'HARI INI' menunjukkan TIDAK ADA jadwal, WAJIB bilang hari ini kosong/santai, lalu sebut kapan jadwal terdekat berikutnya dari section '7 HARI KE DEPAN'. Jangan mengarang ada keberangkatan hari ini kalau datanya kosong. Jika ada info TL, jam kumpul, titik kumpul — sebutkan. Maksimal 3 kalimat.",
  "weekly": "Ringkasan 7 hari ke depan + PENGINGAT/TO-DO untuk agent. Sebutkan hari paling rame, group terbesar, total jamaah. Lalu kasih action items spesifik, misal: 'Manasik tanggal X, kabari jamaah Group Y.' atau 'Group Z berangkat N hari lagi, cek kelengkapan dokumen.' Maksimal 4-5 kalimat."
}`;

  const userPrompt = `Data jadwal 7 hari ke depan:
${calendarDataString}

Gaya penulisan hari ini: ${randomStyle}`;

  try {
    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENAI_KEY}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 500,
      }),
    });

    if (!openaiRes.ok) {
      const errBody = await openaiRes.text();
      console.error('[AI Insight] OpenAI error:', errBody);
      return null;
    }

    const result = await openaiRes.json();
    const content = result.choices?.[0]?.message?.content || '';

    // Parse JSON from response (handle potential markdown wrapping)
    const jsonStr = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const parsed = JSON.parse(jsonStr);

    // Compute static weather data (no AI needed)
    const cuacaText = `Mekah ${mekahT.low}–${mekahT.high}°C (${mekahCondition}) · Madinah ${madinahT.low}–${madinahT.high}°C (${madinahCondition})`;

    const data = {
      today: parsed.today || '',
      weekly: parsed.weekly || '',
      cuaca: cuacaText,
      dateFor: todayStr,
      generatedAt: new Date().toISOString(),
    };

    // Save to in-memory cache
    insightCache = data;

    // Persist to Supabase (best-effort, not blocking)
    try {
      const { error: upsertErr } = await supabase
        .from('calendar_insights')
        .upsert({ id: 'latest', data, generated_at: data.generatedAt }, { onConflict: 'id' });
      if (upsertErr) console.warn('[AI Insight] Supabase save warning:', upsertErr.message);
    } catch (e) {
      console.warn('[AI Insight] Supabase save failed (table may not exist):', e.message);
    }

    console.log('[AI Insight] Generated successfully');
    return data;
  } catch (err) {
    console.error('[AI Insight] Generation error:', err.message);
    return null;
  }
}

// GET — return insight (in-memory first, then Supabase fallback)
app.get('/api/calendar/insight', authMiddleware, async (req, res) => {

  // Try in-memory cache first
  if (insightCache) {
    return res.json({ success: true, data: insightCache });
  }
  // Fallback to Supabase
  try {
    const { data: row, error } = await supabase
      .from('calendar_insights')
      .select('data')
      .eq('id', 'latest')
      .single();
    if (!error && row?.data) {
      insightCache = row.data; // warm up in-memory
      return res.json({ success: true, data: row.data });
    }
  } catch { /* table may not exist */ }
  res.json({ success: false, error: 'Insight belum tersedia' });
});

// POST — force regenerate insight (admin/manual trigger)
app.post('/api/calendar/insight/refresh', authMiddleware, async (req, res) => {
  try {
    insightCache = null; // clear in-memory cache
    const data = await generateCalendarInsight();
    if (data) {
      res.json({ success: true, data });
    } else {
      res.json({ success: false, error: 'Gagal generate insight' });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET — per-agent jamaah status for personalized insight card
app.get('/api/calendar/insight-jamaah', authMiddleware, async (req, res) => {
  try {
    const agentId = req.user.id;
    const todayWIB = new Date(Date.now() + 7 * 60 * 60 * 1000);
    const todayStr = todayWIB.toISOString().split('T')[0];

    // End of current month
    const monthEnd = todayWIB.getUTCMonth() === 11
      ? `${todayWIB.getUTCFullYear() + 1}-01-01`
      : `${todayWIB.getUTCFullYear()}-${String(todayWIB.getUTCMonth() + 2).padStart(2, '0')}-01`;

    // 30 days from today for passport checks
    const plus30 = new Date(todayWIB);
    plus30.setDate(plus30.getDate() + 30);
    const plus30Str = plus30.toISOString().split('T')[0];

    // Query jamaah for this agent departing from today onwards this month
    const { data: jamaahData, error } = await supabase
      .from('jamaah')
      .select('nama, sisa, tgl_berangkat, dokumen, no_paspor, paspor_expired')
      .eq('agent_id', agentId)
      .gte('tgl_berangkat', todayStr)
      .lt('tgl_berangkat', monthEnd);

    if (error) {
      return res.json({ success: true, data: null });
    }

    const allJamaah = jamaahData || [];
    const totalBulanIni = allJamaah.length;

    // Belum lunas (sisa > 0)
    const belumLunas = allJamaah.filter(j => j.sisa && parseFloat(j.sisa) > 0);
    const totalBelumLunas = belumLunas.length;
    const totalSisa = belumLunas.reduce((s, j) => s + (parseFloat(j.sisa) || 0), 0);

    // Paspor belum dikumpulkan (no_paspor kosong AND dokumen.paspor !== true)
    const belumPaspor = allJamaah.filter(j => {
      const pasporCollected = j.dokumen?.paspor === true || (j.no_paspor && j.no_paspor.trim() !== '');
      return !pasporCollected;
    });

    // Paspor expired before departure
    const pasporExpired = allJamaah.filter(j => {
      return j.paspor_expired && j.tgl_berangkat && j.paspor_expired < j.tgl_berangkat;
    });

    // Berangkat dalam 7 hari
    const plus7 = new Date(todayWIB);
    plus7.setDate(plus7.getDate() + 7);
    const plus7Str = plus7.toISOString().split('T')[0];
    const berangkat7Hari = allJamaah.filter(j => j.tgl_berangkat >= todayStr && j.tgl_berangkat <= plus7Str);

    res.json({
      success: true,
      data: {
        totalBulanIni,
        totalBelumLunas,
        totalSisa,
        belumPaspor: belumPaspor.length,
        pasporExpired: pasporExpired.length,
        berangkat7Hari: berangkat7Hari.length,
      },
    });
  } catch (err) {
    console.error('[InsightJamaah] Error:', err.message);
    res.json({ success: true, data: null });
  }
});

// ──────────────────────────────────────────────
// API: Flight Status (AirLabs Integration)
// ──────────────────────────────────────────────

// Known Alhijaz Umroh/Haji routes — used as fallback when AirLabs hasn't responded yet
const KNOWN_ROUTES = {
  'SV821':  { dep: 'CGK', depCity: 'Jakarta',  arr: 'MED', arrCity: 'Madinah',  durationMin: 570, depTerminal: '3' },
  'SV822':  { dep: 'MED', depCity: 'Madinah',  arr: 'CGK', arrCity: 'Jakarta',  durationMin: 570 },
  'SV827':  { dep: 'CGK', depCity: 'Jakarta',  arr: 'JED', arrCity: 'Jeddah',   durationMin: 540, depTerminal: '3' },
  'SV828':  { dep: 'JED', depCity: 'Jeddah',   arr: 'CGK', arrCity: 'Jakarta',  durationMin: 540 },
  'SV816':  { dep: 'JED', depCity: 'Jeddah',   arr: 'CGK', arrCity: 'Jakarta',  durationMin: 600, depTerminal: '1' },
  'SV817':  { dep: 'JED', depCity: 'Jeddah',   arr: 'CGK', arrCity: 'Jakarta',  durationMin: 540 },
  'SV818':  { dep: 'JED', depCity: 'Jeddah',   arr: 'CGK', arrCity: 'Jakarta',  durationMin: 540 },
  'SV820':  { dep: 'JED', depCity: 'Jeddah',   arr: 'CGK', arrCity: 'Jakarta',  durationMin: 540 },
  'GA980':  { dep: 'CGK', depCity: 'Jakarta',  arr: 'JED', arrCity: 'Jeddah',   durationMin: 540, depTerminal: '2' },
  'GA981':  { dep: 'JED', depCity: 'Jeddah',   arr: 'CGK', arrCity: 'Jakarta',  durationMin: 540 },
  'GA982':  { dep: 'CGK', depCity: 'Jakarta',  arr: 'MED', arrCity: 'Madinah',  durationMin: 570, depTerminal: '2' },
  'GA983':  { dep: 'MED', depCity: 'Madinah',  arr: 'CGK', arrCity: 'Jakarta',  durationMin: 570 },
  'GA960':  { dep: 'CGK', depCity: 'Jakarta',  arr: 'MED', arrCity: 'Madinah',  durationMin: 570, depTerminal: '2' },
  'GA961':  { dep: 'MED', depCity: 'Madinah',  arr: 'CGK', arrCity: 'Jakarta',  durationMin: 570 },
  'EK357':  { dep: 'CGK', depCity: 'Jakarta',  arr: 'JED', arrCity: 'Jeddah',   durationMin: 780, depTerminal: '3' },
  'EK358':  { dep: 'JED', depCity: 'Jeddah',   arr: 'CGK', arrCity: 'Jakarta',  durationMin: 780 },
  'EK356':  { dep: 'CGK', depCity: 'Jakarta',  arr: 'DXB', arrCity: 'Dubai',    durationMin: 480, depTerminal: '3' },
  'ID6580': { dep: 'CGK', depCity: 'Jakarta',  arr: 'JED', arrCity: 'Jeddah',   durationMin: 540, depTerminal: '2' },
  'ID6581': { dep: 'JED', depCity: 'Jeddah',   arr: 'CGK', arrCity: 'Jakarta',  durationMin: 540 },
};

function lookupRoute(flightIata, eventType) {
  const route = KNOWN_ROUTES[flightIata];
  if (route) return route;
  if (eventType === 'keberangkatan') return { dep: 'CGK', depCity: 'Jakarta', arr: 'JED', arrCity: 'Jeddah', durationMin: 540 };
  if (eventType === 'kepulangan')    return { dep: 'JED', depCity: 'Jeddah',  arr: 'CGK', arrCity: 'Jakarta', durationMin: 540 };
  return null;
}

function estimateArrival(depTimeStr, durationMin) {
  if (!depTimeStr || !durationMin) return null;
  try {
    const dep = new Date(depTimeStr);
    if (isNaN(dep.getTime())) return null;
    return new Date(dep.getTime() + durationMin * 60 * 1000).toISOString();
  } catch { return null; }
}

// ── Timezone helpers ──
// Airport IATA → timezone offset in hours from UTC
const AIRPORT_TZ_OFFSETS = {
  'CGK': 7,   // Jakarta (WIB, UTC+7)
  'SUB': 7,   // Surabaya (WIB, UTC+7)
  'JOG': 7,   // Yogyakarta (WIB, UTC+7)
  'SRG': 7,   // Semarang (WIB, UTC+7)
  'BDO': 7,   // Bandung (WIB, UTC+7)
  'SOC': 7,   // Solo (WIB, UTC+7)
  'JED': 3,   // Jeddah (AST, UTC+3)
  'MED': 3,   // Madinah (AST, UTC+3)
  'DXB': 4,   // Dubai (GST, UTC+4)
  'IST': 3,   // Istanbul (TRT, UTC+3)
};

/**
 * Extract "HH:mm" from a datetime string like "2026-03-29 11:45" or ISO format.
 * Works with AirLabs local time strings and ISO datetimes.
 */
function extractHHmm(timeStr) {
  if (!timeStr) return null;
  const s = String(timeStr).trim();
  // Already HH:mm
  if (/^\d{2}:\d{2}$/.test(s)) return s;
  // "YYYY-MM-DD HH:MM" (AirLabs format)
  const spaceMatch = s.match(/(\d{2}):(\d{2})/);
  if (spaceMatch) return `${spaceMatch[1]}:${spaceMatch[2]}`;
  // ISO datetime
  try {
    const d = new Date(s);
    if (!isNaN(d.getTime())) {
      // For ISO strings with Z or +00:00, this would give UTC hours.
      // But we only use this for already-local times, so it's fine.
      const hh = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      return `${hh}:${mm}`;
    }
  } catch { /* ignore */ }
  return s;
}

/**
 * Extract date part from a datetime string for display.
 * Returns the original string (frontend Date parse handles it).
 */
function extractDateISO(timeStr) {
  if (!timeStr) return null;
  // "YYYY-MM-DD HH:MM" → "YYYY-MM-DDT00:00:00" for frontend date display
  const s = String(timeStr).trim();
  const dateMatch = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (dateMatch) return `${dateMatch[1]}T00:00:00`;
  return s;
}

/**
 * Parse "HH:mm" string to total minutes since midnight.
 */
function parseHHmmToMinutes(hhmm) {
  if (!hhmm) return 0;
  const [h, m] = hhmm.split(':').map(Number);
  return (isNaN(h) ? 0 : h) * 60 + (isNaN(m) ? 0 : m);
}

/**
 * Get current date string in WIB (UTC+7) — "YYYY-MM-DD"
 * Ensures consistent date calculation regardless of server timezone.
 */
function getWIBDateStr(date = new Date()) {
  const wib = new Date(date.getTime() + 7 * 60 * 60 * 1000);
  return wib.toISOString().split('T')[0];
}

/**
 * Parse flight info from calendar_events.pesawat field
 * Input: "SAUDIA - SV 827" or "GARUDA INDONESIA - GA 987"
 * Output: { airline, airlineCode, flightNumber, flightIata }
 */
function parseFlightFromCalendar(pesawat) {
  if (!pesawat) return null;
  const match = pesawat.match(/^(.+?)\s*[-~]\s*([A-Z]{2})\s*(\d+)$/i);
  if (!match) return null;
  return {
    airline: match[1].trim(),
    airlineCode: match[2].toUpperCase(),
    flightNumber: match[3],
    flightIata: `${match[2].toUpperCase()}${match[3]}`,
  };
}

// AirLabs quota tracking — persisted to Supabase across restarts
let airLabsRequestCount = 0;
let airLabsQuotaMonth = '';
const AIRLABS_MONTHLY_LIMIT = 1000;

async function loadAirLabsQuota() {
  try {
    const { data } = await supabase
      .from('calendar_insights')
      .select('data')
      .eq('id', 'airlabs_quota')
      .single();
    const currentMonth = new Date().toISOString().slice(0, 7); // "YYYY-MM"
    if (data?.data && data.data.month === currentMonth) {
      airLabsRequestCount = data.data.count || 0;
      airLabsQuotaMonth = currentMonth;
      console.log(`[FlightAPI] Loaded quota from Supabase: ${airLabsRequestCount}/${AIRLABS_MONTHLY_LIMIT} (${currentMonth})`);
    } else {
      airLabsRequestCount = 0;
      airLabsQuotaMonth = currentMonth;
      console.log(`[FlightAPI] New month (${currentMonth}), quota starts at 0`);
    }
  } catch (err) {
    console.warn('[FlightAPI] Could not load quota:', err.message);
  }
}

async function persistAirLabsQuota() {
  try {
    const currentMonth = new Date().toISOString().slice(0, 7);
    await supabase.from('calendar_insights').upsert({
      id: 'airlabs_quota',
      data: { count: airLabsRequestCount, month: currentMonth },
    }, { onConflict: 'id' });
  } catch (err) {
    console.warn('[FlightAPI] Could not persist quota:', err.message);
  }
}

function canMakeAirLabsRequest() {
  if (airLabsRequestCount >= AIRLABS_MONTHLY_LIMIT * 0.9) {
    console.warn(`[FlightAPI] Approaching quota limit: ${airLabsRequestCount}/${AIRLABS_MONTHLY_LIMIT}`);
  }
  return airLabsRequestCount < AIRLABS_MONTHLY_LIMIT;
}

function maybeResetQuotaCounter() {
  const currentMonth = new Date().toISOString().slice(0, 7);
  if (airLabsQuotaMonth && airLabsQuotaMonth !== currentMonth) {
    airLabsRequestCount = 0;
    airLabsQuotaMonth = currentMonth;
    persistAirLabsQuota();
    console.log('[FlightAPI] Monthly quota counter reset');
  }
}

/**
 * Fetch real-time flight data from AirLabs API
 * Free tier: 1000 req/month — use sparingly!
 */
async function fetchFlightFromAirLabs(flightIata) {
  const apiKey = process.env.AIRLABS_API_KEY;
  if (!apiKey) return null;

  if (!canMakeAirLabsRequest()) {
    console.warn('[FlightAPI] Monthly quota exhausted — skipping API call');
    return null;
  }

  try {
    const url = `https://airlabs.co/api/v9/flight?flight_iata=${flightIata}&api_key=${apiKey}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });

    if (!res.ok) {
      console.error(`[FlightAPI] AirLabs error: ${res.status}`);
      return null;
    }

    const data = await res.json();
    airLabsRequestCount++;
    persistAirLabsQuota();

    if (data.error) {
      console.error(`[FlightAPI] AirLabs API error:`, data.error);
      return null;
    }

    console.log(`[FlightAPI] Fetched ${flightIata} (quota: ${airLabsRequestCount}/${AIRLABS_MONTHLY_LIMIT})`);
    if (data.response) {
      console.log(`[FlightAPI] ${flightIata} aircraft:`, data.response.aircraft_icao, '| reg:', data.response.reg_number, '| duration:', data.response.duration);
    }
    return data.response || null;
  } catch (err) {
    console.error(`[FlightAPI] Fetch error for ${flightIata}:`, err.message);
    return null;
  }
}

// Aircraft ICAO → readable name
const AIRCRAFT_NAMES = {
  'B77W': 'Boeing 777-300ER',
  'B773': 'Boeing 777-300',
  'B772': 'Boeing 777-200',
  'B789': 'Boeing 787-9 Dreamliner',
  'B788': 'Boeing 787-8 Dreamliner',
  'A333': 'Airbus A330-300',
  'A332': 'Airbus A330-200',
  'A339': 'Airbus A330-900neo',
  'A359': 'Airbus A350-900',
  'A35K': 'Airbus A350-1000',
  'A388': 'Airbus A380-800',
  'A321': 'Airbus A321',
  'A320': 'Airbus A320',
  'B738': 'Boeing 737-800',
  'B739': 'Boeing 737-900ER',
  'B38M': 'Boeing 737 MAX 8',
};

function getAircraftName(icao) {
  if (!icao) return null;
  return AIRCRAFT_NAMES[icao.toUpperCase()] || icao;
}

/**
 * Map AirLabs response to our flight_status schema
 */
function mapAirLabsToFlightStatus(apiData, calendarEvent) {
  if (!apiData) return null;
  const parsed = parseFlightFromCalendar(calendarEvent.pesawat);
  if (!parsed) return null;

  // Validate: AirLabs returns today's flight — dep date must match event_date
  // dep_time is in airport-local time, so we just extract the date part
  const apiDepTime = apiData.dep_time || apiData.dep_actual || apiData.dep_time_utc;
  if (apiDepTime) {
    const dateMatch = String(apiDepTime).match(/^(\d{4}-\d{2}-\d{2})/);
    const apiDate = dateMatch ? dateMatch[1] : null;
    if (apiDate && apiDate !== calendarEvent.event_date) {
      console.log(`[FlightAPI] Date mismatch: API=${apiDate}, event=${calendarEvent.event_date} — skipping`);
      return null;
    }
  }

  // Validate: AirLabs route must match expected Umrah route
  // Prevents flight number collision (e.g. GA961 domestic vs GA961 umrah)
  const expectedRoute = lookupRoute(parsed.flightIata, calendarEvent.event_type);
  if (expectedRoute && apiData.dep_iata && apiData.arr_iata) {
    const apiDep = apiData.dep_iata.toUpperCase();
    const apiArr = apiData.arr_iata.toUpperCase();
    if (apiDep !== expectedRoute.dep || apiArr !== expectedRoute.arr) {
      console.log(`[FlightAPI] Route mismatch for ${parsed.flightIata}: API=${apiDep}→${apiArr}, expected=${expectedRoute.dep}→${expectedRoute.arr} — skipping`);
      return null;
    }
  }

  // Determine status
  let status = 'scheduled';
  if (apiData.status === 'active' || apiData.status === 'en-route') status = 'en-route';
  else if (apiData.status === 'landed') status = 'landed';
  else if (apiData.status === 'cancelled') status = 'cancelled';
  else if (apiData.dep_delayed || apiData.arr_delayed) status = 'delayed';

  const delayed = Math.max(apiData.dep_delayed || 0, apiData.arr_delayed || 0);

  // Calculate progress
  let progress = 0;
  if (status === 'en-route' && apiData.dep_actual_ts && apiData.arr_estimated_ts) {
    const now = Math.floor(Date.now() / 1000);
    const totalDuration = apiData.arr_estimated_ts - apiData.dep_actual_ts;
    const elapsed = now - apiData.dep_actual_ts;
    progress = Math.min(99, Math.max(1, Math.round((elapsed / totalDuration) * 100)));
  } else if (status === 'landed') {
    progress = 100;
  }

  const result = {
    id: `${calendarEvent.event_date}_${parsed.flightIata}`,
    event_date: calendarEvent.event_date,
    flight_iata: parsed.flightIata,
    airline_name: parsed.airline,
    airline_iata: parsed.airlineCode,
    airline_logo: apiData.airline_logo || null,
    group_number: calendarEvent.group_number,
    status,
    dep_iata: apiData.dep_iata || null,
    dep_city: apiData.dep_city || null,
    dep_terminal: apiData.dep_terminal || null,
    dep_gate: apiData.dep_gate || null,
    dep_scheduled: apiData.dep_time || apiData.dep_time_utc || null,
    dep_actual: apiData.dep_actual || apiData.dep_actual_utc || null,
    arr_iata: apiData.arr_iata || null,
    arr_city: apiData.arr_city || null,
    arr_terminal: apiData.arr_terminal || null,
    arr_gate: apiData.arr_gate || null,
    arr_scheduled: apiData.arr_time || apiData.arr_time_utc || null,
    arr_estimated: apiData.arr_estimated || apiData.arr_estimated_utc || null,
    pax: calendarEvent.pax || 0,
    tour_leader: calendarEvent.tour_leader || '',
    lat: apiData.lat || null,
    lng: apiData.lng || null,
    alt: apiData.alt || null,
    speed: apiData.speed || null,
    direction: apiData.dir || null,
    progress,
    delayed,
    aircraft_icao: apiData.aircraft_icao || apiData.aircraft_icao_code || null,
    aircraft_reg: apiData.reg_number || apiData.registration || null,
    duration: apiData.duration || null,
    dep_delayed: apiData.dep_delayed || 0,
    arr_delayed: apiData.arr_delayed || 0,
    arr_baggage: apiData.arr_baggage || null,
    raw_api: apiData,
    synced_at: new Date().toISOString(),
  };

  // Enrich missing fields from route lookup
  const route = lookupRoute(parsed.flightIata, calendarEvent.event_type);
  if (route) {
    if (!result.dep_iata) result.dep_iata = route.dep;
    if (!result.dep_city) result.dep_city = route.depCity;
    if (!result.dep_terminal && route.depTerminal) result.dep_terminal = route.depTerminal;
    if (!result.arr_iata) result.arr_iata = route.arr;
    if (!result.arr_city) result.arr_city = route.arrCity;
    if (!result.arr_scheduled) {
      const depTime = result.dep_scheduled || result.dep_actual || `${calendarEvent.event_date}T${(calendarEvent.jam || '00:00').replace('.', ':')}:00`;
      result.arr_scheduled = estimateArrival(depTime, route.durationMin);
    }
    if (!result.arr_estimated && result.arr_scheduled) {
      result.arr_estimated = result.arr_scheduled;
    }
  }

  return result;
}

/**
 * Format DB row → frontend FlightData shape.
 * Times from AirLabs are stored as airport-local strings (e.g. "2026-03-29 11:45").
 * We just extract HH:mm — no timezone conversion needed.
 */
function formatFlightForFrontend(row) {
  return {
    id: row.id,
    flightNumber: row.flight_iata
      ? `${row.airline_iata || ''} ${row.flight_iata.replace(/^[A-Z]{2}/, '')}`.trim()
      : '',
    airline: row.airline_name || '',
    airlineLogo: row.airline_logo || null,
    group: row.group_number || '',
    status: row.status || 'scheduled',
    depCity: row.dep_city || '',
    depCode: row.dep_iata || '',
    depTerminal: row.dep_terminal || null,
    depGate: row.dep_gate || null,
    depScheduled: extractHHmm(row.dep_scheduled) || row.dep_scheduled,
    depActual: extractHHmm(row.dep_actual) || null,
    depDate: extractDateISO(row.dep_scheduled || row.dep_actual),
    arrCity: row.arr_city || '',
    arrCode: row.arr_iata || '',
    arrTerminal: row.arr_terminal || null,
    arrGate: row.arr_gate || null,
    arrScheduled: extractHHmm(row.arr_scheduled) || row.arr_scheduled,
    arrEstimated: extractHHmm(row.arr_estimated) || null,
    pax: row.pax || 0,
    tourLeader: row.tour_leader || '',
    lat: row.lat || null,
    lng: row.lng || null,
    alt: row.alt || null,
    speed: row.speed || null,
    progress: row.progress || 0,
    delayed: row.delayed || 0,
    aircraftType: getAircraftName(row.aircraft_icao),
    aircraftReg: row.aircraft_reg || null,
    duration: row.duration || null,
    depDelayed: row.dep_delayed || 0,
    arrDelayed: row.arr_delayed || 0,
    arrBaggage: row.arr_baggage || null,
  };
}

/**
 * Should we poll this flight? Only poll keberangkatan/kepulangan within ±24h window
 * Uses WIB (UTC+7) for date calculations to match calendar event dates.
 */
function shouldPollFlight(eventDate, eventType) {
  if (eventType !== 'keberangkatan' && eventType !== 'kepulangan') return false;
  const todayStr = getWIBDateStr();
  const yesterdayStr = getWIBDateStr(new Date(Date.now() - 24*60*60*1000));
  // Only poll today and yesterday — AirLabs can't return future flight data
  return eventDate <= todayStr && eventDate >= yesterdayStr;
}

// In-memory flight cache
const flightCache = new Map();

// Cache TTL: 15 min for en-route, 4 hours for everything else
function getFlightCacheTTL(status) {
  if (status === 'en-route') return 15 * 60 * 1000;       // 15 min
  if (status === 'delayed') return 30 * 60 * 1000;        // 30 min
  if (status === 'landed') return 24 * 60 * 60 * 1000;    // 24h (truly terminal)
  if (status === 'cancelled') return 2 * 60 * 60 * 1000;  // 2h (allow re-check — might be wrong route)
  return 4 * 60 * 60 * 1000;                              // 4h default (scheduled)
}

function getCachedFlight(flightId) {
  const cached = flightCache.get(flightId);
  if (!cached) return null;
  const ttl = getFlightCacheTTL(cached.data?.status);
  if (Date.now() - cached.timestamp > ttl) {
    flightCache.delete(flightId);
    return null;
  }
  return cached.data;
}

function setCachedFlight(flightId, data) {
  flightCache.set(flightId, { data, timestamp: Date.now() });
}

// GET /api/flights/status — all flights within H-1 to H+1 window
app.get('/api/flights/status', authMiddleware, async (req, res) => {
  try {
    maybeResetQuotaCounter();

    // Use WIB dates for consistent window regardless of server timezone
    const nowMs = Date.now();
    const todayWIB = getWIBDateStr();
    const yesterdayWIB = getWIBDateStr(new Date(nowMs - 24*60*60*1000));
    const tomorrowWIB = getWIBDateStr(new Date(nowMs + 24*60*60*1000));

    const startDate = yesterdayWIB;
    const endDate = tomorrowWIB;

    // 1. Get calendar events with flight data in the ±1 day window
    let flightQuery = supabase
      .from('calendar_events')
      .select('*')
      .in('event_type', ['keberangkatan', 'kepulangan'])
      .gte('event_date', startDate)
      .lte('event_date', endDate)
      .not('pesawat', 'is', null);

    const { data: events, error: evError } = await flightQuery;

    if (evError) throw evError;
    if (!events || events.length === 0) {
      return res.json({ success: true, data: [] });
    }

    // 2a. Build departure date lookup for kepulangan events
    // For kepulangan: find the keberangkatan event with the same group_number to get departure date
    const kepulanganGroups = events
      .filter(e => e.event_type === 'kepulangan' && e.group_number)
      .map(e => e.group_number);

    let depDateByGroup = new Map(); // group_number → keberangkatan event_date
    if (kepulanganGroups.length > 0) {
      const { data: depEvents } = await supabase
        .from('calendar_events')
        .select('group_number, event_date')
        .eq('event_type', 'keberangkatan')
        .in('group_number', kepulanganGroups);
      for (const e of (depEvents || [])) {
        depDateByGroup.set(e.group_number, e.event_date);
      }
    }

    // Collect all departure dates we need jamaah for (keberangkatan dates from window + mapped from kepulangan)
    const depDatesNeeded = new Set();
    for (const event of events) {
      if (event.event_type === 'keberangkatan') {
        depDatesNeeded.add(event.event_date);
      } else if (event.event_type === 'kepulangan' && event.group_number) {
        const depDate = depDateByGroup.get(event.group_number);
        if (depDate) depDatesNeeded.add(depDate);
      }
    }

    // Fetch agent's jamaah for all relevant departure dates
    const jamaahByDate = new Map();
    if (depDatesNeeded.size > 0) {
      const { data: agentJamaah } = await supabase
        .from('jamaah')
        .select('nama, jk, wa, tgl_berangkat')
        .eq('agent_id', req.user.id)
        .in('tgl_berangkat', Array.from(depDatesNeeded));

      for (const j of (agentJamaah || [])) {
        const dk = j.tgl_berangkat?.slice(0, 10);
        if (!dk) continue;
        if (!jamaahByDate.has(dk)) jamaahByDate.set(dk, []);
        jamaahByDate.get(dk).push({ nama: j.nama, jk: j.jk || null, wa: j.wa || null });
      }
      // Sort each date's jamaah alphabetically by name
      for (const list of jamaahByDate.values()) {
        list.sort((a, b) => (a.nama || '').localeCompare(b.nama || ''));
      }
    }

    // 2b. For each event: cache → Supabase → AirLabs
    const flights = [];
    // Track which flightIds we've already fetched from cache/DB to avoid repeated queries
    const flightDataCache = new Map();

    for (const event of events) {
      const parsed = parseFlightFromCalendar(event.pesawat);
      if (!parsed) continue;

      const flightId = `${event.event_date}_${parsed.flightIata}`;
      // Unique ID per group (so multiple groups on same flight get distinct entries)
      const entryId = event.group_number ? `${flightId}_g${event.group_number}` : flightId;

      // Try to get shared flight data (from cache or DB), but only query once per flightId
      let flightBase = flightDataCache.get(flightId);
      if (flightBase === undefined) {
        flightBase = null;

        // Check in-memory cache
        const cached = getCachedFlight(flightId);
        if (cached) {
          flightBase = cached;
        } else {
          // Check Supabase
          const { data: existing } = await supabase
            .from('flight_status')
            .select('*')
            .eq('id', flightId)
            .single();

          if (existing && existing.synced_at) {
            let dateValid = true;
            if (existing.dep_scheduled) {
              const dateMatch = String(existing.dep_scheduled).match(/^(\d{4}-\d{2}-\d{2})/);
              const depDate = dateMatch ? dateMatch[1] : null;
              if (depDate && depDate !== event.event_date) {
                dateValid = false;
                await supabase.from('flight_status').delete().eq('id', flightId);
              }
            }
            if (dateValid) {
              const formatted = formatFlightForFrontend(existing);
              setCachedFlight(flightId, formatted);
              flightBase = formatted;
            }
          } else if (existing) {
            flightBase = formatFlightForFrontend(existing);
          }
        }
        flightDataCache.set(flightId, flightBase);
      }

      // Build the per-group entry by overlaying this event's group/pax/TL
      if (flightBase) {
        const entry = {
          ...flightBase,
          id: entryId,
          group: event.group_number || '',
          pax: event.pax || 0,
          tourLeader: event.tour_leader || '',
          jamaah: jamaahByDate.get(
            event.event_type === 'keberangkatan'
              ? event.event_date
              : depDateByGroup.get(event.group_number) || ''
          ) || [],
        };

        // Override stale status if departure time has clearly passed
        // Covers 'scheduled' (never updated) and 'cancelled' (might be wrong route data)
        if (['scheduled', 'cancelled'].includes(entry.status) && event.event_date <= todayWIB && entry.depScheduled) {
          const route = lookupRoute(parsed.flightIata, event.event_type);
          const depAirport = entry.depCode || route?.dep || (event.event_type === 'kepulangan' ? 'JED' : 'CGK');
          const tzOffset = AIRPORT_TZ_OFFSETS[depAirport] || 7;
          const nowUTC = Date.now();
          const depHHmm = entry.depScheduled; // "HH:mm" string from formatFlightForFrontend
          const [hh, mm] = depHHmm.split(':').map(Number);
          if (!isNaN(hh) && !isNaN(mm)) {
            const depDateObj = new Date(`${event.event_date}T00:00:00Z`);
            const depUTC = depDateObj.getTime() + (hh * 60 + mm) * 60 * 1000 - tzOffset * 60 * 60 * 1000;
            const durationMin = route?.durationMin || 540;
            const arrUTC = depUTC + durationMin * 60 * 1000;
            if (nowUTC >= arrUTC) {
              entry.status = 'landed';
              entry.progress = 100;
            } else if (nowUTC >= depUTC) {
              entry.status = 'en-route';
              const totalDuration = arrUTC - depUTC;
              const elapsed = nowUTC - depUTC;
              entry.progress = Math.min(99, Math.max(1, Math.round((elapsed / totalDuration) * 100)));
            }
          }
        }

        // Attach calendar reference times if they differ significantly from AirLabs
        if (event.jam && entry.depScheduled) {
          const calArrLocal = (event.jam || '00:00').replace('.', ':');
          const calRoute = lookupRoute(parsed.flightIata, event.event_type);
          const calArrAirport = calRoute?.arr || (event.event_type === 'kepulangan' ? 'CGK' : 'JED');
          const calDepAirport = calRoute?.dep || (event.event_type === 'kepulangan' ? 'JED' : 'CGK');
          const calArrTZ = AIRPORT_TZ_OFFSETS[calArrAirport] || 7;
          const calDepTZ = AIRPORT_TZ_OFFSETS[calDepAirport] || 7;
          const calDurationMin = calRoute?.durationMin || 540;

          const [calArrH, calArrM] = calArrLocal.split(':').map(Number);
          if (!isNaN(calArrH) && !isNaN(calArrM)) {
            const calArrDateObj = new Date(`${event.event_date}T00:00:00Z`);
            const calArrUTC = calArrDateObj.getTime() + (calArrH * 60 + calArrM) * 60 * 1000 - calArrTZ * 60 * 60 * 1000;
            const calDepUTC = calArrUTC - calDurationMin * 60 * 1000;
            const calDepLocalMs = calDepUTC + calDepTZ * 60 * 60 * 1000;
            const calDepD = new Date(calDepLocalMs);
            const calDepLocal = `${String(calDepD.getUTCHours()).padStart(2, '0')}:${String(calDepD.getUTCMinutes()).padStart(2, '0')}`;

            const depDiff = Math.abs(parseHHmmToMinutes(entry.depScheduled) - parseHHmmToMinutes(calDepLocal));
            const arrDiff = Math.abs(parseHHmmToMinutes(entry.arrScheduled) - parseHHmmToMinutes(calArrLocal));

            if (depDiff >= 15 || arrDiff >= 15) {
              entry.calendarDepTime = calDepLocal;
              entry.calendarArrTime = calArrLocal;
            }
          }
        }

        flights.push(entry);
      } else {
        // Fallback: enrich from calendar + route lookup
        const route = lookupRoute(parsed.flightIata, event.event_type);
        // event.jam is the ARRIVAL time at **arr airport** local timezone
        const arrLocal = (event.jam || '00:00').replace('.', ':');
        const arrAirport = route?.arr || (event.event_type === 'kepulangan' ? 'CGK' : 'JED');
        const depAirport = route?.dep || (event.event_type === 'kepulangan' ? 'JED' : 'CGK');
        const arrTZ = AIRPORT_TZ_OFFSETS[arrAirport] || 7;
        const depTZ = AIRPORT_TZ_OFFSETS[depAirport] || 7;
        const durationMin = route?.durationMin || 540;

        // Calculate departure time from arrival time:
        // arrLocal is HH:mm in arrival airport's timezone
        const [arrH, arrM] = arrLocal.split(':').map(Number);
        // Arrival in UTC
        const arrDateObj = new Date(`${event.event_date}T00:00:00Z`);
        const arrUTC = arrDateObj.getTime() + (arrH * 60 + arrM) * 60 * 1000 - arrTZ * 60 * 60 * 1000;
        // Departure in UTC = arrival UTC - duration
        const depUTC = arrUTC - durationMin * 60 * 1000;
        // Convert departure UTC to departure airport local HH:mm
        const depLocalMs = depUTC + depTZ * 60 * 60 * 1000;
        const depD = new Date(depLocalMs);
        const depHH = String(depD.getUTCHours()).padStart(2, '0');
        const depMM = String(depD.getUTCMinutes()).padStart(2, '0');
        const depLocal = `${depHH}:${depMM}`;

        const todayWIBStr = getWIBDateStr();
        const nowUTCFb = Date.now();
        let fallbackStatus = 'scheduled';
        let fallbackProgress = 0;
        if (event.event_date < todayWIBStr) {
          fallbackStatus = 'landed';
          fallbackProgress = 100;
        } else if (event.event_date <= todayWIBStr) {
          // Today's flight: check if departure time has passed
          if (nowUTCFb >= arrUTC) {
            fallbackStatus = 'landed';
            fallbackProgress = 100;
          } else if (nowUTCFb >= depUTC) {
            fallbackStatus = 'en-route';
            const totalDuration = arrUTC - depUTC;
            const elapsed = nowUTCFb - depUTC;
            fallbackProgress = Math.min(99, Math.max(1, Math.round((elapsed / totalDuration) * 100)));
          }
        }

        flights.push({
          id: entryId,
          flightNumber: `${parsed.airlineCode} ${parsed.flightNumber}`,
          airline: parsed.airline,
          airlineLogo: null,
          group: event.group_number || '',
          status: fallbackStatus,
          depCity: route?.depCity || '',
          depCode: route?.dep || '',
          depTerminal: route?.depTerminal || null, depGate: null,
          depScheduled: depLocal,
          depActual: null,
          depDate: new Date(depUTC).toISOString(),
          arrCity: route?.arrCity || '',
          arrCode: route?.arr || '',
          arrTerminal: null, arrGate: null,
          arrScheduled: arrLocal,
          arrEstimated: arrLocal,
          pax: event.pax || 0,
          tourLeader: event.tour_leader || '',
          jamaah: jamaahByDate.get(
            event.event_type === 'keberangkatan'
              ? event.event_date
              : depDateByGroup.get(event.group_number) || ''
          ) || [],
          lat: null, lng: null, alt: null, speed: null,
          progress: fallbackProgress,
          delayed: 0,
          aircraftType: null, aircraftReg: null,
          duration: durationMin,
          depDelayed: 0, arrDelayed: 0, arrBaggage: null,
        });
      }
    }

    // Sort: en-route first, then delayed, scheduled, landed, cancelled
    // Sort: newest date first, then by status priority within same date
    const statusOrder = { 'en-route': 0, 'delayed': 1, 'scheduled': 2, 'landed': 3, 'cancelled': 4 };
    flights.sort((a, b) => {
      const dateA = a.depScheduled || a.id;
      const dateB = b.depScheduled || b.id;
      // Compare dates descending (newest first)
      if (dateA > dateB) return -1;
      if (dateA < dateB) return 1;
      // Same date: sort by status
      return (statusOrder[a.status] ?? 5) - (statusOrder[b.status] ?? 5);
    });

    // Filter out landed/cancelled flights older than 6 hours
    const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
    const filtered = flights.filter(f => {
      if (f.status !== 'landed' && f.status !== 'cancelled') return true;
      // Calculate arrival time in UTC to determine how long ago the flight ended
      const flightDate = f.id?.substring(0, 10);
      if (!flightDate) return false;
      const arrHHmm = f.arrEstimated || f.arrScheduled;
      if (arrHHmm && /^\d{2}:\d{2}$/.test(arrHHmm)) {
        const [h, m] = arrHHmm.split(':').map(Number);
        const arrAirport = f.arrCode || 'CGK';
        const arrTZ = AIRPORT_TZ_OFFSETS[arrAirport] || 7;
        const arrDateObj = new Date(`${flightDate}T00:00:00Z`);
        const arrUTC = arrDateObj.getTime() + (h * 60 + m) * 60 * 1000 - arrTZ * 60 * 60 * 1000;
        return (nowMs - arrUTC) < SIX_HOURS_MS;
      }
      // No arrival time — fall back to date check
      return flightDate >= todayWIB;
    });

    res.json({ success: true, data: filtered });
  } catch (err) {
    console.error('[Flights] Error:', err);
    res.status(500).json({ error: 'Gagal memuat data penerbangan' });
  }
});

// GET /api/flights/:flightId — single flight detail (cache-first, no forced API call)
app.get('/api/flights/:flightId', authMiddleware, async (req, res) => {
  try {
    const { flightId } = req.params;

    // Parse flightId: "2026-03-28_SV827"
    const underscoreIdx = flightId.indexOf('_');
    if (underscoreIdx === -1) {
      return res.status(400).json({ error: 'Invalid flight ID' });
    }
    const eventDate = flightId.substring(0, underscoreIdx);
    const flightIata = flightId.substring(underscoreIdx + 1);
    if (!eventDate || !flightIata) {
      return res.status(400).json({ error: 'Invalid flight ID' });
    }

    // 1. Check in-memory cache first
    const cached = getCachedFlight(flightId);
    if (cached) {
      return res.json({ success: true, data: cached });
    }

    // 2. Check Supabase
    const { data: existing } = await supabase
      .from('flight_status')
      .select('*')
      .eq('id', flightId)
      .single();

    if (existing) {
      const formatted = formatFlightForFrontend(existing);
      setCachedFlight(flightId, formatted);
      return res.json({ success: true, data: formatted });
    }

    res.status(404).json({ error: 'Flight not found' });
  } catch (err) {
    console.error('[Flights] Detail error:', err);
    res.status(500).json({ error: 'Gagal memuat detail penerbangan' });
  }
});

// ──────────────────────────────────────────────
// Flight Status: Polling Helpers & Notifications
// ──────────────────────────────────────────────

function getPollingIntervalMs(status, hoursUntilDeparture) {
  if (status === 'landed' || status === 'cancelled') return null;
  if (status === 'en-route') return 5 * 60 * 1000;
  if (status === 'delayed') return 15 * 60 * 1000;
  if (hoursUntilDeparture <= 3) return 15 * 60 * 1000;
  return 30 * 60 * 1000;
}

function getHoursUntilDeparture(event) {
  const depTime = new Date(`${event.event_date}T${(event.jam || '00:00').replace('.', ':')}:00`);
  return (depTime - new Date()) / (1000 * 60 * 60);
}

function formatTimeWIB(isoString) {
  if (!isoString) return '—';
  const d = new Date(isoString);
  return d.toLocaleTimeString('id-ID', {
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Jakarta',
  }) + ' WIB';
}

// Anti-duplicate notification state
const flightNotifSent = new Map();

function shouldSendFlightNotif(flightId, changeType) {
  const key = `${flightId}_${changeType}`;
  const lastSent = flightNotifSent.get(key);
  if (lastSent && Date.now() - lastSent < 30 * 60 * 1000) return false;
  return true;
}

function markFlightNotifSent(flightId, changeType) {
  flightNotifSent.set(`${flightId}_${changeType}`, Date.now());
  // Cleanup entries > 24h
  for (const [key, ts] of flightNotifSent) {
    if (Date.now() - ts > 24 * 60 * 60 * 1000) flightNotifSent.delete(key);
  }
}

async function sendTelegramMessageDirect(chatId, text, options = {}) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || !chatId) return;
  try {
    const body = {
      chat_id: chatId, text,
      parse_mode: 'HTML', disable_web_page_preview: true,
    };
    if (options.reply_markup) body.reply_markup = options.reply_markup;
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (err) {
    console.error(`[FlightNotif] Telegram send error:`, err.message);
  }
}

const TELEGRAM_APP_BASE_URL = 'https://alhijaz.co';

function buildTelegramUrlKeyboard(rows) {
  const inline_keyboard = rows
    .map(row => row
      .filter(button => button?.text && button?.url)
      .map(button => ({ text: button.text, url: button.url }))
    )
    .filter(row => row.length > 0);

  return inline_keyboard.length > 0 ? { inline_keyboard } : undefined;
}

async function answerTelegramCallbackQuery(callbackQueryId, text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || !callbackQueryId) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callback_query_id: callbackQueryId, text: text || '' }),
    });
  } catch (err) {
    console.error(`[Telegram] answerCallbackQuery error:`, err.message);
  }
}

async function editTelegramMessageText(chatId, messageId, text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || !chatId || !messageId) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/editMessageText`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId, message_id: messageId, text,
        parse_mode: 'HTML', disable_web_page_preview: true,
      }),
    });
  } catch (err) {
    console.error(`[Telegram] editMessageText error:`, err.message);
  }
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function handleTelegramCallbackQuery(cbq) {
  const cbqId = cbq.id;
  const data = cbq.data || '';
  const fromChatId = cbq.message?.chat?.id?.toString();
  const messageId = cbq.message?.message_id;
  const originalText = cbq.message?.text || '';

  const match = data.match(/^agent_(approve|reject):(.+)$/);
  if (!match || !fromChatId || !messageId) {
    await answerTelegramCallbackQuery(cbqId, '');
    return;
  }
  const action = match[1];
  const targetSlug = match[2].toLowerCase();

  const { data: admin } = await supabase
    .from('agents')
    .select('id, name, role')
    .eq('telegram_chat_id', fromChatId)
    .single();

  if (!admin || admin.role !== 'admin') {
    await answerTelegramCallbackQuery(cbqId, 'Tidak diizinkan.');
    return;
  }

  const escapedOriginal = escapeHtml(originalText);

  const target = await getAgentBySlug(targetSlug);
  if (!target) {
    await answerTelegramCallbackQuery(cbqId, 'Agent tidak ditemukan.');
    await editTelegramMessageText(fromChatId, messageId, `${escapedOriginal}\n\nℹ️ <i>Agent tidak ditemukan.</i>`);
    return;
  }

  // Approve → update to active; reject → delete row so data isn't retained.
  const query = action === 'approve'
    ? supabase.from('agents').update({ status: 'active' }).eq('id', target.id).eq('status', 'pending').select('slug').single()
    : supabase.from('agents').delete().eq('id', target.id).eq('status', 'pending').select('slug').single();
  const { data: updated, error: updateErr } = await query;

  if (updateErr || !updated) {
    await answerTelegramCallbackQuery(cbqId, 'Sudah diproses admin lain.');
    await editTelegramMessageText(fromChatId, messageId, `${escapedOriginal}\n\nℹ️ <i>Sudah diproses.</i>`);
    return;
  }

  invalidateAgentCache();
  if (action === 'approve') triggerOgRegen(updated.slug);

  const waktu = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' });
  const adminName = escapeHtml(admin.name || 'admin');
  const footer = action === 'approve'
    ? `\n\n✅ <i>Disetujui oleh ${adminName} • ${waktu} WIB</i>`
    : `\n\n❌ <i>Ditolak oleh ${adminName} • ${waktu} WIB</i>`;
  await editTelegramMessageText(fromChatId, messageId, escapedOriginal + footer);
  await answerTelegramCallbackQuery(cbqId, action === 'approve' ? 'Agent disetujui.' : 'Agent ditolak.');
}

async function detectAndNotifyChanges(oldData, newData, calendarEvent) {
  const changes = [];

  if (oldData.status !== newData.status) {
    changes.push({ type: 'status_change', from: oldData.status, to: newData.status });
  }
  if (newData.delayed > 0 && newData.delayed !== oldData.delayed
      && newData.status !== 'landed' && newData.status !== 'en-route') {
    changes.push({ type: 'delay', minutes: newData.delayed, previous: oldData.delayed || 0 });
  }
  if (newData.dep_gate && newData.dep_gate !== oldData.dep_gate) {
    changes.push({ type: 'gate_change', field: 'departure', from: oldData.dep_gate, to: newData.dep_gate });
  }
  if (newData.arr_gate && newData.arr_gate !== oldData.arr_gate) {
    changes.push({ type: 'gate_change', field: 'arrival', from: oldData.arr_gate, to: newData.arr_gate });
  }
  if (newData.dep_terminal && newData.dep_terminal !== oldData.dep_terminal) {
    changes.push({ type: 'terminal_change', field: 'departure', from: oldData.dep_terminal, to: newData.dep_terminal });
  }
  if (newData.status === 'cancelled' && oldData.status !== 'cancelled') {
    changes.push({ type: 'cancelled' });
  }

  if (changes.length === 0) return;

  // Build notification for each change (with anti-duplicate check)
  for (const change of changes) {
    const changeKey = change.type === 'delay'
      ? `delay_${Math.floor(change.minutes / 30) * 30}`
      : change.type === 'status_change' ? `status_${change.to}` : change.type;

    if (!shouldSendFlightNotif(newData.id, changeKey)) continue;

    const message = buildFlightNotifMessage(newData, calendarEvent, change);
    if (!message) continue;

    // Send to all agents with Telegram connected
    const { data: agents } = await supabase
      .from('agents')
      .select('slug, telegram_chat_id, notification_prefs')
      .not('telegram_chat_id', 'is', null);

    if (agents) {
      const replyMarkup = buildTelegramUrlKeyboard([
        [
          { text: '✈️ Buka Dashboard', url: `${TELEGRAM_APP_BASE_URL}/dashboard` },
          { text: '👥 Buka Jamaah', url: `${TELEGRAM_APP_BASE_URL}/dashboard/jamaah` },
        ],
      ]);

      for (const agent of agents) {
        const prefs = agent.notification_prefs || {};
        if (prefs.flight_status === false) continue;
        await sendTelegramMessageDirect(agent.telegram_chat_id, message, {
          reply_markup: replyMarkup,
        });
      }
    }

    markFlightNotifSent(newData.id, changeKey);
    console.log(`[FlightNotif] Sent ${changeKey} for ${newData.id}`);
  }
}

function buildFlightNotifMessage(flight, calendarEvent, change) {
  const flightLabel = `${flight.airline_name || ''} ${flight.flight_iata || ''}`.trim();
  const route = `${flight.dep_iata || '?'} → ${flight.arr_iata || '?'}`;
  const groupLabel = calendarEvent.group_number ? `Grup ${calendarEvent.group_number}` : '';
  const paxLine = `Jamaah: <b>${calendarEvent.pax || '?'} orang</b>`;
  const tlLine = calendarEvent.tour_leader ? `\nTL: ${calendarEvent.tour_leader}` : '';
  const header = `<b>${flightLabel}</b>\n${route}${groupLabel ? ` • ${groupLabel}` : ''}\n─────────────────\n`;

  if (change.type === 'cancelled') {
    return `🚫 <b>PENERBANGAN DIBATALKAN</b>\n\n${header}Penerbangan ini telah <b>dibatalkan</b>. Segera hubungi jamaah dan koordinasi perubahan jadwal.\n${paxLine}${tlLine}`;
  }

  if (change.type === 'delay') {
    const mins = change.minutes;
    const hours = Math.floor(mins / 60);
    const rem = mins % 60;
    const delayStr = hours > 0 ? `${hours} jam${rem > 0 ? ` ${rem} menit` : ''}` : `${mins} menit`;
    const emoji = mins >= 60 ? '🔴' : '🟡';
    const label = mins >= 60 ? 'DELAY SIGNIFIKAN' : 'DELAY PENERBANGAN';

    let timeInfo = '';
    if (flight.dep_scheduled) {
      const depScheduledDate = new Date(flight.dep_scheduled);
      const estimatedDepDate = new Date(depScheduledDate.getTime() + mins * 60 * 1000);
      timeInfo = `Jadwal: ${formatTimeWIB(flight.dep_scheduled)}\nEstimasi: <b>${formatTimeWIB(estimatedDepDate.toISOString())}</b>\n`;
    } else if (flight.arr_scheduled && flight.arr_estimated) {
      timeInfo = `Jadwal tiba: ${formatTimeWIB(flight.arr_scheduled)}\nEstimasi tiba: <b>${formatTimeWIB(flight.arr_estimated)}</b>\n`;
    }

    return `${emoji} <b>${label}</b>\n\n${header}Delay: <b>${delayStr}</b>\n${timeInfo}\n${paxLine}${tlLine}`;
  }

  if (change.type === 'gate_change' || change.type === 'terminal_change') {
    const label = change.type === 'gate_change' ? 'Gate' : 'Terminal';
    const fieldLabel = change.field === 'departure' ? 'Keberangkatan' : 'Kedatangan';
    return `🔄 <b>PERUBAHAN GATE/TERMINAL</b>\n\n${header}${fieldLabel} ${label}: ${change.from || '—'} → <b>${change.to}</b>\n\n${paxLine}`;
  }

  if (change.type === 'status_change') {
    if (change.to === 'landed') {
      return `✅ <b>PESAWAT MENDARAT</b>\n\n${header}Pesawat telah mendarat dengan selamat.\n${paxLine}${tlLine}`;
    }
    if (change.to === 'en-route') {
      const eta = flight.arr_estimated ? `Estimasi tiba: <b>${formatTimeWIB(flight.arr_estimated)}</b>\n` : '';
      return `✈️ <b>PESAWAT TAKE OFF</b>\n\n${header}Pesawat telah lepas landas.\n${eta}${paxLine}${tlLine}`;
    }
    const statusLabels = { 'en-route': 'Dalam Penerbangan ✈️', 'landed': 'Mendarat ✅', 'scheduled': 'Terjadwal', 'delayed': 'Delay ⚠️' };
    return `ℹ️ <b>UPDATE PENERBANGAN</b>\n\n${header}Status: ${statusLabels[change.from] || change.from} → <b>${statusLabels[change.to] || change.to}</b>`;
  }

  return null;
}

// Background flight poller — only polls en-route or departing-within-3h flights
async function pollActiveFlights() {
  maybeResetQuotaCounter();

  const nowMs = Date.now();
  const startDate = getWIBDateStr(new Date(nowMs - 24*60*60*1000));
  const endDate = getWIBDateStr(new Date(nowMs + 24*60*60*1000));

  const { data: events } = await supabase
    .from('calendar_events')
    .select('*')
    .in('event_type', ['keberangkatan', 'kepulangan'])
    .gte('event_date', startDate)
    .lte('event_date', endDate)
    .not('pesawat', 'is', null);

  if (!events || events.length === 0) {
    console.log('[FlightCron] No flights in window, skipping');
    return;
  }
  if (!canMakeAirLabsRequest()) {
    console.warn('[FlightCron] Monthly quota reached, skipping poll');
    return;
  }

  let pollCount = 0;
  const MAX_POLLS_PER_RUN = 5;

  for (const event of events) {
    if (pollCount >= MAX_POLLS_PER_RUN) break;

    const parsed = parseFlightFromCalendar(event.pesawat);
    if (!parsed) continue;

    const flightId = `${event.event_date}_${parsed.flightIata}`;
    if (!shouldPollFlight(event.event_date, event.event_type)) continue;

    const { data: existing } = await supabase
      .from('flight_status').select('*').eq('id', flightId).single();

    // Skip landed flights (truly terminal)
    if (existing && existing.status === 'landed') continue;
    // Re-poll cancelled flights if event is today — cancellation might be from wrong route
    if (existing && existing.status === 'cancelled') {
      if (event.event_date !== getWIBDateStr()) continue;
      if (existing.synced_at) {
        const hoursSinceSync = (Date.now() - new Date(existing.synced_at).getTime()) / (1000 * 60 * 60);
        if (hoursSinceSync < 2) continue;
      }
      console.log(`[FlightCron] Re-polling cancelled flight ${flightId} (event is today)`);
    }

    // Only poll if: (a) en-route, (b) departing within 3 hours, or (c) never synced
    const hoursUntilDep = getHoursUntilDeparture(event);
    const isEnRoute = existing?.status === 'en-route';
    const isDepartingSoon = hoursUntilDep <= 3 && hoursUntilDep >= -12; // within 3h before to 12h after
    const neverSynced = !existing;

    if (!isEnRoute && !isDepartingSoon && !neverSynced) {
      continue; // Skip flights that aren't urgent
    }

    // Respect polling interval based on status
    if (existing && existing.synced_at) {
      const interval = getPollingIntervalMs(existing.status, hoursUntilDep);
      if (interval) {
        const timeSinceSync = Date.now() - new Date(existing.synced_at).getTime();
        if (timeSinceSync < interval) continue;
      }
    }

    const apiData = await fetchFlightFromAirLabs(parsed.flightIata);
    pollCount++;

    if (!apiData) continue;

    const mapped = mapAirLabsToFlightStatus(apiData, event);
    if (!mapped) continue;

    if (existing) {
      try {
        await detectAndNotifyChanges(existing, mapped, event);
      } catch (notifErr) {
        console.error('[FlightNotif] Error:', notifErr.message);
      }
    }

    await supabase.from('flight_status').upsert(mapped, { onConflict: 'id' });
    setCachedFlight(flightId, formatFlightForFrontend(mapped));
    console.log(`[FlightCron] Updated ${flightId}: ${mapped.status}${mapped.delayed > 0 ? ` (delay ${mapped.delayed}m)` : ''}`);
  }

  if (pollCount > 0) {
    console.log(`[FlightCron] Polled ${pollCount} flights. Monthly usage: ${airLabsRequestCount}/${AIRLABS_MONTHLY_LIMIT}`);
  } else {
    console.log(`[FlightCron] No urgent flights to poll. Monthly usage: ${airLabsRequestCount}/${AIRLABS_MONTHLY_LIMIT}`);
  }
}

function escapePostgrestFilterValue(value) {
  return String(value || '')
    .replace(/[,()*%]/g, (c) => '\\' + c)
    .slice(0, 100);
}

function dateOnly(date) {
  return date.toISOString().split('T')[0];
}

function addDaysDateOnly(baseDate, days) {
  const d = new Date(baseDate);
  d.setDate(d.getDate() + days);
  return dateOnly(d);
}

function objectValues(obj) {
  if (!obj || typeof obj !== 'object') return [];
  return Object.values(obj);
}

function hasText(value) {
  return String(value || '').trim().length > 0;
}

function isUmrohPasporMissing(row) {
  const doc = row.dokumen && typeof row.dokumen === 'object' ? row.dokumen : {};
  return !hasText(row.no_paspor) && doc.paspor !== true && doc.passport !== true;
}

function isUmrohPasporExpiring(row) {
  if (!row.paspor_expired || !row.tgl_berangkat) return false;
  const exp = new Date(row.paspor_expired);
  const dep = new Date(row.tgl_berangkat);
  if (Number.isNaN(exp.getTime()) || Number.isNaN(dep.getTime())) return false;
  const validUntil = new Date(dep);
  validUntil.setMonth(validUntil.getMonth() + 6);
  return exp <= validUntil;
}

function isUmrohDocumentsIncomplete(row) {
  const values = objectValues(row.dokumen);
  return isUmrohPasporMissing(row) || isUmrohPasporExpiring(row) || values.length === 0 || values.some(v => !Boolean(v));
}

function isUmrohEquipmentPending(row) {
  const values = objectValues(row.perlengkapan);
  return values.length === 0 || !values.some(v => Boolean(v));
}

function isUmrohEquipmentIncomplete(row) {
  const values = objectValues(row.perlengkapan);
  return values.length === 0 || values.some(v => !Boolean(v));
}

function filterUmrohRowsInMemory(rows, {
  documentFilter = '',
  equipmentFilter = '',
  notesFilter = '',
  packageFilter = '',
  scheduleMap = new Map(),
} = {}) {
  const packageNeedle = String(packageFilter || '').trim().toLowerCase();
  return (rows || []).filter(row => {
    switch (documentFilter) {
      case 'paspor_missing':
        if (!isUmrohPasporMissing(row)) return false;
        break;
      case 'paspor_expiring':
        if (!isUmrohPasporExpiring(row)) return false;
        break;
      case 'documents_incomplete':
        if (!isUmrohDocumentsIncomplete(row)) return false;
        break;
    }

    switch (equipmentFilter) {
      case 'equipment_pending':
        if (!isUmrohEquipmentPending(row)) return false;
        break;
      case 'equipment_incomplete':
        if (!isUmrohEquipmentIncomplete(row)) return false;
        break;
    }

    switch (notesFilter) {
      case 'has_notes':
        if (!hasText(row.notes)) return false;
        break;
      case 'no_notes':
        if (hasText(row.notes)) return false;
        break;
    }

    if (packageNeedle) {
      const scheduleName = scheduleMap.get(row.raw_data?.id_jadwal) || '';
      const haystack = `${row.paket || ''} ${scheduleName}`.toLowerCase();
      if (!haystack.includes(packageNeedle)) return false;
    }

  return true;
  });
}

async function getCachedUmrohPernyataanJmIds(agentId, rows) {
  const jmIds = [...new Set((rows || []).map(r => r?.jm_id).filter(Boolean))];
  if (!agentId || jmIds.length === 0) return new Set();

  const { data, error } = await supabase
    .from('jamaah_document_cache')
    .select('jm_id')
    .eq('agent_id', agentId)
    .eq('document_type', JAMAAH_DOCUMENT_TYPES.UMROH_PERNYATAAN)
    .in('jm_id', jmIds);

  if (error) {
    console.warn('[jamaah] cached surat pernyataan lookup failed:', error.message);
    return new Set();
  }

  return new Set((data || []).map(row => row.jm_id).filter(Boolean));
}

// Jamaah list: read from Supabase with filters, search, pagination, sorting
app.get('/api/laporan/jamaah', authMiddleware, async (req, res) => {
  const {
    hijriahYear,
    status,   // 'belum' | 'berangkat'
    payment_status = '',
    departure_window = '',
    document_filter = '',
    equipment_filter = '',
    notes_filter = '',
    package_filter = '',
    search,
    sort,     // 'nama' | 'sisa_desc' | 'berangkat' | 'terbaru'
    page = '1',
    limit = '20',
  } = req.query;

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 20));
  const offset = (pageNum - 1) * limitNum;

  // Default sort depends on filter
  const effectiveSort = sort || (status === 'belum' || status === 'berangkat' ? 'berangkat' : 'terbaru');

  // Build query — fetch ALL matching rows (no range) so we can do group-aware
  // pagination in-process: each belum-DP id_umroh counts as 1 unit regardless
  // of member count. Sorting still happens in Supabase.
  const MIN_HIJRIAH_YEAR = '1447';
  const berangkatCutoff = new Date();
  berangkatCutoff.setDate(berangkatCutoff.getDate() + 10);
  const cutoffStr = berangkatCutoff.toISOString().split('T')[0];
  const todayStr = new Date().toISOString().split('T')[0];

  let query = supabase
    .from('jamaah')
    .select('*')
    .eq('agent_id', req.user.id);

  if (effectiveSort === 'sisa_desc') {
    query = query.order('sisa', { ascending: false });
  } else if (effectiveSort === 'berangkat') {
    query = query.order('tgl_berangkat', { ascending: true, nullsFirst: false });
  } else if (effectiveSort === 'terbaru') {
    query = query.order('tgl_daftar', { ascending: false, nullsFirst: false })
                 .order('synced_at', { ascending: false });
  } else {
    query = query.order('nama', { ascending: true });
  }
  // Secondary sort keeps group members adjacent in the result set.
  query = query.order('id_umroh', { ascending: true }).order('jm_id', { ascending: true });

  if (hijriahYear) {
    query = query.eq('hijriah_year', hijriahYear);
  } else {
    query = query.gte('hijriah_year', MIN_HIJRIAH_YEAR);
  }

  if (status === 'belum') {
    query = query.gt('sisa', 0);
  } else if (status === 'berangkat') {
    query = query.gte('tgl_berangkat', todayStr).lte('tgl_berangkat', cutoffStr);
  }

  switch (payment_status) {
    case 'belum_dp':
      query = query.gt('sisa', 0).eq('bayar', 0);
      break;
    case 'belum_lunas':
      query = query.gt('sisa', 0);
      break;
    case 'lunas':
      query = query.or('sisa.eq.0,sisa.is.null');
      break;
    case 'lebih_bayar':
      query = query.lt('sisa', 0);
      break;
  }

  switch (departure_window) {
    case '30':
      query = query.gte('tgl_berangkat', todayStr).lte('tgl_berangkat', addDaysDateOnly(new Date(), 30));
      break;
    case '60':
      query = query.gte('tgl_berangkat', todayStr).lte('tgl_berangkat', addDaysDateOnly(new Date(), 60));
      break;
    case '90':
      query = query.gte('tgl_berangkat', todayStr).lte('tgl_berangkat', addDaysDateOnly(new Date(), 90));
      break;
    case 'departed':
      query = query.lt('tgl_berangkat', todayStr);
      break;
  }

  if (search) {
    // Escape PostgREST .or() filter metacharacters to prevent filter injection.
    const safeSearch = escapePostgrestFilterValue(search);
    query = query.or(`nama.ilike.%${safeSearch}%,id_umroh.ilike.%${safeSearch}%,wa.ilike.%${safeSearch}%`);
  }

  // Supabase default row cap is 1000 — raise ceiling to 5000 for large agents.
  query = query.range(0, 4999);
  const { data: allRows, error } = await query;

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  const scheduleMap = await getScheduleMap();
  const filteredRows = filterUmrohRowsInMemory(allRows || [], {
    documentFilter: document_filter,
    equipmentFilter: equipment_filter,
    notesFilter: notes_filter,
    packageFilter: package_filter,
    scheduleMap,
  });

  // Collapse belum-DP rows with the same id_umroh into a single "unit" for
  // pagination purposes. Other rows remain 1-unit each.
  const isBelumDP = (r) => (r.sisa || 0) > 0 && (r.bayar || 0) === 0;
  const groupFirstIdx = new Map();
  const groupMembers = new Map();
  const units = []; // each unit = { kind: 'group'|'solo', members: Row[] }
  filteredRows.forEach((r) => {
    if (isBelumDP(r) && r.id_umroh) {
      if (!groupFirstIdx.has(r.id_umroh)) {
        groupFirstIdx.set(r.id_umroh, units.length);
        const members = [r];
        groupMembers.set(r.id_umroh, members);
        units.push({ kind: 'group', members });
      } else {
        groupMembers.get(r.id_umroh).push(r);
      }
    } else {
      units.push({ kind: 'solo', members: [r] });
    }
  });

  const totalUnits = units.length;
  const pageUnits = units.slice(offset, offset + limitNum);
  const data = pageUnits.flatMap(u => u.members);
  const count = totalUnits;
  const cachedPernyataanJmIds = await getCachedUmrohPernyataanJmIds(req.user.id, data);

  // Helper: apply year filter to count queries
  const applyYearFilter = (q) => hijriahYear ? q.eq('hijriah_year', hijriahYear) : q.gte('hijriah_year', MIN_HIJRIAH_YEAR);

  // Run independent reads in parallel: the counts hit Supabase but don't
  // depend on each other.
  const [
    syncRes,
    totalRes,
    belumRes,
    berangkatRes,
    piutangRes,
  ] = await Promise.all([
    supabase.from('agents').select('last_jamaah_sync_at').eq('id', req.user.id).maybeSingle(),
    applyYearFilter(supabase.from('jamaah').select('*', { count: 'exact', head: true }).eq('agent_id', req.user.id)),
    applyYearFilter(supabase.from('jamaah').select('*', { count: 'exact', head: true }).eq('agent_id', req.user.id).gt('sisa', 0)),
    applyYearFilter(supabase.from('jamaah').select('*', { count: 'exact', head: true }).eq('agent_id', req.user.id).gte('tgl_berangkat', todayStr).lte('tgl_berangkat', cutoffStr)),
    applyYearFilter(supabase.from('jamaah').select('sisa').eq('agent_id', req.user.id).gt('sisa', 0)),
  ]);

  const enrichedItems = data.map(r => ({
    ...r,
    dokumen: cachedPernyataanJmIds.has(r.jm_id)
      ? { ...plainObjectOrEmpty(r.dokumen), pernyataan: true }
      : r.dokumen,
    jadwal_nama: scheduleMap.get(r.raw_data?.id_jadwal) || null,
  }));

  const syncData = syncRes.data;
  const totalCount = totalRes.count;
  const belumCount = belumRes.count;
  const berangkatCount = berangkatRes.count;
  const piutang = (piutangRes.data || []).reduce((s, r) => s + (r.sisa || 0), 0);

  res.json({
    success: true,
    data: {
      items: enrichedItems,
      total: count || 0,
      page: pageNum,
      totalPages: Math.ceil((count || 0) / limitNum),
      lastSync: syncData?.last_jamaah_sync_at || null,
      counts: {
        semua: totalCount || 0,
        belumLunas: belumCount || 0,
        berangkat: berangkatCount || 0,
      },
      piutang,
    },
  });
});

// Jamaah note: create/update/clear note for a specific jamaah
app.post('/api/laporan/jamaah/note', authMiddleware, async (req, res) => {
  try {
    const agentId = req.user.id;
    const { id_umroh, nama, notes } = req.body;

    if (!id_umroh || !nama) {
      return res.status(400).json({ error: 'id_umroh and nama are required' });
    }

    const updateData = (!notes || notes.trim() === '')
      ? { notes: null, notes_updated_at: null }
      : { notes: notes.trim(), notes_updated_at: new Date().toISOString() };

    const { error } = await supabase
      .from('jamaah')
      .update(updateData)
      .eq('agent_id', agentId)
      .eq('id_umroh', id_umroh)
      .eq('nama', nama);

    if (error) {
      console.error('[jamaah-note] Update error:', error.message);
      return res.status(500).json({ error: 'Failed to save note' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('[jamaah-note] Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Disconnect: clear in-memory session only
app.post('/api/laporan/disconnect', authMiddleware, async (req, res) => {
  const agentId = req.user.id;
  const agent = await getAgentById(agentId);
  if (agent?.jamaah_username) {
    await laporanDisconnect(agent.jamaah_username);
  }
  // Cancel any running sync
  const state = syncingAgents.get(agentId);
  if (state?.isSyncing) {
    syncingAgents.set(agentId, { ...state, isSyncing: false, cancelled: true });
    console.log(`[Sync] ${agent?.slug}: cancelled by disconnect`);
  }
  res.json({ success: true });
});

// Delete saved credentials
app.delete('/api/laporan/credentials', authMiddleware, async (req, res) => {
  const agentId = req.user.id;
  // Also disconnect if active
  const agent = await getAgentById(agentId);
  if (agent?.jamaah_username) {
    await laporanDisconnect(agent.jamaah_username);
  }
  // Cancel any running sync
  const state = syncingAgents.get(agentId);
  if (state?.isSyncing) {
    syncingAgents.set(agentId, { ...state, isSyncing: false, cancelled: true });
    console.log(`[Sync] ${agent?.slug}: cancelled by credential deletion`);
  }

  const { error } = await supabase
    .from('agents')
    .update({
      jamaah_username: null,
      jamaah_password: null,
      jamaah_kantor: null,
      awapi_key: null,
      awapi_code: null,
    })
    .eq('id', agentId);
  if (error) return res.status(500).json({ error: error.message });
  invalidateAgentCache();
  res.json({ success: true });
});

// ── Helper: Ensure legacy session active, auto-relogin if credentials saved ──
async function ensureLegacySession(agent) {
  if (!agent?.jamaah_username) {
    return { success: false, error: 'Belum ada kredensial sistem internal. Silakan login di halaman Jamaah.' };
  }
  if (isSessionActive(agent.jamaah_username)) {
    return { success: true };
  }
  // Session expired — try auto-relogin with stored credentials
  if (!agent.jamaah_password) {
    return { success: false, error: 'Session kedaluwarsa. Silakan login ulang di halaman Jamaah.' };
  }
  try {
    const decrypted = capiDecrypt(agent.jamaah_password);
    const loginResult = await laporanLogin(agent.jamaah_username, decrypted, agent.jamaah_kantor || '2');
    if (!loginResult.success) {
      return {
        success: false,
        error: loginResult.error || 'Gagal login ulang ke sistem internal. Silakan login manual di halaman Jamaah.',
      };
    }
    return { success: true };
  } catch (err) {
    console.error('Auto-relogin error:', err);
    return { success: false, error: 'Gagal login ulang ke sistem internal.' };
  }
}

// ── Umrah Registration: Fetch form options from legacy system ──
app.get('/api/umrah/form-options', authMiddleware, async (req, res) => {
  try {
    const agent = await getAgentById(req.user.id);
    if (!agent) return res.status(404).json({ error: 'Agent not found' });
    const sess = await ensureLegacySession(agent);
    if (!sess.success) {
      // Respond 200 so the upstream proxy doesn't replace the body with a
      // generic HTML error page. Frontend reads success:false and renders msg.
      return res.json({ success: false, error: sess.error });
    }

    const idb = typeof req.query.idb === 'string' ? req.query.idb : '';
    let result = await fetchUmrahFormOptions(agent.jamaah_username, { idb });

    // Legacy may have invalidated PHPSESSID for protected actions. Force fresh
    // login and retry once.
    if (!result.success && result.reason === 'session_expired_remote') {
      console.log(`[form-options] remote rejected — forcing re-login for ${agent.jamaah_username}`);
      try {
        const decrypted = capiDecrypt(agent.jamaah_password);
        const fresh = await laporanLogin(agent.jamaah_username, decrypted, agent.jamaah_kantor || '2');
        if (fresh.success) {
          result = await fetchUmrahFormOptions(agent.jamaah_username, { idb });
        }
      } catch (err) {
        console.error('[form-options] re-login threw:', err.message);
      }
    }

    if (!result.success) {
      return res.json({ success: false, error: result.error || 'Gagal mengambil form pendaftaran' });
    }

    // Return structured form data (exclude rawHtml for security)
    const { rawHtml, ...formData } = result;
    res.json({ success: true, data: formData });
  } catch (err) {
    console.error('GET /api/umrah/form-options error:', err);
    res.json({ success: false, error: 'Gagal mengambil opsi form pendaftaran' });
  }
});

// ── Umrah Registration: Submit new jamaah to legacy system ──
app.post('/api/umrah/register', authMiddleware, express.json({ limit: '10mb' }), async (req, res) => {
  try {
    const agent = await getAgentById(req.user.id);
    if (!agent) return res.status(404).json({ error: 'Agent not found' });
    const sess = await ensureLegacySession(agent);
    if (!sess.success) {
      return res.status(400).json({ error: sess.error });
    }

    const { formAction, fields, hiddenFields, file, fileFieldName, idb } = req.body;

    if (!formAction || !fields) {
      return res.status(400).json({ error: 'Data form tidak lengkap' });
    }

    // Convert base64 file to Buffer if provided
    let fileBuffer = null;
    let fileName = null;
    if (file?.data && file?.name) {
      fileBuffer = Buffer.from(file.data, 'base64');
      // Lowercase extension — legacy PHP rejects any mixed/upper case (e.g. .JPG, .Jpeg).
      // Case-insensitive so ".JPEG", ".JPeG", ".Png" all normalise to lowercase.
      fileName = file.name.replace(/\.([a-zA-Z]+)$/, (_m, ext) => '.' + ext.toLowerCase());
    }

    // ── Auto-fetch paket details (harga_paket, npaket, harga_perlengkapan) ──
    // The legacy form's JS calls _pkt.php on paket change to populate these fields.
    // Without this, submission results in harga=0/sisa=0 → status LUNAS bug.
    const enrichedFields = { ...fields };
    // Field name may be `vjadwal` in idb-bound mode — fall back to that as well.
    const jadwalValue = fields.jadwal || fields.vjadwal || fields.berangkat || fields.tgl_berangkat;
    const paketValue = fields.paket || fields.paket_umroh;
    // Legacy PHP reads $_POST['jadwal'] on line 77; mirror vjadwal to jadwal so it resolves.
    if (jadwalValue && !enrichedFields.jadwal) {
      enrichedFields.jadwal = jadwalValue;
    }
    if (jadwalValue && paketValue) {
      const paketDetails = await fetchUmrahPaketDetails(agent.jamaah_username, jadwalValue, paketValue);
      if (paketDetails.success && paketDetails.fields) {
        // Merge fetched values, but don't override user-provided values
        for (const [name, value] of Object.entries(paketDetails.fields)) {
          if (enrichedFields[name] === undefined || enrichedFields[name] === '' || enrichedFields[name] === '0') {
            enrichedFields[name] = value;
          }
        }
        console.log('[Register] Enriched fields with paket details:', Object.keys(paketDetails.fields));
      } else {
        console.warn('[Register] Failed to fetch paket details:', paketDetails.error);
      }
    }

    // ── PHP aksi_umrah.php compatibility shims — discovered via PHP warnings:
    //   - $_POST['tgl_pendaftaran'] (line 71)
    //   - $_POST[someArr][1], [2] (line 72) — assumed to be nama[1], nama[2]
    //   - $_POST['plahir'] (place of birth)
    // We always inject these fields so PHP doesn't bail with warnings.
    const today = new Date();
    const dd = String(today.getDate()).padStart(2, '0');
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const yyyy = today.getFullYear();
    const todayStr = `${dd}/${mm}/${yyyy}`;

    // Always send tgl_pendaftaran with today's date (or user value if present)
    if (!enrichedFields.tgl_pendaftaran) {
      enrichedFields.tgl_pendaftaran = enrichedFields.tgldaftar || enrichedFields.tgl_daftar || todayStr;
    }

    // Helper: find value by scanning all keys against regex patterns (handles field-name variants)
    const findFieldByPatterns = (patterns) => {
      for (const key of Object.keys(enrichedFields)) {
        if (!enrichedFields[key]) continue;
        if (patterns.some((re) => re.test(key))) return enrichedFields[key];
      }
      return '';
    };

    // Always send plahir (tempat lahir)
    if (!enrichedFields.plahir) {
      enrichedFields.plahir = findFieldByPatterns([/^tempat[-_]?lahir$/i, /^plahir$/i, /tmp[-_]?lahir/i]);
    }

    // Always send tlahir (tanggal lahir)
    if (!enrichedFields.tlahir) {
      enrichedFields.tlahir = findFieldByPatterns([/^tgl[-_]?lahir$/i, /^tanggal[-_]?lahir$/i, /^tlahir$/i]);
    }

    // Name fields — form has a single `pendaftar` (Nama Pendaftar) field.
    // Split into first/middle/last, then send every variant PHP might read:
    // nama[0..2], ndepan/ntengah/nbelakang, first/middle/last, nama_depan/tengah/belakang.
    let firstName = findFieldByPatterns([/^first(name)?$/i, /^ndepan$/i, /^nama[-_]?depan$/i]);
    let middleName = findFieldByPatterns([/^middle(name)?$/i, /^ntengah$/i, /^nama[-_]?tengah$/i]);
    let lastName = findFieldByPatterns([/^last(name)?$/i, /^surname$/i, /^nbelakang$/i, /^nama[-_]?belakang$/i]);
    if (!firstName && !lastName) {
      const fullName = (enrichedFields.pendaftar || enrichedFields.nama || enrichedFields.nama_lengkap || '').trim();
      const parts = fullName.split(/\s+/).filter(Boolean);
      if (parts.length === 1) {
        firstName = parts[0];
      } else if (parts.length === 2) {
        firstName = parts[0];
        lastName = parts[1];
      } else if (parts.length >= 3) {
        firstName = parts[0];
        middleName = parts.slice(1, -1).join(' ');
        lastName = parts[parts.length - 1];
      }
    }
    const nameVariants = {
      'nama[0]': firstName,
      'nama[1]': middleName,
      'nama[2]': lastName,
      ndepan: firstName,
      ntengah: middleName,
      nbelakang: lastName,
      first: firstName,
      middle: middleName,
      last: lastName,
      firstname: firstName,
      middlename: middleName,
      lastname: lastName,
      nama_depan: firstName,
      nama_tengah: middleName,
      nama_belakang: lastName,
    };
    for (const [key, value] of Object.entries(nameVariants)) {
      if (!enrichedFields[key]) enrichedFields[key] = value;
    }
    if (!enrichedFields.nama_lengkap && (firstName || lastName)) {
      enrichedFields.nama_lengkap = [firstName, middleName, lastName].filter(Boolean).join(' ');
    }

    // tjamaah: legacy PHP expects telp jamaah — fall back to pendaftar phone
    if (!enrichedFields.tjamaah) {
      enrichedFields.tjamaah = findFieldByPatterns([/^telp$/i, /^hp$/i, /^no[-_]?telp$/i, /^tpendaftar$/i, /^tlp[-_]?pendaftar$/i]);
    }

    // status: legacy PHP expects payment/registration status — default to empty string
    if (enrichedFields.status === undefined) {
      enrichedFields.status = '';
    }

    // pakets: legacy aksi_umrah.php line 84 does explode('.', $_POST['pakets']) and
    // accesses [1]/[2] (date/seat). The client-side JS pkt() builds it as j+"."+p.
    if (!enrichedFields.pakets && jadwalValue && paketValue) {
      enrichedFields.pakets = `${jadwalValue}.${paketValue}`;
    }

    console.log('[Register] All field keys being sent:', Object.keys(enrichedFields).sort());
    console.log('[Register] Compatibility fields applied:', {
      tgl_pendaftaran: enrichedFields.tgl_pendaftaran,
      plahir: enrichedFields.plahir,
      tlahir: enrichedFields.tlahir,
      ndepan: enrichedFields.ndepan,
      ntengah: enrichedFields.ntengah,
      nbelakang: enrichedFields.nbelakang,
      'nama[0]': enrichedFields['nama[0]'],
      tjamaah: enrichedFields.tjamaah,
      status: enrichedFields.status,
    });

    const result = await submitUmrahRegistration(agent.jamaah_username, {
      formAction,
      fields: enrichedFields,
      hiddenFields: hiddenFields || {},
      fileBuffer,
      fileName,
      fileFieldName,
      idb,
    });

    if (!result.success) {
      return res.status(502).json({ error: result.error, debug: result.debug });
    }

    res.json({ success: true, message: result.message });
  } catch (err) {
    console.error('POST /api/umrah/register error:', err);
    res.status(500).json({ error: 'Gagal mengirim pendaftaran' });
  }
});

// ── Umrah Registration: Fetch all dependent options (paket, marketing, koordinator) for a given jadwal ──
app.get('/api/umrah/dependent-options', authMiddleware, async (req, res) => {
  try {
    const agent = await getAgentById(req.user.id);
    if (!agent) return res.status(404).json({ error: 'Agent not found' });
    const sess = await ensureLegacySession(agent);
    if (!sess.success) {
      return res.status(400).json({ error: sess.error });
    }

    const { jadwal } = req.query;
    if (!jadwal) {
      return res.status(400).json({ error: 'jadwal required' });
    }

    const result = await fetchUmrahDependentOptions(agent.jamaah_username, jadwal);
    if (!result.success) {
      return res.status(502).json({ error: result.error });
    }

    res.json({
      success: true,
      data: result.data,
      sourceUrl: result.sourceUrl,
      extraFields: result.extraFields, // additional form fields discovered from AJAX response
    });
  } catch (err) {
    console.error('GET /api/umrah/dependent-options error:', err);
    res.status(500).json({ error: 'Gagal mengambil opsi dependent' });
  }
});

// ── Umrah Registration: Fetch paket options for a given tgl_berangkat ──
app.get('/api/umrah/paket-options', authMiddleware, adminOnly, async (req, res) => {
  try {
    const agent = await getAgentById(req.user.id);
    const sess = await ensureLegacySession(agent);
    if (!sess.success) {
      return res.status(400).json({ error: sess.error });
    }

    const { tgl_berangkat } = req.query;
    if (!tgl_berangkat) {
      return res.status(400).json({ error: 'tgl_berangkat required' });
    }

    const result = await fetchUmrahPaketOptions(agent.jamaah_username, tgl_berangkat);
    if (!result.success) {
      return res.status(502).json({ error: result.error, debug: result.tried });
    }

    res.json({ success: true, data: { options: result.options, sourceUrl: result.sourceUrl } });
  } catch (err) {
    console.error('GET /api/umrah/paket-options error:', err);
    res.status(500).json({ error: 'Gagal mengambil paket options' });
  }
});

// ── Umrah Registration: OCR KTP using OpenAI Vision ──
app.post('/api/umrah/ocr-ktp', authMiddleware, express.json({ limit: '15mb' }), async (req, res) => {
  const agent = await getAgentById(req.user.id);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });

  const OPENAI_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_KEY) {
    return res.status(500).json({ error: 'OPENAI_API_KEY not configured' });
  }

  const { imageBase64, imageMimeType } = req.body;
  if (!imageBase64) {
    return res.status(400).json({ error: 'imageBase64 required' });
  }

  try {
    const mime = imageMimeType || 'image/jpeg';
    const dataUrl = `data:${mime};base64,${imageBase64}`;

    const systemPrompt = `Kamu adalah AI yang mengekstrak data dari foto KTP Indonesia.
Kembalikan HANYA JSON (tanpa markdown atau penjelasan) dengan format:
{
  "nik": "16 digit NIK",
  "nama": "Nama lengkap sesuai KTP (huruf kapital)",
  "tempat_lahir": "Kota kelahiran",
  "tgl_lahir": "DD-MM-YYYY",
  "jenis_kelamin": "LAKI-LAKI" atau "PEREMPUAN",
  "alamat": "Alamat lengkap (baris alamat saja, tanpa RT/RW)",
  "rt_rw": "RT/RW (contoh: 001/002)",
  "kelurahan": "Nama kelurahan/desa",
  "kecamatan": "Nama kecamatan",
  "agama": "Agama",
  "status_perkawinan": "BELUM KAWIN" / "KAWIN" / "CERAI HIDUP" / "CERAI MATI",
  "pekerjaan": "Pekerjaan",
  "kewarganegaraan": "WNI/WNA"
}
Jika field tidak terbaca, gunakan null. Jangan invent data.`;

    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Ekstrak data dari KTP ini:' },
              { type: 'image_url', image_url: { url: dataUrl } },
            ],
          },
        ],
        temperature: 0.1,
        max_tokens: 800,
      }),
    });

    if (!openaiRes.ok) {
      const errBody = await openaiRes.text();
      console.error('OpenAI OCR error:', errBody);
      return res.status(502).json({ error: 'OCR gagal', details: errBody });
    }

    const result = await openaiRes.json();
    const text = result.choices?.[0]?.message?.content || '';

    // Strip markdown code fences if present
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return res.status(500).json({ error: 'OCR response tidak valid', raw: text });
    }

    res.json({ success: true, data: parsed });
  } catch (err) {
    console.error('OCR KTP error:', err);
    res.status(500).json({ error: 'Gagal memproses OCR: ' + err.message });
  }
});

// ── Umrah Registration: Debug — fetch raw form HTML (admin only, temporary) ──
app.get('/api/umrah/form-debug', authMiddleware, async (req, res) => {
  try {
    const agent = await getAgentById(req.user.id);
    const sess = await ensureLegacySession(agent);
    if (!sess.success) {
      return res.status(400).json({ error: sess.error });
    }

    const result = await fetchUmrahFormOptions(agent.jamaah_username);
    if (!result.success) {
      return res.status(502).json({ error: result.error });
    }

    // Look for AJAX endpoint patterns in JavaScript / inline script tags
    const html = result.rawHtml || '';
    const ajaxHints = [];

    // Common patterns: $.ajax({url: '...'}), $.get('...'), $.post('...'), fetch('...')
    const patterns = [
      /\$\.ajax\s*\(\s*\{[^}]*url\s*:\s*['"]([^'"]+)['"]/gi,
      /\$\.(?:get|post|load)\s*\(\s*['"]([^'"]+)['"]/gi,
      /fetch\s*\(\s*['"]([^'"]+)['"]/gi,
      /url\s*:\s*['"]([^'"]+paket[^'"]*)['"]/gi,
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(html)) !== null) {
        ajaxHints.push(match[1]);
      }
    }

    // Return full details including raw HTML for debugging field names
    res.json({
      success: true,
      formAction: result.formAction,
      hiddenFields: result.hiddenFields,
      selects: result.selects,
      inputs: result.inputs,
      textareas: result.textareas,
      ajaxHints: [...new Set(ajaxHints)], // unique URLs found in JS (legacy)
      jsHandlers: result.jsHandlers, // structured AJAX handlers discovered from JS
    });
  } catch (err) {
    console.error('GET /api/umrah/form-debug error:', err);
    res.status(500).json({ error: 'Debug error' });
  }
});

// ── Tren Daftar: Available Hijriah Years (Admin only) ──
app.get('/api/laporan/tren-daftar/years', authMiddleware, adminOnly, async (req, res) => {
  try {
    const data = await fetchAllRows(
      supabase
        .from('jamaah')
        .select('tgl_berangkat, bayar, sisa')
        .not('tgl_berangkat', 'is', null)
        .or('bayar.gt.0,sisa.eq.0,sisa.is.null')
        .order('id', { ascending: true })
    );
    const years = [...new Set(data.map(d => getHijriahYearFromGregorian(d.tgl_berangkat)).filter(Boolean))]
      .filter(y => Number(y) >= 1447)
      .sort((a, b) => Number(b) - Number(a));
    res.json({ success: true, data: years });
  } catch (err) {
    console.error('[TrenDaftar] Years error:', err.message);
    res.status(500).json({ error: 'Gagal mengambil data tahun' });
  }
});

// ── Tren Daftar: Main Data (Admin only) ──
const TREN_MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const TREN_MONTH_FULL = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const VALID_PAKET_PREFIX = ['HEMAT','REGULER','PLUS','VIP','UHUD','PREMIUM','SUPER','EKSKLUSIF','EKONOMI','PROMO','GOLD','SILVER','PLATINUM','DIAMOND'];
const BLACKLIST_PAKET = ['WAITINGLIST','WAITING','RAHMAH','CANCEL','BATAL','REFUND','PENDING','LIST','DRAFT'];

function excludeBelumDPQuery(q) {
  // Equivalent to: NOT (bayar = 0 AND sisa > 0) = bayar>0 OR sisa=0 OR sisa IS NULL.
  return q.or('bayar.gt.0,sisa.eq.0,sisa.is.null');
}

async function fetchTrenDaftarRows(year, selectColumns) {
  const yearKey = String(year);
  const range = getHijriahDateRange(yearKey);
  const columns = selectColumns.split(',').map(c => c.trim());
  const selectWithDeparture = columns.includes('tgl_berangkat')
    ? selectColumns
    : `${selectColumns}, tgl_berangkat`;
  let query = excludeBelumDPQuery(
    supabase
      .from('jamaah')
      .select(selectWithDeparture)
      .not('tgl_berangkat', 'is', null)
      .order('id', { ascending: true })
  );
  if (range) query = query.gte('tgl_berangkat', range.start).lte('tgl_berangkat', range.end);

  const rows = await fetchAllRows(query);
  if (range) return rows;
  return rows.filter(j => getHijriahYearFromGregorian(j.tgl_berangkat) === yearKey);
}

app.get('/api/laporan/tren-daftar', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { hijriahYear } = req.query;
    if (!hijriahYear) return res.status(400).json({ error: 'hijriahYear wajib diisi' });

    const year = String(hijriahYear);
    const prevYear = String(Number(year) - 1);

    // Tren Daftar is anchored to departure year: a jamaah who registered in
    // 1447H but departs in 1448H belongs to the 1448H cohort.
    const [rowsCur, rowsPrev] = await Promise.all([
      fetchTrenDaftarRows(year, 'tgl_daftar, tgl_berangkat, tgl_lahir, jk, bayar, sisa, paket, agent_id'),
      fetchTrenDaftarRows(prevYear, 'tgl_daftar, bayar, sisa'),
    ]);

    const cur = rowsCur;
    const prev = rowsPrev;

    // Summary
    const totalDaftar = cur.length;
    const totalDaftarPrev = prev.length;
    const monthlyCur = new Array(12).fill(0);
    cur.forEach(j => { if (j.tgl_daftar) { monthlyCur[new Date(j.tgl_daftar).getMonth()]++; } });

    const monthlyPrev = new Array(12).fill(0);
    prev.forEach(j => { if (j.tgl_daftar) { monthlyPrev[new Date(j.tgl_daftar).getMonth()]++; } });

    const monthsWithData = monthlyCur.filter(c => c > 0).length || 1;
    const avgPerMonth = Math.round(totalDaftar / monthsWithData);

    let peakIdx = 0, slowIdx = -1, slowVal = Infinity;
    monthlyCur.forEach((c, i) => {
      if (c > monthlyCur[peakIdx]) peakIdx = i;
      if (c > 0 && c < slowVal) { slowVal = c; slowIdx = i; }
    });
    if (slowIdx === -1) slowIdx = 0;

    // Apple-to-apple growth: only compare months that have data in current year
    const monthIdxWithData = [];
    monthlyCur.forEach((c, i) => { if (c > 0) monthIdxWithData.push(i); });
    const totalCurSame = monthIdxWithData.reduce((s, i) => s + monthlyCur[i], 0);
    const totalPrevSame = monthIdxWithData.reduce((s, i) => s + monthlyPrev[i], 0);
    const growthPct = totalPrevSame > 0 ? Math.round(((totalCurSame - totalPrevSame) / totalPrevSame) * 1000) / 10 : 0;
    const growthMonths = monthIdxWithData.length;
    let growthLabel = '';
    if (growthMonths > 0 && growthMonths < 12) {
      const first = TREN_MONTH_LABELS[monthIdxWithData[0]];
      const last = TREN_MONTH_LABELS[monthIdxWithData[monthIdxWithData.length - 1]];
      growthLabel = first === last ? first : `${first}–${last}`;
    }

    const summary = {
      totalDaftar, totalDaftarPrev, growthPct, avgPerMonth, growthMonths, growthLabel,
      peakMonth: TREN_MONTH_FULL[peakIdx], peakMonthCount: monthlyCur[peakIdx],
      slowestMonth: TREN_MONTH_FULL[slowIdx], slowestMonthCount: monthlyCur[slowIdx],
    };

    const monthly = Array.from({ length: 12 }, (_, i) => ({
      month: i + 1, label: TREN_MONTH_LABELS[i], count: monthlyCur[i], countPrev: monthlyPrev[i],
    }));

    // Heatmap (3 years)
    const heatYearsRaw = await fetchAllRows(
      excludeBelumDPQuery(
        supabase
          .from('jamaah')
          .select('tgl_berangkat, bayar, sisa')
          .not('tgl_berangkat', 'is', null)
          .order('id', { ascending: true })
      )
    );
    const allYears = [...new Set(heatYearsRaw.map(d => getHijriahYearFromGregorian(d.tgl_berangkat)).filter(Boolean))]
      .filter(y => Number(y) >= 1447)
      .sort((a, b) => Number(b) - Number(a))
      .slice(0, 3);

    const heatmap = {};
    heatmap[year] = [...monthlyCur];
    if (allYears.includes(prevYear)) heatmap[prevYear] = [...monthlyPrev];

    for (const hy of allYears) {
      if (heatmap[hy]) continue;
      const hyRows = await fetchTrenDaftarRows(hy, 'tgl_daftar, bayar, sisa');
      const arr = new Array(12).fill(0);
      hyRows.forEach(j => { if (j.tgl_daftar) { arr[new Date(j.tgl_daftar).getMonth()]++; } });
      heatmap[hy] = arr;
    }
    for (const hy of allYears) { if (!heatmap[hy]) heatmap[hy] = new Array(12).fill(0); }

    // Revenue
    const revenueMonthly = new Array(12).fill(0);
    let totalMasuk = 0;
    cur.forEach(j => {
      const b = Number(j.bayar) || 0;
      totalMasuk += b;
      if (j.tgl_daftar) { revenueMonthly[new Date(j.tgl_daftar).getMonth()] += b; }
    });
    const revMonthsWithData = revenueMonthly.filter(v => v > 0).length || 1;
    const revenue = {
      totalMasuk,
      avgPerMonth: Math.round(totalMasuk / revMonthsWithData),
      monthly: revenueMonthly.map((total, i) => ({ month: i + 1, label: TREN_MONTH_LABELS[i], total })),
    };

    // Insights
    const withDates = cur.filter(j => j.tgl_daftar && j.tgl_berangkat);
    const leadDays = withDates.map(j => (new Date(j.tgl_berangkat) - new Date(j.tgl_daftar)) / 86400000).filter(d => d > 0);
    const leadTimeAvg = leadDays.length > 0 ? Math.round((leadDays.reduce((s, d) => s + d, 0) / leadDays.length / 30) * 10) / 10 : 0;

    const lunasCount = cur.filter(j => j.sisa === 0 || j.sisa === null).length;
    const conversionRate = totalDaftar > 0 ? Math.round((lunasCount / totalDaftar) * 100) : 0;

    // Conversion context: only count jamaah who already departed
    const today = new Date().toISOString().split('T')[0];
    const sudahBerangkat = cur.filter(j => j.tgl_berangkat && j.tgl_berangkat <= today).length;
    const lunasSudahBerangkat = cur.filter(j => (j.sisa === 0 || j.sisa === null) && j.tgl_berangkat && j.tgl_berangkat <= today).length;
    const conversionRateBerangkat = sudahBerangkat > 0 ? Math.round((lunasSudahBerangkat / sudahBerangkat) * 100) : 0;

    const paketMapRaw = {};
    cur.forEach(j => { if (j.paket) { const key = j.paket.split(' ')[0].toUpperCase(); paketMapRaw[key] = (paketMapRaw[key] || 0) + 1; } });
    // Filter: include if in whitelist OR not in blacklist (so new unknown pakets still show)
    const paketMap = {};
    for (const [key, count] of Object.entries(paketMapRaw)) {
      if (BLACKLIST_PAKET.includes(key)) continue;
      if (VALID_PAKET_PREFIX.includes(key) || !BLACKLIST_PAKET.includes(key)) paketMap[key] = count;
    }
    const topPaket = Object.entries(paketMap).sort((a, b) => b[1] - a[1])[0]?.[0] || '-';

    const insights = { leadTimeAvg, conversionRate, conversionRateBerangkat, sudahBerangkat, totalJamaah: totalDaftar, lunasCount, topPaket };

    // Gender
    let perempuan = 0, lakiLaki = 0;
    cur.forEach(j => { if (j.jk === 'P') perempuan++; else if (j.jk === 'L') lakiLaki++; });
    const gender = { perempuan, lakiLaki };

    // Age Distribution
    const now = new Date();
    const ages = cur.filter(j => j.tgl_lahir).map(j => {
      const birth = new Date(j.tgl_lahir);
      return Math.floor((now - birth) / (365.25 * 86400000));
    }).filter(a => a >= 0 && a < 150);

    const ageBuckets = [
      { range: '18-30', min: 18, max: 30, count: 0 },
      { range: '31-40', min: 31, max: 40, count: 0 },
      { range: '41-50', min: 41, max: 50, count: 0 },
      { range: '51-60', min: 51, max: 60, count: 0 },
      { range: '60+', min: 61, max: 999, count: 0 },
    ];
    ages.forEach(a => { for (const b of ageBuckets) { if (a >= b.min && a <= b.max) { b.count++; break; } } });
    const ageTotal = ages.length || 1;
    const ageDistribution = ageBuckets.map(b => ({ range: b.range, count: b.count, pct: Math.round((b.count / ageTotal) * 100) }));
    const ageAvg = ages.length > 0 ? Math.round((ages.reduce((s, a) => s + a, 0) / ages.length) * 10) / 10 : 0;

    // Lead Time Distribution
    const ltBuckets = [
      { range: '< 1 bulan', min: 0, max: 29, count: 0 },
      { range: '1-2 bulan', min: 30, max: 59, count: 0 },
      { range: '2-4 bulan', min: 60, max: 119, count: 0 },
      { range: '4-6 bulan', min: 120, max: 179, count: 0 },
      { range: '> 6 bulan', min: 180, max: 99999, count: 0 },
    ];
    leadDays.forEach(d => { for (const b of ltBuckets) { if (d >= b.min && d <= b.max) { b.count++; break; } } });
    const ltTotal = leadDays.length || 1;
    const leadTimeDistribution = ltBuckets.map(b => ({ range: b.range, pct: Math.round((b.count / ltTotal) * 100) }));

    // Daftar vs Berangkat Matrix
    const dvb = Array.from({ length: 12 }, () => new Array(12).fill(0));
    withDates.forEach(j => {
      const dm = new Date(j.tgl_daftar).getMonth();
      const bm = new Date(j.tgl_berangkat).getMonth();
      dvb[dm][bm]++;
    });

    // Agent Ranking
    const agentMap = {};
    cur.forEach(j => { if (j.agent_id) agentMap[j.agent_id] = (agentMap[j.agent_id] || 0) + 1; });
    const agentIds = Object.keys(agentMap);
    const { data: agentRows } = agentIds.length > 0
      ? await supabase.from('agents').select('id, slug, name, photo').in('id', agentIds)
      : { data: [] };
    const agentInfo = Object.fromEntries((agentRows || []).map(a => [a.id, a]));
    const agentRanking = Object.entries(agentMap)
      .map(([id, count]) => ({ slug: agentInfo[id]?.slug || id, name: agentInfo[id]?.name || id, photo: agentInfo[id]?.photo || '', count }))
      .sort((a, b) => b.count - a.count);

    // Paket Ranking (grouped by first word)
    const paketTotal = Object.values(paketMap).reduce((s, c) => s + c, 0) || 1;
    const paketRanking = Object.entries(paketMap)
      .map(([paket, count]) => ({ paket, count, pct: Math.round((count / paketTotal) * 100) }))
      .sort((a, b) => b.count - a.count);

    res.json({
      success: true,
      data: {
        period: year, periodPrev: prevYear,
        summary, monthly, heatmap, revenue, insights,
        gender, ageDistribution, ageAvg,
        leadTimeDistribution,
        daftarVsBerangkat: dvb, agentRanking, paketRanking,
      },
    });
  } catch (err) {
    console.error('[TrenDaftar] Error:', err.message);
    res.status(500).json({ error: 'Gagal mengambil data tren' });
  }
});

// ── Tren Daftar Haji: Available Masehi Years (Admin only) ──
app.get('/api/laporan/tren-daftar/haji-years', authMiddleware, adminOnly, async (req, res) => {
  try {
    const data = await fetchAllRows(
      supabase
        .from('jamaah_haji')
        .select('thn_masehi, tgl_daftar')
        .order('agent_id', { ascending: true })
        .order('id_haji', { ascending: true })
        .order('id_jamaah', { ascending: true })
    );

    const keberangkatan = [...new Set(
      data.map(d => String(d.thn_masehi || '')).filter(y => /^\d{4}$/.test(y))
    )].sort((a, b) => Number(b) - Number(a));

    const pendaftaran = [...new Set(
      data.map(d => String(d.tgl_daftar || '').slice(0, 4)).filter(y => /^\d{4}$/.test(y))
    )].sort((a, b) => Number(b) - Number(a));

    res.json({ success: true, data: { keberangkatan, pendaftaran } });
  } catch (err) {
    console.error('[TrenDaftar/Haji] Years error:', err.message);
    res.status(500).json({ error: 'Gagal mengambil data tahun haji' });
  }
});

// ── Tren Daftar Haji: Agent Ranking (Admin only) ──
app.get('/api/laporan/tren-daftar/haji-ranking', authMiddleware, adminOnly, async (req, res) => {
  try {
    const year = String(req.query.year || '').trim();
    if (!/^\d{4}$/.test(year)) {
      return res.status(400).json({ error: 'year wajib diisi (4-digit masehi)' });
    }
    const mode = req.query.mode === 'pendaftaran' ? 'pendaftaran' : 'keberangkatan';

    let query = supabase
      .from('jamaah_haji')
      .select('agent_id')
      .not('agent_id', 'is', null)
      .order('agent_id', { ascending: true })
      .order('id_haji', { ascending: true })
      .order('id_jamaah', { ascending: true });

    if (mode === 'keberangkatan') {
      query = query.eq('thn_masehi', year);
    } else {
      const yearStart = `${year}-01-01`;
      const yearEnd = `${Number(year) + 1}-01-01`;
      query = query.gte('tgl_daftar', yearStart).lt('tgl_daftar', yearEnd);
    }

    const rows = await fetchAllRows(query);

    const agentMap = {};
    rows.forEach(r => { agentMap[r.agent_id] = (agentMap[r.agent_id] || 0) + 1; });
    const agentIds = Object.keys(agentMap);

    const { data: agentRows, error: agentErr } = agentIds.length > 0
      ? await supabase.from('agents').select('id, slug, name, photo').in('id', agentIds)
      : { data: [], error: null };
    if (agentErr) throw agentErr;

    const agentInfo = Object.fromEntries((agentRows || []).map(a => [a.id, a]));
    const ranking = Object.entries(agentMap)
      .filter(([id]) => agentInfo[id])
      .map(([id, count]) => ({
        slug: agentInfo[id].slug,
        name: agentInfo[id].name,
        photo: agentInfo[id].photo || '',
        count,
      }))
      .sort((a, b) => b.count - a.count);

    res.json({ success: true, data: { ranking, mode, year } });
  } catch (err) {
    console.error('[TrenDaftar/Haji] Ranking error:', err.message);
    res.status(500).json({ error: 'Gagal mengambil ranking agent haji' });
  }
});

// ──────────────────────────────────────────────
// API: Stats — aggregated jamaah statistics
// ──────────────────────────────────────────────
app.get('/api/laporan/stats', authMiddleware, async (req, res) => {
  const agentId = req.user.id;

  try {
    // ── availableYears ──
    const ayData = await fetchAllRows(
      supabase.from('jamaah').select('hijriah_year').eq('agent_id', agentId).not('hijriah_year', 'is', null)
    );
    let availableYears = [...new Set(ayData.map(r => r.hijriah_year))]
      .filter(y => Number(y) >= 1447)  // Only show 1447+
      .sort((a, b) => b.localeCompare(a));

    // Determine hijriah year — default to 1448
    let year = req.query.year || null;
    if (!year) {
      year = availableYears.includes('1448') ? '1448' : (availableYears[0] || null);
    }

    // Cache check (key includes resolved year so different years are separate)
    const requestedYear = req.query.year || '';
    const cacheKey = `umroh:${agentId}:${requestedYear}`;
    const cached = statsCacheGet(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    // Base filter
    const baseMatch = { agent_id: agentId };
    if (year) baseMatch.hijriah_year = year;

    // Exclude "Belum DP" jamaah (bayar=0 AND sisa>0) from jamaah-count metrics.
    // "Belum DP" are prospects who haven't paid anything yet, so they shouldn't
    // inflate totals, monthly trends, or comparison numbers shown in Statistik.
    // Equivalent SQL: NOT (bayar = 0 AND sisa > 0) = bayar>0 OR sisa=0 OR sisa IS NULL.
    const excludeBelumDP = (q) => q.or('bayar.gt.0,sisa.eq.0,sisa.is.null');

    const todayStr = new Date().toISOString().split('T')[0];
    const now = new Date();
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const monthEnd = nextMonth.toISOString().split('T')[0];
    const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonthStart = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, '0')}-01`;
    const sevenMonthsAgo = new Date();
    sevenMonthsAgo.setMonth(sevenMonthsAgo.getMonth() - 6);
    const tmStr = `${sevenMonthsAgo.getFullYear()}-${String(sevenMonthsAgo.getMonth() + 1).padStart(2, '0')}-01`;

    // Build query builders (don't await yet)
    const totalQ = excludeBelumDP(supabase.from('jamaah').select('*', { count: 'exact', head: true }).match(baseMatch));
    const lunasQ = supabase.from('jamaah').select('*', { count: 'exact', head: true }).match(baseMatch).or('sisa.eq.0,sisa.is.null');
    const belumLunasQ = supabase.from('jamaah').select('*', { count: 'exact', head: true }).match(baseMatch).gt('sisa', 0).gt('bayar', 0);

    // Need id_umroh to dedupe — sisa is booking-level (same value across each
    // family member row), so summing per-row inflates by booking size.
    let outQ = supabase.from('jamaah').select('id_umroh, sisa').eq('agent_id', agentId).gt('sisa', 0).gt('bayar', 0);
    if (year) outQ = outQ.eq('hijriah_year', year);

    let bebQ = supabase.from('jamaah')
      .select('nama, paket, jk, tgl_berangkat, sisa, bayar, wa')
      .eq('agent_id', agentId)
      .gte('tgl_berangkat', todayStr)
      .order('tgl_berangkat', { ascending: true })
      .order('nama', { ascending: true });

    let jbQ = supabase.from('jamaah').select('*', { count: 'exact', head: true })
      .match(baseMatch).gte('tgl_daftar', monthStart).lt('tgl_daftar', monthEnd);

    const prevTotalQ = excludeBelumDP(supabase.from('jamaah').select('*', { count: 'exact', head: true }).match(baseMatch).lt('tgl_daftar', monthStart));
    const prevJamaahBaruQ = excludeBelumDP(supabase.from('jamaah').select('*', { count: 'exact', head: true }).match(baseMatch).gte('tgl_daftar', prevMonthStart).lt('tgl_daftar', monthStart));

    let trendQ = supabase.from('jamaah').select('tgl_daftar, bayar, sisa').eq('agent_id', agentId).gte('tgl_daftar', tmStr).order('tgl_daftar', { ascending: true });
    if (year) trendQ = trendQ.eq('hijriah_year', year);

    let olQ = supabase.from('jamaah').select('id_umroh, nama, paket, jk, sisa, tgl_berangkat, wa').eq('agent_id', agentId).gt('sisa', 0).gt('bayar', 0).order('sisa', { ascending: false }).order('tgl_berangkat', { ascending: true });
    if (year) olQ = olQ.eq('hijriah_year', year);

    let komisiQ = supabase.from('jamaah').select('paket, sisa, tgl_berangkat, diskon_marketing').eq('agent_id', agentId);
    if (year) komisiQ = komisiQ.eq('hijriah_year', year);

    // Fire ALL independent queries in parallel
    const [
      totalRes,
      lunasRes,
      belumLunasRes,
      outData,
      bebRows,
      jbRes,
      prevTotalRes,
      prevJbRes,
      trendRows,
      olRows,
      komisiRows,
      syncResult,
    ] = await Promise.all([
      totalQ,
      lunasQ,
      belumLunasQ,
      fetchAllRows(outQ),
      fetchAllRows(excludeBelumDP(bebQ)),
      excludeBelumDP(jbQ),
      prevTotalQ,
      prevJamaahBaruQ,
      fetchAllRows(excludeBelumDP(trendQ)),
      fetchAllRows(olQ),
      fetchAllRows(komisiQ),
      supabase.from('agents').select('last_jamaah_sync_at').eq('id', agentId).maybeSingle(),
    ]);

    const totalJamaah = totalRes.count;
    const lunas = lunasRes.count;
    const belumLunas = belumLunasRes.count;
    const jamaahBaru = jbRes.count;
    const prevTotal = prevTotalRes.count;
    const prevJamaahBaru = prevJbRes.count;
    // Dedupe by id_umroh — sisa is booking-level, not per-jamaah.
    const seenOutBookings = new Set();
    const totalOutstanding = (outData || []).reduce((s, r) => {
      if (!r.id_umroh || seenOutBookings.has(r.id_umroh)) return s;
      seenOutBookings.add(r.id_umroh);
      return s + (r.sisa || 0);
    }, 0);
    const lastSync = syncResult.data?.last_jamaah_sync_at || null;

    // Berangkat Mendatang is an operational upcoming list, so it must cross
    // Hijriah-year boundaries (e.g. 13 Jun 2026 = 1447H, 18 Jun 2026 = 1448H).
    const { berangkatBulanIni, berangkatSegera, berangkatBulan } = buildBerangkatMendatang(bebRows, todayStr);
    const todayDate = new Date(todayStr);

    // ── lunasPercent ──
    const total = totalJamaah || 0;
    const lunasPercent = total > 0 ? Math.round(((lunas || 0) / total) * 100) : 0;

    const comparison = {
      totalJamaah: { prev: prevTotal || 0, diff: (totalJamaah || 0) - (prevTotal || 0) },
      komisiCair: null,
      berangkatSegera: { prev: null, diff: null },
      jamaahBaru: { prev: prevJamaahBaru || 0, diff: (jamaahBaru || 0) - (prevJamaahBaru || 0) },
    };

    const trendMap = new Map();
    for (const row of trendRows) {
      if (!row.tgl_daftar) continue;
      const bulan = row.tgl_daftar.substring(0, 7);
      trendMap.set(bulan, (trendMap.get(bulan) || 0) + 1);
    }
    const trend = Array.from(trendMap.entries())
      .map(([bulan, count]) => ({ bulan, count }))
      .sort((a, b) => a.bulan.localeCompare(b.bulan));

    // Dedupe by id_umroh — show one row per booking (first encountered wins;
    // olQ is sorted by sisa DESC then tgl_berangkat ASC). The displayed sisa
    // is the booking-level outstanding, not per-jamaah.
    const seenOlBookings = new Set();
    const outstandingList = (olRows || []).reduce((acc, r) => {
      if (!r.id_umroh || seenOlBookings.has(r.id_umroh)) return acc;
      seenOlBookings.add(r.id_umroh);
      let hari_lagi = null;
      if (r.tgl_berangkat) {
        const dep = new Date(r.tgl_berangkat);
        hari_lagi = Math.ceil((dep.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24));
      }
      acc.push({
        nama: r.nama,
        paket: r.paket,
        jk: r.jk,
        sisa: r.sisa,
        tgl_berangkat: r.tgl_berangkat,
        hari_lagi,
        wa: r.wa,
      });
      return acc;
    }, []);

    // ── komisi ──
    const KOMISI_HEMAT = 1300000;
    const KOMISI_REGULER = 1800000;
    const getRate = (p) => (p && p.toLowerCase().includes('hemat') ? KOMISI_HEMAT : KOMISI_REGULER);

    // Net komisi per jamaah = rate - diskon_marketing, floored at 0.
    // Hanya diskon_marketing yang dipotong dari komisi agen. diskon_kantor
    // adalah potongan harga paket yang ditanggung kantor (tidak mengurangi
    // komisi agen).
    const getNetKomisi = (r) => Math.max(0, getRate(r.paket) - (r.diskon_marketing || 0));

    let sudahCair = 0, sudahCairCount = 0;
    let belumCair = 0, belumCairCount = 0;
    let potensi = 0, potensiCount = 0;
    let hematCount = 0, hematTotal = 0, regulerCount = 0, regulerTotal = 0;
    for (const r of komisiRows) {
      const net = getNetKomisi(r);
      // sisa <= 0 = lunas (incl. lebih bayar / sisa negatif). NULL = lunas juga.
      const isLunas = r.sisa == null || r.sisa <= 0;
      const departed = r.tgl_berangkat && r.tgl_berangkat < todayStr;
      // Komisi umroh cair saat jamaah sudah berangkat (regardless of sisa).
      // Belum cair = lunas tapi belum berangkat (akan cair saat keberangkatan).
      // Potensi = belum lunas + belum berangkat (perlu pelunasan dulu).
      if (departed) { sudahCair += net; sudahCairCount++; }
      else if (isLunas) { belumCair += net; belumCairCount++; }
      else { potensi += net; potensiCount++; }
      if (r.paket && r.paket.toLowerCase().includes('hemat')) { hematCount++; hematTotal += net; }
      else { regulerCount++; regulerTotal += net; }
    }
    // chartBulanan: komisi cair grouped by departure month (7 months)
    const chartMap = new Map();
    // Build 7-month skeleton
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      chartMap.set(ym, { bulan: ym, total: 0, count: 0 });
    }
    for (const r of komisiRows) {
      if (!r.tgl_berangkat || r.tgl_berangkat >= todayStr) continue;
      // Sudah berangkat → komisi cair (regardless of sisa).
      const ym = r.tgl_berangkat.substring(0, 7);
      if (chartMap.has(ym)) {
        const entry = chartMap.get(ym);
        entry.total += getNetKomisi(r);
        entry.count++;
      }
    }
    const chartBulanan = Array.from(chartMap.values());

    const komisi = {
      totalKomisi: sudahCair + belumCair + potensi,
      sudahCair, sudahCairCount,
      belumCair, belumCairCount,
      potensi, potensiCount,
      breakdown: {
        hemat: { count: hematCount, rate: KOMISI_HEMAT, total: hematTotal },
        reguler: { count: regulerCount, rate: KOMISI_REGULER, total: regulerTotal },
      },
      chartBulanan,
    };

    const responseData = {
      totalJamaah: totalJamaah || 0,
      lunas: lunas || 0,
      belumLunas: belumLunas || 0,
      totalOutstanding,
      berangkatSegera,
      berangkatBulan,
      jamaahBaru: jamaahBaru || 0,
      lunasPercent,
      comparison,
      trend,
      berangkatBulanIni,
      outstandingList,
      availableYears,
      komisi,
      hijriahYear: year || null,
      lastSync,
    };
    const responsePayload = { success: true, data: responseData };
    statsCacheSet(cacheKey, responsePayload);
    res.json(responsePayload);
  } catch (err) {
    console.error('[Stats] Error:', err);
    res.status(500).json({ error: 'Gagal memuat statistik', message: err.message });
  }
});

// ──────────────────────────────────────────────
// API: Haji — scrape & manage haji data
// ──────────────────────────────────────────────

// POST /api/haji/sync — progressive sync (same pattern as umroh)
app.post('/api/haji/sync', authMiddleware, async (req, res) => {
  const { id: agentId, slug } = req.user;

  try {
    const agent = await getAgentById(agentId);
    const awapiEnabled = process.env.AWAPI_SYNC_ENABLED === 'true';
    if (awapiEnabled && !agent?.awapi_key && (!agent?.jamaah_username || !agent?.jamaah_password)) {
      return res.status(400).json({
        error: 'AWAPI haji belum tersedia untuk agent ini dan credential legacy tidak ada untuk discovery API key.',
      });
    }
    if (!awapiEnabled && (!agent?.jamaah_username || !agent?.jamaah_password)) {
      return res.status(400).json({
        error: 'Belum terhubung ke sistem internal. Silakan login di halaman Jamaah terlebih dahulu.'
      });
    }

    // Unified mutex: blocks manual haji if umroh (manual or background) is running, and vice versa.
    const state = syncingAgents.get(agentId);
    if (state?.isSyncing) {
      return res.json({ success: true, data: { initialCount: 0, syncing: true, message: 'Sync sudah berjalan' } });
    }

    syncingAgents.set(agentId, { isSyncing: true, scope: 'haji-manual', totalSynced: 0, lastSync: null, startedAt: Date.now() });

    if (awapiEnabled) {
      const awapiAgent = await ensureAwapiCredentials(agent);
      if (!awapiAgent?.awapi_key) {
        syncingAgents.set(agentId, { isSyncing: false, totalSynced: 0, lastSync: null });
        return res.status(400).json({
          error: 'AWAPI haji belum tersedia untuk agent ini. Silakan login ulang agar API key dapat ditemukan.',
        });
      }

      const apiResult = await syncHajiViaApiCore(agentId, slug, awapiAgent, { context: 'manual' });
      syncingAgents.set(agentId, { isSyncing: false, totalSynced: apiResult.count, lastSync: apiResult.syncedAt });
      return res.json({
        success: true,
        data: {
          initialCount: apiResult.count,
          total: apiResult.count,
          uniqueHaji: apiResult.uniqueHaji,
          syncing: false,
          source: 'awapi',
          partial: apiResult.partial || false,
        },
      });
    }

    // Login fresh to legacy system
    await laporanDisconnect(agent.jamaah_username);
    const decrypted = capiDecrypt(agent.jamaah_password);
    const loginResult = await laporanLogin(agent.jamaah_username, decrypted, agent.jamaah_kantor || '2');
    if (!loginResult.success) {
      syncingAgents.set(agentId, { isSyncing: false, totalSynced: 0, lastSync: null });
      return res.status(401).json({
        error: loginResult.error || 'Gagal login ke sistem internal. Credential tidak dihapus otomatis.',
      });
    }

    const sessionCookies = getSessionCookie(agent.jamaah_username);
    if (!sessionCookies) {
      syncingAgents.set(agentId, { isSyncing: false, totalSynced: 0, lastSync: null });
      return res.status(400).json({ error: 'Session cookies tidak tersedia setelah login.' });
    }

    // Step 1: Fetch the haji list
    const { rows: hajiList, complete: listComplete } = await fetchHajiList(sessionCookies);
    const uniqueIds = [...new Set(hajiList.map(h => h.id_haji))];
    console.log(`[haji-sync] ${slug}: found ${hajiList.length} entries, ${uniqueIds.length} unique, complete=${listComplete}`);

    if (uniqueIds.length === 0) {
      if (!listComplete) {
        // Truncated response with empty list — refuse to wipe DB on untrusted signal.
        console.warn(`[haji-sync] ${slug}: list empty BUT response incomplete — skipping cleanup`);
        const truncatedNow = new Date().toISOString();
        syncingAgents.set(agentId, { isSyncing: false, totalSynced: 0, lastSync: truncatedNow });
        const { error: bumpErr } = await supabase.from('agents').update({ last_jamaah_haji_sync_at: truncatedNow }).eq('id', agentId);
        if (bumpErr) console.warn(`[haji-sync] ${slug} bump last_jamaah_haji_sync_at (truncated) failed:`, bumpErr.message);
        invalidateStatsCache(agentId);
        return res.json({ success: true, data: { initialCount: 0, syncing: false, message: 'Respons list tidak lengkap — cleanup dilewati' } });
      }
      // Legitimate empty — but go through cleanup guard which also percent-guards.
      const { data: existingRows } = await supabase
        .from('jamaah_haji')
        .select('id_haji, id_jamaah')
        .eq('agent_id', agentId);
      const plan = computeSafeDeletions({
        listComplete: true,
        fetchedBookingIds: new Set(),
        successfulBookingIds: new Set(),
        successfulJamaahPerBooking: new Map(),
        existingRows: (existingRows || []).map(r => ({ bookingId: r.id_haji, jamaahKey: r.id_jamaah })),
        maxDeletePercent: 0.3,
      });
      if (plan.decision === 'skip') {
        console.warn(`[haji-sync] ${slug} cleanup skipped: ${plan.reason}`);
      } else if (plan.toDelete.length > 0) {
        await executeHajiDeletions(slug, agentId, plan.toDelete);
        console.log(`[haji-sync] ${slug}: removed ${plan.toDelete.length} haji (internal system empty)`);
      }
      const emptyNow = new Date().toISOString();
      syncingAgents.set(agentId, { isSyncing: false, totalSynced: 0, lastSync: emptyNow });
      const { error: bumpErr } = await supabase.from('agents').update({ last_jamaah_haji_sync_at: emptyNow }).eq('id', agentId);
      if (bumpErr) console.warn(`[haji-sync] ${slug} bump last_jamaah_haji_sync_at (empty) failed:`, bumpErr.message);
      invalidateStatsCache(agentId);
      return res.json({ success: true, data: { initialCount: 0, syncing: false } });
    }

    // Step 2: Fetch first batch (up to 10 detail pages, 5 parallel) for immediate response
    const BATCH_SIZE = 5;
    const firstBatchIds = uniqueIds.slice(0, 10);
    const restIds = uniqueIds.slice(10);
    const now = new Date().toISOString();
    const firstRows = [];

    // Track sync outcome for cleanup decision
    const fetchedBookingIds = new Set(uniqueIds);
    const successfulBookingIds = new Set();
    const successfulJamaahPerBooking = new Map();
    const recordSuccess = (idHaji, details) => {
      successfulBookingIds.add(idHaji);
      const set = successfulJamaahPerBooking.get(idHaji) || new Set();
      for (const d of details) set.add(d.id_jamaah);
      successfulJamaahPerBooking.set(idHaji, set);
    };

    for (let i = 0; i < firstBatchIds.length; i += BATCH_SIZE) {
      const batch = firstBatchIds.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map(async (idHaji) => {
          const details = await fetchHajiDetail(sessionCookies, idHaji);
          const listEntry = hajiList.find(h => h.id_haji === idHaji);
          return { idHaji, details, listEntry };
        })
      );
      for (let j = 0; j < results.length; j++) {
        const r = results[j];
        if (r.status === 'fulfilled') {
          const { idHaji, details, listEntry } = r.value;
          recordSuccess(idHaji, details);
          for (const detail of details) {
            firstRows.push({
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
              synced_at: now,
            });
          }
        } else if (r.reason?.message === 'SESSION_EXPIRED') {
          throw r.reason;
        }
      }
    }

    // Upsert first batch
    if (firstRows.length > 0) {
      const { error: firstErr } = await supabase
        .from('jamaah_haji')
        .upsert(firstRows, { onConflict: 'agent_id,id_haji,id_jamaah', defaultToNull: false });
      if (firstErr) console.error('[haji-sync] First batch upsert error:', firstErr.message);

      // Fire CAPI Purchase events (DP & Lunas) for Haji
      const hajiCapiIds = firstRows.map(r => ({ id_haji: r.id_haji, id_jamaah: r.id_jamaah }));
      processCapiPurchases(agentId, slug, 'haji', hajiCapiIds).catch(e =>
        console.error(`[CAPI] Haji first batch Purchase error:`, e.message)
      );
    }

    const moreToSync = restIds.length > 0;
    syncingAgents.set(agentId, { isSyncing: moreToSync, scope: 'haji-manual', totalSynced: firstRows.length, lastSync: now });

    // Respond immediately with first batch
    res.json({
      success: true,
      data: { initialCount: firstRows.length, total: hajiList.length, syncing: moreToSync },
    });

    // Step 3: Continue syncing rest in background
    const runCleanup = async () => {
      const { data: existingRows } = await supabase
        .from('jamaah_haji')
        .select('id_haji, id_jamaah')
        .eq('agent_id', agentId);
      const plan = computeSafeDeletions({
        listComplete,
        fetchedBookingIds,
        successfulBookingIds,
        successfulJamaahPerBooking,
        existingRows: (existingRows || []).map(r => ({ bookingId: r.id_haji, jamaahKey: r.id_jamaah })),
        maxDeletePercent: 0.3,
      });
      if (plan.decision === 'skip') {
        console.warn(`[haji-sync] ${slug} cleanup skipped: ${plan.reason} (wouldDelete=${plan.wouldDelete}/${plan.totalExisting})`);
        return;
      }
      if (plan.toDelete.length === 0) {
        console.log(`[haji-sync] ${slug} cleanup: no stale rows`);
        return;
      }
      const deletedCount = await executeHajiDeletions(slug, agentId, plan.toDelete);
      console.log(`[haji-sync] ${slug}: removed ${deletedCount} stale haji (wouldDelete=${plan.wouldDelete}/${plan.totalExisting})`);
    };

    if (moreToSync) {
      (async () => {
        try {
          const bgRows = [];
          for (let i = 0; i < restIds.length; i += BATCH_SIZE) {
            const batch = restIds.slice(i, i + BATCH_SIZE);
            const results = await Promise.allSettled(
              batch.map(async (idHaji) => {
                const details = await fetchHajiDetail(sessionCookies, idHaji);
                const listEntry = hajiList.find(h => h.id_haji === idHaji);
                return { idHaji, details, listEntry };
              })
            );
            for (const r of results) {
              if (r.status === 'fulfilled') {
                const { idHaji, details, listEntry } = r.value;
                recordSuccess(idHaji, details);
                for (const detail of details) {
                  bgRows.push({
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
                    synced_at: now,
                  });
                }
              } else if (r.reason?.message === 'SESSION_EXPIRED') {
                throw r.reason;
              }
            }
            // Upsert in batches of 50
            if (bgRows.length >= 50 || i + BATCH_SIZE >= restIds.length) {
              if (bgRows.length > 0) {
                const bgCapiIds = bgRows.map(r => ({ id_haji: r.id_haji, id_jamaah: r.id_jamaah }));
                const { error } = await supabase
                  .from('jamaah_haji')
                  .upsert(bgRows, { onConflict: 'agent_id,id_haji,id_jamaah', defaultToNull: false });
                if (error) console.error('[haji-sync] BG batch error:', error.message);
                processCapiPurchases(agentId, slug, 'haji', bgCapiIds).catch(e =>
                  console.error(`[CAPI] Haji BG batch Purchase error:`, e.message)
                );
                syncingAgents.set(agentId, {
                  isSyncing: true,
                  scope: 'haji-manual',
                  totalSynced: firstRows.length + bgRows.length,
                  lastSync: now,
                });
                bgRows.length = 0;
              }
            }
            if (i + BATCH_SIZE < restIds.length) await new Promise(r => setTimeout(r, 100));
          }
          await runCleanup();
          await backfillHajiPaketDetail(agentId, slug, sessionCookies);
          console.log(`[haji-sync] ${slug}: background sync complete`);
          syncingAgents.set(agentId, { isSyncing: false, totalSynced: firstRows.length, lastSync: now });
          const { error: bumpErr } = await supabase.from('agents').update({ last_jamaah_haji_sync_at: now }).eq('id', agentId);
          if (bumpErr) console.warn(`[haji-sync] ${slug} bump last_jamaah_haji_sync_at failed:`, bumpErr.message);
          invalidateStatsCache(agentId);
        } catch (err) {
          console.error('[haji-sync] BG sync error:', err.message);
          syncingAgents.set(agentId, { isSyncing: false, totalSynced: 0, lastSync: null });
        }
      })();
    } else {
      await runCleanup();
      await backfillHajiPaketDetail(agentId, slug, sessionCookies);
      syncingAgents.set(agentId, { isSyncing: false, totalSynced: firstRows.length, lastSync: now });
      const { error: bumpErr } = await supabase.from('agents').update({ last_jamaah_haji_sync_at: now }).eq('id', agentId);
      if (bumpErr) console.warn(`[haji-sync] ${slug} bump last_jamaah_haji_sync_at failed:`, bumpErr.message);
      invalidateStatsCache(agentId);
    }
  } catch (err) {
    console.error('[haji] Sync error:', err);
    syncingAgents.set(agentId, { isSyncing: false, totalSynced: 0, lastSync: null });
    if (!res.headersSent) {
      if (err.message === 'SESSION_EXPIRED') {
        return res.status(401).json({ error: 'Session expired. Silakan login ulang.' });
      }
      res.status(500).json({ error: 'Gagal sync data haji: ' + err.message });
    }
  }
});

// Delete haji rows grouped by id_haji for efficiency. Returns count deleted.
async function executeHajiDeletions(slug, agentId, toDelete) {
  const byBooking = new Map();
  for (const row of toDelete) {
    if (!byBooking.has(row.bookingId)) byBooking.set(row.bookingId, []);
    byBooking.get(row.bookingId).push(row.jamaahKey);
  }
  let count = 0;
  for (const [idHaji, idJamaahList] of byBooking) {
    const { error } = await supabase
      .from('jamaah_haji')
      .delete()
      .eq('agent_id', agentId)
      .eq('id_haji', idHaji)
      .in('id_jamaah', idJamaahList);
    if (error) console.error(`[haji-sync] ${slug} delete ${idHaji} error:`, error.message);
    else count += idJamaahList.length;
  }
  return count;
}

// Backfill paket_detail for jamaah_haji rows that have it null but have a
// surat_pernyataan_url. Runs at end of haji sync. Best-effort: failures
// don't break sync.
async function backfillHajiPaketDetail(agentId, slug, sessionCookies) {
  try {
    const { data: nullRows, error } = await supabase
      .from('jamaah_haji')
      .select('id_haji, id_jamaah, surat_pernyataan_url')
      .eq('agent_id', agentId)
      .is('paket_detail', null)
      .not('surat_pernyataan_url', 'is', null)
      .neq('surat_pernyataan_url', '');
    if (error) {
      console.warn(`[haji-sync] ${slug} paket_detail backfill query error:`, error.message);
      return;
    }
    if (!nullRows || nullRows.length === 0) return;

    console.log(`[haji-sync] ${slug}: backfilling paket_detail for ${nullRows.length} jamaah`);

    const BATCH_SIZE = 5;
    let updated = 0;
    for (let i = 0; i < nullRows.length; i += BATCH_SIZE) {
      const batch = nullRows.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map(row =>
          fetchSuratPernyataanPaketDetail(sessionCookies, row.surat_pernyataan_url)
            .then(detail => ({ row, detail }))
        )
      );
      const updates = results
        .filter(r => r.status === 'fulfilled' && r.value.detail)
        .map(r => r.value);
      for (const { row, detail } of updates) {
        const { error: updErr } = await supabase
          .from('jamaah_haji')
          .update({ paket_detail: detail })
          .eq('agent_id', agentId)
          .eq('id_haji', row.id_haji)
          .eq('id_jamaah', row.id_jamaah);
        if (updErr) console.warn(`[haji-sync] ${slug} paket_detail update error for ${row.id_jamaah}:`, updErr.message);
        else updated++;
      }
      // Rate-limit politeness
      if (i + BATCH_SIZE < nullRows.length) await new Promise(r => setTimeout(r, 100));
    }
    console.log(`[haji-sync] ${slug}: paket_detail backfilled ${updated}/${nullRows.length}`);
  } catch (err) {
    console.warn(`[haji-sync] ${slug} paket_detail backfill failed:`, err.message);
  }
}

// Delete umroh rows grouped by id_umroh. toDelete rows carry the original DB `nama`
// (case preserved) which is what Supabase needs for the DELETE match.
async function executeUmrohDeletions(slug, agentId, toDelete) {
  const byBooking = new Map();
  for (const row of toDelete) {
    if (!byBooking.has(row.bookingId)) byBooking.set(row.bookingId, []);
    byBooking.get(row.bookingId).push(row.nama);
  }
  let count = 0;
  for (const [idUmroh, namaList] of byBooking) {
    const { error } = await supabase
      .from('jamaah')
      .delete()
      .eq('agent_id', agentId)
      .eq('id_umroh', idUmroh)
      .in('nama', namaList);
    if (error) console.error(`[Sync] ${slug} delete ${idUmroh} error:`, error.message);
    else count += namaList.length;
  }
  return count;
}

// Haji sync status — shares unified mutex with umroh sync
app.get('/api/haji/sync-status', authMiddleware, async (req, res) => {
  const state = syncingAgents.get(req.user.id);
  if (!state) {
    const { data } = await supabase
      .from('agents')
      .select('last_jamaah_haji_sync_at')
      .eq('id', req.user.id)
      .maybeSingle();
    return res.json({
      success: true,
      data: { isSyncing: false, totalSynced: 0, lastSync: data?.last_jamaah_haji_sync_at || null },
    });
  }
  res.json({ success: true, data: state });
});

// GET /api/haji/jamaah — list jamaah haji with filters
app.get('/api/haji/jamaah', authMiddleware, async (req, res) => {
  try {
    const agentId = req.user.id;
    const {
      search = '',
      thn_hijriyah = '',
      thn_masehi = '',
      daftar_year = '',
      jenis = '',
      status_bayar = '',
      paket_filter = '',
      follow_up = '',
      page = '1',
      limit = '20'
    } = req.query;

    let query = supabase
      .from('jamaah_haji')
      .select('*', { count: 'exact' })
      .eq('agent_id', agentId)
      .order('id_haji', { ascending: false });

    const escapePostgrestFilterValue = (value) => String(value || '')
      .replace(/[,()*%]/g, (c) => '\\' + c)
      .slice(0, 100);

    if (search) {
      const safeSearch = escapePostgrestFilterValue(search);
      query = query.or(`nama.ilike.%${safeSearch}%,id_haji.ilike.%${safeSearch}%,id_jamaah.ilike.%${safeSearch}%,nomor_porsi.ilike.%${safeSearch}%,nomor_spph.ilike.%${safeSearch}%,telp.ilike.%${safeSearch}%`);
    }
    if (thn_hijriyah) {
      query = query.eq('thn_hijriyah', thn_hijriyah);
    }
    if (thn_masehi) {
      query = query.eq('thn_masehi', thn_masehi);
    }
    const daftarYear = String(daftar_year || '').trim();
    if (/^\d{4}$/.test(daftarYear)) {
      query = query
        .gte('tgl_daftar', `${daftarYear}-01-01`)
        .lt('tgl_daftar', `${Number(daftarYear) + 1}-01-01`);
    }
    if (jenis) {
      query = query.eq('jenis', jenis);
    }
    if (status_bayar) {
      query = query.eq('status_bayar', status_bayar);
    }
    if (paket_filter) {
      const safePaket = escapePostgrestFilterValue(paket_filter);
      query = query.or(`paket.ilike.%${safePaket}%,paket_detail.ilike.%${safePaket}%`);
    }
    switch (follow_up) {
      case 'bpih_ready':
        query = query.not('bpih_url', 'is', null);
        break;
      case 'bpih_missing':
        query = query.or('bpih_url.is.null,bpih_url.eq.');
        break;
      case 'paspor_missing':
        query = query.or('no_paspor.is.null,no_paspor.eq.');
        break;
      case 'telp_missing':
        query = query.or('telp.is.null,telp.eq.');
        break;
      case 'has_notes':
        query = query.not('notes', 'is', null);
        break;
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const from = (pageNum - 1) * limitNum;
    query = query.range(from, from + limitNum - 1);

    const { data, error, count } = await query;

    if (error) throw error;

    res.json({
      success: true,
      data,
      total: count,
      page: pageNum,
      limit: limitNum
    });
  } catch (err) {
    console.error('[haji] List error:', err);
    res.status(500).json({ error: 'Gagal mengambil data haji' });
  }
});

// Haji jamaah note: create/update/clear note for a specific haji jamaah
app.post('/api/haji/jamaah/note', authMiddleware, async (req, res) => {
  try {
    const agentId = req.user.id;
    const { id_haji, id_jamaah, notes } = req.body;

    if (!id_haji || !id_jamaah) {
      return res.status(400).json({ error: 'id_haji and id_jamaah are required' });
    }

    const updateData = (!notes || notes.trim() === '')
      ? { notes: null, notes_updated_at: null }
      : { notes: notes.trim(), notes_updated_at: new Date().toISOString() };

    const { error } = await supabase
      .from('jamaah_haji')
      .update(updateData)
      .eq('agent_id', agentId)
      .eq('id_haji', id_haji)
      .eq('id_jamaah', id_jamaah);

    if (error) {
      console.error('[haji-note] Update error:', error.message);
      return res.status(500).json({ error: 'Failed to save note' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('[haji-note] Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/haji/stats — aggregated haji statistics
// Query: ?year=YYYY (masehi). Default: latest available masehi year.
app.get('/api/haji/stats', authMiddleware, async (req, res) => {
  try {
    const agentId = req.user.id;

    const requestedMode = req.query.mode === 'pendaftaran' ? 'pendaftaran' : 'keberangkatan';
    const requestedYear = req.query.year || '';
    const requestedDaftarYear = typeof req.query.daftar_year === 'string' && /^\d{4}$/.test(req.query.daftar_year)
      ? req.query.daftar_year
      : '';
    const cacheKey = `haji:${agentId}:${requestedMode}:${requestedYear}:${requestedDaftarYear}`;
    const cached = statsCacheGet(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    // Always-unfiltered: availableYears (dropdown source) + lastSync.
    // lastSync sources from agents.last_jamaah_haji_sync_at (the actual sync
    // attempt timestamp) rather than MAX(jamaah_haji.synced_at), because the
    // skip_noop_update_jamaah_haji_trg trigger keeps row.synced_at frozen
    // when data is unchanged — making per-row timestamps misleading for "when
    // did sync last run".
    const [{ data: yearsData, error: yearsErr }, { data: agentRow }] = await Promise.all([
      supabase
        .from('jamaah_haji')
        .select('thn_masehi, tgl_daftar')
        .eq('agent_id', agentId),
      supabase
        .from('agents')
        .select('last_jamaah_haji_sync_at')
        .eq('id', agentId)
        .maybeSingle(),
    ]);
    if (yearsErr) throw yearsErr;

    const availableYears = computeAvailableYears(yearsData || []);
    const daftarYears = [...new Set((yearsData || [])
      .map(row => String(row.tgl_daftar || '').slice(0, 4))
      .filter(yearValue => /^\d{4}$/.test(yearValue)))]
      .sort((a, b) => b.localeCompare(a));

    // Default: current year if present, else closest year (ties prefer future).
    let year = typeof req.query.year === 'string' ? req.query.year : null;
    let daftarYear = requestedDaftarYear;
    if (!year && !daftarYear) {
      if (requestedMode === 'pendaftaran') {
        daftarYear = pickDefaultYear(daftarYears, new Date().getFullYear());
      } else {
        year = pickDefaultYear(availableYears, new Date().getFullYear());
      }
    }

    // Filtered fetch for all aggregates.
    let q = supabase
      .from('jamaah_haji')
      .select('id_haji, thn_hijriyah, thn_masehi, tgl_daftar, status_bayar, status_berangkat, jenis, paket, paket_detail')
      .eq('agent_id', agentId);
    if (year) q = q.eq('thn_masehi', year);
    if (daftarYear) {
      q = q
        .gte('tgl_daftar', `${daftarYear}-01-01`)
        .lt('tgl_daftar', `${Number(daftarYear) + 1}-01-01`);
    }

    const { data, error } = await q;
    if (error) throw error;

    const total = data.length;
    const uniqueHaji = [...new Set(data.map(d => d.id_haji))].length;
    const lunas = data.filter(d => (d.status_bayar || '').toUpperCase() === 'LUNAS').length;
    const cicilan = data.filter(d => (d.status_bayar || '').toUpperCase() === 'CICILAN').length;
    const belumBayar = data.filter(d => (d.status_bayar || '').toUpperCase() === 'BELUM BAYAR').length;
    const lebihBayar = data.filter(d => (d.status_bayar || '').toUpperCase() === 'LEBIH BAYAR').length;

    // % Pelunasan = (LUNAS + LEBIH BAYAR) / total
    const lunasPercent = total > 0 ? Math.round(((lunas + lebihBayar) / total) * 100) : 0;

    // Group by thn_masehi — computed from UNFILTERED yearsData so existing
    // consumers (HajiPage.tsx year dropdown) still see all years even when
    // ?year filter is applied to other aggregates.
    const byTahun = {};
    (yearsData || []).forEach(d => {
      const key = d.thn_masehi || 'unknown';
      if (!/^\d{4}$/.test(key)) return;
      byTahun[key] = (byTahun[key] || 0) + 1;
    });

    // Group by jenis (existing field, kept for backward compat)
    const byJenis = {};
    data.forEach(d => {
      const key = d.jenis || 'unknown';
      byJenis[key] = (byJenis[key] || 0) + 1;
    });

    // Komisi USD aggregates + breakdown
    const komisiBase = computeKomisi(data);
    const breakdownTahun = computeBreakdownTahun(data);

    const hajiResponsePayload = {
      success: true,
      data: {
        // existing fields
        total,
        uniqueHaji,
        lunas,
        cicilan,
        belumBayar,
        byTahun,
        byJenis,
        lastSync: agentRow?.last_jamaah_haji_sync_at || null,

        // new fields
        availableYears,
        daftarYears,
        masehiYear: year || null,
        daftarYear,
        lebihBayar,
        lunasPercent,
        komisi: {
          stage1: KOMISI_STAGE1,
          rateUhud: KOMISI_RATE_UHUD,
          rateRahmah: KOMISI_RATE_RAHMAH,
          byPaket: computeByPaket(data),
          berangkat: computeBerangkatStats(data),
          ...komisiBase,
          breakdownTahun,
        },
      },
    };
    statsCacheSet(cacheKey, hajiResponsePayload);
    res.json(hajiResponsePayload);
  } catch (err) {
    console.error('[haji] Stats error:', err);
    res.status(500).json({ error: 'Gagal mengambil statistik haji' });
  }
});

function normalizeTemporaryDocumentUrl(value) {
  if (typeof value !== 'string') return '';
  const text = value.trim();
  if (!text || ['0', 'false', 'null', 'undefined', '-'].includes(text.toLowerCase())) return '';
  return text;
}

async function agentOwnsUmrohJamaah(agentId, idJamaah) {
  if (!agentId || !idJamaah || !/^JM/i.test(idJamaah)) return false;

  const { data, error } = await supabase
    .from('jamaah')
    .select('id')
    .eq('agent_id', agentId)
    .eq('jm_id', idJamaah)
    .limit(1);

  if (error) {
    console.warn(`[doc-proxy] Jamaah ownership check failed for ${idJamaah}:`, error.message);
    return false;
  }

  return (data || []).length > 0;
}

async function getCachedJamaahDocument(agentId, idJamaah, documentType) {
  if (!agentId || !idJamaah || !documentType) return null;

  const { data, error } = await supabase
    .from('jamaah_document_cache')
    .select('content_html, content_type, source_url, fetched_at, html_sha256')
    .eq('agent_id', agentId)
    .eq('jm_id', idJamaah)
    .eq('document_type', documentType)
    .maybeSingle();

  if (error) {
    console.warn(`[doc-proxy] Document cache lookup failed for ${idJamaah}:`, error.message);
    return null;
  }

  return data?.content_html ? data : null;
}

async function saveCachedJamaahDocument({ agentId, idJamaah, documentType, sourceUrl, contentType, buffer }) {
  const row = buildJamaahDocumentCacheRow({
    agentId,
    idJamaah,
    documentType,
    sourceUrl,
    contentType,
    buffer,
  });
  if (!row) return null;

  const { error } = await supabase
    .from('jamaah_document_cache')
    .upsert(row, { onConflict: 'agent_id,jm_id,document_type' });

  if (error) {
    console.warn(`[doc-proxy] Document cache save failed for ${idJamaah}:`, error.message);
    return null;
  }

  return row;
}

let jamaahDocumentPdfBrowserPromise = null;

async function renderJamaahDocumentPdf(html) {
  const { chromium } = await import('playwright');
  if (!jamaahDocumentPdfBrowserPromise) {
    jamaahDocumentPdfBrowserPromise = chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    });
  }

  const browser = await jamaahDocumentPdfBrowserPromise;
  const page = await browser.newPage({ viewport: { width: 1240, height: 1754 } });
  try {
    await page.setContent(html, { waitUntil: 'networkidle', timeout: 15000 });
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
    });
    return Buffer.from(pdf);
  } finally {
    await page.close().catch(() => {});
  }
}

function buildDocumentFilename(baseName, extension) {
  const safeBase = String(baseName || 'surat-pernyataan')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'surat-pernyataan';
  return `${safeBase}.${extension}`;
}

async function sendJamaahDocumentHtmlOrPdf(res, rawHtml, { format = 'html', cacheStatus = 'BYPASS', filenameBase = 'surat-pernyataan' } = {}) {
  const printableHtml = buildPrintableJamaahDocumentHtml(rawHtml, { title: 'Surat Pernyataan' });

  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('X-Document-Cache', cacheStatus);

  if (format === 'pdf') {
    const filename = buildDocumentFilename(filenameBase, 'pdf');
    const pdf = await renderJamaahDocumentPdf(printableHtml);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(pdf);
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.send(Buffer.from(printableHtml, 'utf8'));
}

async function resolveFreshUmrohPernyataanUrl(agent, idJamaah) {
  if (process.env.AWAPI_SYNC_ENABLED !== 'true') return '';
  if (!agent?.awapi_key || !idJamaah || !/^JM/i.test(idJamaah)) return '';

  try {
    const code = agent.awapi_code || agent.awapi_key.split('-')[0];
    const { rows } = await awapiFetchJamaahById(agent.awapi_key, code, idJamaah);
    const matchingRow = (rows || []).find(row => String(row?.id_jamaah || '').trim() === idJamaah) || rows?.[0];
    return normalizeTemporaryDocumentUrl(matchingRow?.dokumen_pernyataan);
  } catch (err) {
    console.warn(`[doc-proxy] Fresh umroh pernyataan URL lookup failed for ${idJamaah}:`, err.message);
    return '';
  }
}

async function proxyInternalDocument(req, res) {
  try {
    const urlParam = Array.isArray(req.query.url) ? req.query.url[0] : req.query.url;
    const idJamaahParam = Array.isArray(req.query.idJamaah) ? req.query.idJamaah[0] : req.query.idJamaah;
    const refreshCacheParam = Array.isArray(req.query.refresh) ? req.query.refresh[0] : req.query.refresh;
    const formatParam = Array.isArray(req.query.format) ? req.query.format[0] : req.query.format;
    const format = String(formatParam || '').toLowerCase() === 'pdf' ? 'pdf' : 'html';
    const refreshCache = ['1', 'true', 'yes'].includes(String(refreshCacheParam || '').toLowerCase());
    const agent = await getAgentById(req.user.id);
    let targetUrl = normalizeTemporaryDocumentUrl(urlParam);
    let cacheKey = null;

    // AWAPI Umroh `dokumen_pernyataan` URLs are short-lived. When the caller
    // provides idJamaah, use a stored HTML snapshot first, then resolve a fresh
    // URL just-in-time only when the cache is empty or explicitly refreshed.
    if (idJamaahParam) {
      const idJamaah = String(idJamaahParam).trim();
      if (await agentOwnsUmrohJamaah(req.user.id, idJamaah)) {
        cacheKey = { idJamaah, documentType: JAMAAH_DOCUMENT_TYPES.UMROH_PERNYATAAN };
        if (!refreshCache) {
          const cached = await getCachedJamaahDocument(req.user.id, idJamaah, JAMAAH_DOCUMENT_TYPES.UMROH_PERNYATAAN);
          if (cached) {
            return sendJamaahDocumentHtmlOrPdf(res, cached.content_html, {
              format,
              cacheStatus: 'HIT',
              filenameBase: `surat-pernyataan-${idJamaah}`,
            });
          }
        }
        const freshUrl = await resolveFreshUmrohPernyataanUrl(agent, idJamaah);
        if (freshUrl) targetUrl = freshUrl;
      } else {
        console.warn(`[doc-proxy] Skipped fresh umroh pernyataan URL lookup for non-owned jamaah ${idJamaah}`);
      }
    }

    if (!targetUrl) return res.status(400).json({ error: 'URL parameter required' });

    // Security: only allow proxying to the known internal server
    const BASE_INTERNAL = process.env.INTERNAL_API_BASE || 'http://115.124.86.220';
    // Legacy hosts: bpih_url/surat_pernyataan_url scraped before INTERNAL_API_BASE
    // was repointed (e.g. via tunnel/proxy) are stored as absolute URLs to the old
    // host. Rewrite them to the current BASE_INTERNAL so old DB rows still resolve.
    const LEGACY_INTERNAL_HOSTS = ['http://115.124.86.220', 'https://115.124.86.220'];

    // Resolve relative paths
    if (targetUrl.startsWith('/')) {
      targetUrl = `${BASE_INTERNAL}${targetUrl}`;
    } else if (!targetUrl.startsWith('http')) {
      targetUrl = `${BASE_INTERNAL}/aiw/staff/pages/${targetUrl}`;
    } else {
      for (const legacy of LEGACY_INTERNAL_HOSTS) {
        if (targetUrl.startsWith(legacy)) {
          targetUrl = BASE_INTERNAL + targetUrl.slice(legacy.length);
          break;
        }
      }
    }

    // Block requests to anything outside the internal server
    if (!targetUrl.startsWith(BASE_INTERNAL)) {
      return res.status(403).json({ error: 'Forbidden: only internal documents allowed' });
    }

    // Get session cookies for PHP pages (pernyataan needs auth)
    const sessionCookies = agent?.jamaah_username ? getSessionCookie(agent.jamaah_username) : null;

    const headers = {};
    if (sessionCookies) headers['Cookie'] = sessionCookies;

    const response = await fetch(targetUrl, { headers, redirect: 'follow' });

    if (!response.ok) {
      if (cacheKey) {
        const cached = await getCachedJamaahDocument(req.user.id, cacheKey.idJamaah, cacheKey.documentType);
        if (cached) {
          return sendJamaahDocumentHtmlOrPdf(res, cached.content_html, {
            format,
            cacheStatus: 'STALE',
            filenameBase: `surat-pernyataan-${cacheKey.idJamaah}`,
          });
        }
      }
      return res.status(response.status).json({ error: `Failed to fetch document: ${response.status}` });
    }

    // Forward content type
    const contentType = response.headers.get('content-type');

    // Stream the response body
    const buffer = Buffer.from(await response.arrayBuffer());
    if (cacheKey && isCacheableHtmlDocument(contentType)) {
      const cachedRow = await saveCachedJamaahDocument({
        agentId: req.user.id,
        idJamaah: cacheKey.idJamaah,
        documentType: cacheKey.documentType,
        sourceUrl: targetUrl,
        contentType,
        buffer,
      });
      return sendJamaahDocumentHtmlOrPdf(res, cachedRow?.content_html || buffer.toString('utf8'), {
        format,
        cacheStatus: cachedRow ? 'MISS-STORED' : 'BYPASS',
        filenameBase: `surat-pernyataan-${cacheKey.idJamaah}`,
      });
    }

    if (format === 'pdf' && isCacheableHtmlDocument(contentType)) {
      return sendJamaahDocumentHtmlOrPdf(res, buffer.toString('utf8'), {
        format,
        cacheStatus: 'BYPASS',
      });
    }

    res.setHeader('Cache-Control', 'no-store, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    if (contentType) res.setHeader('Content-Type', contentType);
    const disposition = response.headers.get('content-disposition');
    if (disposition) res.setHeader('Content-Disposition', disposition);
    res.send(buffer);
  } catch (err) {
    console.error('[doc-proxy] Error:', err.message);
    res.status(500).json({ error: 'Gagal memuat dokumen' });
  }
}

// GET /api/haji/doc-proxy — proxy internal documents to avoid Mixed Content
app.get('/api/haji/doc-proxy', authMiddleware, proxyInternalDocument);

// GET /api/laporan/jamaah/doc-proxy — proxy Umroh documents from AWAPI/legacy
app.get('/api/laporan/jamaah/doc-proxy', authMiddleware, proxyInternalDocument);

// ──────────────────────────────────────────────
// Analytics API
// ──────────────────────────────────────────────
const VALID_EVENT_TYPES = ['login', 'feature', 'action', 'public'];
const VALID_PUBLIC_EVENTS = ['page_view', 'wa_click_public', 'inquiry_submitted', 'ask_ai_opened', 'ask_ai_chip_tapped', 'ask_ai_free_query', 'ask_ai_wa_clicked', 'bio_view'];

// Shared label dictionaries (used by /summary + /agent/:slug drill-down)
const FEATURE_LABELS = {
  open_jamaah: 'Jamaah', open_statistik: 'Statistik', open_kalkulasi: 'Kalkulasi',
  open_compare: 'Compare', open_capi: 'Meta CAPI', open_profil: 'Profil',
  open_jadwal: 'Jadwal', open_analytics: 'Analytics',
  open_ai_tools: 'AI Tools', open_voice_over: 'Voice Over', open_business_card: 'Kartu Nama',
  open_haji_plus: 'Haji Plus', open_jamaah_haji: 'Jamaah Haji',
  open_settings: 'Settings', open_tren_daftar: 'Tren Daftar',
  open_kurs: 'Kurs',
};
const ACTION_LABELS = {
  sync_jamaah: 'Sync Jamaah', generate_pdf: 'Generate PDF Quotation',
  share_screenshot: 'Share Screenshot', download_brosur: 'Download Brosur',
  download_itinerary: 'Download Itinerary', wa_click_jamaah: 'WA Click Jamaah',
  save_capi_config: 'Simpan Config CAPI', update_profil: 'Update Profil',
  change_password: 'Ganti Password',
  generate_script: 'Generate Script VO', generate_voice: 'Generate Voice VO',
  download_mp3: 'Download MP3', download_wav: 'Download WAV',
  generate_business_card: 'Generate Kartu Nama', download_business_card: 'Download Kartu Nama',
  export_haji_infographic: 'Export Infografis Haji',
  update_lead_status: 'Update Status Lead', delete_lead: 'Hapus Lead', wa_click_lead: 'WA Lead',
  sync_jamaah_haji: 'Sync Jamaah Haji', view_bpih_doc: 'Lihat BPIH',
  view_pernyataan_doc: 'Lihat Srt Pernyataan', wa_click_haji: 'WA Jamaah Haji',
  connect_telegram: 'Hubungkan Telegram', disconnect_telegram: 'Putuskan Telegram',
  update_notif_prefs: 'Update Notif Prefs',
  forgot_password: 'Lupa Password', reset_password: 'Reset Password',
  view_web_itinerary: 'Web Itinerary', view_flight_status: 'Flight Status',
  share_flight: 'Share Flight Status',
};
const ALL_EVENT_LABELS = {
  ...FEATURE_LABELS, ...ACTION_LABELS,
  login: 'Login', login_failed: 'Login Gagal',
  inquiry_submitted: 'Inquiry Masuk',
  page_view: 'Page View', wa_click_public: 'WA Click Public',
  ask_ai_opened: 'Ask AI Dibuka', ask_ai_chip_tapped: 'Ask AI Chip',
  ask_ai_free_query: 'Ask AI Query', ask_ai_wa_clicked: 'Ask AI WA',
};
const publicEventRateLimits = new Map(); // ip → { count, resetAt }

app.options('/api/analytics/:path', (req, res) => {
  res.set({
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  }).sendStatus(204);
});

// Authenticated event logging (frontend → backend)
app.post('/api/analytics/event', authMiddleware, async (req, res) => {
  const { eventType, eventName, metadata } = req.body;
  if (!eventType || !VALID_EVENT_TYPES.includes(eventType)) {
    return res.status(400).json({ error: 'Invalid eventType' });
  }
  if (!eventName || typeof eventName !== 'string' || eventName.length > 50) {
    return res.status(400).json({ error: 'Invalid eventName' });
  }
  if (req.user.role === 'admin') {
    return res.json({ success: true, skipped: true });
  }
  const result = await logAnalyticsEvent(req.user.id, eventType, eventName, metadata || {}, getClientIpUa(req));
  res.json({ success: result.ok, error: result.ok ? undefined : result.error });
});

// Public (unauthenticated) event logging
app.post('/api/analytics/public', async (req, res) => {
  const { slug, eventName, metadata } = req.body;
  if (!slug || !eventName) {
    return res.status(400).json({ error: 'slug and eventName required' });
  }
  if (!VALID_PUBLIC_EVENTS.includes(eventName)) {
    return res.status(400).json({ error: 'Invalid eventName' });
  }
  const { ip, userAgent } = getClientIpUa(req);
  const rateLimitKey = ip || 'unknown';
  // Rate limit: 30 req/min per IP
  const now = Date.now();
  const rl = publicEventRateLimits.get(rateLimitKey);
  if (rl && now < rl.resetAt) {
    if (rl.count >= 30) return res.status(429).json({ error: 'Rate limited' });
    rl.count++;
  } else {
    publicEventRateLimits.set(rateLimitKey, { count: 1, resetAt: now + 60000 });
  }
  // Validate slug exists
  const agent = await getAgentBySlug(slug.toLowerCase());
  if (!agent) return res.status(404).json({ error: 'Agent not found' });
  logAnalyticsEvent(agent.id, 'public', eventName, metadata || {}, { ip, userAgent });
  res.json({ success: true });
});

// Analytics summary (admin only)
app.get('/api/analytics/summary', authMiddleware, adminOnly, async (req, res) => {
  try {
    const now = new Date();
    const month = parseInt(req.query.month) || (now.getMonth() + 1);
    const year = parseInt(req.query.year) || now.getFullYear();
    const startOfMonth = new Date(year, month - 1, 1).toISOString();
    const endOfMonth = new Date(year, month, 0, 23, 59, 59, 999).toISOString();
    const period = `${year}-${String(month).padStart(2, '0')}`;

    // Dates for relative calculations
    const now3d = new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString();
    const now7d = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
    const now30d = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();

    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    sevenDaysAgo.setUTCHours(0, 0, 0, 0);
    const sevenDaysAgoISO = sevenDaysAgo.toISOString();

    // Period metrics use daily rollups for complete days and raw rows only for
    // days not yet aggregated. Current-health widgets read their own 7-day
    // window so past-month views don't accidentally hide today's activity.
    const [
      periodEvents,
      last7dEvents,
      { data: allAgents },
    ] = await Promise.all([
      fetchEventsForRange(supabase, startOfMonth, endOfMonth),
      fetchEventsForRange(supabase, sevenDaysAgoISO, now.toISOString()),
      supabase.from('agents').select('id, slug, name, photo'),
    ]);
    const { rawEvents, aggEvents } = periodEvents;
    const { rawEvents: last7dRawEvents, aggEvents: last7dAggEvents } = last7dEvents;

    // Overview — counts sum across raw + agg
    const totalLogins = countMatches(rawEvents, aggEvents, e => e.event_name === 'login');
    const totalPageViews = countMatches(rawEvents, aggEvents, e => e.event_name === 'page_view');
    const totalWAClicks = countMatches(
      rawEvents, aggEvents,
      e => e.event_name === 'wa_click_public' || e.event_name === 'wa_click_jamaah',
    );

    // Active agents (any event in the current 7-day window).
    const agentList = allAgents || [];
    const recentIds = new Set();
    for (const e of last7dRawEvents) if (e.agent_id) recentIds.add(e.agent_id);
    for (const e of last7dAggEvents) if (e.agent_id && e.count > 0) recentIds.add(e.agent_id);
    const activeAgents = recentIds.size;

    // Daily logins (current 7-day window).
    const dayNames = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
    const dailyLogins = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      const count = countMatches(
        last7dRawEvents,
        last7dAggEvents,
        e => e.event_name === 'login' && (e.created_at ? e.created_at.slice(0, 10) : e.date) === dateStr,
      );
      dailyLogins.push({ date: dateStr, day: dayNames[d.getDay()], count });
    }

    // Agent Activity. Per-agent metrics merge raw + agg.
    // lastActive: prefer raw timestamp (precise); fallback to agg max date (day-granular).
    // Precompute per-agent buckets — avoid O(A·R) nested filters.
    const rawByAgent = new Map();
    for (const e of rawEvents) {
      const arr = rawByAgent.get(e.agent_id);
      if (arr) arr.push(e);
      else rawByAgent.set(e.agent_id, [e]);
    }
    const aggByAgent = new Map();
    for (const a of aggEvents) {
      const arr = aggByAgent.get(a.agent_id);
      if (arr) arr.push(a);
      else aggByAgent.set(a.agent_id, [a]);
    }

    const agentActivity = agentList.map(agent => {
      const rawForAgent = rawByAgent.get(agent.id) ?? [];
      const aggForAgent = aggByAgent.get(agent.id) ?? [];

      const logins = countMatches(rawForAgent, aggForAgent, e => e.event_name === 'login');
      const featureClicks = countMatches(rawForAgent, aggForAgent, e => e.event_type === 'feature');
      const pageViews = countMatches(rawForAgent, aggForAgent, e => e.event_name === 'page_view');
      const waClicks = countMatches(
        rawForAgent, aggForAgent,
        e => e.event_name === 'wa_click_public' || e.event_name === 'wa_click_jamaah',
      );

      // lastActive: raw events are DESC-sorted, so [0] is the newest.
      const rawLast = rawForAgent[0]?.created_at || null;
      const aggMaxDate = aggForAgent.reduce((m, a) => (!m || a.date > m ? a.date : m), null);
      // Normalize agg date to end-of-day ISO for comparison
      const aggLast = aggMaxDate ? `${aggMaxDate}T23:59:59.999Z` : null;
      const lastActive = rawLast && aggLast
        ? (rawLast > aggLast ? rawLast : aggLast)
        : (rawLast || aggLast);

      let status = 'never';
      if (lastActive) {
        if (new Date(lastActive) >= new Date(now3d)) status = 'active';
        else if (new Date(lastActive) >= new Date(now7d)) status = 'inactive';
        else if (new Date(lastActive) >= new Date(now30d)) status = 'dormant';
      }

      return {
        slug: agent.slug, name: agent.name, photo: agent.photo,
        lastActive, logins, featureClicks, pageViews, waClicks, status,
      };
    });
    // Sort: most recent activity first. Agents with no activity at all go to the end.
    agentActivity.sort((a, b) => {
      if (!a.lastActive && !b.lastActive) return 0;
      if (!a.lastActive) return 1;
      if (!b.lastActive) return -1;
      return b.lastActive.localeCompare(a.lastActive);
    });

    // Feature Usage — merge raw + agg via tallyBy
    const featureMap = tallyBy(rawEvents, aggEvents, e => e.event_name, e => e.event_type === 'feature');
    const featureUsage = Object.entries(featureMap)
      .map(([feature, count]) => ({ feature, label: FEATURE_LABELS[feature] || feature, count }))
      .sort((a, b) => b.count - a.count);

    // Action Tracking — merge raw + agg via tallyBy
    const actionMap = tallyBy(rawEvents, aggEvents, e => e.event_name, e => e.event_type === 'action');
    const actionTracking = Object.entries(actionMap)
      .map(([action, count]) => ({ action, label: ACTION_LABELS[action] || action, count }))
      .sort((a, b) => b.count - a.count);

    // Health badge — always based on the current 7-day window.
    const last7dByAgent = new Map();
    for (const e of last7dRawEvents) {
      if (!e.agent_id) continue;
      let bucket = last7dByAgent.get(e.agent_id);
      if (!bucket) {
        bucket = { days: new Set(), features: new Set() };
        last7dByAgent.set(e.agent_id, bucket);
      }
      bucket.days.add(e.created_at.slice(0, 10));
      if (e.event_type === 'feature') bucket.features.add(e.event_name);
    }
    for (const e of last7dAggEvents) {
      if (!e.agent_id || e.count <= 0) continue;
      let bucket = last7dByAgent.get(e.agent_id);
      if (!bucket) {
        bucket = { days: new Set(), features: new Set() };
        last7dByAgent.set(e.agent_id, bucket);
      }
      bucket.days.add(e.date);
      if (e.event_type === 'feature') bucket.features.add(e.event_name);
    }
    const healthByAgent = new Map();
    for (const agent of agentList) {
      const bucket = last7dByAgent.get(agent.id);
      if (!bucket) { healthByAgent.set(agent.id, 'dormant'); continue; }
      let h;
      if (bucket.days.size >= 4 && bucket.features.size >= 3) h = 'excellent';
      else if (bucket.days.size >= 2 && bucket.features.size >= 1) h = 'good';
      else h = 'fair';
      healthByAgent.set(agent.id, h);
    }
    for (const a of agentActivity) {
      // Lookup by agent.id via the agentList mapping (agentActivity has slug, not id)
      const id = agentList.find(g => g.slug === a.slug)?.id;
      a.health = id ? (healthByAgent.get(id) || 'dormant') : 'dormant';
    }

    // Recent Activity (today, exclude page_view, max 10). Today is always in raw.
    const todayStr = now.toISOString().slice(0, 10);
    const agentNameMap = Object.fromEntries(agentList.map(a => [a.id, a.name]));
    const agentSlugMap = Object.fromEntries(agentList.map(a => [a.id, a.slug]));
    const recentActivity = last7dRawEvents
      .filter(e => e.agent_id && e.created_at.slice(0, 10) === todayStr && e.event_name !== 'page_view')
      .slice(0, 10)
      .map(e => ({
        agentSlug: agentSlugMap[e.agent_id] || e.agent_id,
        agentName: agentNameMap[e.agent_id] || e.agent_id,
        eventName: e.event_name,
        label: ALL_EVENT_LABELS[e.event_name] || e.event_name,
        createdAt: e.created_at,
      }));

    res.json({
      success: true,
      data: {
        period,
        overview: {
          totalLogins, activeAgents, totalAgents: agentList.length,
          totalPageViews, totalWAClicks,
        },
        dailyLogins,
        agentActivity,
        featureUsage,
        actionTracking,
        recentActivity,
      },
    });
  } catch (err) {
    console.error('[Analytics] Summary error:', err);
    res.status(500).json({ error: 'Failed to load analytics' });
  }
});

// Per-agent drill-down (admin only). Last 7 days. Raw events only — 7d ⊂ 14d retention.
app.get('/api/analytics/agent/:slug', authMiddleware, adminOnly, async (req, res) => {
  try {
    const slug = req.params.slug.toLowerCase();
    const agent = await getAgentBySlug(slug);
    if (!agent) return res.status(404).json({ error: 'Agent not found' });

    const now = Date.now();
    const startISO = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data: events, error } = await supabase
      .from('analytics_events')
      .select('event_type, event_name, metadata, created_at')
      .eq('agent_id', agent.id)
      .gte('created_at', startISO)
      .order('created_at', { ascending: false });
    if (error) throw error;
    const evList = events || [];

    // Jakarta (UTC+7, no DST) for user-facing day/hour labels
    const TZ_SHIFT = 7 * 60 * 60 * 1000;
    const toJakarta = (utcISO) => new Date(new Date(utcISO).getTime() + TZ_SHIFT);
    const DAY_NAMES = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

    // Build 7-day timeline + heatmap. Day keyed by Jakarta date.
    const jakartaNow = new Date(now + TZ_SHIFT);
    const todayJakartaMid = new Date(Date.UTC(jakartaNow.getUTCFullYear(), jakartaNow.getUTCMonth(), jakartaNow.getUTCDate()));
    const timeline = [];
    const heatmap = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(todayJakartaMid.getTime() - i * 24 * 60 * 60 * 1000);
      const dateStr = d.toISOString().slice(0, 10);
      const dayLabel = DAY_NAMES[d.getUTCDay()];
      const dayEvents = evList.filter(e => toJakarta(e.created_at).toISOString().slice(0, 10) === dateStr);
      timeline.push({
        date: dateStr, day: dayLabel,
        total: dayEvents.length,
        logins: dayEvents.filter(e => e.event_name === 'login').length,
        features: dayEvents.filter(e => e.event_type === 'feature').length,
        actions: dayEvents.filter(e => e.event_type === 'action').length,
        publicEvents: dayEvents.filter(e => e.event_type === 'public').length,
      });
      const hourCounts = new Array(24).fill(0);
      for (const e of dayEvents) hourCounts[toJakarta(e.created_at).getUTCHours()]++;
      heatmap.push({ date: dateStr, day: dayLabel, hourCounts });
    }

    // Summary counts over full 7d window
    const summary = {
      totalEvents: evList.length,
      logins: evList.filter(e => e.event_name === 'login').length,
      featureClicks: evList.filter(e => e.event_type === 'feature').length,
      actionClicks: evList.filter(e => e.event_type === 'action').length,
      pageViews: evList.filter(e => e.event_name === 'page_view').length,
      waClicks: evList.filter(e => e.event_name === 'wa_click_public' || e.event_name === 'wa_click_jamaah').length,
      activeDays: new Set(evList.map(e => toJakarta(e.created_at).toISOString().slice(0, 10))).size,
      uniqueFeatures: new Set(evList.filter(e => e.event_type === 'feature').map(e => e.event_name)).size,
    };

    // Feature/action breakdowns with labels
    const tally = (predicate) => {
      const m = {};
      for (const e of evList) if (predicate(e)) m[e.event_name] = (m[e.event_name] || 0) + 1;
      return m;
    };
    const featureBreakdown = Object.entries(tally(e => e.event_type === 'feature'))
      .map(([name, count]) => ({ name, label: FEATURE_LABELS[name] || name, count }))
      .sort((a, b) => b.count - a.count);
    const actionBreakdown = Object.entries(tally(e => e.event_type === 'action'))
      .map(([name, count]) => ({ name, label: ACTION_LABELS[name] || name, count }))
      .sort((a, b) => b.count - a.count);

    // Funnel: public traffic → engagement → conversion
    const sevenDaysAgoDate = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const { count: newJamaahCount } = await supabase
      .from('jamaah')
      .select('*', { count: 'exact', head: true })
      .eq('agent_id', agent.id)
      .gte('tgl_daftar', sevenDaysAgoDate);
    const funnel = {
      pageViews: summary.pageViews,
      inquirySubmitted: evList.filter(e => e.event_name === 'inquiry_submitted').length,
      waClickPublic: evList.filter(e => e.event_name === 'wa_click_public').length,
      newJamaah: newJamaahCount || 0,
    };

    // Recent events (newest 30, exclude page_view to surface meaningful actions)
    const recentEvents = evList
      .filter(e => e.event_name !== 'page_view')
      .slice(0, 30)
      .map(e => ({
        eventType: e.event_type,
        eventName: e.event_name,
        label: ALL_EVENT_LABELS[e.event_name] || e.event_name,
        createdAt: e.created_at,
      }));

    res.json({
      success: true,
      data: {
        agent: { slug: agent.slug, name: agent.name, photo: agent.photo },
        summary, timeline, heatmap, featureBreakdown, actionBreakdown, funnel, recentEvents,
      },
    });
  } catch (err) {
    console.error('[Analytics] Agent drill-down error:', err);
    res.status(500).json({ error: 'Failed to load agent analytics' });
  }
});

// ──────────────────────────────────────────────
// === AI TOOLS API ===
// ──────────────────────────────────────────────

// ── Credit helpers ──

const AI_AGENT_QUOTA = 25_000; // 25K chars per agent per month

function shouldResetCredits(firstUsedAt) {
  if (!firstUsedAt) return false;
  const now = new Date();
  const first = new Date(firstUsedAt);
  const daysDiff = (now - first) / (1000 * 60 * 60 * 24);
  return daysDiff >= 30;
}

// Get credit info for current agent
app.get('/api/ai-tools/credits', authMiddleware, async (req, res) => {
  try {
    const agentId = req.user.id;
    const quota = AI_AGENT_QUOTA;

    const { data: credit } = await supabase
      .from('ai_credits')
      .select('*')
      .eq('agent_id', agentId)
      .maybeSingle();

    let charsUsed = 0;
    let daysUntilReset = 30;

    if (credit) {
      if (shouldResetCredits(credit.first_used_at)) {
        await supabase
          .from('ai_credits')
          .update({ chars_used: 0, first_used_at: new Date().toISOString() })
          .eq('agent_id', agentId);
        charsUsed = 0;
        daysUntilReset = 30;
      } else {
        charsUsed = credit.chars_used || 0;
        if (credit.first_used_at) {
          const daysPassed = (new Date() - new Date(credit.first_used_at)) / (1000 * 60 * 60 * 24);
          daysUntilReset = Math.max(0, Math.ceil(30 - daysPassed));
        }
      }
    }

    const remaining = Math.max(0, quota - charsUsed);

    res.json({
      success: true,
      data: {
        quota,
        used: charsUsed,
        remaining,
        daysUntilReset,
        percentUsed: Math.round((charsUsed / quota) * 100),
      }
    });
  } catch (err) {
    console.error('[ai-credits] Error:', err);
    res.status(500).json({ error: 'Gagal mengambil data kredit' });
  }
});

// Generate promotional script from paket data using OpenAI
app.post('/api/ai-tools/generate-script', authMiddleware, async (req, res) => {
  try {
    const { paketData, duration } = req.body;

    if (!paketData) {
      return res.status(400).json({ error: 'Data paket diperlukan' });
    }

    const OPENAI_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_KEY) {
      return res.status(500).json({ error: 'OPENAI_API_KEY not configured' });
    }

    const charGuide = {
      10: { range: '30-50 karakter', max: 50, sentences: '1-2 kalimat pendek', tokens: 60 },
      20: { range: '60-100 karakter', max: 100, sentences: '2-3 kalimat', tokens: 120 },
      30: { range: '100-150 karakter', max: 150, sentences: '3-5 kalimat', tokens: 180 },
    };

    const guide = charGuide[duration] || charGuide[30];

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `Kamu adalah copywriter untuk travel umroh. Buat script voice over promosi yang catchy dan cocok untuk sosial media (Reels, TikTok, WA Status).

ATURAN KETAT:
- Bahasa Indonesia SANTAI dan GAUL, BUKAN bahasa baku/formal. Contoh: "Yuk", "Buruan", "Cuma", "Banget", "Udah", "Gak mau rugi kan?"
- MAKSIMAL ${guide.max} karakter. JANGAN LEBIH. Hitung karaktermu.
- Panjang ideal: ${guide.range} (${guide.sentences})
- Pakai kalimat pendek dan punchy, jangan berbelit-belit
- HINDARI kata-kata yang sulit diucapkan AI: kata asing, singkatan, angka desimal, istilah teknis
- Tulis angka dalam kata (contoh: "sembilan hari" bukan "9 hari", "dua puluh juta" bukan "20jt")
- Jangan gunakan emoji atau simbol
- Jangan gunakan sapaan waktu (pagi/siang/malam)
- Buka dengan hook yang bikin penasaran
- Sebutkan 1-2 keunggulan utama saja
- Tutup dengan ajakan yang bikin FOMO
- Jangan sebutkan nama agent
- Tulis HANYA script-nya, tanpa keterangan tambahan
- INGAT: durasi ${duration} detik = script SANGAT ${duration <= 10 ? 'PENDEK' : duration <= 20 ? 'SINGKAT' : 'RINGKAS'}`
          },
          {
            role: 'user',
            content: `Buat script voice over ${duration} detik (MAKSIMAL ${guide.max} karakter) untuk paket umroh ini:

Nama Paket: ${paketData.nama}
Tanggal Berangkat: ${paketData.tgl_berangkat}
Maskapai: ${paketData.maskapai || '-'}
Hotel Mekkah: ${paketData.hotel_mekkah || '-'}
Hotel Madinah: ${paketData.hotel_madinah || '-'}
Harga mulai: ${paketData.harga || '-'}
Seat tersisa: ${paketData.seat_sisa || '-'}`
          }
        ],
        max_tokens: guide.tokens,
        temperature: 0.7,
      }),
    });

    const data = await response.json();
    const generatedScript = data.choices?.[0]?.message?.content?.trim() || '';

    res.json({ success: true, data: { script: generatedScript } });
  } catch (err) {
    console.error('[ai-tools] Generate script error:', err);
    res.status(500).json({ error: 'Gagal generate script' });
  }
});

// Convert script to audio using Google Cloud TTS (Chirp 3: HD Indonesian voices)
app.post('/api/ai-tools/generate-voice', authMiddleware, async (req, res) => {
  try {
    const { script, voice, format = 'mp3' } = req.body;
    const agentId = req.user.id;

    if (!script || !voice) {
      return res.status(400).json({ error: 'Script dan voice diperlukan' });
    }

    if (script.length > 1000) {
      return res.status(400).json({ error: 'Script terlalu panjang (max 1000 karakter)' });
    }

    const validVoices = [
      // Wanita
      'id-ID-Chirp3-HD-Aoede', 'id-ID-Chirp3-HD-Kore',
      'id-ID-Chirp3-HD-Leda', 'id-ID-Chirp3-HD-Zephyr',
      // Pria
      'id-ID-Chirp3-HD-Puck', 'id-ID-Chirp3-HD-Charon',
      'id-ID-Chirp3-HD-Fenrir', 'id-ID-Chirp3-HD-Orus',
    ];
    if (!validVoices.includes(voice)) {
      return res.status(400).json({ error: 'Voice tidak valid' });
    }

    const apiKey = process.env.GOOGLE_TTS_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'Google TTS API key belum dikonfigurasi' });
    }

    // === Credit check ===
    const scriptLength = script.length;
    const quota = AI_AGENT_QUOTA;

    let { data: credit } = await supabase
      .from('ai_credits')
      .select('*')
      .eq('agent_id', agentId)
      .maybeSingle();

    if (!credit) {
      const now = new Date().toISOString();
      await supabase
        .from('ai_credits')
        .upsert({
          agent_id: agentId,
          chars_used: 0,
          first_used_at: now,
        });
      credit = { agent_id: agentId, chars_used: 0, first_used_at: now };
    }

    if (credit.first_used_at && shouldResetCredits(credit.first_used_at)) {
      await supabase
        .from('ai_credits')
        .update({ chars_used: 0, first_used_at: new Date().toISOString() })
        .eq('agent_id', agentId);
      credit.chars_used = 0;
    }

    const remaining = quota - (credit.chars_used || 0);

    if (scriptLength > remaining) {
      return res.status(403).json({
        error: 'QUOTA_EXCEEDED',
        message: `Kuota tidak cukup. Sisa: ${remaining} karakter, dibutuhkan: ${scriptLength} karakter.`,
        remaining,
        needed: scriptLength,
      });
    }

    // === Google Cloud TTS API call ===
    const audioEncoding = format === 'wav' ? 'LINEAR16' : 'MP3';

    const response = await fetch(
      `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: { text: script },
          voice: {
            languageCode: 'id-ID',
            name: voice,
          },
          audioConfig: {
            audioEncoding,
            sampleRateHertz: 24000,
            speakingRate: 1.1,
            effectsProfileId: ['headphone-class-device'],
          },
        }),
      }
    );

    const data = await response.json();

    if (!response.ok || !data.audioContent) {
      console.error('[ai-tools] Google TTS error:', data.error || data);
      return res.status(500).json({ error: 'Gagal generate voice over' });
    }

    // Deduct credits after successful TTS
    const newCharsUsed = (credit.chars_used || 0) + scriptLength;
    console.log(`[ai-credits] Deducting: agentId=${agentId}, old=${credit.chars_used || 0}, scriptLen=${scriptLength}, new=${newCharsUsed}`);
    const { error: deductError } = await supabase
      .from('ai_credits')
      .update({ chars_used: newCharsUsed })
      .eq('agent_id', agentId);
    if (deductError) {
      console.error('[ai-credits] Deduction FAILED:', deductError);
    } else {
      console.log(`[ai-credits] Deduction OK: agentId=${agentId} now at ${newCharsUsed} chars_used`);
    }

    const audioBuffer = Buffer.from(data.audioContent, 'base64');

    const contentType = format === 'wav' ? 'audio/wav' : 'audio/mpeg';
    const ext = format === 'wav' ? 'wav' : 'mp3';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="voiceover.${ext}"`);
    res.send(audioBuffer);

  } catch (err) {
    console.error('[ai-tools] Generate voice error:', err);
    res.status(500).json({ error: 'Gagal generate voice over' });
  }
});

app.get('/api/ai-tools/brosur-jadwal-bulan', authMiddleware, async (req, res) => {
  try {
    const monthsAhead = Math.max(1, Math.min(36, Number(req.query.monthsAhead) || 24));

    // Agent profile — for personalization in brochure footer
    const { data: agent, error: agentErr } = await supabase
      .from('agents')
      .select('slug, name, phone, photo, website')
      .eq('id', req.user.id)
      .maybeSingle();

    if (agentErr) {
      console.error('[brosur-jadwal] agent fetch:', agentErr.message);
      return res.status(500).json({ error: 'Failed to read agent' });
    }

    // Schedules — pull all years (table is small, <300 rows globally)
    const { data: rows, error: schedErr } = await supabase
      .from('umroh_schedules')
      .select('jadwal_id, jadwal_nama, maskapai, berangkat_tgl, pulang_tgl, berangkat_rute, seat_sisa, promo, paket_harga, paket_hotel');

    if (schedErr) {
      console.error('[brosur-jadwal] schedule fetch:', schedErr.message);
      return res.status(500).json({ error: 'Failed to read schedules' });
    }

    // Resolve brochure price per row; drop rows with no price
    const priced = [];
    let droppedNoPrice = 0;
    for (const r of (rows || [])) {
      const details = pickBrochurePackageDetails(r.paket_harga, r.paket_hotel);
      const seatSisa = parseSeatSisa(r.seat_sisa);
      const soldOut = seatSisa !== null && seatSisa <= 0;
      if (!details && !soldOut) {
        droppedNoPrice++;
        continue;
      }
      // Prefer duration declared in the raw name ("15HR") over date arithmetic —
      // packages with extensions (Turki, Cairo, Dubai) store dates for the umroh
      // leg only, so date math undercounts. Fall back to dates when name is silent.
      const hari = extractDurationFromName(r.jadwal_nama)
        ?? countBrochureTripDays(r.berangkat_tgl, r.pulang_tgl);
      priced.push({
        id: r.jadwal_id,
        nama: cleanBrochurePackageName(r.jadwal_nama),
        maskapai: String(r.maskapai || '').toUpperCase(),
        berangkat_tgl: r.berangkat_tgl,
        pulang_tgl: r.pulang_tgl,
        hari,
        hotel: details?.hotel || [],
        harga: details?.harga ?? null,
        soldOut,
        isPromo: String(r.promo || '') === '1',
        umrohDulu: isUmrohFirstRoute(r.berangkat_rute),
      });
    }
    if (droppedNoPrice > 0) {
      console.log(`[brosur-jadwal] dropped ${droppedNoPrice} packages with no resolvable price`);
    }

    // Schedules are Indonesian business data; use Jakarta's calendar day as
    // the source of truth, then pass a UTC-midnight Date into the pure helper.
    const today = new Date(`${getWIBDateStr()}T00:00:00.000Z`);
    const months = groupPackagesByMonth(priced, today, monthsAhead);

    res.json({
      months,
      agent: {
        slug: agent?.slug || '',
        name: agent?.name || '',
        phone: agent?.phone || '',
        photo: agent?.photo || '',
        website: agent?.website || '',
      },
    });
  } catch (err) {
    console.error('[brosur-jadwal] unexpected:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});

// ──────────────────────────────────────────────
// Flight Share API (MUST be before /api/{*path} catch-all proxy)
// ──────────────────────────────────────────────

function generateShareCode(length = 8) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  const bytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i++) {
    result += chars[bytes[i] % chars.length];
  }
  return result;
}

// POST /api/flight-share — Create or retrieve share link (auth required)
app.post('/api/flight-share', authMiddleware, async (req, res) => {
  try {
    const agentId = req.user.id;
    const {
      flight_number, flight_date, dep_iata, arr_iata,
      dep_city, arr_city, dep_time, arr_time, duration,
      group_number, pax, tour_leader, airline_code, flight_status,
    } = req.body;

    if (!flight_number || !flight_date || !dep_iata || !arr_iata) {
      return res.status(400).json({ error: 'flight_number, flight_date, dep_iata, arr_iata wajib diisi' });
    }

    // Cek apakah sudah pernah di-share (UNIQUE constraint: agent + flight + date)
    const { data: existing } = await supabase
      .from('flight_shares')
      .select('code')
      .eq('agent_id', agentId)
      .eq('flight_number', flight_number)
      .eq('flight_date', flight_date)
      .single();

    if (existing) {
      // Update data terbaru (jadwal bisa berubah)
      await supabase
        .from('flight_shares')
        .update({
          dep_city, arr_city, dep_time, arr_time, duration,
          group_number, pax, tour_leader, airline_code,
          flight_status: flight_status || 'scheduled',
        })
        .eq('code', existing.code);

      return res.json({
        success: true,
        data: {
          code: existing.code,
          url: `https://alhijaz.co/f/${existing.code}`,
        },
      });
    }

    // Generate kode baru
    let code = generateShareCode(8);

    // Pastikan unik (sangat jarang collision, tapi safety check)
    let attempts = 0;
    while (attempts < 5) {
      const { data: check } = await supabase
        .from('flight_shares')
        .select('code')
        .eq('code', code)
        .single();
      if (!check) break;
      code = generateShareCode(8);
      attempts++;
    }

    const { error } = await supabase
      .from('flight_shares')
      .insert({
        code,
        agent_id: agentId,
        flight_number,
        flight_date,
        dep_iata,
        arr_iata,
        dep_city: dep_city || null,
        arr_city: arr_city || null,
        dep_time: dep_time || null,
        arr_time: arr_time || null,
        duration: duration || null,
        group_number: group_number || null,
        pax: pax || null,
        tour_leader: tour_leader || null,
        airline_code: airline_code || null,
        flight_status: flight_status || 'scheduled',
      });

    if (error) throw error;

    console.log(`[FlightShare] Created: ${code} for ${agentSlug} — ${flight_number} ${flight_date}`);

    res.json({
      success: true,
      data: {
        code,
        url: `https://alhijaz.co/f/${code}`,
      },
    });
  } catch (err) {
    console.error('[FlightShare] Create error:', err.message);
    res.status(500).json({ error: 'Gagal membuat share link' });
  }
});

// GET /api/flight-share/:code — Get flight share data (public, no auth)
// Enriches stored snapshot with live data from flight_status table
app.get('/api/flight-share/:code', async (req, res) => {
  try {
    const { code } = req.params;

    const { data: share, error } = await supabase
      .from('flight_shares')
      .select('*')
      .eq('code', code)
      .single();

    if (error || !share) {
      return res.status(404).json({ error: 'Link tidak ditemukan' });
    }

    // Ambil data agent
    const { data: agent } = await supabase
      .from('agents')
      .select('id, name, phone, email, photo, website, slug')
      .eq('id', share.agent_id)
      .single();

    // --- Live data enrichment ---
    // Try to find matching live flight data from flight_status table
    // flight_status.id format: "YYYY-MM-DD_SV821"
    const flightIata = share.flight_number.replace(/\s+/g, '');
    const liveId = `${share.flight_date}_${flightIata}`;

    let liveDepTime = share.dep_time;
    let liveArrTime = share.arr_time;
    let liveDuration = share.duration;
    let liveStatus = share.flight_status || 'scheduled';

    const { data: liveData } = await supabase
      .from('flight_status')
      .select('dep_scheduled, dep_actual, arr_scheduled, arr_estimated, status, duration')
      .eq('id', liveId)
      .single();

    if (liveData) {
      // Use actual/estimated times if available, fall back to scheduled
      const depTime = extractHHmm(liveData.dep_actual) || extractHHmm(liveData.dep_scheduled);
      const arrTime = extractHHmm(liveData.arr_estimated) || extractHHmm(liveData.arr_scheduled);
      if (depTime) liveDepTime = depTime;
      if (arrTime) liveArrTime = arrTime;
      if (liveData.status) liveStatus = liveData.status;

      // Format duration from minutes to human-readable
      if (liveData.duration && liveData.duration > 0) {
        const h = Math.floor(liveData.duration / 60);
        const m = liveData.duration % 60;
        liveDuration = h > 0 && m > 0 ? `${h} jam ${m} menit`
          : h > 0 ? `${h} jam`
          : `${m} menit`;
      }
    }

    // Also update the stored share data if live differs (keep it fresh)
    const needsUpdate = liveData && (
      liveDepTime !== share.dep_time ||
      liveArrTime !== share.arr_time ||
      liveStatus !== (share.flight_status || 'scheduled')
    );
    if (needsUpdate) {
      supabase
        .from('flight_shares')
        .update({
          dep_time: liveDepTime,
          arr_time: liveArrTime,
          duration: liveDuration,
          flight_status: liveStatus,
        })
        .eq('code', code)
        .then(() => {})
        .catch(() => {});
    }

    res.json({
      success: true,
      data: {
        flight: {
          flight_number: share.flight_number,
          flight_date: share.flight_date,
          dep_iata: share.dep_iata,
          arr_iata: share.arr_iata,
          dep_city: share.dep_city,
          arr_city: share.arr_city,
          dep_time: liveDepTime,
          arr_time: liveArrTime,
          duration: liveDuration,
          group_number: share.group_number,
          pax: share.pax,
          tour_leader: share.tour_leader,
          airline_code: share.airline_code,
          flight_status: liveStatus,
          created_at: share.created_at,
        },
        agent: agent || null,
      },
    });
  } catch (err) {
    console.error('[FlightShare] Fetch error:', err.message);
    res.status(500).json({ error: 'Gagal mengambil data' });
  }
});

// ──────────────────────────────────────────────
// Haji Plus API (MUST be before /api/{*path} catch-all proxy)
// ──────────────────────────────────────────────
app.get('/api/haji-plus/data', authMiddleware, async (req, res) => {
  try {
    const cached = await getHajiPlusData();

    if (!cached || !cached.data || cached.data.length === 0) {
      return res.status(404).json({ error: 'Data belum tersedia' });
    }

    const data = cached.data;
    const total = data.reduce((s, d) => s + d.pax, 0);
    const avg = Math.round(total / data.length);
    const peak = data.reduce((max, d) => d.pax > max.pax ? d : max, data[0]);
    const min = data.reduce((mn, d) => d.pax < mn.pax ? d : mn, data[0]);
    const currentYear = new Date().getFullYear();
    const current = data.find(d => d.year === currentYear) || null;

    res.json({
      success: true,
      data: {
        items: data,
        total,
        average: avg,
        peak,
        min,
        current,
        yearCount: data.length,
        synced_at: cached.synced_at,
      },
    });
  } catch (err) {
    console.error('[HajiPlus] API error:', err);
    res.status(500).json({ error: 'Gagal mengambil data' });
  }
});

// ─── WEATHER ENDPOINT ────────────────────────────────────────────
const WEATHER_CITIES = [
  { key: 'makkah',     name: 'Mekkah',     country: 'Arab Saudi', flag: '🇸🇦', lat: 21.3891, lon: 39.8579, tz: 'Asia/Riyadh' },
  { key: 'madinah',    name: 'Madinah',    country: 'Arab Saudi', flag: '🇸🇦', lat: 24.5247, lon: 39.5692, tz: 'Asia/Riyadh' },
  { key: 'istanbul',   name: 'Istanbul',   country: 'Türkiye',    flag: '🇹🇷', lat: 41.0082, lon: 28.9784, tz: 'Europe/Istanbul' },
  { key: 'cappadocia', name: 'Cappadocia', country: 'Türkiye',    flag: '🇹🇷', lat: 38.6431, lon: 34.8287, tz: 'Europe/Istanbul' },
  { key: 'dubai',      name: 'Dubai',      country: 'UAE',        flag: '🇦🇪', lat: 25.2048, lon: 55.2708, tz: 'Asia/Dubai' },
  { key: 'hainan',     name: 'Hainan',     country: 'China',      flag: '🇨🇳', lat: 18.2528, lon: 109.5120, tz: 'Asia/Shanghai' },
];

let weatherCache = null;
let weatherCacheTime = 0;
let weatherCacheTTL = 60 * 60 * 1000;
const WEATHER_CACHE_TTL_FULL = 60 * 60 * 1000;     // 1 jam untuk data lengkap
const WEATHER_CACHE_TTL_PARTIAL = 10 * 60 * 1000;   // 10 menit untuk data tidak lengkap

const wmoMap = (code) => {
  if (code === 0)              return { label: 'Cerah',            icon: '☀️' };
  if (code <= 2)              return { label: 'Cerah berawan',    icon: '🌤️' };
  if (code === 3)             return { label: 'Mendung',          icon: '☁️' };
  if (code <= 49)             return { label: 'Berkabut',         icon: '🌫️' };
  if (code <= 57)             return { label: 'Gerimis',          icon: '🌦️' };
  if (code <= 67)             return { label: 'Hujan',            icon: '🌧️' };
  if (code <= 77)             return { label: 'Salju',            icon: '❄️' };
  if (code <= 82)             return { label: 'Hujan lebat',      icon: '🌧️' };
  if (code <= 86)             return { label: 'Salju lebat',      icon: '❄️' };
  if (code <= 99)             return { label: 'Badai petir',      icon: '⛈️' };
  return { label: 'N/A', icon: '🌡️' };
};

const DAYS_ID = ['Min','Sen','Sel','Rab','Kam','Jum','Sab'];

async function fetchCityWeather(city) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${city.lat}&longitude=${city.lon}` +
    `&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,uv_index` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min` +
    `&timezone=${encodeURIComponent(city.tz)}&forecast_days=4`;

  const resp = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!resp.ok) throw new Error(`Open-Meteo error for ${city.key}: ${resp.status}`);
  const raw = await resp.json();

  const cur = raw.current;
  const daily = raw.daily;

  const forecast = daily.time.slice(1, 4).map((dateStr, i) => {
    const d = new Date(dateStr);
    return {
      day: DAYS_ID[d.getDay()],
      icon: wmoMap(daily.weather_code[i + 1]).icon,
      tempMin: Math.round(daily.temperature_2m_min[i + 1]),
      tempMax: Math.round(daily.temperature_2m_max[i + 1]),
    };
  });

  const uvIndex = Math.round(cur.uv_index ?? 0);
  const uvLabel = uvIndex <= 2 ? 'Rendah' : uvIndex <= 5 ? 'Sedang' : uvIndex <= 7 ? 'Tinggi' : 'Sgt Tinggi';

  return {
    key: city.key,
    name: city.name,
    country: city.country,
    flag: city.flag,
    temp: Math.round(cur.temperature_2m),
    feelsLike: Math.round(cur.apparent_temperature),
    humidity: Math.round(cur.relative_humidity_2m),
    windSpeed: Math.round(cur.wind_speed_10m),
    uvIndex,
    uvLabel,
    weatherCode: cur.weather_code,
    ...wmoMap(cur.weather_code),
    tempMin: Math.round(daily.temperature_2m_min[0]),
    tempMax: Math.round(daily.temperature_2m_max[0]),
    forecast,
  };
}

app.get('/api/weather/cities', authMiddleware, async (req, res) => {
  try {
    const now = Date.now();
    if (weatherCache && (now - weatherCacheTime) < weatherCacheTTL) {
      return res.json({ success: true, data: weatherCache, cached: true });
    }

    // Fetch cities sequentially with small delay to avoid Open-Meteo rate limit (429)
    const results = [];
    const failed = [];
    for (const city of WEATHER_CITIES) {
      try {
        const data = await fetchCityWeather(city);
        results.push(data);
      } catch (err) {
        console.warn(`[Weather] ${city.key} failed: ${err.message}`);
        failed.push(city);
      }
      // Small delay between requests to stay under rate limit
      if (city !== WEATHER_CITIES[WEATHER_CITIES.length - 1]) {
        await new Promise(r => setTimeout(r, 300));
      }
    }

    // Retry failed cities once (after a longer pause)
    if (failed.length > 0 && failed.length < WEATHER_CITIES.length) {
      console.warn(`[Weather] Retrying ${failed.length} failed cities...`);
      await new Promise(r => setTimeout(r, 2000));
      for (const city of failed) {
        try {
          const data = await fetchCityWeather(city);
          results.push(data);
          console.log(`[Weather] Retry recovered: ${city.key}`);
        } catch (err) {
          console.warn(`[Weather] Retry still failed: ${city.key} — ${err.message}`);
        }
        await new Promise(r => setTimeout(r, 300));
      }
    }

    // Merge with existing cache: keep stale data for cities still missing
    if (weatherCache && results.length < WEATHER_CITIES.length) {
      const resultKeys = new Set(results.map(r => r.key));
      for (const cached of weatherCache) {
        if (!resultKeys.has(cached.key)) {
          results.push(cached);
        }
      }
    }

    if (results.length === 0) {
      if (weatherCache) {
        return res.json({ success: true, data: weatherCache, cached: true, stale: true });
      }
      return res.status(502).json({ error: 'Gagal mengambil data cuaca dari semua kota' });
    }

    // Use shorter TTL when results are incomplete
    const isComplete = results.length === WEATHER_CITIES.length;
    weatherCache = results;
    weatherCacheTime = now;
    weatherCacheTTL = isComplete ? WEATHER_CACHE_TTL_FULL : WEATHER_CACHE_TTL_PARTIAL;
    res.json({ success: true, data: results, cached: false });
  } catch (err) {
    console.error('[Weather] fetch error:', err.message);
    if (weatherCache) {
      return res.json({ success: true, data: weatherCache, cached: true, stale: true });
    }
    res.status(500).json({ error: 'Gagal mengambil data cuaca' });
  }
});

// ──────────────────────────────────────────────
// Portal Jamaah — backend API for jamaah-facing booking portal
// ──────────────────────────────────────────────
const PORTAL_BASE_URL = process.env.PORTAL_BASE_URL || 'https://alhijaz.co';
const PORTAL_SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const PORTAL_LINK_AFTER_DEPARTURE_DAYS = 14;
const portalGenerateRateLimits = new Map();
const portalConsumeRateLimits = new Map();
const portalPersiapanRateLimits = new Map();
const portalRequestBookingRateLimits = new Map();
const PORTAL_MAGIC_CODE_LETTERS = 'abcdefghjkmnpqrstuvwxyz';
const PORTAL_MAGIC_CODE_DIGITS = '23456789';
const PORTAL_MAGIC_CODE_CHARS = `${PORTAL_MAGIC_CODE_LETTERS}${PORTAL_MAGIC_CODE_DIGITS}`;
const PORTAL_MAGIC_CODE_REGEX = /^(?=.*[a-z])(?=.*[2-9])[a-z2-9]{5}$/i;
const PORTAL_SHORT_CODE_REGEX = /^[a-z0-9]{5}$/i;

function normalizePortalSlug(slug) {
  return String(slug || '').toLowerCase().trim();
}

function pickPortalMagicChar(chars) {
  return chars[crypto.randomInt(chars.length)];
}

function shufflePortalMagicCode(chars) {
  const result = [...chars];
  for (let i = result.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result.join('');
}

function generatePortalMagicCode() {
  const chars = [
    pickPortalMagicChar(PORTAL_MAGIC_CODE_LETTERS),
    pickPortalMagicChar(PORTAL_MAGIC_CODE_DIGITS),
  ];
  while (chars.length < 5) {
    chars.push(pickPortalMagicChar(PORTAL_MAGIC_CODE_CHARS));
  }
  return shufflePortalMagicCode(chars);
}

function isPortalMagicCode(value) {
  return PORTAL_MAGIC_CODE_REGEX.test(String(value || '').trim());
}

function buildPortalStoredToken(slug, code) {
  return `${normalizePortalSlug(slug)}:${String(code || '').toLowerCase()}`;
}

function parsePortalMagicCode(token) {
  const text = String(token || '').trim();
  const parts = text.split(':');
  if (parts.length === 2 && PORTAL_SHORT_CODE_REGEX.test(parts[1])) return parts[1].toLowerCase();
  return text;
}

function isPortalStoredMagicToken(token) {
  const parts = String(token || '').trim().split(':');
  return parts.length === 2 && isPortalMagicCode(parts[1]);
}

function formatPortalMagicUrl(slug, token) {
  return `${PORTAL_BASE_URL}/${normalizePortalSlug(slug)}/jamaah/${parsePortalMagicCode(token)}`;
}

function resolvePortalConsumeToken(slug, token) {
  const rawToken = String(token || '').trim().toLowerCase();
  if (slug && isPortalMagicCode(rawToken)) return buildPortalStoredToken(slug, rawToken);
  return rawToken;
}

function getPortalMagicLinkExpiresAt(tgl_berangkat) {
  const ymd = String(tgl_berangkat || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const departureStartWib = Date.parse(`${ymd}T00:00:00.000+07:00`);
  if (!Number.isFinite(departureStartWib)) return null;
  return new Date(departureStartWib + ((PORTAL_LINK_AFTER_DEPARTURE_DAYS + 1) * 86400000) - 1).toISOString();
}

function portalBookingHasDp(row) {
  return toMoney(row?.bayar) > 0 || toMoney(row?.sisa) <= 0;
}

async function insertPortalMagicToken({ slug, jamaah_id, id_umroh, agent_id, expires_at }) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = generatePortalMagicCode();
    const token = buildPortalStoredToken(slug, code);
    const { error } = await supabase.from('jamaah_portal_tokens').insert({
      token,
      jamaah_id,
      id_umroh,
      agent_id,
      expires_at,
    });
    if (!error) return { token };
    if (error.code === '23505' || /duplicate key/i.test(error.message || '')) continue;
    return { error };
  }
  return { error: new Error('token_collision') };
}

// Kept in server.js because this file runs directly in Node. The matching
// frontend/shared TypeScript version lives in src/constants/persiapan-defaults.ts.
const TAHAPAN_DEFAULTS = [
  { id: 'dp_dibayar', title: 'DP keluarga dibayar', description: 'Pembayaran awal sudah masuk', phase: 'sekarang', autoSyncFrom: 'bayar_lunas' },
  { id: 'vaksin_meningitis', title: 'Vaksin Meningitis', description: 'Sertifikat ICV untuk semua jamaah', phase: 'sekarang', autoSyncFrom: 'vaksin_dokumen' },
  { id: 'pelunasan', title: 'Pelunasan sisa pembayaran', description: 'Sisa pembayaran sebelum H-30', phase: 'sekarang', autoSyncFrom: 'bayar_lunas', crossLink: 'bayar' },
  { id: 'fisik_sehat', title: 'Persiapan fisik & kesehatan', description: 'Jalan kaki rutin, jaga pola makan, cek tensi', phase: 'sekarang' },
  { id: 'manasik_hadir', title: 'Hadir Manasik Bersama', description: 'Sesuai jadwal dari agent', phase: 'h30' },
  { id: 'perlengkapan_ambil', title: 'Ambil perlengkapan dari kantor', description: 'Ihram, buku doa, ID card, dll', phase: 'h30', crossLink: 'perlengkapan' },
  { id: 'paspor_final', title: 'Pastikan paspor & dokumen final', description: 'Cek paspor expired & kelengkapan', phase: 'h30', crossLink: 'dokumen' },
  { id: 'packing_koper', title: 'Packing koper', description: 'Bawa list barang dari agent', phase: 'h7' },
  { id: 'cek_ulang', title: 'Cek ulang koper & dokumen', description: 'Pastikan paspor, ihram, obat-obatan', phase: 'h7' },
  { id: 'urus_rumah', title: 'Selesaikan urusan di rumah', description: 'Titip rumah, pet, kerjaan', phase: 'h7' },
  { id: 'konfirmasi_agent', title: 'Konfirmasi ulang ke agent', description: 'Jam kumpul di bandara', phase: 'h1' },
  { id: 'niat_azam', title: 'Persiapan mental: niat & azam', description: 'Mantapkan niat ibadah', phase: 'h1' },
  { id: 'tidur_cukup', title: 'Tidur cukup', description: 'Berangkat dalam kondisi prima', phase: 'h1' },
];

const SPIRITUAL_DEFAULTS = [
  { id: 'hafal_niat_umroh', title: 'Hafal niat umroh', description: "Labbaika 'umratan", category: 'niat_doa', resourceUrl: 'https://www.youtube.com/results?search_query=niat+umroh' },
  { id: 'hafal_doa_tawaf', title: 'Hafal doa tawaf', description: 'Doa per putaran (7 putaran)', category: 'niat_doa', resourceUrl: 'https://www.youtube.com/results?search_query=doa+tawaf' },
  { id: 'hafal_doa_sai', title: "Hafal doa sa'i", description: 'Doa di Shafa & Marwah', category: 'niat_doa', resourceUrl: 'https://www.youtube.com/results?search_query=doa+sai' },
  { id: 'hafal_talbiyah', title: 'Hafal talbiyah', description: 'Labbaikallahumma labbaik...', category: 'niat_doa', resourceUrl: 'https://www.youtube.com/results?search_query=talbiyah' },
  { id: 'rukun_umroh', title: 'Rukun umroh', description: '5 rukun yang wajib dilakukan', category: 'ilmu_manasik' },
  { id: 'wajib_umroh', title: 'Wajib umroh', description: 'Wajib yang jika ditinggalkan kena dam', category: 'ilmu_manasik' },
  { id: 'larangan_ihram', title: 'Larangan ihram', description: 'Hal-hal yang tidak boleh saat ihram', category: 'ilmu_manasik' },
  { id: 'tobat_istighfar', title: 'Tobat & istighfar', description: 'Bersihkan hati sebelum berangkat', category: 'persiapan_hati' },
  { id: 'mohon_maaf', title: 'Mohon maaf ke keluarga', description: 'Silaturahmi sebelum berangkat', category: 'persiapan_hati' },
  { id: 'mantap_niat', title: 'Memantapkan niat', description: 'Ibadah karena Allah, bukan riya', category: 'persiapan_hati' },
];

const PERLENGKAPAN_DEFAULTS = [
  { id: 'koper_besar', title: 'Koper besar', icon: 'briefcase', handover: 'dp' },
  { id: 'tas_kabin', title: 'Tas kabin', icon: 'backpack', handover: 'dp' },
  { id: 'tas_paspor', title: 'Tas paspor', icon: 'wallet', handover: 'dp' },
  { id: 'ihram', title: 'Ihram', icon: 'shirt', handover: 'manasik' },
  { id: 'buku_doa', title: 'Buku doa & manasik', icon: 'book', handover: 'manasik' },
  { id: 'id_card', title: 'ID card jamaah', icon: 'id-card', handover: 'manasik' },
  { id: 'sabuk_ihram', title: 'Sabuk pinggang ihram', icon: 'belt', handover: 'manasik' },
];

function checkPortalRateLimit(map, key, max, windowMs) {
  const now = Date.now();
  const entry = map.get(key);
  if (!entry || now >= entry.resetAt) {
    map.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true };
  }
  if (entry.count >= max) {
    return { ok: false, retryAfter: Math.ceil((entry.resetAt - now) / 1000) };
  }
  entry.count++;
  return { ok: true };
}

function portalRateLimit(map, keyFn, max, windowMs) {
  return (req, res, next) => {
    const key = keyFn(req) || 'unknown';
    const result = checkPortalRateLimit(map, key, max, windowMs);
    if (!result.ok) {
      if (result.retryAfter) res.set('Retry-After', String(result.retryAfter));
      return res.status(429).json({
        error: 'rate_limited',
        retry_after: result.retryAfter || 0,
        message: `Terlalu sering membuat link. Coba lagi dalam ${Math.ceil((result.retryAfter || 60) / 60)} menit.`,
      });
    }
    next();
  };
}

function portalSchemaMissingResponse(res, error) {
  const message = String(error?.message || '');
  if (!/schema cache|Could not find the table|jamaah_portal_|booking_persiapan/i.test(message)) {
    return false;
  }
  return res.status(503).json({
    error: 'portal_schema_missing',
    message: 'Migration Portal Jamaah belum dijalankan di Supabase. Jalankan migrations/20260515000000_portal_jamaah.sql lalu coba lagi.',
  });
}

function getPortalCookie(req, name) {
  const raw = req.headers?.cookie;
  if (!raw) return null;
  for (const part of raw.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    if (key !== name) continue;
    try {
      return decodeURIComponent(part.slice(idx + 1).trim());
    } catch {
      return part.slice(idx + 1).trim();
    }
  }
  return null;
}

function getPortalSessionToken(req) {
  const auth = req.headers.authorization || '';
  if (auth.startsWith('Bearer ')) return auth.replace('Bearer ', '').trim();
  return req.cookies?.jamaah_session || getPortalCookie(req, 'jamaah_session');
}

function getPortalCookieOptions(req, maxAge = PORTAL_SESSION_TTL_MS) {
  const forwardedProto = req.headers?.['x-forwarded-proto'];
  const isHttps = req.secure || forwardedProto === 'https';
  return {
    httpOnly: true,
    secure: isHttps,
    sameSite: 'lax',
    path: '/',
    maxAge,
  };
}

async function portalJamaahAuth(req, res, next) {
  const token = getPortalSessionToken(req);
  if (!token) return res.status(401).json({ error: 'no_session' });

  try {
    const { data: session, error } = await supabase
      .from('jamaah_portal_sessions')
      .select('*')
      .eq('session_token', token)
      .maybeSingle();

    if (error) return res.status(500).json({ error: error.message });
    if (!session) return res.status(401).json({ error: 'invalid_session' });
    if (new Date(session.expires_at) < new Date()) return res.status(401).json({ error: 'expired' });

    supabase
      .from('jamaah_portal_sessions')
      .update({ last_active_at: new Date().toISOString() })
      .eq('session_token', token)
      .then(() => {});

    req.portalSession = session;
    req.portalSessionToken = token;
    next();
  } catch (err) {
    console.error('[PortalJamaah] auth error:', err.message);
    res.status(500).json({ error: 'Gagal memvalidasi session' });
  }
}

const portalGenerateLimiter = portalRateLimit(
  portalGenerateRateLimits,
  (req) => `agent:${req.user?.id || 'unknown'}`,
  10,
  60 * 60 * 1000
);

const portalConsumeLimiter = portalRateLimit(
  portalConsumeRateLimits,
  (req) => `ip:${getClientIpUa(req).ip || 'unknown'}`,
  20,
  60 * 1000
);

const portalPersiapanLimiter = portalRateLimit(
  portalPersiapanRateLimits,
  (req) => `session:${req.portalSession?.session_token || req.portalSessionToken || 'unknown'}`,
  60,
  60 * 1000
);

const portalRequestBookingLimiter = portalRateLimit(
  portalRequestBookingRateLimits,
  (req) => `ip:${getClientIpUa(req).ip || 'unknown'}`,
  5,
  60 * 60 * 1000
);

function normalizePortalWaNumber(wa) {
  let cleaned = String(wa || '').replace(/\D/g, '');
  if (!cleaned) return null;
  if (cleaned.startsWith('620')) cleaned = '62' + cleaned.slice(3);
  else if (cleaned.startsWith('0')) cleaned = '62' + cleaned.slice(1);
  else if (cleaned.startsWith('8')) cleaned = '62' + cleaned;
  else if (/^62[^8]\d{7,11}$/.test(cleaned)) cleaned = '628' + cleaned.slice(2);
  return /^628\d{7,12}$/.test(cleaned) ? cleaned : null;
}

async function getPortalDashboardAgent(req, slug) {
  const requestedSlug = String(slug || '').toLowerCase();
  const targetAgent = await getAgentBySlug(requestedSlug);
  if (!targetAgent) return { error: 'agent_not_found', status: 404 };

  if (req.user?.role === 'admin') {
    return { agent: targetAgent };
  }

  const currentAgent = await getAgentById(req.user?.id);
  if (!currentAgent || currentAgent.id !== targetAgent.id) {
    return { error: 'forbidden', status: 403 };
  }
  return { agent: targetAgent };
}

function portalNormalizeName(value) {
  return String(value || '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function portalDaysUntil(dateStr) {
  if (!dateStr) return null;
  const ymd = String(dateStr).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const today = Date.parse(`${getWIBDateStr()}T00:00:00.000Z`);
  const target = Date.parse(`${ymd}T00:00:00.000Z`);
  if (!Number.isFinite(target)) return null;
  return Math.ceil((target - today) / 86400000);
}

function portalPaymentPct(row) {
  const bayar = toMoney(row?.bayar);
  const sisa = toMoney(row?.sisa);
  const total = bayar + Math.max(0, sisa);
  if (total <= 0) return bayar > 0 ? 100 : 0;
  return Math.max(0, Math.min(100, Math.round((bayar / total) * 100)));
}

const PORTAL_DOCUMENT_KEYS = ['paspor', 'ktp', 'vaksin', 'foto_46', 'buku_nikah'];

function portalDocValue(dokumen, keys) {
  const src = dokumen && typeof dokumen === 'object' ? dokumen : {};
  return keys.some((key) => {
    const value = src[key];
    if (value === true || value === 1) return true;
    if (!value || typeof value !== 'object') return false;
    return value.verified === true
      || value.uploaded === true
      || value.checked === true
      || value.status === 'diambil'
      || value.status === 'verified'
      || value.status === 'lengkap';
  });
}

function portalPasporReady(row) {
  const hasNumber = Boolean(String(row?.no_paspor || '').trim());
  const docReady = portalDocValue(row?.dokumen, ['paspor', 'passport']);
  if (!hasNumber && !docReady) return false;
  if (row?.paspor_expired && row?.tgl_berangkat && String(row.paspor_expired).slice(0, 10) < String(row.tgl_berangkat).slice(0, 10)) {
    return false;
  }
  return true;
}

function portalVaksinReady(row) {
  return portalDocValue(row?.dokumen, ['vaksin_meningitis', 'vaksin', 'meningitis', 'icv']);
}

function portalDocumentReady(row, docKey) {
  if (docKey === 'paspor') return portalPasporReady(row);
  if (docKey === 'vaksin') return portalVaksinReady(row);
  const aliases = {
    ktp: ['ktp', 'KTP'],
    foto_46: ['foto_46', 'foto', 'pas_foto', 'foto_4x6'],
    buku_nikah: ['buku_nikah', 'nikah', 'buku nikah'],
  };
  return portalDocValue(row?.dokumen, aliases[docKey] || [docKey]);
}

function portalPerlengkapanEntry(perlengkapan, itemId) {
  const src = perlengkapan && typeof perlengkapan === 'object' ? perlengkapan : {};
  const aliases = {
    koper_besar: ['koper_besar', 'koper'],
    tas_kabin: ['tas_kabin', 'tas kabin'],
    tas_paspor: ['tas_paspor', 'tas paspor'],
    ihram: ['ihram', 'ikhram'],
    buku_doa: ['buku_doa', 'buku doa'],
    id_card: ['id_card', 'id card'],
    sabuk_ihram: ['sabuk_ihram', 'sabuk'],
  };
  for (const key of aliases[itemId] || [itemId]) {
    if (Object.prototype.hasOwnProperty.call(src, key)) return src[key];
  }
  return null;
}

function portalPerlengkapanStatus(perlengkapan, itemId) {
  const entry = portalPerlengkapanEntry(perlengkapan, itemId);
  if (entry && typeof entry === 'object') {
    return {
      status: ['diambil', 'tersedia', 'belum_siap'].includes(entry.status) ? entry.status : 'belum_siap',
      diambil_at: entry.diambil_at || null,
    };
  }
  if (entry === true || entry === 1) return { status: 'diambil', diambil_at: null };
  if (entry === false || entry === 0) return { status: 'belum_siap', diambil_at: null };
  return { status: 'belum_siap', diambil_at: null };
}

function portalPerlengkapanPerJamaah(rows) {
  const out = {};
  for (const row of rows || []) {
    out[String(row.id)] = PERLENGKAPAN_DEFAULTS.map((item) => ({
      ...item,
      ...portalPerlengkapanStatus(row.perlengkapan, item.id),
    }));
  }
  return out;
}

function computePortalAutoSync(item, rows) {
  if (!item.autoSyncFrom) return null;
  const jamaah = rows || [];
  const totalSisa = jamaah.reduce((sum, row) => sum + Math.max(0, toMoney(row.sisa)), 0);
  const totalBayar = jamaah.reduce((sum, row) => sum + Math.max(0, toMoney(row.bayar)), 0);

  if (item.autoSyncFrom === 'bayar_lunas') {
    if (item.id === 'dp_dibayar') return { checked: totalBayar > 0 || totalSisa <= 0 };
    return { checked: totalSisa <= 0 };
  }
  if (item.autoSyncFrom === 'vaksin_dokumen') {
    return { checked: jamaah.length > 0 && jamaah.every(portalVaksinReady) };
  }
  if (item.autoSyncFrom === 'paspor_dokumen') {
    return { checked: jamaah.length > 0 && jamaah.every(portalPasporReady) };
  }
  return { checked: false };
}

function mergePortalPersiapanItems(defaults, savedState, rows) {
  const state = savedState && typeof savedState === 'object' ? savedState : {};
  return defaults.map((item) => {
    const saved = state[item.id] && typeof state[item.id] === 'object' ? state[item.id] : {};
    const auto = computePortalAutoSync(item, rows);
    if (auto) {
      return {
        ...item,
        checked: Boolean(auto.checked),
        checked_at: auto.checked ? (saved.checked_at || null) : null,
        auto_synced: true,
      };
    }
    return {
      ...item,
      checked: saved.checked === true,
      checked_at: saved.checked_at || null,
      auto_synced: false,
    };
  });
}

function portalPercent(done, total) {
  if (!total) return 0;
  return Math.max(0, Math.min(100, Math.round((done / total) * 100)));
}

function computePortalProgress({ tahapan, spiritual, rows, perlengkapanPerJamaah }) {
  const tahapanChecked = tahapan.filter((item) => item.checked).length;
  const spiritualChecked = spiritual.filter((item) => item.checked).length;
  const tahapanPct = portalPercent(tahapanChecked, tahapan.length);
  const spiritualPct = portalPercent(spiritualChecked, spiritual.length);

  let docDone = 0;
  let docTotal = 0;
  for (const row of rows || []) {
    docTotal += PORTAL_DOCUMENT_KEYS.length;
    for (const key of PORTAL_DOCUMENT_KEYS) {
      if (portalDocumentReady(row, key)) docDone++;
    }
  }
  const dokumenPct = portalPercent(docDone, docTotal);

  const perlengkapanTotal = (rows || []).length * PERLENGKAPAN_DEFAULTS.length;
  const perlengkapanItems = Object.values(perlengkapanPerJamaah || {}).flat();
  const perlengkapanChecked = perlengkapanItems.filter((item) => item.status === 'diambil').length;
  const perlengkapanPct = portalPercent(
    perlengkapanChecked,
    perlengkapanTotal
  );

  const totalItems = tahapan.length + spiritual.length + docTotal + perlengkapanTotal;
  const checkedItems = tahapanChecked + spiritualChecked + docDone + perlengkapanChecked;
  const overallPct = portalPercent(checkedItems, totalItems);
  return {
    overall_pct: overallPct,
    tahapan_pct: tahapanPct,
    spiritual_pct: spiritualPct,
    dokumen_pct: dokumenPct,
    perlengkapan_pct: perlengkapanPct,
    pending_count: Math.max(0, totalItems - checkedItems),
  };
}

async function fetchPortalBookingRows(session) {
  const { data, error } = await supabase
    .from('jamaah')
    .select('id, id_umroh, jm_id, nama, jk, wa, paket, bayar, sisa, tgl_berangkat, no_paspor, paspor_expired, dokumen, perlengkapan, raw_data')
    .eq('agent_id', session.agent_id)
    .eq('id_umroh', session.id_umroh)
    .order('id', { ascending: true });
  if (error) throw error;
  return data || [];
}

const PORTAL_SCHEDULE_SELECT = [
  'jadwal_id',
  'year_code',
  'jadwal_nama',
  'maskapai',
  'berangkat_tgl',
  'pulang_tgl',
  'manasik_tgl',
  'manasik_jam',
  'berangkat_jam',
  'berangkat_rute',
  'berangkat_kode_penerbangan',
  'pulang_jam',
  'pulang_rute',
  'pulang_kode_penerbangan',
  'paket_harga',
  'paket_hotel',
  'itinerary',
  'itinerary_cdn',
  'itinerary_source_sha256',
].join(', ');

function parsePortalPackagePricing(paket) {
  const normalized = portalNormalizeName(paket);
  if (!normalized) return null;
  const roomMatch = normalized.match(/\b(QUARD|QUAD|TRIPLE|DOUBLE|SINGLE|INFANT)\b/);
  if (!roomMatch) return null;
  const roomMap = {
    QUARD: 'Quard',
    QUAD: 'Quard',
    TRIPLE: 'Triple',
    DOUBLE: 'Double',
    SINGLE: 'Single',
    INFANT: 'Infant',
  };
  const room = roomMap[roomMatch[1]];
  const tier = normalized.replace(/\b(QUARD|QUAD|TRIPLE|DOUBLE|SINGLE|INFANT)\b/g, '').replace(/\s+/g, ' ').trim();
  if (!tier || !room) return null;
  return { tier, room };
}

function portalBookingTargetPrice(row) {
  const rawPrice = toMoney(row?.raw_data?.harga_paket);
  if (rawPrice > 0) return rawPrice;
  const total = toMoney(row?.bayar) + Math.max(0, toMoney(row?.sisa));
  return total > 0 ? total : 0;
}

function getPortalSchedulePackagePrice(schedule, packageInfo) {
  if (!schedule?.paket_harga || !packageInfo) return 0;
  const tierEntry = Object.entries(schedule.paket_harga)
    .find(([tier]) => portalNormalizeName(tier) === packageInfo.tier);
  if (!tierEntry) return 0;
  return toMoney(tierEntry[1]?.[packageInfo.room]);
}

function findPortalScheduleByPackagePrice(first, schedules) {
  const packageInfo = parsePortalPackagePricing(first?.paket);
  const targetPrice = portalBookingTargetPrice(first);
  if (!packageInfo || targetPrice <= 0) return null;
  const matches = (schedules || []).filter((row) => getPortalSchedulePackagePrice(row, packageInfo) === targetPrice);
  return matches.length === 1 ? matches[0] : null;
}

async function fetchPortalSchedule(rows) {
  const first = rows?.[0];
  if (!first) return null;
  const raw = first.raw_data || {};
  const jadwalId = raw.id_jadwal || raw.jadwal_id || raw.idJadwal;

  if (jadwalId) {
    const { data, error } = await supabase
      .from('umroh_schedules')
      .select(PORTAL_SCHEDULE_SELECT)
      .eq('jadwal_id', String(jadwalId))
      .order('year_code', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!error && data) return data;
  }

  let query = supabase
    .from('umroh_schedules')
    .select(PORTAL_SCHEDULE_SELECT)
    .order('berangkat_tgl', { ascending: false, nullsFirst: false })
    .range(0, 499);
  const departureDate = first.tgl_berangkat ? String(first.tgl_berangkat).slice(0, 10) : null;
  if (departureDate) query = query.eq('berangkat_tgl', departureDate);

  const { data, error } = await query;
  if (error) {
    console.warn('[PortalJamaah] schedule lookup failed:', error.message);
    return null;
  }
  const paket = portalNormalizeName(first.paket);
  return (data || []).find((row) => portalNormalizeName(row.jadwal_nama) === paket)
    || findPortalScheduleByPackagePrice(first, data)
    || (data || []).find((row) => paket.startsWith(portalNormalizeName(row.jadwal_nama)))
    || null;
}

async function formatPortalSchedule(schedule) {
  if (!schedule) return null;
  let itineraryContent = null;
  if (schedule.jadwal_id) {
    itineraryContent = await getItineraryContext(schedule.jadwal_id);
  }
  return {
    manasik_tgl: schedule.manasik_tgl || null,
    manasik_jam: schedule.manasik_jam || null,
    berangkat_jam: schedule.berangkat_jam || null,
    berangkat_rute: schedule.berangkat_rute || null,
    berangkat_kode_penerbangan: schedule.berangkat_kode_penerbangan || null,
    pulang_jam: schedule.pulang_jam || null,
    pulang_rute: schedule.pulang_rute || null,
    pulang_kode_penerbangan: schedule.pulang_kode_penerbangan || null,
    maskapai: schedule.maskapai || null,
    paket_hotel: schedule.paket_hotel || null,
    itinerary: itineraryContent,
    itinerary_url: schedule.itinerary_cdn
      ? appendUrlVersion(schedule.itinerary_cdn, schedule.itinerary_source_sha256)
      : (schedule.itinerary || null),
  };
}

// Resolve a 5-char magic code to the data needed for share-card rendering
// (browser title + og:image). Returns null when the token, slug, jamaah, or
// jadwal can't be resolved — caller should fall back to default agent meta.
async function lookupPortalTokenMeta(slug, code) {
  const normalizedSlug = normalizePortalSlug(slug);
  if (!normalizedSlug || !isPortalMagicCode(code)) return null;
  const storedToken = buildPortalStoredToken(normalizedSlug, code);

  const { data: portalToken, error: tokenError } = await supabase
    .from('jamaah_portal_tokens')
    .select('jamaah_id, agent_id, id_umroh')
    .eq('token', storedToken)
    .maybeSingle();
  if (tokenError || !portalToken) return null;

  const [jamaahRes, agentRes] = await Promise.all([
    supabase
      .from('jamaah')
      .select('id, id_umroh, nama, paket, bayar, sisa, tgl_berangkat, raw_data')
      .eq('id', portalToken.jamaah_id)
      .maybeSingle(),
    supabase
      .from('agents')
      .select('slug, name, photo')
      .eq('id', portalToken.agent_id)
      .maybeSingle(),
  ]);
  const jamaah = jamaahRes.data;
  const agent = agentRes.data;
  if (!jamaah || !agent) return null;
  if (agent.slug && normalizePortalSlug(agent.slug) !== normalizedSlug) return null;

  const schedule = await fetchPortalSchedule([jamaah]);
  return {
    jamaahName: jamaah.nama || '',
    paketName: schedule?.jadwal_nama || jamaah.paket || '',
    maskapai: schedule?.maskapai || '',
    agent,
  };
}

function formatPortalJamaah(row, initiatingJamaahId) {
  return {
    id: row.id,
    nama: row.nama,
    jk: row.jk,
    wa: row.wa,
    bayar: toMoney(row.bayar),
    sisa: toMoney(row.sisa),
    bayar_pct: portalPaymentPct(row),
    no_paspor: row.no_paspor || null,
    paspor_expired: row.paspor_expired || null,
    dokumen: row.dokumen || {},
    perlengkapan: row.perlengkapan || {},
    is_initiator: row.id === initiatingJamaahId,
  };
}

async function buildPortalPersiapanResponse(session) {
  const rows = await fetchPortalBookingRows(session);
  if (!rows.length) return { error: 'booking_not_found', status: 404 };

  const { data: persiapan, error } = await supabase
    .from('booking_persiapan')
    .select('tahapan, spiritual')
    .eq('id_umroh', session.id_umroh)
    .eq('agent_id', session.agent_id)
    .maybeSingle();
  if (error) throw error;

  const tahapan = mergePortalPersiapanItems(TAHAPAN_DEFAULTS, persiapan?.tahapan || {}, rows);
  const spiritual = mergePortalPersiapanItems(SPIRITUAL_DEFAULTS, persiapan?.spiritual || {}, rows);
  const perlengkapanPerJamaah = portalPerlengkapanPerJamaah(rows);
  const progress = computePortalProgress({ tahapan, spiritual, rows, perlengkapanPerJamaah });

  return {
    tahapan,
    spiritual,
    perlengkapan_per_jamaah: perlengkapanPerJamaah,
    progress,
  };
}

app.get('/api/agents/:slug/public', async (req, res) => {
  try {
    const slug = normalizePortalSlug(req.params.slug);
    const agent = await getAgentBySlug(slug);
    if (!agent) return res.status(404).json({ error: 'agent_not_found' });
    res.json({
      slug: agent.slug,
      name: agent.name,
      phone: agent.phone || '',
      photo: agent.photo || '',
      website: agent.website || '',
    });
  } catch (err) {
    console.error('[PortalJamaah] public agent error:', err.message);
    res.status(500).json({ error: 'Gagal mengambil agent' });
  }
});

app.post('/api/portal/jamaah/:slug/magic-link/request-by-booking', portalRequestBookingLimiter, async (req, res) => {
  const generic = { success: true, message: 'Jika data cocok, link akses akan dikirim ke WhatsApp terdaftar.' };
  try {
    const slug = String(req.params.slug || '').toLowerCase();
    const idUmroh = String(req.body?.id_umroh || '').trim();
    const wa = normalizePortalWaNumber(req.body?.wa);
    if (!idUmroh || !wa) return res.json(generic);

    const agent = await getAgentBySlug(slug);
    if (!agent) return res.json(generic);

    const { data: rows, error } = await supabase
      .from('jamaah')
      .select('id, id_umroh, nama, wa, bayar, sisa, tgl_berangkat')
      .eq('agent_id', agent.id)
      .eq('id_umroh', idUmroh)
      .limit(50);
    if (error) {
      console.warn('[PortalJamaah] request-by-booking lookup failed:', error.message);
      return res.json(generic);
    }

    const matched = (rows || []).find((row) => normalizePortalWaNumber(row.wa) === wa);
    if (!matched) return res.json(generic);
    if (!portalBookingHasDp(matched)) return res.json(generic);

    const expiresAt = getPortalMagicLinkExpiresAt(matched.tgl_berangkat);
    if (!expiresAt) return res.json(generic);
    const { error: insertError } = await insertPortalMagicToken({
      slug,
      jamaah_id: matched.id,
      id_umroh: matched.id_umroh,
      agent_id: agent.id,
      expires_at: expiresAt,
    });
    if (insertError) {
      console.warn('[PortalJamaah] request-by-booking token insert failed:', insertError.message);
      return res.json(generic);
    }

    // No WhatsApp provider is configured in this app yet. Keep the endpoint
    // enumeration-safe and ready for a sender integration without exposing links.
    console.log(`[PortalJamaah] Magic link requested by booking for ${slug}/${idUmroh}; token generated for jamaah ${matched.id}`);
    return res.json(generic);
  } catch (err) {
    console.error('[PortalJamaah] request-by-booking error:', err.message);
    return res.json(generic);
  }
});

app.post('/api/portal/jamaah/:slug/magic-link/generate', authMiddleware, async (req, res) => {
  try {
    const { agent, error: agentError, status } = await getPortalDashboardAgent(req, req.params.slug);
    if (!agent) return res.status(status || 404).json({ error: agentError || 'agent_not_found' });
    if (String(agent.slug || req.params.slug || '').toLowerCase() !== 'nikita') {
      return res.status(403).json({
        error: 'portal_feature_coming_soon',
        message: 'Fitur Magic Link Portal Jamaah akan tersedia beberapa saat lagi.',
      });
    }

    const jamaahId = Number(req.body?.jamaah_id);
    if (!Number.isInteger(jamaahId) || jamaahId <= 0) {
      return res.status(400).json({ error: 'jamaah_id_required' });
    }

    const { data: jamaah, error } = await supabase
      .from('jamaah')
      .select('id, id_umroh, nama, bayar, sisa, tgl_berangkat')
      .eq('id', jamaahId)
      .eq('agent_id', agent.id)
      .maybeSingle();
    if (error) return res.status(500).json({ error: error.message });
    if (!jamaah) return res.status(404).json({ error: 'jamaah_not_found' });
    if (!jamaah.id_umroh) return res.status(400).json({ error: 'missing_id_umroh' });
    if (!portalBookingHasDp(jamaah)) {
      return res.status(400).json({
        error: 'belum_dp',
        message: 'Magic Link tersedia setelah DP tercatat.',
      });
    }

    const expiresAt = getPortalMagicLinkExpiresAt(jamaah.tgl_berangkat);
    if (!expiresAt) return res.status(400).json({ error: 'missing_tgl_berangkat' });

    const slug = normalizePortalSlug(agent.slug || req.params.slug);
    const { data: activeTokens, error: existingTokenError } = await supabase
      .from('jamaah_portal_tokens')
      .select('token, expires_at')
      .eq('jamaah_id', jamaah.id)
      .eq('agent_id', agent.id)
      .eq('id_umroh', jamaah.id_umroh)
      .like('token', `${slug}:%`)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(10);
    if (existingTokenError) {
      if (portalSchemaMissingResponse(res, existingTokenError)) return;
      return res.status(500).json({ error: existingTokenError.message });
    }
    const existingToken = (activeTokens || []).find((row) => isPortalStoredMagicToken(row.token));
    const hasIncompatibleShortToken = (activeTokens || []).length > 0 && !existingToken;

    const { count } = await supabase
      .from('jamaah')
      .select('*', { count: 'exact', head: true })
      .eq('agent_id', agent.id)
      .eq('id_umroh', jamaah.id_umroh);

    if (existingToken) {
      if (String(existingToken.expires_at || '') !== expiresAt) {
        supabase
          .from('jamaah_portal_tokens')
          .update({ expires_at: expiresAt })
          .eq('token', existingToken.token)
          .then(() => {});
      }
      return res.json({
        url: formatPortalMagicUrl(slug, existingToken.token),
        expires_at: expiresAt,
        jamaah_name: jamaah.nama,
        id_umroh: jamaah.id_umroh,
        anggota_count: count || 0,
        reused: true,
      });
    }

    if (!hasIncompatibleShortToken) {
      const rateKey = `agent:${req.user?.id || 'unknown'}`;
      const rateResult = checkPortalRateLimit(portalGenerateRateLimits, rateKey, 10, 60 * 60 * 1000);
      if (!rateResult.ok) {
        if (rateResult.retryAfter) res.set('Retry-After', String(rateResult.retryAfter));
        return res.status(429).json({
          error: 'rate_limited',
          retry_after: rateResult.retryAfter || 0,
          message: `Terlalu sering membuat link. Coba lagi dalam ${Math.ceil((rateResult.retryAfter || 60) / 60)} menit.`,
        });
      }
    }

    const { token, error: insertError } = await insertPortalMagicToken({
      slug,
      jamaah_id: jamaah.id,
      id_umroh: jamaah.id_umroh,
      agent_id: agent.id,
      expires_at: expiresAt,
    });
    if (insertError) {
      if (portalSchemaMissingResponse(res, insertError)) return;
      return res.status(500).json({ error: 'token_insert_failed' });
    }

    res.json({
      url: formatPortalMagicUrl(slug, token),
      expires_at: expiresAt,
      jamaah_name: jamaah.nama,
      id_umroh: jamaah.id_umroh,
      anggota_count: count || 0,
    });
  } catch (err) {
    console.error('[PortalJamaah] magic-link generate error:', err.message);
    res.status(500).json({ error: 'Gagal generate magic link' });
  }
});

async function handlePortalMagicConsume(req, res) {
  try {
    const token = resolvePortalConsumeToken(req.params.slug, req.params.token);
    if (!token) return res.status(404).json({ error: 'not_found' });

    const { data: portalToken, error } = await supabase
      .from('jamaah_portal_tokens')
      .select('*')
      .eq('token', token)
      .maybeSingle();
    if (error) return res.status(500).json({ error: error.message });
    if (!portalToken) return res.status(404).json({ error: 'not_found' });
    if (new Date(portalToken.expires_at) < new Date()) {
      return res.status(410).json({ error: 'expired', message: 'Link sudah expired, minta link baru ke agent' });
    }

    const [jamaahRes, agentRes] = await Promise.all([
      supabase.from('jamaah').select('id, nama, bayar, sisa, tgl_berangkat').eq('id', portalToken.jamaah_id).maybeSingle(),
      supabase.from('agents').select('id, slug').eq('id', portalToken.agent_id).maybeSingle(),
    ]);
    if (jamaahRes.error) return res.status(500).json({ error: jamaahRes.error.message });
    if (agentRes.error) return res.status(500).json({ error: agentRes.error.message });
    if (!jamaahRes.data || !agentRes.data) return res.status(404).json({ error: 'not_found' });
    if (!portalBookingHasDp(jamaahRes.data)) {
      return res.status(403).json({ error: 'belum_dp', message: 'Akses portal tersedia setelah DP tercatat.' });
    }

    const { ip, userAgent } = getClientIpUa(req);
    const consumedAt = new Date().toISOString();
    const { error: consumeError } = await supabase
      .from('jamaah_portal_tokens')
      .update({
        consumed_at: consumedAt,
        consumed_ip: ip,
        consumed_user_agent: userAgent,
      })
      .eq('token', token);
    if (consumeError) return res.status(500).json({ error: consumeError.message });

    const sessionToken = crypto.randomBytes(32).toString('hex');
    const tokenExpiresMs = Date.parse(portalToken.expires_at);
    const sessionExpiresMs = Math.min(
      Date.now() + PORTAL_SESSION_TTL_MS,
      Number.isFinite(tokenExpiresMs) ? tokenExpiresMs : Date.now() + PORTAL_SESSION_TTL_MS
    );
    const expiresAt = new Date(sessionExpiresMs).toISOString();
    const { error: sessionError } = await supabase.from('jamaah_portal_sessions').insert({
      session_token: sessionToken,
      id_umroh: portalToken.id_umroh,
      agent_id: portalToken.agent_id,
      initiating_jamaah_id: portalToken.jamaah_id,
      expires_at: expiresAt,
      user_agent: userAgent,
    });
    if (sessionError) return res.status(500).json({ error: sessionError.message });

    res.cookie('jamaah_session', sessionToken, getPortalCookieOptions(req, Math.max(0, sessionExpiresMs - Date.now())));
    res.json({
      session_token: sessionToken,
      id_umroh: portalToken.id_umroh,
      jamaah_name: jamaahRes.data.nama,
      agent_slug: agentRes.data.slug,
      expires_at: expiresAt,
    });
  } catch (err) {
    console.error('[PortalJamaah] consume error:', err.message);
    res.status(500).json({ error: 'Gagal consume magic link' });
  }
}

app.get('/api/portal/jamaah/:slug/auth/consume/:token', portalConsumeLimiter, handlePortalMagicConsume);
app.get('/api/portal/jamaah/auth/consume/:token', portalConsumeLimiter, handlePortalMagicConsume);

app.get('/api/portal/jamaah/me', portalJamaahAuth, async (req, res) => {
  try {
    const session = req.portalSession;
    const rows = await fetchPortalBookingRows(session);
    if (!rows.length) return res.status(404).json({ error: 'booking_not_found' });

    const [agent, scheduleRow] = await Promise.all([
      getAgentById(session.agent_id),
      fetchPortalSchedule(rows),
    ]);
    const schedule = await formatPortalSchedule(scheduleRow);
    const first = rows[0];

    res.json({
      booking: {
        id_umroh: session.id_umroh,
        paket: first.paket || scheduleRow?.jadwal_nama || null,
        tgl_berangkat: first.tgl_berangkat || scheduleRow?.berangkat_tgl || null,
        tgl_pulang: scheduleRow?.pulang_tgl || null,
        hari_ke_berangkat: portalDaysUntil(first.tgl_berangkat || scheduleRow?.berangkat_tgl),
        jadwal: scheduleRow ? {
          jadwal_id: scheduleRow.jadwal_id,
          jadwal_nama: scheduleRow.jadwal_nama,
          year_code: scheduleRow.year_code,
        } : null,
      },
      jamaah: rows.map((row) => formatPortalJamaah(row, session.initiating_jamaah_id)),
      agent: agent ? {
        slug: agent.slug,
        name: agent.name,
        phone: agent.phone || null,
        photo: agent.photo || null,
        website: agent.website || null,
      } : null,
      schedule,
    });
  } catch (err) {
    console.error('[PortalJamaah] me error:', err.message);
    res.status(500).json({ error: 'Gagal mengambil data portal' });
  }
});

app.get('/api/portal/jamaah/persiapan', portalJamaahAuth, async (req, res) => {
  try {
    const data = await buildPortalPersiapanResponse(req.portalSession);
    if (data.error) return res.status(data.status || 500).json({ error: data.error });
    res.json(data);
  } catch (err) {
    console.error('[PortalJamaah] persiapan get error:', err.message);
    res.status(500).json({ error: 'Gagal mengambil persiapan' });
  }
});

app.put('/api/portal/jamaah/persiapan/item', portalJamaahAuth, portalPersiapanLimiter, async (req, res) => {
  try {
    const { kind, item_id: itemId, checked } = req.body || {};
    if (!['tahapan', 'spiritual'].includes(kind)) return res.status(400).json({ error: 'invalid_kind' });
    if (!itemId || typeof itemId !== 'string') return res.status(400).json({ error: 'item_id_required' });
    if (typeof checked !== 'boolean') return res.status(400).json({ error: 'checked_required' });

    const defaults = kind === 'tahapan' ? TAHAPAN_DEFAULTS : SPIRITUAL_DEFAULTS;
    const item = defaults.find((entry) => entry.id === itemId);
    if (!item) return res.status(404).json({ error: 'item_not_found' });
    if (item.autoSyncFrom) return res.status(400).json({ error: 'auto_synced_item' });

    const session = req.portalSession;
    const rows = await fetchPortalBookingRows(session);
    if (!rows.length) return res.status(404).json({ error: 'booking_not_found' });

    const { data: existing, error: readError } = await supabase
      .from('booking_persiapan')
      .select('tahapan, spiritual')
      .eq('id_umroh', session.id_umroh)
      .eq('agent_id', session.agent_id)
      .maybeSingle();
    if (readError) return res.status(500).json({ error: readError.message });

    const now = new Date().toISOString();
    const nextTahapan = { ...(existing?.tahapan || {}) };
    const nextSpiritual = { ...(existing?.spiritual || {}) };
    const target = kind === 'tahapan' ? nextTahapan : nextSpiritual;
    target[itemId] = { checked, checked_at: checked ? now : null };

    const { error: upsertError } = await supabase.from('booking_persiapan').upsert({
      id_umroh: session.id_umroh,
      agent_id: session.agent_id,
      tahapan: nextTahapan,
      spiritual: nextSpiritual,
      updated_at: now,
    }, { onConflict: 'id_umroh' });
    if (upsertError) return res.status(500).json({ error: upsertError.message });

    const data = await buildPortalPersiapanResponse(session);
    if (data.error) return res.status(data.status || 500).json({ error: data.error });
    res.json({ success: true, progress: data.progress, tahapan: data.tahapan, spiritual: data.spiritual });
  } catch (err) {
    console.error('[PortalJamaah] persiapan update error:', err.message);
    res.status(500).json({ error: 'Gagal update persiapan' });
  }
});

app.post('/api/portal/jamaah/auth/logout', portalJamaahAuth, async (req, res) => {
  try {
    await supabase
      .from('jamaah_portal_sessions')
      .delete()
      .eq('session_token', req.portalSessionToken);
    res.clearCookie('jamaah_session', { path: '/' });
    res.sendStatus(204);
  } catch (err) {
    console.error('[PortalJamaah] logout error:', err.message);
    res.status(500).json({ error: 'Gagal logout' });
  }
});

app.get('/api/portal/jamaah/sessions', authMiddleware, async (req, res) => {
  try {
    const now = new Date().toISOString();
    const { data: sessions, error } = await supabase
      .from('jamaah_portal_sessions')
      .select('id_umroh, initiating_jamaah_id, last_active_at, created_at, user_agent')
      .eq('agent_id', req.user.id)
      .gt('expires_at', now)
      .order('last_active_at', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });

    const ids = [...new Set((sessions || []).map((s) => s.initiating_jamaah_id).filter(Boolean))];
    const bookingIds = [...new Set((sessions || []).map((s) => s.id_umroh).filter(Boolean))];
    const [initiatorsRes, bookingNamesRes] = await Promise.all([
      ids.length
        ? supabase.from('jamaah').select('id, nama').eq('agent_id', req.user.id).in('id', ids)
        : Promise.resolve({ data: [], error: null }),
      bookingIds.length
        ? supabase.from('jamaah').select('id_umroh, nama').eq('agent_id', req.user.id).in('id_umroh', bookingIds).order('id', { ascending: true })
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (initiatorsRes.error) return res.status(500).json({ error: initiatorsRes.error.message });
    if (bookingNamesRes.error) return res.status(500).json({ error: bookingNamesRes.error.message });

    const initiatorNames = new Map((initiatorsRes.data || []).map((row) => [row.id, row.nama]));
    const bookingNames = new Map();
    for (const row of bookingNamesRes.data || []) {
      if (!bookingNames.has(row.id_umroh)) bookingNames.set(row.id_umroh, row.nama);
    }

    res.json((sessions || []).map((session) => ({
      id_umroh: session.id_umroh,
      jamaah_name: initiatorNames.get(session.initiating_jamaah_id) || bookingNames.get(session.id_umroh) || null,
      last_active_at: session.last_active_at,
      created_at: session.created_at,
      user_agent: session.user_agent,
    })));
  } catch (err) {
    console.error('[PortalJamaah] sessions error:', err.message);
    res.status(500).json({ error: 'Gagal mengambil sessions' });
  }
});

// ──────────────────────────────────────────────
// Umroh Schedules: Sync from external API → Supabase
// ──────────────────────────────────────────────
const SCHEDULE_YEAR_CODES = ['1447', '1448', '1449'];

async function syncUmrohSchedules() {
  console.log('[ScheduleSync] Starting...');
  const startTime = Date.now();
  let totalSynced = 0;

  for (const year of SCHEDULE_YEAR_CODES) {
    try {
      const res = await fetch(`https://jadwal.alhijaz.co/jadwal/api-get/${year}`, {
        headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' },
        signal: AbortSignal.timeout(15000),
      });

      if (!res.ok) {
        console.error(`[ScheduleSync] API ${year} HTTP ${res.status}`);
        continue;
      }

      const json = await res.json();
      const packages = json.aaData || [];

      if (!packages.length) {
        console.log(`[ScheduleSync] No packages for year ${year}`);
        continue;
      }

      const validPackages = [];
      const rejectedPackages = [];
      for (const p of packages) {
        if (hasValidPricing(p.paket_harga)) {
          validPackages.push(p);
        } else {
          rejectedPackages.push({ jadwal_id: p.jadwal_id, jadwal_nama: p.jadwal_nama });
        }
      }
      if (rejectedPackages.length) {
        const sample = rejectedPackages.slice(0, 5).map(r => `${r.jadwal_id}(${r.jadwal_nama})`).join(', ');
        console.log(`[ScheduleSync] Year ${year}: filtered ${rejectedPackages.length} paket tanpa harga valid: ${sample}${rejectedPackages.length > 5 ? ', ...' : ''}`);
      }

      const rows = validPackages.map(p => ({
        jadwal_id: p.jadwal_id,
        year_code: year,
        jadwal_nama: p.jadwal_nama,
        promo: p.promo,
        seat_total: p.seat_total,
        seat_sisa: p.seat_sisa,
        maskapai: p.maskapai,
        berangkat_tgl: /^\d{4}-\d{2}-\d{2}$/.test(p.berangkat_tgl) ? p.berangkat_tgl : null,
        berangkat_jam: p.berangkat_jam,
        berangkat_rute: p.berangkat_rute,
        berangkat_kode_penerbangan: p.berangkat_kode_penerbangan,
        pulang_tgl: /^\d{4}-\d{2}-\d{2}$/.test(p.pulang_tgl) ? p.pulang_tgl : null,
        pulang_jam: p.pulang_jam,
        pulang_rute: p.pulang_rute,
        pulang_kode_penerbangan: p.pulang_kode_penerbangan,
        manasik_tgl: p.manasik_tgl,
        manasik_jam: p.manasik_jam,
        brosur: p.brosur,
        itinerary: p.itinerary,
        perlengkapan_harga: p.perlengkapan_harga,
        paket_harga: p.paket_harga,
        paket_hotel: p.paket_hotel,
        synced_at: new Date().toISOString(),
      }));

      const { error } = await supabase
        .from('umroh_schedules')
        .upsert(rows, { onConflict: 'jadwal_id,year_code' });

      if (error) {
        console.error(`[ScheduleSync] Upsert error for year ${year}:`, error.message);
      } else {
        // Delete stale packages no longer in external API
        const currentIds = rows.map(r => r.jadwal_id);
        // First, fetch stale rows to clean up Bunny files
        const { data: staleRows } = await supabase
          .from('umroh_schedules')
          .select('jadwal_id, brosur_cdn, itinerary_cdn')
          .eq('year_code', year)
          .not('jadwal_id', 'in', `(${currentIds.join(',')})`);
        if (staleRows?.length && getBunnyEnabled()) {
          for (const stale of staleRows) {
            try {
              if (stale.brosur_cdn) await bunnyDelete(stale.brosur_cdn.replace(`https://${BUNNY_CDN_HOSTNAME}/`, ''));
              if (stale.itinerary_cdn) await bunnyDelete(stale.itinerary_cdn.replace(`https://${BUNNY_CDN_HOSTNAME}/`, ''));
            } catch (e) { console.error(`[ScheduleSync] Bunny cleanup ${stale.jadwal_id}: ${e.message}`); }
          }
        }
        // Then delete from Supabase
        const { error: delErr, count } = await supabase
          .from('umroh_schedules')
          .delete({ count: 'exact' })
          .eq('year_code', year)
          .not('jadwal_id', 'in', `(${currentIds.join(',')})`);
        if (delErr) {
          console.error(`[ScheduleSync] Cleanup error for year ${year}:`, delErr.message);
        } else if (count > 0) {
          console.log(`[ScheduleSync] Year ${year}: removed ${count} stale packages`);
        }

        totalSynced += rows.length;
        console.log(`[ScheduleSync] Year ${year}: ${rows.length} packages synced`);
      }
    } catch (err) {
      console.error(`[ScheduleSync] Year ${year} failed:`, err.message);
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[ScheduleSync] Complete: ${totalSynced} packages in ${elapsed}s`);
}

// ──────────────────────────────────────────────
// Bunny CDN: Sync brosur & itinerary files to Bunny Storage
// ──────────────────────────────────────────────
const BUNNY_STORAGE_API_KEY = process.env.BUNNY_STORAGE_API_KEY;
const BUNNY_STORAGE_ZONE = process.env.BUNNY_STORAGE_ZONE;
const BUNNY_STORAGE_HOSTNAME = process.env.BUNNY_STORAGE_HOSTNAME || 'storage.bunnycdn.com';
const BUNNY_CDN_HOSTNAME = process.env.BUNNY_CDN_HOSTNAME;

function getBunnyEnabled() {
  return !!(BUNNY_STORAGE_API_KEY && BUNNY_STORAGE_ZONE && BUNNY_CDN_HOSTNAME);
}

async function bunnyFileExists(path) {
  try {
    const res = await fetch(`https://${BUNNY_CDN_HOSTNAME}/${path}`, {
      method: 'HEAD',
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function bunnyUpload(path, buffer, contentType) {
  const res = await fetch(
    `https://${BUNNY_STORAGE_HOSTNAME}/${BUNNY_STORAGE_ZONE}/${path}`,
    {
      method: 'PUT',
      headers: {
        'AccessKey': BUNNY_STORAGE_API_KEY,
        'Content-Type': contentType || 'application/octet-stream',
      },
      body: buffer,
      signal: AbortSignal.timeout(120000),
    }
  );
  if (!res.ok) throw new Error(`Bunny upload failed: ${res.status} ${res.statusText}`);
}

async function bunnyDelete(path) {
  const res = await fetch(
    `https://${BUNNY_STORAGE_HOSTNAME}/${BUNNY_STORAGE_ZONE}/${path}`,
    {
      method: 'DELETE',
      headers: { 'AccessKey': BUNNY_STORAGE_API_KEY },
      signal: AbortSignal.timeout(10000),
    }
  );
  if (!res.ok && res.status !== 404) throw new Error(`Bunny delete failed: ${res.status}`);
}

async function downloadFile(url) {
  const normalizedUrl = url.replace('http://', 'https://');
  const res = await fetch(normalizedUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    signal: AbortSignal.timeout(120000),
  });
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  const contentType = res.headers.get('content-type') || 'application/octet-stream';
  // Extract extension from Content-Disposition or Content-Type
  const disposition = res.headers.get('content-disposition') || '';
  let ext = '';
  const fnMatch = disposition.match(/filename[^;=\n]*=["']?([^"';\n]+)/i);
  if (fnMatch) {
    const dotIdx = fnMatch[1].lastIndexOf('.');
    if (dotIdx > 0) ext = fnMatch[1].substring(dotIdx);
  }
  if (!ext) {
    if (contentType.includes('pdf')) ext = '.pdf';
    else if (contentType.includes('webp')) ext = '.webp';
    else if (contentType.includes('jpeg') || contentType.includes('jpg')) ext = '.jpg';
    else if (contentType.includes('png')) ext = '.png';
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
  return { buffer, contentType, ext, bytes: buffer.length, sha256 };
}

async function syncFilesToBunny() {
  if (!getBunnyEnabled()) {
    console.log('[BunnySync] Skipped — Bunny credentials not configured');
    return;
  }

  console.log('[BunnySync] Starting...');
  const startTime = Date.now();
  let uploaded = 0, metadataUpdated = 0, skipped = 0, errors = 0;
  let uploadsSincePause = 0;

  const { data: packages, error } = await supabase
    .from('umroh_schedules')
    .select([
      'jadwal_id',
      'year_code',
      'brosur',
      'itinerary',
      'brosur_cdn',
      'itinerary_cdn',
      'brosur_source_sha256',
      'brosur_source_bytes',
      'brosur_source_content_type',
      'brosur_cdn_synced_at',
      'itinerary_source_sha256',
      'itinerary_source_bytes',
      'itinerary_source_content_type',
      'itinerary_cdn_synced_at',
    ].join(', '));

  if (error || !packages?.length) {
    if (error) console.error('[BunnySync] Package fetch failed:', error.message);
    else console.log('[BunnySync] No packages to sync');
    return;
  }

  const fileConfigs = [
    { kind: 'brosur', folder: 'brosur', sourceField: 'brosur', cdnField: 'brosur_cdn', fallbackExt: '.webp', label: 'Brosur' },
    { kind: 'itinerary', folder: 'itinerary', sourceField: 'itinerary', cdnField: 'itinerary_cdn', fallbackExt: '.pdf', label: 'Itinerary' },
  ];

  for (const pkg of packages) {
    for (const config of fileConfigs) {
      try {
        if (!pkg[config.sourceField]) {
          skipped++;
          continue;
        }

        const file = await downloadFile(pkg[config.sourceField]);
        const fileMeta = {
          sha256: file.sha256,
          bytes: file.bytes,
          contentType: file.contentType,
        };
        const decision = getCdnFileDecision(pkg, config.kind, fileMeta);
        if (decision.action === 'skip') {
          skipped++;
          continue;
        }
        if (decision.action === 'verify_cdn') {
          const cdnFile = await downloadFile(pkg[config.cdnField]);
          if (cdnFile.sha256 === fileMeta.sha256 && cdnFile.bytes === fileMeta.bytes) {
            const update = buildCdnMetadataUpdate(config.kind, pkg[config.cdnField], fileMeta);
            await supabase
              .from('umroh_schedules')
              .update(update)
              .eq('jadwal_id', pkg.jadwal_id)
              .eq('year_code', pkg.year_code);
            metadataUpdated++;
            console.log(`[BunnySync] ${config.label} ${pkg.jadwal_id}: metadata updated (cdn unchanged)`);
            continue;
          }
        }

        const path = `${config.folder}/${pkg.jadwal_id}${file.ext || config.fallbackExt}`;
        await bunnyUpload(path, file.buffer, file.contentType);
        const cdnUrl = `https://${BUNNY_CDN_HOSTNAME}/${path}`;
        const update = buildCdnMetadataUpdate(config.kind, cdnUrl, fileMeta);
        await supabase
          .from('umroh_schedules')
          .update(update)
          .eq('jadwal_id', pkg.jadwal_id)
          .eq('year_code', pkg.year_code);
        uploaded++;
        uploadsSincePause++;
        console.log(`[BunnySync] ${config.label} ${pkg.jadwal_id}: uploaded (${decision.reason})`);
      } catch (err) {
        console.error(`[BunnySync] ${config.label} ${pkg.jadwal_id}: ${err.message}`);
        errors++;
      }
    }

    // Small delay to avoid hammering origin server
    if (uploadsSincePause >= 5) {
      uploadsSincePause = 0;
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[BunnySync] Complete: ${uploaded} uploaded, ${metadataUpdated} metadata updated, ${skipped} skipped, ${errors} errors in ${elapsed}s`);
}

// ──────────────────────────────────────────────
// Bunny CDN: Cleanup expired & stale files
// ──────────────────────────────────────────────
async function cleanupExpiredPackages() {
  if (!getBunnyEnabled()) return;

  console.log('[BunnyCleanup] Checking for expired packages...');
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  const cutoffDate = sixMonthsAgo.toISOString().split('T')[0];

  const { data: expired, error } = await supabase
    .from('umroh_schedules')
    .select('jadwal_id, year_code, brosur_cdn, itinerary_cdn')
    .lt('berangkat_tgl', cutoffDate);

  if (error || !expired?.length) {
    if (!error) console.log('[BunnyCleanup] No expired packages');
    return;
  }

  let deleted = 0;
  for (const pkg of expired) {
    try {
      // Delete files from Bunny
      if (pkg.brosur_cdn) {
        const path = pkg.brosur_cdn.replace(`https://${BUNNY_CDN_HOSTNAME}/`, '');
        await bunnyDelete(path);
      }
      if (pkg.itinerary_cdn) {
        const path = pkg.itinerary_cdn.replace(`https://${BUNNY_CDN_HOSTNAME}/`, '');
        await bunnyDelete(path);
      }

      // Delete row from Supabase
      await supabase
        .from('umroh_schedules')
        .delete()
        .eq('jadwal_id', pkg.jadwal_id)
        .eq('year_code', pkg.year_code);

      deleted++;
    } catch (err) {
      console.error(`[BunnyCleanup] ${pkg.jadwal_id}: ${err.message}`);
    }
  }

  console.log(`[BunnyCleanup] Removed ${deleted} expired packages (> 6 months past departure)`);
}

// ──────────────────────────────────────────────
// API: Read schedules from Supabase (with external API fallback)
// ──────────────────────────────────────────────
app.get('/api/schedules/:yearCode', async (req, res) => {
  const yearCode = req.params.yearCode;

  if (!/^\d{4}$/.test(yearCode)) {
    return res.status(400).json({ status: 'error', error: 'Invalid year code' });
  }

  let cachedRows = [];
  let cachedError = null;
  try {
    const { data, error } = await supabase
      .from('umroh_schedules')
      .select('*')
      .eq('year_code', yearCode)
      .order('berangkat_tgl', { ascending: true });

    if (error) throw error;
    cachedRows = data || [];
  } catch (err) {
    cachedError = err;
    console.error(`[Schedules] Supabase error for ${yearCode}: ${err.message}`);
  }

  if (cachedError) {
    return res.status(500).json({ status: 'error', error: 'Failed to read schedule data' });
  }

  if (cachedRows.length === 0) {
    return res.status(500).json({ status: 'error', error: 'No schedule data available' });
  }

  try {
    const scheduleRows = buildScheduleRows(cachedRows, null, yearCode);

    let journeyOrderById = new Map();
    try {
      const jadwalIds = scheduleRows.map(row => row.jadwal_id).filter(Boolean);
      if (jadwalIds.length) {
        const { data: itineraryRows, error: itineraryError } = await supabase
          .from('itineraries')
          .select('jadwal_id, content')
          .in('jadwal_id', jadwalIds);

        if (itineraryError) {
          console.warn('[Schedules] Itinerary order lookup failed:', itineraryError.message);
        } else {
          journeyOrderById = new Map(
            (itineraryRows || [])
              .map(row => [row.jadwal_id, inferSaudiJourneyOrderFromItinerary(row.content)])
              .filter(([, order]) => Array.isArray(order) && order.length >= 2)
          );
        }
      }
    } catch (journeyErr) {
      console.warn('[Schedules] Itinerary order inference failed:', journeyErr.message);
    }

    const aaData = serializeScheduleRows(scheduleRows, journeyOrderById);

    res.json({
      status: 'ok',
      iTotalDisplayRecords: aaData.length,
      aaData,
    });
  } catch (err) {
    console.error(`[Schedules] Response build error for ${yearCode}: ${err.message}`);
    res.status(500).json({
      status: 'error',
      error: 'Failed to build schedule response from cached data',
    });
  }
});

// ──────────────────────────────────────────────
// API: Proxy to jadwal.alhijaz.co
// ──────────────────────────────────────────────
app.all('/api/{*path}', async (req, res) => {
  const path = req.path.replace(/^\/api\//, ''); // everything after /api/
  const targetUrl = `https://jadwal.alhijaz.co/jadwal/${path}`;

  try {
    const response = await fetch(targetUrl, {
      method: req.method,
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
      ...(req.method === 'POST' ? { body: JSON.stringify(req.body) } : {}),
    });

    const data = await response.text();
    res.set({
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=60',
    }).status(response.status).send(data);
  } catch (error) {
    res.status(500).json({ error: 'Proxy error', message: error.message });
  }
});

// ──────────────────────────────────────────────
// Proxy: itinerary & brosur files (with timeout + retry)
// ──────────────────────────────────────────────
async function fetchWithTimeout(url, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    return response;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

app.get(['/itinerary/{*path}', '/brosur/{*path}'], async (req, res) => {
  const targetUrl = `https://jadwal.alhijaz.co${req.path}`;

  // Try up to 2 times (initial + 1 retry)
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetchWithTimeout(targetUrl, 15000);
      if (!response.ok) {
        if (attempt === 0 && response.status >= 500) continue; // retry on server error
        return res.sendStatus(response.status);
      }

      const contentType = response.headers.get('content-type') || 'application/octet-stream';
      res.set('Content-Type', contentType);
      res.set('Access-Control-Allow-Origin', '*');
      res.set('Cache-Control', 'public, max-age=3600'); // cache 1 hour

      const buffer = Buffer.from(await response.arrayBuffer());
      return res.send(buffer);
    } catch (error) {
      if (attempt === 0) {
        console.warn(`[Proxy] Attempt 1 failed for ${req.path}: ${error.message}, retrying...`);
        continue;
      }
      console.error(`[Proxy] All attempts failed for ${req.path}:`, error.message);
      return res.status(502).json({ error: 'File gagal dimuat', message: 'Server sumber tidak merespon, silakan coba lagi.' });
    }
  }
});

// ──────────────────────────────────────────────
// Landing Page: /:slug/umroh (with in-memory cache)
// ──────────────────────────────────────────────
const umrohLandingCache = new Map();
const UMROH_CACHE_TTL = 3600_000; // 1 hour

async function generateUmrohPage(slug) {
  const mod = await import('./functions/umroh-landing.mjs');
  const agent = await getAgentBySlug(slug);
  const result = await mod.onRequest({
    params: { slug },
    request: new Request('http://localhost/' + slug + '/umroh'),
    agentOverride: agent ? {
      name: agent.name,
      phone: agent.phone,
      photo: agent.photo,
      landing: mergeLandingConfig(agent).umroh,
    } : undefined,
  });
  return await result.text();
}

(async () => {
  try {
    await new Promise(r => setTimeout(r, 2000));
    const agents = await getAgentsBySlug();
    const slugs = Object.keys(agents);
    console.log('[Umroh Landing] Pre-caching ' + slugs.length + ' agents...');
    for (const slug of slugs) {
      try {
        const html = await generateUmrohPage(slug);
        umrohLandingCache.set(slug, { html, ts: Date.now() });
      } catch (e) {
        console.error('[Umroh Landing] Pre-cache failed for', slug, e.message);
      }
    }
    console.log('[Umroh Landing] Pre-cached ' + umrohLandingCache.size + ' pages');
  } catch (e) {
    console.error('[Umroh Landing] Pre-cache init failed:', e.message);
  }
})();

// Helper: resolve slug → current slug (or null if unknown)
// Handles slug history redirects (returns { redirect: 'new-slug' } if old slug)
async function resolveSlug(slug) {
  const agent = await getAgentBySlug(slug);
  if (agent) return { agent };
  // Check history for old slugs
  const { data: history } = await supabase
    .from('agent_slug_history')
    .select('agent_id')
    .eq('old_slug', slug)
    .order('changed_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (history) {
    const current = await getAgentById(history.agent_id);
    if (current) return { redirect: current.slug };
  }
  return null;
}

// Custom-domain landing: /umroh → WordPress umroh landing for the agent owning this domain
app.get('/umroh', async (req, res, next) => {
  if (!req.customDomain || !req.customDomainAgent) return next();
  const slug = String(req.customDomainAgent.slug || '').toLowerCase();
  if (!slug) return next();
  try {
    const cached = umrohLandingCache.get(slug);
    if (cached && (Date.now() - cached.ts) < UMROH_CACHE_TTL) {
      return res.set({
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'private, no-store, must-revalidate',
        'X-Cache': 'HIT',
      }).send(cached.html);
    }
    const html = await generateUmrohPage(slug);
    umrohLandingCache.set(slug, { html, ts: Date.now() });
    res.set({
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'private, no-store, must-revalidate',
      'X-Cache': 'MISS',
    }).send(html);
  } catch (err) {
    console.error('Custom-domain umroh landing error:', err);
    next();
  }
});

app.get('/:slug/umroh', async (req, res) => {
  const slug = req.params.slug.toLowerCase();
  try {
    const resolved = await resolveSlug(slug);
    if (!resolved) {
      // Unknown slug — remove stale cache entry if any
      umrohLandingCache.delete(slug);
      return res.status(404).send('Agent not found');
    }
    if (resolved.redirect) {
      // Old slug — clear stale cache and 301 redirect to current slug
      umrohLandingCache.delete(slug);
      return res.redirect(301, `/${resolved.redirect}/umroh`);
    }

    const cached = umrohLandingCache.get(slug);
    if (cached && (Date.now() - cached.ts) < UMROH_CACHE_TTL) {
      return res.set({
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=3600',
        'X-Cache': 'HIT',
      }).send(cached.html);
    }

    const html = await generateUmrohPage(slug);
    umrohLandingCache.set(slug, { html, ts: Date.now() });

    res.set({
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
      'X-Cache': 'MISS',
    }).send(html);
  } catch (err) {
    console.error('Umroh landing error:', err);
    res.status(500).send('Internal Server Error');
  }
});

// ──────────────────────────────────────────────
// Landing Page: /:slug/haji (with in-memory cache)
// ──────────────────────────────────────────────
const hajiLandingCache = new Map(); // slug → { html, ts }
const HAJI_CACHE_TTL = 3600_000;    // 1 hour

// Helper: generate haji page for a slug using Supabase agent data
async function generateHajiPage(slug) {
  const mod = await import('./functions/haji-landing.mjs');
  const agent = await getAgentBySlug(slug);
  const result = await mod.onRequest({
    params: { slug },
    request: new Request('http://localhost/' + slug + '/haji'),
    agentOverride: agent ? {
      name: agent.name,
      phone: agent.phone,
      photo: agent.photo,
      landing: mergeLandingConfig(agent).haji,
    } : undefined,
  });
  return await result.text();
}

// Pre-load cache for ALL agents from Supabase on startup
(async () => {
  try {
    // Wait a moment for Supabase client to be ready
    await new Promise(r => setTimeout(r, 2000));
    const agents = await getAgentsBySlug();
    const slugs = Object.keys(agents);
    console.log('[Haji Landing] Pre-caching ' + slugs.length + ' agents...');
    for (const slug of slugs) {
      try {
        const html = await generateHajiPage(slug);
        hajiLandingCache.set(slug, { html, ts: Date.now() });
      } catch (e) {
        console.error('[Haji Landing] Pre-cache failed for', slug, e.message);
      }
    }
    console.log('[Haji Landing] Pre-cached ' + hajiLandingCache.size + ' pages');
  } catch (e) {
    console.error('[Haji Landing] Pre-cache init failed:', e.message);
  }
})();

// Custom-domain landing: /haji → WordPress haji landing for the agent owning this domain
app.get('/haji', async (req, res, next) => {
  if (!req.customDomain || !req.customDomainAgent) return next();
  const slug = String(req.customDomainAgent.slug || '').toLowerCase();
  if (!slug) return next();
  try {
    const cached = hajiLandingCache.get(slug);
    if (cached && (Date.now() - cached.ts) < HAJI_CACHE_TTL) {
      return res.set({
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'private, no-store, must-revalidate',
        'X-Cache': 'HIT',
      }).send(cached.html);
    }
    const html = await generateHajiPage(slug);
    hajiLandingCache.set(slug, { html, ts: Date.now() });
    res.set({
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'private, no-store, must-revalidate',
      'X-Cache': 'MISS',
    }).send(html);
  } catch (err) {
    console.error('Custom-domain haji landing error:', err);
    next();
  }
});

app.get('/:slug/haji', async (req, res) => {
  const slug = req.params.slug.toLowerCase();
  try {
    const resolved = await resolveSlug(slug);
    if (!resolved) {
      hajiLandingCache.delete(slug);
      return res.status(404).send('Agent not found');
    }
    if (resolved.redirect) {
      hajiLandingCache.delete(slug);
      return res.redirect(301, `/${resolved.redirect}/haji`);
    }

    const cached = hajiLandingCache.get(slug);
    if (cached && (Date.now() - cached.ts) < HAJI_CACHE_TTL) {
      return res.set({
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=3600',
        'X-Cache': 'HIT',
      }).send(cached.html);
    }

    const html = await generateHajiPage(slug);
    hajiLandingCache.set(slug, { html, ts: Date.now() });

    res.set({
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
      'X-Cache': 'MISS',
    }).send(html);
  } catch (err) {
    console.error('Haji landing error:', err);
    res.status(500).send('Internal Server Error');
  }
});

// ──────────────────────────────────────────────
// Bio Page: /:slug/bio — SSR OG meta injection (React SPA handles body)
// ──────────────────────────────────────────────

function escapeHtmlAttr(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

app.get('/:slug/bio', async (req, res, next) => {
  const slug = String(req.params.slug || '').toLowerCase();
  try {
    const resolved = await resolveSlug(slug);
    if (!resolved) return next(); // unknown slug → SPA fallback (React 404)
    if (resolved.redirect) {
      return res.redirect(301, `/${resolved.redirect}/bio`);
    }

    const agent = resolved.agent;
    const bioConfig = agent.bio_config || {};
    if (bioConfig.enabled === false) return next(); // explicitly disabled → SPA 404

    const title = bioConfig.seo?.title
      || `${agent.name} — Konsultan Umroh & Haji Plus`;
    const description = bioConfig.seo?.description
      || `Halaman resmi ${agent.name}, mitra travel Umroh dan Haji Plus Alhijaz Indowisata.`;
    const origin = `${req.protocol}://${req.get('host')}`;
    const ogImage = bioConfig.seo?.og_image_url || `${origin}/og/${slug}.png`;
    const pageUrl = `${origin}/${slug}/bio`;

    const indexPath = resolve(distPath, 'index.html');
    let html = readFileSync(indexPath, 'utf-8');

    const t = escapeHtmlAttr(title);
    const d = escapeHtmlAttr(description);
    const img = escapeHtmlAttr(ogImage);
    const url = escapeHtmlAttr(pageUrl);

    html = html.replace(/<title>[^<]*<\/title>/i, `<title>${t}</title>`);
    html = html.replace(
      /<meta\s+name="description"\s+content="[^"]*"\s*\/?>/i,
      `<meta name="description" content="${d}" />`
    );
    // Strip any inherited OG tags so bio's canonical tags win
    html = html.replace(/<meta\s+property="og:[^"]*"\s+content="[^"]*"\s*\/?>\s*/gi, '');
    html = html.replace(/<link\s+rel="canonical"[^>]*>\s*/gi, '');

    const metaTags = `
    <link rel="canonical" href="${url}" />
    <meta property="og:title" content="${t}" />
    <meta property="og:description" content="${d}" />
    <meta property="og:type" content="profile" />
    <meta property="og:url" content="${url}" />
    <meta property="og:site_name" content="Alhijaz Indowisata" />
    <meta property="og:image" content="${img}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${t}" />
    <meta name="twitter:description" content="${d}" />
    <meta name="twitter:image" content="${img}" />
    `;
    html = html.replace('</head>', `${metaTags}</head>`);

    res.set({
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
    }).send(html);
  } catch (err) {
    console.error('[bio] SSR error for', slug, ':', err.message);
    next();
  }
});

// ──────────────────────────────────────────────
// Haji Plus: Scrape + Sync + API
// ──────────────────────────────────────────────

let hajiPlusCache = null;

async function scrapeHajiPlusData() {
  const cheerio = await import('cheerio');
  const url = 'https://alhijazindowisata.com/jadwal/grafik-haji-khusus/alhijaz-indowisata';

  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const html = await res.text();
  const $ = cheerio.load(html);

  // Row 0: <th>TAHUN</th><th>2026</th>... (years in th)
  // Row 1: <th>JUMLAH</th><td>482</td>... (pax in td)
  const rows = $('table tr');
  if (rows.length < 2) throw new Error('Table structure changed');

  const years = [];
  const paxes = [];

  rows.eq(0).find('th, td').each((_, el) => {
    const text = $(el).text().trim();
    if (/^\d{4}$/.test(text)) years.push(parseInt(text));
  });

  rows.eq(1).find('td').each((_, el) => {
    const text = $(el).text().trim().replace(/[^\d]/g, '');
    if (text) paxes.push(parseInt(text));
  });

  if (years.length === 0 || years.length !== paxes.length) {
    throw new Error(`Parse mismatch: ${years.length} years, ${paxes.length} pax values`);
  }

  return years.map((year, i) => ({ year, pax: paxes[i] }));
}

async function syncHajiPlusData() {
  try {
    console.log('[HajiPlus] Syncing data...');
    const data = await scrapeHajiPlusData();

    const { error } = await supabase
      .from('haji_plus_stats')
      .upsert({
        id: 'current',
        data: data,
        synced_at: new Date().toISOString(),
      });

    if (error) throw error;

    // Update in-memory cache
    hajiPlusCache = { data, synced_at: new Date().toISOString() };
    console.log(`[HajiPlus] Synced: ${data.length} years, total ${data.reduce((s, d) => s + d.pax, 0)} pax`);
  } catch (err) {
    console.error('[HajiPlus] Sync failed:', err.message);
  }
}

async function getHajiPlusData() {
  if (hajiPlusCache) return hajiPlusCache;

  // Fallback to Supabase
  try {
    const { data, error } = await supabase
      .from('haji_plus_stats')
      .select('*')
      .eq('id', 'current')
      .single();

    if (!error && data) {
      hajiPlusCache = { data: data.data, synced_at: data.synced_at };
      return hajiPlusCache;
    }
    console.log('[HajiPlus] DB fallback: no data or error:', error?.message);
  } catch (err) {
    console.error('[HajiPlus] getHajiPlusData exception:', err.message);
  }

  return null;
}

// ============================
// Sentry error handler — HARUS setelah semua routes
// dan SEBELUM custom error handler lainnya
// ============================
Sentry.setupExpressErrorHandler(app);

// Fallback error handler (setelah Sentry)
app.use((err, req, res, next) => {
  const status = err.status || err.statusCode || 500;
  console.error('[server] Unhandled error:', {
    method: req.method,
    url: req.originalUrl,
    status,
    type: err.type,
    name: err.name,
    message: err.message,
    contentLength: req.headers['content-length'],
    contentType: req.headers['content-type'],
  });
  res.status(status).json({ error: err.message || 'Internal server error' });
});

// ──────────────────────────────────────────────
// Static files + SPA fallback with OG injection
// ──────────────────────────────────────────────
const distPath = resolve(__dirname, 'dist');
const publicPath = resolve(__dirname, 'public');

function detectImageContentType(buffer, fallback = 'image/jpeg') {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return fallback;
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return 'image/png';
  }
  if (buffer[0] === 0xff && buffer[1] === 0xd8) {
    return 'image/jpeg';
  }
  if (buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') {
    return 'image/webp';
  }
  return fallback;
}

// Portal-jamaah share-card OG. Registered BEFORE static so we don't burn an FS
// stat on every bot fetch. Generated on-demand; cached an hour by the CDN/bot.
app.get('/og/jamaah/:slug/:token.png', async (req, res) => {
  try {
    const meta = await lookupPortalTokenMeta(req.params.slug, req.params.token);
    if (!meta) return res.status(404).type('text/plain').send('not found');
    const agentPhotoBuffer = await loadAgentPhotoBuffer(meta.agent.photo, meta.agent.slug);
    const png = await generatePortalJamaahOgPng({
      jamaahName: meta.jamaahName,
      paketName: meta.paketName,
      maskapai: meta.maskapai,
      agentName: meta.agent.name,
      agentPhotoBuffer,
    });
    res.set({
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=3600',
    }).send(png);
  } catch (err) {
    console.error('[og/jamaah] generation failed:', err.message);
    res.status(500).type('text/plain').send('og generation failed');
  }
});

// Serve static assets from dist/ first, then fallback to public/
// This ensures uploaded files (e.g. agent photos in public/agents/)
// are always accessible, even if they were added after the last build.
app.get('/agents/:file', async (req, res, next) => {
  const match = String(req.params.file || '').match(/^([a-z0-9-]+)\.(jpe?g|png|webp)$/i);
  if (!match) return next();

  const slug = match[1].toLowerCase();
  const ext = match[2].toLowerCase();
  const fallbackContentType = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';

  try {
    const agent = await getAgentBySlug(slug);
    const photoBuffer = await loadAgentPhotoBuffer(agent?.photo, slug);
    if (!photoBuffer) return next();

    res.set({
      'Content-Type': detectImageContentType(photoBuffer, fallbackContentType),
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
    });
    return res.send(photoBuffer);
  } catch (err) {
    console.warn(`[agents-photo] failed to serve ${slug}:`, err.message);
    return next();
  }
});
app.use(express.static(distPath, { index: false }));
app.use(express.static(publicPath, { index: false }));

// Airline code → name mapping untuk OG meta
const AIRLINE_NAMES_SERVER = {
  GA: 'Garuda Indonesia', SV: 'Saudia', EK: 'Emirates', QR: 'Qatar Airways',
  TK: 'Turkish Airlines', SQ: 'Singapore Airlines', MH: 'Malaysia Airlines',
  OD: 'Batik Air', JT: 'Lion Air', QG: 'Citilink', ID: 'Super Air Jet',
  IW: 'Wings Air', IN: 'NAM Air', KD: 'Kal Star Aviation',
};

// OG meta injection untuk flight share pages (harus SEBELUM SPA catch-all)
app.get('/f/:code', async (req, res, next) => {
  try {
    const { code } = req.params;

    const { data: share } = await supabase
      .from('flight_shares')
      .select('flight_number, flight_date, dep_iata, arr_iata, dep_city, arr_city, agent_id, airline_code')
      .eq('code', code)
      .single();

    if (!share) return next(); // fallback ke SPA

    // Ambil nama agent
    const { data: agent } = await supabase
      .from('agents')
      .select('slug, name')
      .eq('id', share.agent_id)
      .single();

    const agentName = agent?.name || 'Agent';
    const agentSlug = agent?.slug || '';
    const airlineName = AIRLINE_NAMES_SERVER[share.airline_code] || '';
    const flightNum = share.flight_number.replace(/^([A-Z]{2})(\d+)$/, '$1 $2');

    const title = `Lacak Penerbangan ${airlineName ? airlineName + ' ' : ''}${flightNum} - ${agentName}`;
    const description = `Status penerbangan ${share.flight_number} dari ${share.dep_city || share.dep_iata} ke ${share.arr_city || share.arr_iata}. Dikelola oleh ${agentName} — Alhijaz Indowisata.`;
    const ogImageUrl = `${req.protocol}://${req.get('host')}/og/${agentSlug}.png`;

    const indexPath = resolve(distPath, 'index.html');
    let html = readFileSync(indexPath, 'utf-8');

    // Replace existing <title>
    html = html.replace(/<title>[^<]*<\/title>/i, `<title>${title}</title>`);

    // Replace existing <meta name="description">
    html = html.replace(
      /<meta\s+name="description"\s+content="[^"]*"\s*\/?>/i,
      `<meta name="description" content="${description}" />`
    );

    // Remove existing OG tags
    html = html.replace(/<meta\s+property="og:[^"]*"\s+content="[^"]*"\s*\/?>\s*/gi, '');

    const metaTags = `
      <meta property="og:title" content="${title}" />
      <meta property="og:description" content="${description}" />
      <meta property="og:type" content="website" />
      <meta property="og:url" content="https://alhijaz.co/f/${code}" />
      <meta property="og:site_name" content="Alhijaz Indowisata" />
      <meta property="og:image" content="${ogImageUrl}" />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content="${title}" />
      <meta name="twitter:description" content="${description}" />
      <meta name="twitter:image" content="${ogImageUrl}" />
    `;

    // Inject sebelum </head>
    html = html.replace('</head>', `${metaTags}\n</head>`);

    res.set('Content-Type', 'text/html');
    res.send(html);
  } catch (err) {
    console.error('[FlightShare] OG injection error:', err.message);
    next(); // fallback ke SPA
  }
});

// SPA fallback — inject OG tags for agent slugs (or custom-domain agent)
app.get('{*path}', async (req, res) => {
  const indexPath = resolve(distPath, 'index.html');
  let html = readFileSync(indexPath, 'utf-8');

  let agent = null;
  let pageUrl = null;
  let ogImageOrigin = null;

  if (req.customDomainAgent) {
    // Access via custom domain — path adalah path agent page (/, /umroh, /haji, /bio)
    agent = req.customDomainAgent;
    const origin = `https://${req.customDomain}`;
    pageUrl = `${origin}${req.originalUrl}`;
    ogImageOrigin = origin;
  } else {
    // Access via alhijaz.co — slug dari path segment pertama
    const slug = req.path.replace(/^\/+/, '').split('/')[0].toLowerCase();
    agent = RESERVED_SPA_SLUGS.has(slug) ? null : await getAgentBySlug(slug);

    // Redirect old slugs to current slug (only on alhijaz.co)
    if (!agent && slug && !RESERVED_SPA_SLUGS.has(slug)) {
      const { data: history } = await supabase
        .from('agent_slug_history')
        .select('agent_id')
        .eq('old_slug', slug)
        .order('changed_at', { ascending: false })
        .limit(1)
        .single();
      if (history) {
        const currentAgent = await getAgentById(history.agent_id);
        if (currentAgent) {
          const restPath = req.path.slice(slug.length + 1);
          return res.redirect(301, `/${currentAgent.slug}${restPath}`);
        }
      }
    }

    if (agent) {
      pageUrl = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
      ogImageOrigin = `${req.protocol}://${req.get('host')}`;
    }
  }

  if (agent) {
    // Portal-jamaah paths (/[slug]/jamaah/[code]/dashboard or /[slug]/jamaah/[code])
    // need their own title + og:image so WhatsApp shares show the booking owner
    // instead of the agent's generic umroh-schedule card.
    let portalMeta = null;
    if (!req.customDomain) {
      const segs = req.path.replace(/^\/+/, '').split('/').filter(Boolean);
      if (segs[1] === 'jamaah' && segs[2] && isPortalMagicCode(segs[2])) {
        try {
          portalMeta = await lookupPortalTokenMeta(agent.slug, segs[2]);
        } catch (err) {
          console.warn('[spa-fallback] portal meta lookup failed:', err.message);
        }
      }
    }

    let newTitle;
    let newDescription;
    let ogImageUrl;
    if (portalMeta) {
      const parts = [portalMeta.jamaahName, portalMeta.paketName, portalMeta.maskapai].filter(Boolean);
      newTitle = parts.join(' | ');
      const descParts = [`Portal jamaah ${portalMeta.jamaahName}`];
      if (portalMeta.paketName) descParts.push(`paket ${portalMeta.paketName}`);
      if (agent.name) descParts.push(`bersama ${agent.name}`);
      newDescription = `${descParts.join(' — ')}.`;
      const segs = req.path.replace(/^\/+/, '').split('/').filter(Boolean);
      ogImageUrl = `${ogImageOrigin}/og/jamaah/${agent.slug}/${segs[2].toLowerCase()}.png`;
    } else {
      newTitle = `Jadwal Umroh Alhijaz | ${agent.name}`;
      newDescription = `Dapatkan info lengkap paket umrah Alhijaz Indowisata bersama ${agent.name}. Klik untuk konsultasi via WhatsApp.`;
      // Prefer the agent's custom Umroh landing OG (if they set one via AI Tools → Landing Page).
      // Falls back to the auto-generated /og/{slug}.png served from alhijaz.co (file lives there).
      const customUmrohOg = agent.landing_config?.umroh?.og_image_url;
      ogImageUrl = customUmrohOg || `${ogImageOrigin}/og/${agent.slug}.png`;
    }

    // Replace <title>
    html = html.replace(/<title>[^<]*<\/title>/i, `<title>${newTitle}</title>`);

    // Replace <meta name="description">
    html = html.replace(
      /<meta\s+name="description"\s+content="[^"]*"\s*\/?>/i,
      `<meta name="description" content="${newDescription}" />`
    );

    // Remove existing OG / canonical tags so the injected ones are authoritative
    html = html.replace(/<meta\s+property="og:[^"]*"\s+content="[^"]*"\s*\/?>\s*/gi, '');
    html = html.replace(/<link\s+rel="canonical"[^>]*>\s*/gi, '');

    // Build agent context for the SPA (read by App.tsx)
    const hasCustomDomain = !!(
      isCustomDomainEnabledForAgent(agent) &&
      agent.custom_domain &&
      agent.custom_domain_status === 'active'
    );
    const agentContext = JSON.stringify({
      slug: agent.slug,
      name: agent.name,
      website: agent.website || null,
      phone: agent.phone || null,
      photo: agent.photo || null,
      email: agent.email || null,
      customDomain: req.customDomain || (hasCustomDomain ? agent.custom_domain : null),
      hasCustomDomain,
    });

    // Inject OG + Twitter tags + canonical + agent context
    const metaTags = `
    <link rel="canonical" href="${pageUrl}" />
    <meta property="og:title" content="${newTitle}" />
    <meta property="og:description" content="${newDescription}" />
    <meta property="og:url" content="${pageUrl}" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="Alhijaz Indowisata" />
    <meta property="og:image" content="${ogImageUrl}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${newTitle}" />
    <meta name="twitter:description" content="${newDescription}" />
    <meta name="twitter:image" content="${ogImageUrl}" />
    <script>window.__AGENT_CONTEXT__ = ${agentContext};</script>
    `;
    html = html.replace('</head>', `${metaTags}</head>`);

    // Inject agent card_variant so the SPA can read it without waiting for Supabase
    if (agent.card_variant && agent.card_variant !== 'default') {
      html = html.replace('<body', `<body data-agent-card-variant="${agent.card_variant}"`);
    }
  }

  res.set('Content-Type', 'text/html');
  // HTML on custom domain embeds per-host __AGENT_CONTEXT__ — never cache it,
  // or the next visitor on this origin gets the previous agent's shell.
  if (req.customDomain) {
    res.set('Cache-Control', 'private, no-store, must-revalidate');
  }
  res.send(html);
});

app.listen(PORT, () => {
  console.log(`🚀 Alhijaz server running on http://localhost:${PORT}`);
  if (shouldRunBackgroundJobs()) {
    initNotifier();
  } else {
    console.log('[BackgroundJobs] Disabled — skipping Telegram notifier cron jobs');
  }
});

// ── Keep Supabase alive (prevent free-tier pausing) ──
const KEEP_ALIVE_INTERVAL = 3 * 24 * 60 * 60 * 1000; // 3 hari

async function pingSupabase() {
  try {
    const { count } = await supabase
      .from('agents')
      .select('*', { count: 'exact', head: true });
    console.log(`[Keep-Alive] ✅ Supabase ping OK — ${count} agents (${new Date().toISOString()})`);
  } catch (err) {
    console.warn('[Keep-Alive] ⚠️ Supabase ping failed:', err.message);
  }
}

// Ping once on startup (after 30s delay), then every 3 days
setTimeout(pingSupabase, 30 * 1000);
setInterval(pingSupabase, KEEP_ALIVE_INTERVAL);

// ── Background Sync Job: sync all agents every 1 hour ──
// Uses the same monthly-chunk strategy as manual sync to avoid timeouts
async function syncOneAgent(agent) {
  const slug = agent.slug;
  const agentId = agent.id;
  // Skip if ANY sync (manual or background) is already running for this agent
  const state = syncingAgents.get(agentId);
  if (state?.isSyncing) {
    console.log(`[SYNC] Skipping ${slug} — already syncing`);
    return;
  }

  syncingAgents.set(agentId, { isSyncing: true, background: true, scope: 'umroh-bg', totalSynced: 0, lastSync: null, startedAt: Date.now(), username: agent.jamaah_username });

  // ── Route to Alhijaz Official API path when enabled ──
  // This bypasses the entire legacy scrape pipeline so background and manual
  // syncs stay aligned (otherwise the hourly bg sync would re-write data with
  // the legacy field formats and undo the API-fresh values).
  // Lazy-discover key for agents who logged in before Phase 1 — silent best-
  // effort, falls through to legacy if it can't get a key.
  let awapiFallbackUsed = false;
  if (process.env.AWAPI_SYNC_ENABLED === 'true') {
    agent = await ensureAwapiCredentials(agent);
    if (!agent?.jamaah_username || !agent?.jamaah_password) {
      syncingAgents.set(agentId, { isSyncing: false, totalSynced: 0, lastSync: null, loginFailed: true, invalidCredentials: true });
      return;
    }
  }
  if (process.env.AWAPI_SYNC_ENABLED === 'true' && agent.awapi_key) {
    try {
      const result = await syncUmrahViaApiCore(agentId, slug, agent, { context: 'bg' });
      syncingAgents.set(agentId, {
        isSyncing: false,
        totalSynced: result.count,
        lastSync: result.syncedAt,
        completedYears: [],
      });
      console.log(`[SYNC/api/bg] ${slug}: ${result.partial ? 'partial' : 'complete'} — ${result.count} rows in ${result.yearsCompleted}/${result.yearsAttempted} years`);
      return;
    } catch (err) {
      console.error(`[SYNC/api/bg] ${slug} aborted, falling back to legacy:`, err.message);
      awapiFallbackUsed = true;
      syncingAgents.set(agentId, { isSyncing: true, background: true, scope: 'umroh-bg', totalSynced: 0, lastSync: null, startedAt: Date.now(), username: agent.jamaah_username });
      // fall through to legacy
    }
  }

  try {
    // Force fresh session for each background sync (skip remote logout to avoid rate-limiting)
    await laporanDisconnect(agent.jamaah_username, { skipRemoteLogout: true });
    const decrypted = capiDecrypt(agent.jamaah_password);
    const loginResult = await laporanLogin(agent.jamaah_username, decrypted, agent.jamaah_kantor || '2');
    if (!loginResult.success) {
      console.error(`[SYNC] ${slug}: login failed — ${loginResult.error || 'unknown reason'}`);
      const rateLimited = loginResult.reason === 'rate_limited';
      syncingAgents.set(agentId, { isSyncing: false, totalSynced: 0, lastSync: null, loginFailed: true, rateLimited });
      return;
    }

    const syncTime = new Date().toISOString();
    let totalSynced = 0;
    const syncEvents = emptyJamaahSyncEvents();
    const allowNewJamaahNotify = await hasJamaahNotificationBaseline(agentId, agent);

    // ── PHASE 1: Fast scan via umrah list + detail pages ──
    // Captures ALL jamaah including calon (belum DP), plus staf names
    let bookingStafMap = new Map();
    let bookingTglDaftarMap = new Map();
    // Track sync outcome for set-based cleanup decision at end of Phase 1
    const bgFetchedBookingIds = new Set();
    const bgSuccessfulBookingIds = new Set();
    const bgSuccessfulJamaahPerBooking = new Map();
    let bgListComplete = false;
    try {
      const ringkasanRes = await fetchUmrahBookings(agent.jamaah_username);
      const bookings = ringkasanRes.success ? (ringkasanRes.bookings || []) : [];
      bgListComplete = !!ringkasanRes.complete;
      if (!ringkasanRes.success) {
        console.warn(`[SYNC] ${slug}: Phase 1 fetchUmrahBookings failed — ${ringkasanRes.error || 'unknown'}`);
      }

      if (bookings.length > 0) {
        const bookingPaketMap = new Map();
        for (const b of bookings) {
          bookingPaketMap.set(b.id_umroh, b.paket);
          if (b.staf) bookingStafMap.set(b.id_umroh, b.staf);
          if (b.tgl_daftar) bookingTglDaftarMap.set(b.id_umroh, b.tgl_daftar);
        }

        const uniqueIds = [...new Set(bookings.map(b => b.id_umroh))];
        for (const id of uniqueIds) bgFetchedBookingIds.add(id);
        const DETAIL_PARALLEL = 5;
        const bgGlobalKeys = new Set();

        for (let i = 0; i < uniqueIds.length; i += DETAIL_PARALLEL) {
          const batch = uniqueIds.slice(i, i + DETAIL_PARALLEL);
          const results = await Promise.allSettled(
            batch.map(id => fetchUmrahDetail(agent.jamaah_username, id))
          );

          const rowsToUpsert = [];
          for (let j = 0; j < results.length; j++) {
            if (results[j].status !== 'fulfilled') continue;
            const result = results[j].value;
            if (!result.success || !result.items?.length) continue;
            const idUmroh = batch[j];

            bgSuccessfulBookingIds.add(idUmroh);
            const jamaahSet = bgSuccessfulJamaahPerBooking.get(idUmroh) || new Set();

            for (const item of result.items) {
              if (item.nama) jamaahSet.add(String(item.nama).trim().toLowerCase());
              // Determine hijriah year: use actual date first, null if unknown
              // (existing DB value is preserved in the merge step below)
              const computedYear = getHijriahYear(item.tgl_berangkat);
              const itemYear = computedYear || null;
              if (itemYear && Number(itemYear) < 1447) continue;
              item.paket = item.paket || bookingPaketMap.get(idUmroh) || null;
              // Skip rows without a real JM jm_id — Phase 2 will populate them.
              // Synthesizing a fallback here would create ghost duplicates.
              if (!item.jm_id || !/^JM/i.test(String(item.jm_id).trim())) {
                console.log(`[Sync/P1-bg] SKIP no-jmid ${item.id_umroh || '?'} ${item.nama || '?'} (raw=${JSON.stringify(item.jm_id)})`);
                continue;
              }
              rowsToUpsert.push({
                agent_id: agentId,
                id_umroh: item.id_umroh,
                jm_id: item.jm_id,
                nama: item.nama,
                jk: item.jk || null,
                paket: item.paket || null,
                bayar: item.bayar || 0,
                sisa: item.sisa || 0,
                diskon_kantor: item.diskon_kantor || 0,
                diskon_marketing: item.diskon_marketing || 0,
                tgl_berangkat: item.tgl_berangkat || null,
                tgl_daftar: bookingTglDaftarMap.get(idUmroh) || null,
                hijriah_year: itemYear,
                raw_data: { ...item.raw_data, staf: bookingStafMap.get(idUmroh) || null },
                synced_at: syncTime,
              });
            }
            bgSuccessfulJamaahPerBooking.set(idUmroh, jamaahSet);
          }

          if (rowsToUpsert.length > 0) {
            const deduped = new Map();
            for (const row of rowsToUpsert) {
              const key = `${row.agent_id}_${row.id_umroh}_${row.jm_id}`.toLowerCase();
              bgGlobalKeys.add(key);
              deduped.set(key, row);
            }
            const dedupedRows = await mergeExistingUmrohPhase1Enrichment(agentId, Array.from(deduped.values()));
            const guardedRows = await prepareLegacyPaymentRowsForUpsert(agentId, dedupedRows, syncTime);
            const BATCH = 50;
            for (const rowGroup of splitLegacyRowsByPaymentPayload(guardedRows)) {
              for (let b = 0; b < rowGroup.length; b += BATCH) {
                const upsertBatch = filterSafeJamaahRows(rowGroup.slice(b, b + BATCH), 'P1-bg');
                if (upsertBatch.length === 0) continue;
                const batchEvents = await detectUmrohJamaahSyncEvents(agentId, upsertBatch, { allowNewJamaah: allowNewJamaahNotify });
                const { error } = await supabase.from('jamaah').upsert(upsertBatch, { onConflict: 'agent_id,id_umroh,jm_id', defaultToNull: false });
                if (error) console.error(`[SYNC] ${slug} Phase 1 upsert error:`, error.message);
                else mergeJamaahSyncEvents(syncEvents, batchEvents);
              }
            }
          }
        }
        // Query actual DB count for accurate number
        const { count: bgActualCount } = await supabase
          .from('jamaah')
          .select('*', { count: 'exact', head: true })
          .eq('agent_id', agentId);
        totalSynced = bgActualCount || bgGlobalKeys.size;
        console.log(`[SYNC] ${slug}: Phase 1 — ${bgGlobalKeys.size} processed, ${bgActualCount} in DB`);

        // Set-based cleanup: protect rows whose booking detail failed; abort if
        // list response truncated or would-delete exceeds safety threshold.
        const { data: existingDbRows } = await supabase
          .from('jamaah')
          .select('id_umroh, nama')
          .eq('agent_id', agentId);
        const existingForCleanup = (existingDbRows || []).map(r => ({
          bookingId: r.id_umroh,
          jamaahKey: String(r.nama || '').trim().toLowerCase(),
          nama: r.nama,
        }));
        const bgPlan = computeSafeDeletions({
          listComplete: bgListComplete,
          fetchedBookingIds: bgFetchedBookingIds,
          successfulBookingIds: bgSuccessfulBookingIds,
          successfulJamaahPerBooking: bgSuccessfulJamaahPerBooking,
          existingRows: existingForCleanup,
          maxDeletePercent: 0.3,
        });
        if (bgPlan.decision === 'skip') {
          console.warn(`[SYNC] ${slug} cleanup skipped: ${bgPlan.reason} (wouldDelete=${bgPlan.wouldDelete}/${bgPlan.totalExisting})`);
        } else if (bgPlan.toDelete.length > 0) {
          const deletedCount = await executeUmrohDeletions(slug, agentId, bgPlan.toDelete);
          totalSynced -= deletedCount;
          console.log(`[SYNC] ${slug}: removed ${deletedCount} stale jamaah (wouldDelete=${bgPlan.wouldDelete}/${bgPlan.totalExisting})`);
        }
      }
    } catch (p1err) {
      console.error(`[SYNC] ${slug} Phase 1 error:`, p1err.message);
    }

    const deferInlinePhase2 = shouldDeferInlineUmrohPhase2({
      awapiSyncEnabled: process.env.AWAPI_SYNC_ENABLED === 'true',
      awapiKey: agent.awapi_key,
      forceInline: awapiFallbackUsed,
    });

    if (deferInlinePhase2) {
      console.log(`[SYNC] ${slug}: Phase 2 deferred to scheduled enrichment (${DEFAULT_UMROH_PHASE2_TIMES_WIB.join('/')} WIB)`);
    } else {
      // ── PHASE 2: Enrichment via laporan (adds wa, tgl_lahir, perlengkapan, etc.) ──
      // Merge year ranges + split into monthly chunks (same as manual sync)
      const yearsToSync = getActiveHijriahYears();
      const allRanges = yearsToSync.map(y => HIJRIAH_YEARS[y]).filter(Boolean)
        .sort((a, b) => a.tglAwal.localeCompare(b.tglAwal));
      const merged = [];
      for (const r of allRanges) {
        const last = merged[merged.length - 1];
        if (last && r.tglAwal <= last.tglAkhir) {
          if (r.tglAkhir > last.tglAkhir) last.tglAkhir = r.tglAkhir;
        } else {
          merged.push({ tglAwal: r.tglAwal, tglAkhir: r.tglAkhir });
        }
      }
      function bgSplitRange(tglAwal, tglAkhir) {
        const chunks = [];
        let start = new Date(tglAwal);
        const end = new Date(tglAkhir);
        while (start <= end) {
          const chunkEnd = new Date(start);
          chunkEnd.setDate(chunkEnd.getDate() + 6); // 7-day chunks — less data per request = faster PHP response
          const actualEnd = chunkEnd > end ? end : chunkEnd;
          chunks.push({ tglAwal: start.toISOString().split('T')[0], tglAkhir: actualEnd.toISOString().split('T')[0] });
          start = new Date(actualEnd);
          start.setDate(start.getDate() + 1);
        }
        return chunks;
      }

      // Cap at 6 months into the future, sort newest-first — matches manual sync.
      const bgToday = new Date();
      const bgFutureCap = new Date(bgToday);
      bgFutureCap.setMonth(bgFutureCap.getMonth() + 6);
      const bgFutureCapStr = bgFutureCap.toISOString().split('T')[0];
      const bgTodayStr = bgToday.toISOString().split('T')[0];
      for (const span of merged) {
        if (span.tglAkhir > bgFutureCapStr) span.tglAkhir = bgFutureCapStr;
      }
      const bgAllChunks = [];
      for (const span of merged) {
        if (span.tglAwal > bgFutureCapStr) continue;
        bgAllChunks.push(...bgSplitRange(span.tglAwal, span.tglAkhir));
      }
      bgAllChunks.sort((a, b) => {
        const aIsNow = a.tglAwal <= bgTodayStr && a.tglAkhir >= bgTodayStr;
        const bIsNow = b.tglAwal <= bgTodayStr && b.tglAkhir >= bgTodayStr;
        if (aIsNow && !bIsNow) return -1;
        if (!aIsNow && bIsNow) return 1;
        return Math.abs(new Date(a.tglAwal) - bgToday) - Math.abs(new Date(b.tglAwal) - bgToday);
      });
      const fetchJobs = bgAllChunks;
      console.log(`[SYNC] ${slug}: ${fetchJobs.length} chunks (7-day, capped at ${bgFutureCapStr})`);

    const kantor = agent.jamaah_kantor || '2';
    let networkFailures = 0;
    let timeoutCount = 0;
    const PARALLEL = 2; // 2 concurrent fetches — safe with built-in retry in fetchLaporan

    for (let i = 0; i < fetchJobs.length; i += PARALLEL) {
      if (networkFailures >= 3) {
        console.log(`[SYNC] ${slug}: aborting — server unreachable (${networkFailures} network failures)`);
        break;
      }

      const batch = fetchJobs.slice(i, i + PARALLEL);
      const results = await Promise.allSettled(
        batch.map(job => fetchLaporan(agent.jamaah_username, {
          kantor, agentId: agent.jamaah_username,
          tglAwal: job.tglAwal, tglAkhir: job.tglAkhir,
        }))
      );

      for (let j = 0; j < results.length; j++) {
        const job = batch[j];
        const result = results[j].status === 'fulfilled'
          ? results[j].value
          : { success: false, reason: 'unknown', error: results[j].reason?.message };

        if (!result.success) {
          console.log(`[SYNC] ${slug} range ${job.tglAwal}: ${result.error} (${result.reason || 'unknown'})`);
          if (result.reason === 'session_expired') {
            await laporanDisconnect(agent.jamaah_username, { skipRemoteLogout: true });
            await laporanLogin(agent.jamaah_username, decrypted, kantor);
          } else if (result.reason === 'network') {
            networkFailures++;
          } else if (result.reason === 'timeout') {
            timeoutCount++;
          }
          continue;
        }

        // Success
        networkFailures = 0;
        const { items } = parseLaporanHtml(result.html);
        console.log(`[SYNC] ${slug} range ${job.tglAwal}: ${items.length} items`);
        if (items.length === 0) continue;

        // Fetch existing bayar to prevent Phase 2 from regressing payment data
        const laporanNames = items.map(it => it.nama).filter(Boolean);
        const { data: bgExistingPayments, error: bgPaymentLookupErr } = await supabase
          .from('jamaah')
          .select('id_umroh, nama, jm_id, bayar, sisa, raw_data, dokumen')
          .eq('agent_id', agentId)
          .in('nama', laporanNames);
        if (bgPaymentLookupErr) console.warn(`[SYNC] ${slug} bayar lookup error:`, bgPaymentLookupErr.message);
        // Key by jm_id so same-nama siblings don't pollute each other's bayar.
        const bgExistingPaymentByJmId = new Map();
        (bgExistingPayments || []).forEach(r => {
          bgExistingPaymentByJmId.set(`${r.id_umroh}_${r.jm_id}`.toLowerCase(), r);
        });

        const allNewRows = [];
        const BATCH = 50;
        for (let b = 0; b < items.length; b += BATCH) {
          const batchItems = items.slice(b, b + BATCH);
          const rows = buildRows(batchItems, agentId, syncTime);
          // Preserve Phase 1 data that Phase 2 might not have
          for (const row of rows) {
            const staf = bookingStafMap?.get(row.id_umroh);
            if (staf) row.raw_data = { ...(row.raw_data || {}), staf };
            if (!row.tgl_daftar) {
              row.tgl_daftar = bookingTglDaftarMap?.get(row.id_umroh) || null;
            }
            // bayar normally should not regress. Exception: old Phase 1 detail
            // rows were grossed up by discounts; let Phase 2 correct those.
            const bgExistingPayment = bgExistingPaymentByJmId.get(`${row.id_umroh}_${row.jm_id}`.toLowerCase());
            row.dokumen = mergeUmrohDokumen(bgExistingPayment?.dokumen, row.dokumen);
            if (shouldKeepExistingBayar(bgExistingPayment, row.bayar)) {
              row.bayar = bgExistingPayment.bayar;
            }
          }
          const guardedRows = await prepareLegacyPaymentRowsForUpsert(agentId, rows, syncTime);
          allNewRows.push(...guardedRows);
          for (const rowGroup of splitLegacyRowsByPaymentPayload(guardedRows)) {
            const safeRows = filterSafeJamaahRows(rowGroup, 'P2-bg');
            if (safeRows.length > 0) {
              const batchEvents = await detectUmrohJamaahSyncEvents(agentId, safeRows, { allowNewJamaah: allowNewJamaahNotify });
              const { error } = await supabase
                .from('jamaah')
                .upsert(safeRows, { onConflict: 'agent_id,id_umroh,jm_id', defaultToNull: false });
              if (error) console.error(`[SYNC] ${slug} range ${job.tglAwal} batch error:`, error.message);
              else mergeJamaahSyncEvents(syncEvents, batchEvents);
            }
          }
          // Phase 2 is enrichment, not new-jamaah-count. Don't re-count — same jamaah
          // appears across multiple 7-day chunks which would inflate the counter.
          syncingAgents.set(agentId, { isSyncing: true, background: true, scope: 'umroh-bg', totalSynced, lastSync: syncTime });
        }

        // Back-fill enrichment for items whose CSS-truncated jm_id got dropped
        // by buildRows. Targets existing rows keyed on (id_umroh, nama), using
        // the truncated-jm_id suffix hint to disambiguate same-nama siblings.
        await enrichJamaahFromLaporanItems(agentId, items, 'P2-bg');

        // Fire CAPI Purchase events (DP & Lunas)
        const capiIds = allNewRows.map(r => ({ id_umroh: r.id_umroh, jm_id: r.jm_id, nama: r.nama }));
        processCapiPurchases(agentId, slug, 'umroh', capiIds).catch(e =>
          console.error(`[CAPI] Background sync Purchase error:`, e.message)
        );
      }
    }

      if (timeoutCount > 0) {
        console.log(`[SYNC] ${slug}: ${timeoutCount}/${fetchJobs.length} ranges timed out (after retries)`);
      }
    }

    console.log(`[SYNC] ${slug}: total ${totalSynced} umroh synced`);
    queueJamaahSyncNotifications(agentId, syncEvents, `bg/${slug}`);
    {
      const { error: umrohBumpErr } = await supabase.from('agents').update({ last_jamaah_sync_at: syncTime }).eq('id', agentId);
      if (umrohBumpErr) console.warn(`[SYNC] ${slug} bump last_jamaah_sync_at failed:`, umrohBumpErr.message);
      invalidateStatsCache(agentId);
    }

    // ── Haji legacy sync (reuse same session) ──
    // In AWAPI mode this legacy scraper is handled by the dedicated 2x/day
    // scheduled enrichment, so the regular umroh background path does not
    // scrape haji opportunistically.
    if (process.env.AWAPI_SYNC_ENABLED === 'true') {
      console.log(`[SYNC] ${slug}: inline haji legacy skipped — scheduled enrichment owns it`);
    } else {
      try {
      const sessionCookies = getSessionCookie(agent.jamaah_username);
      if (sessionCookies) {
        // Switch scope so HajiPage sees haji-specific counter instead of umroh leftover.
        syncingAgents.set(agentId, { isSyncing: true, background: true, scope: 'haji-bg', totalSynced: 0, lastSync: syncTime });
        const { rows: hajiList, complete: hajiListComplete } = await fetchHajiList(sessionCookies);
        const uniqueIds = [...new Set(hajiList.map(h => h.id_haji))];
        console.log(`[SYNC] ${slug}: found ${uniqueIds.length} unique haji entries, complete=${hajiListComplete}`);

        const hajiFetchedBookingIds = new Set(uniqueIds);
        const hajiSuccessfulBookingIds = new Set();
        const hajiSuccessfulJamaahPerBooking = new Map();

        if (uniqueIds.length > 0) {
          const HAJI_BATCH = 5;
          let hajiSynced = 0;
          const allHajiRows = [];

          for (let i = 0; i < uniqueIds.length; i += HAJI_BATCH) {
            const batch = uniqueIds.slice(i, i + HAJI_BATCH);
            const results = await Promise.allSettled(
              batch.map(async (idHaji) => {
                const details = await fetchHajiDetail(sessionCookies, idHaji);
                const listEntry = hajiList.find(h => h.id_haji === idHaji);
                return { idHaji, details, listEntry };
              })
            );
            for (const r of results) {
              if (r.status === 'fulfilled') {
                const { idHaji, details, listEntry } = r.value;
                hajiSuccessfulBookingIds.add(idHaji);
                const jamaahSet = hajiSuccessfulJamaahPerBooking.get(idHaji) || new Set();
                for (const detail of details) {
                  jamaahSet.add(detail.id_jamaah);
                  allHajiRows.push({
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
                  });
                }
                hajiSuccessfulJamaahPerBooking.set(idHaji, jamaahSet);
              } else if (r.reason?.message === 'SESSION_EXPIRED') {
                throw r.reason;
              }
            }

            // Upsert in batches of 50
            if (allHajiRows.length >= 50 || i + HAJI_BATCH >= uniqueIds.length) {
              if (allHajiRows.length > 0) {
                const hajiCapiIds = allHajiRows.map(r => ({ id_haji: r.id_haji, id_jamaah: r.id_jamaah }));
                const { error: hajiErr } = await supabase
                  .from('jamaah_haji')
                  .upsert(allHajiRows, { onConflict: 'agent_id,id_haji,id_jamaah', defaultToNull: false });
                if (hajiErr) console.error(`[SYNC] ${slug} haji batch error:`, hajiErr.message);
                else processCapiPurchases(agentId, slug, 'haji', hajiCapiIds).catch(e =>
                  console.error(`[CAPI] Haji inline background Purchase error:`, e.message)
                );
                hajiSynced += allHajiRows.length;
                allHajiRows.length = 0;
                syncingAgents.set(agentId, { isSyncing: true, background: true, scope: 'haji-bg', totalSynced: hajiSynced, lastSync: syncTime });
              }
            }

            // Small delay between batches
            if (i + HAJI_BATCH < uniqueIds.length) await new Promise(r => setTimeout(r, 100));
          }
          console.log(`[SYNC] ${slug}: ${hajiSynced} haji jamaah synced`);
        }

        // Safe cleanup via set-based guard (runs even if uniqueIds empty — with protection)
        const { data: existingHajiRows } = await supabase
          .from('jamaah_haji')
          .select('id_haji, id_jamaah')
          .eq('agent_id', agentId);
        const plan = computeSafeDeletions({
          listComplete: hajiListComplete,
          fetchedBookingIds: hajiFetchedBookingIds,
          successfulBookingIds: hajiSuccessfulBookingIds,
          successfulJamaahPerBooking: hajiSuccessfulJamaahPerBooking,
          existingRows: (existingHajiRows || []).map(r => ({ bookingId: r.id_haji, jamaahKey: r.id_jamaah })),
          maxDeletePercent: 0.3,
        });
        if (plan.decision === 'skip') {
          console.warn(`[SYNC] ${slug} haji cleanup skipped: ${plan.reason} (wouldDelete=${plan.wouldDelete}/${plan.totalExisting})`);
        } else if (plan.toDelete.length > 0) {
          const deletedCount = await executeHajiDeletions(slug, agentId, plan.toDelete);
          console.log(`[SYNC] ${slug}: removed ${deletedCount} stale haji (wouldDelete=${plan.wouldDelete}/${plan.totalExisting})`);
        }
        const { error: hajiBumpErr } = await supabase.from('agents').update({ last_jamaah_haji_sync_at: syncTime }).eq('id', agentId);
        if (hajiBumpErr) console.warn(`[SYNC] ${slug} bump last_jamaah_haji_sync_at failed:`, hajiBumpErr.message);
        invalidateStatsCache(agentId);

        await backfillHajiPaketDetail(agentId, slug, sessionCookies);
      }
      } catch (hajiErr) {
        console.error(`[SYNC] ${slug} haji error:`, hajiErr.message);
        // Don't fail the whole sync if haji fails
      }
    }

    // Query final actual DB count
    const { count: finalCount } = await supabase
      .from('jamaah')
      .select('*', { count: 'exact', head: true })
      .eq('agent_id', agentId);
    syncingAgents.set(agentId, { isSyncing: false, totalSynced: finalCount || totalSynced, lastSync: syncTime });
  } catch (err) {
    console.error(`[SYNC] ${slug} error:`, err.message);
  } finally {
    // ALWAYS reset isSyncing — prevents stuck lock
    const currentState = syncingAgents.get(agentId);
    if (currentState?.isSyncing) {
      syncingAgents.set(agentId, {
        isSyncing: false,
        totalSynced: currentState.totalSynced || 0,
        lastSync: currentState.lastSync || null
      });
    }
    try { await laporanDisconnect(agent.jamaah_username, { skipRemoteLogout: true }); } catch {} // Local cleanup only
  }
}

function buildUmrohPhase2FetchJobs(yearsToSync = getActiveHijriahYears(), now = new Date()) {
  const splitRange = (tglAwal, tglAkhir, chunkDays = 7) => {
    const chunks = [];
    let start = new Date(tglAwal);
    const end = new Date(tglAkhir);
    while (start <= end) {
      const chunkEnd = new Date(start);
      chunkEnd.setDate(chunkEnd.getDate() + chunkDays - 1);
      const actualEnd = chunkEnd > end ? end : chunkEnd;
      chunks.push({
        tglAwal: start.toISOString().split('T')[0],
        tglAkhir: actualEnd.toISOString().split('T')[0],
      });
      start = new Date(actualEnd);
      start.setDate(start.getDate() + 1);
    }
    return chunks;
  };

  const allRanges = yearsToSync.map(y => HIJRIAH_YEARS[y]).filter(Boolean)
    .sort((a, b) => a.tglAwal.localeCompare(b.tglAwal));
  const merged = [];
  for (const r of allRanges) {
    const last = merged[merged.length - 1];
    if (last && r.tglAwal <= last.tglAkhir) {
      if (r.tglAkhir > last.tglAkhir) last.tglAkhir = r.tglAkhir;
    } else {
      merged.push({ tglAwal: r.tglAwal, tglAkhir: r.tglAkhir });
    }
  }

  const futureCapDate = new Date(now);
  futureCapDate.setMonth(futureCapDate.getMonth() + 6);
  const futureCap = futureCapDate.toISOString().split('T')[0];
  const jobs = [];
  for (const span of merged) {
    if (span.tglAkhir > futureCap) span.tglAkhir = futureCap;
    if (span.tglAwal > futureCap) continue;
    jobs.push(...splitRange(span.tglAwal, span.tglAkhir));
  }
  jobs.sort((a, b) => b.tglAwal.localeCompare(a.tglAwal));
  return { jobs, futureCap };
}

async function runScheduledUmrohPhase2ForAgent(agent) {
  const agentId = agent.id;
  const slug = agent.slug;
  const username = agent.jamaah_username;
  if (!username || !agent.jamaah_password) return { skipped: true };

  const existing = syncingAgents.get(agentId);
  if (existing?.isSyncing) return { skipped: true };

  const syncTime = new Date().toISOString();
  syncingAgents.set(agentId, {
    isSyncing: true,
    background: true,
    scope: 'umroh-p2',
    phase: 2,
    totalSynced: 0,
    lastSync: syncTime,
    startedAt: Date.now(),
    username,
  });

  try {
    await laporanDisconnect(username, { skipRemoteLogout: true });
    const decrypted = capiDecrypt(agent.jamaah_password);
    const kantor = agent.jamaah_kantor || '2';
    const loginResult = await laporanLogin(username, decrypted, kantor);
    if (!loginResult.success) {
      const rateLimited = loginResult.reason === 'rate_limited';
      console.error(`[SYNC/P2] ${slug}: login failed — ${loginResult.error || 'unknown reason'}`);
      syncingAgents.set(agentId, { isSyncing: false, totalSynced: 0, lastSync: null, loginFailed: true, rateLimited });
      return { loginFailed: true, rateLimited };
    }

    const { jobs, futureCap } = buildUmrohPhase2FetchJobs(getActiveHijriahYears());
    console.log(`[SYNC/P2] ${slug}: scheduled enrichment starting — ${jobs.length} chunks, capped at ${futureCap}`);

    const PARALLEL = 2;
    let networkFailures = 0;
    let timeoutCount = 0;
    let totalItems = 0;
    let updated = 0;

    for (let i = 0; i < jobs.length; i += PARALLEL) {
      if (networkFailures >= 3) {
        console.log(`[SYNC/P2] ${slug}: aborting — legacy system unreachable`);
        break;
      }

      const batch = jobs.slice(i, i + PARALLEL);
      const results = await Promise.allSettled(
        batch.map(job => fetchLaporan(username, {
          kantor,
          agentId: username,
          tglAwal: job.tglAwal,
          tglAkhir: job.tglAkhir,
        }))
      );

      for (let j = 0; j < results.length; j++) {
        const job = batch[j];
        const result = results[j].status === 'fulfilled'
          ? results[j].value
          : { success: false, reason: 'unknown', error: results[j].reason?.message };

        if (!result.success) {
          console.log(`[SYNC/P2] ${slug} range ${job.tglAwal}: ${result.error} (${result.reason || 'unknown'})`);
          if (result.reason === 'session_expired') {
            await laporanDisconnect(username, { skipRemoteLogout: true });
            await laporanLogin(username, decrypted, kantor);
          } else if (result.reason === 'network') {
            networkFailures++;
          } else if (result.reason === 'timeout') {
            timeoutCount++;
          }
          continue;
        }

        networkFailures = 0;
        const { items } = parseLaporanHtml(result.html);
        totalItems += items.length;
        if (items.length === 0) continue;

        updated += await enrichJamaahFromLaporanItems(agentId, items, 'P2-scheduled');
        syncingAgents.set(agentId, {
          isSyncing: true,
          background: true,
          scope: 'umroh-p2',
          phase: 2,
          totalSynced: updated,
          lastSync: syncTime,
          startedAt: Date.now(),
          username,
        });
      }
    }

    if (timeoutCount > 0) {
      console.log(`[SYNC/P2] ${slug}: ${timeoutCount}/${jobs.length} ranges timed out`);
    }
    invalidateStatsCache(agentId);
    console.log(`[SYNC/P2] ${slug}: scheduled enrichment complete — ${updated} updated rows from ${totalItems} laporan items`);
    return { ok: true, updated };
  } catch (err) {
    console.error(`[SYNC/P2] ${slug} error:`, err.message);
    return { error: err.message };
  } finally {
    const cur = syncingAgents.get(agentId);
    if (cur?.isSyncing && cur?.scope === 'umroh-p2') {
      syncingAgents.set(agentId, {
        isSyncing: false,
        totalSynced: cur.totalSynced || 0,
        lastSync: cur.lastSync || syncTime,
      });
    }
    try { await laporanDisconnect(username, { skipRemoteLogout: true }); } catch {}
  }
}

async function runScheduledUmrohPhase2Enrichment() {
  if (process.env.AWAPI_SYNC_ENABLED !== 'true') {
    console.log('[SYNC/P2] Scheduled enrichment skipped — AWAPI sync is disabled');
    return;
  }

  console.log('[SYNC/P2] Starting scheduled umroh Phase 2 enrichment cycle...');
  const startTime = Date.now();
  const { data: agents, error } = await supabase
    .from('agents')
    .select('*')
    .not('jamaah_username', 'is', null)
    .not('jamaah_password', 'is', null)
    .not('awapi_key', 'is', null);

  if (error || !agents?.length) {
    console.log('[SYNC/P2] No AWAPI-enabled agents with credentials found');
    return;
  }

  let ok = 0, fail = 0, skipped = 0, loginFail = 0;
  let abort = false;
  const INTER_AGENT_GAP_MS = 5000;

  for (const agent of agents) {
    if (abort) { skipped++; continue; }
    const result = await runScheduledUmrohPhase2ForAgent(agent);
    if (result.skipped) skipped++;
    else if (result.loginFailed) {
      loginFail++;
      if (result.rateLimited) {
        console.warn(`[SYNC/P2] Aborting cycle — Apache rate-limiting at ${agent.slug}`);
        abort = true;
      }
    } else if (result.error) fail++;
    else ok++;

    if (!abort) await new Promise(r => setTimeout(r, INTER_AGENT_GAP_MS));
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[SYNC/P2] Cycle complete: ${ok} OK, ${loginFail} login failed, ${fail} error, ${skipped} skipped in ${elapsed}s`);
}

function scheduleUmrohPhase2Enrichment() {
  if (process.env.AWAPI_SYNC_ENABLED !== 'true') {
    console.log('[SYNC/P2] Scheduled enrichment disabled because AWAPI_SYNC_ENABLED is not true');
    return;
  }

  const scheduleNext = () => {
    const nextRun = nextJakartaScheduleDate(new Date(), DEFAULT_UMROH_PHASE2_TIMES_WIB);
    const delayMs = Math.max(0, nextRun.getTime() - Date.now());
    console.log(`[SYNC/P2] Next scheduled enrichment in ${Math.round(delayMs / 60000)} minutes (${DEFAULT_UMROH_PHASE2_TIMES_WIB.join(' & ')} WIB)`);
    setTimeout(async () => {
      try {
        await runScheduledUmrohPhase2Enrichment();
      } catch (err) {
        console.error('[SYNC/P2] Scheduled cycle error:', err.message);
      } finally {
        scheduleNext();
      }
    }, delayMs);
  };

  scheduleNext();
}

async function syncAllAgents() {
  console.log('[SYNC] Starting sync cycle...');
  const startTime = Date.now();

  // Force-reset stuck syncs (>15 min)
  const STUCK_TIMEOUT = 15 * 60 * 1000;
  for (const [id, state] of syncingAgents) {
    if (state.isSyncing && state.startedAt && (Date.now() - state.startedAt > STUCK_TIMEOUT)) {
      console.warn(`[SYNC] Force-resetting stuck sync: ${id} (${Math.round((Date.now() - state.startedAt) / 60000)}m)`);
      syncingAgents.set(id, { isSyncing: false, totalSynced: 0, lastSync: null });
      try { if (state.username) await laporanDisconnect(state.username, { skipRemoteLogout: true }); } catch {}
    }
  }

  const { data: agents, error } = await supabase
    .from('agents')
    .select('*')
    .not('jamaah_username', 'is', null)
    .not('jamaah_password', 'is', null);

  if (error || !agents?.length) {
    console.log(`[SYNC] No agents with credentials found`);
    return;
  }

  // When the official API path is enabled, agents can be processed in
  // parallel — there's no Apache session/rate-limit to throttle around.
  // Falls back to sequential + 5s gap for legacy behavior.
  const apiEnabled = process.env.AWAPI_SYNC_ENABLED === 'true';
  const PARALLEL = apiEnabled ? 3 : 1;
  const INTER_AGENT_GAP_MS = apiEnabled ? 0 : 5000;

  let ok = 0, fail = 0, skipped = 0, loginFail = 0;
  let abort = false;

  const processOne = async (agent) => {
    if (abort) { skipped++; return; }
    try {
      const prevState = syncingAgents.get(agent.id);
      if (prevState?.isSyncing) { skipped++; return; }
      await syncOneAgent(agent);
      const afterState = syncingAgents.get(agent.id);
      if (afterState?.loginFailed) {
        loginFail++;
        // Rate-limit only matters for legacy login path (Apache). API path
        // never triggers this flag — so the abort logic remains legacy-only.
        if (afterState.rateLimited) {
          console.warn(`[SYNC] Aborting cycle — Apache rate-limiting detected at ${agent.slug}`);
          abort = true;
        }
      } else {
        ok++;
      }
    } catch (err) {
      console.error(`[SYNC] ${agent.slug} uncaught:`, err.message);
      fail++;
    }
  };

  for (let i = 0; i < agents.length; i += PARALLEL) {
    if (abort) {
      skipped += agents.length - i;
      break;
    }
    const batch = agents.slice(i, i + PARALLEL);
    await Promise.all(batch.map(processOne));
    if (INTER_AGENT_GAP_MS > 0 && i + PARALLEL < agents.length) {
      await new Promise((r) => setTimeout(r, INTER_AGENT_GAP_MS));
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[SYNC] Cycle complete: ${ok} OK, ${loginFail} login failed, ${fail} error, ${skipped} skipped in ${elapsed}s (parallel=${PARALLEL})`);
}

// Clean up old 1446 H data (one-time, 15s after startup)
setTimeout(async () => {
  try {
    const oldYears = ['1439','1440','1441','1442','1443','1444','1445','1446'];
    const { error, count } = await supabase
      .from('jamaah')
      .delete({ count: 'exact' })
      .in('hijriah_year', oldYears);
    if (!error && count > 0) {
      console.log(`[Cleanup] Deleted ${count} old (<1447 H) jamaah records`);
    }
  } catch (err) {
    console.error('[Cleanup] Error:', err.message);
  }
}, 15 * 1000);

// Chain-scheduled sync: next cycle starts a fixed cooldown AFTER the previous
// finishes. Prevents cycle-overlap regardless of how long a single cycle takes.
// API path: 10min cooldown (cycle ~1.5min, refresh per agent ~12min).
// Legacy path: longer cooldown still appropriate due to slower scrape pipeline.
const SYNC_COOLDOWN_MS = process.env.AWAPI_SYNC_ENABLED === 'true'
  ? 10 * 60 * 1000   // 10 minutes
  : 30 * 60 * 1000;  // 30 minutes (legacy)
async function runSyncCycleLoop() {
  while (true) {
    try {
      await syncAllAgents();
    } catch (err) {
      console.error('[SYNC] Cycle error:', err.message);
    }
    await new Promise(r => setTimeout(r, SYNC_COOLDOWN_MS));
  }
}
setTimeout(() => {
  runSyncCycleLoop().catch(err => console.error('[SYNC] Loop crashed:', err.message));
}, 30 * 1000);
scheduleUmrohPhase2Enrichment();
scheduleHajiLegacyEnrichment();

// ── Haji sync: AWAPI owns the frequent sync; legacy scraper enriches sparse fields on schedule. ──
async function syncHajiLegacyOneAgent(agent, { scope = 'haji-legacy' } = {}) {
  const slug = agent.slug;
  const agentId = agent.id;

  // Honor the unified mutex — skip if any sync (manual umroh/haji or umroh bg
  // fallback) is already running for this agent. We'll catch this agent on
  // the next 30min cycle.
  const existing = syncingAgents.get(agentId);
  if (existing?.isSyncing) {
    return { skipped: true };
  }

  syncingAgents.set(agentId, {
    isSyncing: true, background: true, scope,
    totalSynced: 0, lastSync: null, startedAt: Date.now(),
    username: agent.jamaah_username,
  });

  try {
    await laporanDisconnect(agent.jamaah_username, { skipRemoteLogout: true });
    const decrypted = capiDecrypt(agent.jamaah_password);
    const loginResult = await laporanLogin(agent.jamaah_username, decrypted, agent.jamaah_kantor || '2');
    if (!loginResult.success) {
      console.error(`[HAJI-LEGACY] ${slug}: login failed — ${loginResult.error || 'unknown reason'}`);
      const rateLimited = loginResult.reason === 'rate_limited';
      syncingAgents.set(agentId, { isSyncing: false, totalSynced: 0, lastSync: null, loginFailed: true, rateLimited });
      return { loginFailed: true, rateLimited };
    }

    const sessionCookies = getSessionCookie(agent.jamaah_username);
    if (!sessionCookies) {
      console.warn(`[HAJI-LEGACY] ${slug}: no session cookie after login`);
      syncingAgents.set(agentId, { isSyncing: false, totalSynced: 0, lastSync: null });
      return { loginFailed: true };
    }

    const syncTime = new Date().toISOString();
    const { rows: hajiList, complete: hajiListComplete } = await fetchHajiList(sessionCookies);
    const uniqueIds = [...new Set(hajiList.map(h => h.id_haji))];
    console.log(`[HAJI-LEGACY] ${slug}: found ${uniqueIds.length} unique haji entries, complete=${hajiListComplete}`);

    const fetchedBookingIds = new Set(uniqueIds);
    const successfulBookingIds = new Set();
    const successfulJamaahPerBooking = new Map();

    if (uniqueIds.length > 0) {
      const HAJI_BATCH = 5;
      let hajiSynced = 0;
      const allHajiRows = [];

      for (let i = 0; i < uniqueIds.length; i += HAJI_BATCH) {
        const batch = uniqueIds.slice(i, i + HAJI_BATCH);
        const results = await Promise.allSettled(
          batch.map(async (idHaji) => {
            const details = await fetchHajiDetail(sessionCookies, idHaji);
            const listEntry = hajiList.find(h => h.id_haji === idHaji);
            return { idHaji, details, listEntry };
          })
        );
        for (const r of results) {
          if (r.status === 'fulfilled') {
            const { idHaji, details, listEntry } = r.value;
            successfulBookingIds.add(idHaji);
            const jamaahSet = successfulJamaahPerBooking.get(idHaji) || new Set();
            for (const detail of details) {
              jamaahSet.add(detail.id_jamaah);
              allHajiRows.push({
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
              });
            }
            successfulJamaahPerBooking.set(idHaji, jamaahSet);
          } else if (r.reason?.message === 'SESSION_EXPIRED') {
            throw r.reason;
          }
        }

        if (allHajiRows.length >= 50 || i + HAJI_BATCH >= uniqueIds.length) {
          if (allHajiRows.length > 0) {
            const hajiCapiIds = allHajiRows.map(r => ({ id_haji: r.id_haji, id_jamaah: r.id_jamaah }));
            const { error: hajiErr } = await supabase
              .from('jamaah_haji')
              .upsert(allHajiRows, { onConflict: 'agent_id,id_haji,id_jamaah', defaultToNull: false });
            if (hajiErr) console.error(`[HAJI-LEGACY] ${slug} batch error:`, hajiErr.message);
            else processCapiPurchases(agentId, slug, 'haji', hajiCapiIds).catch(e =>
              console.error(`[CAPI] Haji dedicated background Purchase error:`, e.message)
            );
            hajiSynced += allHajiRows.length;
            allHajiRows.length = 0;
            syncingAgents.set(agentId, {
              isSyncing: true, background: true, scope,
              totalSynced: hajiSynced, lastSync: syncTime,
              startedAt: Date.now(), username: agent.jamaah_username,
            });
          }
        }

        if (i + HAJI_BATCH < uniqueIds.length) await new Promise(r => setTimeout(r, 100));
      }
      console.log(`[HAJI-LEGACY] ${slug}: ${hajiSynced} haji jamaah synced`);
    }

    const { data: existingHajiRows } = await supabase
      .from('jamaah_haji')
      .select('id_haji, id_jamaah')
      .eq('agent_id', agentId);
    const plan = computeSafeDeletions({
      listComplete: hajiListComplete,
      fetchedBookingIds,
      successfulBookingIds,
      successfulJamaahPerBooking,
      existingRows: (existingHajiRows || []).map(r => ({ bookingId: r.id_haji, jamaahKey: r.id_jamaah })),
      maxDeletePercent: 0.3,
    });
    if (plan.decision === 'skip') {
      console.warn(`[HAJI-LEGACY] ${slug} cleanup skipped: ${plan.reason} (wouldDelete=${plan.wouldDelete}/${plan.totalExisting})`);
    } else if (plan.toDelete.length > 0) {
      const deletedCount = await executeHajiDeletions(slug, agentId, plan.toDelete);
      console.log(`[HAJI-LEGACY] ${slug}: removed ${deletedCount} stale haji (wouldDelete=${plan.wouldDelete}/${plan.totalExisting})`);
    }

    const { error: bumpErr } = await supabase.from('agents').update({ last_jamaah_haji_sync_at: syncTime }).eq('id', agentId);
    if (bumpErr) console.warn(`[HAJI-LEGACY] ${slug} bump last_jamaah_haji_sync_at failed:`, bumpErr.message);
    invalidateStatsCache(agentId);

    await backfillHajiPaketDetail(agentId, slug, sessionCookies);

    return { ok: true };
  } catch (err) {
    console.error(`[HAJI-LEGACY] ${slug} error:`, err.message);
    return { error: err.message };
  } finally {
    // Only release the lock if we still own it. A manual sync
    // that started during our run would have its own scope and we must not
    // clobber its state.
    const cur = syncingAgents.get(agentId);
    if (cur?.isSyncing && cur?.scope === scope) {
      syncingAgents.set(agentId, {
        isSyncing: false,
        totalSynced: cur.totalSynced || 0,
        lastSync: cur.lastSync || null,
      });
    }
    try { await laporanDisconnect(agent.jamaah_username, { skipRemoteLogout: true }); } catch {}
  }
}

async function syncHajiOneAgent(agent) {
  const slug = agent.slug;
  const agentId = agent.id;

  if (process.env.AWAPI_SYNC_ENABLED !== 'true') {
    return { skipped: true, reason: 'awapi_disabled' };
  }

  const existing = syncingAgents.get(agentId);
  if (existing?.isSyncing) {
    return { skipped: true };
  }

  syncingAgents.set(agentId, {
    isSyncing: true,
    background: true,
    scope: 'haji-api',
    totalSynced: 0,
    lastSync: null,
    startedAt: Date.now(),
  });

  try {
    const awapiAgent = await ensureAwapiCredentials(agent);
    if (!awapiAgent?.awapi_key) {
      console.warn(`[HAJI-API] ${slug}: no AWAPI key available`);
      return { skipped: true, reason: 'missing_awapi_key' };
    }

    const result = await syncHajiViaApiCore(agentId, slug, awapiAgent, { context: 'background' });
    syncingAgents.set(agentId, {
      isSyncing: false,
      totalSynced: result.count,
      lastSync: result.syncedAt,
    });
    console.log(`[HAJI-API] ${slug}: ${result.partial ? 'partial' : 'complete'} — ${result.count} rows`);
    return { ok: true };
  } catch (err) {
    console.error(`[HAJI-API] ${slug} error:`, err.message);
    return { error: err.message };
  } finally {
    const cur = syncingAgents.get(agentId);
    if (cur?.isSyncing && cur?.scope === 'haji-api') {
      syncingAgents.set(agentId, {
        isSyncing: false,
        totalSynced: cur.totalSynced || 0,
        lastSync: cur.lastSync || null,
      });
    }
  }
}

async function syncAllAgentsHaji() {
  if (process.env.AWAPI_SYNC_ENABLED !== 'true') {
    console.log('[HAJI-API] Background sync disabled because AWAPI_SYNC_ENABLED is not true');
    return;
  }

  console.log('[HAJI-API] Starting haji AWAPI sync cycle...');
  const startTime = Date.now();

  const { data: agents, error } = await supabase
    .from('agents')
    .select('*');

  const eligibleAgents = (agents || []).filter(agent =>
    agent.awapi_key || (agent.jamaah_username && agent.jamaah_password)
  );

  if (error || !eligibleAgents.length) {
    console.log('[HAJI-API] No agents with AWAPI key or legacy credentials found');
    return;
  }

  // Sequential with 5s gap to avoid Apache rate-limiting on rapid logins
  // (same throttling pattern that legacy umroh bg sync used historically).
  let ok = 0, fail = 0, skipped = 0, loginFail = 0;
  let abort = false;
  const INTER_AGENT_GAP_MS = 5000;

  for (const agent of eligibleAgents) {
    if (abort) { skipped++; continue; }
    try {
      const result = await syncHajiOneAgent(agent);
      if (result.skipped) skipped++;
      else if (result.loginFailed) {
        loginFail++;
        if (result.rateLimited) {
          console.warn(`[HAJI-API] Aborting cycle — Apache rate-limiting at ${agent.slug}`);
          abort = true;
        }
      } else if (result.error) fail++;
      else ok++;
    } catch (err) {
      console.error(`[HAJI-API] ${agent.slug} uncaught:`, err.message);
      fail++;
    }
    if (!abort) {
      await new Promise(r => setTimeout(r, INTER_AGENT_GAP_MS));
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[HAJI-API] Cycle complete: ${ok} OK, ${loginFail} login failed, ${fail} error, ${skipped} skipped in ${elapsed}s`);
}

async function runScheduledHajiLegacyEnrichment() {
  console.log('[HAJI-LEGACY] Starting scheduled haji legacy enrichment cycle...');
  const startTime = Date.now();

  const { data: agents, error } = await supabase
    .from('agents')
    .select('*')
    .not('jamaah_username', 'is', null)
    .not('jamaah_password', 'is', null);

  if (error || !agents?.length) {
    console.log('[HAJI-LEGACY] No agents with credentials found');
    return;
  }

  let ok = 0, fail = 0, skipped = 0, loginFail = 0;
  let abort = false;
  const INTER_AGENT_GAP_MS = 5000;

  for (const agent of agents) {
    if (abort) { skipped++; continue; }
    try {
      const result = await syncHajiLegacyOneAgent(agent, { scope: 'haji-legacy' });
      if (result.skipped) skipped++;
      else if (result.loginFailed) {
        loginFail++;
        if (result.rateLimited) {
          console.warn(`[HAJI-LEGACY] Aborting cycle — Apache rate-limiting at ${agent.slug}`);
          abort = true;
        }
      } else if (result.error) fail++;
      else ok++;
    } catch (err) {
      console.error(`[HAJI-LEGACY] ${agent.slug} uncaught:`, err.message);
      fail++;
    }
    if (!abort) {
      await new Promise(r => setTimeout(r, INTER_AGENT_GAP_MS));
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[HAJI-LEGACY] Cycle complete: ${ok} OK, ${loginFail} login failed, ${fail} error, ${skipped} skipped in ${elapsed}s`);
}

function scheduleHajiLegacyEnrichment() {
  const scheduleNext = () => {
    const nextRun = nextJakartaScheduleDate(new Date(), DEFAULT_UMROH_PHASE2_TIMES_WIB);
    const delayMs = Math.max(0, nextRun.getTime() - Date.now());
    console.log(`[HAJI-LEGACY] Next scheduled enrichment in ${Math.round(delayMs / 60000)} minutes (${DEFAULT_UMROH_PHASE2_TIMES_WIB.join(' & ')} WIB)`);
    setTimeout(async () => {
      try {
        await runScheduledHajiLegacyEnrichment();
      } catch (err) {
        console.error('[HAJI-LEGACY] Scheduled cycle error:', err.message);
      } finally {
        scheduleNext();
      }
    }, delayMs);
  };

  scheduleNext();
}

const HAJI_AWAPI_SYNC_COOLDOWN_MS = 30 * 60 * 1000;
async function runHajiSyncCycleLoop() {
  while (true) {
    try {
      await syncAllAgentsHaji();
    } catch (err) {
      console.error('[HAJI-API] Cycle error:', err.message);
    }
    await new Promise(r => setTimeout(r, HAJI_AWAPI_SYNC_COOLDOWN_MS));
  }
}
// Start 90s after boot — well after the umroh API loop (30s) so the very
// first haji cycle doesn't compete for boot resources.
setTimeout(() => {
  runHajiSyncCycleLoop().catch(err => console.error('[HAJI-API] Loop crashed:', err.message));
}, 90 * 1000);

// ── Umroh schedules sync: 45s after startup, then every 30 minutes ──
async function runScheduleSync() {
  await syncUmrohSchedules();
}
setTimeout(() => {
  runScheduleSync().catch(err => console.error('[ScheduleSync] Error:', err.message));
}, 45 * 1000);
setInterval(() => {
  runScheduleSync().catch(err => console.error('[ScheduleSync] Error:', err.message));
}, 30 * 60 * 1000);

// ── Bunny file sync: once daily. It fingerprints source files and uploads only changes. ──
function scheduleDailyBunnySync() {
  const nextRun = nextJakartaScheduleDate(new Date(), ['03:30']);
  const delayMs = Math.max(0, nextRun.getTime() - Date.now());
  console.log(`[BunnySync] Next daily file sync in ${Math.round(delayMs / 60000)} minutes (03:30 WIB)`);
  setTimeout(async () => {
    try {
      await syncFilesToBunny();
    } catch (err) {
      console.error('[BunnySync] Daily sync error:', err.message);
    } finally {
      scheduleDailyBunnySync();
    }
  }, delayMs);
}
scheduleDailyBunnySync();

// ── Bunny cleanup: expired packages (> 6 months), once daily at 03:00 WIB ──
function scheduleBunnyCleanup() {
  const now = new Date();
  const target = new Date(now);
  target.setUTCHours(20, 0, 0, 0); // 03:00 WIB = 20:00 UTC
  if (target <= now) target.setDate(target.getDate() + 1);
  const msUntil = target - now;
  console.log(`[BunnyCleanup] Next cleanup in ${Math.round(msUntil / 60000)} minutes (03:00 WIB)`);
  setTimeout(async () => {
    try { await cleanupExpiredPackages(); } catch (e) { console.error('[BunnyCleanup] Error:', e.message); }
    setInterval(async () => {
      try { await cleanupExpiredPackages(); } catch (e) { console.error('[BunnyCleanup] Error:', e.message); }
    }, 24 * 60 * 60 * 1000);
  }, msUntil);
}
scheduleBunnyCleanup();

// ── Calendar sync: every 12 hours (shared data, doesn't change often) ──
async function runCalendarSync() {
  try {
    await syncCalendar(supabase);
    // Generate AI insight after first sync (if cache is empty or stale format)
    if (isInsightStale(insightCache)) {
      try { await generateCalendarInsight(); } catch (e) { console.error('[AI Insight] Post-sync error:', e.message); }
    }
  } catch (err) {
    console.error('[Calendar] Sync error:', err.message);
  }
}

// Initial calendar sync 60s after startup, then every 12 hours
setTimeout(runCalendarSync, 60 * 1000);
setInterval(runCalendarSync, 12 * 60 * 60 * 1000);

// ── Itinerary background sync: 2 min after startup, then every 12 hours ──
setTimeout(() => {
  syncAllItineraries().catch(err => console.error('[ItinerarySync] Error:', err.message));
}, 2 * 60 * 1000);
setInterval(() => {
  syncAllItineraries().catch(err => console.error('[ItinerarySync] Error:', err.message));
}, 12 * 60 * 60 * 1000);

// ── AI Insight: generate daily at 01:00 WIB + on startup if stale ──
function scheduleInsightCron() {
  const now = new Date();
  // Next 01:00 WIB (UTC+7 → 18:00 UTC day before)
  const target = new Date(now);
  target.setUTCHours(18, 0, 0, 0); // 01:00 WIB = 18:00 UTC
  if (target <= now) target.setDate(target.getDate() + 1);
  const msUntil = target - now;
  console.log(`[AI Insight] Next cron in ${Math.round(msUntil / 60000)} minutes (01:00 WIB)`);
  setTimeout(async () => {
    try { await generateCalendarInsight(); } catch (e) { console.error('[AI Insight] Cron error:', e.message); }
    // Then repeat every 24 hours
    setInterval(async () => {
      try { await generateCalendarInsight(); } catch (e) { console.error('[AI Insight] Cron error:', e.message); }
    }, 24 * 60 * 60 * 1000);
  }, msUntil);
}
scheduleInsightCron();

// ── AI Insight: warm up cache from Supabase on startup, regenerate if stale ──
setTimeout(async () => {
  try {
    // Warm up cache from Supabase first
    if (!insightCache) {
      const { data: row } = await supabase
        .from('calendar_insights')
        .select('data')
        .eq('id', 'latest')
        .single();
      if (row?.data) insightCache = row.data;
    }
    // Regenerate if stale (not generated today WIB)
    if (isInsightStale(insightCache)) {
      console.log('[AI Insight] Startup: insight is stale, regenerating...');
      await generateCalendarInsight();
    } else {
      console.log('[AI Insight] Startup: insight is fresh, skipping generation');
    }
  } catch (e) {
    console.error('[AI Insight] Startup check error:', e.message);
  }
}, 90 * 1000); // 90s after startup (after calendar sync has a chance to run)

// ── Haji Plus sync: daily at 05:00 WIB + on startup ──
setTimeout(() => syncHajiPlusData(), 10 * 1000); // 10s after startup

function scheduleHajiPlusCron() {
  const now = new Date();
  // Next 05:00 WIB (UTC+7 → 22:00 UTC day before)
  const target = new Date(now);
  target.setUTCHours(22, 0, 0, 0);
  if (target <= now) target.setDate(target.getDate() + 1);
  const msUntil = target - now;
  console.log(`[HajiPlus] Next cron in ${Math.round(msUntil / 60000)} minutes (05:00 WIB)`);
  setTimeout(async () => {
    try { await syncHajiPlusData(); } catch (e) { console.error('[HajiPlus] Cron error:', e.message); }
    // Then repeat every 24 hours
    setInterval(async () => {
      try { await syncHajiPlusData(); } catch (e) { console.error('[HajiPlus] Cron error:', e.message); }
    }, 24 * 60 * 60 * 1000);
  }, msUntil);
}
scheduleHajiPlusCron();

// ── Flight Status cron: poll every 1 hour ──
setInterval(async () => {
  try {
    await pollActiveFlights();
  } catch (err) {
    console.error('[FlightCron] Error:', err.message);
  }
}, 1 * 60 * 60 * 1000);

// Load persisted AirLabs quota on startup
setTimeout(async () => {
  await loadAirLabsQuota();
}, 5 * 1000);

// Initial flight poll 5 min after startup (increased from 2 min to reduce restart impact)
setTimeout(async () => {
  try {
    await pollActiveFlights();
  } catch (err) {
    console.error('[FlightCron] Initial poll error:', err.message);
  }
}, 5 * 60 * 1000);

// ── Flight cleanup cron: daily at 03:00 WIB (20:00 UTC) ──
function scheduleFlightCleanup() {
  const now = new Date();
  const target = new Date(now);
  target.setUTCHours(20, 0, 0, 0);
  if (target <= now) target.setDate(target.getDate() + 1);
  const msUntil = target - now;
  setTimeout(async () => {
    try {
      const threeDaysAgo = new Date();
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
      const cutoff = threeDaysAgo.toISOString().split('T')[0];
      const { error } = await supabase.from('flight_status').delete().lt('event_date', cutoff);
      if (!error) console.log(`[FlightCron] Cleaned up flight_status older than ${cutoff}`);
      else console.error('[FlightCron] Cleanup error:', error.message);
    } catch (err) {
      console.error('[FlightCron] Cleanup error:', err.message);
    }
    // Repeat every 24h
    setInterval(async () => {
      try {
        const threeDaysAgo = new Date();
        threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
        const cutoff = threeDaysAgo.toISOString().split('T')[0];
        await supabase.from('flight_status').delete().lt('event_date', cutoff);
      } catch (err) {
        console.error('[FlightCron] Cleanup error:', err.message);
      }
    }, 24 * 60 * 60 * 1000);
  }, msUntil);
}
scheduleFlightCleanup();
