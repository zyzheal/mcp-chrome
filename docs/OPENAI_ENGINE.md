# OpenAI Engine 配置说明

## 添加 OpenAI Engine 到项目中

### 已完成的工作

1. **创建 OpenAI Engine 文件**
   - 位置：`app/native-server/src/agent/engines/openai.ts`
   - 实现了 `AgentEngine` 接口
   - 支持 OpenAI API 及兼容的 API 端点

2. **更新类型定义**
   - `app/native-server/src/agent/engines/types.ts`: 添加 `'openai'` 到 `EngineName`
   - `app/native-server/src/server/routes/agent.ts`: 添加 `'openai'` 到 `VALID_ENGINE_NAMES`

3. **注册 Engine**
   - `app/native-server/src/server/index.ts`: 导入并注册 `OpenAIEngine`

### 环境变量配置

在使用 OpenAI Engine 之前，需要设置以下环境变量：

```bash
# 必需：OpenAI API Key
export OPENAI_API_KEY="sk-..."

# 可选：API 基础 URL (默认：https://api.openai.com/v1)
export OPENAI_BASE_URL="https://api.openai.com/v1"

# 可选：默认模型 (默认：gpt-4o)
export OPENAI_DEFAULT_MODEL="gpt-4o"

# 可选：组织 ID
export OPENAI_ORGANIZATION="org-..."

# 可选：项目 ID
export OPENAI_PROJECT="proj-..."

# 可选：最大 token 数 (默认：4096)
export OPENAI_MAX_TOKENS="4096"

# 可选：温度 (默认：0.7)
export OPENAI_TEMPERATURE="0.7"
```

### 使用兼容 API 端点

OpenAI Engine 支持任何 OpenAI 兼容的 API，例如：

#### Azure OpenAI

```bash
export OPENAI_API_KEY="your-azure-key"
export OPENAI_BASE_URL="https://your-resource.openai.azure.com/openai/deployments/your-deployment"
export OPENAI_DEFAULT_MODEL="gpt-4"
```

#### 本地 LLM 服务器 (如 Ollama、vLLM 等)

```bash
export OPENAI_API_KEY="not-needed"
export OPENAI_BASE_URL="http://localhost:11434/v1"
export OPENAI_DEFAULT_MODEL="llama-3"
```

#### 其他第三方服务

```bash
# DeepSeek
export OPENAI_BASE_URL="https://api.deepseek.com/v1"
export OPENAI_API_KEY="sk-..."

# Moonshot
export OPENAI_BASE_URL="https://api.moonshot.cn/v1"
export OPENAI_API_KEY="sk-..."
```

### 在 AgentChat 中使用

1. **创建 Session 时指定 engine**

在创建新的 Agent Session 时，选择 `openai` 作为引擎：

```json
POST /agent/projects/{projectId}/sessions
{
  "engineName": "openai",
  "model": "gpt-4o"
}
```

2. **发送指令**

```json
POST /agent/chat/{sessionId}/act
{
  "instruction": "帮我分析当前网页的内容",
  "cliPreference": "openai"
}
```

3. **通过 Sidepanel UI**

在 AgentChat Sidepanel 中：

- 选择或创建一个新的 Session
- 选择 Engine 为 "openai"
- 输入指令并发送

### 功能特性

| 功能     | 支持状态                    |
| -------- | --------------------------- |
| 文本对话 | ✅ 支持                     |
| 流式输出 | ✅ 支持                     |
| 图片理解 | ✅ 支持 (GPT-4V 及兼容模型) |
| 工具调用 | ❌ 暂不支持                 |
| MCP 集成 | ❌ 暂不支持                 |
| 会话恢复 | ❌ 暂不支持                 |

### 与 Claude Engine 的对比

| 特性       | Claude Engine   | OpenAI Engine     |
| ---------- | --------------- | ----------------- |
| 底层实现   | Claude Code CLI | 直接 API 调用     |
| MCP 支持   | ✅              | ❌                |
| 文件系统   | ✅ (通过 CLI)   | ❌                |
| 图片理解   | ✅              | ✅                |
| 会话恢复   | ✅              | ❌                |
| 配置复杂度 | 中 (需安装 CLI) | 低 (只需 API Key) |

### 故障排除

#### 错误：OPENAI_API_KEY environment variable is not set

确保已设置环境变量：

```bash
export OPENAI_API_KEY="sk-..."
```

#### 错误：401 Unauthorized

检查 API Key 是否正确，以及是否有足够的额度。

#### 错误：404 Not Found

检查 `OPENAI_BASE_URL` 是否正确，特别是使用兼容 API 时。

#### 错误：Rate limit exceeded

降低请求频率或升级 API 套餐。

### 后续改进方向

1. **添加 MCP 支持** - 让 OpenAI Engine 也能调用 MCP 工具
2. **添加函数调用支持** - 支持 OpenAI 的 function calling
3. **会话恢复** - 支持继续之前的对话
4. **流式思考过程** - 支持显示模型的思考过程
5. **成本计算** - 根据 token 使用量计算实际成本

### 参考资料

- [OpenAI API 文档](https://platform.openai.com/docs/api-reference)
- [OpenAI 兼容 API 列表](https://github.com/openai/openai-openapi)
- [Azure OpenAI Service](https://learn.microsoft.com/azure/ai-services/openai/)
