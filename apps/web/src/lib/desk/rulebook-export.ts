import type { Rulebook } from '@holdout/engine';

export function rulebookJson(book: Rulebook): string {
  return `${JSON.stringify(book, null, 2)}\n`;
}

export function rulebookFileName(book: Rulebook): string {
  const safe = book.traderId.replace(/[^A-Za-z0-9_-]/g, '-');
  return `holdout-rulebook-${safe}-v${book.version}.json`;
}

export function saveRequest(book: Rulebook, deviceId: string): { headers: Record<string, string>; body: string } {
  return {
    headers: { 'content-type': 'application/json', 'x-device-id': deviceId },
    body: JSON.stringify({ rulebook: book }),
  };
}
