import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api_client.dart';
import '../../../core/theme.dart';
import '../../../models/profit_loss.dart';
import '../../../widgets/glass_sheet.dart';
import '../portfolio_pl_provider.dart';
import '../portfolio_provider.dart';

const _kPortfolioColors = [
  Color(0xFF6366F1),
  Color(0xFF10B981),
  Color(0xFFF59E0B),
  Color(0xFFEF4444),
  Color(0xFF8B5CF6),
  Color(0xFF06B6D4),
];

class CreatePortfolioSheet extends ConsumerStatefulWidget {
  const CreatePortfolioSheet({super.key});

  @override
  ConsumerState<CreatePortfolioSheet> createState() =>
      _CreatePortfolioSheetState();
}

class _CreatePortfolioSheetState extends ConsumerState<CreatePortfolioSheet> {
  final _nameCtrl = TextEditingController();
  Color _color = _kPortfolioColors[0];
  bool _saving = false;
  String? _error;

  @override
  void dispose() {
    _nameCtrl.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final name = _nameCtrl.text.trim();
    if (name.isEmpty) {
      setState(() => _error = 'Name is required');
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await ref.read(portfoliosProvider.notifier).createPortfolio(name, _color);
      if (mounted) Navigator.of(context).pop();
    } catch (e) {
      setState(() {
        _error = 'Failed to create portfolio';
        _saving = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        left: 20,
        right: 20,
        top: 20,
        bottom: MediaQuery.viewInsetsOf(context).bottom + 20,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'New Portfolio',
            style: AppTheme.bodySmall.copyWith(
              fontWeight: FontWeight.w700,
              fontSize: 16,
              color: AppTheme.textPrimary,
            ),
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _nameCtrl,
            autofocus: true,
            style: AppTheme.bodySmall.copyWith(color: AppTheme.textPrimary),
            decoration: InputDecoration(
              hintText: 'Portfolio name',
              hintStyle: AppTheme.bodySmall.copyWith(color: AppTheme.textMuted),
              errorText: _error,
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(8),
                borderSide: BorderSide(color: AppTheme.divider),
              ),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(8),
                borderSide: BorderSide(color: AppTheme.primary),
              ),
              errorBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(8),
                borderSide: const BorderSide(color: Color(0xFFEF4444)),
              ),
              focusedErrorBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(8),
                borderSide: const BorderSide(color: Color(0xFFEF4444)),
              ),
              contentPadding:
                  const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            ),
          ),
          const SizedBox(height: 16),
          Text('Color',
              style: AppTheme.captionSmall.copyWith(color: AppTheme.textMuted)),
          const SizedBox(height: 8),
          Row(
            children: [
              for (final c in _kPortfolioColors) ...[
                GestureDetector(
                  onTap: () => setState(() => _color = c),
                  child: Container(
                    width: 32,
                    height: 32,
                    margin: const EdgeInsets.only(right: 8),
                    decoration: BoxDecoration(
                      color: c,
                      shape: BoxShape.circle,
                      border: Border.all(
                        color: _color == c ? Colors.white : Colors.transparent,
                        width: 2,
                      ),
                      boxShadow: _color == c
                          ? [
                              BoxShadow(
                                  color: c.withValues(alpha: 0.5),
                                  blurRadius: 6)
                            ]
                          : null,
                    ),
                  ),
                ),
              ],
            ],
          ),
          const SizedBox(height: 20),
          SizedBox(
            width: double.infinity,
            child: FilledButton(
              onPressed: _saving ? null : _save,
              style: FilledButton.styleFrom(backgroundColor: AppTheme.primary),
              child: _saving
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(
                          strokeWidth: 2, color: Colors.white))
                  : const Text('Create'),
            ),
          ),
        ],
      ),
    );
  }
}

