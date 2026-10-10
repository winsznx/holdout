import { readFile } from 'node:fs/promises';
import path from 'node:path';

const FONT_DIR = path.join(process.cwd(), 'src', 'assets', 'fonts');

async function load(file: string): Promise<ArrayBuffer> {
  const buf = await readFile(path.join(FONT_DIR, file));
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

export async function loadOgFonts() {
  const [bold, medium] = await Promise.all([load('sg-700.ttf'), load('sg-500.ttf')]);
  return [
    { name: 'Space Grotesk', data: bold, weight: 700 as const, style: 'normal' as const },
    { name: 'Space Grotesk', data: medium, weight: 500 as const, style: 'normal' as const },
  ];
}
