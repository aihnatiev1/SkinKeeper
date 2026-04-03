import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'SkinKeeper Privacy Policy — how we collect, use, and protect your data on our CS2 inventory management platform.',
  alternates: { canonical: 'https://skinkeeper.store/legal/privacy' },
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen gradient-mesh">
      <nav className="flex items-center justify-between px-6 lg:px-16 h-16 border-b border-border/50 glass-strong">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center text-white font-bold text-sm">SK</div>
          <span className="text-lg font-bold">SkinKeeper</span>
        </Link>
      </nav>
      <main className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-3xl font-extrabold mb-8">Privacy Policy</h1>
        <div className="prose prose-invert prose-sm max-w-none space-y-6 text-muted">
          <p><strong>Last updated:</strong> March 15, 2026</p>

          <h2 className="text-lg font-bold text-foreground mt-8">1. Information We Collect</h2>
          <p><strong>From Steam OpenID:</strong> Your Steam ID, display name, and avatar URL. We never receive or store your Steam password.</p>
          <p><strong>Inventory Data:</strong> Your CS2 inventory items, including names, icons, float values, and stickers, fetched from Steam API.</p>
          <p><strong>Transaction Data:</strong> Steam Market purchase and sale history, synced at your request.</p>
          <p><strong>Device Information:</strong> Device type, OS version, and app version for analytics and support.</p>

          <h2 className="text-lg font-bold text-foreground mt-8">2. How We Use Your Data</h2>
          <p>We use your data to: (a) display your inventory and portfolio; (b) calculate profit/loss analytics; (c) send price alerts you configure; (d) facilitate trades and Steam Market listings; (e) improve the Service.</p>

          <h2 className="text-lg font-bold text-foreground mt-8">3. Data Storage & Security</h2>
          <p>Data is stored on encrypted servers in the EU. Session tokens and sensitive data are encrypted at rest. We use HTTPS for all communications. Steam session cookies are encrypted with AES-256.</p>

          <h2 className="text-lg font-bold text-foreground mt-8">4. Third-Party Services</h2>
          <p>We use: (a) <strong>Steam API</strong> for inventory and market data; (b) <strong>Skinport, CSFloat</strong> for price comparison; (c) <strong>Firebase Cloud Messaging</strong> for push notifications; (d) <strong>Firebase Analytics</strong> for usage analytics.</p>

          <h2 className="text-lg font-bold text-foreground mt-8">5. Data Sharing</h2>
          <p>We do not sell your personal data. We share data only with: (a) service providers necessary to operate the platform; (b) law enforcement when required by law.</p>

          <h2 className="text-lg font-bold text-foreground mt-8">6. Your Rights</h2>
          <p>You can: (a) access your data through the app; (b) request data export; (c) request account deletion by contacting support@skinkeeper.store; (d) opt out of push notifications in app settings.</p>

          <h2 className="text-lg font-bold text-foreground mt-8">7. Cookies</h2>
          <p>We use essential cookies for authentication (session tokens). No tracking cookies are used on the marketing website.</p>

          <h2 className="text-lg font-bold text-foreground mt-8">8. Data Retention</h2>
          <p>We retain your data as long as your account is active. Portfolio history and transaction data are kept for analytics purposes. You may request deletion at any time.</p>

          <h2 className="text-lg font-bold text-foreground mt-8">9. Children</h2>
          <p>The Service is not intended for users under 13 years of age. We do not knowingly collect data from children.</p>

          <h2 className="text-lg font-bold text-foreground mt-8">10. Changes to This Policy</h2>
          <p>We may update this Privacy Policy at any time. Changes will be posted on this page with an updated date.</p>

          <h2 className="text-lg font-bold text-foreground mt-8">11. Contact</h2>
          <p>For privacy-related questions, contact us at support@skinkeeper.store.</p>
        </div>
      </main>
    </div>
  );
}
