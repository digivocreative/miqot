import type { ReactNode } from 'react';
import { cn } from './cn';

export type TileTint = 'brand' | 'gold' | 'neutral';
export type TileSize = 'sm' | 'md' | 'lg';

const TINTS: Record<TileTint, string> = {
  brand: 'bg-gradient-burgundy text-white',
  gold: 'bg-gradient-gold text-burgundy-950',
  neutral: 'bg-burgundy-700/8 text-burgundy-700',
};

// Bayangan dipisah dari tint supaya bisa dimatikan lewat prop `flat`. `cn` di
// sini hanya menggabung string (bukan tailwind-merge), jadi menimpa dengan
// `shadow-none` dari luar tidak bisa diandalkan — urutan CSS yang menentukan.
const TINT_SHADOWS: Record<TileTint, string> = {
  brand: 'shadow-accent',
  gold: 'shadow-[0_4px_14px_rgba(212,175,55,0.3)]',
  neutral: '',
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
 *
 * `flat` melepas bayangan berwarna milik tile — dipakai saat tile duduk di dalam
 * permukaan yang sudah punya elevasi sendiri (mis. kartu menu), agar hanya ada
 * satu sumber bayangan per kartu.
 */
export default function IconTile({
  tint = 'brand',
  size = 'md',
  flat = false,
  className,
  children,
}: {
  tint?: TileTint;
  size?: TileSize;
  flat?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex flex-none items-center justify-center',
        SIZES[size],
        TINTS[tint],
        flat ? '' : TINT_SHADOWS[tint],
        className,
      )}
    >
      {children}
    </span>
  );
}
