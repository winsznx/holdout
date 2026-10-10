import { ImageResponse } from 'next/og';
import { BRAND, MarkSvg } from '@/lib/brand-mark';
import { loadOgFonts } from '@/lib/og-fonts';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Holdout. A trading journal that proves which rules make you money.';

export default async function OpengraphImage() {
  const fonts = await loadOgFonts();
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', background: BRAND.paper, color: BRAND.ink, padding: 72, fontFamily: 'Space Grotesk' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <MarkSvg size={64} />
          <div style={{ fontSize: 56, fontWeight: 700, letterSpacing: -1.5 }}>Holdout</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 36 }}>
          <div style={{ fontSize: 76, fontWeight: 700, lineHeight: 1.04, letterSpacing: -2.5, maxWidth: 980 }}>A trading journal that proves which rules make you money.</div>
          <div style={{ display: 'flex', gap: 8, height: 28 }}>
            <div style={{ flex: 2, background: BRAND.ink, borderRadius: 8 }} />
            <div style={{ flex: 1, border: `4px solid ${BRAND.signal}`, borderRadius: 8 }} />
          </div>
          <div style={{ fontSize: 28, fontWeight: 500, color: BRAND.muted }}>Your Bitget fills, your rules, tested on trades they never saw.</div>
        </div>
      </div>
    ),
    { ...size, fonts },
  );
}
