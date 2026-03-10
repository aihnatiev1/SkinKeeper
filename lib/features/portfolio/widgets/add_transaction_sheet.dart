import 'dart:async';
import 'dart:ui';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../../core/theme.dart';
import '../../../widgets/shared_ui.dart';
import '../manual_tx_provider.dart';
import '../portfolio_pl_provider.dart';
import '../portfolio_provider.dart';

/// Sources for transaction origin
const _sources = [
  ('manual', 'Other', Icons.edit_rounded),
  ('csfloat', 'CSFloat', Icons.storefront_rounded),
  ('buff163', 'Buff163', Icons.store_rounded),
  ('skinport', 'Skinport', Icons.shopping_bag_rounded),
  ('trade', 'Trade', Icons.swap_horiz_rounded),
  ('drop', 'Drop', Icons.card_giftcard_rounded),
];

class AddTransactionSheet extends ConsumerStatefulWidget {
  /// Pre-fill item name (e.g. from inventory "Log Purchase")
  final String? initialItemName;
  final String? initialIconUrl;

  const AddTransactionSheet({
    super.key,
    this.initialItemName,
    this.initialIconUrl,
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
  final _searchDebounce = Debouncer(milliseconds: 400);

  String _type = 'buy'; // buy or sell
  String _source = 'manual';
  DateTime _date = DateTime.now();
  String? _selectedItem;
  String? _selectedIconUrl;
  bool _showSearch = false;
  bool _saving = false;
  String _searchQuery = '';

  @override
  void initState() {
    super.initState();
    if (widget.initialItemName != null) {
      _itemController.text = widget.initialItemName!;
      _selectedItem = widget.initialItemName;
      _selectedIconUrl = widget.initialIconUrl;
    }
  }

  @override
  void dispose() {
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
      (double.tryParse(_priceController.text) ?? 0) > 0;

  int get _priceCents {
    final price = double.tryParse(_priceController.text) ?? 0;
    return (price * 100).round();
  }

  int get _quantity => int.tryParse(_qtyController.text) ?? 1;

  double get _totalPrice =>
      (double.tryParse(_priceController.text) ?? 0) * _quantity;

  Future<void> _save() async {
    if (!_isValid || _saving) return;
    setState(() => _saving = true);

    try {
      final service = ref.read(manualTxServiceProvider);
      final success = await service.addTransaction(
        marketHashName: _selectedItem!,
        priceCentsPerUnit: _priceCents,
        quantity: _quantity,
        type: _type,
        date: _date,
        source: _source,
        note: _noteController.text.isNotEmpty ? _noteController.text : null,
        iconUrl: _selectedIconUrl,
      );

      if (success && mounted) {
        HapticFeedback.mediumImpact();
        // Refresh P/L data
        ref.invalidate(portfolioPLProvider);
        ref.invalidate(itemsPLProvider);
        ref.invalidate(portfolioProvider);
        Navigator.of(context).pop(true);
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
    final bottomInset = MediaQuery.of(context).viewInsets.bottom;

    return Container(
      constraints: BoxConstraints(
        maxHeight: MediaQuery.of(context).size.height * 0.92,
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
                  'Log Transaction',
                  style: TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.w700,
                    color: AppTheme.textPrimary,
                  ),
                ),
                const Spacer(),
                GestureDetector(
                  onTap: () => Navigator.pop(context),
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
              padding: EdgeInsets.fromLTRB(20, 0, 20, 20 + bottomInset),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // ── Buy / Sell toggle ──
                  _TypeToggle(
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
                            _buildLabel('PRICE PER UNIT (\$)'),
                            const SizedBox(height: 6),
                            _buildTextField(
                              controller: _priceController,
                              hint: '0.00',
                              keyboardType:
                                  const TextInputType.numberWithOptions(
                                      decimal: true),
                              prefixIcon: Icons.attach_money_rounded,
                              inputFormatters: [
                                FilteringTextInputFormatter.allow(
                                    RegExp(r'^\d*\.?\d{0,2}')),
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
                            _buildLabel('QUANTITY'),
                            const SizedBox(height: 6),
                            _buildTextField(
                              controller: _qtyController,
                              hint: '1',
                              keyboardType: TextInputType.number,
                              prefixIcon: Icons.tag_rounded,
                              inputFormatters: [
                                FilteringTextInputFormatter.digitsOnly,
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
                            '\$${_totalPrice.toStringAsFixed(2)}',
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
                  const SizedBox(height: 16),

                  // ── Note (optional) ──
                  _buildLabel('NOTE (OPTIONAL)'),
                  const SizedBox(height: 6),
                  _buildTextField(
                    controller: _noteController,
                    hint: 'e.g. "Bought from friend"',
                    prefixIcon: Icons.notes_rounded,
                    maxLines: 1,
                  ),
                  const SizedBox(height: 24),

                  // ── Save button ──
                  GradientButton(
                    label: _saving
                        ? 'Saving...'
                        : _type == 'buy'
                            ? 'Log Purchase'
                            : 'Log Sale',
                    icon: _type == 'buy'
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
    );
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
    TextInputType? keyboardType,
    List<TextInputFormatter>? inputFormatters,
    ValueChanged<String>? onChanged,
    int maxLines = 1,
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
                      'https://community.steamstatic.com/economy/image/$_selectedIconUrl/64fx64f',
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
                _searchDebounce.run(() {
                  if (mounted) {
                    setState(() {
                      _searchQuery = v;
                      _showSearch = v.length >= 2;
                      if (v != _selectedItem) {
                        _selectedItem = null;
                        _selectedIconUrl = null;
                      }
                    });
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
    if (_searchQuery.length < 2) return const SizedBox.shrink();

    final results = ref.watch(itemSearchProvider(_searchQuery));

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

// ─── Type toggle ──────────────────────────────────────────────
class _TypeToggle extends StatelessWidget {
  final String value;
  final ValueChanged<String> onChanged;

  const _TypeToggle({required this.value, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 44,
      decoration: BoxDecoration(
        color: AppTheme.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppTheme.border),
      ),
      padding: const EdgeInsets.all(3),
      child: Row(
        children: [
          _TypeBtn(
            label: 'Buy',
            icon: Icons.add_rounded,
            isActive: value == 'buy',
            color: AppTheme.profit,
            onTap: () => onChanged('buy'),
          ),
          _TypeBtn(
            label: 'Sell',
            icon: Icons.remove_rounded,
            isActive: value == 'sell',
            color: AppTheme.loss,
            onTap: () => onChanged('sell'),
          ),
        ],
      ),
    );
  }
}

class _TypeBtn extends StatelessWidget {
  final String label;
  final IconData icon;
  final bool isActive;
  final Color color;
  final VoidCallback onTap;

  const _TypeBtn({
    required this.label,
    required this.icon,
    required this.isActive,
    required this.color,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: GestureDetector(
        onTap: () {
          HapticFeedback.selectionClick();
          onTap();
        },
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 200),
          decoration: BoxDecoration(
            color: isActive ? color.withValues(alpha: 0.15) : Colors.transparent,
            borderRadius: BorderRadius.circular(10),
          ),
          child: Center(
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(icon, size: 16, color: isActive ? color : AppTheme.textDisabled),
                const SizedBox(width: 4),
                Text(
                  label,
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: isActive ? FontWeight.w700 : FontWeight.w400,
                    color: isActive ? color : AppTheme.textDisabled,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

// ─── Debouncer ─────────────────────────────────────────────────
class Debouncer {
  final int milliseconds;
  Timer? _timer;

  Debouncer({required this.milliseconds});

  void run(VoidCallback action) {
    _timer?.cancel();
    _timer = Timer(Duration(milliseconds: milliseconds), action);
  }
}
