import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from './cn';

/**
 * Standard white surface: generous radius, soft diffused shadow, hairline border.
 * Collapses the ~7 duplicated `rounded-2xl border-gray-100 bg-white shadow-sm`
 * recipes across the portal. Padding is left to the consumer (pass via className).
 */
export default function Card({
  className,
  children,
  ...rest
}: { className?: string; children?: ReactNode } & HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('rounded-lega border border-black/5 bg-white shadow-soft', className)} {...rest}>
      {children}
    </div>
  );
}
