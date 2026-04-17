#!/usr/bin/env bash
set -euo pipefail

# Full build script for native-server (npm package).
# Handles: WASM build (if needed) → TypeScript compile → config copy → postinstall prep.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_DIR="$(dirname "$SCRIPT_DIR")"
MONOREPO_DIR="$(dirname "$(dirname "$SERVER_DIR")")"
WASM_DEST="${SERVER_DIR}/native-wasm"
WASM_SRC="${MONOREPO_DIR}/packages/native-wasm/pkg"

# Step 1: Ensure WASM artifacts exist
if [ ! -f "$WASM_SRC/native_wasm_bg.wasm" ]; then
  echo "=== Building native-wasm (required by native-server) ==="
  cd "$MONOREPO_DIR"
  pnpm --filter @chrome-mcp/native-wasm run build:wasm --release 2>&1 | tail -5
  echo "=== native-wasm build done ==="
fi

# Step 2: Copy WASM to native-server
mkdir -p "$WASM_DEST"
cp "$WASM_SRC"/*.js "$WASM_DEST"/
cp "$WASM_SRC"/*.wasm "$WASM_DEST"/
cp "$WASM_SRC"/*.d.ts "$WASM_DEST"/ 2>/dev/null || true
cp "$WASM_SRC/package.json" "$WASM_DEST/package.json" 2>/dev/null || true
echo "=== Copied native-wasm to native-server/ ==="

# Step 3: Run TypeScript build
cd "$SERVER_DIR"
ts-node src/scripts/build.ts

echo "=== native-server build complete ==="
