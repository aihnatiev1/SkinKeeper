import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../../core/api_client.dart';
import '../../../core/theme.dart';
import '../session_provider.dart';
import '../../settings/accounts_provider.dart';

class ClientTokenAuthTab extends ConsumerStatefulWidget {
  final bool isLinking;
  const ClientTokenAuthTab({super.key, this.isLinking = false});

  @override
  ConsumerState<ClientTokenAuthTab> createState() => _ClientTokenAuthTabState();
}

class _ClientTokenAuthTabState extends ConsumerState<ClientTokenAuthTab> {
  final _tokenController = TextEditingController();
  // Saved in initState so we can reset it in dispose() without using ref.
  StateController<bool>? _sessionLinkModeNotifier;

  @override
  void initState() {
    super.initState();
    if (widget.isLinking) {
      _sessionLinkModeNotifier = ref.read(sessionLinkModeProvider.notifier);
      WidgetsBinding.instance.addPostFrameCallback((_) {
        _sessionLinkModeNotifier?.state = true;
      });
    }
  }

  @override
  void dispose() {
    final notifier = _sessionLinkModeNotifier;
    if (notifier != null) {
      Future(() => notifier.state = false);
    }
    _tokenController.dispose();
    super.dispose();
  }

  Future<void> _handleSubmit() async {
    final token = _tokenController.text.trim();
    if (token.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Paste the steamLoginSecure value'),
          backgroundColor: AppTheme.warning,
        ),
      );
      return;
    }
    await ref.read(clientTokenAuthProvider.notifier).submitToken(token);
  }

  @override
  Widget build(BuildContext context) {
    final tokenState = ref.watch(clientTokenAuthProvider);
    final theme = Theme.of(context);

    ref.listen<ClientTokenAuthState>(clientTokenAuthProvider, (prev, next) {
      if (next.status == 'authenticated') {

        final linkMode = ref.read(sessionLinkModeProvider);
        if (linkMode) {
          ref.invalidate(accountsProvider);
        } else {
          ref.read(sessionStatusProvider.notifier).refresh();
        }
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(linkMode
                ? 'New account linked successfully!'
                : 'Steam session connected'),
            backgroundColor: const Color(0xFF00E676),
          ),
        );
        if (GoRouter.of(context).canPop()) {
          context.pop();
        } else {
          context.go('/portfolio');
        }
      } else if (next.status == 'error' && next.error != null) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Token failed: ${friendlyError(next.error)}'),
            backgroundColor: AppTheme.loss,
          ),
        );
      }
    });

    return SingleChildScrollView(
      padding: const EdgeInsets.all(24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const SizedBox(height: 16),
          Text(
            'Paste Client Token',
            style: theme.textTheme.titleLarge?.copyWith(color: Colors.white),
          ),
          const SizedBox(height: 8),
          Text(
            'Extract the steamLoginSecure cookie from your browser.',
            style: theme.textTheme.bodyMedium?.copyWith(
              color: Colors.white60,
            ),
          ),
          const SizedBox(height: 24),

          // Instructions
          _buildInstructionStep(1, 'Open Steam in your browser'),
          _buildInstructionStep(2, 'Navigate to:'),
          GestureDetector(
            onTap: () => launchUrl(
              Uri.parse('https://steamcommunity.com/chat/clientjstoken'),
              mode: LaunchMode.externalApplication,
            ),
            onLongPress: () {
              Clipboard.setData(const ClipboardData(
                text: 'https://steamcommunity.com/chat/clientjstoken',
              ));
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(
                  content: Text('URL copied'),
                  duration: Duration(seconds: 1),
                ),
              );
            },
            child: Container(
              margin: const EdgeInsets.only(left: 36, bottom: 12),
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(
                color: AppTheme.surface,
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Row(
                children: [
                  Icon(Icons.open_in_new, size: 14, color: AppTheme.accent),
                  SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'steamcommunity.com/chat/clientjstoken',
                      style: TextStyle(
                        color: AppTheme.accent,
                        fontSize: 13,
                        fontFamily: 'monospace',
                        decoration: TextDecoration.underline,
                        decorationColor: AppTheme.accent,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
          _buildInstructionStep(3, 'Copy the steamLoginSecure value'),
          _buildInstructionStep(4, 'Paste it below'),

          const SizedBox(height: 24),

          // Token input
          TextField(
            controller: _tokenController,
            enabled: !tokenState.loading,
            maxLines: 3,
            decoration: InputDecoration(
              hintText: 'Paste steamLoginSecure value here...',
              hintStyle: const TextStyle(color: AppTheme.textDisabled, fontSize: 13),
              filled: true,
              fillColor: AppTheme.surface,
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(14),
                borderSide: BorderSide(color: AppTheme.border),
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(14),
                borderSide: BorderSide(color: AppTheme.border),
              ),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(14),
                borderSide: const BorderSide(
                  color: AppTheme.primary,
                  width: 1.5,
                ),
              ),
              contentPadding: const EdgeInsets.all(16),
            ),
            style: const TextStyle(
              color: Colors.white,
              fontFamily: 'monospace',
              fontSize: 13,
            ),
          ),
          const SizedBox(height: 24),

          // Submit button
          SizedBox(
            height: 52,
            child: ElevatedButton(
              onPressed: tokenState.loading ? null : _handleSubmit,
              style: ElevatedButton.styleFrom(
                backgroundColor: theme.colorScheme.primary,
                foregroundColor: Colors.white,
                disabledBackgroundColor: theme.colorScheme.primary.withAlpha(80),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(14),
                ),
              ),
              child: tokenState.loading
                  ? const SizedBox(
                      width: 22,
                      height: 22,
                      child: CircularProgressIndicator(
                        strokeWidth: 2.5,
                        color: Colors.white,
                      ),
                    )
                  : const Text(
                      'Submit Token',
                      style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildInstructionStep(int number, String text) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 24,
            height: 24,
            decoration: BoxDecoration(
              color: AppTheme.primary.withValues(alpha: 0.12),
              shape: BoxShape.circle,
            ),
            child: Center(
              child: Text(
                '$number',
                style: const TextStyle(
                  color: AppTheme.primary,
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Padding(
              padding: const EdgeInsets.only(top: 3),
              child: Text(
                text,
                style: const TextStyle(
                  color: AppTheme.textSecondary,
                  fontSize: 14,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
