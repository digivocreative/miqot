import type { ReactNode } from 'react';
import { cn } from './cn';

/**
 * The off-white mobile-column wrapper duplicated across 5+ portal screens.
 * Light-only warm canvas + ink text. Inner content is centered to max-w-lg by
 * the sticky headers / page bodies themselves.
 */
export default function PortalPageShell({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('min-h-screen bg-canvas text-ink', className)}>{children}</div>;
}
