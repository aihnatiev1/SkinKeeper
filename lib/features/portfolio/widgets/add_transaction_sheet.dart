
import 'package:cached_network_image/cached_network_image.dart';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../../core/api_client.dart';
import '../../../core/settings_provider.dart';
import '../../../core/steam_image.dart';
import '../../../core/theme.dart';
import '../../../models/profit_loss.dart';
import '../../../widgets/shared_ui.dart';
import '../manual_tx_provider.dart';
import '../portfolio_pl_provider.dart';
import '../portfolio_provider.dart';
import 'add_transaction_type_toggle.dart';

/// Sources for transaction origin
const _sources = [
  ('csfloat', 'CSFloat', Icons.storefront_rounded),
  ('buff163', 'Buff', Icons.store_rounded),
  ('skinport', 'Skinport', Icons.shopping_bag_rounded),
  ('trade', 'Trade', Icons.swap_horiz_rounded),
  ('drop', 'Drop', Icons.card_giftcard_rounded),
  ('manual', 'Other', Icons.edit_rounded),
];

class AddTransactionSheet extends ConsumerStatefulWidget {
  /// Pre-fill item name (e.g. from inventory "Log Purchase")
  final String? initialItemName;
  final String? initialIconUrl;
  final double? initialPriceUsd;
  final int? initialQty;
  /// When true: save replaces existing transactions instead of adding new ones
  final bool editMode;

  const AddTransactionSheet({
    super.key,
    this.initialItemName,
    this.initialIconUrl,
    this.initialPriceUsd,
    this.initialQty,
    this.editMode = false,
  });

  @override
  ConsumerState<AddTransactionSheet> createState() =>
      _AddTransactionSheetState();
}

