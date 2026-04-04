import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import fs from 'fs';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const CAPI_ENCRYPTION_KEY = process.env.CAPI_ENCRYPTION_KEY;

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

async function run() {
  console.log("Fetching credentials...");
  const { data: agent, error } = await supabase.from('agents').select('jamaah_username, jamaah_password').eq('slug', 'nikita').single();
  if (error || !agent) {
    console.error("Agent not found:", error); return;
  }
  const pass = capiDecrypt(agent.jamaah_password);
  
  const body = new URLSearchParams({
    kantor: '2',
    username: agent.jamaah_username,
    password: pass,
    z: '',
  });

  console.log("Logging in...");
  const res = await fetch('http://115.124.86.220/aiw/staff/cek_login.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
    redirect: 'manual',
  });
  
  let setCookie = [];
  if (typeof res.headers.getSetCookie === 'function') {
    setCookie = res.headers.getSetCookie();
  } else {
    // For older node/fetch
    const raw = res.headers.get('set-cookie');
    setCookie = raw ? [raw] : [];
  }
      
  const cookieObj = Array.isArray(setCookie) ? setCookie : [];
  const phpCookie = cookieObj.find(c => c.includes('PHPSESSID'));
  if (!phpCookie) { console.log('Login failed: cookie not found'); return; }
  const cookieStr = cookieObj.map(c => c.split(';')[0]).join('; ');
  
  console.log("Logged in! Session:", cookieStr);
  
  console.log("Fetching UMRAH GENERAL...");
  const umrahRes = await fetch('http://115.124.86.220/aiw/staff/pages/main.php?route=umrah', {
      headers: { 'Cookie': cookieStr }
  });
  const umrahHtml = await umrahRes.text();
  fs.writeFileSync('./tmp-umrah.html', umrahHtml);
  
  console.log("Fetching UMRAH DETAIL (AIW0028623)...");
  const detailRes = await fetch('http://115.124.86.220/aiw/staff/pages/main.php?route=umrah&act=edit&id=AIW0028623', {
      headers: { 'Cookie': cookieStr }
  });
  const detailHtml = await detailRes.text();
  fs.writeFileSync('./tmp-umrah-detail.html', detailHtml);
  
  console.log("Success. Files written to ./tmp-umrah*");
}

run();
