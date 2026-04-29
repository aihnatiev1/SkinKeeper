import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/api_client.dart';
import '../../../core/theme.dart';
import '../session_provider.dart';
import '../../settings/accounts_provider.dart';

class CredentialsAuthTab extends ConsumerStatefulWidget {
  const CredentialsAuthTab({super.key});

  @override
  ConsumerState<CredentialsAuthTab> createState() => _CredentialsAuthTabState();
}

class _CredentialsAuthTabState extends ConsumerState<CredentialsAuthTab> {
  final _usernameController = TextEditingController();
  final _passwordController = TextEditingController();
  final _guardCodeController = TextEditingController();

  @override
  void dispose() {
    _usernameController.dispose();
    _passwordController.dispose();
    _guardCodeController.dispose();
    super.dispose();
  }

  Future<void> _handleLogin() async {
    final username = _usernameController.text.trim();
    final password = _passwordController.text;
    if (username.isEmpty || password.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Enter both username and password'),
          backgroundColor: Colors.orangeAccent,
        ),
      );
      return;
    }
    await ref.read(credentialAuthProvider.notifier).login(username, password);
  }

  Future<void> _handleGuardSubmit() async {
    final code = _guardCodeController.text.trim();
    if (code.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Enter the Steam Guard code'),
          backgroundColor: Colors.orangeAccent,
        ),
      );
      return;
    }
    await ref.read(credentialAuthProvider.notifier).submitGuard(code);
  }

  @override
  Widget build(BuildContext context) {
    final credState = ref.watch(credentialAuthProvider);
    final theme = Theme.of(context);

    // Listen for status changes
    ref.listen<CredentialAuthState>(credentialAuthProvider, (prev, next) {
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
            content: Text('Login failed: ${friendlyError(next.error)}'),
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

          // Step indicator
          if (credState.status == 'guard')
            _buildStepBanner(
              'Steam Guard code required',
              'Check your email or authenticator app for the code.',
              const Color(0xFFFFAB00),
            ),

          if (credState.status != 'guard') ...[
            Text(
              'Sign in with Steam credentials',
              style: theme.textTheme.titleLarge?.copyWith(color: Colors.white),
            ),
            const SizedBox(height: 8),
            Text(
              'Your credentials are sent directly to Steam and are never stored.',
              style: theme.textTheme.bodyMedium?.copyWith(
                color: Colors.white60,
              ),
            ),
            const SizedBox(height: 24),

            // Username field
            TextField(
              controller: _usernameController,
              enabled: !credState.loading,
              decoration: _inputDecoration('Steam username', Icons.person_outline),
              style: const TextStyle(color: Colors.white),
              textInputAction: TextInputAction.next,
            ),
            const SizedBox(height: 16),

            // Password field
            TextField(
              controller: _passwordController,
              enabled: !credState.loading,
              obscureText: true,
              decoration: _inputDecoration('Password', Icons.lock_outline),
              style: const TextStyle(color: Colors.white),
              textInputAction: TextInputAction.done,
              onSubmitted: (_) => _handleLogin(),
            ),
            const SizedBox(height: 24),

            // Login button
            SizedBox(
              height: 52,
              child: ElevatedButton(
                onPressed: credState.loading ? null : _handleLogin,
                style: ElevatedButton.styleFrom(
                  backgroundColor: theme.colorScheme.primary,
                  foregroundColor: Colors.white,
                  disabledBackgroundColor: theme.colorScheme.primary.withAlpha(80),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(14),
                  ),
                ),
                child: credState.loading
                    ? const SizedBox(
                        width: 22,
                        height: 22,
                        child: CircularProgressIndicator(
                          strokeWidth: 2.5,
                          color: Colors.white,
                        ),
                      )
                    : const Text(
                        'Login',
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
              ),
            ),
          ],

          // Guard code step
          if (credState.status == 'guard') ...[
            const SizedBox(height: 24),
            TextField(
              controller: _guardCodeController,
              enabled: !credState.loading,
              decoration: _inputDecoration('Steam Guard code', Icons.security),
              style: const TextStyle(
                color: Colors.white,
                letterSpacing: 4,
                fontSize: 20,
              ),
              textAlign: TextAlign.center,
              keyboardType: TextInputType.text,
              textInputAction: TextInputAction.done,
              onSubmitted: (_) => _handleGuardSubmit(),
            ),
            const SizedBox(height: 24),

            SizedBox(
              height: 52,
              child: ElevatedButton(
                onPressed: credState.loading ? null : _handleGuardSubmit,
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFFFFAB00),
                  foregroundColor: Colors.black87,
                  disabledBackgroundColor: const Color(0xFFFFAB00).withAlpha(80),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(14),
                  ),
                ),
                child: credState.loading
                    ? const SizedBox(
                        width: 22,
                        height: 22,
                        child: CircularProgressIndicator(
                          strokeWidth: 2.5,
                          color: Colors.black54,
                        ),
                      )
                    : const Text(
                        'Submit Code',
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildStepBanner(String title, String subtitle, Color color) {
    return Container(
      margin: const EdgeInsets.only(bottom: 24),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: color.withAlpha(20),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withAlpha(60)),
      ),
      child: Row(
        children: [
          Icon(Icons.security, color: color, size: 28),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: TextStyle(
                    color: color,
                    fontWeight: FontWeight.w600,
                    fontSize: 14,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  subtitle,
                  style: TextStyle(
                    color: color.withAlpha(180),
                    fontSize: 12,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  InputDecoration _inputDecoration(String hint, IconData icon) {
    return InputDecoration(
      hintText: hint,
      hintStyle: const TextStyle(color: AppTheme.textMuted),
      prefixIcon: Icon(icon, color: AppTheme.textMuted, size: 20),
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
        borderSide: const BorderSide(color: Color(0xFF6C5CE7), width: 1.5),
      ),
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
    );
  }
}
