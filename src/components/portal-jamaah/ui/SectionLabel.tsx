import type { ElementType, ReactNode } from 'react';
import { cn } from './cn';

/**
 * The signature mono "eyebrow" pill that opens every section.
 * Unifies the ~4 divergent uppercase-label variants across the portal.
 * Pass `as="h2"` where it stands in for a section heading (keeps the landmark).
 */
export default function SectionLabel({
  children,
  dot = 'burgundy',
  pulse = false,
  as: Tag = 'span',
  className,
}: {
  children: ReactNode;
  dot?: 'burgundy' | 'gold' | 'none';
  pulse?: boolean;
  as?: ElementType;
  className?: string;
}) {
  return (
    <Tag
      className={cn(
        'inline-flex items-center gap-2 rounded-full border border-burgundy-700/20 bg-burgundy-700/5 px-3 py-1',
        className,
      )}
    >
      {dot !== 'none' && (
        <span
          className={cn(
            'h-1.5 w-1.5 flex-none rounded-full',
            dot === 'gold' ? 'bg-gold' : 'bg-burgundy-700',
            pulse && 'motion-safe:animate-barPulse',
          )}
        />
      )}
      <span className="font-mono text-[11px] uppercase tracking-[0.15em] text-burgundy-700">{children}</span>
    </Tag>
  );
}
