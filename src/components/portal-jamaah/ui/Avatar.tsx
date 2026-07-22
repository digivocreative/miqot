import { cn } from './cn';

export function initials(name: string): string {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const SIZES = {
  sm: 'h-8 w-8 text-[11px]',
  md: 'h-10 w-10 text-xs',
  lg: 'h-12 w-12 text-sm',
} as const;

/**
 * Local initials avatar (burgundy gradient tile). Replaces the external
 * ui-avatars.com dependency in JamaahSelector.
 */
export default function Avatar({
  name,
  size = 'md',
  className,
}: {
  name: string;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex flex-none items-center justify-center rounded-full bg-gradient-burgundy font-semibold text-white',
        SIZES[size],
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
