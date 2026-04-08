'use client';

import { X, Puzzle, Monitor, ShieldCheck, Store, ArrowLeftRight, RefreshCw } from 'lucide-react';
import { SteamSessionModal } from './steam-session-modal';
import { useState } from 'react';

interface ExtensionRequiredModalProps {
  open: boolean;
  onClose: () => void;
  /** What user tried to do — shown in the subtitle */
  action?: 'sell' | 'trade' | 'general';
}

const ACTION_TEXT: Record<string, string> = {
  sell: 'To list items on the Steam Market',
  trade: 'To send trade offers',
  general: 'To use this feature',
};

export function ExtensionRequiredModal({ open, onClose, action = 'general' }: ExtensionRequiredModalProps) {
  const [showConnect, setShowConnect] = useState(false);

  if (!open) return null;

  // If user chose to connect — delegate to the full SteamSessionModal
  if (showConnect) {
    return (
      <SteamSessionModal
        open
        onClose={() => { setShowConnect(false); onClose(); }}
        onSuccess={() => { setShowConnect(false); onClose(); window.location.reload(); }}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

      <div
        className="relative glass-strong rounded-2xl border border-border/50 w-full max-w-sm overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-muted hover:text-foreground hover:bg-surface-light transition-colors z-10"
        >
          <X size={18} />
        </button>

        {/* Header */}
        <div className="p-6 pb-4 text-center">
          <div className="flex justify-center mb-3">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
              <ShieldCheck size={28} className="text-primary" />
            </div>
          </div>
          <h3 className="text-lg font-bold">Steam Session Required</h3>
          <p className="text-xs text-muted mt-1.5 leading-relaxed">
            {ACTION_TEXT[action]}, SkinKeeper needs access to your Steam session.
            Connect via our <span className="text-foreground font-medium">Browser Extension</span> or{' '}
            <span className="text-foreground font-medium">Desktop App</span>.
          </p>
        </div>

        {/* Feature badges */}
        <div className="flex items-center justify-center gap-3 px-6 pb-4">
          {[
            { icon: <Store size={11} />, label: 'Market' },
            { icon: <ArrowLeftRight size={11} />, label: 'Trading' },
            { icon: <RefreshCw size={11} />, label: 'Live Sync' },
          ].map((f) => (
            <span
              key={f.label}
              className="flex items-center gap-1 text-[10px] text-muted px-2 py-1 rounded-full bg-surface-light/50"
            >
              {f.icon} {f.label}
            </span>
          ))}
        </div>

        {/* Options */}
        <div className="px-6 pb-6 space-y-2.5">
          {/* Browser Extension */}
          <button
            onClick={() => setShowConnect(true)}
            className="w-full flex items-center gap-3.5 p-4 rounded-xl text-left transition-all hover:bg-surface-light/50 group"
            style={{ border: '1.5px solid rgba(99,102,241,0.2)', background: 'rgba(99,102,241,0.04)' }}
          >
            <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors">
              <Puzzle size={20} className="text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">Browser Extension</p>
              <p className="text-[11px] text-muted mt-0.5">Instant connect — free, no warnings</p>
            </div>
            <span className="text-xs font-bold text-primary shrink-0">Connect</span>
          </button>

          {/* Desktop App */}
          <a
            href="/download"
            className="w-full flex items-center gap-3.5 p-4 rounded-xl text-left transition-all hover:bg-surface-light/50 group"
            style={{ border: '1.5px solid rgba(139,92,246,0.2)', background: 'rgba(139,92,246,0.04)' }}
          >
            <div className="w-11 h-11 rounded-xl bg-accent/10 flex items-center justify-center shrink-0 group-hover:bg-accent/20 transition-colors">
              <Monitor size={20} className="text-accent" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">Desktop App</p>
              <p className="text-[11px] text-muted mt-0.5">Full access + storage unit transfers</p>
            </div>
            <span className="text-xs font-bold text-accent shrink-0">Download</span>
          </a>
        </div>

        {/* Footer note */}
        <div className="px-6 pb-5">
          <p className="text-[10px] text-muted/50 text-center leading-relaxed">
            Your password is never accessed. We only read the Steam session cookie to perform actions on your behalf.
          </p>
        </div>
      </div>
    </div>
  );
}
