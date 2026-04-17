#!/bin/bash
# Local API Test Script

PORT=${1:-12307}
BASE_URL="http://127.0.0.1:$PORT"

echo "🧪 Testing Chrome MCP Server (Port: $PORT)"
echo "=========================================="
echo ""

# 1. Health Check
echo "1. Health Check:"
curl -s "$BASE_URL/ping" | jq . || echo "❌ Failed"
echo ""

# 2. Debug Status
echo "2. Debug Status:"
curl -s "$BASE_URL/debug/status" | jq . || echo "❌ Failed"
echo ""

# 3. Settings - OpenAI Config
echo "3. OpenAI Config:"
curl -s "$BASE_URL/settings/openai/active" | jq . || echo "❌ Failed"
echo ""

# 4. Agent Engines
echo "4. Agent Engines:"
curl -s "$BASE_URL/agent/engines" | jq . || echo "❌ Failed"
echo ""

echo "✅ All tests completed!"
