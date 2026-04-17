#!/usr/bin/env bash
set -euo pipefail

# Full build pipeline for native-wasm:
# 1. Run Rust unit tests
# 2. Compile to WASM
# 3. Copy WASM output to consuming packages

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PACKAGE_DIR="$(dirname "$SCRIPT_DIR")"
MONOREPO_DIR="$(dirname "$(dirname "$PACKAGE_DIR")")"

MODE="${1:---release}"

echo "========================================"
echo "  native-wasm: full build pipeline"
echo "========================================"

# Step 1: Run unit tests
echo ""
echo "[1/3] Running unit tests..."
cd "$PACKAGE_DIR"
cargo test --quiet
echo "  ✓ all tests passed"

# Step 2: Build WASM
echo ""
echo "[2/3] Compiling to WASM..."
bash "$SCRIPT_DIR/build-wasm.sh" "$MODE"
echo "  ✓ WASM compiled"

# Step 3: Copy to consuming packages
echo ""
echo "[3/3] Copying WASM output..."

# Chrome extension consumes the WASM module
EXT_DEST="${MONOREPO_DIR}/app/chrome-extension/native-wasm"
mkdir -p "$EXT_DEST"
cp "$PACKAGE_DIR/pkg/"*.js "$EXT_DEST"/
cp "$PACKAGE_DIR/pkg/"*.wasm "$EXT_DEST"/
cp "$PACKAGE_DIR/pkg/"*.d.ts "$EXT_DEST"/ 2>/dev/null || true
cp "$PACKAGE_DIR/pkg/package.json" "$EXT_DEST/package.json" 2>/dev/null || true
echo "  ✓ copied to app/chrome-extension/native-wasm/"

# Native server can also consume the same module
NS_DEST="${MONOREPO_DIR}/app/native-server/native-wasm"
mkdir -p "$NS_DEST"
cp "$PACKAGE_DIR/pkg/"*.js "$NS_DEST"/
cp "$PACKAGE_DIR/pkg/"*.wasm "$NS_DEST"/
cp "$PACKAGE_DIR/pkg/"*.d.ts "$NS_DEST"/ 2>/dev/null || true
cp "$PACKAGE_DIR/pkg/package.json" "$NS_DEST/package.json" 2>/dev/null || true
echo "  ✓ copied to app/native-server/native-wasm/"

echo ""
echo "========================================"
echo "  ✓ Build pipeline complete"
echo "========================================"
