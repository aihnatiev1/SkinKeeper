'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard,
  Backpack,
  ArrowLeftRight,
  ArrowUpDown,
  BarChart3,
  History,
  Bell,
  Settings,
  Crown,
  ChevronLeft,
  ChevronRight,
  Menu,
  X,
  Package,
  Shuffle,
  Gamepad2,
  Store,
  TrendingUp,
  Eye,
  LogOut,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore, useUIStore } from '@/lib/store';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useIsDesktop, useSteamStatus } from '@/lib/use-desktop';
import { getDesktopAPI } from '@/lib/desktop';
import { api, authApi } from '@/lib/api';

const WEB_NAV_ITEMS = [
  { href: '/portfolio', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/inventory', label: 'Inventory', icon: Backpack },
  { href: '/portfolios', label: 'Portfolios', icon: BarChart3 },
  { href: '/market', label: 'Market', icon: Store },
  { href: '/deals', label: 'Deals', icon: TrendingUp },
  { href: '/watchlist', label: 'Watchlist', icon: Eye },
  { href: '/trades', label: 'Trades', icon: ArrowLeftRight },
  { href: '/transactions', label: 'History', icon: History },
  { href: '/alerts', label: 'Alerts', icon: Bell },
  { href: '/settings', label: 'Settings', icon: Settings },
];

const DESKTOP_NAV_ITEMS = [
  { href: '/overview', label: 'Overview', icon: BarChart3 },
  { href: '/inventory', label: 'Items', icon: Backpack },
  { href: '/market', label: 'Market', icon: Store },
  { href: '/deals', label: 'Deals', icon: TrendingUp },
  { href: '/watchlist', label: 'Watchlist', icon: Eye },
  { href: '/transfer', label: 'Transfer', icon: ArrowUpDown },
  { href: '/trades', label: 'Trades', icon: ArrowLeftRight },
  { href: '/trade-ups', label: 'Trade Up', icon: Shuffle },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const accounts = useAuthStore((s) => s.accounts);
  const { sidebarOpen, mobileOpen, toggleSidebar, setMobileOpen } = useUIStore();
  const desktop = useIsDesktop();
  const { status: steamStatus } = useSteamStatus();
  const [steamConnecting, setSteamConnecting] = useState(false);

  const handleSteamConnect = () => {
    // Navigate to Settings where QR code is shown
    router.push('/settings');
  };

  const handleSteamDisconnect = async () => {
    const api = getDesktopAPI();
    if (!api) return;
    await api.steam.logout();
  };

  const handleLogout = async () => {
    await authApi.clearSession();
    router.push('/login?logout=1');
  };

  // Close mobile sidebar on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname, setMobileOpen]);

  // Close mobile sidebar on escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileOpen(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [setMobileOpen]);

  const navContent = (
    <>
      {/* Logo */}
      <Link href="/" className="flex items-center px-4 h-16 border-b border-border/50 hover:bg-surface-light/50 transition-colors">
        <motion.span
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-lg font-bold whitespace-nowrap text-gradient"
        >
          {(sidebarOpen || mobileOpen) ? 'SkinKeeper' : 'S'}
        </motion.span>
      </Link>

      {/* Navigation */}
      <nav className="flex-1 py-4 px-2 space-y-1">
        {(desktop ? DESKTOP_NAV_ITEMS : WEB_NAV_ITEMS).map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all relative group',
                active
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted hover:text-foreground hover:bg-surface-light'
              )}
            >
              {active && (
                <motion.div
                  layoutId="nav-active"
                  className="absolute left-0 top-1.5 bottom-1.5 w-[3px] bg-primary rounded-full"
                  transition={{ type: 'spring', bounce: 0.2, duration: 0.5 }}
                />
              )}
              <Icon size={20} className={cn('shrink-0 transition-transform', active && 'scale-110')} />
              {(sidebarOpen || mobileOpen) && (
                <motion.span
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-sm font-medium whitespace-nowrap"
                >
                  {label}
                </motion.span>
              )}
              {!sidebarOpen && !mobileOpen && (
                <div className="absolute left-full ml-2 px-2 py-1 bg-surface border border-border rounded-lg text-xs font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 shadow-xl">
                  {label}
                </div>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Sign Out */}
      {(sidebarOpen || mobileOpen) && (
        <div className="px-2 pb-2">
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-2 w-full rounded-xl text-muted hover:text-loss hover:bg-loss/5 transition-all"
          >
            <LogOut size={18} className="shrink-0" />
            <span className="text-sm font-medium">Sign Out</span>
          </button>
        </div>
      )}

      {/* Steam status — desktop only */}
      {desktop && (
        <div className="px-2 pb-2">
          {(sidebarOpen || mobileOpen) ? (
            steamStatus.loggedIn ? (
              /* Connected — show name + disconnect */
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl glass">
                <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
                <span className="text-xs text-muted truncate flex-1">
                  {steamStatus.personaName || user?.display_name || 'Steam Connected'}
                </span>
                <button
                  onClick={handleSteamDisconnect}
                  className="text-[10px] text-muted/60 hover:text-loss transition-colors shrink-0"
                  title="Disconnect Steam"
                >
                  <LogOut size={12} />
                </button>
              </div>
            ) : (
              /* Disconnected — clickable connect button */
              <button
                onClick={handleSteamConnect}
                disabled={steamConnecting}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-xl bg-primary/10 hover:bg-primary/20 border border-primary/20 transition-all group"
              >
                {steamConnecting ? (
                  <Loader2 size={14} className="animate-spin text-primary shrink-0" />
                ) : (
                  <Gamepad2 size={14} className="text-primary shrink-0" />
                )}
                <span className="text-xs font-medium text-primary truncate">
                  {steamConnecting ? 'Opening Steam...' : 'Connect Steam'}
                </span>
              </button>
            )
          ) : (
            /* Collapsed sidebar — icon only */
            steamStatus.loggedIn ? (
              <div className="flex justify-center py-1">
                <span className="relative">
                  <Gamepad2 size={20} className="text-muted" />
                  <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-green-500 border border-surface" />
                </span>
              </div>
            ) : (
              <button
                onClick={handleSteamConnect}
                disabled={steamConnecting}
                className="flex justify-center w-full py-1 group"
                title="Connect Steam"
              >
                <span className="relative">
                  {steamConnecting ? (
                    <Loader2 size={20} className="animate-spin text-primary" />
                  ) : (
                    <Gamepad2 size={20} className="text-muted group-hover:text-primary transition-colors" />
                  )}
                  <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-red-500 border border-surface" />
                </span>
              </button>
            )
          )}
        </div>
      )}

      {/* Session status — web (non-desktop) */}
      {!desktop && (sidebarOpen || mobileOpen) && accounts.length > 0 && (
        <div className="px-4 pb-1 space-y-0.5">
          {accounts.map((acc) => {
            const color =
              acc.sessionStatus === 'valid' ? 'bg-profit'
              : acc.sessionStatus === 'expiring' ? 'bg-warning'
              : acc.sessionStatus === 'expired' ? 'bg-loss'
              : 'bg-muted';
            return (
              <div key={acc.id} className="flex items-center gap-2 text-xs text-muted">
                <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', color)} />
                <span className="truncate">{acc.displayName}</span>
                {acc.sessionStatus === 'expired' && (
                  <Link href="/settings" className="text-loss text-[10px] font-medium hover:underline ml-auto shrink-0">
                    Reauth
                  </Link>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* User card */}
      {user && (sidebarOpen || mobileOpen) && (
        <div className="px-3 pb-3">
          <div className="flex items-center gap-3 p-3 rounded-xl glass">
            {user.avatar_url ? (
              <img
                src={user.avatar_url}
                alt={user.display_name}
                className="w-9 h-9 rounded-full ring-2 ring-primary/20"
              />
            ) : (
              <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary">
                {user.display_name?.[0] || '?'}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{user.display_name}</p>
              {user.is_premium && (
                <span className="inline-flex items-center gap-1 text-xs text-warning font-medium">
                  <Crown size={10} /> PRO
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Collapse toggle — desktop only */}
      <button
        onClick={toggleSidebar}
        className="hidden lg:flex items-center justify-center h-10 border-t border-border/50 text-muted hover:text-foreground hover:bg-surface-light transition-colors"
      >
        {sidebarOpen ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
      </button>
    </>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <motion.aside
        initial={false}
        animate={{ width: sidebarOpen ? 240 : 72 }}
        className="fixed left-0 top-0 bottom-0 z-40 hidden lg:flex flex-col bg-surface/80 backdrop-blur-xl border-r border-border/50"
      >
        {navContent}
      </motion.aside>

      {/* Mobile menu button */}
      <button
        onClick={() => setMobileOpen(true)}
        className="fixed top-3.5 left-4 z-50 lg:hidden p-2 rounded-xl glass text-muted hover:text-foreground transition-colors"
      >
        <Menu size={20} />
      </button>

      {/* Mobile sidebar overlay */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileOpen(false)}
              className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
            />
            <motion.aside
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="fixed left-0 top-0 bottom-0 z-50 w-[280px] max-w-[85vw] flex flex-col bg-surface border-r border-border/50 lg:hidden"
            >
              <button
                onClick={() => setMobileOpen(false)}
                className="absolute top-4 right-4 p-1.5 rounded-lg text-muted hover:text-foreground hover:bg-surface-light transition-colors"
              >
                <X size={18} />
              </button>
              {navContent}
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
