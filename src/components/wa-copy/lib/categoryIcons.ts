import type { ElementType } from 'react';
import {
  Heart, Hourglass, Wallet, Quote, ShieldCheck, Lightbulb,
  HelpCircle, CreditCard, FileText, Plane, BedDouble,
  ListChecks, Compass, Home,
  Tag, Star, Gift, Sparkles, Award, Users, Clock, MapPin,
  Phone, MessageCircle, Calendar, Camera, BookOpen, Coffee,
  Sun, Moon, Bell, CheckCircle,
} from 'lucide-react';

/** Curated icons offered in the category icon picker. Names are the lucide export names. */
export const CATEGORY_ICON_OPTIONS: { name: string; icon: ElementType }[] = [
  { name: 'Heart', icon: Heart },
  { name: 'Hourglass', icon: Hourglass },
  { name: 'Wallet', icon: Wallet },
  { name: 'Quote', icon: Quote },
  { name: 'ShieldCheck', icon: ShieldCheck },
  { name: 'Lightbulb', icon: Lightbulb },
  { name: 'HelpCircle', icon: HelpCircle },
  { name: 'CreditCard', icon: CreditCard },
  { name: 'FileText', icon: FileText },
  { name: 'Plane', icon: Plane },
  { name: 'BedDouble', icon: BedDouble },
  { name: 'ListChecks', icon: ListChecks },
  { name: 'Compass', icon: Compass },
  { name: 'Home', icon: Home },
  { name: 'Tag', icon: Tag },
  { name: 'Star', icon: Star },
  { name: 'Gift', icon: Gift },
  { name: 'Sparkles', icon: Sparkles },
  { name: 'Award', icon: Award },
  { name: 'Users', icon: Users },
  { name: 'Clock', icon: Clock },
  { name: 'MapPin', icon: MapPin },
  { name: 'Phone', icon: Phone },
  { name: 'MessageCircle', icon: MessageCircle },
  { name: 'Calendar', icon: Calendar },
  { name: 'Camera', icon: Camera },
  { name: 'BookOpen', icon: BookOpen },
  { name: 'Coffee', icon: Coffee },
  { name: 'Sun', icon: Sun },
  { name: 'Moon', icon: Moon },
  { name: 'Bell', icon: Bell },
  { name: 'CheckCircle', icon: CheckCircle },
];

const ICON_BY_NAME: Record<string, ElementType> = Object.fromEntries(
  CATEGORY_ICON_OPTIONS.map(o => [o.name, o.icon]),
);

/** Resolve an iconName to its lucide component, defaulting to Tag for unknown names. */
export function resolveCategoryIcon(name: string): ElementType {
  return ICON_BY_NAME[name] ?? Tag;
}
