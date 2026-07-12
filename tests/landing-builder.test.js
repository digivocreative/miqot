import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  applyLandingBuilderToHtml,
  getLandingBuilderState,
  normalizeLandingBuilderDocument,
  validateLandingBuilderDocument,
} from '../lib/landing-builder.js';

test('builder state falls back to current landing defaults without creating a dirty draft', () => {
  const state = getLandingBuilderState('umroh', null);
  assert.equal(state.draft.hero.cta_label, 'Konsultasi via WhatsApp');
  assert.equal(state.draft.optional_program_visible, false);
  assert.deepEqual(state.draft, state.published);
  assert.equal(state.has_unpublished_changes, false);
});

test('schema v1 drafts migrate to component schema v2 without losing hero content', () => {
  const state = getLandingBuilderState('umroh', {
    schema_version: 1,
    draft: { version: 1, hero: { headline: 'Promo Lama' } },
    published: { version: 1, hero: { headline: 'Promo Lama' } },
  });
  assert.equal(state.schema_version, 2);
  assert.equal(state.draft.version, 2);
  assert.equal(state.draft.hero.headline, 'Promo Lama');
  assert.deepEqual(state.draft.component_overrides, {});
});

test('normalizer rejects unsafe image schemes and unsupported haji packages', () => {
  const normalized = normalizeLandingBuilderDocument('haji', {
    hero: { image_url: 'javascript:alert(1)' },
    featured_haji_package: 'custom',
  });
  assert.equal(normalized.hero.image_url, null);
  assert.equal(normalized.featured_haji_package, null);
});

test('image URL validation blocks protocol-relative and CSS style-breakout payloads', () => {
  for (const imageUrl of [
    '//evil.example/pixel.png',
    'https://example.com/x</style><script>globalThis.PWNED=1</script>',
  ]) {
    const result = validateLandingBuilderDocument('umroh', {
      hero: { image_url: imageUrl },
    });
    assert.equal(result.ok, false);
  }
});

test('validator enforces copy limits', () => {
  const result = validateLandingBuilderDocument('umroh', {
    hero: { headline: 'x'.repeat(141) },
  });
  assert.equal(result.ok, false);
  assert.match(result.error, /headline maksimal 140/);
});

test('umroh renderer edits only whitelisted hero fields and hides optional promo', () => {
  const input = '<html><head></head><body><section data-id="64c34f3d"><div data-id="58a04b4c"><h3>Old eyebrow</h3></div><div data-id="25901017"><h1>Old title</h1></div><div data-id="1fd42544"><h3>Old desc</h3></div><div data-id="796244f7"><a href="old"><span class="elementor-button-text">Old CTA</span></a></div></section><section data-id="defd89e">Promo</section><section class="elementor-section elementor-top-section elementor-element elementor-element-2df301db">Next</section></body></html>';
  const html = applyLandingBuilderToHtml(input, 'umroh', {
    hero: {
      eyebrow: 'Resmi',
      headline: 'Aman\nNyaman',
      description: 'Deskripsi',
      cta_label: 'Chat Sekarang',
      cta_message: 'Halo',
    },
    optional_program_visible: false,
  }, { phone: '62812', preview: true });
  assert.match(html, /<h1>Aman<br>Nyaman<\/h1>/);
  assert.match(html, /class="elementor-button-text">Chat Sekarang/);
  assert.match(html, /send\?phone=62812&amp;text=Halo/);
  assert.match(html, /elementor-element-defd89e\{display:none!important\}/);
  assert.match(html, /data-landing-builder-section="hero"/);
  assert.match(html, /alhijaz-builder-preview/);
  assert.match(html, /<h3>Old eyebrow<\/h3>/);
  assert.match(html, /<h3>Old desc<\/h3>/);
});

