import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/analytics_service.dart';
import '../../core/theme.dart';
import 'iap_service.dart';
import 'paywall_screen_parts.dart';

/// P6 paywall rewrite — outcome-led: hero "Sell at the peak" + 3 value props
/// as the main content. The legacy feature matrix is demoted under a
/// disclosure ("Compare all features"). Subscription disclosure lives ABOVE
/// the purchase CTA per App Store 3.1.2 guidance.
class PaywallScreen extends ConsumerStatefulWidget {
  const PaywallScreen({super.key, this.source});

  /// Where the user came from. Threaded by the `/premium` route from
  /// `GoRouterState.extra`. Defaults to [PaywallSource.deepLink] when
  /// missing (cold-start of the route, push-notification deep links, etc).
  final PaywallSource? source;

  @override
  ConsumerState<PaywallScreen> createState() => _PaywallScreenState();
}

class _PaywallScreenState extends ConsumerState<PaywallScreen> {
  bool _selectedYearly = true; // Yearly is the default — best value.
  bool _purchasing = false;
  bool _loadingProducts = true;

  @override
  void initState() {
    super.initState();
    Analytics.paywallViewed(source: widget.source);
    _loadProducts();
  }

  Future<void> _loadProducts() async {
    final iap = ref.read(iapServiceProvider);
    if (iap.products.isEmpty) {
      await iap.loadProducts();
    }
    if (mounted) setState(() => _loadingProducts = false);
  }

