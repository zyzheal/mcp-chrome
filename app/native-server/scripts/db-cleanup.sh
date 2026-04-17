#!/bin/bash

# Chrome MCP Agent Database Cleanup
# Usage:
#   bash scripts/db-cleanup.sh              # Dry run
#   bash scripts/db-cleanup.sh --apply      # Actually cleanup
#   bash scripts/db-cleanup.sh --stats      # Stats only

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DIST_SCRIPT="$SCRIPT_DIR/../dist/scripts/db-cleanup.js"

if [ ! -f "$DIST_SCRIPT" ]; then
  echo "Error: dist/scripts/db-cleanup.js not found"
  echo "Run: npm run build"
  exit 1
fi

node "$DIST_SCRIPT" "$@"
