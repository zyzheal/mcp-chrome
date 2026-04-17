# MCP-Chrome 项目完整逻辑文档

> 本文档全面梳理了 MCP-Chrome 项目的核心逻辑、架构设计、数据流和关键实现细节。

---

## 目录

1. [项目概述](#1-项目概述)
2. [整体架构](#2-整体架构)
3. [Chrome 扩展核心逻辑](#3-chrome-扩展核心逻辑)
4. [Native Server 核心逻辑](#4-native-server-核心逻辑)
5. [Record-Replay V3 录制回放引擎](#5-record-replay-v3-录制回放引擎)
6. [Tools 浏览器工具系统](#6-tools-浏览器工具系统)
7. [通信协议与数据流](#7-通信协议与数据流)
8. [开发指南](#8-开发指南)

---

## 1. 项目概述

### 1.1 项目定位

MCP-Chrome 是一个基于 Chrome 扩展的 **Model Context Protocol (MCP) 服务器**，将 Chrome 浏览器功能暴露给 AI 助手（如 Claude、Codex 等），实现：

- **浏览器自动化**：AI 直接控制用户的日常 Chrome 浏览器
- **内容分析**：语义搜索、网页内容提取、网络监控
- **录制回放**：可视化录制和回放浏览器操作流
- **Agent 编排**：多引擎支持（Claude、Codex 等）的会话管理

### 1.2 核心优势

| 特性           | 说明                                           |
| -------------- | ---------------------------------------------- |
| **零配置复用** | 直接使用用户已有的 Chrome 登录状态、扩展、设置 |
| **完全本地**   | 所有处理在本地完成，保护用户隐私               |
| **跨标签页**   | 支持多标签页上下文操作                         |
| **语义搜索**   | 内置 WASM SIMD 加速的向量数据库                |
| **20+ 工具**   | 截图、网络监控、交互操作、书签管理等           |
| **WASM 核心**  | Rust 编译的单文件 WASM，扩展与服务器共享逻辑   |

### 1.3 技术栈

| 层级          | 技术                                                       |
| ------------- | ---------------------------------------------------------- |
| Chrome 扩展   | WXT, Vue 3, Vite, TailwindCSS 4, Manifest V3               |
| Native Server | Node.js, TypeScript, Fastify, MCP SDK, SQLite, Drizzle ORM |
| AI/ML         | Transformers.js, HNSW 向量库, WebAssembly SIMD             |
| WASM 核心     | Rust, wasm-bindgen, serde（单文件 WASM，双端共享逻辑）     |
| 构建工具      | pnpm, wasm-pack, tsup, cargo                               |

---

## 2. 整体架构

### 2.1 Monorepo 结构

```
mcp-chrome/
├── app/
│   ├── chrome-extension/     # Chrome 扩展（前端 UI + 扩展功能）
│   │   └── native-wasm/      # WASM 产物（构建时自动复制）
│   └── native-server/        # 原生服务器（MCP 协议 + HTTP 服务 + Agent）
│       └── native-wasm/      # WASM 产物（构建时自动复制）
├── packages/
│   ├── shared/               # 共享类型和工具
│   ├── wasm-simd/            # WebAssembly SIMD 加速模块
│   └── native-wasm/          # Rust WASM 核心逻辑（协议、选择器、流程引擎、MCP 工具）
│       ├── src/
│       │   ├── lib.rs        # WASM 绑定入口
│       │   ├── protocol.rs   # Native Messaging 协议（4字节 LE 帧）
│       │   ├── selector.rs   # CSS 选择器生成与元素指纹
│       │   ├── reconnect.rs  # 指数退避重连管理器
│       │   ├── flow_engine.rs# 录制回放流程引擎
│       │   └── mcp.rs        # MCP 协议工具与缓存
│       └── scripts/
│           ├── build.sh      # 完整流水线：test → wasm → copy
│           └── build-wasm.sh # WASM 编译
└── docs/                     # 项目文档
```

### 2.2 三层架构

```
┌─────────────────────────────────────────────────────────┐
│                   AI 客户端层                            │
│   Claude Desktop / Cherry Studio / 其他 MCP Client      │
└──────────────────────┬──────────────────────────────────┘
                       │ HTTP/SSE 或 STDIO
┌──────────────────────▼──────────────────────────────────┐
│                   Native Server 层                       │
│  ┌────────────┐  ┌────────────┐  ┌──────────────────┐  │
│  │ Fastify    │  │ MCP Server │  │ Agent 编排系统    │  │
│  │ HTTP 服务  │  │ (STDIO/    │  │ (Claude/Codex)   │  │
│  │            │  │ Streamable)│  │                  │  │
│  └────────────┘  └────────────┘  └──────────────────┘  │
│  ┌──────────────────────────────────────────────────┐  │
│  │ native-wasm (WASM)                                │  │
│  │ - Native Messaging 协议帧解析                     │  │
│  │ - 心跳状态机 / 重连管理                           │  │
│  │ - Flow 流程引擎（变量插值、条件执行）              │  │
│  │ - MCP 协议工具 / 缓存                             │  │
│  └──────────────────────────────────────────────────┘  │
└──────────────────────┬──────────────────────────────────┘
                       │ Native Messaging Protocol (STDIO)
┌──────────────────────▼──────────────────────────────────┐
│                   Chrome 扩展层                          │
│  ┌────────────┐  ┌────────────┐  ┌──────────────────┐  │
│  │ Background │  │ Sidepanel  │  │ Tools 系统       │  │
│  │ Script     │  │ (Vue UI)   │  │ (20+ 浏览器工具) │  │
│  │            │  │            │  │                  │  │
│  └────────────┘  └────────────┘  └──────────────────┘  │
│  ┌──────────────────────────────────────────────────┐  │
│  │ native-wasm (WASM)                                │  │
│  │ - CSS 选择器生成 / 元素指纹                       │  │
│  │ - 协议帧序列化 / 增量解析器                       │  │
│  │ - 重连管理器（指数退避 + 抖动）                    │  │
│  │ - Flow 流程引擎（录制回放状态机）                  │  │
│  │ - MCP 协议工具 / 缓存                             │  │
│  └──────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────┐  │
│  │ Record-Replay V3 引擎 (DAG 录制回放)             │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### 2.3 数据流概览

```
AI 请求 → MCP Client → Native Server → Chrome 扩展 → Chrome API → 浏览器操作
                                                    ↓
响应结果 ← MCP Client ← Native Server ← Chrome 扩展 ← 结果返回
```

---

## 3. Chrome 扩展核心逻辑

### 3.1 扩展配置 (wxt.config.ts)

**关键权限**：

- `nativeMessaging` - 与 Native Server 通信
- `tabs`, `activeTab`, `scripting` - 标签页控制
- `debugger`, `webRequest`, `webNavigation` - 网络监控
- `history`, `bookmarks` - 数据管理
- `sidePanel` - 侧边栏 UI
- `offscreen` - 离屏文档（AI 处理）

**快捷键**：

- `Ctrl/Cmd+Shift+O` - 切换 Web Editor
- `Ctrl/Cmd+Shift+U` - 切换 Quick Panel AI Chat

### 3.2 Background Script

**入口文件**：`entrypoints/background/index.ts`

**核心职责**：

1. 初始化 Native Messaging 通信
2. 注册和管理 Tools 系统
3. 处理来自 Native Server 的工具调用请求
4. 管理 Record-Replay 引擎生命周期
5. 维护扩展状态（连接状态、活跃标签页等）

**生命周期**：

```
扩展加载 → 初始化 Background → 建立 Native Messaging 通道
         → 注册 Tools → 等待 START 消息 → 启动 HTTP 服务器
         → 进入消息循环 → 处理工具调用/事件推送
```

### 3.3 Native Messaging 通信

**协议格式**：

```
[4 bytes: uint32 LE 长度][N bytes: JSON 字符串]
```

**消息类型**：

| 类型                  | 方向      | 功能                         |
| --------------------- | --------- | ---------------------------- |
| `START`               | 扩展→主机 | 启动 HTTP 服务器（携带端口） |
| `STOP`                | 扩展→主机 | 停止 HTTP 服务器             |
| `TOOL_CALL`           | 主机→扩展 | 工具调用请求                 |
| `TOOL_RESULT`         | 扩展→主机 | 工具执行结果                 |
| `heartbeat_ping/pong` | 双向      | 连接健康检测                 |

**心跳机制**：

- 每 30 秒发送 `heartbeat_ping`
- 10 秒内未收到响应视为连接断开
- 连接断开时触发 cleanup 流程

### 3.4 Sidepanel 侧边栏

**技术栈**：Vue 3 + Composition API

**核心功能模块**：

1. **Agent 会话管理**：创建、查看、管理 AI 会话
2. **设置面板**：配置 API 密钥、引擎选择、权限模式
3. **调试工具**：实时查看工具调用日志和状态
4. **录制回放 UI**：管理 Flow、触发执行、查看结果

**状态管理**：

- 使用 Vue composables 模式（`useAgentServer`, `useAgentSessions` 等）
- 通过 HTTP API 与 Native Server 交互
- SSE 连接接收实时事件推送

---

## 4. Native Server 核心逻辑

### 4.1 启动流程

**入口文件**：`src/index.ts`

```
1. 创建 Server 实例（Fastify HTTP 服务器）
2. 创建 NativeMessagingHost 实例（原生消息主机）
3. 双向绑定：server.setNativeHost(nativeHost)
4. nativeHost.start() 启动 STDIO 消息监听
5. 等待 Chrome 扩展发送 START 消息
6. 收到 START 后启动 HTTP 服务器（默认端口 12306）
```

**关键设计**：

- 所有日志使用 `console.error`（stdout 必须保持纯净用于 Native Messaging）
- 信号处理（SIGINT、SIGTERM）确保优雅退出
- HTTP 服务器延迟启动，由扩展触发

### 4.2 CLI 工具

**入口文件**：`src/cli.ts`

**支持命令**：

| 命令                 | 功能                                        |
| -------------------- | ------------------------------------------- |
| `register`           | 注册 Native Messaging Host（用户级/系统级） |
| `fix-permissions`    | 修复脚本执行权限                            |
| `update-port <port>` | 更新端口配置                                |
| `doctor`             | 诊断安装和环境问题                          |
| `report`             | 导出诊断报告                                |

**注册流程**：

- 用户级：写入 `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/`
- 系统级：写入 `/Library/Google/Chrome/NativeMessagingHosts/`（需 sudo）
- 自动检测浏览器（Chrome/Chromium）
- 固化 Node.js 路径避免版本不匹配

### 4.3 MCP 协议实现

#### 4.3.1 STDIO MCP Server

**文件**：`src/mcp/mcp-server-stdio.ts`

**架构**：

```
外部 MCP Client (STDIO) → StdioChromeMcpServer → StreamableHTTP Client → 本地 Fastify (/mcp)
```

**特点**：

- 使用 `StdioServerTransport` 接收 STDIO 连接
- 作为 MCP Client 代理请求到本地 `/mcp` 端点
- 配置文件 `stdio-config.json` 指定目标 URL

#### 4.3.2 Streamable HTTP MCP Server

**实现位置**：`src/server/index.ts` 的 `setupMcpRoutes()`

**端点**：

| 端点   | 方法   | 功能                                   |
| ------ | ------ | -------------------------------------- |
| `/mcp` | POST   | 初始化请求，创建 Session               |
| `/mcp` | GET    | SSE 流式响应（需 `mcp-session-id` 头） |
| `/mcp` | DELETE | 关闭 Session                           |

**工具注册**：

1. **静态工具**：来自 `chrome-mcp-shared` 的 `TOOL_SCHEMAS`
2. **动态工具**：从 Chrome 扩展获取录制的 Flow，转换为 `flow.{slug}` 格式

**工具调用流程**：

```
MCP Client → callTool → NativeMessagingHost.sendRequestToExtensionAndWait()
→ Chrome 扩展执行 → 返回结果 → 转换为 CallToolResult
```

### 4.4 HTTP 服务器

**框架**：Fastify  
**端口**：默认 12306  
**绑定**：`127.0.0.1`（仅本地访问）

#### 4.4.1 路由模块

| 模块       | 端点前缀                    | 功能               |
| ---------- | --------------------------- | ------------------ |
| Agent 路由 | `/agent/`                   | 会话管理、引擎调用 |
| 调试路由   | `/debug/`                   | 调试模式开关和状态 |
| 设置路由   | `/settings/`                | OpenAI 配置管理    |
| 状态路由   | `/health`, `/status`        | 健康检查和状态     |
| MCP 路由   | `/sse`, `/messages`, `/mcp` | MCP 协议端点       |
| 扩展通信   | `/ask-extension`            | 与扩展交互         |

#### 4.4.2 CORS 配置

仅允许以下来源：

- `chrome-extension://` （Chrome 扩展）
- `moz-extension://` （Firefox 扩展）
- `http://127.0.0.1` （本地调试）

### 4.5 Agent 系统

#### 4.5.1 架构设计

```
HTTP Request (/agent/chat)
    ↓
AgentChatService.handleAct()
    ↓
┌─────────────────────────────────────────┐
│  AgentChatService（调度层）               │
│  - 解析引擎名称                           │
│  - 加载项目/会话配置                      │
│  - 处理图片附件                          │
│  - 创建 EngineExecutionContext           │
└─────────────────────────────────────────┘
    ↓
┌──────────────────┐  ┌──────────────────┐
│   ClaudeEngine   │  │   CodexEngine    │
│  (SDK 动态导入)   │  │  (CLI spawn)     │
└──────────────────┘  └──────────────────┘
    ↓                        ↓
┌─────────────────────────────────────────┐
│  AgentStreamManager.publish()            │
│  → SSE/WebSocket → Sidepanel UI         │
└─────────────────────────────────────────┘
```

#### 4.5.2 引擎解析优先级

```
session.engineName > request.cliPreference > project.preferredCli > 默认引擎
```

#### 4.5.3 Claude Engine

**特点**：

- 动态导入 `@anthropic-ai/claude-agent-sdk`（避免硬依赖）
- 支持会话恢复（`resume` 选项）
- 权限模式：默认 `bypassPermissions`（无头操作）
- Chrome MCP 注入：将本地 `/mcp` 端点注册为 SDK 的 MCP Server
- CCR 支持：Claude Code Router 兼容
- 工具输入累积：通过 `pendingToolInputs` Map 累积 JSON 片段

#### 4.5.4 Codex Engine

**特点**：

- 通过 `spawn` 启动 `codex exec --json` 子进程
- JSON 事件流解析（`item.started`, `item.delta`, `item.completed`）
- Chrome MCP 注入：通过 `-c mcp_servers.chrome_mcp_http.url=...`
- 超时控制：默认 15 分钟
- 支持 `maxTurns`, `maxThinkingTokens`, `sandboxMode` 等配置

### 4.6 会话管理

**数据库**：better-sqlite3 + Drizzle ORM

**表结构**：

| 表         | 用途     | 关键字段                                                   |
| ---------- | -------- | ---------------------------------------------------------- |
| `projects` | 项目管理 | id, name, rootPath, preferredCli, activeClaudeSessionId    |
| `sessions` | 会话管理 | id, projectId, engineName, engineSessionId, permissionMode |
| `messages` | 消息历史 | id, sessionId, role, content, messageType, requestId       |

**会话状态流转**：

```
1. 创建会话 → 返回 session 对象
2. 发送消息 → AgentChatService.handleAct()
3. 引擎执行 → 通过 ctx.emit() 推送 RealtimeEvent
4. 引擎返回 session ID → 更新 sessions.engineSessionId
5. 下次发送 → 使用 engineSessionId 恢复上下文
```

---

## 4.x Native WASM 核心（Rust）

`native-wasm` 是用 Rust 编写的 WebAssembly 模块，将 Chrome 扩展和 Native Server 的**共享可移植逻辑**提取为单文件 WASM，在两端复用同一份代码。

### 4.x.1 设计动机

```
问题：Chrome 扩展（JS）和 Native Server（Node.js）中有大量相同的逻辑：
  - Native Messaging 协议帧解析
  - CSS 选择器生成与元素指纹
  - 录制回放流程引擎
  - MCP 协议工具与缓存

旧方案：在两端各维护一份 TS 实现 → 逻辑不一致、修复需改两处

新方案：用 Rust 编写核心逻辑，编译为 WASM，两端共享 → 单一真实源
```

### 4.x.2 模块结构

| 模块        | 文件             | 功能                                                            |
| ----------- | ---------------- | --------------------------------------------------------------- |
| protocol    | `protocol.rs`    | 4 字节 LE 长度前缀帧、增量解析器、心跳状态机、请求追踪          |
| selector    | `selector.rs`    | 9 级 CSS 选择器策略、元素指纹、稳定性评分、定位器映射           |
| reconnect   | `reconnect.rs`   | 指数退避（500ms→60s）、抖动、冷却模式、连接模式切换             |
| flow_engine | `flow_engine.rs` | 14 种步骤类型的状态机、变量插值、条件执行、MCP 工具定义生成     |
| mcp         | `mcp.rs`         | MCP 请求/响应、工具列表缓存（TTL 5min）、Flow ID 缓存、会话管理 |

### 4.x.3 WASM API 总览

```javascript
import init, * as wasm from './native-wasm/native_wasm.js';
await init();

// 协议帧
wasm.frameMessage(jsonStr); // JSON → base64(4B LE 长度 + JSON)
wasm.parseMessage(base64Data); // base64 → JSON

// 心跳 & 重连
new wasm.HeartbeatState(intervalMs, timeoutMs);
new wasm.ReconnectState();

// 选择器引擎
wasm.generateSelectors(elementJson);
wasm.generateFingerprint(elementJson);
wasm.fingerprintSimilarity(fpA, fpB);
wasm.validateSelector(selectorStr);

// 流程引擎
wasm.validateFlowVariables(flowJson, variablesJson);
wasm.flowToToolDefinition(flowJson);
wasm.getFlowStatus(flowJson, variablesJson);

// MCP 协议
wasm.createMcpToolCall(name, argsJson);
wasm.createMcpListTools();
wasm.createMcpSuccess(resultJson);
wasm.createMcpError(code, message);
new wasm.ToolListCache();
new wasm.FlowIdCache();
```

### 4.x.4 构建流水线

```
pnpm run build:native-wasm
  │
  ├─ [1/3] cargo test          # 运行 27 个单元测试
  ├─ [2/3] wasm-pack build     # 编译 release 模式 WASM
  └─ [3/3] 复制到消费方
       ├─ app/chrome-extension/native-wasm/
       └─ app/native-server/native-wasm/
```

产物：`native_wasm_bg.wasm`（~460KB）、`native_wasm.js`（ES 模块绑定）、`native_wasm.d.ts`（类型声明）

---

## 5. Record-Replay V3 录制回放引擎

### 5.1 架构设计

**分层架构**：

```
Domain 层（纯类型定义）
    ↓
Engine 层（业务逻辑）
    ↓
Storage 层（IndexedDB 持久化）
```

**目录结构**：

```
record-replay-v3/
├── domain/               # 领域模型（FlowV3, NodeV3, RunRecordV3 等）
├── engine/               # 引擎层
│   ├── kernel/           # 执行内核（runner, recovery, traversal）
│   ├── plugins/          # 插件系统
│   ├── queue/            # 队列调度
│   ├── recovery/         # 崩溃恢复
│   └── transport/        # 事件总线 + RPC
└── storage/              # 持久化层
    ├── db.ts             # IndexedDB 定义
    ├── events.ts         # 事件存储
    ├── flows.ts          # Flow 存储
    ├── queue.ts          # 队列持久化
    └── import/           # V2 数据导入
```

### 5.2 核心执行模型

**Flow DAG 模型**：

- Flow 是有向无环图（DAG）
- 由 NodeV3（节点）和 EdgeV3（边）组成
- 每个节点有 `kind`（类型），通过插件系统注册执行器

**执行流程**：

```
start() → run() → 循环执行节点:
  1. 校验 DAG 结构
  2. 创建 RunRecordV3 记录
  3. 发射 run.started 事件
  4. 主循环:
     a. 检查断点/暂停
     b. 发射 node.queued/node.started
     c. 通过 PluginRegistry 查找节点执行器
     d. 执行节点 execute(ctx, node)
     e. 处理结果: 成功→找下一节点; 失败→按策略重试/跳转/停止
     f. 应用变量补丁
  5. 发射 run.succeeded/run.failed
```

### 5.3 插件系统

**注册表模式**：

- `PluginRegistry`：全局单例，管理 NodeDefinition 和 TriggerDefinition
- `NodeDefinition`：包含 `kind`、`schema`（Zod 校验）、`execute` 方法
- `NodeExecutionContext`：提供 `runId`、`flow`、`tabId`、`vars`、`log`、`chooseNext` 等上下文

**V2 兼容层**：

- 通过 `register-v2-replay-nodes.ts` 将 V2 的 action handler 注册为 V3 节点

### 5.4 队列调度

**RunQueue**：

- `enqueue()`：入队
- `claimNext()`：原子领取（基于 IndexedDB 复合索引 `status_priority_createdAt`）
- `heartbeat()`：续约心跳
- `reclaimExpiredLeases()`：回收过期租约

**LeaseManager**：

- 定时心跳续约（默认 5 秒）
- 租约 TTL 默认 15 秒

**RunScheduler**：

- 控制最大并行 Run 数（默认 3）
- 集成 Keepalive 防止 MV3 SW 被挂起

### 5.5 崩溃恢复

**recoverFromCrash()** 流程：

```
Step 1: 预清理
  - 清理无 RunRecord 的队列项
  - 清理已终态（succeeded/failed/canceled）的队列项

Step 2: 恢复孤儿租约
  - running 孤儿 -> 回收为 queued（从头重跑）
  - paused 孤儿 -> 接管 lease（保持暂停）

Step 3: 同步 requeued running 的 RunRecord
  - 更新状态为 queued
  - 发射 run.recovered 事件

Step 4: 同步 adopted paused 的 RunRecord
  - 确保状态为 paused
```

### 5.6 存储系统

**IndexedDB 数据库**（`rr_v3`，版本 2）：

| Store             | KeyPath        | 主要索引                                    |
| ----------------- | -------------- | ------------------------------------------- |
| `flows`           | `id`           | `name`, `updatedAt`                         |
| `runs`            | `id`           | `status`, `flowId`, `flowId_status`（复合） |
| `events`          | `[runId, seq]` | `runId`, `type`, `runId_type`（复合）       |
| `queue`           | `id`           | `status_priority_createdAt`（复合）         |
| `persistent_vars` | `key`          | `updatedAt`                                 |
| `triggers`        | `id`           | `kind_enabled`（复合）                      |
| `artifacts`       | `id`           | `runId`, `nodeId`, `createdAt`              |

**事件原子性**：

- `EventsStore.append()` 在单个事务中完成：读取 nextSeq → 写入事件 → 递增 nextSeq

**队列原子 Claim**：

- 使用两步游标策略在 readwrite 事务中原子更新状态

### 5.7 V2 数据导入

**Flow 转换**：

1. 验证必填字段
2. 检查不支持的特性（subflows, foreach/while）
3. 转换节点（V2 `type` -> V3 `kind`）
4. 计算 entryNodeId（排除 trigger 节点，找入度为 0 的可执行节点）
5. 转换变量定义和元数据

**Trigger 转换**：

- `manual` -> `manual`
- `command` -> `command`
- `url` -> `url`（match 数组 -> patterns）
- `schedule` -> `cron`（转换为 cron 表达式）
- `element` -> `manual`（降级处理）

---

## 6. Tools 浏览器工具系统

### 6.1 架构设计

**三层架构**：

```
调用入口 (tools/index.ts)
    ↓
工具注册中心 (toolsMap: Map)
    ↓
抽象基类 (BaseBrowserToolExecutor)
    ↓
具体工具实现 (browser/*.ts)
    ↓
Chrome API / CDP
```

### 6.2 工具注册机制

```typescript
const toolsMap = new Map(Object.values(tools).map((tool) => [tool.name, tool]));
```

**调用流程**：

```
handleCallTool({ name: "browser_navigate", args: {...} })
    ↓
toolsMap.get("browser_navigate")  →  获取工具实例
    ↓
tool.execute(args)  →  执行工具逻辑
    ↓
返回 ToolResult 或 createErrorResponse()
```

### 6.3 BaseBrowserToolExecutor 抽象类

**设计模式**：模板方法模式 + 策略模式

**关键辅助方法**：

| 方法                    | 功能                         |
| ----------------------- | ---------------------------- |
| `getVisibleWindowId()`  | 获取用户当前可见窗口 ID      |
| `getActiveTabOrThrow()` | 获取活动标签页               |
| `injectContentScript()` | 注入内容脚本（带 ping 检测） |
| `sendMessageToTab()`    | 向标签页发送消息             |
| `ensureFocus()`         | 控制窗口/标签页焦点          |

**Ping 检测机制**：

```typescript
// 注入前先 ping 检查脚本是否已存在（300ms 超时）
const response = await Promise.race([
  chrome.tabs.sendMessage(tabId, { action: `${this.name}_ping` }),
  new Promise((_, reject) => setTimeout(() => reject(...), PING_TIMEOUT_MS))
]);
if (response && response.status === 'pong') return;  // 脚本已存在
```

### 6.4 核心工具实现

#### 6.4.1 Common - 通用浏览器操作

**NavigateTool**：

- 支持指定标签页、新标签页、新窗口导航
- 支持 `url="back"`/`"forward"` 历史导航
- 支持 `refresh: true` 刷新
- 支持 `background: true` 不抢夺焦点
- 集成 GIF 自动捕获

**CloseTabsTool**：

- 按 `tabIds` 数组关闭
- 按 `url` 模式匹配关闭
- 无参数时关闭当前活动标签页

**SwitchTabTool**：

- 简单直接的标签页切换

#### 6.4.2 Console - 控制台操作

**双模式设计**：

| 模式       | 说明         | 适用场景             |
| ---------- | ------------ | -------------------- |
| `snapshot` | 一次性捕获   | 即时查看当前状态     |
| `buffer`   | 持续缓冲捕获 | 长时间监控，多次读取 |

**Snapshot 模式流程**：

1. 通过 CDP Session Manager 附加调试器
2. 启用 Runtime 和 Log 域
3. 监听 `Log.entryAdded`, `Runtime.consoleAPICalled`, `Runtime.exceptionThrown`
4. 等待 2 秒消息刷新
5. 深度序列化参数（支持对象、Map、Set 等）
6. 清理调试器

**Buffer 模式特性**：

- 支持 `clear` 和 `clearAfterRead`
- 支持正则表达式过滤
- 支持仅错误过滤
- 支持消息数量限制

#### 6.4.3 Dialog - 对话框处理

- 使用 `withSession` 自动管理 CDP 会话
- 支持 `accept`/`dismiss` 两种操作
- 支持 `promptText` 处理 prompt 对话框

#### 6.4.4 Inject-Script - 脚本注入

**两个工具类**：

| 工具                            | 功能                   |
| ------------------------------- | ---------------------- |
| `InjectScriptTool`              | 注入脚本到页面         |
| `SendCommandToInjectScriptTool` | 向已注入的脚本发送命令 |

**执行世界处理**：

- MAIN 世界：先注入桥接脚本（ISOLATED），再注入用户脚本（MAIN）
- ISOLATED 世界：直接注入
- 状态管理：`injectedTabs` Map 记录已注入标签页

#### 6.4.5 Network-Request - 网络请求

- 利用内容脚本在页面上下文中发送请求，**绕过 CORS**
- 支持 `formData` 参数构建 multipart/form-data 请求
- 默认超时 30 秒

#### 6.4.6 Performance - 性能监控

**三个工具类**：

| 工具                            | 功能           |
| ------------------------------- | -------------- |
| `PerformanceStartTraceTool`     | 开始性能追踪   |
| `PerformanceStopTraceTool`      | 停止追踪并保存 |
| `PerformanceAnalyzeInsightTool` | 分析追踪结果   |

**双层分析策略**：

1. 优先：原生深度分析（如果有保存的文件路径）
2. 降级：轻量级本地分析（事件直方图 + 指标）

**保存策略**：

- `saveToDownloads: true`：保存到浏览器下载（默认）
- `saveToDownloads: false`：保存到原生临时目录

#### 6.4.7 Userscript - 用户脚本管理

**支持的操作**：`create`, `list`, `get`, `enable`, `disable`, `update`, `remove`, `send_command`, `export`

**CSP 检测与降级**：

- 检测页面 CSP 是否允许 `unsafe-eval`
- 如果 MAIN 世界被 CSP 阻止，自动降级到 ISOLATED

**持久化与自动重注入**：

- 标签页更新时自动重新注入持久化脚本
- 基于 `webNavigation` 的 `runAt` 映射

#### 6.4.8 Web-Fetcher - 网页抓取

**两个工具类**：

| 工具                         | 功能                   |
| ---------------------------- | ---------------------- |
| `WebFetcherTool`             | 获取页面 HTML/文本内容 |
| `GetInteractiveElementsTool` | 获取页面可交互元素     |

**内容获取策略**：

1. 注入辅助脚本
2. 获取 HTML 内容
3. 获取文本内容（带 Readability 文章提取）

### 6.5 错误处理机制

**统一错误响应格式**：

```typescript
{
  content: [{ type: 'text', text: message }],
  isError: true,
}
```

**超时机制**：

| 场景      | 超时时间    |
| --------- | ----------- |
| Ping 检测 | 300ms       |
| 网络请求  | 30s（默认） |
| 原生通信  | 30s         |
| 工具执行  | 可配置      |

---

## 7. 通信协议与数据流

### 7.1 Native Messaging Protocol

**消息格式**：

```
[4 bytes: uint32 LE 长度][N bytes: JSON 字符串]
```

**消息处理流程**：

1. `stdin.on('readable')` 读取数据块
2. 先读 4 字节获取消息长度（验证 >0 且 <16MB）
3. 读取指定长度的 JSON 数据并解析
4. 每 tick 最多处理 100 条消息（防止阻塞）

### 7.2 MCP 协议数据流

```
AI 客户端
    ↓ ↑ (HTTP/SSE 或 STDIO)
Native Server (Fastify + MCP SDK)
    ↓ ↑ (Native Messaging Protocol)
Chrome 扩展 (Background Script)
    ↓ ↑ (Chrome APIs)
浏览器功能 (标签页、网络、书签等)
```

### 7.3 Agent 事件流

```
Agent 引擎执行
    ↓
AgentStreamManager.publish()
    ↓
┌─────────────────────────────────────┐
│ SSE 连接（/agent/stream/:sessionId） │
│ WebSocket 连接                       │
└─────────────────────────────────────┘
    ↓
Sidepanel UI 实时更新
```

**事件类型**：

- `content_block_delta`：文本增量
- `tool_use`：工具调用
- `tool_result`：工具结果
- `heartbeat`：心跳保活

---

## 8. 开发指南

### 8.1 开发环境设置

完整构建与发布流程请参考：[BUILD_RELEASE.md](BUILD_RELEASE.md)

```bash
# 安装依赖
pnpm install

# 开发模式（并行启动所有包）
pnpm dev

# 单独启动组件
pnpm dev:shared    # 共享包
pnpm dev:native    # Native Server
pnpm dev:extension # Chrome 扩展

# 构建所有包（含 native-wasm）
pnpm build

# 仅构建 native-wasm（Rust → WASM → 复制到消费方）
pnpm run build:native-wasm

# 构建 WASM SIMD 模块
pnpm build:wasm
```

### 8.1.1 native-wasm 专用命令

在 `packages/native-wasm` 目录下：

```bash
# 完整流水线：cargo test → wasm-pack build → 复制到消费方
pnpm run build

# 仅 WASM 编译（release 模式）
pnpm run build:wasm

# 仅 WASM 编译（debug 模式，带符号）
pnpm run build:wasm:dev

# 运行 27 个 Rust 单元测试
pnpm run test

# 清理产物
pnpm run clean
```

### 8.2 代码规范

- **TypeScript**：严格模式
- **代码风格**：ESLint + Prettier
- **提交规范**：Commitlint + Husky
- **包管理**：pnpm workspace

### 8.3 关键文件路径

| 组件             | 入口文件                                                                    |
| ---------------- | --------------------------------------------------------------------------- |
| Chrome 扩展      | `app/chrome-extension/entrypoints/background/index.ts`                      |
| Native Server    | `app/native-server/src/index.ts`                                            |
| CLI 工具         | `app/native-server/src/cli.ts`                                              |
| MCP STDIO Server | `app/native-server/src/mcp/mcp-server-stdio.ts`                             |
| Record-Replay V3 | `app/chrome-extension/entrypoints/background/record-replay-v3/bootstrap.ts` |
| Tools 系统       | `app/chrome-extension/entrypoints/background/tools/index.ts`                |
| native-wasm      | `packages/native-wasm/src/lib.rs`（WASM 绑定）                              |
| - protocol       | `packages/native-wasm/src/protocol.rs`（消息协议）                          |
| - selector       | `packages/native-wasm/src/selector.rs`（选择器引擎）                        |
| - reconnect      | `packages/native-wasm/src/reconnect.rs`（重连管理）                         |
| - flow_engine    | `packages/native-wasm/src/flow_engine.rs`（流程引擎）                       |
| - mcp            | `packages/native-wasm/src/mcp.rs`（MCP 协议）                               |

### 8.4 调试技巧

1. **扩展调试**：Chrome 扩展管理页面 → 检查视图 → 后台页面
2. **Native Server 调试**：查看终端输出（日志使用 `console.error`）
3. **MCP 协议调试**：使用 `doctor` 命令诊断连接问题
4. **Record-Replay 调试**：查看 IndexedDB `rr_v3` 数据库

---

## 附录

### A. 工具列表概览

| 类别       | 工具数量 | 示例                                                           |
| ---------- | -------- | -------------------------------------------------------------- |
| 浏览器管理 | 6        | `get_windows_and_tabs`, `chrome_navigate`                      |
| 截图       | 1        | `chrome_screenshot`                                            |
| 网络监控   | 4        | `chrome_network_capture_start/stop`                            |
| 内容分析   | 4        | `search_tabs_content`, `chrome_get_web_content`                |
| 交互操作   | 3        | `chrome_click_element`, `chrome_fill_or_select`                |
| 数据管理   | 5        | `chrome_history`, `chrome_bookmark_search`                     |
| 脚本注入   | 2        | `chrome_inject_script`, `chrome_send_command_to_inject_script` |
| 性能监控   | 3        | `performance_start_trace`, `performance_analyze_insight`       |
| 用户脚本   | 1        | `chrome_userscript`                                            |
| 录制回放   | 2+       | `flow_run`, `list_published_flows`                             |

### B. 数据库表结构

**projects 表**：

```sql
CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  rootPath TEXT,
  preferredCli TEXT,
  selectedModel TEXT,
  activeClaudeSessionId TEXT,
  useCcr INTEGER DEFAULT 0,
  enableChromeMcp INTEGER DEFAULT 0,
  createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
  updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
);
```

**sessions 表**：

```sql
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  projectId TEXT REFERENCES projects(id),
  engineName TEXT NOT NULL,
  engineSessionId TEXT,
  permissionMode TEXT DEFAULT 'bypassPermissions',
  systemPromptConfig TEXT,
  optionsConfig TEXT,
  managementInfo TEXT,
  createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
  updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
);
```

### C. 环境变量

| 变量                      | 说明           | 默认值           |
| ------------------------- | -------------- | ---------------- |
| `CODEX_ENGINE_TIMEOUT_MS` | Codex 引擎超时 | 900000 (15 分钟) |
| `NODE_ENV`                | 运行环境       | `production`     |

---

> **文档版本**: 1.0.0  
> **最后更新**: 2026-04-15  
> **维护者**: MCP-Chrome 开发团队
