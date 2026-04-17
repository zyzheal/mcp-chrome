#!/usr/bin/env bash
set -euo pipefail

# Full build script for chrome-mcp-server extension.
# Handles: WASM build (if needed) → WXT build → copy WASM artifacts.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXT_DIR="$(dirname "$SCRIPT_DIR")"
MONOREPO_DIR="$(dirname "$(dirname "$EXT_DIR")")"
WASM_SRC="${EXT_DIR}/native-wasm"

# Step 1: Ensure WASM artifacts exist
if [ ! -f "$WASM_SRC/native_wasm_bg.wasm" ]; then
  echo "=== Building native-wasm (required by extension) ==="
  cd "$MONOREPO_DIR"
  pnpm --filter @chrome-mcp/native-wasm run build:wasm --release 2>&1 | tail -5
  cd "$EXT_DIR"
  echo "=== native-wasm build done ==="
fi

# Step 2: Build extension via WXT
echo "=== Building extension ==="
cd "$EXT_DIR"
pnpm exec wxt build
echo "=== Extension build done ==="

# Step 3: Copy WASM into build output
WASM_DEST="${EXT_DIR}/output/chrome-mv3/native-wasm"
mkdir -p "$WASM_DEST"
cp "$WASM_SRC"/*.js "$WASM_DEST"/
cp "$WASM_SRC"/*.wasm "$WASM_DEST"/
cp "$WASM_SRC"/*.d.ts "$WASM_DEST"/ 2>/dev/null || true
cp "$WASM_SRC/package.json" "$WASM_DEST/package.json" 2>/dev/null || true
echo "=== Copied native-wasm to output/chrome-mv3/native-wasm/ ==="
