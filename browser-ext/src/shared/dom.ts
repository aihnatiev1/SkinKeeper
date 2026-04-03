/**
 * DOM utilities for injecting SkinKeeper UI into Steam pages.
 */

/** Create an element with classes */
export function el(
  tag: string,
  classes: string | string[] = [],
  attrs: Record<string, string> = {}
): HTMLElement {
  const elem = document.createElement(tag);
  const cls = Array.isArray(classes) ? classes : [classes];
  if (cls.length) elem.classList.add(...cls.filter(Boolean));
  for (const [k, v] of Object.entries(attrs)) elem.setAttribute(k, v);
  return elem;
}

/** Wait for an element to appear in DOM */
export function waitForElement(selector: string, timeout = 10000): Promise<Element | null> {
  return new Promise((resolve) => {
    const existing = document.querySelector(selector);
    if (existing) return resolve(existing);

    const observer = new MutationObserver(() => {
      const found = document.querySelector(selector);
      if (found) { observer.disconnect(); resolve(found); }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => { observer.disconnect(); resolve(null); }, timeout);
  });
}

/**
 * Format price in cents to display string.
 * Uses compact format for item tags, full format with symbol for totals.
 */
export function formatPrice(cents: number, symbol = '$'): string {
  if (!cents) return '';
  const abs = Math.abs(cents);
  const sign = cents < 0 ? '-' : '';
  const val = abs / 100;
  // Compact: skip decimals for round numbers over 10
  if (val >= 10 && val === Math.floor(val)) {
    return `${sign}${symbol}${val.toLocaleString()}`;
  }
  return `${sign}${symbol}${val.toFixed(2)}`;
}

/** Create a SkinKeeper branded badge/button */
export function skBadge(text: string, onClick?: () => void): HTMLElement {
  const badge = el('span', 'sk-badge');
  badge.innerHTML = `<span class="sk-badge-icon">SK</span> ${text}`;
  if (onClick) {
    badge.style.cursor = 'pointer';
    badge.addEventListener('click', onClick);
  }
  return badge;
}

/** Send message to background service worker */
export function sendMessage<T = any>(msg: any): Promise<T> {
  return chrome.runtime.sendMessage(msg);
}
