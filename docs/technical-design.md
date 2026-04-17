# 技术设计文档 - Chrome MCP Server 增强功能

**项目名称**: Chrome MCP Server - OpenAI 协议支持 & Claude 本地通信增强
**设计日期**: 2026-04-12
**文档版本**: v1.0
**关联需求**: [requirements-analysis.md](./requirements-analysis.md)

---

## 1. 技术概述

### 1.1 架构位置

```
┌─────────────────────────────────────────────────────────────────────┐
│  User Interface Layer                                                 │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐   │
│  │  Sidepanel UI    │  │  Options Page    │  │  Popup           │   │
│  │  (AgentChat)     │  │  (Settings)      │  │                  │   │
│  └────────┬─────────┘  └────────┬─────────┘  └──────────────────┘   │
│           │                     │                                    │
│           ▼                     ▼                                    │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │                    Background Service                            │ │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │ │
│  │  │ Native Host │  │ Config Mgr  │  │ Debug Mode Controller   │  │ │
│  │  └─────────────┘  └─────────────┘  └─────────────────────────┘  │ │
│  └─────────────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────────────┘
                                │ Native Messaging
                                ▼
┌───────────────────────────────────────────────────────────────────────┐
│  Native Server (Node.js - Port 12306)                                 │
│  ┌─────────────────────────────────────────────────────────────────┐  │
│  │  HTTP Routes (Fastify)                                          │  │
│  │  - /agent/sessions                                               │  │
│  │  - /agent/chat/:id/act                                           │  │
│  │  - /settings/openai (NEW)                                        │  │
│  │  - /debug/enable (NEW)                                           │  │
│  └─────────────────────────────────────────────────────────────────┘  │
│  ┌─────────────────────────────────────────────────────────────────┐  │
│  │  MCP Server                                                      │  │
│  │  - Streamable HTTP                                               │  │
│  │  - STDIO                                                         │  │
│  └─────────────────────────────────────────────────────────────────┘  │
│  ┌─────────────────────────────────────────────────────────────────┐  │
│  │  Agent Engines                                                   │  │
│  │  - ClaudeEngine  → Claude Code CLI                               │  │
│  │  - CodexEngine   → Codex CLI                                     │  │
│  │  - OpenAIEngine  → Direct API Call (NEW)                         │  │
│  └─────────────────────────────────────────────────────────────────┘  │
│  ┌─────────────────────────────────────────────────────────────────┐  │
│  │  Services                                                        │  │
│  │  - ConfigService (NEW)                                           │  │
│  │  - DebugModeService (NEW)                                        │  │
│  └─────────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────────────┘
```

### 1.2 核心设计决策

| 决策点                 | 选择                                    | 理由                    |
| ---------------------- | --------------------------------------- | ----------------------- |
| OpenAI Engine 实现方式 | 直接 API 调用                           | 轻量、无需额外 CLI 依赖 |
| 配置存储位置           | chrome.storage.local + Native Server DB | 分离敏感数据            |
| 调试模式实现           | 本地端口 + Token 白名单                 | 平衡安全与便利          |

---

## 2. 详细设计

### 2.1 需求 1：OpenAI 兼容协议配置

#### 2.1.1 配置数据结构

```typescript
// packages/shared/src/types.ts (新增)
export interface OpenAIProviderConfig {
  id: string; // 配置唯一标识
  name: string; // 配置名称（用户自定义）
  baseUrl: string; // API 基础 URL
  apiKey: string; // API Key（加密存储）
  model: string; // 默认模型
  organization?: string; // 组织 ID（可选）
  maxTokens?: number; // 最大 token 数
  temperature?: number; // 温度参数
  isEnabled: boolean; // 是否启用
  createdAt: number; // 创建时间戳
  updatedAt: number; // 更新时间戳
}

// 存储结构
export interface StorageSchema {
  openaiProviders: OpenAIProviderConfig[]; // 支持多配置
  activeProviderId?: string; // 当前激活的配置 ID
  debugModeEnabled: boolean; // 调试模式开关
  debugModeToken?: string; // 调试模式访问令牌
}
```

