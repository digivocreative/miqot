export const EVERYONE_TOKEN: string;
export const BROADCAST_DAILY_LIMIT: number;
export interface BroadcastQuota {
  unlimited: boolean;
  allowed: boolean;
  remaining: number;
}
export function hasEveryoneMention(body: string | null | undefined): boolean;
export function jakartaDayStartIso(now: Date | string | number): string;
export function resolveBroadcastQuota(input: { role?: string | null; usedToday?: number }): BroadcastQuota;
export function broadcastQuotaLabel(quota: BroadcastQuota): string;
