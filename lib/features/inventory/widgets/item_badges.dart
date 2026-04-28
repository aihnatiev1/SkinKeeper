/// Public re-exports + dev helpers for the inventory item-card badge family.
///
/// Most badge widgets already live in:
///  - [item_card_badges.dart] — `DopplerPhasePill`, `RareBadge`, `ArbitrageBadge`
///  - [rarity_gem.dart]       — `RarityGem`, `DopplerPhaseGem`
///  - [item_card_stickers.dart] — `StickerThumb`, `CharmThumb`, `StickerValueBadge`
///
/// Float-bar lives inline in [item_card_footer.dart] (`_MiniFloatBar`,
/// `_MiniFadeBar`, `_TradeBanBadge`) and is intentionally private — those
/// renderings are tightly coupled to the card layout and not reused.
///
/// This file exposes:
///  1. A barrel re-export so callers / tests can `import 'item_badges.dart'`.
///  2. Dev-only `isShowAllBadgesDemo` flag for visual QA when test data lacks
///     Doppler / Fade / Trade-lock items.
library;

import 'package:flutter/foundation.dart';

export 'item_card_badges.dart';
export 'item_card_stickers.dart';
export 'rarity_gem.dart';

/// When `true`, the `ItemCard` overrides each item with synthetic
/// Doppler / Fade / Trade-lock data so the design team can visually QA
/// every badge without needing real CS2 inventory data.
///
/// MUST stay `false` in production. Guarded by `kDebugMode` at the call
/// site so it can never accidentally ship.
bool isShowAllBadgesDemo = false;

/// Helper: should we honor the demo flag in this build?
bool get isBadgeDemoEnabled => kDebugMode && isShowAllBadgesDemo;
