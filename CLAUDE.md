# CLAUDE.md — SkinKeeper

## Project Overview

**SkinKeeper** — мульти-платформна екосистема для трейдингу і management'у CS2 скінів. Інструмент для трейдерів: інвентар, портфоліо, відстеження цін, історія угод, Steam-інтеграція.

**Платформи:**
- Flutter mobile app (iOS + Android) — головний продукт
- Chrome extension — enrichment Steam inventory
- Next.js web app
- Electron desktop app

**Аудиторія:** CS2 skin traders (мінімум intermediate рівень). Розуміють float values, doppler phases, fades, patterns, stickers, trade lock'и.

## Tech Stack (Mobile)

- **Flutter** (latest stable)
- **Dart** (latest stable)
- **State management:** Riverpod 2.x (manual `Notifier` / `AsyncNotifier` —
  code generation NOT used; future migration target)
- **Routing:** go_router
- **Networking:** Dio (pure — manual API client classes; retrofit NOT used)
- **Models:** Manual JSON parsing з `factory fromJson` (Freezed available
  but не використовується consistently; future migration target)
- **Local DB:** Drift (SQLite) — великі інвентарі, складні запити
- **Cache:** Hive + SharedPreferences для швидкого кешу
- **Backend auth:** Steam OpenID через deep links
- **Storage backend:** Backblaze B2 через AWS S3-compatible SDK (Node.js API)
- **Animations:** flutter_animate, Flutter Animation API
- **Localization:** flutter_localizations + ARB files (en, uk, ru, de, pt, zh)
- **Tests:** flutter_test, mocktail, integration_test

## Architecture

**Clean Architecture + feature-first:**

```
lib/
├── core/
│   ├── theme/
│   ├── router/
│   ├── network/            # Dio setup, interceptors, error handling
│   ├── constants/
│   └── extensions/
├── features/
│   ├── auth/               # Steam OpenID flow
│   ├── inventory/          # Inventory display, filters, search
│   ├── portfolio/          # Portfolio view, charts, P&L
│   ├── trades/             # Trade history, locked items
│   ├── item_details/       # Float, doppler phase, stickers, fade %
│   ├── price_tracking/     # Price alerts, historical charts
│   └── settings/
├── shared/
│   ├── widgets/
│   └── models/             # Cross-feature domain models (SkinItem, Trade, etc.)
└── main.dart
```

**Правила:**
- Domain layer = pure Dart (без Flutter imports)
- Repositories повертають domain entities
- Use cases для business logic
- UI читає Riverpod providers
- Никаких прямих викликів API з widgets

## Domain Complexity (специфіка CS2)

Це складна domain — Claude має розуміти термінологію:

- **Float value** — 0.00–1.00, визначає wear (Factory New → Battle-Scarred)
- **Doppler phases** — Ruby, Sapphire, Black Pearl, Phase 1–4 (впливає на ціну)
- **Fade percentage** — 80%+ для Full Fade, вище = дорожче
- **Pattern index** — для deny-списку / pattern-аб'єктів типу Case Hardened Blue Gem
- **Stickers** — positions, applied condition, scraped %
- **Trade lock** — 7 днів після обміну, не можна трейдити далі
- **Wear values** — FN (0.00-0.07), MW (0.07-0.15), FT (0.15-0.38), WW (0.38-0.45), BS (0.45-1.00)

Всі ці атрибути ВІДОБРАЖАЮТЬСЯ в UI у вигляді badges/indicators. UI design враховує:
- Float bar (візуальний slider з текущим значенням)
- Doppler phase badges
- Sticker thumbnails на item card
- Trade lock indicator (іконка + днів залишилось)
- Fade % badge

## Code Style

- Null safety: always
- Const constructors: mandatory
- Records + patterns, sealed classes для state
- Freezed для всіх моделей
- Extension methods where applicable
- Naming: snake_case files, PascalCase classes, _leadingUnderscore private

## API Integration