test('haji renderer highlights only supported featured package', () => {
  const input = '<html><head></head><body><section data-id="f55e3ca"><div data-id="1bbf918"><h1>Old</h1></div><div data-id="4626bd8"><p>Old</p></div><div data-id="74e35c9"><a href="old"><span class="elementor-button-text">Old</span></a></div><div data-id="95fb921"><img src="old.jpg"></div></section><section data-id="bac4f12"></section><section data-id="9526a6e"></section></body></html>';
  const html = applyLandingBuilderToHtml(input, 'haji', {
    hero: { headline: 'Haji Plus', description: 'Lebih tenang' },
    featured_haji_package: 'rahmah',
  }, { phone: '62812' });
  assert.match(html, /<h1>Haji Plus<\/h1>/);
  assert.match(html, /elementor-element-edbe605\{position:relative!important\}/);
  assert.match(html, /PILIHAN AGENT/);
  assert.doesNotMatch(html, /elementor-element-8e390c1\{position/);
});

test('default builder keeps the active Haji headline emphasis intact', () => {
  const input = readFileSync(new URL('../public/haji-plus.html', import.meta.url), 'utf8');
  const html = applyLandingBuilderToHtml(input, 'haji', {}, { phone: '62812', preview: true });
  assert.match(html, /<span style="color:#9a000c">Masa Tunggu Haji Plus<\/span>/);
  assert.match(html, /data-landing-builder-section="hero"/);
});

test('custom Haji hero image renders on desktop and mobile', () => {
  const input = readFileSync(new URL('../public/haji-plus.html', import.meta.url), 'utf8');
  const html = applyLandingBuilderToHtml(input, 'haji', {
    hero: { image_url: 'https://images.example/hero.webp' },
  });
  assert.match(html, /data-id="95fb921"[\s\S]{0,1500}src="https:\/\/images\.example\/hero\.webp"/);
  assert.match(html, /class="alhijaz-builder-haji-mobile-image"/);
  assert.match(html, /@media\(max-width:767px\).*alhijaz-builder-haji-mobile-image/);
});

test('featured package preserves unknown seat count and includes package identity in WhatsApp CTA', () => {
  const input = '<html><head></head><body><section data-id="64c34f3d"></section><section class="elementor-section elementor-top-section elementor-element elementor-element-2df301db">Next</section></body></html>';
  const html = applyLandingBuilderToHtml(input, 'umroh', {
    featured_package: {
      jadwal_id: 'JBU1500',
      year_code: '1448',
      name: 'Umroh Awal Musim',
      seat_remaining: null,
    },
  }, { phone: '62812' });
  assert.doesNotMatch(html, /Sisa 0 seat/);
  assert.match(html, /Paket%20yang%20saya%20minati%3A%20Umroh%20Awal%20Musim%20\(JBU1500\)/);
});

test('validator rejects an explicitly emptied required field', () => {
  const result = validateLandingBuilderDocument('haji', {
    hero: { headline: '   ' },
  });
  assert.equal(result.ok, false);
  assert.match(result.error, /headline wajib diisi/);
});

test('component override validation rejects unsafe URLs, raw CSS, and out-of-range values', () => {
  for (const componentOverrides of [
    { title: { targets: { 'heading:0': { link_url: 'javascript:alert(1)' } } } },
    { title: { targets: { 'heading:0': { base: { custom_css: 'body{}' } } } } },
    { title: { targets: { 'heading:0': { base: { font_size: 9999 } } } } },
    { title: { targets: { 'icon:0': { icon_name: '<svg onload=alert(1)>' } } } },
    { title: { hide_mobile: 'yes' } },
  ]) {
    const result = validateLandingBuilderDocument('umroh', {
      hero: { headline: 'Aman', cta_label: 'Chat', cta_message: 'Halo' },
      component_overrides: componentOverrides,
    });
    assert.equal(result.ok, false);
  }
});

test('component override normalizer keeps only allowlisted structured values', () => {
  const normalized = normalizeLandingBuilderDocument('haji', {
    component_overrides: {
      title: {
        widget_type: 'heading',
        targets: {
          'heading:0': {
            link_url: 'https://example.com/promo',
            base: { color: '#AABBCC', font_size: 42, text_align: 'center' },
          },
        },
        mobile: { margin_top: -20, padding_left: 12 },
        hide_mobile: true,
      },
    },
  });
  assert.deepEqual(normalized.component_overrides.title.targets['heading:0'].base, {
    color: '#aabbcc',
    font_size: 42,
    text_align: 'center',
  });
  assert.equal(normalized.component_overrides.title.hide_mobile, true);
});