class _AddTransactionSheetState extends ConsumerState<AddTransactionSheet> {
  final _itemController = TextEditingController();
  final _priceController = TextEditingController();
  final _qtyController = TextEditingController(text: '1');
  final _noteController = TextEditingController();
  String _type = 'buy'; // buy or sell
  String _source = 'manual';
  DateTime _date = DateTime.now();
  String? _selectedItem;
  String? _selectedIconUrl;
  int? _portfolioId;
  bool _showSearch = false;
  bool _saving = false;
  bool _isClosing = false;
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
      FocusManager.instance.primaryFocus?.unfocus();
      setState(() => _isClosing = true);
    }
  }

  @override
  void initState() {
    super.initState();
    if (widget.initialItemName != null) {
      _itemController.text = widget.initialItemName!;
      _selectedItem = widget.initialItemName;
      _selectedIconUrl = widget.initialIconUrl;
    }
    if (widget.initialPriceUsd != null) {
      final rate = ref.read(currencyProvider).rate;
      final priceInUserCurrency = widget.initialPriceUsd! * rate;
      _priceController.text = priceInUserCurrency.toStringAsFixed(2);
    }
    if (widget.initialQty != null) {
      _qtyController.text = widget.initialQty!.toString();
    }
    // Pre-select the currently active portfolio
    _portfolioId = ref.read(selectedPortfolioIdProvider);
  }

  @override
  void dispose() {
    _routeAnimation?.removeStatusListener(_onRouteAnimationStatus);
    _itemController.dispose();
    _priceController.dispose();
    _qtyController.dispose();
    _noteController.dispose();
    super.dispose();
  }

  bool get _isValid =>
      _selectedItem != null &&
      _selectedItem!.isNotEmpty &&
      _priceController.text.isNotEmpty &&
      (double.tryParse(_priceController.text.replaceAll(',', '.')) ?? 0) > 0;

  int get _priceCents {
    final price = double.tryParse(_priceController.text.replaceAll(',', '.')) ?? 0;
    return (price * 100).round();
  }

  int get _quantity => int.tryParse(_qtyController.text) ?? 1;

  double get _totalPrice =>
      (double.tryParse(_priceController.text.replaceAll(',', '.')) ?? 0) * _quantity;

  bool get _isUnchanged =>
      widget.editMode &&
      _quantity == (widget.initialQty ?? 1) &&
      _priceCents == ((widget.initialPriceUsd ?? 0) * 100).round();

  Future<void> _save() async {
    if (!_isValid || _saving) return;
    if (_isUnchanged) { context.pop(); return; }
    setState(() => _saving = true);

    try {
      final currency = ref.read(currencyProvider);
      // Convert from user currency to USD cents for backend storage
      final usdCents = (currency.rate > 0) ? (_priceCents / currency.rate).round() : _priceCents;

      if (widget.editMode) {
        final api = ref.read(apiClientProvider);
        await api.put('/transactions/item/replace', data: {
          'marketHashName': _selectedItem!,
          'qty': _quantity,
          'priceCentsPerUnit': usdCents,
          'type': _type,
          if (_portfolioId != null) 'portfolioId': _portfolioId,
        });
      } else {
        final service = ref.read(manualTxServiceProvider);
        await service.addTransaction(
          marketHashName: _selectedItem!,
          priceCentsPerUnit: usdCents,
          quantity: _quantity,
          type: _type,
          date: _date,
          source: _source,
          note: _noteController.text.isNotEmpty ? _noteController.text : null,
          iconUrl: _selectedIconUrl,
          portfolioId: _portfolioId,
        );
      }

      if (mounted) {
        HapticFeedback.mediumImpact();
        FocusManager.instance.primaryFocus?.unfocus();
        ref.invalidate(portfolioPLProvider);
        ref.invalidate(itemsPLProvider);
        ref.invalidate(portfolioProvider);
        context.pop();
      }
    } on DioException catch (e) {
      final errorCode = (e.response?.data as Map<String, dynamic>?)?['error'];
      if (errorCode == 'premium_required' && mounted) {
        context.pop();
        context.push('/premium');
        return;
      }
      if (mounted) {
        HapticFeedback.heavyImpact();
        final msg = (e.response?.data as Map<String, dynamic>?)?['message'] ?? 'Failed to save';
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(msg)),
        );
      }
    } catch (e) {
      if (mounted) {
        HapticFeedback.heavyImpact();
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to save: $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    // Sheet is closing — remove all TextFields from the tree so
    // EditableTextState.dispose() deregisters before keyboard sends didChangeMetrics.
    if (_isClosing) return const SizedBox.shrink();

    final currency = ref.watch(currencyProvider);
    final bottomInset = MediaQuery.of(context).viewInsets.bottom;

    return Padding(
      padding: EdgeInsets.only(bottom: bottomInset),
      child: Container(
      constraints: BoxConstraints(
        maxHeight: MediaQuery.of(context).size.height * 0.92 - bottomInset,
      ),
      decoration: const BoxDecoration(
        color: AppTheme.bgSecondary,
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // Drag handle
          Center(
            child: Container(
              margin: const EdgeInsets.only(top: 12, bottom: 8),
              width: 36,
              height: 4,
              decoration: BoxDecoration(
                color: AppTheme.textDisabled,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),

          // Header
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 4, 16, 12),
            child: Row(
              children: [
                const Text(
                  'Add Purchase',
                  style: TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.w700,
                    color: AppTheme.textPrimary,
                  ),
                ),
                const Spacer(),
                GestureDetector(
                  onTap: () => context.pop(),
                  child: Container(
                    width: 32,
                    height: 32,
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.06),
                      shape: BoxShape.circle,
                    ),
                    child: const Icon(Icons.close_rounded,
                        size: 18, color: AppTheme.textMuted),
                  ),
                ),
              ],
            ),
          ),

          // Content
          Flexible(
            child: SingleChildScrollView(
              padding: EdgeInsets.fromLTRB(
                  20, 0, 20, MediaQuery.of(context).padding.bottom + 20 + bottomInset),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // ── Buy / Sell toggle ──
                  AddTransactionTypeToggle(
                    value: _type,
                    onChanged: (v) => setState(() => _type = v),
                  ),
                  const SizedBox(height: 16),

                  // ── Item search ──
                  _buildLabel('ITEM'),
                  const SizedBox(height: 6),
                  _buildItemSearch(),
                  if (_showSearch) _buildSearchResults(),
                  const SizedBox(height: 16),

                  // ── Price & Quantity row ──
                  Row(
                    children: [
                      Expanded(
                        flex: 3,
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            _buildLabel('PRICE'),
                            const SizedBox(height: 6),
                            _buildTextField(
                              controller: _priceController,
                              hint: '0.00',
                              keyboardType:
                                  const TextInputType.numberWithOptions(
                                      decimal: true),
                              prefixText: currency.symbol,
                              inputFormatters: [
                                FilteringTextInputFormatter.allow(
                                    RegExp(r'^\d*[.,]?\d{0,2}')),
                                TextInputFormatter.withFunction((oldValue, newValue) {
                                  return newValue.copyWith(text: newValue.text.replaceAll(',', '.'));
                                }),
                                TextInputFormatter.withFunction((old, next) {
                                  final v = double.tryParse(next.text) ?? 0;
                                  return v <= 100000 ? next : old;
                                }),
                              ],
                              onChanged: (_) => setState(() {}),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        flex: 2,
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            _buildLabel('QTY'),
                            const SizedBox(height: 6),
                            _buildTextField(
                              controller: _qtyController,
                              hint: '1',
                              keyboardType: TextInputType.number,
                              prefixIcon: Icons.tag_rounded,
                              inputFormatters: [
                                FilteringTextInputFormatter.digitsOnly,
                                TextInputFormatter.withFunction((old, next) {
                                  final v = int.tryParse(next.text) ?? 0;
                                  return v <= 100000 ? next : old;
                                }),
                              ],
                              onChanged: (_) => setState(() {}),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),

                  // ── Total display ──
                  if (_priceCents > 0 && _quantity > 0) ...[
                    const SizedBox(height: 8),
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 12, vertical: 8),
                      decoration: BoxDecoration(
                        color: AppTheme.primary.withValues(alpha: 0.08),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text(
                            'Total',
                            style: TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.w500,
                              color: AppTheme.textSecondary,
                            ),
                          ),
                          Text(
                            currency.formatRaw(_totalPrice),
                            style: const TextStyle(
                              fontSize: 15,
                              fontWeight: FontWeight.w700,
                              color: AppTheme.textPrimary,
                              fontFeatures: [FontFeature.tabularFigures()],
                            ),
                          ),
                        ],
                      ),
                    ).animate().fadeIn(duration: 200.ms),
                  ],
                  const SizedBox(height: 16),

                  // ── Date ──
                  _buildLabel('DATE'),
                  const SizedBox(height: 6),
                  _buildDatePicker(),
                  const SizedBox(height: 16),

                  // ── Source ──
                  _buildLabel('SOURCE'),
                  const SizedBox(height: 6),
                  _buildSourceChips(),

                  // ── Portfolio picker ──
                  Consumer(
                    builder: (ctx, ref, _) {
                      final portfoliosAsync = ref.watch(portfoliosProvider);
                      return portfoliosAsync.when(
                        loading: () => const SizedBox.shrink(),
                        error: (e, _) => const SizedBox.shrink(),
                        data: (portfolios) {
                          if (portfolios.isEmpty) return const SizedBox.shrink();
                          final selected = portfolios
                              .where((p) => p.id == _portfolioId)
                              .firstOrNull;
                          return Padding(
                            padding: const EdgeInsets.only(top: 12),
                            child: Row(
                              children: [
                                const Icon(Icons.folder_outlined,
                                    size: 16, color: AppTheme.textMuted),
                                const SizedBox(width: 8),
                                Text(
                                  'Portfolio',
                                  style: AppTheme.captionSmall
                                      .copyWith(color: AppTheme.textMuted),
                                ),
                                const Spacer(),
                                GestureDetector(
                                  onTap: () =>
                                      _pickPortfolio(context, portfolios),
                                  child: Container(
                                    padding: const EdgeInsets.symmetric(
                                        horizontal: 10, vertical: 4),
                                    decoration: BoxDecoration(
                                      color: selected != null
                                          ? selected.color
                                              .withValues(alpha: 0.15)
                                          : Colors.transparent,
                                      borderRadius: BorderRadius.circular(12),
                                      border: Border.all(
                                        color: selected != null
                                            ? selected.color
                                            : AppTheme.divider,
                                      ),
                                    ),
                                    child: ConstrainedBox(
                                      constraints: const BoxConstraints(maxWidth: 160),
                                      child: Text(
                                        selected?.name ?? 'None',
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis,
                                        style: TextStyle(
                                          fontSize: 12,
                                          color: selected?.color ??
                                              AppTheme.textMuted,
                                          fontWeight: selected != null
                                              ? FontWeight.w600
                                              : FontWeight.w400,
                                        ),
                                      ),
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          );
                        },
                      );
                    },
                  ),
                  const SizedBox(height: 16),

                  // ── Note (optional) ──
                  _buildLabel('NOTE'),
                  const SizedBox(height: 6),
                  _buildTextField(
                    controller: _noteController,
                    hint: 'e.g. "Bought on DMarket"',
                    prefixIcon: Icons.notes_rounded,
                    maxLines: 1,
                    maxLength: 250,
                  ),
                  const SizedBox(height: 24),

                  // ── Save button ──
                  GradientButton(
                    label: _saving
                        ? 'Saving...'
                        : widget.editMode
                            ? (_isUnchanged ? 'No changes' : 'Save changes')
                            : _type == 'buy'
                                ? 'Log Purchase'
                                : 'Log Sale',
                    icon: widget.editMode
                        ? Icons.check_rounded
                        : _type == 'buy'
                            ? Icons.add_shopping_cart_rounded
                            : Icons.sell_rounded,
                    isLoading: _saving,
                    onPressed: _isValid ? _save : null,
                    gradient: _type == 'buy'
                        ? AppTheme.profitGradient
                        : AppTheme.lossGradient,
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    ),
    );
  }

  // ─── Portfolio picker ──────────────────────────────────────

  Future<void> _pickPortfolio(
      BuildContext context, List<Portfolio> portfolios) async {
    final picked = await showModalBottomSheet<int?>(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (_) => Container(
        margin: const EdgeInsets.all(16),
        padding: const EdgeInsets.all(16),
        decoration: AppTheme.glass(),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Assign Portfolio',
              style: AppTheme.bodySmall.copyWith(
                fontWeight: FontWeight.w700,
                color: AppTheme.textPrimary,
              ),
            ),
            const SizedBox(height: 12),
            ListTile(
              leading: Icon(Icons.close, color: AppTheme.textMuted, size: 18),
              title: Text('None',
                  style:
                      AppTheme.bodySmall.copyWith(color: AppTheme.textMuted)),
              onTap: () => context.pop(-1), // -1 = clear
              dense: true,
              contentPadding: EdgeInsets.zero,
            ),
            for (final p in portfolios)
              ListTile(
                leading: Container(
                  width: 12,
                  height: 12,
                  decoration:
                      BoxDecoration(color: p.color, shape: BoxShape.circle),
                ),
                title: Text(p.name,
                    style: AppTheme.bodySmall
                        .copyWith(color: AppTheme.textPrimary)),
                onTap: () => context.pop(p.id),
                dense: true,
                contentPadding: EdgeInsets.zero,
              ),
          ],
        ),
      ),
    );
    if (picked == -1) {
      setState(() => _portfolioId = null);
    } else if (picked != null) {
      setState(() => _portfolioId = picked);
    }
  }

  // ─── Builders ─────────────────────────────────────────────

  Widget _buildLabel(String text) {
    return Text(
      text,
      style: const TextStyle(
        fontSize: 10,
        fontWeight: FontWeight.w700,
        letterSpacing: 1.2,
        color: AppTheme.textDisabled,
      ),
    );
  }

  Widget _buildTextField({
    required TextEditingController controller,
    required String hint,
    IconData? prefixIcon,
    String? prefixText,
    TextInputType? keyboardType,
    List<TextInputFormatter>? inputFormatters,
    ValueChanged<String>? onChanged,
    int maxLines = 1,
    int? maxLength,
  }) {
    return Container(
      decoration: BoxDecoration(
        color: AppTheme.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppTheme.border),
      ),
      child: TextField(
        controller: controller,
        keyboardType: keyboardType,
        inputFormatters: inputFormatters,
        onChanged: onChanged,
        maxLines: maxLines,
        maxLength: maxLength,
        buildCounter: maxLength != null
            ? (_, {required currentLength, required isFocused, maxLength}) =>
                isFocused
                    ? Text('$currentLength/$maxLength',
                        style: TextStyle(fontSize: 10, color: AppTheme.textMuted))
                    : null
            : null,
        style: const TextStyle(
          fontSize: 15,
          fontWeight: FontWeight.w500,
          color: AppTheme.textPrimary,
        ),
        decoration: InputDecoration(
          hintText: hint,
          hintStyle:
              const TextStyle(color: AppTheme.textDisabled, fontSize: 14),
          prefixIcon: prefixIcon != null
              ? Icon(prefixIcon, size: 18, color: AppTheme.textMuted)
              : null,
          prefixText: prefixText,
          prefixStyle: const TextStyle(fontSize: 15, fontWeight: FontWeight.w500, color: AppTheme.textMuted),
          border: InputBorder.none,
          contentPadding:
              const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        ),
      ),
    );
  }

  Widget _buildItemSearch() {
    return Container(
      decoration: BoxDecoration(
        color: AppTheme.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: _selectedItem != null
              ? AppTheme.profit.withValues(alpha: 0.3)
              : AppTheme.border,
        ),
      ),
      child: Row(
        children: [
          if (_selectedIconUrl != null) ...[
            Padding(
              padding: const EdgeInsets.only(left: 10),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(4),
                child: CachedNetworkImage(
                  imageUrl:
                      SteamImage.url(_selectedIconUrl!, size: '64fx64f'),
                  width: 28,
                  height: 28,
                  fit: BoxFit.contain,
                  errorWidget: (_, _, _) => const SizedBox.shrink(),
                ),
              ),
            ),
          ],
          Expanded(
            child: TextField(
              controller: _itemController,
              style: const TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w500,
                color: AppTheme.textPrimary,
              ),
              onChanged: (v) {
                setState(() {
                  _showSearch = v.length >= 2;
                  if (v != _selectedItem) {
                    _selectedItem = null;
                    _selectedIconUrl = null;
                  }
                });
              },
              onTap: () {
                if (_itemController.text.length >= 2) {
                  setState(() => _showSearch = true);
                }
              },
              decoration: InputDecoration(
                hintText: 'Search item name...',
                hintStyle:
                    const TextStyle(color: AppTheme.textDisabled, fontSize: 14),
                prefixIcon: _selectedIconUrl == null
                    ? const Icon(Icons.search_rounded,
                        size: 18, color: AppTheme.textMuted)
                    : null,
                suffixIcon: _selectedItem != null
                    ? const Icon(Icons.check_circle_rounded,
                        size: 18, color: AppTheme.profit)
                    : null,
                border: InputBorder.none,
                contentPadding:
                    const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSearchResults() {
    final query = _itemController.text;
    if (query.length < 2) return const SizedBox.shrink();

    final results = ref.watch(itemSearchProvider(query));

    return Container(
      margin: const EdgeInsets.only(top: 4),
      constraints: const BoxConstraints(maxHeight: 200),
      decoration: BoxDecoration(
        color: AppTheme.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppTheme.border),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.3),
            blurRadius: 12,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: results.when(
        data: (items) {
          if (items.isEmpty) {
            return Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    'No items found',
                    style: TextStyle(
                        fontSize: 13, color: AppTheme.textMuted),
                  ),
                  const SizedBox(height: 8),
                  GestureDetector(
                    onTap: () {
                      setState(() {
                        _selectedItem = _itemController.text;
                        _selectedIconUrl = null;
                        _showSearch = false;
                      });
                    },
                    child: Text(
                      'Use "${_itemController.text}" anyway',
                      style: const TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        color: AppTheme.primary,
                      ),
                    ),
                  ),
                ],
              ),
            );
          }

          return ClipRRect(
            borderRadius: BorderRadius.circular(12),
            child: ListView.separated(
              shrinkWrap: true,
              padding: EdgeInsets.zero,
              itemCount: items.length,
              separatorBuilder: (_, _) =>
                  const Divider(height: 1, color: AppTheme.border),
              itemBuilder: (context, index) {
                final item = items[index];
                return InkWell(
                  onTap: () {
                    HapticFeedback.selectionClick();
                    setState(() {
                      _selectedItem = item.marketHashName;
                      _selectedIconUrl = item.iconUrl;
                      _itemController.text = item.marketHashName;
                      _showSearch = false;
                    });
                  },
                  child: Padding(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 12, vertical: 10),
                    child: Row(
                      children: [
                        if (item.imageUrl.isNotEmpty) ...[
                          ClipRRect(
                            borderRadius: BorderRadius.circular(4),
                            child: CachedNetworkImage(
                              imageUrl: item.imageUrl,
                              width: 28,
                              height: 28,
                              fit: BoxFit.contain,
                              errorWidget: (_, _, _) =>
                                  const SizedBox(width: 28, height: 28),
                            ),
                          ),
                          const SizedBox(width: 10),
                        ],
                        Expanded(
                          child: Text(
                            item.marketHashName,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.w500,
                              color: AppTheme.textPrimary,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                );
              },
            ),
          );
        },
        loading: () => const Padding(
          padding: EdgeInsets.all(16),
          child: Center(
            child: SizedBox(
              width: 20,
              height: 20,
              child: CircularProgressIndicator(
                strokeWidth: 2,
                color: AppTheme.primary,
              ),
            ),
          ),
        ),
        error: (_, _) => const Padding(
          padding: EdgeInsets.all(16),
          child: Text('Search failed',
              style: TextStyle(color: AppTheme.textMuted, fontSize: 13)),
        ),
      ),
    );
  }

  Widget _buildDatePicker() {
    return GestureDetector(
      onTap: () async {
        final picked = await showDatePicker(
          context: context,
          initialDate: _date,
          firstDate: DateTime(2015),
          lastDate: DateTime.now(),
          builder: (context, child) {
            return Theme(
              data: AppTheme.darkTheme.copyWith(
                colorScheme: const ColorScheme.dark(
                  primary: AppTheme.primary,
                  surface: AppTheme.bgSecondary,
                ),
              ),
              child: child!,
            );
          },
        );
        if (picked != null) {
          HapticFeedback.selectionClick();
          setState(() => _date = picked);
        }
      },
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        decoration: BoxDecoration(
          color: AppTheme.surface,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppTheme.border),
        ),
        child: Row(
          children: [
            const Icon(Icons.calendar_today_rounded,
                size: 16, color: AppTheme.textMuted),
            const SizedBox(width: 10),
            Text(
              DateFormat('MMM d, yyyy').format(_date),
              style: const TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w500,
                color: AppTheme.textPrimary,
              ),
            ),
            const Spacer(),
            const Icon(Icons.keyboard_arrow_down_rounded,
                size: 18, color: AppTheme.textMuted),
          ],
        ),
      ),
    );
  }

  Widget _buildSourceChips() {
    return Wrap(
      spacing: 6,
      runSpacing: 6,
      children: _sources.map((s) {
        final (id, label, icon) = s;
        final selected = _source == id;
        return GestureDetector(
          onTap: () {
            HapticFeedback.selectionClick();
            setState(() => _source = id);
          },
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 200),
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
            decoration: BoxDecoration(
              color: selected
                  ? AppTheme.primary.withValues(alpha: 0.15)
                  : AppTheme.surface,
              borderRadius: BorderRadius.circular(8),
              border: Border.all(
                color: selected
                    ? AppTheme.primary.withValues(alpha: 0.4)
                    : AppTheme.border,
                width: selected ? 1.2 : 0.8,
              ),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(icon,
                    size: 14,
                    color:
                        selected ? AppTheme.primaryLight : AppTheme.textMuted),
                const SizedBox(width: 5),
                Text(
                  label,
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: selected ? FontWeight.w600 : FontWeight.w400,
                    color:
                        selected ? AppTheme.textPrimary : AppTheme.textMuted,
                  ),
                ),
              ],
            ),
          ),
        );
      }).toList(),
    );
  }
}
