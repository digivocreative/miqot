import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url);
const rootPath = root.pathname;

test('server exposes an authenticated umroh document proxy for surat pernyataan', () => {
  const server = readFileSync(new URL('../server.js', import.meta.url), 'utf8');

  assert.match(server, /import\s+\{[\s\S]*buildJamaahDocumentCacheRow[\s\S]*buildPrintableJamaahDocumentHtml[\s\S]*JAMAAH_DOCUMENT_TYPES[\s\S]*\}\s+from\s+'\.\/lib\/jamaah-document-cache\.js'/);
  assert.match(server, /app\.get\('\/api\/laporan\/jamaah\/doc-proxy',\s*authMiddleware,\s*proxyInternalDocument\)/);
  assert.match(server, /function proxyInternalDocument/);
  assert.match(server, /async function renderJamaahDocumentPdf\(html\)/);
  assert.match(server, /async function resolveFreshUmrohPernyataanUrl/);
  assert.match(server, /awapiFetchJamaahById\(agent\.awapi_key,\s*code,\s*idJamaah\)/);
  assert.match(server, /async function agentOwnsUmrohJamaah\(agentId,\s*idJamaah\)/);
  assert.match(server, /\.from\('jamaah'\)[\s\S]*\.eq\('agent_id',\s*agentId\)[\s\S]*\.eq\('jm_id',\s*idJamaah\)/);
  assert.match(server, /async function getCachedJamaahDocument\(agentId,\s*idJamaah,\s*documentType\)/);
  assert.match(server, /async function saveCachedJamaahDocument\(/);
  assert.match(server, /async function sendJamaahDocumentHtmlOrPdf\(res,\s*rawHtml,\s*\{/);
  assert.match(server, /\.from\('jamaah_document_cache'\)[\s\S]*\.eq\('agent_id',\s*agentId\)[\s\S]*\.eq\('jm_id',\s*idJamaah\)[\s\S]*\.eq\('document_type',\s*documentType\)/);
  assert.match(server, /await agentOwnsUmrohJamaah\(req\.user\.id,\s*idJamaah\)/);
  assert.match(server, /await getCachedJamaahDocument\(req\.user\.id,\s*idJamaah,\s*JAMAAH_DOCUMENT_TYPES\.UMROH_PERNYATAAN\)/);
  assert.match(server, /return sendJamaahDocumentHtmlOrPdf\(res,\s*cached\.content_html,\s*\{[\s\S]*format[\s\S]*cacheStatus:\s*'HIT'/);
  assert.match(server, /await saveCachedJamaahDocument\(\{[\s\S]*agentId:\s*req\.user\.id[\s\S]*idJamaah:\s*cacheKey\.idJamaah[\s\S]*documentType:\s*cacheKey\.documentType/);
  assert.match(server, /const format\s*=\s*String\(formatParam \|\| ''\)\.toLowerCase\(\) === 'pdf' \? 'pdf' : 'html'/);
  assert.match(server, /res\.setHeader\('Content-Type',\s*'application\/pdf'\)/);
  assert.match(server, /res\.setHeader\('Content-Disposition',\s*`attachment; filename="\$\{filename\}"`\)/);
  assert.match(server, /res\.setHeader\('Cache-Control',\s*'no-store, max-age=0'\)/);
});

test('migration creates jamaah document cache table for surat pernyataan snapshots', () => {
  const migrationsDir = join(rootPath, 'migrations');
  assert.equal(existsSync(migrationsDir), true, 'migrations directory should exist');

  const migrationFile = readdirSync(migrationsDir)
    .find((name) => /jamaah_document_cache\.sql$/.test(name));
  assert.ok(migrationFile, 'jamaah document cache migration should exist');

  const sql = readFileSync(join(migrationsDir, migrationFile), 'utf8');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS jamaah_document_cache/i);
  assert.match(sql, /agent_id UUID NOT NULL REFERENCES agents\(id\) ON DELETE CASCADE/i);
  assert.match(sql, /jm_id TEXT NOT NULL/i);
  assert.match(sql, /document_type TEXT NOT NULL/i);
  assert.match(sql, /content_html TEXT NOT NULL/i);
  assert.match(sql, /html_sha256 TEXT NOT NULL/i);
  assert.match(sql, /UNIQUE \(agent_id, jm_id, document_type\)/i);
  assert.match(sql, /ALTER TABLE jamaah_document_cache ENABLE ROW LEVEL SECURITY/i);
  assert.match(sql, /NOTIFY\s+pgrst,\s*'reload schema'/i);
});

test('jamaah card renders surat pernyataan button above perlengkapan and opens viewer', () => {
  const page = readFileSync(new URL('../src/components/JamaahPage.tsx', import.meta.url), 'utf8');

  assert.match(page, /function getPernyataanDocumentUrl/);
  assert.match(page, /function hasPernyataanDocument/);
  assert.match(page, /function UmrohPernyataanViewer/);
  assert.match(page, /function resolveUmrohPernyataanUrl\(url: string,\s*idJamaah: string\)/);
  assert.match(page, /function resolveDocumentFormatUrl\(url: string,\s*format: 'html' \| 'pdf'\)/);
  assert.match(page, /if \(url\) params\.set\('url',\s*url\)/);
  assert.match(page, /params\.set\('idJamaah',\s*idJamaah\)/);
  assert.match(page, /item\.dokumen\?\.pernyataan/);
  assert.match(page, /hasPernyataanDocument\(item\)/);
  assert.match(page, /resolveUmrohPernyataanUrl\(pernyataanDocumentUrl,\s*item\.jm_id\)/);
  assert.match(page, /const pdfUrl = resolveDocumentFormatUrl\(url,\s*'pdf'\)/);
  assert.match(page, /fetch\(pdfUrl,\s*\{\s*headers:\s*\{\s*\.\.\.getAuthHeaders\(\)\s*\},\s*cache:\s*'no-store'\s*\}\)/);
  assert.match(page, /const \[pdfBlob,\s*setPdfBlob\] = useState<Blob \| null>\(null\)/);
  assert.match(page, /new Blob\(\[sourceBlob\],\s*\{ type:\s*'application\/pdf' \}\)/);
  assert.match(page, /const UmrohPernyataanPdfPreview = lazy\(\(\) => import\('\.\/UmrohPernyataanPdfPreview'\)\)/);
  assert.match(page, /<UmrohPernyataanPdfPreview fileUrl=\{blobUrl\} title=\{`Surat Pernyataan \$\{jamaahName\}`\} \/>/);
  assert.doesNotMatch(page, /<iframe[\s\S]*Surat Pernyataan \$\{jamaahName\}/);
  assert.doesNotMatch(page, /const res = await fetch\(url,\s*\{\s*headers:\s*\{\s*\.\.\.getAuthHeaders\(\)\s*\},\s*cache:\s*'no-store'\s*\}\)/);
  assert.match(page, /Unduh PDF/);
  assert.match(page, /Bagikan PDF/);
  assert.doesNotMatch(page, /Buka Dokumen/);
  assert.doesNotMatch(page, /background:#fff !important/);
  assert.match(page, /Surat Pernyataan/);
  assert.match(page, /Formulir & perjanjian jamaah/);
  assert.match(page, /aria-label="Buka surat pernyataan"/);
  assert.match(page, /jamaahName:/);
  assert.match(page, /<p className="text-sm font-bold[^"]*">Surat Pernyataan<\/p>/);
  assert.doesNotMatch(page, /title: `Surat Pernyataan - \$\{item\.nama\}`/);

  const buttonIndex = page.indexOf('Surat Pernyataan');
  const equipmentIndex = page.indexOf('Section 3: Perlengkapan');
  assert.ok(buttonIndex > -1, 'surat pernyataan UI should exist');
  assert.ok(equipmentIndex > -1, 'perlengkapan section should exist');
  assert.ok(buttonIndex < equipmentIndex, 'surat pernyataan button should be above perlengkapan');
});

test('surat pernyataan viewer previews the PDF directly and supports mobile sharing', () => {
  const page = readFileSync(new URL('../src/components/JamaahPage.tsx', import.meta.url), 'utf8');
  const preview = readFileSync(new URL('../src/components/UmrohPernyataanPdfPreview.tsx', import.meta.url), 'utf8');

  assert.match(page, /Share2/);
  assert.match(page, /canShareFiles,\s*downloadBlob,\s*isTouchPrimary/);
  assert.doesNotMatch(page, /function applyPernyataanZoom\(nextScale: number\)/);
  assert.doesNotMatch(page, /aria-label="Zoom (?:in|out)"/);

  assert.match(page, /const useShareLabel = isTouchPrimary\(\) && typeof navigator !== 'undefined' && typeof navigator\.share === 'function'/);
  assert.match(page, /if \(!pdfBlob\) return/);
  assert.match(page, /const file = new File\(\[blob\],\s*fileName,\s*\{ type: 'application\/pdf' \}\)/);
  assert.match(page, /if \(canShareFiles\(\[file\]\)\)/);
  assert.match(page, /await navigator\.share\(\{[\s\S]*title:\s*'Surat Pernyataan'[\s\S]*files:\s*\[file\]/);
  assert.match(page, /downloadBlob\(blob,\s*fileName\)/);
  assert.match(preview, /import \{ Document, Page, pdfjs \} from 'react-pdf'/);
  assert.match(preview, /pdfWorkerUrl from 'pdfjs-dist\/build\/pdf\.worker\.min\.mjs\?url'/);
  assert.match(preview, /Array\.from\(\{ length: numPages \}/);
  assert.match(preview, /renderTextLayer=\{false\}/);
});

test('server preserves durable surat pernyataan markers during later jamaah syncs', () => {
  const server = readFileSync(new URL('../server.js', import.meta.url), 'utf8');

  assert.match(server, /function mergeUmrohDokumen\(existingDokumen,\s*incomingDokumen\)/);
  assert.match(server, /\.select\('id_umroh, jm_id, nama, paket, bayar, sisa, tgl_berangkat, tgl_daftar, raw_data, dokumen'\)/);
  assert.match(server, /patch\.dokumen = mergedD/);
  assert.match(server, /row\.dokumen = mergeUmrohDokumen\(existingPayment\?\.dokumen,\s*row\.dokumen\)/);
  assert.match(server, /row\.dokumen = mergeUmrohDokumen\(bgExistingPayment\?\.dokumen,\s*row\.dokumen\)/);
});

test('jamaah list exposes surat pernyataan marker from cached snapshots after server restart', () => {
  const server = readFileSync(new URL('../server.js', import.meta.url), 'utf8');

  assert.match(server, /async function getCachedUmrohPernyataanJmIds\(agentId,\s*rows\)/);
  assert.match(server, /\.from\('jamaah_document_cache'\)[\s\S]*\.select\('jm_id'\)[\s\S]*\.eq\('agent_id',\s*agentId\)[\s\S]*\.eq\('document_type',\s*JAMAAH_DOCUMENT_TYPES\.UMROH_PERNYATAAN\)[\s\S]*\.in\('jm_id',\s*jmIds\)/);
  assert.match(server, /const cachedPernyataanJmIds = await getCachedUmrohPernyataanJmIds\(req\.user\.id,\s*data\)/);
  assert.match(server, /cachedPernyataanJmIds\.has\(r\.jm_id\)/);
  assert.match(server, /pernyataan:\s*true/);
});
