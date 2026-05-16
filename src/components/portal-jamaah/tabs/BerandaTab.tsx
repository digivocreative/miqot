import { BookOpenCheck, CreditCard, ListChecks, MessageCircle, Plane } from 'lucide-react';
import { normalizeWaNumber } from '@/utils/phone';
import PortalTopBar from '../components/PortalTopBar';
import LogoutMenu from '../components/LogoutMenu';
import StatusCard from '../components/StatusCard';
import RosterItem from '../components/RosterItem';
import { portalApi } from '../lib/portalApi';
import { clearPortalSession } from '../lib/portalSession';
import { clearPortalMeCache, type PortalJamaah, type PortalMeData } from '../hooks/usePortalMe';
import type { PortalTabId } from '../components/PortalBottomNav';
import { addDays, daysUntilDate, formatLongDate, formatPortalTime, formatShortDate } from '../utils/formatDate';
import { formatRupiah } from '../utils/formatRupiah';

function titleFor(jamaah?: PortalJamaah) {
  if (jamaah?.jk === 'L') return 'Bapak';
  if (jamaah?.jk === 'P') return 'Ibu';
  return 'Sahabat';
}

function paymentTotals(jamaah: PortalJamaah[]) {
  const totalBayar = jamaah.reduce((sum, item) => sum + Number(item.bayar || 0), 0);
  const totalSisa = jamaah.reduce((sum, item) => sum + Number(item.sisa || 0), 0);
  const totalHarga = totalBayar + totalSisa;
  const bayarPct = totalHarga > 0 ? Math.round((totalBayar / totalHarga) * 100) : 0;
  return { totalBayar, totalSisa, totalHarga, bayarPct };
}

function includesReadyDocument(dokumen: Record<string, unknown>, keyword: string) {
  const text = JSON.stringify(dokumen || {}).toLowerCase();
  return text.includes(keyword) && !text.includes('belum_siap');
}

function computeJamaahPreparation(jamaah: PortalJamaah) {
  const paymentScore = Math.max(0, Math.min(100, Number(jamaah.bayar_pct || 0)));
  const passportScore = jamaah.no_paspor || includesReadyDocument(jamaah.dokumen, 'paspor') ? 100 : 0;
  const vaccineScore = includesReadyDocument(jamaah.dokumen, 'vaksin') || includesReadyDocument(jamaah.dokumen, 'meningitis') ? 100 : 0;
  const equipment = Object.values(jamaah.perlengkapan || {});
  const equipmentScore = equipment.length
    ? Math.round((equipment.filter((item) => item?.status === 'diambil').length / equipment.length) * 100)
    : 0;
  return Math.round((paymentScore + passportScore + vaccineScore + equipmentScore) / 4);
}

function airlineFromCode(code?: string | null) {
  const prefix = String(code || '').trim().slice(0, 2).toUpperCase();
  const airlines: Record<string, string> = {
    SV: 'Saudia',
    GA: 'Garuda Indonesia',
    QR: 'Qatar Airways',
    EK: 'Emirates',
    EY: 'Etihad',
    WY: 'Oman Air',
    JT: 'Lion Air',
  };
  return airlines[prefix] || 'Maskapai';
}

function routeNote(route?: string | null) {
  const raw = String(route || '');
  if (!raw) return 'Rute menyusul';
  const separators = (raw.match(/[-–>,]/g) || []).length;
  return separators <= 1 ? 'Direct' : 'Transit';
}

function currentSlug(data: PortalMeData) {
  return data.agent?.slug || window.location.pathname.split('/').filter(Boolean)[0] || '';
}

