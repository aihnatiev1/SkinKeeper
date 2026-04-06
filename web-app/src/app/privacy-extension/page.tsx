import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Browser Extension Privacy Policy — SkinKeeper',
  description: 'Privacy policy for the SkinKeeper CS2 browser extension for Chrome.',
  alternates: { canonical: 'https://skinkeeper.store/privacy-extension' },
};

export default function ExtensionPrivacyPage() {
  return (
    <div className="min-h-screen gradient-mesh">
      <nav className="flex items-center justify-between px-6 lg:px-16 h-16 border-b border-border/50 glass-strong">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center text-white font-bold text-sm">SK</div>
          <span className="text-lg font-bold">SkinKeeper</span>
        </Link>
      </nav>
      <main className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-3xl font-extrabold mb-8">Browser Extension Privacy Policy</h1>
        <div className="prose prose-invert prose-sm max-w-none space-y-6 text-muted">
          <p><strong>Last updated:</strong> April 6, 2026</p>
          <p>This privacy policy applies to the SkinKeeper browser extension for Chrome (&quot;the Extension&quot;).</p>

          <h2 className="text-lg font-bold text-foreground mt-8">1. Data We Collect</h2>
          <p><strong>No personal data is collected by default.</strong> The Extension works without an account and does not require login.</p>
          <p><strong>Steam page data:</strong> The Extension reads publicly visible information from Steam Community pages you visit (inventory items, market listings, prices, float values). This data is processed locally in your browser and is not sent to our servers.</p>
          <p><strong>Price data from CDN:</strong> The Extension downloads a community price database from prices.csgotrader.app (a public, free CDN). No personal data is sent in this request.</p>
          <p><strong>Optional account features:</strong> If you choose to sign in with a SkinKeeper account, a JWT token is stored in chrome.storage.local to authenticate API requests for enriched data (Buff/CSFloat prices, P/L tracking, price alerts).</p>
          <p><strong>Analytics:</strong> We collect anonymous usage events (e.g. &quot;inventory loaded&quot;, &quot;extension installed&quot;) via PostHog to improve the product. No personally identifiable information is included.</p>

          <h2 className="text-lg font-bold text-foreground mt-8">2. Data We Do NOT Collect</h2>
          <ul className="list-disc pl-6 space-y-1">
            <li>Steam passwords or credentials</li>
            <li>Payment or financial information</li>
            <li>Browsing history outside of Steam</li>
            <li>Keystrokes, form inputs, or personal messages</li>
            <li>Data from non-Steam websites (except skinkeeper.store for optional login)</li>
          </ul>

          <h2 className="text-lg font-bold text-foreground mt-8">3. Permissions Explained</h2>
          <ul className="list-disc pl-6 space-y-2">
            <li><strong>steamcommunity.com:</strong> Read and enhance inventory, market, trade offer, and profile pages with prices, float values, and action buttons.</li>
            <li><strong>storage:</strong> Save user preferences (display settings, NSFW mode) and cached price data locally in your browser.</li>
            <li><strong>alarms:</strong> Schedule periodic tasks: flush collected data, monitor friend requests, notify when trade-locked items become tradable.</li>
            <li><strong>notifications:</strong> Show a browser notification when a bookmarked item becomes tradable. User must explicitly bookmark an item to opt in.</li>
            <li><strong>api.skinkeeper.store:</strong> Fetch enriched item data (multi-source prices, P/L) for users who optionally sign in.</li>
            <li><strong>prices.csgotrader.app:</strong> Download the community price database (one request for all CS2 items).</li>
            <li><strong>steamrep.com:</strong> Check if a Steam profile is flagged as a scammer.</li>
          </ul>

          <h2 className="text-lg font-bold text-foreground mt-8">4. Data Storage</h2>
          <p>All data is stored locally in your browser via chrome.storage.local. We do not maintain server-side databases of Extension user data. If you sign in, your JWT token is stored locally and sent only to api.skinkeeper.store for authentication.</p>

          <h2 className="text-lg font-bold text-foreground mt-8">5. Third-Party Services</h2>
          <ul className="list-disc pl-6 space-y-1">
            <li><strong>PostHog:</strong> Anonymous product analytics. <a href="https://posthog.com/privacy" className="text-primary hover:underline">PostHog Privacy Policy</a></li>
            <li><strong>CSGO Trader CDN:</strong> Public price data. No personal data shared.</li>
            <li><strong>SteamRep:</strong> Public scammer database. Only Steam ID is sent.</li>
          </ul>

          <h2 className="text-lg font-bold text-foreground mt-8">6. Data Sharing</h2>
          <p>We do not sell, rent, or share your data with third parties. Anonymous analytics data is processed by PostHog under their privacy policy.</p>

          <h2 className="text-lg font-bold text-foreground mt-8">7. Your Rights</h2>
          <p>You can uninstall the Extension at any time to stop all data processing. To clear stored data, go to chrome://extensions, find SkinKeeper, and click &quot;Clear data&quot;. If you have a SkinKeeper account, you can request data deletion at support@skinkeeper.store.</p>

          <h2 className="text-lg font-bold text-foreground mt-8">8. Contact</h2>
          <p>For questions about this policy, email <a href="mailto:support@skinkeeper.store" className="text-primary hover:underline">support@skinkeeper.store</a>.</p>
        </div>
      </main>
    </div>
  );
}
