interface Props {
  agentName: string | null;
  agentPhone: string | null;
  agentPhoto: string | null;
  agentSlug: string | null;
  paketNama: string;
  onWaClick?: () => void;
}

export default function AgentFooter({ agentName, agentPhone, agentPhoto, agentSlug, paketNama, onWaClick }: Props) {
  if (!agentSlug || !agentName) return null;
  const openWa = () => {
    onWaClick?.();
    const msg = encodeURIComponent(`Assalamualaikum, saya mau tanya terkait paket ${paketNama}`);
    window.open(`https://wa.me/${agentPhone}?text=${msg}`, '_blank');
  };
  return (
    <div className="rounded-2xl bg-burgundy-50 p-3.5">
      <div className="flex items-center gap-2.5">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-burgundy text-[15px] font-bold text-white">
          {agentPhoto ? (
            <img
              src={agentPhoto}
              alt={agentName}
              className="h-full w-full object-cover"
              onError={e => { e.currentTarget.style.display = 'none'; }}
            />
          ) : (
            agentName[0]?.toUpperCase()
          )}
        </div>
        <div className="min-w-0">
          <p className="truncate text-[13px] font-bold text-itin-ink">{agentName}</p>
          <p className="text-[10.5px] text-itin-ink2">Agen Umroh · Alhijaz Indowisata</p>
        </div>
      </div>
      {agentPhone && (
        <button
          type="button"
          onClick={openWa}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-burgundy py-2.5 text-[12.5px] font-bold text-white transition-transform active:scale-[0.98]"
        >
          Chat WhatsApp
        </button>
      )}
      <p className="mt-2.5 text-center text-[9.5px] leading-[1.4] text-itin-ink3">
        Disusun dari itinerary resmi Alhijaz Indowisata · alhijaz.co/{agentSlug}
      </p>
    </div>
  );
}
