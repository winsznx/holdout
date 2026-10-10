import { verifyRulebook, type Rulebook } from '@holdout/engine';

export type RulebookLoad = { ok: true; book: Rulebook } | { ok: false; error: string };

export const MAX_RULEBOOK_BYTES = 2_000_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseRulebookText(text: string, origin: string): RulebookLoad {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { ok: false, error: `rulebook from ${origin} is not valid JSON: ${detail}` };
  }
  if (!isRecord(parsed) || parsed.schema !== 'holdout.rulebook.v1') {
    return { ok: false, error: `rulebook from ${origin} is not a holdout.rulebook.v1 file` };
  }
  if (!Array.isArray(parsed.rules) || !Array.isArray(parsed.buckets) || typeof parsed.sha256 !== 'string') {
    return { ok: false, error: `rulebook from ${origin} is missing rules, buckets or sha256` };
  }
  const book = parsed as unknown as Rulebook;
  let verified = false;
  try {
    verified = verifyRulebook(book);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { ok: false, error: `rulebook from ${origin} could not be verified: ${detail}` };
  }
  if (!verified) {
    return {
      ok: false,
      error: `rulebook from ${origin} failed sha256 verification. The file was edited or corrupted. Export it again from Holdout.`,
    };
  }
  return { ok: true, book };
}

const PRIVATE_HOST = /^(localhost|.*\.local|.*\.internal|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.0\.0\.0|\[)/i;

export function checkRulebookUrl(raw: string): { ok: true; url: URL } | { ok: false; error: string } {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, error: 'rulebook URL is not a valid URL' };
  }
  if (url.protocol !== 'https:') return { ok: false, error: 'rulebook URL must use https' };
  if (url.username !== '' || url.password !== '') return { ok: false, error: 'rulebook URL must not contain credentials' };
  if (PRIVATE_HOST.test(url.hostname)) return { ok: false, error: 'rulebook URL must point to a public host' };
  return { ok: true, url };
}

export async function loadRulebookFromUrl(raw: string, fetchImpl: typeof fetch = fetch): Promise<RulebookLoad> {
  const checked = checkRulebookUrl(raw);
  if (!checked.ok) return checked;
  let response: Response;
  try {
    response = await fetchImpl(checked.url, { headers: { accept: 'application/json' }, redirect: 'error' });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { ok: false, error: `could not fetch rulebook from ${checked.url.host}: ${detail}` };
  }
  if (!response.ok) return { ok: false, error: `rulebook URL returned HTTP ${response.status}` };
  const text = await response.text();
  if (text.length > MAX_RULEBOOK_BYTES) return { ok: false, error: 'rulebook is larger than 2 MB' };
  return parseRulebookText(text, checked.url.host);
}

export const MISSING_RULEBOOK_MESSAGE =
  'No rulebook is configured. Set HOLDOUT_RULEBOOK to the path of the rulebook JSON exported from Holdout.';
