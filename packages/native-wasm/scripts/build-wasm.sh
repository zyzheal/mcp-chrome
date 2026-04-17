#!/usr/bin/env bash
set -euo pipefail

# Build Rust native-wasm crate to WebAssembly
# Produces: pkg/ directory with .wasm, .js, .d.ts files

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PACKAGE_DIR="$(dirname "$SCRIPT_DIR")"

MODE="${1:---release}"
OUT_DIR="${PACKAGE_DIR}/pkg"

echo "=== Building native-wasm WASM (${MODE}) ==="

cd "$PACKAGE_DIR"

if [[ "$MODE" == "--dev" ]]; then
  PROFILE="dev"
  echo "  profile: dev (debug symbols, no optimization)"
else
  PROFILE="release"
  echo "  profile: release (optimized)"
fi

wasm-pack build \
  --target web \
  --out-dir "$OUT_DIR" \
  "--${PROFILE#--}"

echo "=== WASM build complete ==="
echo "  output: $OUT_DIR/"
ls -lh "$OUT_DIR/"*.wasm 2>/dev/null || true
ls -lh "$OUT_DIR/"*.js 2>/dev/null || true
