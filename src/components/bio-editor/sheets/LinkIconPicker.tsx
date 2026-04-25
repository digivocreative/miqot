import {
  Link2, Globe, Calendar, FileText, Video, Youtube, Instagram,
  BookOpen, Award, Gift, Sparkles, type LucideIcon,
} from 'lucide-react';

const OPTIONS: { name: string; Icon: LucideIcon }[] = [
  { name: 'Link2', Icon: Link2 },
  { name: 'Globe', Icon: Globe },
  { name: 'Calendar', Icon: Calendar },
  { name: 'FileText', Icon: FileText },
  { name: 'Video', Icon: Video },
  { name: 'Youtube', Icon: Youtube },
  { name: 'Instagram', Icon: Instagram },
  { name: 'BookOpen', Icon: BookOpen },
  { name: 'Award', Icon: Award },
  { name: 'Gift', Icon: Gift },
  { name: 'Sparkles', Icon: Sparkles },
];

interface Props {
  value: string;
  onChange: (name: string) => void;
}

export default function LinkIconPicker({ value, onChange }: Props) {
  return (
    <div className="grid grid-cols-6 gap-2">
      {OPTIONS.map(({ name, Icon }) => {
        const active = value === name;
        return (
          <button
            key={name}
            type="button"
            onClick={() => onChange(name)}
            className={`aspect-square rounded-xl border flex items-center justify-center transition-all active:scale-95 ${
              active
                ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 ring-2 ring-emerald-500/20'
                : 'border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-gray-500 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-700/50'
            }`}
            aria-label={name}
          >
            <Icon size={18} />
          </button>
        );
      })}
    </div>
  );
}
