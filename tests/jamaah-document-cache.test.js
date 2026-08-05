import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { load } from 'cheerio';

import {
  buildPrintableJamaahDocumentHtml,
  buildJamaahDocumentCacheRow,
  isCacheableHtmlDocument,
  JAMAAH_DOCUMENT_TYPES,
} from '../lib/jamaah-document-cache.js';

test('isCacheableHtmlDocument only accepts HTML content types', () => {
  assert.equal(isCacheableHtmlDocument('text/html; charset=UTF-8'), true);
  assert.equal(isCacheableHtmlDocument('application/xhtml+xml'), true);
  assert.equal(isCacheableHtmlDocument('application/pdf'), false);
  assert.equal(isCacheableHtmlDocument(''), false);
});

test('buildJamaahDocumentCacheRow stores per-agent HTML snapshot metadata', () => {
  const row = buildJamaahDocumentCacheRow({
    agentId: 'agent-123',
    idJamaah: 'JM999999990000063554',
    documentType: JAMAAH_DOCUMENT_TYPES.UMROH_PERNYATAAN,
    sourceUrl: 'http://115.124.86.220/dok/pernyataan/SM01078-token',
    contentType: 'text/html; charset=UTF-8',
    buffer: Buffer.from('<html><body>Surat Pernyataan</body></html>'),
    now: '2026-05-23T07:00:00.000Z',
  });

  assert.equal(row.agent_id, 'agent-123');
  assert.equal(row.jm_id, 'JM999999990000063554');
  assert.equal(row.document_type, 'umroh_pernyataan');
  assert.equal(row.source_url, 'http://115.124.86.220/dok/pernyataan/SM01078-token');
  assert.equal(row.content_type, 'text/html; charset=UTF-8');
  assert.equal(row.content_html, '<html><body>Surat Pernyataan</body></html>');
  assert.equal(row.html_sha256, '451c6bb11416fd30eb38d49101392727c05ac71081651ed50562aff6c67a8ad6');
  assert.equal(row.fetched_at, '2026-05-23T07:00:00.000Z');
  assert.equal(row.updated_at, '2026-05-23T07:00:00.000Z');
});

test('buildJamaahDocumentCacheRow skips non-HTML and empty documents', () => {
  assert.equal(buildJamaahDocumentCacheRow({
    agentId: 'agent-123',
    idJamaah: 'JM999999990000063554',
    documentType: JAMAAH_DOCUMENT_TYPES.UMROH_PERNYATAAN,
    sourceUrl: 'http://115.124.86.220/dok/pernyataan/SM01078-token',
    contentType: 'application/pdf',
    buffer: Buffer.from('%PDF'),
  }), null);

  assert.equal(buildJamaahDocumentCacheRow({
    agentId: 'agent-123',
    idJamaah: 'JM999999990000063554',
    documentType: JAMAAH_DOCUMENT_TYPES.UMROH_PERNYATAAN,
    sourceUrl: 'http://115.124.86.220/dok/pernyataan/SM01078-token',
    contentType: 'text/html',
    buffer: Buffer.from('   '),
  }), null);
});

