'use client';

import { useEffect } from 'react';

export default function LoginSuccessPage() {
  useEffect(() => {
    // Notify opener (login page) that auth succeeded
    try { window.opener?.postMessage({ type: 'sk-login-success' }, '*'); } catch {}

    // Try to close the popup
    window.close();

    // Fallback: if window.close() was blocked (browser security after cross-origin nav),
    // redirect to portfolio. Small delay to let Electron's main process destroy the popup first.
    const timer = setTimeout(() => {
      // Still here? Redirect instead of showing a dead-end page
      window.location.href = '/portfolio';
    }, 1000);
    return () => clearTimeout(timer);
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
          Redirecting...
        </p>
      </div>
    </div>
  );
}
