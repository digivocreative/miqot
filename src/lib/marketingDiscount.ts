export const MARKETING_DISCOUNT_MIN = 10_000;
export const MARKETING_DISCOUNT_MAX = 10_000_000;

export const MARKETING_DISCOUNT_QUICK_AMOUNTS = [300_000, 500_000, 1_000_000] as const;

const onlyDigits = (value: string) => value.replace(/\D/g, '');

export function normalizeMarketingDiscountInput(value: string): string {
  const digits = onlyDigits(value).replace(/^0+(?=\d)/, '');
  if (!digits) return '';

  const amount = Number(digits);
  if (!Number.isFinite(amount)) return String(MARKETING_DISCOUNT_MAX);
  return String(Math.min(amount, MARKETING_DISCOUNT_MAX));
}

export function formatMarketingDiscountInput(value: string): string {
  const digits = onlyDigits(value);
  if (!digits) return '';
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

export function formatMarketingDiscountRupiah(amount: number): string {
  return `Rp ${formatMarketingDiscountInput(String(amount))}`;
}

export function getMarketingDiscountError(value: string): string {
  if (!value) return '';

  const amount = Number(onlyDigits(value));
  if (!Number.isFinite(amount) || amount < MARKETING_DISCOUNT_MIN) {
    return `Minimal ${formatMarketingDiscountRupiah(MARKETING_DISCOUNT_MIN)}`;
  }
  if (amount > MARKETING_DISCOUNT_MAX) {
    return `Maksimal ${formatMarketingDiscountRupiah(MARKETING_DISCOUNT_MAX)}`;
  }
  return '';
}
