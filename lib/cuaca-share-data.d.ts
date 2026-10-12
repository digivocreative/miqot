export type CuacaIconKey =
  | 'sun' | 'cloud-sun' | 'cloud' | 'cloud-fog' | 'cloud-drizzle'
  | 'cloud-rain' | 'snowflake' | 'cloud-lightning' | 'thermometer';

export interface CuacaShareForecastInput {
  day: string;
  icon: string;
  weatherCode?: number | null;
  tempMin: number;
  tempMax: number;
}

export interface CuacaShareCity {
  key: string;
  name: string;
  country: string;
  flag?: string;
  temp: number;
  feelsLike: number;
  humidity: number;
  windSpeed: number;
  uvIndex: number;
  uvLabel: string;
  label: string;
  icon: string;
  weatherCode?: number | null;
  tempMin: number;
  tempMax: number;
  forecast: CuacaShareForecastInput[];
}

export interface CuacaShareProps {
  cityKey: string;
  cityName: string;
  country: string;
  subtitle: string;
  photo: string | null;
  temp: number;
  tempFontSize: number;
  conditionLabel: string;
  conditionFontSize: number;
  conditionIcon: CuacaIconKey;
  feelsLike: number;
  tempMin: number;
  tempMax: number;
  humidity: number;
  windSpeed: number;
  uvIndex: number;
  uvLabel: string;
  forecast: { day: string; icon: CuacaIconKey; tempMin: number; tempMax: number }[];
  seasonalNote: string;
  dateKey: string;
  dateLabel: string;
  agent: { name: string; initials: string; nameFontSize: number; siteLabel: string };
}

export const CUACA_SHARE_W: number;
export const CUACA_SHARE_H: number;
export function weatherIconKey(input?: { weatherCode?: number | null; icon?: string | null }): CuacaIconKey;
export function uvLabelFull(label: string | null | undefined): string;
export function formatTemp(n: number): string;
export function formatDeg(n: number): string;
export function cityLocalDate(syncedAt: string | null | undefined, tz: string | undefined, now?: number): { dateKey: string; monthIndex: number; label: string };
export function agentInitials(name: string | null | undefined): string;
export function agentNameFontSize(name: string | null | undefined): number;
export function tempFontSize(temp: number): number;
export function conditionFontSize(label: string | null | undefined): number;
export function buildCuacaShareProps(
  city: CuacaShareCity,
  agent: { name?: string | null; slug?: string | null },
  opts?: { syncedAt?: string | null; now?: number },
): CuacaShareProps;
export function buildCuacaCaption(props: CuacaShareProps, opts?: { waNumber?: string | null }): string;
export function resolveCuacaShareCity(
  cityKey: unknown,
  cities: CuacaShareCity[] | null | undefined,
): { status: 200; city: CuacaShareCity } | { status: 400 | 404; error: string };
