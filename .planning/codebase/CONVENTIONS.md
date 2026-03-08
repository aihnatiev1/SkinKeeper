# Coding Conventions

**Analysis Date:** 2026-03-08

## Project Structure

This is a dual-stack project: a **Flutter/Dart** mobile app (`lib/`) and a **Node.js/TypeScript** backend (`backend/src/`). Conventions differ by stack.

---

## Flutter/Dart Conventions (lib/)

### Naming Patterns

**Files:**
- Use `snake_case.dart` for all files: `inventory_provider.dart`, `steam_auth_service.dart`
- Screen files: `{feature}_screen.dart` (e.g., `lib/features/inventory/inventory_screen.dart`)
- Provider files: `{feature}_provider.dart` (e.g., `lib/features/inventory/inventory_provider.dart`)
- Widget files: `snake_case.dart` inside a `widgets/` subdirectory (e.g., `lib/features/inventory/widgets/item_card.dart`)
- Model files: singular noun `snake_case.dart` (e.g., `lib/models/inventory_item.dart`)

**Classes:**
- Use `PascalCase` for all classes: `InventoryItem`, `SteamUser`, `ApiClient`
- Screens: `{Feature}Screen` (e.g., `PortfolioScreen`, `InventoryScreen`)
- Notifiers: `{Feature}Notifier` (e.g., `InventoryNotifier`, `AuthNotifier`)
- Private widgets: `_{Name}` with leading underscore (e.g., `_ValueCard`, `_StatTile`, `_FilterChip`)

**Variables/Fields:**
- Use `camelCase` for all variables and fields: `marketHashName`, `bestPrice`, `totalValue`
- Private fields use leading underscore: `_dio`, `_storage`, `_loading`
- Provider variables: `{feature}Provider` (e.g., `inventoryProvider`, `portfolioProvider`)
- State filter providers: `{scope}{Type}Provider` (e.g., `txTypeFilterProvider`, `searchQueryProvider`)

**Enums:**
- Use `PascalCase` for enum names, `camelCase` for values: `SortOption.priceDesc`, `AlertCondition.changePct`

### Import Organization

**Order:**
1. Dart SDK imports (`dart:developer`, `dart:convert`)
2. Flutter framework imports (`package:flutter/material.dart`)
3. Third-party package imports (`package:flutter_riverpod/...`, `package:go_router/...`)
4. Relative project imports (`../../core/api_client.dart`, `../auth/steam_auth_service.dart`)

**Path Style:**
- Use relative paths for all project imports (no path aliases configured)
- Example: `import '../../core/api_client.dart';`

### Widget Patterns

**Stateless Widgets (primary pattern):**
- Use `ConsumerWidget` for widgets that read providers
- Use `StatelessWidget` for pure UI widgets that receive all data via constructor
- Mark constructors `const` when possible: `const InventoryScreen({super.key});`
- Use `super.key` shorthand (not `Key? key`)

```dart
class PortfolioScreen extends ConsumerWidget {
  const PortfolioScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final portfolio = ref.watch(portfolioProvider);
    // ...
  }
}
```

**Stateful Widgets (for local mutable state):**
- Use `ConsumerStatefulWidget` when combining local state with providers
- Pattern seen in `lib/features/inventory/widgets/sell_bottom_sheet.dart` and `lib/features/settings/settings_screen.dart` (`_SteamSessionSheet`)
- Local state fields use underscore prefix: `_loading`, `_error`, `_success`

```dart
class SellBottomSheet extends ConsumerStatefulWidget {
  final List<InventoryItem> items;
  const SellBottomSheet({super.key, required this.items});

  @override
  ConsumerState<SellBottomSheet> createState() => _SellBottomSheetState();
}
```

**Private helper widgets:**
- Extract reusable sub-widgets as private classes in the same file
- Use underscore prefix: `_ValueCard`, `_PortfolioChart`, `_StatsBar`
- Keep them in the same file as the screen that uses them

### State Management (Riverpod)

**Provider Declaration Pattern:**
- Declare providers as top-level final variables in the provider file
- Use `AsyncNotifierProvider` for data that requires async fetch:

```dart
final inventoryProvider =
    AsyncNotifierProvider<InventoryNotifier, List<InventoryItem>>(
        InventoryNotifier.new);
```

- Use `StateProvider` for simple filter/UI state:

```dart
final sortOptionProvider = StateProvider<SortOption>((ref) => SortOption.priceDesc);
final searchQueryProvider = StateProvider<String>((ref) => '');
```

