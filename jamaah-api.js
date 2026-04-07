/**
 * Jamaah API — Hybrid scraping (Playwright login + axios data fetch)
 *
 * POST /api/jamaah/connect  → login via Playwright, return sessionId
 * POST /api/jamaah/fetch    → fetch data using stored cookies
 * POST /api/jamaah/disconnect → clear session
 */

import { chromium } from 'playwright';
import axios from 'axios';
import * as cheerio from 'cheerio';

const BASE_URL = (process.env.INTERNAL_API_BASE || 'http://115.124.86.220') + '/aiw/staff';

// ── In-memory session store with TTL (1 hour) ──
const sessions = new Map();
const SESSION_TTL = 60 * 60 * 1000; // 1 hour

function generateSessionId() {
  return `jm_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function cleanExpired() {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (now - session.createdAt > SESSION_TTL) {
      sessions.delete(id);
    }
  }
}

// Run cleanup every 10 minutes
setInterval(cleanExpired, 10 * 60 * 1000);

// ── Connect: Login via Playwright, extract cookies ──
export async function connectJamaah(username, password) {
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    // Navigate to login page
    await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Fill login form
    // Select kantor cabang = 2
    await page.selectOption('select[name="cabang"]', '2').catch(() => {
      // Try filling as input if not a select
      return page.fill('input[name="cabang"]', '2');
    });

    // Fill username & password
    await page.fill('input[name="username"]', username);
    await page.fill('input[name="password"]', password);

    // Submit
    await page.click('button[type="submit"]');

    // Wait for navigation after login
    await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {
      // Some sites don't trigger full navigation
    });

    // Small delay to ensure cookies are set
    await page.waitForTimeout(2000);

    // Check if login was successful by checking URL or page content
    const currentUrl = page.url();
    const bodyText = await page.textContent('body').catch(() => '');

    // If still on login page, credentials are wrong
    if (currentUrl.includes('/staff/') && (bodyText.includes('Sign in') || bodyText.includes('sign in'))) {
      // Check more carefully - maybe the page shows error
      const hasError = bodyText.includes('salah') || bodyText.includes('invalid') || bodyText.includes('gagal') || bodyText.includes('wrong');
      if (hasError || bodyText.includes('Sign in to start your session')) {
        await browser.close();
        return { success: false, error: 'Username atau password salah' };
      }
    }

    // Extract cookies
    const cookies = await context.cookies();
    await browser.close();

    if (!cookies || cookies.length === 0) {
      return { success: false, error: 'Login berhasil tapi tidak mendapatkan cookies' };
    }

    // Store session
    const sessionId = generateSessionId();
    sessions.set(sessionId, {
      cookies,
      createdAt: Date.now(),
      lastUrl: currentUrl,
      username,
    });

    return {
      success: true,
      sessionId,
      message: 'Berhasil terhubung ke sistem Jamaah',
    };

  } catch (err) {
    if (browser) await browser.close().catch(() => {});

    if (err.message?.includes('Timeout')) {
      return { success: false, error: 'Sistem internal tidak merespons (timeout)' };
    }
    console.error('Jamaah connect error:', err.message);
    return { success: false, error: 'Gagal menghubungi sistem internal' };
  }
}

// ── Fetch: Use stored cookies with axios ──
export async function fetchJamaah(sessionId, path = '/') {
  const session = sessions.get(sessionId);
  if (!session) {
    return { success: false, error: 'Session tidak ditemukan atau sudah kedaluwarsa' };
  }

  // Check TTL
  if (Date.now() - session.createdAt > SESSION_TTL) {
    sessions.delete(sessionId);
    return { success: false, error: 'Session sudah kedaluwarsa, silakan login ulang' };
  }

  // Build cookie header string
  const cookieHeader = session.cookies
    .map(c => `${c.name}=${c.value}`)
    .join('; ');

  try {
    const url = `${BASE_URL}${path}`;
    const response = await axios.get(url, {
      headers: {
        Cookie: cookieHeader,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
      },
      timeout: 15000,
      maxRedirects: 5,
    });

    const contentType = response.headers['content-type'] || '';

    // If JSON response
    if (contentType.includes('application/json')) {
      return { success: true, data: response.data, type: 'json' };
    }

    // If HTML response, parse with cheerio
    const $ = cheerio.load(response.data);

    // If redirected back to login, session expired
    if ($('body').text().includes('Sign in to start your session')) {
      sessions.delete(sessionId);
      return { success: false, error: 'Session sudah kedaluwarsa, silakan login ulang' };
    }

    // Extract page title
    const title = $('title').text().trim();

    // Extract tables if any
    const tables = [];
    $('table').each((i, table) => {
      const headers = [];
      $(table).find('thead th, thead td').each((_, th) => {
        headers.push($(th).text().trim());
      });

      const rows = [];
      $(table).find('tbody tr').each((_, tr) => {
        const row = {};
        $(tr).find('td').each((j, td) => {
          const key = headers[j] || `col_${j}`;
          row[key] = $(td).text().trim();
        });
        if (Object.keys(row).length > 0) rows.push(row);
      });

      if (rows.length > 0) {
        tables.push({ headers, rows });
      }
    });

    // Extract links/navigation items
    const links = [];
    $('a[href]').each((_, el) => {
      const href = $(el).attr('href');
      const text = $(el).text().trim();
      if (href && text && !href.startsWith('#') && !href.startsWith('javascript:')) {
        links.push({ href, text });
      }
    });

    return {
      success: true,
      type: 'html',
      title,
      tables,
      links: links.slice(0, 50), // Limit links
      currentUrl: `${BASE_URL}${path}`,
    };

  } catch (err) {
    if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) {
      return { success: false, error: 'Sistem internal tidak merespons (timeout)' };
    }
    console.error('Jamaah fetch error:', err.message);
    return { success: false, error: 'Gagal mengambil data' };
  }
}

// ── Disconnect: Clear session ──
export function disconnectJamaah(sessionId) {
  const existed = sessions.delete(sessionId);
  return { success: true, message: existed ? 'Berhasil disconnect' : 'Session tidak ditemukan' };
}

// ── Get session info ──
export function getSessionInfo(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) return null;

  if (Date.now() - session.createdAt > SESSION_TTL) {
    sessions.delete(sessionId);
    return null;
  }

  return {
    username: session.username,
    createdAt: session.createdAt,
    expiresAt: session.createdAt + SESSION_TTL,
    remainingMs: SESSION_TTL - (Date.now() - session.createdAt),
  };
}
