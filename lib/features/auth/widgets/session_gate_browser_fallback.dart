import 'package:flutter/material.dart';

import '../../../core/theme.dart';
import '../session_provider.dart';
import 'session_gate_step_card.dart';

class SessionGateBrowserFallbackSection extends StatelessWidget {
  final int step;
  final ClientTokenAuthState tokenState;
  final String? autoStatus;
  final bool showManualPaste;
  final TextEditingController tokenController;
  final VoidCallback onOpenSteam;
  final VoidCallback onOpenToken;
  final VoidCallback onSubmit;
  final Widget? statusBanner;

  const SessionGateBrowserFallbackSection({
    super.key,
    required this.step,
    required this.tokenState,
    required this.autoStatus,
    required this.showManualPaste,
    required this.tokenController,
    required this.onOpenSteam,
    required this.onOpenToken,
    required this.onSubmit,
    this.statusBanner,
  });

  @override
  Widget build(BuildContext context) {
    return Theme(
      data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
      child: ExpansionTile(
        tilePadding: EdgeInsets.zero,
        childrenPadding: const EdgeInsets.only(bottom: 16),
        title: Row(
          children: [
            Icon(Icons.help_outline_rounded,
                size: 16, color: Colors.white.withValues(alpha: 0.35)),
            const SizedBox(width: 8),
            Text(
              'Having trouble? Use browser instead',
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w500,
                color: Colors.white.withValues(alpha: 0.35),
              ),
            ),
          ],
        ),
        children: [
          SessionGateStepCard(
            step: 1,
            currentStep: step,
            title: 'Sign in to Steam',
            description: "We'll open Steam in your browser.\nLog in if needed.",
            buttonLabel: 'Open Steam',
            buttonIcon: Icons.open_in_new_rounded,
            onTap: tokenState.loading ? null : onOpenSteam,
          ),
          const SizedBox(height: 12),
          SessionGateStepCard(
            step: 2,
            currentStep: step,
            title: 'Copy your session',
            description: "We'll open a special page.\nTap Select All then Copy.",
            buttonLabel: 'Open & Copy',
            buttonIcon: Icons.content_copy_rounded,
            onTap: step >= 2 && !tokenState.loading ? onOpenToken : null,
          ),
          if (statusBanner != null) ...[
            const SizedBox(height: 16),
            statusBanner!,
          ],
          if (showManualPaste || tokenController.text.isNotEmpty) ...[
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: tokenController,
                    decoration: InputDecoration(
                      hintText: 'Paste token here...',
                      hintStyle: const TextStyle(fontSize: 12),
                      filled: true,
                      fillColor: AppTheme.surface,
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(10),
                        borderSide: BorderSide.none,
                      ),
                      contentPadding: const EdgeInsets.symmetric(
                          horizontal: 12, vertical: 10),
                    ),
                    style: const TextStyle(fontSize: 12, fontFamily: 'monospace'),
                  ),
                ),
                const SizedBox(width: 8),
                ElevatedButton(
                  onPressed: tokenState.loading ? null : onSubmit,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppTheme.primary,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(
                        horizontal: 16, vertical: 10),
                    shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(10)),
                  ),
                  child: tokenState.loading
                      ? const SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(
                              strokeWidth: 2, color: Colors.white))
                      : const Text('Connect', style: TextStyle(fontSize: 12)),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}
