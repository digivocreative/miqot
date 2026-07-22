import type { ElementType, ReactNode } from 'react';
import { cn } from './cn';

/**
 * Clips the signature gradient into text — for hero numerals and the one
 * highlighted keyword in a headline. `tone="gold"` for reverent/premium
 * emphasis on dark (inverted) panels only — gold on light fails AA as text.
 */
export default function GradientText({
  children,
  tone = 'burgundy',
  as: Tag = 'span',
  className,
}: {
  children: ReactNode;
  tone?: 'burgundy' | 'gold';
  as?: ElementType;
  className?: string;
}) {
  return (
    <Tag
      className={cn(
        'bg-clip-text text-transparent',
        tone === 'gold' ? 'bg-gradient-gold' : 'bg-gradient-burgundy',
        className,
      )}
    >
      {children}
    </Tag>
  );
}
