import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'steam_auth_service.dart';
import 'session_provider.dart';
import 'widgets/qr_auth_tab.dart';
import 'widgets/credentials_auth_tab.dart';
import 'widgets/clienttoken_auth_tab.dart';
import 'widgets/session_status_widget.dart';

class SteamSessionScreen extends ConsumerWidget {
  final int? accountId;
  final bool linkMode;
  const SteamSessionScreen({super.key, this.accountId, this.linkMode = false});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // Set linkMode in provider so child tabs can access it
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(sessionLinkModeProvider.notifier).state = linkMode;
    });

    final sessionStatus = ref.watch(sessionStatusProvider);
    final isExpired = !linkMode &&
        (sessionStatus.valueOrNull == 'expired' ||
            sessionStatus.valueOrNull == 'none');

    return DefaultTabController(
      length: 2,
      child: Scaffold(
        appBar: AppBar(
          title: Text(linkMode ? 'Link New Account' : 'Steam Session'),
          bottom: TabBar(
            indicatorColor: Theme.of(context).colorScheme.primary,
            indicatorWeight: 3,
            labelColor: Colors.white,
            unselectedLabelColor: Colors.white54,
            labelStyle: const TextStyle(
              fontWeight: FontWeight.w600,
              fontSize: 14,
            ),
            tabs: const [
              Tab(
                icon: Icon(Icons.qr_code_2, size: 20),
                text: 'Quick Auth',
              ),
              Tab(
                icon: Icon(Icons.key, size: 20),
                text: 'Manual',
              ),
            ],
          ),
          actions: linkMode ? null : const [SessionStatusWidget()],
        ),
        body: Column(
          children: [
            // Link mode info banner
            if (linkMode)
              Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                color: Colors.cyanAccent.withAlpha(20),
                child: const Row(
                  children: [
                    Icon(Icons.person_add, color: Colors.cyanAccent, size: 18),
                    SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        'Sign in with a different Steam account to link it.',
                        style: TextStyle(
                          color: Colors.cyanAccent,
                          fontSize: 13,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ),
                  ],
                ),
              ),

            // Session expired banner
            if (isExpired)
              Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                color: const Color(0xFFFF5252).withAlpha(30),
                child: const Row(
                  children: [
                    Icon(Icons.error_outline, color: Color(0xFFFF5252), size: 18),
                    SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        'Steam session expired. Please re-authenticate.',
                        style: TextStyle(
                          color: Color(0xFFFF5252),
                          fontSize: 13,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ),
                  ],
                ),
              ),

            // Tab content
            Expanded(
              child: TabBarView(
                children: [
                  // Quick Auth — QR code (fastest)
                  const QrAuthTab(),
                  // Manual — credentials + token in single scroll
                  _ManualAuthTab(),
                ],
              ),
            ),

            // Steam browser login button at bottom
            SafeArea(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(20, 8, 20, 12),
                child: SizedBox(
                  width: double.infinity,
                  height: 48,
                  child: ElevatedButton.icon(
                    onPressed: () {
                      if (linkMode) {
                        ref.read(authServiceProvider).openSteamLinkLogin(ref);
                      } else {
                        ref.read(authServiceProvider).openSteamLogin();
                      }
                    },
                    icon: const Icon(Icons.open_in_browser, size: 20),
                    label: const Text('Sign in via Steam Browser'),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFF171A21),
                      foregroundColor: Colors.white,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(14),
                      ),
                      elevation: 0,
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Manual auth tab — credentials login + client token in one scrollable view
class _ManualAuthTab extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      child: Column(
        children: [
          // Credentials section
          const CredentialsAuthTab(),
          // Divider
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 24),
            child: Row(
              children: [
                Expanded(child: Divider(color: Colors.white.withAlpha(30))),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  child: Text(
                    'OR',
                    style: TextStyle(
                      color: Colors.white.withAlpha(80),
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
                Expanded(child: Divider(color: Colors.white.withAlpha(30))),
              ],
            ),
          ),
          // Client token section
          const ClientTokenAuthTab(),
        ],
      ),
    );
  }
}
