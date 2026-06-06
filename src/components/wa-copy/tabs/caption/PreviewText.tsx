import { parse } from '../../lib/placeholders';
import type { PlaceholderContext } from '../../lib/types';
import WaMarkupText from '../../WaMarkupText';

interface PreviewTextProps {
  template: string;
  ctx: PlaceholderContext;
  className?: string;
}

/**
 * Renders a template the way the recipient will see it:
 * - WhatsApp markup (*bold*, _italic_, ~strike~, ```mono```, lists, quotes)
 *   is styled by WaMarkupText (markup parsed first — markers never appear
 *   inside {token}, so the order is safe)
 * - placeholder chips render inside the styled spans:
 *   agent tokens -> emerald chip, package tokens -> amber chip,
 *   unresolved tokens -> dashed amber chip (signals "pilih paket")
 */
export default function PreviewText({ template, ctx, className = '' }: PreviewTextProps) {
  return (
    <WaMarkupText
      text={template}
      className={`text-sm leading-6 text-gray-700 dark:text-slate-300 ${className}`}
      renderText={(text, key) =>
        parse(text, ctx).map((seg, i) => {
          if (seg.kind === 'agent') {
            return (
              <span
                key={`${key}-${i}`}
                className="rounded-md bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 px-1 py-0.5 font-medium"
              >
                {seg.text}
              </span>
            );
          }
          if (seg.kind === 'package') {
            return (
              <span
                key={`${key}-${i}`}
                className="rounded-md bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 px-1 py-0.5 font-medium"
              >
                {seg.text}
              </span>
            );
          }
          if (seg.kind === 'unfilled') {
            return (
              <span
                key={`${key}-${i}`}
                className="rounded-md border border-dashed border-amber-300 dark:border-amber-700/50 bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 px-1 font-medium"
              >
                {seg.text}
              </span>
            );
          }
          return <span key={`${key}-${i}`}>{seg.text}</span>;
        })
      }
    />
  );
}
