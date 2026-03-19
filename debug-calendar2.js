/**
 * Debug: Extract events array and eventClick handler
 * Run: node debug-calendar2.js
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
  const { data: agent } = await supabase
    .from('agents')
    .select('jamaah_username, jamaah_password, jamaah_kantor')
    .eq('slug', 'nikita')
    .single();

  const password = capiDecrypt(agent.jamaah_password);

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

  const pageRes = await fetch(`${BASE}/pages/main.php?route=home`, {
    headers: { Cookie: cookie, 'User-Agent': 'Mozilla/5.0' },
  });
  const html = await pageRes.text();

  // Extract the events JSON array
  const eventsMatch = html.match(/events:\s*(\[[\s\S]*?\])\s*,\s*\n/);
  if (eventsMatch) {
    console.log('=== EVENTS ARRAY (first 3000 chars) ===');
    console.log(eventsMatch[1].substring(0, 3000));
    
    try {
      const events = JSON.parse(eventsMatch[1]);
      console.log('\n=== PARSED SUCCESSFULLY ===');
      console.log('Total events:', events.length);
      console.log('\nFirst 5 events:');
      events.slice(0, 5).forEach((e, i) => console.log(`  ${i}:`, JSON.stringify(e)));
      console.log('\nSample keberangkatan:');
      const kb = events.find(e => e.title?.includes('Keberangkatan'));
      if (kb) console.log(JSON.stringify(kb, null, 2));
      console.log('\nSample kepulangan:');
      const kp = events.find(e => e.title?.includes('Kepulangan'));
      if (kp) console.log(JSON.stringify(kp, null, 2));
    } catch (e) {
      console.log('Parse error:', e.message);
    }
  } else {
    console.log('❌ No events array match found');
    // Try broader match
    const broad = html.match(/events\s*:\s*\[/);
    if (broad) {
      const startIdx = broad.index + broad[0].length - 1;
      console.log('Found "events: [" at index', broad.index);
      console.log('Raw content starting at events:', html.substring(broad.index, broad.index + 500));
    }
  }

  // Find eventClick handler
  console.log('\n=== EVENT CLICK HANDLER ===');
  const clickMatch = html.match(/eventClick\s*[:=]\s*function[\s\S]*?(?:\n\s*\}[,\n]|\n\s{4}\})/);
  if (clickMatch) {
    console.log(clickMatch[0]);
  } else {
    // Try broader pattern
    const clickIdx = html.indexOf('eventClick');
    if (clickIdx >= 0) {
      console.log('Found eventClick at index', clickIdx);
      console.log(html.substring(clickIdx, clickIdx + 800));
    } else {
      console.log('❌ No eventClick found');
      // Look for _modal.php usage
      const modalIdx = html.indexOf('_modal.php');
      if (modalIdx >= 0) {
        console.log('\n_modal.php context:');
        console.log(html.substring(Math.max(0, modalIdx - 200), modalIdx + 200));
      }
    }
  }
}

main().catch(console.error);
