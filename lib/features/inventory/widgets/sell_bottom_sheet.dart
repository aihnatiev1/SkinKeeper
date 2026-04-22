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
import '../inventory_provider.dart';
import '../inventory_selection_provider.dart';
import '../../../core/push_service.dart';
import '../sell_provider.dart';
import 'fee_breakdown.dart';
import 'sell_progress_sheet.dart';
import 'sell_sheet_header.dart';

class SellBottomSheet extends ConsumerStatefulWidget {
  final List<InventoryItem> items;

  const SellBottomSheet({super.key, required this.items});

  @override
  ConsumerState<SellBottomSheet> createState() => _SellBottomSheetState();
}

class _SellBottomSheetState extends ConsumerState<SellBottomSheet> {
  bool _showCustomPrice = false;
  bool _isClosing = false;
  bool _isSelling = false;
  bool _refreshScheduled = false; // Fix 9: prevent double-tap
  bool _customPriceInUsd = false; // true = user toggled to USD for custom price
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

  void _onCustomPriceChanged(String value) {
    final parsed = double.tryParse(value.replaceAll(',', '.'));
    setState(() {
      _customPriceCents = parsed != null ? (parsed * 100).round() : null;
    });
  }


  Future<void> _startSell(int priceCentsPerItem, {int? priceCurrencyId}) async {
    if (_isSelling) return; // Fix 9: prevent double-tap
    setState(() => _isSelling = true);

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
              'priceCurrencyId': ?priceCurrencyId,
            })
        .toList();

    await ref.read(sellOperationProvider.notifier).startOperation(items);

    // Check if operation actually started — don't remove items on failure
    final opState = ref.read(sellOperationProvider);
    if (opState.hasError) {
      if (mounted) {
        setState(() => _isSelling = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: const Text('Sell operation failed. Please try again.'),
            backgroundColor: AppTheme.loss,
          ),
        );
      }
      return;
    }

    PushService.requestPermissionAndRegister();

    // Optimistic update — remove sold items from inventory
    final soldAssetIds = widget.items.map((i) => i.assetId).toSet();
    ref.read(inventoryProvider.notifier).removeAssets(soldAssetIds);
    ref.read(selectionProvider.notifier).clear();

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

    // Pre-fetch fresh prices for all items via histogram (warms backend cache)
    if (count > 1) {
      final uniqueNames = widget.items.map((i) => i.marketHashName).toSet().toList();
      ref.watch(refreshPricesProvider(RefreshPricesRequest(
        names: uniqueNames,
        accountId: item.accountId ?? activeAccountId,
      )));
    }

    // Quick price — fetch in wallet currency for the item's account
    final quickPriceAsync = ref.watch(
      quickPriceProvider(QuickPriceRequest(
        marketHashName: item.marketHashName,
        fallbackPriceUsd: item.bestPrice ?? item.steamPrice,
        accountId: item.accountId ?? activeAccountId,
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
            SellSheetHeader(items: widget.items),
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
                    item: item,
                    activeAccountId: activeAccountId,
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
    required InventoryItem item,
    required int? activeAccountId,
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
          data: (result) {
              // Auto-refresh stale price — backend caches live price in background,
              // so the second request will return the exact price from cache
              if (result.stale && !_refreshScheduled) {
                _refreshScheduled = true;
                Future.delayed(const Duration(seconds: 2), () {
                  if (mounted) {
                    ref.invalidate(quickPriceProvider(QuickPriceRequest(
                      marketHashName: item.marketHashName,
                      fallbackPriceUsd: item.bestPrice ?? item.steamPrice,
                      accountId: item.accountId ?? activeAccountId,
                    )));
                  }
                });
              }
              return _buildPriceSection(result.sellerReceivesCents, count, wallet,
                  stale: result.stale, marketUrl: result.marketUrl, quickPriceResult: result);
          },
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
    required QuickPriceResult quickPriceResult,
  }) {
    final qp = quickPriceResult;
    // quickPriceCents = sellerReceives — calculate buyerPays for display
    final fees = calculateFees(quickPriceCents);
    final buyerPaysCents = fees.buyerPaysCents;
    final priceStr = qp.formatPrice(buyerPaysCents);
    final totalCents = buyerPaysCents * count;
    final totalStr = qp.formatPrice(totalCents);

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
                color: AppTheme.loss.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: AppTheme.loss.withValues(alpha: 0.3)),
              ),
              child: Column(
                children: [
                  Row(
                    children: [
                      const Icon(Icons.warning_amber_rounded,
                          color: AppTheme.loss, size: 18),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          'Price may be outdated — enter manually or check Steam Market',
                          style: AppTheme.captionSmall.copyWith(
                            color: AppTheme.loss,
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
                          foregroundColor: AppTheme.loss,
                          side: BorderSide(color: AppTheme.loss.withValues(alpha: 0.4)),
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

        // Fee breakdown for quick price (amounts are in wallet currency, not USD)
        FeeBreakdown(
          sellerReceivesCents: quickPriceCents,
          currency: CurrencyInfo(code: qp.currencyCode, symbol: qp.currencySymbol, rate: 1.0),
        ),
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

        // Dual buttons (or single Sell button when no price)
        if (quickPriceCents > 0 && !stale) ...[
          // Has valid price — show Quick Sell + Sell
          Row(
            children: [
              Expanded(
                flex: 4,
                child: SizedBox(
                  height: 48,
                  child: ElevatedButton(
                    onPressed: _isSelling ? null : () => _startSell(quickPriceCents, priceCurrencyId: qp.currencyId),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppTheme.warning,
                      foregroundColor: Colors.black,
                      disabledBackgroundColor: AppTheme.surface,
                      disabledForegroundColor: AppTheme.textDisabled,
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(AppTheme.r16),
                      ),
                      elevation: 0,
                    ),
                    child: Text.rich(
                      TextSpan(
                        children: [
                          TextSpan(
                            text: count == 1 ? 'Quick Sell ' : 'Quick Sell All ',
                            style: const TextStyle(fontSize: 13, fontWeight: FontWeight.bold),
                          ),
                          TextSpan(
                            text: count == 1 ? priceStr : totalStr,
                            style: TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.w600,
                              color: Colors.black.withValues(alpha: 0.7),
                            ),
                          ),
                        ],
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                flex: 2,
                child: SizedBox(
                  height: 48,
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
                    'Sell',
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
        ] else ...[
          // No valid Steam price — show market link + Sell only
          if (marketUrl != null)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: SizedBox(
                width: double.infinity,
                height: 48,
                child: OutlinedButton.icon(
                  onPressed: () => launchUrl(Uri.parse(marketUrl),
                      mode: LaunchMode.externalApplication),
                  icon: const Icon(Icons.open_in_new, size: 16),
                  label: const Text('Check Price on Steam Market'),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: AppTheme.steamBlue,
                    side: BorderSide(color: AppTheme.steamBlue.withValues(alpha: 0.4)),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(AppTheme.r16),
                    ),
                    textStyle: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
                  ),
                ),
              ),
            ),
          SizedBox(
            width: double.infinity,
            height: 48,
            child: ElevatedButton(
              onPressed: () {
                HapticFeedback.selectionClick();
                setState(() => _showCustomPrice = true);
              },
              style: ElevatedButton.styleFrom(
                backgroundColor: AppTheme.primary,
                foregroundColor: Colors.white,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(AppTheme.r16),
                ),
                elevation: 0,
              ),
              child: const Text(
                'Sell at Custom Price',
                style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold),
              ),
            ),
          ),
        ],

        // Custom price input (expanded)
        AnimatedSize(
          duration: const Duration(milliseconds: 250),
          curve: Curves.easeInOut,
          child: _showCustomPrice && !_isClosing
              ? _buildCustomPriceInput(count,
                  currencySymbol: qp.currencySymbol,
                  walletCurrencyId: qp.currencyId,
                  walletCurrencyCode: qp.currencyCode)
              : const SizedBox.shrink(),
        ),

        const SizedBox(height: 6),
        Text(
          'Confirm the listing in Steam Guard mobile app.',
          style: AppTheme.captionSmall.copyWith(color: AppTheme.textDisabled),
          textAlign: TextAlign.center,
        ),
      ],
    );
  }

  Widget _buildCustomPriceInput(int count, {
    String currencySymbol = '\$',
    int walletCurrencyId = 1,
    String walletCurrencyCode = 'USD',
  }) {
    final isWalletUsd = walletCurrencyId == 1;
    final activeSymbol = _customPriceInUsd ? '\$' : currencySymbol;
    final activeCurrencyId = _customPriceInUsd ? 1 : walletCurrencyId;

    return Padding(
      padding: const EdgeInsets.only(top: 14),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // Currency toggle (only show when wallet is not USD)
          if (!isWalletUsd)
            Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: Row(
                children: [
                  Expanded(
                    child: _CurrencyToggleButton(
                      label: walletCurrencyCode,
                      symbol: currencySymbol,
                      isActive: !_customPriceInUsd,
                      onTap: () => setState(() => _customPriceInUsd = false),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: _CurrencyToggleButton(
                      label: 'USD',
                      symbol: '\$',
                      isActive: _customPriceInUsd,
                      onTap: () => setState(() => _customPriceInUsd = true),
                    ),
                  ),
                ],
              ),
            ),

          // USD conversion warning
          if (_customPriceInUsd && !isWalletUsd)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                decoration: BoxDecoration(
                  color: AppTheme.warning.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: AppTheme.warning.withValues(alpha: 0.25)),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.currency_exchange,
                        color: AppTheme.warning, size: 16),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        'Your Steam wallet is $walletCurrencyCode. USD price will be converted — actual listing may differ slightly.',
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

          // Price input
          TextField(
            controller: _priceController,
            onChanged: _onCustomPriceChanged,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            inputFormatters: [
              FilteringTextInputFormatter.allow(RegExp(r'^\d*[.,]?\d{0,2}')),
              TextInputFormatter.withFunction((oldValue, newValue) {
                return newValue.copyWith(text: newValue.text.replaceAll(',', '.'));
              }),
            ],
            style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold, color: AppTheme.textPrimary),
            decoration: InputDecoration(
              prefixText: '$activeSymbol ',
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

          // Live fee breakdown for custom price — user enters buyer-pays (listing price)
          if (_customPriceCents != null && _customPriceCents! > 0) ...[
            FeeBreakdown(
              sellerReceivesCents: _customPriceCents!,
              fromBuyerPays: true,
              compact: false,
              currency: CurrencyInfo(code: walletCurrencyCode, symbol: activeSymbol, rate: 1.0),
            ),
            const SizedBox(height: 12),
          ],

          // List button
          SizedBox(
            width: double.infinity,
            height: 48,
            child: ElevatedButton(
              onPressed: _customPriceCents != null && _customPriceCents! > 0 && !_isSelling
                  ? () {
                      // User enters buyer-pays price — convert to seller-receives for backend
                      final fees = calculateFeesFromBuyerPays(_customPriceCents!);
                      _startSell(fees.sellerReceivesCents, priceCurrencyId: activeCurrencyId);
                    }
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
              child: FittedBox(
                fit: BoxFit.scaleDown,
                child: Text(
                _customPriceCents != null && _customPriceCents! > 0
                    ? count == 1
                        ? 'List at $activeSymbol${(_customPriceCents! / 100).toStringAsFixed(2)}'
                        : 'List $count at $activeSymbol${(_customPriceCents! / 100).toStringAsFixed(2)} each'
                    : 'Enter a price',
                style: const TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.bold,
                ),
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
          if (_showCustomPrice) ...[
            Builder(builder: (_) {
              final w = ref.watch(walletInfoProvider).valueOrNull ?? WalletInfo.usd;
              return _buildCustomPriceInput(widget.items.length,
                  currencySymbol: w.symbol,
                  walletCurrencyId: w.currencyId,
                  walletCurrencyCode: w.code);
            }),
          ],
        ],
      ),
    );
  }
}

class _CurrencyToggleButton extends StatelessWidget {
  final String label;
  final String symbol;
  final bool isActive;
  final VoidCallback onTap;

  const _CurrencyToggleButton({
    required this.label,
    required this.symbol,
    required this.isActive,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        padding: const EdgeInsets.symmetric(vertical: 8),
        decoration: BoxDecoration(
          color: isActive ? AppTheme.primary.withValues(alpha: 0.15) : AppTheme.surface,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(
            color: isActive ? AppTheme.primary : AppTheme.border,
            width: isActive ? 1.5 : 1,
          ),
        ),
        child: Center(
          child: Text(
            '$symbol $label',
            style: TextStyle(
              fontSize: 14,
              fontWeight: isActive ? FontWeight.w700 : FontWeight.w500,
              color: isActive ? AppTheme.primary : AppTheme.textSecondary,
            ),
          ),
        ),
      ),
    );
  }
}
