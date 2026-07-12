import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  applyLandingContentOverrides,
  extractLandingContentManifest,
  validateLandingOverrideCapabilities,
} from '../lib/landing-builder-content.js';

const SAMPLE_HTML = `<!doctype html><html><head></head><body class="alhijaz-builder-preview">
  <section class="elementor-top-section" data-id="section-one">
    <div class="elementor-widget-heading" data-id="title-one"><h2 class="elementor-heading-title">Judul Lama</h2></div>
    <div class="elementor-widget-button" data-id="button-one"><a><span class="elementor-button-text">Tanya Sekarang</span></a></div>
    <div class="elementor-widget-icon-list" data-id="list-one"><span class="elementor-icon-list-text">Fasilitas Satu</span></div>
    <div class="elementor-widget-image" data-id="image-one"><img src="/old.jpg" alt="Dokumentasi"></div>
  </section>
</body></html>`;

test('content manifest discovers editable text, button, list, and image from active Elementor HTML', () => {
  const manifest = extractLandingContentManifest(SAMPLE_HTML);
  assert.equal(manifest.groups.length, 1);
  assert.equal(manifest.total, 4);
  assert.deepEqual(
    manifest.groups[0].items.map((item) => item.key),
    ['title-one:heading:0', 'button-one:button:0', 'list-one:icon_list:0', 'image-one:image:0'],
  );
});

