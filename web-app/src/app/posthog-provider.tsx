'use client';

import posthog from 'posthog-js';
import { PostHogProvider as PHProvider, usePostHog } from 'posthog-js/react';
import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense, useEffect } from 'react';

if (typeof window !== 'undefined') {
  posthog.init('phc_Aq5w2n4aGfQELBG7sj8gxb45jPkdofXBPWouAUJzZNy6', {
    api_host: '/ingest',
    ui_host: 'https://us.posthog.com',
    capture_pageview: false, // We capture manually below for SPA navigation
    capture_pageleave: true,
  });
  posthog.register({ sk_platform: 'web' });
}

function PostHogPageView() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const ph = usePostHog();

  useEffect(() => {
    if (pathname && ph) {
      let url = window.origin + pathname;
      if (searchParams.toString()) {
        url += '?' + searchParams.toString();
      }
      ph.capture('$pageview', { $current_url: url });
    }
  }, [pathname, searchParams, ph]);

  return null;
}

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  return (
    <PHProvider client={posthog}>
      <Suspense fallback={null}>
        <PostHogPageView />
      </Suspense>
      {children}
    </PHProvider>
  );
}
