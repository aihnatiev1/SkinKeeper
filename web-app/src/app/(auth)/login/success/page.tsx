'use client';

import { useEffect } from 'react';

export default function LoginSuccessPage() {
  useEffect(() => {
    // Same-origin as opener, so window.close() works
    window.close();
  }, []);

  return (
    <div style={{
      background: '#0a0e1a',
      color: 'white',
      fontFamily: 'system-ui',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100vh',
      margin: 0,
    }}>
      <div style={{ textAlign: 'center' }}>
        <h2 style={{ fontSize: '28px' }}>&#x2705;</h2>
        <h2>Login successful!</h2>
        <p style={{ color: '#999', marginTop: '12px' }}>
          This window will close automatically...
        </p>
      </div>
    </div>
  );
}
