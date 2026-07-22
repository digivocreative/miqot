import { useState } from 'react';
import { ChevronDown, HelpCircle, LifeBuoy, MessageCircle } from 'lucide-react';
import { normalizeWaNumber } from '@/utils/phone';
import PortalBackBar from '../components/PortalBackBar';
import { PORTAL_FAQ } from '../lib/faq';
import { Button, Card, IconTile, PortalPageShell, SectionLabel, StatusChip } from '../ui';
import type { PortalMeData } from '../hooks/usePortalMe';

export default function FaqPage({
  data,
  onBack,
}: {
  data: PortalMeData;
  onBack: () => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const agentPhone = normalizeWaNumber(data.agent?.phone);
  const escalationLink = agentPhone
    ? `https://wa.me/${agentPhone}?text=${encodeURIComponent(`Assalamualaikum ${data.agent?.name || 'Agent'}, saya ada pertanyaan dari portal jamaah.`)}`
    : null;

  return (
    <PortalPageShell>
      <PortalBackBar
        title="FAQ & Bantuan"
        onBack={onBack}
        icon={LifeBuoy}
        iconClassName="bg-burgundy-700/8 text-burgundy-700"
      />
      <main className="mx-auto w-full max-w-lg space-y-4 px-4 pb-24 pt-4">
        <section className="flex items-start gap-3 rounded-lega bg-gradient-burgundy p-4 text-white shadow-accent ring-1 ring-inset ring-gold/20">
          <span className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-white/15 text-white ring-1 ring-inset ring-white/25">
            <HelpCircle className="h-5 w-5" strokeWidth={2} />
          </span>
          <div className="min-w-0">
            <p className="font-display text-[15px] leading-6 text-white">Pertanyaan umum jamaah umroh</p>
            <p className="mt-1 text-xs leading-5 text-white/75">
              Temukan jawaban singkat atau hubungi agent jika masih membutuhkan bantuan.
            </p>
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex min-h-7 items-center justify-between gap-3">
            <SectionLabel>Topik Bantuan</SectionLabel>
            <StatusChip status="neutral">{PORTAL_FAQ.length} topik</StatusChip>
          </div>

          {PORTAL_FAQ.length === 0 ? (
            <Card className="px-5 py-6 text-center">
              <div className="flex justify-center">
                <IconTile tint="neutral" size="md">
                  <LifeBuoy className="h-5 w-5" strokeWidth={2} />
                </IconTile>
              </div>
              <p className="mt-3 font-display text-base text-ink">Bantuan belum tersedia</p>
              <p className="mx-auto mt-1 max-w-xs text-xs leading-5 text-ink/60">
                Hubungi agent untuk mendapatkan jawaban terkait perjalanan Anda.
              </p>
            </Card>
          ) : (
            <div className="space-y-2.5">
              {PORTAL_FAQ.map((entry) => {
                const open = openId === entry.id;
                const answerId = `faq-answer-${entry.id}`;
                return (
                  <Card key={entry.id} className="overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setOpenId(open ? null : entry.id)}
                      className="flex min-h-12 w-full items-center justify-between gap-3 px-4 py-3.5 text-left outline-none transition-colors hover:bg-burgundy-50/50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-burgundy-700"
                      aria-expanded={open}
                      aria-controls={answerId}
                    >
                      <span className="min-w-0 flex-1 break-words font-display text-sm leading-5 text-ink">{entry.question}</span>
                      <ChevronDown
                        className={`h-4 w-4 flex-none text-ink/40 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
                        strokeWidth={2.2}
                        aria-hidden="true"
                      />
                    </button>
                    {open && (
                      <div
                        id={answerId}
                        className="break-words border-t border-black/5 px-4 pb-4 pt-3 text-sm leading-6 text-ink/70"
                      >
                        {entry.answer}
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </section>

        {escalationLink ? (
          <Button
            href={escalationLink}
            target="_blank"
            rel="noreferrer"
            variant="wa"
            size="lg"
            fullWidth
          >
            <MessageCircle className="h-5 w-5 flex-none" strokeWidth={2} />
            <span className="min-w-0 break-words">Hubungi {data.agent?.name || 'Agent'} via WhatsApp</span>
          </Button>
        ) : (
          <Card className="flex items-start gap-3 p-4">
            <IconTile tint="neutral" size="sm">
              <MessageCircle className="h-4 w-4" strokeWidth={2} />
            </IconTile>
            <div className="min-w-0">
              <p className="font-display text-sm text-ink">Kontak agent belum tersedia</p>
              <p className="mt-1 text-xs leading-5 text-ink/60">Gunakan kontak resmi yang diberikan saat pendaftaran.</p>
            </div>
          </Card>
        )}
      </main>
    </PortalPageShell>
  );
}
