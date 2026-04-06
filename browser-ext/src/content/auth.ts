/**
 * SkinKeeper Auth Bridge
 * Runs on app.skinkeeper.store — syncs JWT token to extension.
 * Activates automatically when user is logged in, or via ?source=extension param.
 */

async function syncToken() {
  try {
    // Fetch token from our session endpoint
    const res = await fetch('/api/auth/session?include_token=1', { credentials: 'include' });
    if (!res.ok) return;
    const data = await res.json();

    if (!data.authenticated || !data.token) {
      // Not logged in — check if user came from extension
      if (window.location.search.includes('source=extension') || window.location.search.includes('utm_source=extension')) {
        showBanner('Log in to connect your SkinKeeper extension', 'info');
      }
      return;
    }

    // Save token to extension storage
    await chrome.storage.local.set({ sk_token: data.token });
    console.log('[SkinKeeper] Token synced to extension');

    // Show success message if user came from extension
    if (window.location.search.includes('source=extension') || window.location.search.includes('utm_source=extension')) {
      showBanner('Extension connected! You can return to Steam now.', 'success');
    }
  } catch (e) {
    console.warn('[SkinKeeper] Token sync failed:', e);
  }
}

function showBanner(message: string, type: 'success' | 'info') {
  const existing = document.getElementById('sk-auth-banner');
  if (existing) existing.remove();

  const banner = document.createElement('div');
  banner.id = 'sk-auth-banner';
  const bg = type === 'success' ? '#16a34a' : '#6366f1';
  banner.style.cssText = `
    position: fixed; top: 0; left: 0; right: 0; z-index: 99999;
    background: ${bg}; color: #fff; padding: 12px 20px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, sans-serif;
    font-size: 14px; font-weight: 600; text-align: center;
    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    animation: sk-slide-down 0.3s ease-out;
  `;
  banner.textContent = message;

  if (type === 'success') {
    const closeBtn = document.createElement('span');
    closeBtn.textContent = ' ✕';
    closeBtn.style.cssText = 'cursor:pointer;margin-left:12px;opacity:0.7';
    closeBtn.addEventListener('click', () => banner.remove());
    banner.appendChild(closeBtn);
  }

  // Add animation
  if (!document.querySelector('#sk-auth-style')) {
    const style = document.createElement('style');
    style.id = 'sk-auth-style';
    style.textContent = '@keyframes sk-slide-down { from { transform: translateY(-100%); } to { transform: translateY(0); } }';
    document.head.appendChild(style);
  }

  document.body.appendChild(banner);

  // Auto-dismiss success after 5s
  if (type === 'success') {
    setTimeout(() => banner.remove(), 5000);
  }
}

// Run on page load
syncToken();
