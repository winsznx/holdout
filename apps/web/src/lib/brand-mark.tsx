const SOLID = 'M10 0H35a3 3 0 0 1 3 3V57a3 3 0 0 1-3 3H10A10 10 0 0 1 0 50V10A10 10 0 0 1 10 0Z';
const HELD = 'M45 2H50a8 8 0 0 1 8 8V50a8 8 0 0 1-8 8H45a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z';
const HELD_MICRO = 'M46 3H51a6 6 0 0 1 6 6V51a6 6 0 0 1-6 6H46a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z';

export const BRAND = { paper: '#F3F0E8', ink: '#101010', signal: '#D9480F', line: '#D9D4C7', muted: '#6B675C' } as const;

export function MarkSvg({ size, micro = false, ink = BRAND.ink }: { size: number; micro?: boolean; ink?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 60 60">
      <path d={SOLID} fill={ink} />
      <path d={micro ? HELD_MICRO : HELD} fill="none" stroke={ink} strokeWidth={micro ? 6 : 4} />
    </svg>
  );
}
