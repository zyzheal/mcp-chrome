#!/bin/bash

# Chrome MCP Server - Test Script
# Quick test to verify all endpoints are working

BASE_URL="http://127.0.0.1:12306"

echo "🧪 Chrome MCP Server - API Test"
echo "================================"
echo ""

# Test 1: Health Check
echo "1. Testing health check..."
curl -s "$BASE_URL/ping" | jq . || echo "❌ Server not running"
echo ""

# Test 2: Debug Mode Status
echo "2. Testing debug mode status..."
curl -s "$BASE_URL/debug/status" | jq . || echo "❌ Debug endpoint failed"
echo ""

# Test 3: OpenAI Config
echo "3. Testing OpenAI configuration..."
curl -s "$BASE_URL/settings/openai/active" | jq . || echo "❌ OpenAI config failed"
echo ""

# Test 4: Available Engines
echo "4. Testing available engines..."
curl -s "$BASE_URL/agent/engines" | jq . || echo "❌ Engines endpoint failed"
echo ""

# Test 5: Debug Mode Test
echo "5. Testing debug mode access..."
curl -s "$BASE_URL/debug/test" | jq . || echo "❌ Debug test failed"
echo ""

echo "✅ All tests completed!"
