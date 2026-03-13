---
phase: 19-named-portfolios
plan: 02
status: complete
executed: 2026-03-13
---

# 19-02 Summary: Flutter Named Portfolios UI

## What was built

Full Flutter frontend for named portfolios feature.

## Artifacts

| File | What was added/changed |
|------|------------------------|
| `lib/models/profit_loss.dart` | `Portfolio` class with `fromJson` / `colorHex` |
| `lib/features/portfolio/portfolio_pl_provider.dart` | `selectedPortfolioIdProvider`, `portfoliosProvider` + `PortfoliosNotifier` (CRUD); both PL providers pass `?portfolioId=` |
| `lib/features/portfolio/manual_tx_provider.dart` | `addTransaction` accepts optional `portfolioId` |
| `lib/features/portfolio/portfolio_screen.dart` | `_PortfolioSelectorBar`, `_CreatePortfolioSheet`, `_PortfolioOptionsSheet`, `_EditPortfolioSheet`, `_kPortfolioColors` |
| `lib/features/portfolio/widgets/add_transaction_sheet.dart` | Portfolio picker row + `_pickPortfolio` method |
| `lib/features/portfolio/widgets/item_pl_list.dart` | Long-press → `_showItemActions` → "Log transaction" shortcut |

## Key decisions

- Selector bar in P/L tab only; `selectedPortfolioIdProvider == null` = "All"
- Delete individual tx deferred (ItemPL is aggregate, no txId) — "Log transaction" shortcut instead
- 6 preset colors: indigo, green, amber, red, purple, cyan

## Verification

- flutter analyze: 6 warnings (all pre-existing), 0 errors
