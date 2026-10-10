import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { DataResult } from './data-result';
import { getCloudflareContext } from '@opennextjs/cloudflare';

const PUBLIC_DIR = path.join(process.cwd(), 'public');
const REPO_DOCS_DIR = path.join(process.cwd(), '..', '..', 'docs');

function isMissing(e: unknown): boolean {
  return typeof e === 'object' && e !== null && 'code' in e && (e as { code?: string }).code === 'ENOENT';
}

async function readFromAssets(relPath: string): Promise<string | null> {
  try {
    const { env } = getCloudflareContext();
    const assets = (env as { ASSETS?: { fetch: (req: Request) => Promise<Response> } }).ASSETS;
    if (!assets) return null;
    const res = await assets.fetch(new Request(`https://assets.local/${relPath}`));
    return res.ok ? await res.text() : null;
  } catch {
    return null;
  }
}

async function readPublicText(relPath: string): Promise<string | null> {
  try {
    return await readFile(path.join(PUBLIC_DIR, relPath), 'utf8');
  } catch (e) {
    if (!isMissing(e) && !(e instanceof Error)) throw e;
    return readFromAssets(relPath);
  }
}

export async function readPublicJson<T>(relPath: string, parse: (raw: unknown) => T): Promise<DataResult<T>> {
  try {
    const text = await readPublicText(relPath);
    if (text === null) return { status: 'absent' };
    return { status: 'ok', data: parse(JSON.parse(text)) };
  } catch (e) {
    return { status: 'error', message: e instanceof Error ? e.message : `Could not read ${relPath}` };
  }
}

export async function readRepoDoc(name: string): Promise<string | null> {
  const fromPublic = await readPublicText(`docs/${name}`);
  if (fromPublic !== null) return fromPublic;
  try {
    return await readFile(path.join(REPO_DOCS_DIR, name), 'utf8');
  } catch (e) {
    if (isMissing(e)) return null;
    throw e;
  }
}
