#!/bin/bash

# Chrome MCP Server - 一键启动测试脚本

PROJECT_ROOT="/Users/heal/mcp-chrome"
SERVER_DIR="$PROJECT_ROOT/app/native-server"
EXTENSION_DIR="$PROJECT_ROOT/app/chrome-extension"

echo "🚀 Chrome MCP Server - Local Test Environment"
echo "=============================================="
echo ""

# Step 1: 启动后端服务器
echo "Step 1: Starting Backend Server..."
cd "$SERVER_DIR"

# 设置环境变量
export DEBUG_MODE_ENABLED="true"
export PORT="12307"

# 检查是否已运行
if lsof -i :12307 >/dev/null 2>&1; then
  echo "   ⚠️  Server already running on port 12307"
else
  echo "   ✅ Starting server on port 12307"
  node start-http.js &
  sleep 3
fi

# 验证服务器
echo ""
echo "   Testing server..."
curl -s http://127.0.0.1:12307/ping | jq . || echo "   ❌ Server not responding"

echo ""

# Step 2: 构建扩展（如果需要）
echo "Step 2: Checking Extension Build..."
cd "$EXTENSION_DIR"

if [ -f ".output/chrome-mv3/manifest.json" ]; then
  echo "   ✅ Extension already built"
else
  echo "   🔨 Building extension..."
  npm run build
fi

echo ""

# Step 3: 显示加载说明
echo "Step 3: Load Extension in Chrome"
echo "=================================="
echo ""
echo "1. Open Chrome browser"
echo "2. Navigate to: chrome://extensions/"
echo "3. Enable 'Developer mode' (top right)"
echo "4. Click 'Load unpacked'"
echo "5. Select directory:"
echo "   $EXTENSION_DIR/.output/chrome-mv3"
echo ""
echo "Extension path:"
echo "   $EXTENSION_DIR/.output/chrome-mv3"
echo ""

# Step 4: 显示测试说明
echo "Step 4: Test Features"
echo "===================="
echo ""
echo "After loading extension:"
echo ""
echo "1. Click extension icon to open Sidepanel"
echo "2. Click floating button (☰) → Settings"
echo "3. Configure OpenAI API and test connection"
echo "4. Enable Debug Mode for local development"
echo ""

echo "✅ Environment ready for testing!"
echo ""
echo "To stop server: pkill -f 'node start-http.js'"