#### 2.1.2 配置管理流程

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│  Sidepanel  │    │  Background │    │ Native Svr  │
│     UI      │    │   Service   │    │             │
└──────┬──────┘    └──────┬──────┘    └──────┬──────┘
       │                  │                  │
       │  1. 打开设置页面   │                  │
       ├─────────────────►│                  │
       │                  │                  │
       │  2. 请求配置列表   │                  │
       ├─────────────────►│                  │
       │                  │  3. 读取存储      │
       │                  ├─────────────────►│
       │                  │                  │
       │                  │  4. 返回配置      │
       │                  ◄──────────────────┤
       │                  │                  │
       │  5. 渲染配置列表   │                  │
       ◄──────────────────┤                  │
       │                  │                  │
       │  6. 添加/编辑配置  │                  │
       ├─────────────────►│                  │
       │                  │                  │
       │                  │  7. 验证配置      │
       │                  ├─────────────────►│
       │                  │                  │
       │                  │  8. 测试连接      │
       │                  ├─────────────────►│
       │                  │                  │
       │                  │  9. 保存配置      │
       │                  ├─────────────────►│
       │                  │                  │
       │  10. 保存成功    │                  │
       ◄──────────────────┤                  │
       │                  │                  │
```

#### 2.1.3 API 测试连接实现

```typescript
// app/native-server/src/services/openai-config-service.ts
async function testConnection(config: OpenAIProviderConfig): Promise<{
  success: boolean;
  error?: string;
  model?: string;
}> {
  const url = `${config.baseUrl}/models`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
      },
      signal: AbortSignal.timeout(5000), // 5 秒超时
    });

    if (!response.ok) {
      const error = await response.text().catch(() => 'Unknown error');
      return {
        success: false,
        error: `HTTP ${response.status}: ${error}`,
      };
    }

    const data = await response.json();
    return {
      success: true,
      model: config.model,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Connection failed',
    };
  }
}
```

### 2.2 需求 2：Claude 本地直连通信

#### 2.2.1 调试模式架构

```
┌─────────────────────────────────────────────────────────────────────┐
│  Debug Mode Architecture                                            │
│                                                                     │
│  ┌─────────────┐      ┌─────────────┐      ┌─────────────────────┐ │
│  │   Claude    │      │   Native    │      │  Chrome Extension   │ │
│  │   Local     │      │   Server    │      │                     │ │
│  │   (CLI)     │      │  (Fastify)  │      │  (Background)       │ │
│  └──────┬──────┘      └──────┬──────┘      └──────────┬──────────┘ │
│         │                    │                        │            │
│         │  /debug/enable     │                        │            │
│         │  (POST with token) │                        │            │
│         │───────────────────►│                        │            │
│         │                    │                        │            │
│         │                    │  验证 Token + 启用      │            │
│         │                    │  临时路由白名单         │            │
│         │                    ├───────────────────────►│            │
│         │                    │                        │            │
│         │  200 OK            │                        │            │
│         │  { enabled: true } │                        │            │
│         │◄───────────────────┤                        │            │
│         │                    │                        │            │
│         │  /agent/sessions   │                        │            │
│         │  (无需完整认证)     │                        │            │
│         │───────────────────►│                        │            │
│         │                    │                        │            │
│         │                    │  检查调试模式           │            │
│         │                    │  跳过 MCP 认证           │            │
│         │                    ├───────────────────────►│            │
│         │                    │                        │            │
│         │  sessions data     │                        │            │
│         │◄───────────────────┤                        │            │
│         │                    │                        │            │
└─────────────────────────────────────────────────────────────────────┘
```

#### 2.2.2 调试模式安全设计

```typescript
// app/native-server/src/services/debug-mode-service.ts
interface DebugModeState {
  enabled: boolean;
  enabledAt?: number;
  expiresAt?: number; // 自动过期时间（默认 2 小时）
  allowedOrigins: string[]; // 允许的请求来源
  requestCount: number; // 请求计数（用于审计）
}

class DebugModeService {
  private state: DebugModeState = {
    enabled: false,
    allowedOrigins: ['http://localhost:*', 'chrome-extension:*'],
    requestCount: 0,
  };

  async enable(token: string): Promise<boolean> {
    // 验证调试令牌（可以是预设的简单令牌）
    const isValidToken = await this.validateDebugToken(token);
    if (!isValidToken) return false;

    this.state = {
      enabled: true,
      enabledAt: Date.now(),
      expiresAt: Date.now() + 2 * 60 * 60 * 1000, // 2 小时后过期
      allowedOrigins: ['http://localhost:*', 'chrome-extension:*'],
      requestCount: 0,
    };

    // 自动禁用定时器
    setTimeout(() => this.disable(), 2 * 60 * 60 * 1000);

    return true;
  }

  isAuthenticated(request: FastifyRequest): boolean {
    if (!this.state.enabled) return false;

    // 检查是否过期
    if (this.state.expiresAt && Date.now() > this.state.expiresAt) {
      this.disable();
      return false;
    }

    // 检查来源
    const origin = request.headers.origin;
    if (origin) {
      const isAllowed = this.state.allowedOrigins.some((pattern) => {
        if (pattern.endsWith('*')) {
          return origin.startsWith(pattern.slice(0, -1));
        }
        return origin === pattern;
      });
      return isAllowed;
    }

    return false;
  }

