import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { buildPrintableJamaahDocumentHtml, sanitizeDocumentHtml } from '../lib/jamaah-document-cache.js';

test('document CSP blocks foreign scripts while the trusted print-scale script still works', async t => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
  await page.setContent(buildPrintableJamaahDocumentHtml('<h1>Formulir Audit</h1><img src="invalid:" onerror="window.stolen=true">'));
  await page.waitForFunction(() => {
    const scale = Number(document.documentElement.style.getPropertyValue('--preview-scale'));
    return scale > 0 && scale < 1;
  });
  assert.equal(await page.locator('h1').innerText(), 'Formulir Audit');
  assert.equal(await page.evaluate(() => window.stolen), undefined);
  await page.evaluate(() => {
    const script = document.createElement('script');
    script.textContent = 'window.injectedFromDocument = true';
    document.body.append(script);
  });
  assert.equal(await page.evaluate(() => window.injectedFromDocument), undefined);

  await page.setContent(sanitizeDocumentHtml('<style>.bpih{color:red}</style><table class="bpih"><tr><td>BPIH Audit</td></tr></table>'));
  await page.evaluate(() => {
    const script = document.createElement('script');
    script.textContent = 'window.injectedIntoHaji = true';
    document.body.append(script);
  });
  assert.equal(await page.evaluate(() => window.injectedIntoHaji), undefined);
  assert.equal(await page.locator('table').innerText(), 'BPIH Audit');
});
