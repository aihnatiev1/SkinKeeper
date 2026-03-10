import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api_client.dart';
import 'portfolio_pl_provider.dart';

/// Search result for item autocomplete
class ItemSearchResult {
  final String marketHashName;
  final String? iconUrl;

  const ItemSearchResult({required this.marketHashName, this.iconUrl});

  String get imageUrl => iconUrl != null && iconUrl!.isNotEmpty
      ? 'https://community.steamstatic.com/economy/image/$iconUrl/128fx128f'
      : '';

  factory ItemSearchResult.fromJson(Map<String, dynamic> json) {
    return ItemSearchResult(
      marketHashName: json['marketHashName'] as String,
      iconUrl: json['iconUrl'] as String?,
    );
  }
}

/// Search items for autocomplete
final itemSearchProvider =
    FutureProvider.family<List<ItemSearchResult>, String>((ref, query) async {
  if (query.length < 2) return [];
  final api = ref.read(apiClientProvider);
  final res = await api.get('/transactions/search-items',
      queryParameters: {'q': query});
  final data = res.data as Map<String, dynamic>;
  return (data['items'] as List<dynamic>)
      .map((e) => ItemSearchResult.fromJson(e as Map<String, dynamic>))
      .toList();
});

/// Add manual transaction(s)
class ManualTxService {
  final ApiClient _api;

  ManualTxService(this._api);

  /// Add a single or batch manual transaction
  Future<bool> addTransaction({
    required String marketHashName,
    required int priceCentsPerUnit,
    int quantity = 1,
    String type = 'buy',
    DateTime? date,
    String source = 'manual',
    String? note,
    String? iconUrl,
  }) async {
    final body = <String, dynamic>{
      'marketHashName': marketHashName,
      'priceCentsPerUnit': priceCentsPerUnit,
      'quantity': quantity,
      'type': type,
      'source': source,
    };
    if (date != null) body['date'] = date.toIso8601String();
    if (note != null) body['note'] = note;
    if (iconUrl != null) body['iconUrl'] = iconUrl;

    if (quantity > 1) {
      final res = await _api.post('/transactions/manual/batch', data: body);
      return res.data['success'] == true;
    } else {
      // Single transaction uses original endpoint
      body['priceCents'] = priceCentsPerUnit;
      final res = await _api.post('/transactions/manual', data: body);
      return res.data['success'] == true;
    }
  }

  /// Delete a manual transaction
  Future<bool> deleteTransaction(String txId) async {
    final res = await _api.delete('/transactions/manual/$txId');
    return res.data['success'] == true;
  }
}

final manualTxServiceProvider = Provider<ManualTxService>((ref) {
  return ManualTxService(ref.read(apiClientProvider));
});
