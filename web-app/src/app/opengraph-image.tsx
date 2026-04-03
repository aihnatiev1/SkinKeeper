import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'SkinKeeper — CS2 Inventory Manager & Portfolio Tracker';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OgImage() {
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
        {/* Grid pattern */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: 'radial-gradient(circle, rgba(139,92,246,0.08) 1px, transparent 1px)',
            backgroundSize: '32px 32px',
          }}
        />
        {/* Glow */}
        <div
          style={{
            position: 'absolute',
            top: '-20%',
            width: '80%',
            height: '60%',
            borderRadius: '50%',
            background: 'radial-gradient(ellipse, rgba(139,92,246,0.2), transparent 70%)',
          }}
        />
        {/* Logo */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            marginBottom: 32,
          }}
        >
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 16,
              background: 'linear-gradient(135deg, #8B5CF6, #06B6D4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              fontSize: 32,
              fontWeight: 800,
            }}
          >
            SK
          </div>
          <span style={{ color: 'white', fontSize: 40, fontWeight: 800 }}>SkinKeeper</span>
        </div>
        {/* Title */}
        <div
          style={{
            fontSize: 56,
            fontWeight: 800,
            color: 'white',
            textAlign: 'center',
            lineHeight: 1.2,
            marginBottom: 16,
          }}
        >
          Track, Trade & Profit
        </div>
        <div
          style={{
            fontSize: 56,
            fontWeight: 800,
            background: 'linear-gradient(135deg, #8B5CF6, #06B6D4)',
            backgroundClip: 'text',
            color: 'transparent',
            textAlign: 'center',
            lineHeight: 1.2,
          }}
        >
          from your CS2 skins
        </div>
        {/* Subtitle */}
        <div
          style={{
            fontSize: 22,
            color: '#94a3b8',
            marginTop: 24,
            textAlign: 'center',
          }}
        >
          Real-time portfolio tracking · P&L analytics · Instant trades · Price alerts
        </div>
        {/* Stats */}
        <div
          style={{
            display: 'flex',
            gap: 48,
            marginTop: 40,
          }}
        >
          {[
            { value: '50K+', label: 'Users' },
            { value: '$2M+', label: 'Tracked' },
            { value: '4.8★', label: 'Rating' },
          ].map((stat) => (
            <div key={stat.label} style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ fontSize: 28, fontWeight: 800, color: '#8B5CF6' }}>{stat.value}</div>
              <div style={{ fontSize: 14, color: '#64748b' }}>{stat.label}</div>
            </div>
          ))}
        </div>
      </div>
    ),
    { ...size }
  );
}
