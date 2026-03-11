import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Push notification preference keys and defaults.
enum PushPref {
  tradeIncoming('push_trade_incoming', true),
  tradeAccepted('push_trade_accepted', true),
  tradeDeclined('push_trade_declined', false),
  tradeCancelled('push_trade_cancelled', false),
  priceAlerts('push_price_alerts', true),
  tradeBanExpired('push_trade_ban_expired', false),
  sessionExpired('push_session_expired', false);

  final String key;
  final bool defaultValue;

  const PushPref(this.key, this.defaultValue);
}

class PushPreferences {
  final Map<PushPref, bool> _values;

  PushPreferences(this._values);

  bool get(PushPref pref) => _values[pref] ?? pref.defaultValue;

  Map<String, bool> toJson() => {
        for (final p in PushPref.values) p.name: get(p),
      };
}

class PushPrefsNotifier extends Notifier<PushPreferences> {
  @override
  PushPreferences build() {
    _load();
    return PushPreferences({for (final p in PushPref.values) p: p.defaultValue});
  }

  Future<void> _load() async {
    final prefs = await SharedPreferences.getInstance();
    final map = <PushPref, bool>{};
    for (final p in PushPref.values) {
      map[p] = prefs.getBool(p.key) ?? p.defaultValue;
    }
    state = PushPreferences(map);
  }

  Future<void> toggle(PushPref pref) async {
    final current = state.get(pref);
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(pref.key, !current);
    final newMap = {for (final p in PushPref.values) p: state.get(p)};
    newMap[pref] = !current;
    state = PushPreferences(newMap);
  }
}

final pushPrefsProvider =
    NotifierProvider<PushPrefsNotifier, PushPreferences>(PushPrefsNotifier.new);
