// ─── PostHog Analytics (minimal, fetch-based) ────────────────────────
// All events are routed through the background service worker via chrome.runtime.sendMessage.
// The background worker POSTs directly to PostHog's capture API (no SDK needed in MV3).

const POSTHOG_KEY = 'phc_nr4yi6RxaaFQdxjxoJGNXY3j76SqUdmxrgdSLESuAyR8';
const POSTHOG_HOST = 'https://us.i.posthog.com';

/** Send an analytics event via the background service worker. */
export function trackEvent(event: string, properties?: Record<string, any>) {
  chrome.runtime.sendMessage({
    type: 'TRACK_EVENT',
    event,
    properties: properties || {},
  }).catch(() => {
    // Silently ignore — analytics should never break functionality
  });
}

/**
 * Called from the background service worker to actually POST the event to PostHog.
 * Do NOT call this from content scripts or popup — use trackEvent() instead.
 */
export async function postToPostHog(event: string, properties: Record<string, any>) {
  try {
    // Use extension ID as a stable anonymous distinct_id
    const distinctId = chrome.runtime.id;

    await fetch(`${POSTHOG_HOST}/capture/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: POSTHOG_KEY,
        event,
        properties: {
          distinct_id: distinctId,
          sk_platform: 'extension',
          ...properties,
        },
        timestamp: new Date().toISOString(),
      }),
    });
  } catch {
    // Analytics failures are silent
  }
}
