import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';

import 'api_client.dart';
import 'theme.dart';

/// Download price history CSV from the API and share it.
///
/// [days] — number of days of history (1..90, default 30).
/// [source] — optional price source filter (steam, skinport, csfloat, dmarket).
Future<void> exportPriceHistory(
  BuildContext context,
  WidgetRef ref, {
  int days = 30,
  String? source,
}) async {
  HapticFeedback.mediumImpact();

  try {
    final api = ref.read(apiClientProvider);
    final params = <String, dynamic>{'days': days};
    if (source != null && source.isNotEmpty) {
      params['source'] = source;
    }

    final response = await api.get(
      '/export/price-history',
      queryParameters: params,
    );
    final csvData = response.data as String;
    final lines = csvData.split('\n').length - 1; // subtract header

    if (!context.mounted) return;

    final dir = await getTemporaryDirectory();
    final filename =
        'price-history-${days}d${source != null ? '-$source' : ''}.csv';
    final file = File('${dir.path}/$filename');
    await file.writeAsString(csvData);

    await SharePlus.instance.share(
      ShareParams(
        files: [XFile(file.path)],
        subject: 'SkinKeeper Price History -- $lines records',
      ),
    );
  } catch (e) {
    if (!context.mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: const Text('Failed to export price history'),
        backgroundColor: AppTheme.loss,
      ),
    );
  }
}
