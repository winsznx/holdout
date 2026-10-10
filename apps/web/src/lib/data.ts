import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { DataResult } from './data-result';

const PUBLIC_DIR = path.join(process.cwd(), 'public');
const REPO_DOCS_DIR = path.join(process.cwd(), '..', '..', 'docs');

function isMissing(e: unknown): boolean {
  return typeof e === 'object' && e !== null && 'code' in e && (e as { code?: string }).code === 'ENOENT';
}

export async function readPublicJson<T>(relPath: string, parse: (raw: unknown) => T): Promise<DataResult<T>> {
  try {
    const text = await readFile(path.join(PUBLIC_DIR, relPath), 'utf8');
    return { status: 'ok', data: parse(JSON.parse(text)) };
  } catch (e) {
    if (isMissing(e)) return { status: 'absent' };
    return { status: 'error', message: e instanceof Error ? e.message : `Could not read ${relPath}` };
  }
}

export async function readRepoDoc(name: string): Promise<string | null> {
  try {
    return await readFile(path.join(REPO_DOCS_DIR, name), 'utf8');
  } catch (e) {
    if (isMissing(e)) return null;
    throw e;
  }
}
