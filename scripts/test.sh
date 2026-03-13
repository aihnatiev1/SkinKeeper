#!/bin/bash
# SkinKeeper Flutter Test Runner
# Usage: ./scripts/test.sh [unit|e2e|coverage|all]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

MODE="${1:-unit}"

echo "========================================"
echo "SkinKeeper Flutter Test Runner"
echo "Mode: $MODE"
echo "========================================"

case "$MODE" in
  unit)
    echo ""
    echo "Running unit + widget tests..."
    flutter test test/ --reporter=expanded
    echo ""
    echo "All unit + widget tests passed."
    ;;

  e2e)
    echo ""
    echo "Running E2E integration tests (requires connected device)..."
    flutter test integration_test/ --reporter=expanded
    echo ""
    echo "E2E tests complete."
    ;;

  coverage)
    echo ""
    echo "Running tests with coverage..."
    flutter test test/ --coverage --reporter=compact

    if command -v lcov &> /dev/null; then
      echo ""
      echo "Generating HTML coverage report..."
      lcov --summary coverage/lcov.info
    else
      echo ""
      echo "lcov not installed. Raw coverage in coverage/lcov.info"
      echo "Install lcov to get HTML report: brew install lcov"
    fi
    echo ""
    echo "Coverage report saved to coverage/lcov.info"
    ;;

  all)
    echo ""
    echo "Running unit + widget tests..."
    flutter test test/ --reporter=expanded
    echo ""
    echo "All tests passed."
    ;;

  *)
    echo "Unknown mode: $MODE"
    echo "Usage: $0 [unit|e2e|coverage|all]"
    exit 1
    ;;
esac
