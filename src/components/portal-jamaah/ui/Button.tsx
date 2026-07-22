import type { ButtonHTMLAttributes, AnchorHTMLAttributes, ReactNode } from 'react';
import { cn } from './cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'wa';
export type ButtonSize = 'sm' | 'md' | 'lg';

const VARIANTS: Record<ButtonVariant, string> = {
  // Signature burgundy gradient + faint gold hairline.
  primary:
    'bg-gradient-burgundy text-white shadow-accent ring-1 ring-inset ring-gold/30 hover:-translate-y-0.5 hover:shadow-accent-lg hover:brightness-110',
  secondary:
    'border border-burgundy-700/30 bg-white text-burgundy-800 shadow-soft hover:border-burgundy-700/50 hover:bg-burgundy-50',
  ghost: 'text-ink/60 hover:bg-black/5 hover:text-ink',
  // WhatsApp brand green — intentionally NOT re-toned (brand recognition).
  wa: 'bg-[#25D366] text-white shadow-sm hover:brightness-105',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-9 gap-1.5 px-3.5 text-sm',
  md: 'h-12 gap-2 px-5 text-sm',
  lg: 'h-14 gap-2.5 px-7 text-base',
};

const BASE =
  'inline-flex items-center justify-center rounded-xl font-semibold transition-all duration-200 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-burgundy-700 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:pointer-events-none disabled:opacity-50';

type BaseProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  className?: string;
  children?: ReactNode;
};

type ButtonAsButton = BaseProps & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'children'> & { href?: undefined };
type ButtonAsAnchor = BaseProps & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'className' | 'children'> & { href: string };

export default function Button(props: ButtonAsButton | ButtonAsAnchor) {
  const { variant = 'primary', size = 'md', fullWidth = false, className, children, ...rest } = props;
  const cls = cn(BASE, VARIANTS[variant], SIZES[size], fullWidth && 'w-full', className);

  if ('href' in props && props.href !== undefined) {
    return (
      <a className={cls} {...(rest as AnchorHTMLAttributes<HTMLAnchorElement>)}>
        {children}
      </a>
    );
  }
  return (
    <button className={cls} {...(rest as ButtonHTMLAttributes<HTMLButtonElement>)}>
      {children}
    </button>
  );
}
