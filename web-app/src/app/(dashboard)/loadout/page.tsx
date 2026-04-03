'use client';

import { useEffect } from 'react';
import { Gamepad2 } from 'lucide-react';
import { useIsDesktop, useSteamStatus } from '@/lib/use-desktop';
import { useRouter } from 'next/navigation';

export default function LoadoutPage() {
  const router = useRouter();
  const desktop = useIsDesktop();
  const { status } = useSteamStatus();

  useEffect(() => {
    if (typeof window !== 'undefined' && !desktop) {
      router.replace('/portfolio');
    }
  }, [desktop, router]);

  if (!desktop) return null;

  if (!status.loggedIn) {
    return (
      <div className="p-6">
        <div className="glass rounded-2xl p-12 text-center">
          <Gamepad2 size={48} className="mx-auto mb-4 text-muted" />
          <h2 className="text-xl font-bold mb-2">Steam Connection Required</h2>
          <p className="text-muted">Connect to Steam in Settings to manage your loadout.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Loadout Manager</h1>
        <p className="text-muted text-sm mt-1">
          Equip and manage your CS2 loadout without launching the game.
        </p>
      </div>

      {/* T side */}
      <div className="glass rounded-2xl p-6">
        <h3 className="text-sm font-semibold text-muted mb-4 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-yellow-500" />
          Terrorist
        </h3>
        <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-7 gap-3">
          {['Pistol', 'SMG', 'Rifle', 'Heavy', 'Knife', 'Gloves', 'Agent'].map((category) => (
            <div
              key={`t-${category}`}
              className="aspect-square rounded-xl border border-dashed border-border/50 flex flex-col items-center justify-center bg-surface-light/50 hover:border-primary/30 transition-colors cursor-pointer p-2"
            >
              <Gamepad2 size={20} className="text-muted/30 mb-1" />
              <span className="text-[10px] text-muted">{category}</span>
            </div>
          ))}
        </div>
      </div>

      {/* CT side */}
      <div className="glass rounded-2xl p-6">
        <h3 className="text-sm font-semibold text-muted mb-4 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-blue-500" />
          Counter-Terrorist
        </h3>
        <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-7 gap-3">
          {['Pistol', 'SMG', 'Rifle', 'Heavy', 'Knife', 'Gloves', 'Agent'].map((category) => (
            <div
              key={`ct-${category}`}
              className="aspect-square rounded-xl border border-dashed border-border/50 flex flex-col items-center justify-center bg-surface-light/50 hover:border-primary/30 transition-colors cursor-pointer p-2"
            >
              <Gamepad2 size={20} className="text-muted/30 mb-1" />
              <span className="text-[10px] text-muted">{category}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
