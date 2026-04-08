// Check for Steam Web API key (scam detection)
// API keys are the #1 CS2 scam — attackers register a key to intercept trade offers

import { sendMessage } from '../shared/dom';

const API_KEY_URL = 'https://steamcommunity.com/dev/apikey';
const STORAGE_KEY = 'sk_apikey_dismissed';
const DISMISS_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours
const CHECK_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes
const KEY_PATTERN = /[0-9A-F]{32}/i;
const BANNER_ID = 'sk-apikey-warning';

async function isDismissedRecently(): Promise<boolean> {
  return new Promise((resolve) => {
    chrome.storage.local.get(STORAGE_KEY, (data) => {
      const ts = data[STORAGE_KEY];
      if (!ts) return resolve(false);
      resolve(Date.now() - ts < DISMISS_DURATION_MS);
    });
  });
}

function dismissBanner() {
  chrome.storage.local.set({ [STORAGE_KEY]: Date.now() });
  const banner = document.getElementById(BANNER_ID);
  if (banner) banner.remove();
}

function extractDomain(html: string): string | null {
  // The Steam API key page shows "Domain Name: <value>" in the key info section
  const domainMatch = html.match(/Domain\s*Name:\s*([^<\n]+)/i);
  if (domainMatch) return domainMatch[1].trim();
  return null;
}

function showWarning(domain: string | null) {
  // Don't double-inject
  if (document.getElementById(BANNER_ID)) return;

  // Inject pulse animation
  const style = document.createElement('style');
  style.textContent = `
    @keyframes sk-apikey-pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.85; }
    }
  `;
  document.head.appendChild(style);

  const banner = document.createElement('div');
  banner.id = BANNER_ID;
  banner.style.cssText = `
    position: fixed; top: 0; left: 0; right: 0; z-index: 999999;
    background: linear-gradient(135deg, #dc2626, #b91c1c);
    color: white; padding: 12px 20px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, sans-serif;
    font-size: 14px; font-weight: 600;
    display: flex; align-items: center; justify-content: space-between;
    box-shadow: 0 4px 20px rgba(220,38,38,0.5);
    animation: sk-apikey-pulse 2s ease-in-out infinite;
  `;

  // Left — warning message
  const left = document.createElement('div');
  left.style.cssText = 'display: flex; align-items: center; gap: 10px; flex: 1; min-width: 0;';
  left.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
      <line x1="12" y1="9" x2="12" y2="13"/>
      <line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>
    <span>WARNING: Steam API Key Detected &mdash; Your account may be compromised. Scammers use API keys to intercept and redirect your trade offers.</span>
  `;

  // Middle — domain info
  const middle = document.createElement('div');
  middle.style.cssText = 'flex-shrink: 0; padding: 0 16px; font-size: 13px; opacity: 0.9;';
  if (domain) {
    middle.textContent = `Registered to: ${domain}`;
  }

  // Right — action buttons
  const right = document.createElement('div');
  right.style.cssText = 'display: flex; align-items: center; gap: 8px; flex-shrink: 0;';

  const btnBase = `
    padding: 6px 14px; border-radius: 6px; font-size: 13px; font-weight: 600;
    cursor: pointer; border: none; font-family: inherit; transition: opacity 0.15s;
  `;

  const revokeBtn = document.createElement('button');
  revokeBtn.textContent = 'Revoke Key';
  revokeBtn.style.cssText = btnBase + 'background: white; color: #dc2626;';
  revokeBtn.addEventListener('mouseenter', () => { revokeBtn.style.opacity = '0.85'; });
  revokeBtn.addEventListener('mouseleave', () => { revokeBtn.style.opacity = '1'; });
  revokeBtn.addEventListener('click', () => {
    window.open(API_KEY_URL, '_blank');
  });

  const dismissBtn = document.createElement('button');
  dismissBtn.textContent = 'Dismiss';
  dismissBtn.style.cssText = btnBase + 'background: rgba(255,255,255,0.15); color: white; border: 1px solid rgba(255,255,255,0.3);';
  dismissBtn.addEventListener('mouseenter', () => { dismissBtn.style.opacity = '0.85'; });
  dismissBtn.addEventListener('mouseleave', () => { dismissBtn.style.opacity = '1'; });
  dismissBtn.addEventListener('click', dismissBanner);

  right.appendChild(revokeBtn);
  right.appendChild(dismissBtn);

  banner.appendChild(left);
  banner.appendChild(middle);
  banner.appendChild(right);

  document.body.appendChild(banner);
}

async function checkApiKey() {
  try {
    // 0. Check if feature is enabled
    const { sk_settings } = await chrome.storage.local.get('sk_settings');
    if (sk_settings?.apiKeyGuard === false) return;

    // 1. Check if dismissed recently
    if (await isDismissedRecently()) return;

    // 2. Fetch the API key page via background FETCH_JSON
    const html = await sendMessage<string | null>({
      type: 'FETCH_JSON',
      url: API_KEY_URL,
    });

    if (!html || typeof html !== 'string') return;

    // 3. Parse for active key
    // If the page contains the registration form, no key exists — safe
    if (html.includes('Register for a Steam Web API Key') || html.includes('registerkey')) {
      // No API key registered — remove any stale banner
      const existing = document.getElementById(BANNER_ID);
      if (existing) existing.remove();
      return;
    }

    // Look for a 32-char hex key in the bodyContents area
    const hasBodyContents = html.includes('bodyContents_ex') || html.includes('bodyContents');
    const keyMatch = html.match(KEY_PATTERN);

    if (hasBodyContents && keyMatch) {
      // API key detected — extract domain and show warning
      const domain = extractDomain(html);
      showWarning(domain);
    }
  } catch (err) {
    console.warn('[SkinKeeper] API key guard check failed:', err);
  }
}

// Run on page load
checkApiKey();

// Re-check every 30 minutes while the page is open
setInterval(checkApiKey, CHECK_INTERVAL_MS);