  @override
  Widget build(BuildContext context) {
    final isPremium = ref.watch(premiumProvider).valueOrNull ?? false;
    final reduceMotion = MediaQuery.of(context).disableAnimations;

    return Scaffold(
      backgroundColor: AppTheme.bg,
      body: SafeArea(
        child: Column(
          children: [
            PaywallHeader(
              onClose: () {
                Analytics.paywallDismissed(reason: 'close_button');
                Navigator.of(context).pop();
              },
            ),
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(20),
                child: Column(
                  children: [
                    if (isPremium) ...[
                      const PaywallActiveBadge(),
                      const SizedBox(height: 24),
                    ],

                    // Hero — "Sell at the peak." + animated chart.
                    const PaywallHero(),
                    const SizedBox(height: 28),

                    // Primary content: 3 value-prop cards.
                    if (reduceMotion)
                      const PaywallValueProps()
                    else
                      const PaywallValueProps()
                          .animate()
                          .fadeIn(duration: 400.ms, delay: 200.ms)
                          .slideY(begin: 0.05, end: 0),
                    const SizedBox(height: 20),

                    // Demoted feature matrix — disclosure-gated.
                    const PaywallMatrixDisclosure(),
                    const SizedBox(height: 24),

                    if (!isPremium) ...[
                      if (_loadingProducts)
                        const Padding(
                          padding: EdgeInsets.symmetric(vertical: 24),
                          child: CircularProgressIndicator(
                            color: AppTheme.primary,
                          ),
                        )
                      else ...[
                        // Plan selector (yearly highlighted as best value).
                        if (reduceMotion)
                          _buildPlanSelector()
                        else
                          _buildPlanSelector()
                              .animate()
                              .fadeIn(duration: 400.ms, delay: 300.ms)
                              .slideY(begin: 0.05, end: 0),
                        const SizedBox(height: 16),

                        // App Store 3.1.2: subscription disclosure ABOVE the
                        // purchase CTA. Don't move below or hide behind a
                        // disclosure — that's a known rejection trigger.
                        const PaywallLegalFooter(),
                        const SizedBox(height: 16),

                        // Purchase button.
                        if (reduceMotion)
                          _buildPurchaseButton()
                        else
                          _buildPurchaseButton()
                              .animate()
                              .fadeIn(duration: 400.ms, delay: 400.ms),
                        const SizedBox(height: 12),

                        // Restore.
                        TextButton(
                          onPressed: _purchasing ? null : _restore,
                          child: const Text(
                            'Restore Purchases',
                            style: TextStyle(
                              fontSize: 13,
                              color: AppTheme.textSecondary,
                            ),
                          ),
                        ),
                      ],
                    ],
                    const SizedBox(height: 80),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildPlanSelector() {
    final iap = ref.read(iapServiceProvider);
    final monthly = iap.monthlyProduct;
    final yearly = iap.yearlyProduct;
    // Backlog #16: derive the savings % from live store prices instead of
    // hardcoding "40%". Apple/Google apply regional pricing, so a fixed
    // claim can be inaccurate in some markets and Apple review can flag
    // it as misleading. When the value can't be computed (products not
    // loaded yet, currency mismatch, etc.) we fall back to "BEST VALUE"
    // with no percent rather than risk a false claim.
    // TODO(l10n): the surrounding "BEST VALUE — Save N%" copy is still
    // hardcoded English; localise the substring once paywall l10n lands.
    final savingsPercent = ref.watch(yearlySavingsPercentProvider);
    final yearlyBadge = savingsPercent != null
        ? 'BEST VALUE — Save $savingsPercent%'
        : 'BEST VALUE';

    // IntrinsicHeight + CrossAxisAlignment.stretch keeps both plan cards
    // the same height even when the yearly card carries a "BEST VALUE"
    // badge that would otherwise make it taller than the monthly card.
    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Expanded(
            child: _PlanCard(
              title: 'Monthly',
              price: monthly?.price ?? '\$4.99',
              subtitle: 'per month',
              isSelected: !_selectedYearly,
              highlightAccent: AppTheme.primary,
              onTap: () {
                HapticFeedback.selectionClick();
                setState(() => _selectedYearly = false);
              },
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: _PlanCard(
              title: 'Yearly',
              price: yearly?.price ?? '\$34.99',
              subtitle: '7-day free trial',
              badge: yearlyBadge,
              badgeColor: AppTheme.warning,
              isSelected: _selectedYearly,
              highlightAccent: AppTheme.warning,
              onTap: () {
                HapticFeedback.selectionClick();
                setState(() => _selectedYearly = true);
              },
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildPurchaseButton() {
    final yearlyPrice = ref.read(iapServiceProvider).yearlyProduct?.price;
    final monthlyPrice = ref.read(iapServiceProvider).monthlyProduct?.price;
    return SizedBox(
      width: double.infinity,
      height: 52,
      child: Container(
        decoration: BoxDecoration(
          gradient: _selectedYearly
              ? const LinearGradient(
                  colors: [AppTheme.warning, AppTheme.warningLight],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                )
              : AppTheme.primaryGradient,
          borderRadius: BorderRadius.circular(AppTheme.r16),
          boxShadow: _selectedYearly
              ? [
                  BoxShadow(
                    color: AppTheme.warning.withValues(alpha: 0.4),
                    blurRadius: 20,
                    spreadRadius: -4,
                    offset: const Offset(0, 6),
                  ),
                ]
              : null,
        ),
        child: ElevatedButton(
          onPressed: _purchasing ? null : _purchase,
          style: ElevatedButton.styleFrom(
            backgroundColor: Colors.transparent,
            shadowColor: Colors.transparent,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(AppTheme.r16),
            ),
          ),
          child: _purchasing
              ? const SizedBox(
                  width: 22,
                  height: 22,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: Colors.white,
                  ),
                )
              : Text(
                  _selectedYearly
                      ? 'Start 7-Day Free Trial — ${yearlyPrice ?? '\$34.99'}/yr'
                      : 'Subscribe Monthly — ${monthlyPrice ?? '\$4.99'}',
                  style: const TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                    color: Colors.white,
                  ),
                ),
        ),
      ),
    );
  }

  Future<void> _purchase() async {
    setState(() => _purchasing = true);
    HapticFeedback.mediumImpact();

    final plan = _selectedYearly ? 'yearly' : 'monthly';
    final iap = ref.read(iapServiceProvider);
    final success = _selectedYearly
        ? await iap.buyYearly()
        : await iap.buyMonthly();

    if (success) {
      Analytics.premiumPurchased(plan: plan);
    }

    if (!success && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Purchase could not be initiated. Try again.'),
        ),
      );
    }

    if (mounted) setState(() => _purchasing = false);
  }

  Future<void> _restore() async {
    setState(() => _purchasing = true);
    HapticFeedback.lightImpact();

    try {
      final iap = ref.read(iapServiceProvider);
      await iap.restorePurchases();
      // Wait a moment for the stream to process
      await Future.delayed(const Duration(seconds: 2));
      await ref.read(premiumProvider.notifier).refreshFromServer();

      if (mounted) {
        final isPremium = ref.read(premiumProvider).valueOrNull ?? false;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              isPremium
                  ? 'Purchases restored successfully!'
                  : 'No previous purchases found.',
            ),
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Restore failed')),
        );
      }
    }

    if (mounted) setState(() => _purchasing = false);
  }
}

class _PlanCard extends StatelessWidget {
  final String title;
  final String price;
  final String subtitle;
  final String? badge;
  final Color? badgeColor;
  final bool isSelected;
  final Color highlightAccent;
  final VoidCallback onTap;

  const _PlanCard({
    required this.title,
    required this.price,
    required this.subtitle,
    this.badge,
    this.badgeColor,
    required this.isSelected,
    required this.highlightAccent,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        padding: const EdgeInsets.all(16),
        decoration: isSelected
            ? AppTheme.glassAccent(accentColor: highlightAccent)
            : AppTheme.glass(),
        child: Column(
          children: [
            if (badge != null)
              Container(
                margin: const EdgeInsets.only(bottom: 8),
                padding:
                    const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: (badgeColor ?? AppTheme.warning)
                      .withValues(alpha: 0.18),
                  borderRadius: BorderRadius.circular(6),
                  border: Border.all(
                    color: (badgeColor ?? AppTheme.warning)
                        .withValues(alpha: 0.4),
                    width: 0.5,
                  ),
                ),
                child: Text(
                  badge!,
                  style: TextStyle(
                    fontSize: 9,
                    fontWeight: FontWeight.w800,
                    color: badgeColor ?? AppTheme.warning,
                    letterSpacing: 0.6,
                  ),
                ),
              ),
            Text(
              title,
              style: const TextStyle(
                fontSize: 13,
                color: AppTheme.textSecondary,
              ),
            ),
            const SizedBox(height: 4),
            FittedBox(
              fit: BoxFit.scaleDown,
              child: Text(
                price,
                maxLines: 1,
                style: const TextStyle(
                  fontSize: 24,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ),
            const SizedBox(height: 2),
            Text(
              subtitle,
              style: const TextStyle(
                fontSize: 11,
                color: AppTheme.textMuted,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
