
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/api_client.dart';
import '../../../core/settings_provider.dart';
import '../../../core/theme.dart';
import '../../../widgets/shared_ui.dart';
import '../manual_tx_provider.dart';
import '../portfolio_pl_provider.dart';
import '../portfolio_provider.dart';
import 'add_transaction_date_picker.dart';
import 'add_transaction_sheet_parts.dart';
import 'add_transaction_source_chips.dart';
import 'add_transaction_type_toggle.dart';

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
          AddTransactionHeader(
            title: 'Add Purchase',
            onClose: () => context.pop(),
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
                  const AddTransactionFieldLabel('ITEM'),
                  const SizedBox(height: 6),
                  AddTransactionItemSearch(
                    controller: _itemController,
                    selectedItem: _selectedItem,
                    selectedIconUrl: _selectedIconUrl,
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
                  ),
                  if (_showSearch)
                    AddTransactionSearchResults(
                      query: _itemController.text,
                      onUseAnyway: () {
                        setState(() {
                          _selectedItem = _itemController.text;
                          _selectedIconUrl = null;
                          _showSearch = false;
                        });
                      },
                      onPick: (name, iconUrl) {
                        setState(() {
                          _selectedItem = name;
                          _selectedIconUrl = iconUrl;
                          _itemController.text = name;
                          _showSearch = false;
                        });
                      },
                    ),
                  const SizedBox(height: 16),

                  // ── Price & Quantity row ──
                  Row(
                    children: [
                      Expanded(
                        flex: 3,
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const AddTransactionFieldLabel('PRICE'),
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
                            const AddTransactionFieldLabel('QTY'),
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
                    AddTransactionTotalRow(
                      totalPrice: _totalPrice,
                      formatter: currency.formatRaw,
                    ),
                  ],
                  const SizedBox(height: 16),

                  // ── Date ──
                  const AddTransactionFieldLabel('DATE'),
                  const SizedBox(height: 6),
                  AddTransactionDatePicker(
                    date: _date,
                    onChanged: (d) => setState(() => _date = d),
                  ),
                  const SizedBox(height: 16),

                  // ── Source ──
                  const AddTransactionFieldLabel('SOURCE'),
                  const SizedBox(height: 6),
                  AddTransactionSourceChips(
                    selected: _source,
                    onChanged: (id) => setState(() => _source = id),
                  ),

                  // ── Portfolio picker ──
                  AddTransactionPortfolioPickerRow(
                    portfolioId: _portfolioId,
                    onPicked: (id) => setState(() => _portfolioId = id),
                  ),
                  const SizedBox(height: 16),

                  // ── Note (optional) ──
                  const AddTransactionFieldLabel('NOTE'),
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
}
