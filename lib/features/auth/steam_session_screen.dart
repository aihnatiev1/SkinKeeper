import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'widgets/qr_auth_tab.dart';
import 'widgets/credentials_auth_tab.dart';
import 'widgets/clienttoken_auth_tab.dart';
import 'widgets/session_status_widget.dart';

class SteamSessionScreen extends ConsumerWidget {
  const SteamSessionScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return DefaultTabController(
      length: 3,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Steam Session'),
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
                text: 'QR Code',
              ),
              Tab(
                icon: Icon(Icons.login, size: 20),
                text: 'Login',
              ),
              Tab(
                icon: Icon(Icons.key, size: 20),
                text: 'Token',
              ),
            ],
          ),
          actions: const [
            SessionStatusWidget(),
          ],
        ),
        body: const TabBarView(
          children: [
            QrAuthTab(),
            CredentialsAuthTab(),
            ClientTokenAuthTab(),
          ],
        ),
      ),
    );
  }
}
