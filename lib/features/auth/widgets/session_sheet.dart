import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../../core/theme.dart';
import '../../../l10n/app_localizations.dart';
import '../../../widgets/shared_ui.dart';
import '../../settings/steam_session_provider.dart';

void showSteamSessionSheet(BuildContext context, WidgetRef ref) {
  showModalBottomSheet(
    context: context,
    useRootNavigator: true,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (_) => SteamSessionSheet(ref: ref),
  );
}

class SteamSessionSheet extends StatefulWidget {
  final WidgetRef ref;

  const SteamSessionSheet({super.key, required this.ref});

  @override
  State<SteamSessionSheet> createState() => _SteamSessionSheetState();
}

class _SteamSessionSheetState extends State<SteamSessionSheet> {
  final _controller = TextEditingController();
  bool _loading = false;
  String? _error;
  String? _success;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final text = _controller.text.trim();
    if (text.isEmpty) return;

    setState(() {
      _loading = true;
      _error = null;
      _success = null;
    });

    try {
      final msg = await widget.ref
          .read(steamSessionStatusProvider.notifier)
          .submitClientToken(text);
      setState(() {
        _success = msg;
        _loading = false;
      });
    } catch (e) {
      setState(() {
        _error = e.toString().replaceFirst('Exception: ', '');
        _loading = false;
      });
    }
  }

  Future<void> _paste() async {
    final data = await Clipboard.getData(Clipboard.kTextPlain);
    if (data?.text != null) {
      _controller.text = data!.text!;
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final bottom = MediaQuery.of(context).viewInsets.bottom;
    return Container(
      decoration: const BoxDecoration(
        color: AppTheme.surface,
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      padding: EdgeInsets.fromLTRB(20, 12, 20, bottom + 24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Drag handle
          Center(
            child: Container(
              width: 36, height: 4,
              decoration: BoxDecoration(
                color: AppTheme.textDisabled.withValues(alpha: 0.4),
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),
          const SizedBox(height: 16),

          // Header
          Row(
            children: [
              Container(
                width: 36, height: 36,
                decoration: BoxDecoration(
                  color: AppTheme.accent.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: const Icon(Icons.vpn_key, color: AppTheme.accent, size: 18),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  l10n.connectSteamSession,
                  style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700),
                ),
              ),
              IconButton(
                icon: const Icon(Icons.close, size: 20, color: AppTheme.textMuted),
                onPressed: () => Navigator.pop(context),
                padding: EdgeInsets.zero,
                constraints: const BoxConstraints(),
              ),
            ],
          ),
          const SizedBox(height: 20),

          // Step 1
          _StepRow(
            number: '1',
            label: 'Open this URL while logged into Steam',
            child: FilledButton.icon(
              style: FilledButton.styleFrom(
                backgroundColor: AppTheme.accent.withValues(alpha: 0.15),
                foregroundColor: AppTheme.accent,
                minimumSize: const Size(double.infinity, 44),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
              ),
              icon: const Icon(Icons.open_in_new, size: 16),
              label: const Text(
                'steamcommunity.com/chat/clientjstoken',
                style: TextStyle(fontSize: 12, fontFamily: 'monospace'),
              ),
              onPressed: () => launchUrl(
                Uri.parse('https://steamcommunity.com/chat/clientjstoken'),
                mode: LaunchMode.externalApplication,
              ),
            ),
          ),
          const SizedBox(height: 16),

          // Step 2
          _StepRow(
            number: '2',
            label: 'Paste the full JSON response',
            child: TextField(
              controller: _controller,
              maxLines: 3,
              style: const TextStyle(fontSize: 12, fontFamily: 'monospace', color: Colors.white),
              decoration: InputDecoration(
                hintText: '{"logged_in":true,"steamid":"...","token":"..."}',
                hintStyle: const TextStyle(color: AppTheme.textDisabled, fontSize: 11),
                filled: true,
                fillColor: AppTheme.bg,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(10),
                  borderSide: BorderSide.none,
                ),
                contentPadding: const EdgeInsets.fromLTRB(12, 10, 48, 10),
                suffixIcon: IconButton(
                  icon: const Icon(Icons.paste_rounded, size: 18, color: AppTheme.textMuted),
                  onPressed: _paste,
                  tooltip: 'Paste',
                ),
              ),
            ),
          ),
          const SizedBox(height: 16),

          if (_error != null)
            Container(
              width: double.infinity,
              margin: const EdgeInsets.only(bottom: 12),
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(
                color: AppTheme.loss.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: AppTheme.loss.withValues(alpha: 0.3)),
              ),
              child: Text(_error!, style: const TextStyle(color: AppTheme.loss, fontSize: 13)),
            ),
          if (_success != null)
            Container(
              width: double.infinity,
              margin: const EdgeInsets.only(bottom: 12),
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(
                color: AppTheme.profit.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: AppTheme.profit.withValues(alpha: 0.3)),
              ),
              child: Text(_success!, style: const TextStyle(color: AppTheme.profit, fontSize: 13)),
            ),

          GradientButton(
            label: l10n.connect,
            onPressed: _loading ? null : _submit,
            isLoading: _loading,
            height: 48,
          ),
        ],
      ),
    );
  }
}

class _StepRow extends StatelessWidget {
  final String number;
  final String label;
  final Widget child;

  const _StepRow({required this.number, required this.label, required this.child});

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: 22, height: 22,
          decoration: BoxDecoration(
            color: AppTheme.accent.withValues(alpha: 0.15),
            shape: BoxShape.circle,
          ),
          alignment: Alignment.center,
          child: Text(
            number,
            style: const TextStyle(
              color: AppTheme.accent,
              fontSize: 11,
              fontWeight: FontWeight.w700,
            ),
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(label, style: const TextStyle(fontSize: 13, color: AppTheme.textSecondary)),
              const SizedBox(height: 8),
              child,
            ],
          ),
        ),
      ],
    );
  }
}
