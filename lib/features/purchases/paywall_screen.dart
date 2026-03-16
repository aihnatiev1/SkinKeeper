import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/theme.dart';
import 'iap_service.dart';

class PaywallScreen extends ConsumerStatefulWidget {
  const PaywallScreen({super.key});

  @override
  ConsumerState<PaywallScreen> createState() => _PaywallScreenState();
}

class _PaywallScreenState extends ConsumerState<PaywallScreen> {
  bool _selectedYearly = true;
  bool _purchasing = false;

  @override
  Widget build(BuildContext context) {
    final isPremium = ref.watch(premiumProvider).valueOrNull ?? false;

    return Scaffold(
      backgroundColor: AppTheme.bg,
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(8, 8, 16, 0),
              child: Row(
                children: [
                  IconButton(
                    icon: const Icon(Icons.arrow_back_ios_new_rounded,
                        size: 20, color: AppTheme.textSecondary),
                    onPressed: () => Navigator.of(context).pop(),
                  ),
                  const Expanded(
                    child: Text(
                      'SkinKeeper PRO',
                      style: TextStyle(
                        fontSize: 28,
                        fontWeight: FontWeight.w800,
                        color: Colors.white,
                        letterSpacing: -0.5,
                      ),
                    ),
                  ),
                ],
              ),
            ),
            Expanded(child: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          children: [
            if (isPremium) ...[
              _buildActiveBadge(),
              const SizedBox(height: 24),
            ],

            // Hero
            const Icon(Icons.workspace_premium, size: 56, color: AppTheme.warning)
                .animate()
                .fadeIn(duration: 400.ms)
                .scale(begin: const Offset(0.8, 0.8), end: const Offset(1, 1)),
            const SizedBox(height: 16),
            const Text(
              'Unlock Full Power',
              style: TextStyle(
                fontSize: 24,
                fontWeight: FontWeight.bold,
              ),
            ).animate().fadeIn(duration: 400.ms, delay: 100.ms),
            const SizedBox(height: 8),
            const Text(
              'Get detailed analytics and premium features',
              style: TextStyle(
                fontSize: 14,
                color: AppTheme.textSecondary,
              ),
            ).animate().fadeIn(duration: 400.ms, delay: 150.ms),
            const SizedBox(height: 28),

            // Features comparison
            _buildFeatureList()
                .animate()
                .fadeIn(duration: 400.ms, delay: 200.ms)
                .slideY(begin: 0.05, end: 0),
            const SizedBox(height: 28),

            if (!isPremium) ...[
              // Plan selector
              _buildPlanSelector()
                  .animate()
                  .fadeIn(duration: 400.ms, delay: 300.ms)
                  .slideY(begin: 0.05, end: 0),
              const SizedBox(height: 20),

              // Purchase button
              _buildPurchaseButton()
                  .animate()
                  .fadeIn(duration: 400.ms, delay: 400.ms),
              const SizedBox(height: 12),

              // Restore
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
              const SizedBox(height: 8),

              // Legal
              const Text(
                'Payment will be charged to your App Store / Google Play account. '
                'Subscription automatically renews unless cancelled at least 24 hours before the end of the current period.',
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: 10,
                  color: AppTheme.textMuted,
                ),
              ),
            ],
            if (kDebugMode) ...[
              const SizedBox(height: 20),
              _buildDebugButtons(),
            ],
            const SizedBox(height: 80),
          ],
        ),
      )),
          ],
        ),
      ),
    );
  }

  Widget _buildActiveBadge() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
      decoration: BoxDecoration(
        gradient: AppTheme.primaryGradient,
        borderRadius: BorderRadius.circular(AppTheme.r16),
      ),
      child: const Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.check_circle, color: Colors.white, size: 20),
          SizedBox(width: 8),
          Text(
            'PRO Active',
            style: TextStyle(
              color: Colors.white,
              fontWeight: FontWeight.bold,
              fontSize: 16,
            ),
          ),
        ],
      ),
    ).animate().fadeIn(duration: 400.ms).scale(begin: const Offset(0.9, 0.9), end: const Offset(1, 1));
  }

  Widget _buildFeatureList() {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: AppTheme.glass(),
      child: Column(
        children: [
          // Column headers
          Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: Row(
              children: [
                const Expanded(flex: 3, child: SizedBox.shrink()),
                Expanded(
                  child: Center(
                    child: Text(
                      'Free',
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        color: AppTheme.textSecondary,
                      ),
                    ),
                  ),
                ),
                Expanded(
                  child: Center(
                    child: Text(
                      'PRO',
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        color: AppTheme.warning,
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
          _featureRow('Steam price tracking', true, true),
          _featureRow('Inventory management', true, true),
          _featureRow('Trade history sync', true, true),
          _featureRow('Up to 5 price alerts', true, true),
          _featureRow('Up to 2 Steam accounts', true, true),
          const Divider(height: 24),
          _featureRow('DMarket, Skinport & more prices', false, true),
          _featureRow('Portfolio profit & charts', false, true),
          _featureRow('Per-item profit breakdown', false, true),
          _featureRow('Up to 20 price alerts', false, true),
          _featureRow('Sell multiple items at once', false, true),
          _featureRow('Unlimited accounts', false, true),
          _featureRow('CSV/Excel export', false, true),
        ],
      ),
    );
  }

  Widget _featureRow(String feature, bool free, bool pro) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        children: [
          Expanded(
            flex: 3,
            child: Text(
              feature,
              style: const TextStyle(
                fontSize: 13,
                color: AppTheme.textPrimary,
              ),
            ),
          ),
          Expanded(
            child: Center(
              child: Icon(
                free ? Icons.check_circle : Icons.remove_circle_outline,
                size: 18,
                color: free ? AppTheme.profit : AppTheme.textDisabled,
              ),
            ),
          ),
          Expanded(
            child: Center(
              child: Icon(
                pro ? Icons.check_circle : Icons.remove_circle_outline,
                size: 18,
                color: AppTheme.warning,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildPlanSelector() {
    return Row(
      children: [
        Expanded(
          child: _PlanCard(
            title: 'Monthly',
            price: '\$4.99',
            subtitle: 'per month',
            isSelected: !_selectedYearly,
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
            price: '\$29.99',
            subtitle: 'per year',
            badge: 'Save 50%',
            isSelected: _selectedYearly,
            onTap: () {
              HapticFeedback.selectionClick();
              setState(() => _selectedYearly = true);
            },
          ),
        ),
      ],
    );
  }

  Widget _buildPurchaseButton() {
    return SizedBox(
      width: double.infinity,
      height: 52,
      child: Container(
        decoration: BoxDecoration(
          gradient: AppTheme.primaryGradient,
          borderRadius: BorderRadius.circular(AppTheme.r16),
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
                      ? 'Subscribe Yearly — \$29.99'
                      : 'Subscribe Monthly — \$4.99',
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

    final iap = ref.read(iapServiceProvider);
    final success = _selectedYearly
        ? await iap.buyYearly()
        : await iap.buyMonthly();

    if (!success && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Purchase could not be initiated. Try again.'),
        ),
      );
    }

    if (mounted) setState(() => _purchasing = false);
  }

  Widget _buildDebugButtons() {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        border: Border.all(color: Colors.orange.withValues(alpha: 0.5)),
        borderRadius: BorderRadius.circular(AppTheme.r16),
        color: Colors.orange.withValues(alpha: 0.05),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            '🛠 DEBUG',
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.bold,
              color: Colors.orange,
              letterSpacing: 1,
            ),
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: OutlinedButton(
                  onPressed: _purchasing ? null : () => _mockActivate(yearly: true),
                  style: OutlinedButton.styleFrom(
                    side: const BorderSide(color: Colors.orange),
                    foregroundColor: Colors.orange,
                    padding: const EdgeInsets.symmetric(vertical: 8),
                  ),
                  child: const Text('Mock PRO Yearly', style: TextStyle(fontSize: 12)),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: OutlinedButton(
                  onPressed: _purchasing ? null : () => _mockActivate(yearly: false),
                  style: OutlinedButton.styleFrom(
                    side: const BorderSide(color: Colors.orange),
                    foregroundColor: Colors.orange,
                    padding: const EdgeInsets.symmetric(vertical: 8),
                  ),
                  child: const Text('Mock PRO Monthly', style: TextStyle(fontSize: 12)),
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          SizedBox(
            width: double.infinity,
            child: OutlinedButton(
              onPressed: _purchasing ? null : _mockRevoke,
              style: OutlinedButton.styleFrom(
                side: BorderSide(color: Colors.red.withValues(alpha: 0.6)),
                foregroundColor: Colors.red,
                padding: const EdgeInsets.symmetric(vertical: 8),
              ),
              child: const Text('Revoke PRO (test free tier)', style: TextStyle(fontSize: 12)),
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _mockActivate({required bool yearly}) async {
    setState(() => _purchasing = true);
    try {
      final iap = ref.read(iapServiceProvider);
      await iap.mockPurchase(yearly: yearly);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('[DEV] PRO ${yearly ? 'Yearly' : 'Monthly'} activated!'),
            backgroundColor: Colors.orange,
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('[DEV] Mock failed: $e')),
        );
      }
    }
    if (mounted) setState(() => _purchasing = false);
  }

  Future<void> _mockRevoke() async {
    setState(() => _purchasing = true);
    try {
      final iap = ref.read(iapServiceProvider);
      await iap.mockRevoke();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('[DEV] PRO revoked — now testing free tier'),
            backgroundColor: Colors.red,
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('[DEV] Revoke failed: $e')),
        );
      }
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
  final bool isSelected;
  final VoidCallback onTap;

  const _PlanCard({
    required this.title,
    required this.price,
    required this.subtitle,
    this.badge,
    required this.isSelected,
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
            ? AppTheme.glassAccent(accentColor: AppTheme.primary)
            : AppTheme.glass(),
        child: Column(
          children: [
            if (badge != null)
              Container(
                margin: const EdgeInsets.only(bottom: 8),
                padding:
                    const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                decoration: BoxDecoration(
                  color: AppTheme.warning.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Text(
                  badge!,
                  style: const TextStyle(
                    fontSize: 10,
                    fontWeight: FontWeight.bold,
                    color: AppTheme.warning,
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
            Text(
              price,
              style: const TextStyle(
                fontSize: 24,
                fontWeight: FontWeight.bold,
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
