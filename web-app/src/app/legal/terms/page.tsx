import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'SkinKeeper Terms of Service — rules and conditions for using the CS2 inventory management platform.',
  alternates: { canonical: 'https://skinkeeper.store/legal/terms' },
};

export default function TermsPage() {
  return (
    <div className="min-h-screen gradient-mesh">
      <nav className="flex items-center justify-between px-6 lg:px-16 h-16 border-b border-border/50 glass-strong">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="text-lg font-bold text-gradient">SkinKeeper</span>
        </Link>
      </nav>
      <main className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-3xl font-extrabold mb-8">Terms of Service</h1>
        <div className="prose prose-invert prose-sm max-w-none space-y-6 text-muted">
          <p><strong>Last updated:</strong> March 15, 2026</p>

          <h2 className="text-lg font-bold text-foreground mt-8">1. Acceptance of Terms</h2>
          <p>By accessing or using SkinKeeper ("Service"), you agree to be bound by these Terms of Service. If you do not agree, do not use the Service.</p>

          <h2 className="text-lg font-bold text-foreground mt-8">2. Description of Service</h2>
          <p>SkinKeeper is a CS2 (Counter-Strike 2) inventory management platform that provides portfolio tracking, profit/loss analytics, trade management, price alerts, and Steam Market selling capabilities. The Service is available via web, iOS, and Android.</p>

          <h2 className="text-lg font-bold text-foreground mt-8">3. Account & Authentication</h2>
          <p>You authenticate via Steam OpenID. We never store your Steam password. You are responsible for maintaining the security of your Steam account and any linked accounts.</p>

          <h2 className="text-lg font-bold text-foreground mt-8">4. Acceptable Use</h2>
          <p>You agree not to: (a) use the Service for any unlawful purpose; (b) attempt to gain unauthorized access to any part of the Service; (c) use automated means to access the Service beyond normal usage; (d) resell or redistribute the Service.</p>

          <h2 className="text-lg font-bold text-foreground mt-8">5. Subscriptions & Billing</h2>
          <p>The Service offers a free tier and a paid Pro subscription. Subscriptions are managed through Apple App Store or Google Play. Refunds follow the respective store policies.</p>

          <h2 className="text-lg font-bold text-foreground mt-8">6. Intellectual Property</h2>
          <p>All content, features, and functionality of the Service are owned by SkinKeeper. CS2, Counter-Strike, Steam, and related trademarks are property of Valve Corporation. SkinKeeper is not affiliated with Valve.</p>

          <h2 className="text-lg font-bold text-foreground mt-8">7. Disclaimer of Warranties</h2>
          <p>The Service is provided "as is" without warranties of any kind. We do not guarantee the accuracy of pricing data, portfolio valuations, or profit/loss calculations. Market data is sourced from third parties and may be delayed or inaccurate.</p>

          <h2 className="text-lg font-bold text-foreground mt-8">8. Limitation of Liability</h2>
          <p>SkinKeeper shall not be liable for any indirect, incidental, or consequential damages arising from your use of the Service, including but not limited to financial losses from trading decisions.</p>

          <h2 className="text-lg font-bold text-foreground mt-8">9. Changes to Terms</h2>
          <p>We may update these Terms at any time. Continued use of the Service after changes constitutes acceptance of the updated Terms.</p>

          <h2 className="text-lg font-bold text-foreground mt-8">10. Contact</h2>
          <p>For questions about these Terms, contact us at skillar.app@gmail.com.</p>
        </div>
      </main>
    </div>
  );
}
