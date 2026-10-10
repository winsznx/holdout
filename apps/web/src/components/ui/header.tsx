import Link from 'next/link';
import { ButtonLink } from './button';
import { Container } from './section';
import { Wordmark } from './logo';
import { ThemeToggle } from './theme-toggle';

export const GITHUB_URL = 'https://github.com/winsznx/holdout';
export const X_URL = 'https://x.com/winsznx';

const NAV = [
  { href: '/desk', label: 'Desk' },
  { href: '/evidence', label: 'Evidence' },
  { href: '/skill', label: 'Skill' },
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
            <Link key={n.href} href={n.href} className="hover:underline underline-offset-4">
              {n.label}
            </Link>
          ))}
          <a href={GITHUB_URL} className="hover:underline underline-offset-4">
            GitHub
          </a>
        </nav>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <ButtonLink href="/sample" size="sm" className="hidden sm:inline-flex">
            Try the sample
          </ButtonLink>
          <details className="relative md:hidden">
            <summary className="inline-flex h-8 cursor-pointer list-none items-center rounded-control border border-line px-3 text-[13px] hover:border-ink">Menu</summary>
            <div className="absolute right-0 mt-2 w-56 rounded-card border border-line bg-surface p-2 text-[14px]">
              {NAV.map((n) => (
                <Link key={n.href} href={n.href} className="block rounded-control px-3 py-2 hover:bg-paper">
                  {n.label}
                </Link>
              ))}
              <a href={GITHUB_URL} className="block rounded-control px-3 py-2 hover:bg-paper">
                GitHub
              </a>
              <Link href="/sample" className="mt-1 block rounded-control bg-ink px-3 py-2 text-paper">
                Try the sample
              </Link>
            </div>
          </details>
        </div>
      </Container>
    </header>
  );
}
