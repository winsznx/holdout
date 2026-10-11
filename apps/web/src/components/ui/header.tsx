import { ArrowRight, BookOpenCheck, Code, Menu, Plug, Table2 } from 'lucide-react';
import Link from 'next/link';
import { ButtonLink } from './button';
import { Icon } from './icon';
import { Container } from './section';
import { Wordmark } from './logo';
import { ThemeToggle } from './theme-toggle';

export const GITHUB_URL = 'https://github.com/winsznx/holdout';
export const X_URL = 'https://x.com/winsznx';

const NAV = [
  { href: '/desk', label: 'Desk', icon: Table2 },
  { href: '/evidence', label: 'Evidence', icon: BookOpenCheck },
  { href: '/skill', label: 'Skill', icon: Plug },
] as const;

export function Header() {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-paper">
      <Container className="flex h-14 items-center justify-between gap-3">
        <Link href="/" aria-label="Holdout home" className="shrink-0">
          <Wordmark />
        </Link>
        <nav aria-label="Primary" className="hidden items-center gap-6 text-[14px] md:flex">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="inline-flex items-center gap-1.5 text-muted hover:text-ink">
              <Icon icon={n.icon} />
              {n.label}
            </Link>
          ))}
          <a href={GITHUB_URL} className="inline-flex items-center gap-1.5 text-muted hover:text-ink">
            <Icon icon={Code} />
            GitHub
          </a>
        </nav>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <span className="hidden sm:inline-flex">
            <ButtonLink href="/sample" size="sm">
              Try the sample
              <Icon icon={ArrowRight} />
            </ButtonLink>
          </span>
          <details className="relative md:hidden">
            <summary className="inline-flex h-8 cursor-pointer list-none items-center gap-1.5 rounded-control border border-line px-3 text-[13px] hover:border-ink">
              <Icon icon={Menu} />
              Menu
            </summary>
            <div className="absolute right-0 mt-2 w-56 rounded-card border border-line bg-surface p-2 text-[14px]">
              {NAV.map((n) => (
                <Link key={n.href} href={n.href} className="flex items-center gap-2.5 rounded-control px-3 py-2 hover:bg-paper">
                  <Icon icon={n.icon} />
                  {n.label}
                </Link>
              ))}
              <a href={GITHUB_URL} className="flex items-center gap-2.5 rounded-control px-3 py-2 hover:bg-paper">
                <Icon icon={Code} />
                GitHub
              </a>
              <Link href="/sample" className="mt-1 flex items-center justify-between rounded-control bg-ink px-3 py-2 text-paper">
                Try the sample
                <Icon icon={ArrowRight} />
              </Link>
            </div>
          </details>
        </div>
      </Container>
    </header>
  );
}
