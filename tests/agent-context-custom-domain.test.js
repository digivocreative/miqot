import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { customDomainSlugFrom, isViaCustomDomain } from '../src/lib/agent-context.js';

const root = new URL('..', import.meta.url).pathname;
const read = rel => readFileSync(join(root, rel), 'utf8');

// BUG YANG DIPERBAIKI (terbukti di produksi 2026-09-20): klien menyimpulkan
// "halaman ini disajikan lewat custom domain" dari ADA/TIDAKNYA field
// `customDomain` di __AGENT_CONTEXT__. Padahal server mengisi field itu dengan
// domain milik agent walau request-nya datang lewat alhijaz.co — jadi di
// alhijaz.co pun ia truthy, dan routing membaca segments[0] (slug agent)
// sebagai slug filter. Akibatnya /nikita/landing-madinah mendarat tanpa filter.
//
// Tidak pernah ketahuan karena service worker menyajikan shell precache yang
// TIDAK memuat __AGENT_CONTEXT__ sama sekali; hanya kunjungan PERTAMA yang
// melewati jalur rusak ini — persis audiens link yang di-share ke WhatsApp.

test('viaCustomDomain: hanya flag eksplisit dari server yang dipercaya', () => {
  assert.equal(isViaCustomDomain({ slug: 'nikita', viaCustomDomain: true }), true);
  assert.equal(isViaCustomDomain({ slug: 'nikita', viaCustomDomain: false }), false);
});

test('customDomain terisi TAPI request lewat alhijaz.co → bukan custom domain', () => {
  // Bentuk payload yang persis menyebabkan bug: agent punya domain aktif, jadi
  // server tetap mengisi `customDomain`, tapi `viaCustomDomain` false.
  const ctx = {
    slug: 'nikita',
    customDomain: 'umrohnikita.com',
    hasCustomDomain: true,
    viaCustomDomain: false,
  };
  assert.equal(isViaCustomDomain(ctx), false, 'field customDomain TIDAK boleh jadi dasar kesimpulan');
  assert.equal(customDomainSlugFrom(ctx), null, 'slug agent tidak boleh dianggap tersirat dari host');
});

test('benar-benar lewat custom domain → slug agent memang tersirat dari host', () => {
  const ctx = { slug: 'nikita', customDomain: 'umrohnikita.com', viaCustomDomain: true };
  assert.equal(customDomainSlugFrom(ctx), 'nikita');
});

test('konteks tak ada (shell precache SW) → jatuh ke routing berbasis path', () => {
  for (const ctx of [undefined, null, {}]) {
    assert.equal(isViaCustomDomain(ctx), false);
    assert.equal(customDomainSlugFrom(ctx), null);
  }
});

test('server mengirim viaCustomDomain di KEDUA titik suntikan', () => {
  // Ada dua: buildAgentContextPayload (itinerary/bio/dll) dan objek inline di
  // SPA fallback. Kalau salah satu lupa, halaman yang dilayaninya kembali
  // menebak-nebak dan bug-nya hidup lagi di sana saja — sulit terlihat.
  const server = read('server.js');
  const builder = server.match(/function buildAgentContextPayload[\s\S]*?\n\}/)?.[0] ?? '';
  assert.notEqual(builder, '', 'buildAgentContextPayload tidak ditemukan');
  assert.match(builder, /viaCustomDomain: !!servedCustomDomain/);

  const inline = server.match(/const agentContext = JSON\.stringify\(\{[\s\S]*?\}\);/)?.[0] ?? '';
  assert.notEqual(inline, '', 'objek agentContext inline di SPA fallback tidak ditemukan');
  assert.match(inline, /viaCustomDomain: !!req\.customDomain/);
});

test('tidak ada lagi klien yang menyimpulkan custom domain dari field customDomain', () => {
  // Pola `!!ctx?.customDomain` / `!!serverAgentContext?.customDomain` itu
  // kesimpulan yang salah — inilah bug aslinya. Pakai helper bersama.
  for (const rel of ['src/App.tsx', 'src/main.tsx', 'src/components/PackageCard.tsx']) {
    const src = read(rel);
    assert.doesNotMatch(
      src,
      /!!\s*(?:serverAgentContext|ctx)\?\.customDomain/,
      `${rel} masih menyimpulkan custom domain dari field customDomain`,
    );
  }
});
