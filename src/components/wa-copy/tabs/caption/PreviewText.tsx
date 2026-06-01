import { parse } from '../../lib/placeholders';
import type { PlaceholderContext } from '../../lib/types';

interface PreviewTextProps {
  template: string;
  ctx: PlaceholderContext;
  className?: string;
}

/**
 * Renders a template with highlighted placeholders:
 * - agent tokens -> emerald chip
 * - package tokens -> amber chip
 * - unresolved tokens -> dashed amber chip (signals "pilih paket")
 * Newlines in plain segments are preserved via whitespace-pre-wrap.
 */
export default function PreviewText({ template, ctx, className = '' }: PreviewTextProps) {
  const segments = parse(template, ctx);
  return (
    <p className={`text-sm leading-6 text-gray-700 dark:text-slate-300 whitespace-pre-wrap break-words ${className}`}>
      {segments.map((seg, i) => {
        if (seg.kind === 'agent') {
          return (
            <span
              key={i}
              className="rounded-md bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 px-1 py-0.5 font-medium"
            >
              {seg.text}
            </span>
          );
        }
        if (seg.kind === 'package') {
          return (
            <span
              key={i}
              className="rounded-md bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 px-1 py-0.5 font-medium"
            >
              {seg.text}
            </span>
          );
        }
        if (seg.kind === 'unfilled') {
          return (
            <span
              key={i}
              className="rounded-md border border-dashed border-amber-300 dark:border-amber-700/50 bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 px-1 font-medium"
            >
              {seg.text}
            </span>
          );
        }
        return <span key={i}>{seg.text}</span>;
      })}
    </p>
  );
}
