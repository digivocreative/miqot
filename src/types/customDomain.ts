export type CustomDomainStatus = 'pending' | 'active' | 'error' | null;

export interface CustomDomainConfig {
  domain: string | null;
  status: CustomDomainStatus;
  verified_at: string | null;
  ip_required: string | null;
  resolved_ip: string | null;
}
