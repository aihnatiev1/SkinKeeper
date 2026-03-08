# Technology Stack

**Analysis Date:** 2026-03-08

## Languages

**Primary:**
- Dart ^3.11.1 - Flutter mobile/desktop app (`lib/`)
- TypeScript ^5.9.3 - Backend API server (`backend/src/`)

**Secondary:**
- Kotlin - Android platform glue (`android/app/src/main/kotlin/`)
- Swift - iOS platform glue (`ios/Runner/`)
- SQL - Database schema and queries (inline in `backend/src/db/migrate.ts` and service files)

## Runtime

**Frontend (Flutter):**
- Flutter SDK (uses Material Design)
- Dart SDK ^3.11.1
- Targets: iOS, Android, macOS, Linux, Windows, Web

**Backend (Node.js):**
- Node.js (ES2022 target, ESM modules via `"type": "module"`)
- tsx ^4.21.0 for development (watch mode)
- Compiled to `dist/` via `tsc` for production

**Package Managers:**
- Flutter/Dart: pub (lockfile: `pubspec.lock` present)
- Backend: npm (lockfile: `backend/package-lock.json` present)

## Frameworks

**Core:**
- Flutter ^3.x (Material Design) - Cross-platform UI framework
- Express ^5.2.1 - Backend HTTP server (`backend/src/index.ts`)

**State Management:**
- flutter_riverpod ^2.6.0 - Provider-based reactive state (`lib/features/*/`)

**Routing:**
- go_router ^15.1.2 - Declarative routing with auth guards (`lib/core/router.dart`)

**Testing:**
- flutter_test (SDK) - Widget and unit testing
- flutter_lints ^6.0.0 - Static analysis rules

**Build/Dev:**
- tsx ^4.21.0 - TypeScript execution and watch mode for backend
- TypeScript ^5.9.3 - Backend compilation (`backend/tsconfig.json`)

## Key Dependencies

### Frontend (Flutter) - `pubspec.yaml`

**Critical:**
- `flutter_riverpod` ^2.6.0 - All state management uses Riverpod providers
- `go_router` ^15.1.2 - App navigation and auth redirect logic
- `dio` ^5.7.0 - HTTP client for all API calls (`lib/core/api_client.dart`)

**UI:**
- `fl_chart` ^0.70.2 - Price history charts (portfolio screen)
- `cached_network_image` ^3.4.1 - Skin image caching
- `cupertino_icons` ^1.0.8 - iOS-style icons

**Infrastructure:**
- `flutter_secure_storage` ^9.2.4 - JWT token storage (keychain/keystore)
- `shared_preferences` ^2.3.0 - Local preferences
- `url_launcher` ^6.3.1 - Steam OpenID login flow (opens browser)
- `intl` ^0.20.2 - Number/date formatting

### Backend (Node.js) - `backend/package.json`

**Critical:**
- `express` ^5.2.1 - HTTP server and routing
- `pg` ^8.20.0 - PostgreSQL client (raw SQL, no ORM)
- `jsonwebtoken` ^9.0.3 - JWT auth token creation and verification
- `axios` ^1.13.6 - HTTP client for Steam API and Skinport API

**Infrastructure:**
- `helmet` ^8.1.0 - HTTP security headers
- `cors` ^2.8.6 - Cross-origin resource sharing
- `dotenv` ^17.3.1 - Environment variable loading
- `node-cron` ^4.2.1 - Scheduled price fetching jobs

**Dev Dependencies:**
- `@types/express` ^5.0.6, `@types/pg` ^8.18.0, `@types/cors` ^2.8.19, `@types/jsonwebtoken` ^9.0.10, `@types/node` ^25.3.5

## Configuration

**Environment:**
- Backend uses `dotenv` loading from `.env` file (no `.env` file committed)
- Required env vars (from code analysis):
  - `DATABASE_URL` - PostgreSQL connection string (`backend/src/db/pool.ts`)
  - `JWT_SECRET` - JWT signing key (`backend/src/middleware/auth.ts`, `backend/src/routes/auth.ts`)
  - `STEAM_API_KEY` - Steam Web API key (`backend/src/services/steam.ts`)
  - `PORT` - Server port, defaults to 3000 (`backend/src/index.ts`)

**TypeScript:**
- Config: `backend/tsconfig.json`
- Target: ES2022, Module: Node16, Strict mode enabled
- Output: `backend/dist/`

**Flutter:**
- Config: `pubspec.yaml`
- Linting: `analysis_options.yaml` (extends `package:flutter_lints/flutter.yaml`)
- API base URL hardcoded: `http://localhost:3000/api` (`lib/core/constants.dart`)

**Build Commands:**
- Backend dev: `npm run dev` (tsx watch)
- Backend build: `npm run build` (tsc)
- Backend start: `npm run start` (node dist/index.js)
- Backend migrate: `npm run migrate` (tsx src/db/migrate.ts)
- Flutter: standard `flutter run`, `flutter build`

## Platform Requirements

**Development:**
- Flutter SDK with Dart ^3.11.1
- Node.js (for backend)
- PostgreSQL database
- Steam API key (for inventory/auth features)

**Production:**
- Node.js server for backend (`dist/index.js`)
- PostgreSQL database
- iOS/Android devices or macOS/Linux/Windows for Flutter app
- Steam API key

---

*Stack analysis: 2026-03-08*
