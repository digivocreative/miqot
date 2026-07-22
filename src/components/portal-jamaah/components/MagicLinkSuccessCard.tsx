import { CheckCircle2 } from 'lucide-react';
import { Card } from '../ui';

interface Props {
  title: string;
  message: string;
}

export default function MagicLinkSuccessCard({ title, message }: Props) {
  return (
    <Card className="overflow-hidden p-6 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-gradient-burgundy text-gold shadow-accent ring-1 ring-inset ring-gold/30">
        <CheckCircle2 size={28} strokeWidth={2} />
      </div>
      <h1 className="mt-4 font-display text-xl text-ink">{title}</h1>
      <p className="mt-2 break-words text-sm leading-6 text-ink/60">{message}</p>
    </Card>
  );
}