class PortfolioOptionsSheet extends ConsumerWidget {
  final Portfolio portfolio;
  const PortfolioOptionsSheet({super.key, required this.portfolio});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 20, 20, 32),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 12,
                height: 12,
                decoration: BoxDecoration(
                    color: portfolio.color, shape: BoxShape.circle),
              ),
              const SizedBox(width: 8),
              Text(
                portfolio.name,
                style: AppTheme.bodySmall.copyWith(
                  fontWeight: FontWeight.w700,
                  color: AppTheme.textPrimary,
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          ListTile(
            leading:
                Icon(Icons.edit_outlined, color: AppTheme.textSecondary),
            title: Text('Edit',
                style:
                    AppTheme.bodySmall.copyWith(color: AppTheme.textPrimary)),
            onTap: () {
              Navigator.of(context).pop();
              showGlassSheet(
                  context, EditPortfolioSheet(portfolio: portfolio));
            },
            contentPadding: EdgeInsets.zero,
            dense: true,
          ),
          ListTile(
            leading: const Icon(Icons.delete_outline,
                color: Color(0xFFEF4444)),
            title: Text('Delete',
                style: AppTheme.bodySmall
                    .copyWith(color: const Color(0xFFEF4444))),
            onTap: () async {
              Navigator.of(context).pop();
              final navContext =
                  Navigator.of(context, rootNavigator: true).context;
              await Future.delayed(const Duration(milliseconds: 150));

              final confirmed = await showDialog<bool>(
                context: navContext,
                builder: (dialogCtx) => AlertDialog(
                  backgroundColor: AppTheme.surface,
                  title: Text(
                    'Delete "${portfolio.name}"?',
                    style: AppTheme.bodySmall.copyWith(
                      color: AppTheme.textPrimary,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  content: Text(
                    'Transactions in this portfolio will become untagged.',
                    style: AppTheme.bodySmall
                        .copyWith(color: AppTheme.textMuted),
                  ),
                  actions: [
                    TextButton(
                      onPressed: () => Navigator.pop(dialogCtx, false),
                      child: Text('Cancel',
                          style: TextStyle(color: AppTheme.textMuted)),
                    ),
                    TextButton(
                      onPressed: () => Navigator.pop(dialogCtx, true),
                      child: const Text('Delete',
                          style: TextStyle(color: Color(0xFFEF4444))),
                    ),
                  ],
                ),
              );
              if (confirmed == true) {
                try {
                  await ref
                      .read(portfoliosProvider.notifier)
                      .deletePortfolio(portfolio.id);
                  if (ref.read(selectedPortfolioIdProvider) == portfolio.id) {
                    ref.read(selectedPortfolioIdProvider.notifier).state =
                        null;
                  }
                  ref.invalidate(portfolioPLProvider);
                  ref.invalidate(portfolioProvider);
                  ref.invalidate(portfoliosProvider);
                  ref.invalidate(itemsPLProvider);
                } catch (e) {
                  if (context.mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(
                          content:
                              Text('Delete failed: ${friendlyError(e)}'),
                          backgroundColor: AppTheme.loss),
                    );
                  }
                }
              }
            },
            contentPadding: EdgeInsets.zero,
            dense: true,
          ),
        ],
      ),
    );
  }
}

class EditPortfolioSheet extends ConsumerStatefulWidget {
  final Portfolio portfolio;
  const EditPortfolioSheet({super.key, required this.portfolio});

  @override
  ConsumerState<EditPortfolioSheet> createState() =>
      _EditPortfolioSheetState();
}

class _EditPortfolioSheetState extends ConsumerState<EditPortfolioSheet> {
  late final TextEditingController _nameCtrl;
  late Color _color;
  bool _saving = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _nameCtrl = TextEditingController(text: widget.portfolio.name);
    _color = widget.portfolio.color;
  }

  @override
  void dispose() {
    _nameCtrl.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final name = _nameCtrl.text.trim();
    if (name.isEmpty) {
      setState(() => _error = 'Name is required');
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await ref
          .read(portfoliosProvider.notifier)
          .updatePortfolio(widget.portfolio.id, name, _color);
      if (mounted) Navigator.of(context).pop();
    } catch (e) {
      setState(() {
        _error = 'Failed to update portfolio';
        _saving = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        left: 20,
        right: 20,
        top: 20,
        bottom: MediaQuery.viewInsetsOf(context).bottom + 20,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Edit Portfolio',
            style: AppTheme.bodySmall.copyWith(
              fontWeight: FontWeight.w700,
              fontSize: 16,
              color: AppTheme.textPrimary,
            ),
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _nameCtrl,
            style: AppTheme.bodySmall.copyWith(color: AppTheme.textPrimary),
            decoration: InputDecoration(
              hintText: 'Portfolio name',
              hintStyle: AppTheme.bodySmall.copyWith(color: AppTheme.textMuted),
              errorText: _error,
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(8),
                borderSide: BorderSide(color: AppTheme.divider),
              ),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(8),
                borderSide: BorderSide(color: AppTheme.primary),
              ),
              errorBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(8),
                borderSide: const BorderSide(color: Color(0xFFEF4444)),
              ),
              focusedErrorBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(8),
                borderSide: const BorderSide(color: Color(0xFFEF4444)),
              ),
              contentPadding:
                  const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            ),
          ),
          const SizedBox(height: 16),
          Text('Color',
              style: AppTheme.captionSmall.copyWith(color: AppTheme.textMuted)),
          const SizedBox(height: 8),
          Row(
            children: [
              for (final c in _kPortfolioColors) ...[
                GestureDetector(
                  onTap: () => setState(() => _color = c),
                  child: Container(
                    width: 32,
                    height: 32,
                    margin: const EdgeInsets.only(right: 8),
                    decoration: BoxDecoration(
                      color: c,
                      shape: BoxShape.circle,
                      border: Border.all(
                        color: _color == c ? Colors.white : Colors.transparent,
                        width: 2,
                      ),
                      boxShadow: _color == c
                          ? [
                              BoxShadow(
                                  color: c.withValues(alpha: 0.5),
                                  blurRadius: 6)
                            ]
                          : null,
                    ),
                  ),
                ),
              ],
            ],
          ),
          const SizedBox(height: 20),
          SizedBox(
            width: double.infinity,
            child: FilledButton(
              onPressed: _saving ? null : _save,
              style: FilledButton.styleFrom(backgroundColor: AppTheme.primary),
              child: _saving
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(
                          strokeWidth: 2, color: Colors.white))
                  : const Text('Save'),
            ),
          ),
        ],
      ),
    );
  }
}
