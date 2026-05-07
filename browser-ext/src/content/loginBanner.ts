export {};

/**
 * SkinKeeper Login Banner
 * Runs on steamcommunity.com/login*. When the user arrives via the
 * AutoConnectBanner on skinkeeper.store (URL carries `?sk_connect=<origin>`)
 * we paint a branded explainer banner so they understand why we sent them
 * here. After they sign in, the cookie watcher in the background auto-saves
 * the session and broadcasts back to all SkinKeeper tabs — they can close
 * this Steam tab whenever and the dashboard will already be live.
 */

const BANNER_ID = 'sk-login-banner';
const RETURN_KEY = 'sk_login_return_origin';

function showBanner() {
  if (document.getElementById(BANNER_ID)) return;

  const banner = document.createElement('div');
  banner.id = BANNER_ID;
  banner.style.cssText = `
    position: fixed; top: 0; left: 0; right: 0; z-index: 999999;
    background: linear-gradient(135deg, #6366f1, #4f46e5);
    color: #fff; padding: 12px 20px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, sans-serif;
    font-size: 14px; font-weight: 600;
    display: flex; align-items: center; gap: 12px; justify-content: center;
    box-shadow: 0 2px 12px rgba(0,0,0,0.4);
  `;

  const inner = document.createElement('div');
  inner.style.cssText = 'display:flex;align-items:center;gap:10px;max-width:900px;line-height:1.4;';
  inner.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 256 259" fill="currentColor" style="flex-shrink:0;">
      <path d="M127.779 0C57.865 0 .947 54.087.017 123.057l68.641 28.359a35.899 35.899 0 0 1 20.42-6.348l30.63-44.399v-.623c0-27.705 22.53-50.243 50.237-50.243 27.724 0 50.254 22.538 50.254 50.271 0 27.724-22.53 50.254-50.254 50.254h-1.16l-43.688 31.193c0 .402.017.804.017 1.188 0 20.793-16.89 37.7-37.7 37.7-18.419 0-33.868-13.27-37.134-30.773L1.932 163.86C17.28 218.24 67.826 258.384 127.779 258.384c70.693 0 128.034-57.333 128.034-128.026v-.166C255.813 57.35 198.472 0 127.779 0"/>
    </svg>
    <span><strong>SkinKeeper:</strong> sign in to Steam below to connect your account. The window will reconnect automatically — you can close this tab when done.</span>
  `;

  const close = document.createElement('button');
  close.textContent = '✕';
  close.style.cssText = `
    background: rgba(255,255,255,0.15); color:#fff; border:none;
    width:24px;height:24px;border-radius:6px;cursor:pointer;
    font-size:14px;font-weight:700;line-height:1;
    margin-left:auto;flex-shrink:0;
  `;
  close.addEventListener('click', () => {
    banner.remove();
    document.body.style.paddingTop = '';
    sessionStorage.removeItem(RETURN_KEY);
  });

  banner.appendChild(inner);
  banner.appendChild(close);
  document.body.appendChild(banner);

  // Push Steam UI down so the banner doesn't cover the login form.
  document.body.style.paddingTop = '52px';
}

function shouldRunOnce(): boolean {
  // Two trigger paths:
  //   1. Direct nav from skinkeeper.store with `?sk_connect=<origin>` —
  //      stash the return origin and render.
  //   2. Subsequent navigations within Steam (login form posts/redirects
  //      may strip the param) — re-render based on the stashed flag.
  try {
    const url = new URL(window.location.href);
    const param = url.searchParams.get('sk_connect');
    if (param) {
      sessionStorage.setItem(RETURN_KEY, param || '1');
      return true;
    }
    return !!sessionStorage.getItem(RETURN_KEY);
  } catch {
    return false;
  }
}

function init() {
  if (!shouldRunOnce()) return;
  if (document.body) {
    showBanner();
  } else {
    document.addEventListener('DOMContentLoaded', showBanner, { once: true });
  }
}

init();
