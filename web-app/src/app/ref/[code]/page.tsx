import { Metadata } from 'next';
import Link from 'next/link';

interface Props {
  params: Promise<{ code: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code } = await params;
  return {
    title: 'Join SkinKeeper — CS2 Skin Tracker',
    description: 'Your friend invited you to SkinKeeper. Track your CS2 portfolio, sell on Steam Market, and analyze profit & loss.',
    openGraph: {
      title: 'Join SkinKeeper — CS2 Skin Tracker',
      description: 'Track, trade & profit from your CS2 skins. Join with referral code.',
      url: `https://skinkeeper.store/ref/${code}`,
    },
  };
}

export default async function ReferralPage({ params }: Props) {
  const { code } = await params;

  // Deep link URIs for iOS/Android
  const appDeepLink = `skinkeeper://ref?code=${code}`;
  const iosStoreLink = 'https://apps.apple.com/app/skinkeeper/id0000000000'; // TODO: replace with real ID
  const androidStoreLink = 'https://play.google.com/store/apps/details?id=app.skinkeeper.store';

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
      <div className="w-16 h-16 rounded-2xl bg-primary flex items-center justify-center text-white font-bold text-2xl mb-6">
        SK
      </div>
      <h1 className="text-3xl font-bold mb-3">
        You&apos;ve been invited to SkinKeeper
      </h1>
      <p className="text-muted text-lg mb-8 max-w-md">
        Track your CS2 skin portfolio, sell on Steam Market from your phone,
        and analyze your profit & loss.
      </p>

      {/* Try to open the app first, fallback to store */}
      <a
        href={appDeepLink}
        className="w-full max-w-xs px-6 py-3 bg-primary hover:bg-primary-hover text-white rounded-xl text-lg font-semibold transition-colors mb-4 block"
      >
        Open in SkinKeeper
      </a>

      <div className="flex gap-4">
        <Link
          href={iosStoreLink}
          className="px-5 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm font-medium transition-colors"
        >
          App Store
        </Link>
        <Link
          href={androidStoreLink}
          className="px-5 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm font-medium transition-colors"
        >
          Google Play
        </Link>
      </div>

      <p className="text-muted/50 text-xs mt-12">
        Referral code: {code}
      </p>
    </div>
  );
}
