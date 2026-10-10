import Link from 'next/link';
import { Container } from './section';
import { Wordmark } from './logo';
import { GITHUB_URL, X_URL } from './header';

export function Footer() {
  return (
    <footer className="mt-20 border-t border-line">
      <Container className="flex flex-col gap-8 py-10 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-3">
          <Wordmark size={20} />
          <p className="max-w-[34ch] text-[13px] text-muted">Holdout never places orders. You make every trade decision.</p>
        </div>
        <nav aria-label="Footer" className="grid grid-cols-2 gap-x-10 gap-y-2 text-[14px]">
          <a href={GITHUB_URL} className="hover:underline underline-offset-4">
            GitHub
          </a>
          <Link href="/methodology" className="hover:underline underline-offset-4">
            Methodology
          </Link>
          <Link href="/privacy" className="hover:underline underline-offset-4">
            Privacy
          </Link>
          <a href={X_URL} className="hover:underline underline-offset-4">
            X
          </a>
        </nav>
      </Container>
    </footer>
  );
}
