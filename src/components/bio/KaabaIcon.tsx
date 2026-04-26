interface Props {
  size?: number | string;
  className?: string;
  strokeWidth?: number;
}

/**
 * Stylized Kaaba glyph — cube silhouette with the kiswah band near the top.
 * Designed as a stroke icon so it sits naturally next to other lucide-react
 * icons (same `currentColor` + strokeWidth conventions).
 */
export default function KaabaIcon({ size = 20, className, strokeWidth = 2 }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {/* Cube outline */}
      <rect x="4" y="6" width="16" height="14" rx="1" />
      {/* Kiswah (gold band) — slightly thicker visual via two close lines */}
      <line x1="4" y1="9.5" x2="20" y2="9.5" />
      <line x1="4" y1="11" x2="20" y2="11" />
      {/* Door */}
      <rect x="14" y="13" width="3" height="5" />
      {/* Base shadow / platform hint */}
      <line x1="3" y1="20" x2="21" y2="20" />
    </svg>
  );
}
