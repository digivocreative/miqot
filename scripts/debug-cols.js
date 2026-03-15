// Debug: extract exact table column structure from legacy HTML
import 'dotenv/config';
import { login, fetchLaporan, disconnect } from '../laporan-api.js';
import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';
import * as cheerio from 'cheerio';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const CAPI_ENCRYPTION_KEY = process.env.CAPI_ENCRYPTION_KEY || process.env.ENCRYPTION_KEY || '';

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

async function debug() {
  const { data: agents } = await supabase.from('agents').select('slug,jamaah_username,jamaah_password,jamaah_kantor').not('jamaah_username', 'is', null);
  const agent = agents?.[0];
  if (!agent) { console.log('No agent'); return; }

  const decrypted = capiDecrypt(agent.jamaah_password);
  const loginResult = await login(agent.jamaah_username, decrypted, agent.jamaah_kantor || '2');
  if (!loginResult.success) { console.log('Login failed'); return; }

  const fetchResult = await fetchLaporan(agent.jamaah_username, {
    kantor: agent.jamaah_kantor || '2',
    agentId: agent.jamaah_username,
    tglAwal: '2025-06-26',
    tglAkhir: '2026-06-15',
  });

  if (!fetchResult.success) { console.log('Fetch failed'); return; }

  const $ = cheerio.load(fetchResult.html);

  // Get ALL header rows
  console.log('\n=== TABLE HEADERS ===');
  $('table.table thead tr').each((ri, tr) => {
    console.log(`\n--- Header Row ${ri} ---`);
    $(tr).find('> th').each((j, th) => {
      const text = $(th).text().trim().replace(/\s+/g, ' ');
      const colspan = $(th).attr('colspan') || '1';
      if (text) console.log(`  th${j}: "${text}" (colspan=${colspan})`);
    });
  });

  // First data row - all columns
  console.log('\n=== FIRST DATA ROW ===');
  const firstRow = $('table.table tbody tr').first();
  const tds = firstRow.find('> td');
  console.log(`Total columns: ${tds.length}`);
  tds.each((j, td) => {
    const text = $(td).text().trim().replace(/\s+/g, ' ');
    console.log(`  col${j}: "${text}"`);
  });

  disconnect(agent.jamaah_username);
  console.log('\nDone!');
}

debug().catch(console.error);