  private async validateDebugToken(token: string): Promise<boolean> {
    // 简单令牌验证（可以是环境变量或预设值）
    const expectedToken = process.env.DEBUG_MODE_TOKEN || 'debug-mode-token';
    return token === expectedToken;
  }

  private disable(): void {
    this.state.enabled = false;
    console.log('[DebugMode] Disabled due to timeout');
  }
}
```

### 2.3 OpenAI Engine 增强

#### 2.3.1 从配置中心获取配置

```typescript
// app/native-server/src/agent/engines/openai.ts (增强版)
export class OpenAIEngine implements AgentEngine {
  public readonly name = 'openai' as const;
  public readonly supportsMcp = false;

  async initializeAndRun(options: EngineInitOptions, ctx: EngineExecutionContext): Promise<void> {
    // 从数据库获取用户配置
    const providerConfig = await this.getProviderConfig(options.dbSessionId);

    if (!providerConfig) {
      throw new Error('No OpenAI provider configured. Please configure in Settings.');
    }

    // 使用用户配置调用 API
    const config = {
      baseUrl: providerConfig.baseUrl,
      apiKey: providerConfig.apiKey,
      model: options.model || providerConfig.model,
      maxTokens: providerConfig.maxTokens,
      temperature: providerConfig.temperature,
    };

    // ... 其余实现
  }

  private async getProviderConfig(dbSessionId?: string): Promise<OpenAIProviderConfig | null> {
    if (!dbSessionId) return null;

    // 从数据库获取 session 关联的配置
    // SELECT * FROM openai_provider_configs WHERE session_id = ?
    // 实现略
  }
}
```

---

## 3. 数据库 Schema 变更

### 3.1 新增表

```sql
-- OpenAI Provider 配置表
CREATE TABLE openai_provider_configs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  base_url TEXT NOT NULL,
  api_key TEXT NOT NULL,  -- 加密存储
  model TEXT NOT NULL DEFAULT 'gpt-4o',
  organization TEXT,
  max_tokens INTEGER DEFAULT 4096,
  temperature REAL DEFAULT 0.7,
  is_enabled INTEGER DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  session_id TEXT,  -- 关联的 session ID（可选）
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);

-- 调试模式日志表
CREATE TABLE debug_mode_logs (
  id TEXT PRIMARY KEY,
  enabled_at INTEGER NOT NULL,
  disabled_at INTEGER,
  reason TEXT,
  request_count INTEGER DEFAULT 0,
  ip_addresses TEXT  -- JSON 数组，记录访问 IP
);
```

### 3.2 现有表变更

```sql
-- Sessions 表新增字段
ALTER TABLE sessions ADD COLUMN provider_config_id TEXT;

-- Projects 表新增字段
ALTER TABLE projects ADD COLUMN default_openai_provider_id TEXT;
```

---

## 4. 前端 UI 设计

### 4.1 设置页面布局

```
┌─────────────────────────────────────────────────────────────────────┐
│  Settings - AI Provider Configuration                               │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  AI Provider                                                │   │
│  │                                                             │   │
│  │  Current Provider: [OpenAI ▼]                              │   │
│  │                                                             │   │
│  │  ┌─────────────────────────────────────────────────────┐   │   │
│  │  │  Configuration List                                  │   │   │
│  │  │  ┌─────────────────────────────────────────────────┐│   │   │
│  │  │  │  ○ OpenAI Official (active)                     ││   │   │
│  │  │  │    https://api.openai.com/v1                    ││   │   │
│  │  │  │    gpt-4o                                       ││   │   │
│  │  │  ├─────────────────────────────────────────────────┤│   │   │
│  │  │  │  ○ Azure OpenAI                                 ││   │   │
│  │  │  │    https://xxx.openai.azure.com/...            ││   │   │
│  │  │  │    gpt-4                                        ││   │   │
│  │  │  ├─────────────────────────────────────────────────┤│   │   │
│  │  │  │  + Add New Provider                             ││   │   │
│  │  │  └─────────────────────────────────────────────────┘│   │   │
│  │  └─────────────────────────────────────────────────────┘   │   │
│  │                                                             │   │
│  │  [Test Connection]  [Save]  [Cancel]                        │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Debug Mode                                                  │   │
│  │                                                             │   │
│  │  ⚠️  Debug mode allows local Claude to connect without     │   │
│  │     full authentication. Only enable during development!    │   │
│  │                                                             │   │
│  │  Enable Debug Mode: [ ]                                     │   │
│  │                                                             │   │
│  │  Status: Disabled                                            │   │
│  │  Token: debug-mode-token (change in .env)                   │   │
│  └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

