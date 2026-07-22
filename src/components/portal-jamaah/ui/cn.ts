/**
 * Tiny class-name joiner for the Portal Jamaah UI primitives.
 * Filters out falsy values and joins with spaces. No clsx/tailwind-merge dep
 * (variant space here is small and closed — see the redesign spec §7).
 */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}
