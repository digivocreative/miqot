import { Backpack, BadgeCheck, BookOpen, Briefcase, Check, Circle, IdCard, Shirt, WalletCards } from 'lucide-react';
import { Card, IconTile, StatusChip, cn } from '../../ui';
import type { PortalPerlengkapanStateItem } from '../../hooks/usePortalPersiapan';

const ICONS: Record<string, typeof Briefcase> = {
  briefcase: Briefcase,
  backpack: Backpack,
  wallet: WalletCards,
  shirt: Shirt,
  book: BookOpen,
  'id-card': IdCard,
  belt: Circle,
};

export default function PerlengkapanItem({
  item,
  subtext,
}: {
  item: PortalPerlengkapanStateItem;
  subtext: string;
}) {
  const Icon = ICONS[item.icon] || BadgeCheck;

  return (
    <Card className={cn('p-4', item.status === 'tersedia' && 'ring-1 ring-amber-300')}>
      <div className="flex items-start gap-3">
        {/* Brand-tinted tile differentiated by item icon; status lives in the chip. */}
        <IconTile tint="neutral" size="md">
          <Icon className="h-5 w-5" strokeWidth={2} />
        </IconTile>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm font-semibold text-ink">{item.title}</p>
            {item.status === 'diambil' ? (
              <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-emerald-500/12 text-emerald-700">
                <Check className="h-4 w-4" strokeWidth={2.4} />
              </span>
            ) : (
              <StatusChip status={item.status === 'tersedia' ? 'warning' : 'neutral'} className="flex-none">
                Menunggu
              </StatusChip>
            )}
          </div>
          <p className="mt-1 text-xs leading-5 text-ink/60">{subtext}</p>
        </div>
      </div>
    </Card>
  );
}