- **Steam Web API** — inventory, user info
- **CSFloat API** — float values, lookup
- **Prices API** — Buff163, Skinport, CSGO-backpack comparison
- **Власний backend** на Node.js з Backblaze B2 storage (AWS S3 SDK)
- **Chrome extension** — enrichment Steam inventory (current task: виправлення sticker data у enrich payload)

## Current Priorities (оновлювати!)

- Fix Chrome extension: включити sticker data в enrich payload
- Resolve Chrome Web Store rejection (re-upload)
- Inventory UI polish:
  - Doppler phase badges
  - Sticker thumbnails
  - Trade lock indicators
  - Fade % badges
- Backend: B2 + AWS S3 SDK integration для зберігання screenshot/inventory snapshots
- App Store screenshots (використовуємо Nana Banana AI)

## UI/UX Direction

- **Темна тема за замовчуванням** — CS-вайб, комфортно для довгого скролу
- **CS2-inspired колірна палітра:** deep blues, golds, rare item glows
- **Typography:** monospace для float values, цифр, API responses
- **Тени і rarity colors** — як в Steam/CSGO UI
- **Large-title headers** (iOS-style)
- **Pill-style tabs** (custom, не default Material)
- **Animated counters** для values, P&L
- **Custom large-title screens** для Portfolio, Trades
- **Float values visibility** — мають бути видимі, але не перевантажувати UI

## Tech Constraints

- Великі інвентарі (1000+ items) — UI має бути оптимізований (ListView.builder + pagination/virtualization)
- Багато зображень скінів — агресивний кеш через cached_network_image
- Real-time price updates — WebSocket або polling з backoff
- Steam API rate limits — queue + throttling

---

## Agent System

Проект використовує спеціалізованих агентів (`.claude/agents/`).

### Коли викликати якого агента

| Задача | Агент |
|---|---|
| Нова фіча, архітектурне рішення | `architect` |
| Flutter/Dart implementation | `flutter-dev` |
| Backend Node.js, API endpoints, B2/S3 | `backend-dev` |
| Chrome extension (vanilla JS/TS) | `extension-dev` |
| UI дизайн, CS2-вайб, badges, компоненти | `ux-trader` |
| Анімації, transitions, counters | `animator` |
| Тести | `qa` |
| Performance (великі списки, кеш) | `perf` |
| App Store / Play Store / Chrome Web Store | `publisher` |
| Steam API, CSFloat, prices integration | `domain-expert` |

### Workflow приклад

Задача: "Додати sticker thumbnails на item card"
1. `domain-expert` → як Steam віддає sticker data, які поля потрібні
2. `architect` → де в моделі додати, який flow від API до UI
3. `ux-trader` → як відобразити (розмір, позиція, hover/tap)
4. `flutter-dev` → код widget + провайдер
5. `perf` → чи не ламає це ListView performance
6. `qa` → тести

---

## Commands & Scripts

```bash
# Dev
flutter run --flavor dev

# Build
flutter build ipa --release
flutter build appbundle --release

# Code generation
dart run build_runner watch --delete-conflicting-outputs

# Tests
flutter test
flutter test integration_test/

# Backend (Node.js)
cd backend && npm run dev
cd backend && npm run deploy

# Chrome extension build
cd extension && npm run build
cd extension && npm run zip  # для Web Store upload
```

## Important Notes for Claude

- **Domain термінологія** — не перекладай float, phase, fade — це terms of art
- **Steam auth** — деякі flows не працюють через OpenID (наприклад QR-based Steam Guard), це очікувано. Не пропонуй рішення які не спрацюють.
- **Inventory size** — все має бути оптимізовано під 1000+ items
- **Dark mode first** — light mode це другорядно
- **Chrome extension** — vanilla TypeScript, НЕ React (keep it light)
- **Backend** — Node.js + AWS S3 SDK для B2, не перекладай на інші SDK
- **Image caching** — агресивне, CDN-ready, WebP де можливо
- **Якщо робиш UI** — спочатку перевір `ux-trader` принципи (dark, CS2-вайб, float-bar, badges)

---

_Цей файл читається Claude Code автоматично при старті сесії в цьому репо._