test('buildPrintableJamaahDocumentHtml wraps source body in an A4 print shell', () => {
  const html = buildPrintableJamaahDocumentHtml(`
    <html>
      <head><style>.source-title{font-weight:700}</style><script>window.bad = true</script></head>
      <body><h1 class="source-title">FORMULIR PENDAFTARAN UMROH</h1></body>
    </html>
  `, {
    title: 'Surat Pernyataan',
  });

  assert.match(html, /@page\s*\{\s*size:\s*A4/);
  assert.match(html, /class="print-shell"/);
  assert.match(html, /class="a4-scale-frame"/);
  assert.match(html, /class="a4-sheet"/);
  assert.match(html, /class="a4-content"/);
  assert.match(html, /--preview-scale:\s*1/);
  assert.match(html, /--a4-page-width:\s*794px/);
  assert.match(html, /width:\s*var\(--a4-page-width\)/);
  assert.match(html, /function updatePreviewScale\(\)/);
  assert.match(html, /@media print\s*\{[\s\S]*:root\s*\{[\s\S]*background:\s*#fff/);
  assert.match(html, /@media print\s*\{[\s\S]*\.print-shell\s*\{[\s\S]*background:\s*#fff/);
  assert.match(html, /FORMULIR PENDAFTARAN UMROH/);
  assert.match(html, /\.source-title\{font-weight:700\}/);
  assert.doesNotMatch(html, /width:\s*min\(210mm,\s*calc\(100vw - 24px\)\)/);
  assert.doesNotMatch(html, /\.a4-content,\s*\.a4-content \*\s*\{[\s\S]*max-width:\s*100%/);
  assert.doesNotMatch(html, /\.a4-content table\s*\{[\s\S]*width:\s*100%/);
  assert.doesNotMatch(html, /@media screen and \(max-width: 840px\)/);
  assert.doesNotMatch(html, /window\.bad/);
});

test('buildPrintableJamaahDocumentHtml puts the Jadwal header logo above the page-two agreement', () => {
  const html = buildPrintableJamaahDocumentHtml(`
    <html>
      <head>
        <style>
          @media print { .page-break { display: block; page-break-before: always; } }
        </style>
      </head>
      <body>
        <table><tbody><tr><td><img src="/assets/logoTandaTerima.png" width="100px"></td></tr></tbody></table>
        <p>FORMULIR PENDAFTARAN UMROH</p>
        <div class="page-break"></div>
        <table width="100%"><tbody><tr><td style="text-align:center"><img src="/assets/logoTandaTerima.png" width="100px"></td></tr></tbody></table>
        <table width="100%"><tbody><tr><td>PERJANJIAN ANTARA JAMAAH UMRAH DENGAN PPIU PT ALHIJAZ INDOWISATA</td></tr></tbody></table>
      </body>
    </html>
  `);

  const $ = load(html);
  const pageBreak = $('.page-break').first();
  const pageTwoLogo = pageBreak.nextAll().find('img.alhijaz-pernyataan-agreement-logo').first();
  const expectedLogoBase64 = readFileSync(
    new URL('../public/new-logo-alhijaz-colored.png', import.meta.url),
  ).toString('base64');

  assert.equal(pageTwoLogo.length, 1);
  assert.equal(pageTwoLogo.attr('src'), `data:image/png;base64,${expectedLogoBase64}`);
  assert.equal(pageTwoLogo.attr('alt'), 'Alhijaz Indowisata');
  assert.equal(pageTwoLogo.attr('width'), '170');
  assert.match(pageTwoLogo.closest('table').attr('class') || '', /alhijaz-pernyataan-agreement-logo-block/);
  assert.equal($('img[src="/assets/logoTandaTerima.png"]').length, 1, 'the page-one logo must be left unchanged');
  assert.match(
    $('style').text(),
    /@media print\s*\{[\s\S]*\.a4-content \.alhijaz-pernyataan-agreement-logo\s*\{[\s\S]*margin-top:\s*15mm/,
    'the page-two logo should keep a print-safe distance from the top edge',
  );

  const logoBlockIndex = pageTwoLogo.closest('table').index();
  const agreementBlockIndex = $('td').filter((_, cell) => $(cell).text().includes('PERJANJIAN ANTARA JAMAAH')).closest('table').index();
  assert.ok(logoBlockIndex < agreementBlockIndex, 'the logo block should stay above the agreement heading');
});

test('buildPrintableJamaahDocumentHtml uses a white page background in print media', async () => {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });

  try {
    const page = await browser.newPage({ viewport: { width: 794, height: 1123 } });
    await page.emulateMedia({ media: 'print' });
    await page.setContent(buildPrintableJamaahDocumentHtml(`
      <html>
        <body><div style="height: 200px;">Short last PDF page content</div></body>
      </html>
    `), { waitUntil: 'load', timeout: 15000 });

    const colors = await page.evaluate(() => ({
      rootBackground: getComputedStyle(document.documentElement).backgroundColor,
      bodyBackground: getComputedStyle(document.body).backgroundColor,
      shellBackground: getComputedStyle(document.querySelector('.print-shell')).backgroundColor,
    }));

    assert.equal(colors.rootBackground, 'rgb(255, 255, 255)');
    assert.equal(colors.bodyBackground, 'rgb(255, 255, 255)');
    assert.equal(colors.shellBackground, 'rgb(255, 255, 255)');
  } finally {
    await browser.close();
  }
});

test('buildPrintableJamaahDocumentHtml scales wide previews to fit the viewport width', async () => {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });

  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
    await page.setContent(buildPrintableJamaahDocumentHtml(`
      <html>
        <body>
          <h1>FORMULIR PENDAFTARAN UMROH</h1>
          <div style="width: 1000px; height: 120px;">Wide source document row</div>
        </body>
      </html>
    `), { waitUntil: 'load', timeout: 15000 });

    await page.waitForFunction(() => {
      const frame = document.querySelector('.a4-scale-frame');
      const scale = Number(getComputedStyle(document.documentElement).getPropertyValue('--preview-scale'));
      return frame && Number.isFinite(scale) && scale < 1;
    }, undefined, { timeout: 5000 });

    const metrics = await page.evaluate(() => {
      const shell = document.querySelector('.print-shell');
      const frame = document.querySelector('.a4-scale-frame');
      const sheet = document.querySelector('.a4-sheet');
      const shellRect = shell.getBoundingClientRect();
      const frameRect = frame.getBoundingClientRect();
      return {
        scale: Number(getComputedStyle(document.documentElement).getPropertyValue('--preview-scale')),
        sourceWidth: sheet.scrollWidth,
        shellClientWidth: shell.clientWidth,
        shellScrollWidth: shell.scrollWidth,
        frameWidth: frameRect.width,
        frameRight: frameRect.right,
        shellRight: shellRect.right,
      };
    });

    assert.ok(metrics.sourceWidth > 794, 'source overflow should be measured before scaling');
    assert.ok(metrics.scale > 0 && metrics.scale < 1, 'preview should be scaled down');
    assert.ok(metrics.frameWidth < metrics.sourceWidth, 'visual frame should be narrower than the source document');
    assert.ok(metrics.frameRight <= metrics.shellRight + 1, 'scaled document should fit inside the viewport');
    assert.ok(metrics.shellScrollWidth <= metrics.shellClientWidth + 1, 'preview should not require horizontal scrolling');
  } finally {
    await browser.close();
  }
});