### 4.2 配置表单字段

```vue
<!-- app/chrome-extension/entrypoints/sidepanel/components/Settings/OpenAIConfig.vue -->
<template>
  <div class="openai-config-form">
    <FormField label="Configuration Name" required>
      <Input v-model="config.name" placeholder="My OpenAI Config" />
    </FormField>

    <FormField label="API Base URL" required>
      <Input v-model="config.baseUrl" placeholder="https://api.openai.com/v1" type="url" />
    </FormField>

    <FormField label="API Key" required>
      <Input v-model="config.apiKey" type="password" placeholder="sk-..." />
    </FormField>

    <FormField label="Model" required>
      <Input v-model="config.model" placeholder="gpt-4o" />
    </FormField>

    <FormField label="Max Tokens">
      <Input v-model.number="config.maxTokens" type="number" placeholder="4096" />
    </FormField>

    <FormField label="Temperature">
      <Input
        v-model.number="config.temperature"
        type="number"
        step="0.1"
        min="0"
        max="2"
        placeholder="0.7"
      />
    </FormField>

    <div class="form-actions">
      <Button @click="testConnection" :loading="testing"> Test Connection </Button>
      <Button @click="save" :disabled="!isValid"> Save Configuration </Button>
    </div>

    <!-- Test Result -->
    <Alert v-if="testResult" :type="testResult.success ? 'success' : 'error'">
      {{ testResult.message }}
    </Alert>
  </div>
</template>
```

---

## 5. API 接口设计

### 5.1 OpenAI Provider 配置 API

```typescript
// app/native-server/src/server/routes/settings.ts

// GET /settings/openai/providers - 获取所有配置列表
fastify.get('/settings/openai/providers', async (request, reply) => {
  const providers = await openaiConfigService.getAll();
  return reply.send({ providers });
});

// POST /settings/openai/providers - 创建新配置
fastify.post('/settings/openai/providers', async (request, reply) => {
  const config: OpenAIProviderConfig = request.body;
  const created = await openaiConfigService.create(config);
  return reply.status(201).send({ provider: created });
});

// PUT /settings/openai/providers/:id - 更新配置
fastify.put('/settings/openai/providers/:id', async (request, reply) => {
  const { id } = request.params;
  const config: OpenAIProviderConfig = request.body;
  const updated = await openaiConfigService.update(id, config);
  return reply.send({ provider: updated });
});

// DELETE /settings/openai/providers/:id - 删除配置
fastify.delete('/settings/openai/providers/:id', async (request, reply) => {
  const { id } = request.params;
  await openaiConfigService.delete(id);
  return reply.status(204).send();
});

// POST /settings/openai/providers/:id/test - 测试连接
fastify.post('/settings/openai/providers/:id/test', async (request, reply) => {
  const { id } = request.params;
  const result = await openaiConfigService.testConnection(id);
  return reply.send(result);
});

// GET /settings/openai/active - 获取当前激活的配置
fastify.get('/settings/openai/active', async (request, reply) => {
  const active = await openaiConfigService.getActive();
  return reply.send({ provider: active });
});

// POST /settings/openai/active - 设置激活的配置
fastify.post('/settings/openai/active', async (request, reply) => {
  const { providerId } = request.body;
  await openaiConfigService.setActive(providerId);
  return reply.send({ success: true });
});
```

### 5.2 调试模式 API

```typescript
// app/native-server/src/server/routes/debug.ts

// POST /debug/enable - 启用调试模式
fastify.post('/debug/enable', async (request, reply) => {
  const { token } = request.body as { token: string };
  const success = await debugModeService.enable(token);

  if (!success) {
    return reply.status(401).send({ error: 'Invalid token' });
  }

  return reply.send({
    enabled: true,
    expiresAt: debugModeService.getExpiresAt(),
  });
});

// GET /debug/status - 获取调试模式状态
fastify.get('/debug/status', async (request, reply) => {
  const status = debugModeService.getStatus();
  return reply.send(status);
});

// POST /debug/disable - 手动禁用调试模式
fastify.post('/debug/disable', async (request, reply) => {
  debugModeService.disable();
  return reply.send({ disabled: true });
});
```

---

## 6. 文件结构

### 6.1 新增文件

