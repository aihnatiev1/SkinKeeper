import 'package:flutter/material.dart';

// TODO: re-enable premium gates before release
class PremiumGate extends StatelessWidget {
  final Widget child;
  final String featureName;
  final bool isPremium;

  const PremiumGate({
    super.key,
    required this.child,
    required this.featureName,
    required this.isPremium,
  });

  @override
  Widget build(BuildContext context) => child;
}
