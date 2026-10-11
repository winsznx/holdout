'use client';

import { Check, Copy } from 'lucide-react';
import { useState } from 'react';
import { Button } from './button';
import { Icon } from './icon';

export function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Button variant="ghost" size="sm" onClick={() => void copy()} aria-live="polite">
      <Icon icon={copied ? Check : Copy} />
      {copied ? 'Copied' : label}
    </Button>
  );
}
