import type { ReactNode } from 'react';
import { cn } from './cn';

export type TileTint = 'brand' | 'gold' | 'neutral';
export type TileSize = 'sm' | 'md' | 'lg';

const TINTS: Record<TileTint, string> = {
  brand: 'bg-gradient-burgundy text-white shadow-accent',
  gold: 'bg-gradient-gold text-burgundy-950 shadow-[0_4px_14px_rgba(212,175,55,0.3)]',
  neutral: 'bg-burgundy-700/8 text-burgundy-700',
};

const SIZES: Record<TileSize, string> = {
  sm: 'h-9 w-9 rounded-lg',
  md: 'h-11 w-11 rounded-xl',
  lg: 'h-14 w-14 rounded-2xl',
};

/**
 * Bordered geometric icon container — menu icons, header/back-bar icon pills,
 * avatar fallbacks. `brand` = burgundy gradient (default), `gold` = the single
 * reserved premium treatment, `neutral` = soft burgundy tint.
 */
export default function IconTile({
  tint = 'brand',
  size = 'md',
  className,
  children,
}: {
  tint?: TileTint;
  size?: TileSize;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span className={cn('inline-flex flex-none items-center justify-center', SIZES[size], TINTS[tint], className)}>
      {children}
    </span>
  );
}
