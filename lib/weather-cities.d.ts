export interface WeatherCity {
  key: string;
  name: string;
  country: string;
  flag: string;
  lat: number;
  lon: number;
  tz: string;
}

export const WEATHER_CITIES: WeatherCity[];
export const CUACA_SHARE_CITY_META: Record<string, { photo: string | null; trip: 'umroh' | 'wisata' }>;
