import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../session_provider.dart';

class ClientTokenAuthTab extends ConsumerStatefulWidget {
  const ClientTokenAuthTab({super.key});

  @override
  ConsumerState<ClientTokenAuthTab> createState() => _ClientTokenAuthTabState();
}

class _ClientTokenAuthTabState extends ConsumerState<ClientTokenAuthTab> {
  final _tokenController = TextEditingController();

  @override
  void dispose() {
    _tokenController.dispose();
    super.dispose();
  }

  Future<void> _handleSubmit() async {
    final token = _tokenController.text.trim();
    if (token.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Paste the steamLoginSecure value'),
          backgroundColor: Colors.orangeAccent,
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
        ref.read(sessionStatusProvider.notifier).refresh();
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Steam session connected via client token'),
            backgroundColor: Color(0xFF00E676),
          ),
        );
        context.pop();
      } else if (next.status == 'error' && next.error != null) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Token failed: ${next.error}'),
            backgroundColor: Colors.redAccent,
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
          Container(
            margin: const EdgeInsets.only(left: 36, bottom: 12),
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            decoration: BoxDecoration(
              color: Colors.white.withAlpha(8),
              borderRadius: BorderRadius.circular(8),
            ),
            child: const SelectableText(
              'steamcommunity.com/chat/clientjstoken',
              style: TextStyle(
                color: Color(0xFF00D2D3),
                fontSize: 13,
                fontFamily: 'monospace',
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
              hintStyle: const TextStyle(color: Colors.white24, fontSize: 13),
              filled: true,
              fillColor: Colors.white.withAlpha(10),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(14),
                borderSide: BorderSide(color: Colors.white.withAlpha(30)),
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(14),
                borderSide: BorderSide(color: Colors.white.withAlpha(30)),
              ),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(14),
                borderSide: const BorderSide(
                  color: Color(0xFF6C5CE7),
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
              color: const Color(0xFF6C5CE7).withAlpha(30),
              shape: BoxShape.circle,
            ),
            child: Center(
              child: Text(
                '$number',
                style: const TextStyle(
                  color: Color(0xFF6C5CE7),
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
                  color: Colors.white70,
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
