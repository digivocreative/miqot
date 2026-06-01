import { formatPrice, calculateDuration, getMinimumPrice } from '@/services';
import type { UmrohPackage } from '@/types/umroh-package';
import type {
  AgentContext,
  AgentToken,
  PackageContext,
  PackageToken,
  PlaceholderContext,
  Segment,
} from './types';

export const AGENT_TOKENS: AgentToken[] = ['nama', 'wa', 'link'];
export const PACKAGE_TOKENS: PackageToken[] = ['paket', 'harga', 'tanggal', 'maskapai', 'hari'];

const ALL_TOKENS = [...AGENT_TOKENS, ...PACKAGE_TOKENS];
const TOKEN_PATTERN = `\\{(${ALL_TOKENS.join('|')})\\}`;

/** Human-readable label per token, used in the admin "sisip placeholder" chips. */
export const TOKEN_LABELS: Record<AgentToken | PackageToken, string> = {
  nama: 'Nama agent',
  wa: 'Nomor WA',
  link: 'Link agent',
  paket: 'Nama paket',
  harga: 'Harga',
  tanggal: 'Tanggal',
  maskapai: 'Maskapai',
  hari: 'Durasi',
};

/** Neutral fallback used by resolveToPlain when a package token has no value. */
const PACKAGE_FALLBACK: Record<PackageToken, string> = {
  paket: 'paket pilihan Anda',
  harga: 'harga terbaik',
  tanggal: 'tanggal keberangkatan',
  maskapai: 'maskapai pilihan',
  hari: 'beberapa hari',
};

const TIME_ZONE = 'Asia/Jakarta';

/** 'YYYY-MM-DD' -> 'Senin, 1 Juni 2026' (Asia/Jakarta). Returns '' on invalid input. */
export function formatTanggalID(isoDate?: string | null): string {
  const raw = String(isoDate || '').trim();
  if (!raw) return '';
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T00:00:00+07:00` : raw;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: TIME_ZONE,
  }).format(date);
}

/** Build the package placeholder context from a transformed UmrohPackage. */
export function buildPackageContext(pkg: UmrohPackage): PackageContext {
  const min = getMinimumPrice(pkg);
  return {
    paket: pkg.nama || '',
    harga: min != null ? formatPrice(min) : '',
    tanggal: formatTanggalID(pkg.keberangkatan?.tgl),
    maskapai: pkg.maskapai || '',
    hari: `${calculateDuration(pkg)} hari`,
  };
}

function isAgentToken(token: string): token is AgentToken {
  return (AGENT_TOKENS as string[]).includes(token);
}

function resolveAgent(token: AgentToken, agent: AgentContext | null): string {
  if (!agent) return '';
  return agent[token] || '';
}

function resolvePackage(token: PackageToken, pkg: PackageContext | null): string {
  if (!pkg) return '';
  return pkg[token] || '';
}

/**
 * Parse a template into typed segments for highlighted preview.
 * - agent tokens with a value -> kind 'agent'
 * - package tokens with a value -> kind 'package'
 * - any token that cannot be resolved -> kind 'unfilled' (keeps the literal {token})
 */
export function parse(template: string, ctx: PlaceholderContext): Segment[] {
  const re = new RegExp(TOKEN_PATTERN, 'g');
  const segments: Segment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = re.exec(template)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ text: template.slice(lastIndex, match.index), kind: 'plain' });
    }
    const token = match[1];
    if (isAgentToken(token)) {
      const value = resolveAgent(token, ctx.agent);
      segments.push(value ? { text: value, kind: 'agent' } : { text: match[0], kind: 'unfilled' });
    } else {
      const value = resolvePackage(token as PackageToken, ctx.pkg);
      segments.push(value ? { text: value, kind: 'package' } : { text: match[0], kind: 'unfilled' });
    }
    lastIndex = re.lastIndex;
  }
  if (lastIndex < template.length) {
    segments.push({ text: template.slice(lastIndex), kind: 'plain' });
  }
  return segments;
}

/**
 * Resolve a template to final plain text for clipboard / wa.me — no highlight,
 * never leaves raw {braces}: missing package tokens fall back to a neutral hint,
 * missing agent tokens collapse to ''.
 */
export function resolveToPlain(template: string, ctx: PlaceholderContext): string {
  const re = new RegExp(TOKEN_PATTERN, 'g');
  return template.replace(re, (_full, token: string) => {
    if (isAgentToken(token)) {
      return resolveAgent(token, ctx.agent);
    }
    const pkgToken = token as PackageToken;
    const value = resolvePackage(pkgToken, ctx.pkg);
    return value || PACKAGE_FALLBACK[pkgToken];
  });
}

/** True if the template references any package token (drives the "Pakai Paket" tag). */
export function usesPackageToken(template: string): boolean {
  return PACKAGE_TOKENS.some(t => template.includes(`{${t}}`));
}