```
app/native-server/src/
├── services/
│   ├── openai-config-service.ts      # OpenAI 配置管理
│   └── debug-mode-service.ts         # 调试模式管理
├── server/routes/
│   ├── settings.ts                   # 设置相关路由
│   └── debug.ts                      # 调试模式路由
└── agent/engines/
    └── openai.ts                     # (已创建) OpenAI Engine

app/chrome-extension/entrypoints/sidepanel/
└── components/Settings/
    ├── OpenAIConfig.vue              # OpenAI 配置组件
    ├── DebugModeToggle.vue           # 调试模式开关
    └── ProviderList.vue              # 配置列表组件

packages/shared/src/
└── types.ts                          # (更新) 新增类型定义
```

### 6.2 修改文件

```
app/native-server/src/
├── server/index.ts                   # 注册新路由
├── agent/db/schema.ts                # 新增数据库表
└── agent/chat-service.ts             # 支持 OpenAI Engine

app/chrome-extension/
├── entrypoints/sidepanel/App.vue     # 添加设置入口
├── entrypoints/background/index.ts   # 调试模式监听
└── common/message-types.ts           # 新增消息类型
```

---

## 7. 测试策略

### 7.1 单元测试

```typescript
// app/native-server/src/services/__tests__/openai-config-service.test.ts
describe('OpenAIConfigService', () => {
  test('should create provider config', async () => {
    // ...
  });

  test('should test connection successfully', async () => {
    // ...
  });

  test('should fail with invalid API key', async () => {
    // ...
  });
});

// app/native-server/src/services/__tests__/debug-mode-service.test.ts
describe('DebugModeService', () => {
  test('should enable with valid token', async () => {
    // ...
  });

  test('should reject invalid token', async () => {
    // ...
  });

  test('should auto-disable after timeout', async () => {
    // ...
  });
});
```

### 7.2 集成测试

```typescript
// app/native-server/src/server/__tests__/settings.test.ts
describe('Settings Routes', () => {
  test('GET /settings/openai/providers returns list', async () => {
    // ...
  });

  test('POST /settings/openai/providers/:id/test validates connection', async () => {
    // ...
  });
});
```

### 7.3 E2E 测试

```typescript
// app/chrome-extension/e2e/settings.spec.ts
test('user can configure OpenAI provider', async () => {
  // 1. 打开设置页面
  // 2. 填写配置表单
  // 3. 点击测试连接
  // 4. 验证测试结果显示成功
  // 5. 保存配置
  // 6. 验证配置列表中出现新配置
});
```

---

## 8. 安全考虑

### 8.1 API Key 加密存储

```typescript
// 使用 Node.js crypto 模块加密
import { createCipheriv, createDecipheriv } from 'node:crypto';

function encryptApiKey(apiKey: string): string {
  const key = process.env.ENCRYPTION_KEY || getDefaultKey();
  const iv = crypto.randomBytes(16);
  const cipher = createCipheriv('aes-256-gcm', key, iv);

  let encrypted = cipher.update(apiKey, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  return JSON.stringify({
    encrypted,
    iv: iv.toString('hex'),
    authTag: cipher.getAuthTag().toString('hex'),
  });
}
```

### 8.2 调试模式安全

| 措施       | 实现                                 |
| ---------- | ------------------------------------ |
| 默认禁用   | 服务启动时调试模式默认关闭           |
| Token 验证 | 需要正确的 token 才能启用            |
| 自动过期   | 2 小时后自动禁用                     |
| 请求日志   | 记录所有调试模式请求                 |
| 来源限制   | 仅允许 localhost 和 chrome-extension |

---

## 9. 部署与发布

### 9.1 环境变量

```bash
# .env.example

# OpenAI Engine 默认配置
OPENAI_API_KEY=sk-...
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_DEFAULT_MODEL=gpt-4o

# 调试模式
DEBUG_MODE_TOKEN=debug-mode-token  # 生产环境应修改
ENCRYPTION_KEY=32-byte-hex-key-here
```

### 9.2 迁移步骤

1. 运行数据库迁移脚本
2. 更新环境变量
3. 重启 Native Server
4. 验证现有功能正常

---

## 10. 后续增强方向

| 功能             | 优先级 | 说明                              |
| ---------------- | ------ | --------------------------------- |
| 多配置切换       | P1     | 支持多个 OpenAI 配置快速切换      |
| 配置导入导出     | P2     | 支持 JSON 格式导入导出            |
| 使用量统计       | P3     | 记录 API 调用次数和 token 消耗    |
| 模型列表自动获取 | P2     | 根据 API URL 自动获取可用模型列表 |

---

**文档状态**: 待审核
**下一步**: 任务拆分 (Phase 3)