export default function BerandaTab({
  data,
  onNavigate,
}: {
  data: PortalMeData;
  onNavigate: (tab: PortalTabId) => void;
}) {
  const initiator = data.jamaah.find((item) => item.is_initiator) || data.jamaah[0];
  const title = titleFor(initiator);
  const totals = paymentTotals(data.jamaah);
  const daysFromApi = Number(data.booking.hari_ke_berangkat);
  const daysLeft = Number.isFinite(daysFromApi) ? daysFromApi : daysUntilDate(data.booking.tgl_berangkat);
  const safeDaysLeft = Math.max(0, daysLeft ?? 0);
  const schedule = data.schedule;
  const flightCode = schedule?.berangkat_kode_penerbangan || 'TBA';
  const jamaahProgress = data.jamaah.map((item) => ({ id: item.id, pct: computeJamaahPreparation(item) }));
  const overallProgress = jamaahProgress.length
    ? Math.round(jamaahProgress.reduce((sum, item) => sum + item.pct, 0) / jamaahProgress.length)
    : 0;
  const pendingCount = Math.max(0, Math.ceil((100 - overallProgress) / 10));
  const deadline = addDays(data.booking.tgl_berangkat, -30);
  const daysToDeadline = daysUntilDate(deadline);
  const showAnnouncement = totals.totalSisa > 0 && daysToDeadline !== null && daysToDeadline <= 60;
  const agentPhone = normalizeWaNumber(data.agent?.phone);
  const waMessage = `Assalamualaikum ${data.agent?.name || 'Agent'}, saya ${initiator?.nama || 'jamaah'} dari booking ${data.booking.id_umroh}. Saya ingin bertanya tentang persiapan perjalanan umroh kami.`;
  const waLink = agentPhone ? `https://wa.me/${agentPhone}?text=${encodeURIComponent(waMessage)}` : null;

  async function handleLogout() {
    try {
      await portalApi.logout();
    } catch {
      // Session may already be gone server-side. Local cleanup still matters.
    } finally {
      clearPortalMeCache();
      clearPortalSession();
      window.location.href = `/${currentSlug(data)}/jamaah`;
    }
  }

  return (
    <div className="min-h-screen overflow-x-hidden bg-slate-50 font-sans text-slate-900">
      <PortalTopBar agent={data.agent} rightSlot={<LogoutMenu onLogout={handleLogout} />} />
      <main className="mx-auto w-full max-w-md space-y-5 px-4 pb-28 pt-5">
        <section>
          <p className="text-sm font-medium text-slate-500">Assalamualaikum,</p>
          <h1 className="mt-1 text-2xl font-bold tracking-normal text-slate-950">
            {title} {initiator?.nama || 'Jamaah'}
          </h1>
        </section>

        <section className="rounded-2xl bg-emerald-700 p-5 text-white shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-50">
                Menuju Tanah Suci
              </p>
              <p className="mt-3 text-5xl font-bold tracking-normal">{safeDaysLeft}</p>
              <p className="mt-1 text-sm font-medium text-emerald-50">
                {safeDaysLeft === 0 ? 'Hari keberangkatan' : 'hari lagi'}
              </p>
            </div>
            <span className="rounded-full bg-white/15 px-3 py-1 text-[11px] font-semibold text-white">
              {data.booking.id_umroh}
            </span>
          </div>
          <p className="mt-4 text-sm text-emerald-50">Berangkat {formatLongDate(data.booking.tgl_berangkat)}</p>
          <div className="mt-5 grid grid-cols-2 gap-3 border-t border-white/20 pt-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-100">Paket</p>
              <p className="mt-1 truncate text-sm font-semibold">{data.booking.paket || 'Paket Umroh'}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-100">Penerbangan</p>
              <p className="mt-1 truncate text-sm font-semibold">
                {flightCode} · {airlineFromCode(flightCode)}
              </p>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-2 gap-3">
          <StatusCard
            icon={CreditCard}
            label="Pembayaran"
            value={`${totals.bayarPct}%`}
            subtext={`Sisa ${formatRupiah(totals.totalSisa)}`}
            onClick={() => onNavigate('bayar')}
          />
          <StatusCard
            icon={ListChecks}
            label="Persiapan"
            value={`${overallProgress}%`}
            subtext={`${pendingCount} item pending`}
            onClick={() => onNavigate('persiapan')}
          />
          <StatusCard
            icon={BookOpenCheck}
            label="Manasik"
            value={formatShortDate(schedule?.manasik_tgl)}
            subtext={`${formatPortalTime(schedule?.manasik_jam)}, lokasi menyusul`}
            onClick={() => onNavigate('perjalanan')}
            tone="slate"
          />
          <StatusCard
            icon={Plane}
            label="Penerbangan"
            value={flightCode}
            subtext={`${airlineFromCode(flightCode)} · ${routeNote(schedule?.berangkat_rute)}`}
            onClick={() => onNavigate('perjalanan')}
          />
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Anggota Booking</p>
            <span className="text-xs font-semibold text-slate-500">{data.jamaah.length} jamaah</span>
          </div>
          <div className="space-y-2.5">
            {data.jamaah.map((item) => (
              <RosterItem
                key={item.id}
                jamaah={item}
                progressPct={jamaahProgress.find((progress) => progress.id === item.id)?.pct || 0}
              />
            ))}
          </div>
        </section>

        {showAnnouncement && (
          <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-700">
              Pengumuman dari Agent
            </p>
            <p className="mt-2 text-sm font-semibold text-amber-900">Reminder Pelunasan H-30</p>
            <p className="mt-1 text-xs leading-5 text-amber-800">
              Deadline pelunasan sekitar {formatLongDate(deadline)}. Sisa booking keluarga Anda {formatRupiah(totals.totalSisa)}.
            </p>
          </section>
        )}

        {waLink && (
          <a
            href={waLink}
            target="_blank"
            rel="noreferrer"
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-3 text-sm font-semibold text-white"
          >
            <MessageCircle className="h-4 w-4" strokeWidth={2} />
            Hubungi {data.agent?.name || 'Agent'} lewat WhatsApp
          </a>
        )}
      </main>
    </div>
  );
}