- Use `FutureProvider` for one-shot async reads:

```dart
final txStatsProvider = FutureProvider<TransactionStats>((ref) async {
  final api = ref.read(apiClientProvider);
  // ...
});
```

- Use `Provider` for derived/computed state:

```dart
final filteredInventoryProvider = Provider<AsyncValue<List<InventoryItem>>>((ref) {
  final inventory = ref.watch(inventoryProvider);
  // filter and sort logic
});
```

**Notifier Pattern:**
- Extend `AsyncNotifier<T>` for async state
- Override `build()` method for initial data fetch
- Access API via `ref.read(apiClientProvider)`
- Set `state = const AsyncLoading()` before async operations
- Set `state = AsyncData(...)` or `state = AsyncError(e, st)` after

```dart
class InventoryNotifier extends AsyncNotifier<List<InventoryItem>> {
  @override
  Future<List<InventoryItem>> build() => fetchInventory();

  Future<void> refresh() async {
    state = const AsyncLoading();
    try {
      state = AsyncData(await fetchInventory());
    } catch (e, st) {
      state = AsyncError(e, st);
    }
  }
}
```

### Model Patterns

**Immutable data classes:**
- All fields `final`
- Use `const` constructors
- Provide `factory ClassName.fromJson(Map<String, dynamic> json)` for deserialization
- Optional `toJson()` method only when needed for sending data
- Use `required` for mandatory fields, optional fields use nullable types with defaults
- JSON keys use `snake_case` (matching backend/API), Dart fields use `camelCase`

```dart
class InventoryItem {
  final String assetId;
  final String marketHashName;
  // ...
  const InventoryItem({required this.assetId, required this.marketHashName, ...});

  factory InventoryItem.fromJson(Map<String, dynamic> json) {
    return InventoryItem(
      assetId: json['asset_id'] as String,
      marketHashName: json['market_hash_name'] as String,
    );
  }
}
```

**Computed getters:**
- Use getters for derived data: `double? get bestPrice`, `String get displayName`
- Keep computation logic in the model, not in widgets

### AsyncValue Rendering

**Use `.when()` for the tri-state pattern:**

```dart
portfolio.when(
  data: (data) => /* success widget */,
  loading: () => const Center(child: CircularProgressIndicator()),
  error: (e, _) => Center(child: Text('Error: $e')),
)
```

**Use `.whenData()` + `.maybeWhen()` for partial rendering:**

```dart
allItems.whenData((items) {
  return /* widget using items */;
}).maybeWhen(orElse: () => const SizedBox.shrink());
```

### Error Handling (Flutter)

**API errors:**
- Let Dio exceptions propagate to the `AsyncNotifier`, which stores them as `AsyncError`
- Screens display error state via `.when(error: ...)` pattern
- No global error handler; each screen handles its own error display

**User-facing errors:**
- Use `SnackBar` for transient errors (e.g., login failures in `lib/features/auth/login_screen.dart`)
- Use inline error text for form/action errors (e.g., `_error` state in `lib/features/inventory/widgets/sell_bottom_sheet.dart`)

```dart
ref.listen(authStateProvider, (prev, next) {
  if (next.hasError) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text('Login failed: ${next.error}')),
    );
  }
});
```

### Logging (Flutter)

- Use `dart:developer` log function with named loggers:

```dart
import 'dart:developer' as dev;
dev.log('Token found, fetching /auth/me', name: 'Auth');
```

- API logging via Dio's `LogInterceptor` (configured in `lib/core/api_client.dart`)

### Code Style (Flutter)

**Formatting:**
- Standard `dart format` (no custom config)
- 2-space indentation (Dart default)

**Linting:**
- Uses `package:flutter_lints/flutter.yaml` (via `analysis_options.yaml`)
- No custom lint rules added

**Const usage:**
- Mark widgets `const` wherever possible
- Use `const` constructors for model instances with known values
- Use `const EdgeInsets`, `const TextStyle`, `const SizedBox`, `const Icon` throughout

---

## Backend/TypeScript Conventions (backend/src/)

### Naming Patterns

**Files:**
- Use `camelCase.ts` for all files: `priceJob.ts`, `auth.ts`, `pool.ts`
- Route files: named by resource (`inventory.ts`, `portfolio.ts`, `market.ts`)
- Service files: named by domain (`steam.ts`, `prices.ts`, `transactions.ts`)

