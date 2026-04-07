/**
 * Price collector — injects the fetch/XHR interceptor into the page context
 * and forwards intercepted price data to the background service worker.
 *
 * Call initCollector() from any content script running on steamcommunity.com.
 * It injects inject.js (which monkey-patches fetch/XHR in the page context),
 * then listens for CustomEvents and batches them to background via SUBMIT_PRICES.
 */

import { sendMessage } from './dom';

let initialized = false;

export function initCollector() {
  if (initialized) return;
  initialized = true;

  // Inject the page-context script that intercepts fetch/XHR
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('inject.js');
  script.onload = () => script.remove();
  (document.head || document.documentElement).appendChild(script);

  // Listen for intercepted price data from inject.js
  window.addEventListener('sk_price_intercepted', ((event: CustomEvent) => {
    const { prices } = event.detail;
    if (!prices || !Array.isArray(prices) || prices.length === 0) return;

    // Forward to background for batching
    sendMessage({
      type: 'SUBMIT_PRICES',
      batch: {
        items: prices,
        collector_id: '',  // background fills this
        page: location.pathname,
      },
    });
  }) as EventListener);
}
