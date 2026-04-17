#!/bin/bash

# Chrome MCP 调试工具集

BASE_URL="http://127.0.0.1:12307"

show_help() {
  echo "Chrome MCP 调试工具"
  echo "=================="
  echo ""
  echo "用法: bash scripts/debug-tools.sh [命令]"
  echo ""
  echo "命令:"
  echo "  status    - 检查服务器状态"
  echo "  test      - 测试所有 API 端点"
  echo "  enable    - 启用调试模式"
  echo "  disable   - 禁用调试模式"
  echo "  config    - 查看 OpenAI 配置"
  echo "  watch     - 持续监控服务器"
  echo "  logs      - 查看实时日志"
  echo "  help      - 显示帮助"
  echo ""
}

check_status() {
  echo "=== 服务器状态 ==="
  if lsof -i :12307 >/dev/null 2>&1; then
    echo "✅ 服务器运行中"
    lsof -i :12307 | grep LISTEN
  else
    echo "❌ 服务器未运行"
    echo ""
    echo "启动命令:"
    echo "  cd app/native-server && node start-http.js"
  fi
}

test_all() {
  echo "=== API 端点测试 ==="
  echo ""
  
  echo "1. Ping:"
  curl -s "$BASE_URL/ping" | jq . || echo "❌ 失败"
  
  echo "2. Debug Status:"
  curl -s "$BASE_URL/debug/status" | jq . || echo "❌ 失败"
  
  echo "3. Settings:"
  curl -s "$BASE_URL/settings/openai/active" | jq . || echo "❌ 失败"
  
  echo "4. Agent Engines:"
  curl -s "$BASE_URL/agent/engines" | jq . || echo "❌ 失败"
}

enable_debug() {
  echo "=== 启用调试模式 ==="
  curl -s -X POST "$BASE_URL/debug/enable" \
    -H "Content-Type: application/json" \
    -d '{"token":"debug-token"}' | jq .
}

disable_debug() {
  echo "=== 禁用调试模式 ==="
  curl -s -X POST "$BASE_URL/debug/disable" | jq .
}

show_config() {
  echo "=== OpenAI 配置 ==="
  curl -s "$BASE_URL/settings/openai/active" | jq .
}

watch_server() {
  echo "=== 持续监控 (每5秒) ==="
  echo "Ctrl+C 退出"
  echo ""
  while true; do
    timestamp=$(date '+%H:%M:%S')
    result=$(curl -s "$BASE_URL/ping" | jq -r '.status' 2>/dev/null)
    echo "$timestamp - Status: $result"
    sleep 5
  done
}

case "$1" in
  status)   check_status ;;
  test)     test_all ;;
  enable)   enable_debug ;;
  disable)  disable_debug ;;
  config)   show_config ;;
  watch)    watch_server ;;
  logs)     echo "查看日志: node start-http.js" ;;
  help|"")  show_help ;;
  *)        echo "未知命令: $1"; show_help ;;
esac