**Functions:**
- Use `camelCase` for all functions: `fetchSteamInventory`, `getLatestPrices`, `sellItem`
- Prefix with verb: `get`, `fetch`, `save`, `start`, `verify`

**Variables:**
- Use `camelCase`: `totalItems`, `priceMap`, `skinportCache`
- Constants: `camelCase` (not SCREAMING_CASE): `const router = Router();`

**Interfaces:**
- Use `PascalCase`: `SteamSession`, `SellResult`, `ParsedInventoryItem`
- No `I` prefix convention

**Database columns:**
- Use `snake_case` in SQL: `market_hash_name`, `steam_login_secure`, `price_usd`
- Map to `camelCase` in TypeScript when constructing response objects

### Import Organization

**Order:**
1. Third-party packages (`express`, `axios`, `jsonwebtoken`)
2. Internal modules with `.js` extension (`../db/pool.js`, `../services/steam.js`)

**Path style:**
- Relative paths with `.js` extension (ESM module resolution): `"./db/pool.js"`, `"../middleware/auth.js"`

### Route Patterns

**Structure:**
- One file per resource in `backend/src/routes/`
- Each file exports a default `Router()` instance
- Routes mounted in `backend/src/index.ts` with `/api/{resource}` prefix

```typescript
const router = Router();

router.get("/", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    // business logic
    res.json({ /* response */ });
  } catch (err) {
    console.error("Descriptive error:", err);
    res.status(500).json({ error: "User-friendly message" });
  }
});

export default router;
```

**Auth protection:**
- Apply `authMiddleware` as route-level middleware (not app-level)
- Access `req.userId` and `req.steamId` from `AuthRequest` interface

**Request validation:**
- Inline validation at the top of handlers (no validation library)
- Return 400 with `{ error: "message" }` for bad input

**Response format:**
- Success: `res.json({ data })` (200 by default)
- Created: `res.status(201).json(data)`
- Error: `res.status(code).json({ error: "message" })`

### Error Handling (Backend)

**Pattern:** Try-catch in every route handler. Log with `console.error`, return generic user-facing message.

```typescript
try {
  // logic
} catch (err) {
  console.error("Context error:", err);
  res.status(500).json({ error: "Failed to do X" });
}
```

- No centralized error handling middleware
- No custom error classes
- Errors are not typed or categorized

### Database Access

**Pattern:** Direct SQL queries via `pg.Pool` (no ORM)

```typescript
const { rows } = await pool.query(
  `SELECT ... FROM ... WHERE user_id = $1`,
  [req.userId]
);
```

- Use parameterized queries with `$1, $2, ...` placeholders
- Build dynamic queries with string concatenation for optional filters (see `backend/src/services/transactions.ts`)

### Logging (Backend)

- Use `console.log` and `console.error` throughout
- Prefix logs with context tags: `[CRON]`, `[INIT]`, `[Steam]`, `[Transactions]`
- No structured logging library

### Code Style (Backend)

**Formatting:**
- Double quotes for strings
- Semicolons at end of statements
- 2-space indentation (TypeScript default)
- No explicit formatter configured (no Prettier/ESLint config files)

**TypeScript:**
- Strict mode enabled (`"strict": true` in `backend/tsconfig.json`)
- ESM modules (`"type": "module"` in `backend/package.json`)
- Target ES2022
- Use `as` type assertions for API response data
- Non-null assertion `!` used for env vars: `process.env.JWT_SECRET!`

### Comments

**When to comment:**
- Route handlers get a one-line comment above with HTTP method and path: `// GET /api/inventory`
- Complex business logic gets inline comments (e.g., fee calculations in `backend/src/services/market.ts`)
- No JSDoc/TSDoc used anywhere

**Style:**
- Single-line `//` comments only
- Placed on the line above the code, not inline

---

## Cross-Stack Conventions

### API Contract

**JSON field naming:**
- API responses use `snake_case` keys: `market_hash_name`, `price_usd`, `is_premium`
- Dart models map `snake_case` JSON to `camelCase` fields in `fromJson` factories

**Error responses:**
- Always `{ "error": "message" }` format
- HTTP status codes: 400 (bad input), 401 (auth), 404 (not found), 500 (server error)

### Authentication Flow

- JWT token stored in `FlutterSecureStorage` on the client
- Sent as `Authorization: Bearer {token}` header via Dio interceptor
- Verified by `authMiddleware` on the backend
- Token expiry: 30 days
