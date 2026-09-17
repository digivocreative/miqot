import { useCallback, useEffect, useRef, useState } from 'react';
import { portalApi } from '../lib/portalApi';
import { getPortalSession, readPortalSnapshot, savePortalSnapshot } from '../lib/portalSession';
import { maskSnapshotForStorage } from '../lib/portalSnapshotPrivacy';

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
// Kapan `cache` diterima dari server (ms). Data dari salinan tersimpan membawa waktunya sendiri.
let cacheTime = 0;
let inFlight: Promise<PortalMeData> | null = null;
const CACHE_TTL = 60 * 1000;
// Tombol "Coba lagi"/"Muat Ulang" yang gagal seketika (tanpa sinyal) tetap memutar
// indikatornya sebentar, supaya jamaah melihat percobaannya benar-benar dijalankan.
const RETRY_MIN_MS = 600;

export function clearPortalMeCache() {
  cache = null;
  cacheTime = 0;
}

function initialData(): { data: PortalMeData; updatedAt: number } | null {
  if (cache) return { data: cache, updatedAt: cacheTime };
  // Belum ada data di memori (app baru dibuka): pakai salinan terakhir milik booking sesi
  // ini, supaya jadwal & pembayaran tetap terbaca tanpa sinyal.
  const session = getPortalSession();
  const snapshot = session ? readPortalSnapshot<PortalMeData>(session) : null;
  if (!snapshot) return null;
  cache = snapshot.data;
  cacheTime = snapshot.savedAt;
  return { data: snapshot.data, updatedAt: snapshot.savedAt };
}

function requestMe(): Promise<PortalMeData> {
  // Satu permintaan dipakai bersama (mount + focus + online bisa datang bersamaan).
  if (!inFlight) {
    inFlight = portalApi
      .getMe()
      .then((res) => {
        const data = res as PortalMeData;
        cache = data;
        cacheTime = Date.now();
        const session = getPortalSession();
        // Salinan offline tanpa nomor paspor utuh (lihat portalSnapshotPrivacy.ts).
        if (session) savePortalSnapshot(session, maskSnapshotForStorage(data), cacheTime);
        return data;
      })
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
}

/**
 * Data portal (/me). Data yang sudah tampil TIDAK pernah diganti layar muat atau layar
 * galat saat diperbarui di latar (fokus kembali dari WhatsApp, sinyal kembali): `loading`
 * hanya true selama belum ada data sama sekali, dan kegagalan pembaruan cukup ditandai
 * lewat `error` + `updatedAt` (waktu data yang sedang tampil).
 */
export function usePortalMe() {
  const [initial] = useState(initialData);
  const [data, setData] = useState<PortalMeData | null>(initial?.data ?? null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(initial?.updatedAt ?? null);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const mountedRef = useRef(true);
  // Pembaruan latar & coba-ulang manual bisa tumpang tindih; indikator baru padam
  // setelah semuanya selesai.
  const pendingRef = useRef(0);

  const fetchMe = useCallback(async (minDurationMs = 0) => {
    pendingRef.current += 1;
    setFetching(true);
    try {
      const [outcome] = await Promise.allSettled([
        requestMe(),
        minDurationMs > 0 ? new Promise((resolve) => window.setTimeout(resolve, minDurationMs)) : null,
      ]);
      if (outcome.status === 'rejected') throw outcome.reason;
      const res = outcome.value;
      if (!mountedRef.current) return;
      setData(res);
      setUpdatedAt(cacheTime);
      setError(null);
    } catch (err) {
      if (mountedRef.current) setError(err);
    } finally {
      pendingRef.current -= 1;
      if (mountedRef.current && pendingRef.current === 0) setFetching(false);
    }
  }, []);

  const retry = useCallback(() => fetchMe(RETRY_MIN_MS), [fetchMe]);

  useEffect(() => {
    mountedRef.current = true;
    if (!cache || Date.now() - cacheTime > CACHE_TTL) {
      fetchMe();
    }

    function refreshIfStale() {
      if (Date.now() - cacheTime > CACHE_TTL) fetchMe();
    }
    function onVisibilityChange() {
      // App terpasang di iOS tidak selalu mendapat `focus` saat kembali dari app lain.
      if (document.visibilityState === 'visible') refreshIfStale();
    }
    function onOnline() {
      fetchMe();
    }

    window.addEventListener('focus', refreshIfStale);
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      mountedRef.current = false;
      window.removeEventListener('focus', refreshIfStale);
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [fetchMe]);

  return {
    data,
    /** Belum ada data sama sekali dan sedang/akan dimuat. */
    loading: !data && (fetching || !error),
    /** Sedang memperbarui data yang sudah tampil. */
    refreshing: !!data && fetching,
    error,
    /** Waktu (ms) data yang tampil diterima dari server. */
    updatedAt,
    refetch: retry,
  };
}
