#!/usr/bin/env node
// Audit read-only: bandingkan jamaah di DB dengan daftar LENGKAP AWAPI per agent.
//
//   node scripts/audit-jamaah-counts.mjs [--slug nila] [--json out.json]
//
// Logika pembanding sama dengan audit harian (lib/jamaah-count-audit.js, dijadwalkan
// di telegram-notifier.js). Tidak menulis apa pun.
import 'dotenv/config';
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import {
  awapiFetchHajiByKeberangkatan,
  awapiFetchUmrahByKeberangkatan,
  awapiFetchUmrahByPendaftaran,
  normalizeAwapiHajiRow,
  normalizeAwapiRow,
} from '../awapi-client.js';
import { auditAgentJamaah, auditProblemCount, formatAuditAlert } from '../lib/jamaah-count-audit.js';
import { getActiveHijriahYears, getFrozenHijriahYears, getHijriahYearFromGregorian } from '../lib/hijriah-years.js';

const args = process.argv.slice(2);
const argValue = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const onlySlug = argValue('--slug');
const jsonOut = argValue('--json');
const CONCURRENCY = 3;

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
const codeOf = (agent) => agent.awapi_code || agent.awapi_key.split('-')[0];

const auditDeps = {
  api: {
    umrohByKeberangkatan: (agent, opts) => awapiFetchUmrahByKeberangkatan(agent.awapi_key, codeOf(agent), opts),
    umrohByPendaftaran: (agent, opts) => awapiFetchUmrahByPendaftaran(agent.awapi_key, codeOf(agent), opts),
    hajiAll: (agent) => awapiFetchHajiByKeberangkatan(agent.awapi_key, codeOf(agent), { tahun: '0' }),
  },
  loadDbRows: async (table, columns, agentId) => {
    const out = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await sb.from(table).select(columns).eq('agent_id', agentId).range(from, from + 999);
      if (error) throw new Error(`${table}: ${error.message}`);
      out.push(...data);
      if (data.length < 1000) return out;
    }
  },
  normalizeUmroh: (raw, agent) => normalizeAwapiRow(raw, { agentId: agent.id }),
  normalizeHaji: (raw, agent) => normalizeAwapiHajiRow(raw, { agentId: agent.id }),
  hijriahYearOf: getHijriahYearFromGregorian,
  years: getActiveHijriahYears(),
};

const { data: agents, error } = await sb.from('agents').select('id, slug, awapi_key, awapi_code').order('slug');
if (error) throw error;
const targets = agents.filter(a => (!onlySlug || a.slug === onlySlug) && a.awapi_key);
const noKey = agents.filter(a => (!onlySlug || a.slug === onlySlug) && !a.awapi_key).map(a => a.slug);

const results = [];
let cursor = 0;
await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
  while (cursor < targets.length) {
    const agent = targets[cursor++];
    const result = await auditAgentJamaah(agent, { ...auditDeps, now: Date.now() }).catch(err => ({ slug: agent.slug, errors: [`fatal: ${err.message}`] }));
    results.push(result);
    console.error(`${auditProblemCount(result) ? '⚠' : '✓'} ${agent.slug}`);
  }
}));
results.sort((a, b) => a.slug.localeCompare(b.slug));

if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify({ generatedAt: new Date().toISOString(), noKey, results }, null, 2));

const problems = results.filter(r => auditProblemCount(r) > 0);
console.log(`\nAgent diaudit: ${results.length} | cocok penuh: ${results.length - problems.length} | selisih/error: ${problems.length} | tanpa awapi_key: ${noKey.length}`);
const alert = formatAuditAlert(results, { frozenYears: getFrozenHijriahYears(), confirmedTwice: false });
if (alert) console.log(alert.replace(/<\/?b>|<\/?code>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'));
for (const r of problems) {
  const sample = [
    ...(r.umroh?.missing || []).slice(0, 5).map(x => `umroh tak masuk DB ${x.id_umroh}/${x.jm_id} (${x.yr})`),
    ...(r.umroh?.extra || []).slice(0, 5).map(x => `umroh basi ${x.id_umroh}/${x.jm_id} (${x.yr})`),
    ...(r.umroh?.wrongYear || []).slice(0, 5).map(x => `umroh salah tahun ${x.id_umroh}/${x.jm_id} DB ${x.dbYear} → ${x.yr}`),
    ...(r.haji?.missing || []).slice(0, 5).map(x => `haji tak masuk DB ${x.id_haji}/${x.id_jamaah}`),
    ...(r.haji?.extra || []).slice(0, 5).map(x => `haji basi ${x.id_haji}/${x.id_jamaah}`),
  ];
  if (sample.length) console.log(`  ${r.slug}: ${sample.join('; ')}`);
}
