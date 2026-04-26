import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../core/theme.dart';
import '../features/automation/widgets/cancel_window_modal.dart';
import '../l10n/app_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

class AppShell extends ConsumerWidget {
  final Widget child;

  const AppShell({super.key, required this.child});

  int _currentIndex(BuildContext context) {
    final location = GoRouterState.of(context).matchedLocation;
    if (location.startsWith('/portfolio')) return 0;
    if (location.startsWith('/inventory')) return 1;
    if (location.startsWith('/trades')) return 2;
    if (location.startsWith('/transactions')) return 3;
    if (location.startsWith('/settings')) return 4;
    return 0;
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final idx = _currentIndex(context);
    final l10n = AppLocalizations.of(context);

    return Scaffold(
      // CancelWindowMounter listens for pending auto-sell executions and
      // pops the cancel modal anywhere in the shell. Mounted once here so
      // it survives navigation between tabs.
      body: CancelWindowMounter(child: child),
      extendBody: true,
      bottomNavigationBar: RepaintBoundary(
        child: ClipRect(
          child: BackdropFilter(
            filter: ImageFilter.blur(sigmaX: 30, sigmaY: 30),
            child: Container(
            decoration: BoxDecoration(
              color: AppTheme.bg.withValues(alpha: 0.88),
              border: Border(
                top: BorderSide(
                  color: Colors.white.withValues(alpha: 0.06),
                ),
              ),
            ),
            child: SafeArea(
              top: false,
              child: Padding(
                padding: const EdgeInsets.symmetric(
                  horizontal: AppTheme.s8,
                  vertical: AppTheme.s6,
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceAround,
                  children: [
                    _NavItem(
                      icon: Icons.pie_chart_outline_rounded,
                      activeIcon: Icons.pie_chart_rounded,
                      label: l10n.tabPortfolio,
                      isActive: idx == 0,
                      onTap: () => _navigate(context, 0),
                    ),
                    _NavItem(
                      icon: Icons.grid_view_rounded,
                      activeIcon: Icons.grid_view_rounded,
                      label: l10n.tabInventory,
                      isActive: idx == 1,
                      onTap: () => _navigate(context, 1),
                    ),
                    _NavItem(
                      icon: Icons.swap_horiz_rounded,
                      activeIcon: Icons.swap_horiz_rounded,
                      label: l10n.tabTrades,
                      isActive: idx == 2,
                      onTap: () => _navigate(context, 2),
                    ),
                    _NavItem(
                      icon: Icons.receipt_long_outlined,
                      activeIcon: Icons.receipt_long_rounded,
                      label: l10n.tabHistory,
                      isActive: idx == 3,
                      onTap: () => _navigate(context, 3),
                    ),
                    _NavItem(
                      icon: Icons.settings_outlined,
                      activeIcon: Icons.settings_rounded,
                      label: l10n.tabSettings,
                      isActive: idx == 4,
                      onTap: () => _navigate(context, 4),
                    ),
                  ],
                ),
              ),
            ),
          ),
          ),
        ),
      ),
    );
  }

  void _navigate(BuildContext context, int index) {
    HapticFeedback.selectionClick();
    const routes = [
      '/portfolio',
      '/inventory',
      '/trades',
      '/transactions',
      '/settings',
    ];
    context.go(routes[index]);
  }
}

class _NavItem extends StatelessWidget {
  final IconData icon;
  final IconData activeIcon;
  final String label;
  final bool isActive;
  final VoidCallback onTap;

  const _NavItem({
    required this.icon,
    required this.activeIcon,
    required this.label,
    required this.isActive,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        curve: Curves.easeOutCubic,
        padding: const EdgeInsets.symmetric(
          horizontal: AppTheme.s16,
          vertical: AppTheme.s8,
        ),
        decoration: isActive
            ? BoxDecoration(
                color: AppTheme.primary.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(AppTheme.r12),
              )
            : null,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            AnimatedSwitcher(
              duration: const Duration(milliseconds: 200),
              child: Icon(
                isActive ? activeIcon : icon,
                key: ValueKey(isActive),
                size: 22,
                color: isActive ? AppTheme.primary : AppTheme.textDisabled,
              ),
            ),
            const SizedBox(height: 2),
            Text(
              label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                fontSize: 10,
                fontWeight: isActive ? FontWeight.w600 : FontWeight.w400,
                color: isActive ? AppTheme.primary : AppTheme.textDisabled,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
