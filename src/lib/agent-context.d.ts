export interface AgentContextPayload {
  slug?: string;
  /** Selalu dikirim server bersama konteksnya — wajib, supaya cocok dengan AgentData. */
  name: string;
  website?: string | null;
  phone?: string | null;
  photo?: string | null;
  email?: string | null;
  /** Domain milik agent — TERISI walau request datang lewat alhijaz.co. */
  customDomain?: string | null;
  hasCustomDomain?: boolean;
  /** Request INI benar-benar datang lewat custom domain. Satu-satunya yang boleh dipercaya. */
  viaCustomDomain?: boolean;
}

export function readAgentContext(): AgentContextPayload | undefined;
export function isViaCustomDomain(ctx?: AgentContextPayload | null): boolean;
export function customDomainSlugFrom(ctx?: AgentContextPayload | null): string | null;