test('content overrides safely update existing elements and add preview click targets', () => {
  const html = applyLandingContentOverrides(SAMPLE_HTML, {
    'title-one:heading:0': 'Judul Baru\n<script>alert(1)</script>',
    'button-one:button:0': 'Hubungi Kami',
    'image-one:image:0': 'https://images.example/new.webp',
  }, { preview: true });

  assert.match(html, /Judul Baru<br>&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
  assert.match(html, /class="elementor-button-text"[^>]*>Hubungi Kami/);
  assert.match(html, /src="https:\/\/images\.example\/new\.webp"/);
  assert.match(html, /data-landing-builder-content-key="title-one:heading:0"/);
  assert.match(html, /data-landing-builder-content-key="image-one:image:0"/);
});

test('active Umroh and Haji templates expose all major content types to the editor', () => {
  const umroh = extractLandingContentManifest(readFileSync(new URL('../public/umroh.html', import.meta.url), 'utf8'));
  const haji = extractLandingContentManifest(readFileSync(new URL('../public/haji-plus.html', import.meta.url), 'utf8'));

  assert.ok(umroh.total > 150, `expected broad Umroh coverage, received ${umroh.total}`);
  assert.ok(haji.total > 100, `expected broad Haji coverage, received ${haji.total}`);
  for (const manifest of [umroh, haji]) {
    const kinds = new Set(manifest.groups.flatMap((group) => group.items.map((item) => item.kind)));
    assert.ok(kinds.has('text'));
    assert.ok(kinds.has('textarea'));
    assert.ok(kinds.has('image'));
  }
});

test('manifest uses canonical widget metadata and discovers icon, divider, gallery, HTML CTA, and Lottie controls', () => {
  const html = `<!doctype html><html><body><section class="elementor-top-section" data-id="campaign">
    <div data-id="icon-1" data-widget_type="icon.default" class="elementor-widget elementor-widget-icon"><span class="elementor-icon"><svg></svg></span></div>
    <div data-id="divider-1" data-widget_type="divider.default" class="elementor-widget-divider--view-line_text elementor-widget elementor-widget-divider"><div class="elementor-divider"><span class="elementor-divider__text">Legalitas</span></div></div>
    <div data-id="gallery-1" data-widget_type="gallery.default" class="elementor-widget elementor-widget-gallery"><a class="e-gallery-item" href="/old.webp"><div class="e-gallery-image" data-thumbnail="/old.webp" alt="Dokumentasi"></div></a></div>
    <div data-id="html-1" data-widget_type="html.default" class="elementor-widget elementor-widget-html"><div class="elementor-widget-container"><a href="https://example.com"><span>CTA Khusus</span></a></div></div>
    <div data-id="lottie-1" data-widget_type="lottie.default" class="elementor-widget elementor-widget-lottie"><div class="e-lottie__container"></div></div>
  </section></body></html>`;
  const manifest = extractLandingContentManifest(html);
  assert.deepEqual(manifest.groups[0].items.map((item) => item.widget_type), ['icon', 'divider', 'gallery', 'html', 'lottie']);
  assert.deepEqual(manifest.groups[0].items.map((item) => item.field), ['icon', 'divider_text', 'gallery_image', 'html_text', 'lottie']);
});

test('component overrides generate scoped responsive CSS and safe link attributes', () => {
  const html = applyLandingContentOverrides(SAMPLE_HTML, {}, {
    'title-one': {
      widget_type: 'heading',
      targets: {
        'heading:0': {
          link_url: 'https://example.com/promo',
          link_new_tab: true,
          link_nofollow: true,
          base: { color: '#9a000c', font_size: 36, text_align: 'center' },
          mobile: { font_size: 24 },
        },
      },
      base: { margin_bottom: 20, padding_top: 8 },
      hide_tablet: true,
      entrance_animation: 'fade-up',
      animation_duration: 600,
    },
  }, { preview: true });

  assert.match(html, /href="https:\/\/example\.com\/promo"/);
  assert.match(html, /target="_blank"/);
  assert.match(html, /rel="noopener noreferrer nofollow"/);
  assert.match(html, /color:#9a000c!important/);
  assert.match(html, /font-size:36px!important/);
  assert.match(html, /@media \(max-width:767px\)/);
  assert.match(html, /font-size:24px!important/);
  assert.match(html, /margin-bottom:20px!important/);
  assert.match(html, /alhijazFadeUp 600ms/);
});

test('icon components use a curated picker and never accept raw SVG', () => {
  const html = '<html><head></head><body><section class="elementor-top-section" data-id="icons"><div data-id="trust-icon" data-widget_type="icon.default"><span class="elementor-icon"><svg class="fas fa-star"><path></path></svg></span></div></section></body></html>';
  const output = applyLandingContentOverrides(html, {}, {
    'trust-icon': {
      widget_type: 'icon',
      targets: { 'icon:0': { icon_name: 'shield', base: { color: '#10b981', font_size: 32 } } },
    },
  });
  assert.match(output, /viewBox="0 0 24 24"/);
  assert.match(output, /M12 22s8-4 8-10V5/);
  assert.match(output, /color:#10b981!important/);
  assert.doesNotMatch(output, /<script|onload=/i);
});

test('protected legal targets ignore content, style, and visibility overrides', () => {
  const html = `<!doctype html><html><head></head><body><section class="elementor-top-section" data-id="26b2a887">
    <div data-id="legal-title" data-widget_type="heading.default" class="elementor-widget elementor-widget-heading"><h2 class="elementor-heading-title">Izin Resmi</h2></div>
  </section></body></html>`;
  const output = applyLandingContentOverrides(html, {
    'legal-title:heading:0': 'Klaim Palsu',
  }, {
    'legal-title': {
      widget_type: 'heading',
      targets: { 'heading:0': { base: { color: '#ff0000' } } },
      settings: { heading_tag: 'p' },
      hide_mobile: true,
    },
  });
  assert.match(output, />Izin Resmi<\/h2>/);
  assert.doesNotMatch(output, /Klaim Palsu|#ff0000|hide_mobile/);
  assert.match(output, /<h2 class="elementor-heading-title">Izin Resmi<\/h2>/);
});

test('capability validator rejects unknown, protected, and mismatched component targets', () => {
  assert.match(validateLandingOverrideCapabilities(SAMPLE_HTML, {
    content_overrides: { 'not-real:heading:0': 'X' },
  }), /tidak ditemukan/);

  const protectedHtml = `<!doctype html><html><body><section class="elementor-top-section" data-id="26b2a887"><div data-id="legal" data-widget_type="heading.default"><h2 class="elementor-heading-title">Izin</h2></div></section></body></html>`;
  assert.match(validateLandingOverrideCapabilities(protectedHtml, {
    content_overrides: { 'legal:heading:0': 'Ubah' },
  }), /legal|perusahaan/i);

  assert.match(validateLandingOverrideCapabilities(protectedHtml, {
    component_overrides: { legal: { widget_type: 'heading', settings: { heading_tag: 'p' } } },
  }), /dikunci/);

  assert.match(validateLandingOverrideCapabilities(SAMPLE_HTML, {
    component_overrides: { 'title-one': { widget_type: 'gallery', targets: {} } },
  }), /tidak cocok/);
});
