import { execFileSync } from 'node:child_process';

function git(args: string[]): string {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

export function headCommit(): string {
  return git(['rev-parse', 'HEAD']);
}

export function isCommitted(path: string): boolean {
  try {
    if (git(['log', '--oneline', '--', path]).length === 0) return false;
    return git(['status', '--porcelain', '--', path]).length === 0;
  } catch {
    return false;
  }
}
