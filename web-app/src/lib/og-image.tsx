import { ImageResponse } from 'next/og';

export const ogSize = { width: 1200, height: 630 };

export function createOgImage(title: string, subtitle: string, emoji?: string) {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          background: 'linear-gradient(135deg, #0A0E1A 0%, #1e1b4b 50%, #0A0E1A 100%)',
          position: 'relative',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: 'radial-gradient(circle, rgba(139,92,246,0.08) 1px, transparent 1px)',
            backgroundSize: '32px 32px',
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: '-20%',
            width: '80%',
            height: '60%',
            borderRadius: '50%',
            background: 'radial-gradient(ellipse, rgba(139,92,246,0.15), transparent 70%)',
          }}
        />
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 40 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 14,
              background: 'linear-gradient(135deg, #8B5CF6, #06B6D4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              fontSize: 28,
              fontWeight: 800,
            }}
          >
            SK
          </div>
          <span style={{ color: 'white', fontSize: 32, fontWeight: 800 }}>SkinKeeper</span>
        </div>
        {/* Emoji */}
        {emoji && (
          <div style={{ fontSize: 64, marginBottom: 16 }}>{emoji}</div>
        )}
        {/* Title */}
        <div
          style={{
            fontSize: 52,
            fontWeight: 800,
            background: 'linear-gradient(135deg, #8B5CF6, #06B6D4)',
            backgroundClip: 'text',
            color: 'transparent',
            textAlign: 'center',
            lineHeight: 1.2,
          }}
        >
          {title}
        </div>
        {/* Subtitle */}
        <div
          style={{
            fontSize: 24,
            color: '#94a3b8',
            marginTop: 20,
            textAlign: 'center',
            maxWidth: '80%',
          }}
        >
          {subtitle}
        </div>
      </div>
    ),
    { ...ogSize }
  );
}
