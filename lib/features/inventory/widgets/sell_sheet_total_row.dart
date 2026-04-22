import 'package:flutter/material.dart';

import '../../../core/theme.dart';

class SellSheetTotalRow extends StatelessWidget {
  final int count;
  final String totalStr;

  const SellSheetTotalRow({
    super.key,
    required this.count,
    required this.totalStr,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        decoration: BoxDecoration(
          color: AppTheme.surface,
          borderRadius: BorderRadius.circular(10),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(
              'Total ($count items)',
              style: AppTheme.bodySmall,
            ),
            Text(
              totalStr,
              style: AppTheme.price.copyWith(fontSize: 15),
            ),
          ],
        ),
      ),
    );
  }
}
