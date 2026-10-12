// Kota widget "Cuaca Kota Tujuan". Dipakai server (fetch Open-Meteo tiap 3 jam)
// dan banner Share Cuaca (zona waktu, foto kartu, subjudul). Urutan = urutan tab.
export const WEATHER_CITIES = [
  { key: 'makkah',     name: 'Mekkah',     country: 'Arab Saudi', flag: '🇸🇦', lat: 21.3891, lon: 39.8579, tz: 'Asia/Riyadh' },
  { key: 'madinah',    name: 'Madinah',    country: 'Arab Saudi', flag: '🇸🇦', lat: 24.5247, lon: 39.5692, tz: 'Asia/Riyadh' },
  { key: 'istanbul',   name: 'Istanbul',   country: 'Türkiye',    flag: '🇹🇷', lat: 41.0082, lon: 28.9784, tz: 'Europe/Istanbul' },
  { key: 'cappadocia', name: 'Cappadocia', country: 'Türkiye',    flag: '🇹🇷', lat: 38.6431, lon: 34.8287, tz: 'Europe/Istanbul' },
  { key: 'dubai',      name: 'Dubai',      country: 'UAE',        flag: '🇦🇪', lat: 25.2048, lon: 55.2708, tz: 'Asia/Dubai' },
  { key: 'hainan',     name: 'Hainan',     country: 'China',      flag: '🇨🇳', lat: 18.2528, lon: 109.5120, tz: 'Asia/Shanghai' },
];

// Banner Share Cuaca: foto kartu di public/cuaca-share/ (null = panel pola) dan
// jenis subjudul ("kota tujuan umroh" vs "kota tujuan wisata").
export const CUACA_SHARE_CITY_META = {
  makkah:     { photo: 'makkah.jpg',     trip: 'umroh' },
  madinah:    { photo: 'madinah.jpg',    trip: 'umroh' },
  istanbul:   { photo: 'istanbul.jpg',   trip: 'wisata' },
  cappadocia: { photo: 'cappadocia.jpg', trip: 'wisata' },
  dubai:      { photo: 'dubai.jpg',      trip: 'wisata' },
  hainan:     { photo: null,             trip: 'wisata' },
};
