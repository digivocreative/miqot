import type { ReactNode } from 'react';
import { parseWaText } from './lib/waMarkup';
import type { WaSpan } from './lib/waMarkup';

interface WaMarkupTextProps {
  text: string;
  className?: string;
  /** Renders a span's raw text — lets PreviewText nest placeholder chips inside styled spans. */
  renderText?: (text: string, key: string) => ReactNode;
}

const spanClass = (s: WaSpan) =>
  [
    s.bold && 'font-bold',
    s.italic && 'italic',
    s.strike && 'line-through',
    s.mono && 'font-mono text-[0.85em] bg-gray-100 dark:bg-slate-700/60 rounded px-1 py-0.5',
  ]
    .filter(Boolean)
    .join(' ');

/**
 * Renders WhatsApp markup (*bold*, _italic_, ~strike~, ```mono```, "- " bullets,
 * "1. " numbers, "> " quotes) the way the recipient will see it. Render-only:
 * copy/share flows keep sending the raw marked-up text — WhatsApp does the
 * real formatting after send.
 */
export default function WaMarkupText({ text, className = '', renderText }: WaMarkupTextProps) {
  const lines = parseWaText(text);
  return (
    <div className={className}>
      {lines.map((line, li) => {
        const content =
          line.spans.length === 0
            ? ' ' // blank line keeps its height
            : line.spans.map((s, si) => (
                <span key={si} className={spanClass(s)}>
                  {renderText ? renderText(s.text, `${li}-${si}`) : s.text}
                </span>
              ));
        if (line.kind === 'bullet') {
          return (
            <div key={li} className="flex gap-2 whitespace-pre-wrap break-words">
              <span className="flex-shrink-0">•</span>
              <span className="min-w-0">{content}</span>
            </div>
          );
        }
        if (line.kind === 'number') {
          return (
            <div key={li} className="flex gap-2 whitespace-pre-wrap break-words">
              <span className="flex-shrink-0">{line.number}.</span>
              <span className="min-w-0">{content}</span>
            </div>
          );
        }
        if (line.kind === 'quote') {
          return (
            <div
              key={li}
              className="border-l-2 border-gray-300 dark:border-slate-600 pl-2.5 text-gray-500 dark:text-slate-400 whitespace-pre-wrap break-words"
            >
              {content}
            </div>
          );
        }
        return (
          <div key={li} className="whitespace-pre-wrap break-words">
            {content}
          </div>
        );
      })}
    </div>
  );
}
