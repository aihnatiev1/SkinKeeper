import 'package:flutter/material.dart';

/// Compact banner indicating displayed data may be outdated.
/// Shows an amber "Data may be outdated" message with an optional refresh button.
class StaleDataBanner extends StatelessWidget {
  final VoidCallback? onRefresh;
  const StaleDataBanner({super.key, this.onRefresh});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      color: Colors.amber.withValues(alpha: 0.15),
      child: Row(
        children: [
          const Icon(Icons.info_outline, size: 16, color: Colors.amber),
          const SizedBox(width: 8),
          const Expanded(
            child: Text(
              'Data may be outdated',
              style: TextStyle(fontSize: 13, color: Colors.amber),
            ),
          ),
          if (onRefresh != null)
            GestureDetector(
              onTap: onRefresh,
              child: const Icon(Icons.refresh, size: 18, color: Colors.amber),
            ),
        ],
      ),
    );
  }
}
