import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/settings_provider.dart';
import '../../../core/theme.dart';
import '../../../models/inventory_item.dart';
import '../../auth/session_provider.dart';
import '../../auth/steam_auth_service.dart';
import '../../../widgets/glass_sheet.dart';
import '../inventory_provider.dart';
import '../inventory_selection_provider.dart';
import '../../../core/push_service.dart';
import '../sell_provider.dart';
import 'fee_breakdown.dart';
import 'sell_progress_sheet.dart';
import 'sell_sheet_action_buttons.dart';
import 'sell_sheet_custom_price_input.dart';
import 'sell_sheet_header.dart';
import 'sell_sheet_switch_account_banner.dart';
import 'sell_sheet_total_row.dart';
import 'sell_sheet_warnings.dart';

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
              SellSheetSwitchAccountBanner(targetAccountId: item.accountId!),
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
        if (sessionWarning) const SellSheetSessionWarning(),

        // Rate limit warning
        volume.whenData((vol) {
          if (!vol.isWarning) return const SizedBox.shrink();
          return SellSheetVolumeWarning(
            today: vol.today,
            limit: vol.limit,
            remaining: vol.remaining,
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
        if (stale) SellSheetStalePriceWarning(marketUrl: marketUrl),

        // Fee breakdown for quick price (amounts are in wallet currency, not USD)
        FeeBreakdown(
          sellerReceivesCents: quickPriceCents,
          currency: CurrencyInfo(code: qp.currencyCode, symbol: qp.currencySymbol, rate: 1.0),
        ),
        const SizedBox(height: 6),

        if (count > 1) SellSheetTotalRow(count: count, totalStr: totalStr),

        const SizedBox(height: 8),

        // Dual buttons (or single Sell button when no price)
        if (quickPriceCents > 0 && !stale)
          SellSheetQuickSellButtons(
            count: count,
            priceStr: priceStr,
            totalStr: totalStr,
            isSelling: _isSelling,
            showCustomPrice: _showCustomPrice,
            onQuickSell: () => _startSell(quickPriceCents, priceCurrencyId: qp.currencyId),
            onToggleCustomPrice: () {
              if (_showCustomPrice) {
                // Dismiss keyboard before AnimatedSize removes the TextField
                FocusManager.instance.primaryFocus?.unfocus();
              }
              setState(() => _showCustomPrice = !_showCustomPrice);
            },
          )
        else
          SellSheetNoPriceButtons(
            marketUrl: marketUrl,
            onShowCustomPrice: () => setState(() => _showCustomPrice = true),
          ),

        // Custom price input (expanded)
        AnimatedSize(
          duration: const Duration(milliseconds: 250),
          curve: Curves.easeInOut,
          child: _showCustomPrice && !_isClosing
              ? SellSheetCustomPriceInput(
                  count: count,
                  currencySymbol: qp.currencySymbol,
                  walletCurrencyId: qp.currencyId,
                  walletCurrencyCode: qp.currencyCode,
                  controller: _priceController,
                  customPriceInUsd: _customPriceInUsd,
                  customPriceCents: _customPriceCents,
                  isSelling: _isSelling,
                  onPriceChanged: _onCustomPriceChanged,
                  onUsdToggle: (usd) => setState(() => _customPriceInUsd = usd),
                  onList: (cents, currencyId) => _startSell(cents, priceCurrencyId: currencyId),
                )
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
              return SellSheetCustomPriceInput(
                count: widget.items.length,
                currencySymbol: w.symbol,
                walletCurrencyId: w.currencyId,
                walletCurrencyCode: w.code,
                controller: _priceController,
                customPriceInUsd: _customPriceInUsd,
                customPriceCents: _customPriceCents,
                isSelling: _isSelling,
                onPriceChanged: _onCustomPriceChanged,
                onUsdToggle: (usd) => setState(() => _customPriceInUsd = usd),
                onList: (cents, currencyId) => _startSell(cents, priceCurrencyId: currencyId),
              );
            }),
          ],
        ],
      ),
    );
  }
}

