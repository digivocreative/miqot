import type { ReactNode } from 'react';
import { cn } from './cn';

/**
 * The deep-burgundy "inverted" hero shell with gold radial glow (and optional
 * dot texture + slow-rotating dashed ring). Used by HeroCountdown and the
 * Perjalanan / Pembayaran / Surah headers. Continuous ring motion is gated
 * behind motion-safe (respects prefers-reduced-motion).
 */
export default function InvertedPanel({
  children,
  className,
  glow = true,
  texture = false,
  ring = false,
}: {
  children: ReactNode;
  className?: string;
  glow?: boolean;
  texture?: boolean;
  ring?: boolean;
}) {
  return (
    <div className={cn('relative overflow-hidden rounded-lega bg-gradient-ink text-white shadow-card', className)}>
      {texture && (
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.06]"
          style={{ backgroundImage: 'radial-gradient(circle, #D4AF37 1px, transparent 1px)', backgroundSize: '26px 26px' }}
        />
      )}
      {glow && (
        <>
          <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-burgundy-500/40 blur-[120px]" />
          <div className="pointer-events-none absolute -bottom-16 -left-12 h-40 w-40 rounded-full bg-gold/20 blur-[110px]" />
        </>
      )}
      {ring && (
        <div className="pointer-events-none absolute -bottom-12 -right-8 h-36 w-36 rounded-full border border-dashed border-gold/20 motion-safe:animate-[spin_60s_linear_infinite]" />
      )}
      <div className="relative">{children}</div>
    </div>
  );
}
