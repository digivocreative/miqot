import { createHash } from 'crypto';
import { load } from 'cheerio';

export const JAMAAH_DOCUMENT_TYPES = Object.freeze({
  UMROH_PERNYATAAN: 'umroh_pernyataan',
});

export function isCacheableHtmlDocument(contentType) {
  const type = String(contentType || '').toLowerCase();
  return type.includes('text/html') || type.includes('application/xhtml+xml');
}

export function buildJamaahDocumentCacheRow({
  agentId,
  idJamaah,
  documentType,
  sourceUrl,
  contentType,
  buffer,
  now = new Date().toISOString(),
}) {
  if (!agentId || !idJamaah || !documentType || !isCacheableHtmlDocument(contentType)) {
    return null;
  }

  const contentHtml = Buffer.isBuffer(buffer)
    ? buffer.toString('utf8')
    : String(buffer ?? '');

  if (!contentHtml.trim()) return null;

  return {
    agent_id: agentId,
    jm_id: idJamaah,
    document_type: documentType,
    source_url: sourceUrl || null,
    content_type: contentType || 'text/html; charset=utf-8',
    content_html: contentHtml,
    html_sha256: createHash('sha256').update(contentHtml).digest('hex'),
    fetched_at: now,
    updated_at: now,
  };
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function buildPrintableJamaahDocumentHtml(sourceHtml, { title = 'Surat Pernyataan' } = {}) {
  const $ = load(String(sourceHtml || ''), { decodeEntities: false });
  $('script,noscript').remove();

  const styleNodes = $('style');
  const sourceStyles = styleNodes
    .map((_, el) => $(el).html() || '')
    .get()
    .join('\n');
  styleNodes.remove();
  const bodyHtml = $('body').length ? ($('body').html() || '') : ($.root().html() || '');

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    ${sourceStyles}

    :root {
      color-scheme: light;
      background: #e5e7eb;
      --preview-scale: 1;
      --a4-page-width: 794px;
      --a4-page-height: 1123px;
    }

    html,
    body {
      margin: 0;
      min-height: 100%;
      background: #e5e7eb;
      color: #000;
      font-family: Arial, Helvetica, sans-serif;
    }

    .print-shell {
      min-height: 100vh;
      padding: 24px;
      display: flex;
      align-items: flex-start;
      justify-content: center;
      box-sizing: border-box;
      overflow: auto;
    }

    .a4-scale-frame {
      flex: 0 0 auto;
      width: var(--a4-page-width);
      min-height: var(--a4-page-height);
    }

    .a4-sheet {
      flex: 0 0 auto;
      width: var(--a4-page-width);
      min-height: var(--a4-page-height);
      background: #fff;
      color: #000;
      padding: 68px 60px;
      box-sizing: border-box;
      box-shadow: 0 16px 45px rgba(15, 23, 42, 0.18);
      transform: scale(var(--preview-scale));
      transform-origin: top left;
    }

    .a4-content {
      width: 100%;
      color: #000;
      overflow-wrap: normal;
    }

    .a4-content img {
      max-width: 100%;
      height: auto;
    }

    @page {
      size: A4;
      margin: 0;
    }

    @media print {
      :root {
        background: #fff;
        --preview-scale: 1;
      }

      html,
      body {
        width: 210mm;
        min-height: 297mm;
        background: #fff;
      }

      .print-shell {
        min-height: auto;
        padding: 0;
        display: block;
        overflow: visible;
        background: #fff;
      }

      .a4-sheet {
        width: auto;
        min-height: auto;
        padding: 18mm 16mm;
        box-shadow: none;
        transform: none;
        background: #fff;
      }

      .a4-scale-frame {
        width: auto !important;
        height: auto !important;
        min-height: auto !important;
        background: #fff;
      }
    }
  </style>
</head>
<body>
  <main class="print-shell">
    <div class="a4-scale-frame">
      <article class="a4-sheet">
        <div class="a4-content">
          ${bodyHtml}
        </div>
      </article>
    </div>
  </main>
  <script>
    (function () {
      function getPixelValue(value) {
        var number = parseFloat(value);
        return Number.isFinite(number) ? number : 0;
      }

      function updatePreviewScale() {
        if (window.matchMedia && window.matchMedia('print').matches) return;

        var root = document.documentElement;
        var shell = document.querySelector('.print-shell');
        var frame = document.querySelector('.a4-scale-frame');
        var sheet = document.querySelector('.a4-sheet');
        if (!root || !shell || !frame || !sheet) return;

        root.style.setProperty('--preview-scale', '1');
        frame.style.width = '';
        frame.style.height = '';

        var shellStyle = window.getComputedStyle(shell);
        var horizontalPadding = getPixelValue(shellStyle.paddingLeft) + getPixelValue(shellStyle.paddingRight);
        var availableWidth = Math.max(1, shell.clientWidth - horizontalPadding);
        var sourceWidth = Math.max(sheet.offsetWidth, sheet.scrollWidth);
        var sourceHeight = Math.max(sheet.offsetHeight, sheet.scrollHeight);
        var scale = Math.min(1, Math.max(0.05, availableWidth / sourceWidth));

        root.style.setProperty('--preview-scale', scale.toFixed(4));
        frame.style.width = Math.ceil(sourceWidth * scale) + 'px';
        frame.style.height = Math.ceil(sourceHeight * scale) + 'px';
      }

      window.addEventListener('resize', updatePreviewScale, { passive: true });
      window.addEventListener('load', updatePreviewScale);
      if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(updatePreviewScale).catch(function () {});
      }
      requestAnimationFrame(updatePreviewScale);
      setTimeout(updatePreviewScale, 250);
    }());
  </script>
</body>
</html>`;
}
