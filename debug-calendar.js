/**
 * Debug: Test calendar page scraping
 * Run: node /tmp/debug-calendar.js
 */
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import dotenv from 'dotenv';
dotenv.config();

const BASE = 'http://115.124.86.220/aiw/staff';
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const CAPI_ENCRYPTION_KEY = process.env.CAPI_ENCRYPTION_KEY || '';

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

async function main() {
  // 1. Get nikita's credentials
  const { data: agent } = await supabase
    .from('agents')
    .select('jamaah_username, jamaah_password, jamaah_kantor')
    .eq('slug', 'nikita')
    .single();

  console.log('Agent:', agent?.jamaah_username, 'kantor:', agent?.jamaah_kantor);

  const password = capiDecrypt(agent.jamaah_password);

  // 2. Login
  const body = new URLSearchParams({
    kantor: agent.jamaah_kantor || '2',
    username: agent.jamaah_username,
    password,
    z: '',
  });

  const loginRes = await fetch(`${BASE}/cek_login.php`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
    redirect: 'manual',
  });

  let cookies;
  if (typeof loginRes.headers.getSetCookie === 'function') {
    cookies = loginRes.headers.getSetCookie();
  } else {
    const raw = loginRes.headers.get('set-cookie');
    cookies = raw ? [raw] : [];
  }

  const cookie = cookies.map(c => c.split(';')[0]).join('; ');
  console.log('Cookie:', cookie ? 'OK' : 'FAILED');

  // 3. Fetch calendar page
  const pageRes = await fetch(`${BASE}/pages/main.php?route=home`, {
    headers: {
      Cookie: cookie,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    },
  });

  const html = await pageRes.text();
  console.log('\n=== PAGE LENGTH:', html.length, '===');

  // Check for session expiry
  if (html.includes('cek_login.php') || html.includes('Sign in to start your session')) {
    console.log('❌ Session expired / login redirect!');
    return;
  }

  // 4. Search for FullCalendar-related strings
  console.log('\n=== SEARCHING FOR FULLCALENDAR PATTERNS ===');

  const patterns = [
    'fullCalendar', 'FullCalendar', 'fullcalendar',
    'events:', 'events :', 'eventSources',
    'fc-event', 'fc-day', 'fc-view',
    'calendar', 'Calendar',
    '_modal.php',
    'Manasik', 'manasik', 'MANASIK',
    'Keberangkatan', 'keberangkatan', 'KEBERANGKATAN',
    'Kepulangan', 'kepulangan', 'KEPULANGAN',
  ];

  for (const p of patterns) {
    const count = (html.match(new RegExp(p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
    if (count > 0) console.log(`  "${p}" found ${count} times`);
  }

  // 5. Extract script tags and look for events
  console.log('\n=== SCRIPT TAGS ===');
  const scriptMatches = html.match(/<script[^>]*>([\s\S]*?)<\/script>/gi) || [];
  console.log(`Found ${scriptMatches.length} script tags`);

  for (let i = 0; i < scriptMatches.length; i++) {
    const script = scriptMatches[i];
    if (script.includes('event') || script.includes('calendar') || script.includes('modal') || script.includes('fullCalendar') || script.includes('fc-')) {
      console.log(`\n--- Script #${i} (${script.length} chars) ---`);
      // Print first 2000 chars of relevant scripts
      const content = script.replace(/<\/?script[^>]*>/gi, '').trim();
      console.log(content.substring(0, 2000));
      if (content.length > 2000) console.log('... (truncated)');
    }
  }

  // 6. Look for data-date or fc- attributes
  console.log('\n=== FC-EVENT / DATA-DATE HTML ===');
  const fcEventMatches = html.match(/class="[^"]*fc-[^"]*"[^>]*>[^<]*/g) || [];
  console.log(`Found ${fcEventMatches.length} fc-* elements`);
  for (const m of fcEventMatches.slice(0, 10)) {
    console.log('  ', m.substring(0, 150));
  }

  const dataDateMatches = html.match(/data-date="[^"]*"/g) || [];
  console.log(`\nFound ${dataDateMatches.length} data-date attributes`);
  for (const m of dataDateMatches.slice(0, 10)) {
    console.log('  ', m);
  }
}

main().catch(console.error);
