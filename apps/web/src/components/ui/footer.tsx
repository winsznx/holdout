import { Code, ExternalLink, FileText, Lock } from 'lucide-react';
import Link from 'next/link';
import { Icon } from './icon';
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
          <a href={GITHUB_URL} className="inline-flex items-center gap-2 text-muted hover:text-ink">
            <Icon icon={Code} />
            GitHub
          </a>
          <Link href="/methodology" className="inline-flex items-center gap-2 text-muted hover:text-ink">
            <Icon icon={FileText} />
            Methodology
          </Link>
          <Link href="/privacy" className="inline-flex items-center gap-2 text-muted hover:text-ink">
            <Icon icon={Lock} />
            Privacy
          </Link>
          <a href={X_URL} className="inline-flex items-center gap-2 text-muted hover:text-ink">
            <Icon icon={ExternalLink} />
            X
          </a>
        </nav>
      </Container>
    </footer>
  );
}
