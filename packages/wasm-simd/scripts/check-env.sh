#!/usr/bin/env bash
#
# Pre-build environment checker for wasm-simd package.
# Validates that Rust toolchain, wasm-pack, and required targets are available
# before invoking wasm-pack build.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CARGO_TOML="$SCRIPT_DIR/../Cargo.toml"

# Colors
RED='\033[0;31m'
YELLOW='\033[0;33m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

ERRORS=0

log_pass() { echo -e "${GREEN}✓${NC} $1"; }
log_info() { echo -e "${YELLOW}ℹ${NC} $1"; }
log_fail() { echo -e "${RED}✗${NC} $1"; ERRORS=$((ERRORS + 1)); }

echo "=== Checking Wasm build environment ==="

# --- 1. rustc ---
if ! command -v rustc &>/dev/null; then
  log_fail "rustc not found. Install Rust: https://rustup.rs/"
else
  RUSTC_VERSION=$(rustc --version)
  log_pass "rustc: $RUSTC_VERSION"
fi

# --- 2. cargo ---
if ! command -v cargo &>/dev/null; then
  log_fail "cargo not found. Install Rust: https://rustup.rs/"
else
  log_pass "cargo: $(cargo --version)"
fi

# --- 3. wasm-pack ---
if ! command -v wasm-pack &>/dev/null; then
  log_fail "wasm-pack not found. Install: cargo install wasm-pack"
else
  WASMPACK_VERSION=$(wasm-pack --version)
  log_pass "wasm-pack: $WASMPACK_VERSION"
fi

# --- 4. wasm32-unknown-unknown target ---
TARGET="wasm32-unknown-unknown"
if rustup target list --installed 2>/dev/null | grep -q "$TARGET"; then
  log_pass "target $TARGET installed"
else
  log_fail "target $TARGET not installed. Run: rustup target add $TARGET"
fi

# --- 5. wasm-bindgen version sync ---
# Extract wasm-bindgen version from Cargo.toml (e.g. "0.2" or "0.2.91")
WASM_BINDGEN_VERSION=$(grep -E '^\s*wasm-bindgen\s*=' "$CARGO_TOML" | head -1 | sed 's/.*"\(.*\)".*/\1/')
if [ -n "$WASM_BINDGEN_VERSION" ]; then
  log_info "wasm-bindgen version in Cargo.toml: $WASM_BINDGEN_VERSION"
else
  log_fail "wasm-bindgen version not found in Cargo.toml"
fi

# --- 6. Check Cargo.lock exists ---
if [ -f "$SCRIPT_DIR/Cargo.lock" ]; then
  log_pass "Cargo.lock exists"
else
  log_info "No Cargo.lock — will be generated on first build"
fi

echo ""
if [ "$ERRORS" -gt 0 ]; then
  echo -e "${RED}Build environment check failed with $ERRORS error(s).${NC}"
  echo "Fix the issues above before running: wasm-pack build"
  exit 1
else
  echo -e "${GREEN}All checks passed. Ready to build.${NC}"
fi
