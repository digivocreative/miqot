import { useEffect, useState } from 'react';

import { daysFromResponse, type ItineraryDay } from '@/lib/itineraryRail';

export type ItineraryState = 'loading' | 'ready' | 'unavailable';

export interface ItineraryResult {
  state: ItineraryState;
  days: ItineraryDay[];
}

// Cache per sesi. Agent bolak-balik antar kartu saat menjelaskan; tanpa ini
// tiap klik memicu parse ulang PDF di server. 'unavailable' ikut di-cache —
// paket tanpa itinerary tidak akan tiba-tiba punya di tengah percakapan.
const cache = new Map<string, ItineraryDay[] | null>();

const LOADING: ItineraryResult = { state: 'loading', days: [] };
const UNAVAILABLE: ItineraryResult = { state: 'unavailable', days: [] };

function fromCache(jadwalId: string): ItineraryResult | null {
  if (!cache.has(jadwalId)) return null;
  const days = cache.get(jadwalId);
  return days ? { state: 'ready', days } : UNAVAILABLE;
}

/**
 * Itinerary paket untuk rail kiri.
 *
 * Tidak pernah melempar: 404 ("belum tersedia"), 503 ("sedang disinkronkan"),
 * dan gagal jaringan semuanya jadi 'unavailable' supaya rail bisa jatuh ke
 * strip kota dari journeyOrder. Lihat komentar di src/lib/itineraryRail.ts.
 */
export function useItineraryContent(jadwalId: string | null): ItineraryResult {
  const [result, setResult] = useState<ItineraryResult>(() =>
    jadwalId ? fromCache(jadwalId) ?? LOADING : UNAVAILABLE,
  );

  useEffect(() => {
    if (!jadwalId) {
      setResult(UNAVAILABLE);
      return;
    }

    const cached = fromCache(jadwalId);
    if (cached) {
      setResult(cached);
      return;
    }

    // Agent bisa mengganti kartu lebih cepat daripada respons datang; tanpa
    // abort, jawaban paket lama bisa mendarat di rail paket baru.
    const controller = new AbortController();
    setResult(LOADING);

    (async () => {
      let days: ItineraryDay[] | null = null;
      try {
        const res = await fetch(`/api/itinerary/${encodeURIComponent(jadwalId)}`, {
          signal: controller.signal,
        });
        const body = await res.json().catch(() => null);
        days = daysFromResponse(res.status, body);
      } catch {
        // Termasuk AbortError — dijaga oleh pemeriksaan signal di bawah.
        days = null;
      }
      if (controller.signal.aborted) return;
      cache.set(jadwalId, days);
      setResult(days ? { state: 'ready', days } : UNAVAILABLE);
    })();

    return () => controller.abort();
  }, [jadwalId]);

  return result;
}

export default useItineraryContent;
