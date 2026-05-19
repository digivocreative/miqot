import { useEffect, useState } from 'react';
import { portalApi } from '../lib/portalApi';

export interface PortalBooking {
  id_umroh: string;
  paket: string | null;
  tgl_berangkat: string | null;
  tgl_pulang: string | null;
  hari_ke_berangkat: number | null;
  jadwal: {
    jadwal_id?: string | number | null;
    jadwal_nama?: string | null;
    year_code?: string | number | null;
  } | null;
}

export interface PortalJamaah {
  id: number;
  nama: string;
  jk: string | null;
  wa: string | null;
  bayar: number;
  sisa: number;
  bayar_pct: number;
  no_paspor: string | null;
  paspor_expired: string | null;
  dokumen: Record<string, unknown>;
  perlengkapan: Record<string, { status?: string; diambil_at?: string }>;
  is_initiator: boolean;
}

export interface PortalAgentInfo {
  slug: string;
  name: string;
  phone: string | null;
  photo: string | null;
  website: string | null;
}

export interface PortalSchedule {
  manasik_tgl: string | null;
  manasik_jam: string | null;
  berangkat_jam: string | null;
  berangkat_rute: string | null;
  berangkat_kode_penerbangan: string | null;
  pulang_jam: string | null;
  pulang_rute: string | null;
  pulang_kode_penerbangan: string | null;
  maskapai: string | null;
  paket_hotel: unknown;
  itinerary: unknown;
  itinerary_url?: string | null;
}

export interface PortalMeData {
  booking: PortalBooking;
  jamaah: PortalJamaah[];
  agent: PortalAgentInfo | null;
  schedule: PortalSchedule | null;
}

let cache: PortalMeData | null = null;
let cacheTime = 0;
const CACHE_TTL = 60 * 1000;

export function clearPortalMeCache() {
  cache = null;
  cacheTime = 0;
}

export function usePortalMe() {
  const [data, setData] = useState<PortalMeData | null>(cache);
  const [loading, setLoading] = useState(!cache);
  const [error, setError] = useState<unknown>(null);

  async function fetchMe() {
    try {
      setLoading(true);
      const res = await portalApi.getMe();
      cache = res as PortalMeData;
      cacheTime = Date.now();
      setData(cache);
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!cache || Date.now() - cacheTime > CACHE_TTL) {
      fetchMe();
    }

    function onFocus() {
      if (Date.now() - cacheTime > CACHE_TTL) fetchMe();
    }

    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  return { data, loading, error, refetch: fetchMe };
}
