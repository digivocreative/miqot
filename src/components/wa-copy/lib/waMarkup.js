// Pure WhatsApp-markup parsing (no React) — plain JS + waMarkup.d.ts so
// node:test can exercise it directly, same pattern as kontenRoutes.js.
//
// Inline styles (must open and close on the SAME line, like WhatsApp):
//   *bold*   _italic_   ~strike~   ```mono```
// Word-boundary rules approximate WhatsApp's: an opener must not be glued to a
// preceding word char and must be followed by non-space; a closer must follow
// non-space and must not be glued to a following word char. Anything unmatched
// stays literal — copy/share always sends the raw text, parsing is render-only.
//
// Line-level prefixes: "- item" / "* item" → bullet, "1. item" → number,
// "> text" → quote.

const WORD_CHAR = /[\p{L}\p{N}]/u;

const MARKERS = [
  { token: '```', style: 'mono' },
  { token: '*', style: 'bold' },
  { token: '_', style: 'italic' },
  { token: '~', style: 'strike' },
];

const isWordChar = ch => !!ch && WORD_CHAR.test(ch);

function makeSpan(text, active) {
  return {
    text,
    bold: !!active.bold,
    italic: !!active.italic,
    strike: !!active.strike,
    mono: !!active.mono,
  };
}

// Index of the closing `token` for an opener at `start`, or -1.
function findCloser(line, start, token) {
  const innerStart = start + token.length;
  // empty inner ("**") or space right after the opener ("2 * 3") → not a marker
  if (innerStart >= line.length || line[innerStart] === ' ') return -1;
  let i = innerStart;
  while ((i = line.indexOf(token, i + 1)) !== -1) {
    if (line[i - 1] !== ' ' && !isWordChar(line[i + token.length])) return i;
  }
  return -1;
}

function parseInline(line, active) {
  const spans = [];
  let plain = '';
  let i = 0;
  while (i < line.length) {
    let consumed = false;
    if (!active.mono) { // inside ```mono``` everything is verbatim
      for (const { token, style } of MARKERS) {
        if (active[style] || !line.startsWith(token, i)) continue;
        if (isWordChar(line[i - 1])) continue; // opener glued to a word ("snake_case") → literal
        const close = findCloser(line, i, token);
        if (close === -1) continue;
        if (plain) {
          spans.push(makeSpan(plain, active));
          plain = '';
        }
        spans.push(...parseInline(line.slice(i + token.length, close), { ...active, [style]: true }));
        i = close + token.length;
        consumed = true;
        break;
      }
    }
    if (!consumed) {
      plain += line[i];
      i += 1;
    }
  }
  if (plain) spans.push(makeSpan(plain, active));
  return spans;
}

export function parseWaLine(line) {
  return parseInline(String(line ?? ''), {});
}

export function parseWaText(text) {
  return String(text ?? '')
    .split('\n')
    .map(line => {
      const bullet = /^[-*]\s+/.exec(line);
      if (bullet) return { kind: 'bullet', spans: parseInline(line.slice(bullet[0].length), {}) };
      const num = /^(\d+)[.)]\s+/.exec(line);
      if (num) return { kind: 'number', number: parseInt(num[1], 10), spans: parseInline(line.slice(num[0].length), {}) };
      const quote = /^>\s+/.exec(line);
      if (quote) return { kind: 'quote', spans: parseInline(line.slice(quote[0].length), {}) };
      return { kind: 'text', spans: parseInline(line, {}) };
    });
}
