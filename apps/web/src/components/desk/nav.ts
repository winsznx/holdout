import { BookMarked, Clock, House, Lightbulb, ListChecks, MessageSquare, ScanSearch, Table2, Upload, type LucideIcon } from 'lucide-react';

export interface DeskNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
}

export const DESK_NAV: readonly DeskNavItem[] = [
  { href: '/desk', label: 'Home', icon: House, exact: true },
  { href: '/desk/import', label: 'Import', icon: Upload },
  { href: '/desk/ledger', label: 'Ledger', icon: Table2 },
  { href: '/desk/rules', label: 'Rules', icon: ListChecks },
  { href: '/desk/proposals', label: 'Proposals', icon: Lightbulb },
  { href: '/desk/sessions', label: 'Sessions', icon: Clock },
  { href: '/desk/check', label: 'Check a trade', icon: ScanSearch },
  { href: '/desk/chat', label: 'Chat', icon: MessageSquare },
  { href: '/desk/rulebook', label: 'Rulebook', icon: BookMarked },
];
