import { useEffect, useState } from 'react';
import type { BioAgentPublic, FeaturedPaketPreview } from '../types';

interface Props {
  jadwal_id: string;
  agent: BioAgentPublic;
  badge?: string;
  cta?: string;
}

function formatDateShort(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatRupiah(n: number): string {
  return new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(n);
}

export default function TileFeatured({ jadwal_id, agent, badge, cta }: Props) {
  const [data, setData] = useState<FeaturedPaketPreview | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch(`/api/bio/${agent.slug}/featured-paket-preview?jadwal_id=${encodeURIComponent(jadwal_id)}`)
      .then(r => r.json())
      .then(d => {
        if (!alive) return;
        if (d?.success && d.data) setData(d.data);
        else setFailed(true);
      })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [agent.slug, jadwal_id]);

  // If the preview fetch fails the tile is an orphan at read-time — hide it.
  if (failed) return null;
  if (!data) {
    return (
      <div className="bio-tile bio-tile-featured" aria-busy="true">
        <div className="bio-featured-image" style={{ aspectRatio: '16 / 9' }} />
        <div className="bio-featured-body">
          <div className="bio-skeleton-line" style={{ width: '65%' }} />
          <div className="bio-skeleton-line" style={{ width: '45%' }} />
        </div>
      </div>
    );
  }

  const href = `/${agent.slug}/${data.jadwal_id}`;
  const ctaLabel = cta?.trim() || 'Lihat Detail';
  const badgeLabel = badge?.trim() || 'Rekomendasi';
  const depart = formatDateShort(data.berangkat_tgl);
  const ret = formatDateShort(data.pulang_tgl);
  const dateLine = depart && ret ? `${depart} – ${ret}` : depart || ret || '';

  return (
    <a href={href} className="bio-tile bio-tile-featured bio-tile--button">
      <div className="bio-featured-image">
        {data.image_url ? (
          <img src={data.image_url} alt={data.name} loading="lazy" />
        ) : (
          <span>Paket Umroh</span>
        )}
        <span className="bio-featured-badge">{badgeLabel}</span>
      </div>
      <div className="bio-featured-body">
        <div className="bio-featured-name">{data.name}</div>
        <div className="bio-featured-meta">
          {dateLine && <span>📅 {dateLine}</span>}
          {data.maskapai && <span>✈ {data.maskapai}</span>}
        </div>
        <div className="bio-featured-cta">
          <div>
            {data.anchor_price ? (
              <div className="bio-featured-price">
                Mulai Rp {formatRupiah(data.anchor_price)}
              </div>
            ) : null}
            {typeof data.seat_sisa === 'number' && data.seat_sisa > 0 && (
              <div className="bio-featured-seat">Sisa {data.seat_sisa} seat</div>
            )}
          </div>
          <button className="bio-featured-button" type="button">{ctaLabel}</button>
        </div>
      </div>
    </a>
  );
}
