export function toTitleCase(input: string | null | undefined): string {
  if (!input) return '';
  return input
    .toLowerCase()
    .split(/(\s+)/)
    .map((segment) => {
      if (/^\s+$/.test(segment) || segment === '') return segment;
      return segment.charAt(0).toUpperCase() + segment.slice(1);
    })
    .join('');
}
