import { PostHog } from 'posthog-node';
import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

const POSTHOG_API_KEY = 'phc_nr4yi6RxaaFQdxjxoJGNXY3j76SqUdmxrgdSLESuAyR8';
const POSTHOG_HOST = 'https://us.i.posthog.com';

let posthog: PostHog | null = null;
let distinctId: string | null = null;

function getOrCreateDistinctId(): string {
  const configDir = app.getPath('userData');
  const idFile = path.join(configDir, 'analytics-id');

  try {
    const existing = fs.readFileSync(idFile, 'utf-8').trim();
    if (existing) return existing;
  } catch {
    // File doesn't exist yet
  }

  const id = crypto.randomUUID();
  fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(idFile, id, 'utf-8');
  return id;
}

export function initAnalytics(): void {
  distinctId = getOrCreateDistinctId();

  posthog = new PostHog(POSTHOG_API_KEY, {
    host: POSTHOG_HOST,
    flushAt: 1,
    flushInterval: 10000,
  });
}

export function trackEvent(event: string, properties?: Record<string, unknown>): void {
  if (!posthog || !distinctId) return;

  posthog.capture({
    distinctId,
    event,
    properties: {
      sk_platform: 'desktop',
      app_version: app.getVersion(),
      platform: process.platform,
      arch: process.arch,
      electron_version: process.versions.electron,
      ...properties,
    },
  });
}

export async function shutdownAnalytics(): Promise<void> {
  if (!posthog) return;

  try {
    await posthog.shutdown();
  } catch {
    // Best-effort flush on quit
  }
  posthog = null;
}
