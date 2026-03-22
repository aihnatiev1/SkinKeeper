import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../../core/settings_provider.dart';
import '../../../core/theme.dart';
import '../../../models/inventory_item.dart';
import '../../auth/session_provider.dart';
import '../../auth/steam_auth_service.dart';
import '../../settings/accounts_provider.dart';
import '../../../widgets/glass_sheet.dart';
import '../sell_provider.dart';
import 'fee_breakdown.dart';
import 'sell_progress_sheet.dart';

class SellBottomSheet extends ConsumerStatefulWidget {
  final List<InventoryItem> items;

  const SellBottomSheet({super.key, required this.items});

  @override
  ConsumerState<SellBottomSheet> createState() => _SellBottomSheetState();
}

class _SellBottomSheetState extends ConsumerState<SellBottomSheet> {
  bool _showCustomPrice = false;
  bool _isClosing = false;
  final _priceController = TextEditingController();
  int? _customPriceCents;
  Animation<double>? _routeAnimation;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final animation = ModalRoute.of(context)?.animation;
    if (animation != _routeAnimation) {
      _routeAnimation?.removeStatusListener(_onRouteAnimationStatus);
      _routeAnimation = animation;
      _routeAnimation?.addStatusListener(_onRouteAnimationStatus);
    }
  }

  void _onRouteAnimationStatus(AnimationStatus status) {
    if (status == AnimationStatus.reverse && mounted && !_isClosing) {
      // Route is closing — remove TextField from the tree immediately so
      // EditableTextState.dispose() deregisters from WidgetsBinding before
      // the keyboard sends didChangeMetrics on the now-deactivated element.
      FocusManager.instance.primaryFocus?.unfocus();
      setState(() => _isClosing = true);
    }
  }

  @override
  void dispose() {
    _routeAnimation?.removeStatusListener(_onRouteAnimationStatus);
    _priceController.dispose();
    super.dispose();
  }

  bool get _isSingle => widget.items.length == 1;
  bool get _allSameName => widget.items.every((i) => i.marketHashName == widget.items.first.marketHashName);

  void _onCustomPriceChanged(String value) {
    final parsed = double.tryParse(value.replaceAll(',', '.'));
    setState(() {
      _customPriceCents = parsed != null ? (parsed * 100).round() : null;
    });
  }

  void _showItemList(BuildContext context) {
    showModalBottomSheet(
      context: context,
      backgroundColor: AppTheme.bgSecondary,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => DraggableScrollableSheet(
        initialChildSize: 0.5,
        maxChildSize: 0.8,
        minChildSize: 0.3,
        expand: false,
        builder: (_, scrollCtrl) => Column(
          children: [
            Padding(
              padding: const EdgeInsets.all(16),
              child: Text(
                '${widget.items.length} items to sell',
                style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: Colors.white),
              ),
            ),
            Expanded(
              child: ListView.builder(
                controller: scrollCtrl,
                itemCount: widget.items.length,
                itemBuilder: (_, i) {
                  final item = widget.items[i];
                  return ListTile(
                    leading: ClipRRect(
                      borderRadius: BorderRadius.circular(6),
                      child: Container(
                        width: 36, height: 36,
                        color: AppTheme.surface,
                        child: Image.network(item.fullIconUrl, fit: BoxFit.contain,
                            errorBuilder: (_, _, _) => const Icon(Icons.image, size: 14, color: AppTheme.textDisabled)),
                      ),
                    ),
                    title: Text(item.displayName, style: const TextStyle(fontSize: 13, color: Colors.white)),
                    subtitle: Text(item.weaponName, style: TextStyle(fontSize: 11, color: AppTheme.textMuted)),
                    dense: true,
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _startSell(int priceCentsPerItem) async {
    HapticFeedback.mediumImpact();

    // Dismiss keyboard before any navigation to prevent
    // EditableTextState.didChangeMetrics on deactivated widget
    FocusManager.instance.primaryFocus?.unfocus();

    final items = widget.items
        .map((item) => {
              'assetId': item.assetId,
              'marketHashName': item.marketHashName,
              'priceCents': priceCentsPerItem,
              if (item.accountId != null) 'accountId': item.accountId,
            })
        .toList();

    await ref.read(sellOperationProvider.notifier).startOperation(items);

    if (!mounted) return;

    // Capture root navigator context before popping — remains valid after
    // this sheet is removed, unlike the sheet's own context.
    final rootNav = Navigator.of(context, rootNavigator: true);
    final rootContext = rootNav.context;
    rootNav.pop();

    // Defer push to next frame so Navigator is no longer locked mid-pop
    WidgetsBinding.instance.addPostFrameCallback((_) {
      showGlassSheetLocked(rootContext, const SellProgressSheet());
    });
  }

  @override
  Widget build(BuildContext context) {
    final sessionStatus = ref.watch(sessionStatusProvider);
    final volume = ref.watch(sellVolumeProvider);
    final walletAsync = ref.watch(walletInfoProvider);
    final item = widget.items.first;
    final count = widget.items.length;
    final activeAccountId = ref.watch(
      authStateProvider.select((u) => u.valueOrNull?.activeAccountId),
    );
    final isNonActiveAccount = item.accountId != null &&
        item.accountId != activeAccountId;

    // Quick price — only fetch for single items or first of batch
    final quickPriceAsync = ref.watch(
      quickPriceProvider(QuickPriceRequest(
        marketHashName: item.marketHashName,
        fallbackPriceUsd: item.bestPrice ?? item.steamPrice,
      )),
    );

    return Container(
      padding: EdgeInsets.only(
        left: 20,
        right: 20,
        top: 12,
        bottom: MediaQuery.of(context).viewInsets.bottom + 32,
      ),
      decoration: BoxDecoration(
        color: AppTheme.bgSecondary,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(AppTheme.r24)),
        border: Border.all(color: AppTheme.border),
      ),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Handle bar
            Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: AppTheme.textDisabled,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            const SizedBox(height: 16),

            // Cross-account warning banner
            if (isNonActiveAccount) ...[
              _buildSwitchAccountBanner(context),
              const SizedBox(height: 4),
            ],

            // Header — item info
            _buildHeader(item, count),
            const SizedBox(height: 16),

            // Session is guaranteed valid by caller (requireSession).
            // Still watch for 'expiring' warning or mid-sheet expiry.
            sessionStatus.when(
              data: (ss) {
                if (ss.status == 'valid' || ss.status == 'expiring') {
                  final wallet = walletAsync.valueOrNull ?? WalletInfo.usd;
                  return _buildSellContent(
                    quickPriceAsync: quickPriceAsync,
                    volume: volume,
                    count: count,
                    sessionWarning: ss.status == 'expiring',
                    wallet: wallet,
                  );
                }
                // Session expired while sheet is open -- minimal prompt
                return Center(
                  child: TextButton.icon(
                    onPressed: () => Navigator.of(context, rootNavigator: true).pop(),
                    icon: const Icon(Icons.refresh, size: 18),
                    label: const Text('Session expired. Close and retry.'),
                  ),
                );
              },
              loading: () => const Padding(
                padding: EdgeInsets.all(24),
                child: CircularProgressIndicator(color: AppTheme.primary),
              ),
              error: (_, _) => Center(
                child: TextButton.icon(
                  onPressed: () => Navigator.of(context, rootNavigator: true).pop(),
                  icon: const Icon(Icons.refresh, size: 18),
                  label: const Text('Session error. Close and retry.'),
                ),
              ),
            ),

            const SizedBox(height: 8),
          ],
        ),
      ),
    );
  }

  Widget _buildHeader(InventoryItem item, int count) {
    if (!_isSingle && !_allSameName) {
      // Multi-item with different types — tappable to show list
      return GestureDetector(
        onTap: () => _showItemList(context),
        child: Row(
          children: [
            // Stack of icons
            SizedBox(
              width: 56,
              height: 56,
              child: Stack(
                children: [
                  for (var i = 0; i < widget.items.take(3).length; i++)
                    Positioned(
                      left: i * 12.0,
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(8),
                        child: Container(
                          width: 40,
                          height: 40,
                          color: AppTheme.surface,
                          child: Image.network(
                            widget.items[i].fullIconUrl,
                            fit: BoxFit.contain,
                            errorBuilder: (_, _, _) => const Icon(
                                Icons.image, size: 16, color: AppTheme.textDisabled),
                          ),
                        ),
                      ),
                    ),
                ],
              ),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    '$count items',
                    style: AppTheme.title,
                  ),
                  const SizedBox(height: 2),
                  Text(
                    'Tap to view & edit list',
                    style: AppTheme.bodySmall.copyWith(color: AppTheme.primary),
                  ),
                ],
              ),
            ),
            Icon(Icons.chevron_right, size: 20, color: AppTheme.textMuted),
          ],
        ),
      );
    }

    return Row(
      children: [
        // Item icon
        ClipRRect(
          borderRadius: BorderRadius.circular(10),
          child: Container(
            width: 56,
            height: 56,
            color: AppTheme.surface,
            child: Image.network(
              item.fullIconUrl,
              fit: BoxFit.contain,
              errorBuilder: (_, _, _) =>
                  const Icon(Icons.image_not_supported, color: AppTheme.textDisabled),
            ),
          ),
        ),
        const SizedBox(width: 14),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                _isSingle
                    ? item.displayName
                    : '$count x ${item.displayName}',
                style: AppTheme.title,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
              const SizedBox(height: 2),
              Text(
                _isSingle ? item.weaponName : item.marketHashName,
                style: AppTheme.bodySmall,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildSwitchAccountBanner(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: AppTheme.warning.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(
          color: AppTheme.warning.withValues(alpha: 0.3),
          width: 1,
        ),
      ),
      child: Row(
        children: [
          Icon(Icons.swap_horiz_rounded,
              size: 16, color: AppTheme.warning.withValues(alpha: 0.8)),
          const SizedBox(width: 8),
          const Expanded(
            child: Text(
              'This item belongs to another account. Switch accounts to sell it.',
              style: TextStyle(
                fontSize: 12,
                color: AppTheme.warning,
              ),
            ),
          ),
          TextButton(
            onPressed: () async {
              final accountId = widget.items.first.accountId;
              if (accountId != null) {
                Navigator.of(context).pop();
                await ref.read(accountsProvider.notifier).setActive(accountId);
              }
            },
            child: const Text(
              'Switch',
              style: TextStyle(
                color: AppTheme.warning,
                fontWeight: FontWeight.bold,
                fontSize: 12,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSellContent({
    required AsyncValue<QuickPriceResult> quickPriceAsync,
    required AsyncValue<SellVolume> volume,
    required int count,
    required bool sessionWarning,
    required WalletInfo wallet,
  }) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        // Session expiring warning
        if (sessionWarning)
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(
                color: AppTheme.warning.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: AppTheme.warning.withValues(alpha: 0.25)),
              ),
              child: Row(
                children: [
                  const Icon(Icons.warning_rounded,
                      color: AppTheme.warning, size: 18),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'Session expiring soon — refresh after selling',
                      style: AppTheme.captionSmall.copyWith(
                        color: AppTheme.warning,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),

        // Rate limit warning
        volume.whenData((vol) {
          if (!vol.isWarning) return const SizedBox.shrink();
          return Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Container(
              padding:
                  const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(
                color: AppTheme.warning.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: AppTheme.warning.withValues(alpha: 0.25)),
              ),
              child: Row(
                children: [
                  const Icon(Icons.speed, color: AppTheme.warning, size: 18),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      '${vol.today} of ${vol.limit} daily listings used — ${vol.remaining} remaining',
                      style: AppTheme.captionSmall.copyWith(
                        color: AppTheme.warning,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          );
        }).maybeWhen(orElse: () => const SizedBox.shrink()),

        // Price section
        quickPriceAsync.when(
          data: (result) =>
              _buildPriceSection(result.sellerReceivesCents, count, wallet,
                  stale: result.stale, marketUrl: result.marketUrl),
          loading: () => const Padding(
            padding: EdgeInsets.symmetric(vertical: 20),
            child: Center(
              child: SizedBox(
                width: 28,
                height: 28,
                child: CircularProgressIndicator(strokeWidth: 2.5, color: AppTheme.primary),
              ),
            ),
          ),
          error: (_, _) => _buildPriceError(),
        ),
      ],
    );
  }

  Widget _buildPriceSection(int quickPriceCents, int count, WalletInfo wallet, {
    bool stale = false,
    String? marketUrl,
  }) {
    final priceStr =
        '\$${(quickPriceCents / 100).toStringAsFixed(2)}';
    final totalCents = quickPriceCents * count;
    final totalStr = '\$${(totalCents / 100).toStringAsFixed(2)}';
    // Wallet currency strings
    final walletPriceStr = wallet.isUsd ? null : wallet.formatWalletPrice(quickPriceCents);
    final walletTotalStr = wallet.isUsd ? null : wallet.formatWalletPrice(totalCents);

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        // Stale price warning
        if (stale)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              decoration: BoxDecoration(
                color: AppTheme.error.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: AppTheme.error.withValues(alpha: 0.3)),
              ),
              child: Column(
                children: [
                  Row(
                    children: [
                      const Icon(Icons.warning_amber_rounded,
                          color: AppTheme.error, size: 18),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          'Price may be outdated — enter manually or check Steam Market',
                          style: AppTheme.captionSmall.copyWith(
                            color: AppTheme.error,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                      ),
                    ],
                  ),
                  if (marketUrl != null) ...[
                    const SizedBox(height: 8),
                    SizedBox(
                      width: double.infinity,
                      height: 36,
                      child: OutlinedButton.icon(
                        onPressed: () => launchUrl(Uri.parse(marketUrl),
                            mode: LaunchMode.externalApplication),
                        icon: const Icon(Icons.open_in_new, size: 16),
                        label: const Text('Open on Steam Market'),
                        style: OutlinedButton.styleFrom(
                          foregroundColor: AppTheme.error,
                          side: BorderSide(color: AppTheme.error.withValues(alpha: 0.4)),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(8),
                          ),
                          textStyle: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
                        ),
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ),

        // Wallet currency notice
        if (!wallet.isUsd && walletPriceStr != null)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(
                color: AppTheme.primary.withValues(alpha: 0.08),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: AppTheme.primary.withValues(alpha: 0.15)),
              ),
              child: Row(
                children: [
                  const Icon(Icons.currency_exchange,
                      color: AppTheme.primary, size: 16),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'Steam wallet: ${wallet.code}. Listing at $walletPriceStr (≈ $priceStr)',
                      style: AppTheme.captionSmall.copyWith(
                        color: AppTheme.primaryLight,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),

        // Fee breakdown for quick price
        FeeBreakdown(sellerReceivesCents: quickPriceCents, currency: ref.watch(currencyProvider)),
        const SizedBox(height: 6),

        if (count > 1)
          Padding(
            padding: const EdgeInsets.only(bottom: 6),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
              decoration: BoxDecoration(
                color: AppTheme.surface,
                borderRadius: BorderRadius.circular(10),
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    'Total ($count items)',
                    style: AppTheme.bodySmall,
                  ),
                  Text(
                    totalStr,
                    style: AppTheme.price.copyWith(fontSize: 15),
                  ),
                ],
              ),
            ),
          ),

        const SizedBox(height: 8),

        // Dual buttons
        Row(
          children: [
            // Quick Sell
            Expanded(
              flex: 3,
              child: SizedBox(
                height: 52,
                child: ElevatedButton(
                  onPressed: stale ? null : () => _startSell(quickPriceCents),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: stale ? AppTheme.surface : AppTheme.warning,
                    foregroundColor: stale ? AppTheme.textDisabled : Colors.black,
                    disabledBackgroundColor: AppTheme.surface,
                    disabledForegroundColor: AppTheme.textDisabled,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(AppTheme.r16),
                    ),
                    elevation: 0,
                  ),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text(
                        stale
                            ? 'Price Outdated'
                            : count == 1 ? 'Quick Sell' : 'Quick Sell All',
                        style: const TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.bold,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                      Text(
                        stale
                            ? 'Enter price manually'
                            : count == 1
                                ? (walletPriceStr ?? priceStr)
                                : (walletTotalStr ?? totalStr),
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                          color: stale
                              ? AppTheme.textDisabled
                              : Colors.black.withValues(alpha: 0.7),
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                  ),
                ),
              ),
            ),
            const SizedBox(width: 10),
            // Custom Price
            Expanded(
              flex: 2,
              child: SizedBox(
                height: 52,
                child: OutlinedButton(
                  onPressed: () {
                    HapticFeedback.selectionClick();
                    if (_showCustomPrice) {
                      // Dismiss keyboard before AnimatedSize removes the TextField
                      FocusManager.instance.primaryFocus?.unfocus();
                    }
                    setState(() => _showCustomPrice = !_showCustomPrice);
                  },
                  style: OutlinedButton.styleFrom(
                    side: BorderSide(
                      color: _showCustomPrice
                          ? AppTheme.primary
                          : AppTheme.textDisabled,
                    ),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(AppTheme.r16),
                    ),
                  ),
                  child: Text(
                    'Custom Price',
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                      color: _showCustomPrice
                          ? AppTheme.primary
                          : AppTheme.textSecondary,
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),

        // Custom price input (expanded)
        AnimatedSize(
          duration: const Duration(milliseconds: 250),
          curve: Curves.easeInOut,
          child: _showCustomPrice && !_isClosing
              ? _buildCustomPriceInput(count)
              : const SizedBox.shrink(),
        ),

        const SizedBox(height: 6),
        Text(
          wallet.isUsd
              ? 'Lowest - 1 cent. Needs Steam Guard confirmation.'
              : 'Prices in USD, auto-converted to ${wallet.code} on Steam.',
          style: AppTheme.captionSmall.copyWith(color: AppTheme.textDisabled),
          textAlign: TextAlign.center,
        ),
      ],
    );
  }

  Widget _buildCustomPriceInput(int count) {
    return Padding(
      padding: const EdgeInsets.only(top: 14),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // Price input
          TextField(
            controller: _priceController,
            onChanged: _onCustomPriceChanged,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            inputFormatters: [
              FilteringTextInputFormatter.allow(RegExp(r'^\d*\.?\d{0,2}')),
            ],
            style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold, color: AppTheme.textPrimary),
            decoration: InputDecoration(
              prefixText: '\$ ',
              prefixStyle: TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.bold,
                color: AppTheme.textSecondary,
              ),
              hintText: '0.00',
              hintStyle: TextStyle(color: AppTheme.textDisabled),
              filled: true,
              fillColor: AppTheme.surface,
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(AppTheme.r12),
                borderSide: BorderSide(color: AppTheme.border),
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(AppTheme.r12),
                borderSide: BorderSide(color: AppTheme.border),
              ),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(AppTheme.r12),
                borderSide: const BorderSide(color: AppTheme.primary),
              ),
              contentPadding: const EdgeInsets.symmetric(
                  horizontal: 16, vertical: 14),
            ),
          ),
          const SizedBox(height: 10),

          // Live fee breakdown for custom price
          if (_customPriceCents != null && _customPriceCents! > 0) ...[
            FeeBreakdown(
              sellerReceivesCents: _customPriceCents!,
              compact: false,
              currency: ref.watch(currencyProvider),
            ),
            const SizedBox(height: 12),
          ],

          // List button
          SizedBox(
            width: double.infinity,
            height: 48,
            child: ElevatedButton(
              onPressed: _customPriceCents != null && _customPriceCents! > 0
                  ? () => _startSell(_customPriceCents!)
                  : null,
              style: ElevatedButton.styleFrom(
                backgroundColor: AppTheme.primary,
                foregroundColor: Colors.white,
                disabledBackgroundColor: AppTheme.primary.withValues(alpha: 0.25),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(AppTheme.r16),
                ),
                elevation: 0,
              ),
              child: Text(
                _customPriceCents != null && _customPriceCents! > 0
                    ? count == 1
                        ? 'List at \$${(_customPriceCents! / 100).toStringAsFixed(2)}'
                        : 'List $count items at \$${(_customPriceCents! / 100).toStringAsFixed(2)} each'
                    : 'Enter a price',
                style: const TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildPriceError() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppTheme.loss.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(AppTheme.r12),
      ),
      child: Column(
        children: [
          const Row(
            children: [
              Icon(Icons.error_outline, color: AppTheme.loss, size: 20),
              SizedBox(width: 8),
              Text(
                'Could not fetch price',
                style: TextStyle(color: AppTheme.loss),
              ),
            ],
          ),
          const SizedBox(height: 12),
          // Still allow custom price
          SizedBox(
            width: double.infinity,
            child: OutlinedButton(
              onPressed: () {
                setState(() => _showCustomPrice = true);
              },
              style: OutlinedButton.styleFrom(
                side: const BorderSide(color: AppTheme.borderLight),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(AppTheme.r12),
                ),
              ),
              child: const Text('Set Custom Price'),
            ),
          ),
          if (_showCustomPrice)
            _buildCustomPriceInput(widget.items.length),
        ],
      ),
    );
  }
}
