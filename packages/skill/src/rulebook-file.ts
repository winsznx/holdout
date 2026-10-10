import { readFile } from 'node:fs/promises';
import { MAX_RULEBOOK_BYTES, MISSING_RULEBOOK_MESSAGE, parseRulebookText, type RulebookLoad } from './rulebook-load.ts';

export async function loadRulebookFromFile(path: string | undefined): Promise<RulebookLoad> {
  if (path === undefined || path.trim() === '') return { ok: false, error: MISSING_RULEBOOK_MESSAGE };
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { ok: false, error: `rulebook file not readable at ${path}: ${detail}` };
  }
  if (text.length > MAX_RULEBOOK_BYTES) return { ok: false, error: `rulebook file at ${path} is larger than 2 MB` };
  return parseRulebookText(text, path);
}
