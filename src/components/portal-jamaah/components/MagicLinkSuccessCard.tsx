import { CheckCircle2 } from 'lucide-react';

interface Props {
  title: string;
  message: string;
}

export default function MagicLinkSuccessCard({ title, message }: Props) {
  return (
    <section className="rounded-2xl border border-slate-100 bg-white p-6 text-center shadow-sm">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-emerald-100 bg-emerald-50 text-emerald-700">
        <CheckCircle2 size={28} strokeWidth={2} />
      </div>
      <h1 className="mt-4 text-xl font-bold text-slate-950">{title}</h1>
      <p className="mt-2 text-sm leading-6 text-slate-600">{message}</p>
    </section>
  );
}
