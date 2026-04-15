#!/usr/bin/env bash

# 通过 Chrome 扩展的 Native Messaging 协议启动 Native Server
# 这会触发 background/index.ts 中的 initNativeHostListener()
# 进而调用 connectNativeHost() 发送 START 消息

echo "=== 通过 Native Messaging 启动 MCP Server ==="

# 1. 首先检查 Native Messaging Host 配置是否存在
HOST_MANIFEST="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.chromemcp.nativehost.json"
if [ ! -f "$HOST_MANIFEST" ]; then
    echo "错误：Native Messaging Host 配置不存在：$HOST_MANIFEST"
    exit 1
fi

echo "✓ Native Messaging Host 配置存在"

# 2. 检查 Node.js 脚本是否存在
NODE_SCRIPT="/Users/heal/mcp-chrome/app/native-server/dist/index.js"
if [ ! -f "$NODE_SCRIPT" ]; then
    echo "错误：Node.js 脚本不存在：$NODE_SCRIPT"
    echo "请先运行：cd /Users/heal/mcp-chrome/app/native-server && npm run build"
    exit 1
fi

echo "✓ Native Server 脚本存在"

# 3. 使用 Node 通过 stdin/stdout 模拟 Native Messaging 协议发送 START 消息
# Native Messaging 协议格式：
# - 前 4 字节：消息长度（little-endian uint32）
# - 剩余字节：JSON 消息内容

echo "正在发送 START 消息到 Native Host..."

# 创建 START 消息
START_MESSAGE='{"type":"START","payload":{"port":12306}}'
MESSAGE_LENGTH=${#START_MESSAGE}

# 将消息长度转换为 4 字节 little-endian 二进制
# 使用 printf 和 xxd 来完成
LEN_HEX=$(printf '%08x' $MESSAGE_LENGTH)
LEN_BINARY=$(echo $LEN_HEX | sed 's/\(..\)/\\x\1/g')

# 发送消息
echo -n "${LEN_BINARY}${START_MESSAGE}" | /Users/heal/mcp-chrome/app/native-server/dist/run_host.sh &

HOST_PID=$!
echo "Native Host 进程已启动，PID: $HOST_PID"

# 等待服务器启动
sleep 3

# 检查服务器是否启动
curl -s http://127.0.0.1:12306/ping 2>/dev/null
if [ $? -eq 0 ]; then
    echo ""
    echo "✓ MCP Server 已成功启动在端口 12306"
else
    echo "✗ MCP Server 启动失败"
fi

# 保持进程运行
echo "按 Ctrl+C 停止服务器"
wait $HOST_PID
