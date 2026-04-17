# Chrome MCP Server - 快速启动指南

**无需数据库** - 使用环境变量配置，5 分钟内启动

---

## 前置要求

- Node.js >= 20.0.0
- npm 或 pnpm

---

## Step 1: 安装依赖

```bash
cd /Users/heal/mcp-chrome/app/native-server
npm install
```

或使用 pnpm：

```bash
cd /Users/heal/mcp-chrome/app/native-server
pnpm install
```

---

## Step 2: 配置环境变量

复制示例环境变量文件：

```bash
cp .env.example .env
```

编辑 `.env` 文件，设置你的 OpenAI API Key：

```bash
# 必须设置
OPENAI_API_KEY="sk-your-actual-api-key-here"

# 可选：使用其他兼容 API
# OPENAI_BASE_URL="https://api.openai.com/v1"
# OPENAI_BASE_URL="http://localhost:11434/v1"  # Ollama
# OPENAI_BASE_URL="https://your-resource.openai.azure.com/..."  # Azure

# 可选：自定义模型
OPENAI_DEFAULT_MODEL="gpt-4o"

# 调试模式（本地开发用）
DEBUG_MODE_ENABLED="true"
DEBUG_MODE_TOKEN="debug-token"

# 服务器端口
NATIVE_SERVER_PORT="12306"
```

---

## Step 3: 启动服务器

### 方式 1: 使用快速启动脚本（推荐）

```bash
npm run quick-start
```

### 方式 2: 直接启动开发服务器

```bash
npm run dev
```

---

## Step 4: 测试连接

### 测试服务器是否运行

```bash
curl http://127.0.0.1:12306/ping
# 响应：{"status":"ok","message":"pong"}
```

### 测试调试模式

```bash
curl http://127.0.0.1:12306/debug/status
# 响应：{"enabled":true}
```

### 测试 OpenAI 配置

```bash
curl http://127.0.0.1:12306/settings/openai/active
```

### 测试 OpenAI 连接

```bash
curl -X POST http://127.0.0.1:12306/settings/openai/test \
  -H "Content-Type: application/json"
```

### 查看可用引擎

```bash
curl http://127.0.0.1:12306/agent/engines
# 响应应包含：claude, codex, openai
```

---

## Step 5: 使用 OpenAI Engine

### 通过 MCP 客户端

配置你的 MCP 客户端连接到：

```
http://127.0.0.1:12306/mcp
```

### 通过 HTTP API

```bash
# 1. 创建 Session（简化版，内存存储）
curl -X POST http://127.0.0.1:12306/agent/projects \
  -H "Content-Type: application/json" \
  -d '{"name":"test-project","rootPath":"/path/to/project"}'

# 2. 发送指令
curl -X POST http://127.0.0.1:12306/agent/chat/{sessionId}/act \
  -H "Content-Type: application/json" \
  -d '{"instruction":"Hello, help me with this task","cliPreference":"openai"}'
```

---

## 常见问题

### Q: OPENAI_API_KEY 错误

**错误**: `OPENAI_API_KEY environment variable is not set`

**解决**:

1. 检查 `.env` 文件是否存在
2. 确认 `OPENAI_API_KEY` 已正确设置
3. 重启服务器

### Q: 端口已被占用

**错误**: `EADDRINUSE: address already in use`

**解决**:

```bash
# 修改端口
echo 'NATIVE_SERVER_PORT="12307"' >> .env

# 或者关闭占用端口的进程
lsof -i :12306
kill -9 <PID>
```

### Q: 无法连接到 OpenAI API

**错误**: `Connection timeout` 或 `401 Unauthorized`

**解决**:

1. 检查网络连接
2. 确认 API Key 正确
3. 如果使用代理，设置环境变量：
   ```bash
   export HTTPS_PROXY=http://your-proxy:port
   ```

### Q: 如何使用 Azure OpenAI？

**配置**:

```bash
OPENAI_BASE_URL="https://your-resource.openai.azure.com/openai/deployments/your-deployment"
OPENAI_API_KEY="your-azure-key"
OPENAI_DEFAULT_MODEL="gpt-4"
```

### Q: 如何使用本地模型（Ollama）？

**配置**:

```bash
OPENAI_BASE_URL="http://localhost:11434/v1"
OPENAI_API_KEY="not-needed"
OPENAI_DEFAULT_MODEL="llama-3"
```

---

## 下一步

1. **前端开发** - 继续开发 Sidepanel UI
2. **添加数据库** - 当需要持久化时，可以添加 SQLite
3. **增强安全** - 生产环境需要更严格的安全措施

---

## 可用 API 端点

| 端点                      | 方法            | 说明                 |
| ------------------------- | --------------- | -------------------- |
| `/ping`                   | GET             | 健康检查             |
| `/debug/enable`           | POST            | 启用调试模式         |
| `/debug/status`           | GET             | 获取调试模式状态     |
| `/debug/disable`          | POST            | 禁用调试模式         |
| `/settings/openai/active` | GET             | 获取当前 OpenAI 配置 |
| `/settings/openai/test`   | POST            | 测试 OpenAI 连接     |
| `/settings/openai/models` | GET             | 获取可用模型列表     |
| `/agent/engines`          | GET             | 获取可用引擎列表     |
| `/mcp`                    | GET/POST/DELETE | MCP 协议端点         |

---

## 环境变量参考

| 变量                   | 必需 | 默认值                      | 说明            |
| ---------------------- | ---- | --------------------------- | --------------- |
| `OPENAI_API_KEY`       | 是   | -                           | OpenAI API 密钥 |
| `OPENAI_BASE_URL`      | 否   | `https://api.openai.com/v1` | API 基础 URL    |
| `OPENAI_DEFAULT_MODEL` | 否   | `gpt-4o`                    | 默认模型        |
| `OPENAI_MAX_TOKENS`    | 否   | `4096`                      | 最大 token 数   |
| `OPENAI_TEMPERATURE`   | 否   | `0.7`                       | 温度参数        |
| `DEBUG_MODE_ENABLED`   | 否   | `false`                     | 启用调试模式    |
| `DEBUG_MODE_TOKEN`     | 否   | `debug-token`               | 调试模式令牌    |
| `NATIVE_SERVER_PORT`   | 否   | `12306`                     | 服务器端口      |

---

**文档版本**: 1.0
**最后更新**: 2026-04-12
