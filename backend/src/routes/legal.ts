import { Router, Request, Response } from "express";

const router = Router();

router.get("/privacy", (_req: Request, res: Response) => {
  res.type("html").send(privacyPolicyHTML);
});

router.get("/terms", (_req: Request, res: Response) => {
  res.type("html").send(termsOfServiceHTML);
});

export default router;

const privacyPolicyHTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SkinKeeper — Privacy Policy</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; color: #e0e0e0; background: #1a1a2e; line-height: 1.6; }
    h1 { color: #6c5ce7; } h2 { color: #00d2d3; margin-top: 2em; }
    a { color: #6c5ce7; }
    ul { padding-left: 1.5em; }
  </style>
</head>
<body>
  <h1>Privacy Policy</h1>
  <p><strong>Last updated:</strong> March 9, 2026</p>

  <h2>1. Information We Collect</h2>
  <p>SkinKeeper collects the following data to provide its services:</p>
  <ul>
    <li><strong>Steam Account Data:</strong> Steam ID, display name, avatar URL, and inventory data (obtained via Steam Web API with your authorization)</li>
    <li><strong>Session Data:</strong> Encrypted Steam session cookies stored on our servers to enable selling and trading functionality</li>
    <li><strong>Device Tokens:</strong> Firebase Cloud Messaging tokens for push notifications (premium feature)</li>
    <li><strong>Transaction History:</strong> Records of your Steam Market transactions synced from your Steam account</li>
    <li><strong>Purchase Data:</strong> Manual purchase price entries you provide for profit/loss tracking</li>
  </ul>

  <h2>2. How We Use Your Data</h2>
  <ul>
    <li>Display your CS2 inventory with real-time prices from Steam, Skinport, CSFloat, and DMarket</li>
    <li>Execute sell orders and trade offers on Steam Market on your behalf</li>
    <li>Calculate profit/loss on your skin portfolio</li>
    <li>Send price alert notifications (premium subscribers only)</li>
    <li>Generate CSV exports of your transaction history</li>
  </ul>

  <h2>3. Data Storage & Security</h2>
  <p>Steam session cookies are encrypted using AES-256-GCM before storage. All data is stored on secured servers. We do not sell or share your personal data with third parties.</p>

  <h2>4. Third-Party Services</h2>
  <ul>
    <li><strong>Steam Web API:</strong> For inventory, market, and trade data</li>
    <li><strong>Skinport, CSFloat, DMarket APIs:</strong> For cross-market pricing data (no personal data shared)</li>
    <li><strong>Firebase Cloud Messaging:</strong> For push notification delivery</li>
    <li><strong>Apple App Store / Google Play:</strong> For subscription purchase processing</li>
  </ul>

  <h2>5. Data Retention</h2>
  <p>Your data is retained as long as your account is active. You may request deletion of your account and associated data by contacting us.</p>

  <h2>6. Your Rights</h2>
  <p>You have the right to access, correct, or delete your personal data. You can disconnect your Steam session at any time through the app settings.</p>

  <h2>7. Children's Privacy</h2>
  <p>SkinKeeper is not intended for children under 13. We do not knowingly collect data from children.</p>

  <h2>8. Changes</h2>
  <p>We may update this policy. Continued use of the app constitutes acceptance of changes.</p>

  <h2>9. Contact</h2>
  <p>Questions? Contact us at <a href="mailto:support@skinkeeper.app">support@skinkeeper.app</a></p>
</body>
</html>`;

const termsOfServiceHTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SkinKeeper — Terms of Service</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; color: #e0e0e0; background: #1a1a2e; line-height: 1.6; }
    h1 { color: #6c5ce7; } h2 { color: #00d2d3; margin-top: 2em; }
    a { color: #6c5ce7; }
    ul { padding-left: 1.5em; }
  </style>
</head>
<body>
  <h1>Terms of Service</h1>
  <p><strong>Last updated:</strong> March 9, 2026</p>

  <h2>1. Acceptance</h2>
  <p>By using SkinKeeper, you agree to these terms. If you do not agree, do not use the app.</p>

  <h2>2. Service Description</h2>
  <p>SkinKeeper is a tool for tracking CS2 skin inventory values, executing Steam Market transactions, and monitoring prices across multiple marketplaces. We are not affiliated with Valve Corporation, Skinport, CSFloat, or DMarket.</p>

  <h2>3. Steam Account Access</h2>
  <p>You authorize SkinKeeper to access your Steam account data through the Steam Web API. You are responsible for maintaining the security of your Steam credentials. SkinKeeper stores session data encrypted but cannot guarantee against all security risks.</p>

  <h2>4. Premium Subscriptions</h2>
  <ul>
    <li>Premium features require an active subscription ($4.99/month or $29.99/year)</li>
    <li>Subscriptions auto-renew unless canceled at least 24 hours before the renewal date</li>
    <li>Manage subscriptions through App Store / Google Play settings</li>
    <li>No refunds for partial subscription periods</li>
  </ul>

  <h2>5. Pricing Data</h2>
  <p>Prices are fetched from third-party sources (Steam, Skinport, CSFloat, DMarket) and may be delayed or inaccurate. SkinKeeper does not guarantee pricing accuracy and is not responsible for financial decisions based on displayed prices.</p>

  <h2>6. Market Transactions</h2>
  <p>Sell and trade operations are executed through Steam's unofficial APIs. SkinKeeper is not responsible for failed transactions, Steam account restrictions, or financial losses resulting from market operations.</p>

  <h2>7. Limitation of Liability</h2>
  <p>SkinKeeper is provided "as is" without warranties. We are not liable for any damages arising from the use of this service, including but not limited to financial losses from trading decisions.</p>

  <h2>8. Termination</h2>
  <p>We reserve the right to terminate or suspend access to the service at any time, without notice, for conduct that violates these terms.</p>

  <h2>9. Changes</h2>
  <p>We may modify these terms at any time. Continued use constitutes acceptance.</p>

  <h2>10. Contact</h2>
  <p>Questions? Contact us at <a href="mailto:support@skinkeeper.app">support@skinkeeper.app</a></p>
</body>
</html>`;
