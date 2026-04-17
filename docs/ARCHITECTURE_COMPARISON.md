# 架构对比分析

---

## 1. 演进历程

### Phase 1: 原始架构（纯 TypeScript 双端）

```
┌──────────────────────────────────────────────────────┐
│                Chrome Extension (TS/JS)               │
│  ┌────────────┐  ┌────────────┐  ┌────────────────┐  │
│  │ Background │  │ Sidepanel  │  │ Native Msg     │  │
│  │ Script     │  │ (Vue UI)   │  │ Protocol (TS)  │  │
│  │            │  │            │  │ Selector (TS)  │  │
│  │            │  │            │  │ Flow Engine(TS)│  │
│  │            │  │            │  │ MCP Utils (TS) │  │
│  └────────────┘  └────────────┘  └────────────────┘  │
└──────────────────────┬───────────────────────────────┘
                       │ Native Messaging (STDIO)
┌──────────────────────▼───────────────────────────────┐
│                Native Server (Node.js)                │
│  ┌────────────┐  ┌────────────┐  ┌────────────────┐  │
│  │ Fastify    │  │ MCP Server │  │ Native Msg     │  │
│  │ HTTP       │  │            │  │ Protocol (TS)  │  │
│  │            │  │ Agent      │  │ Selector (TS)  │  │
│  │            │  │            │  │ Flow Engine(TS)│  │
│  │            │  │            │  │ MCP Utils (TS) │  │
│  └────────────┘  └────────────┘  └────────────────┘  │
└──────────────────────────────────────────────────────┘
```

**核心问题**：相同逻辑（协议帧解析、选择器生成、流程引擎、MCP 缓存）在两端各维护一份 TypeScript 实现。

### Phase 2: WASM 共享核心架构

```
┌──────────────────────────────────────────────────────┐
│                Chrome Extension (TS/JS)               │
│  ┌────────────┐  ┌────────────┐  ┌────────────────┐  │
│  │ Background │  │ Sidepanel  │  │ native-wasm    │  │
│  │ Script     │  │ (Vue UI)   │  │ (WASM ~460KB)  │  │
│  │            │  │            │  │ - Protocol     │  │
│  │            │  │            │  │ - Selector     │  │
│  │            │  │            │  │ - Flow Engine  │  │
│  │            │  │            │  │ - MCP Utils    │  │
│  └────────────┘  └────────────┘  └────────────────┘  │
└──────────────────────┬───────────────────────────────┘
                       │ Native Messaging (STDIO)
┌──────────────────────▼───────────────────────────────┐
│                Native Server (Node.js)                │
│  ┌────────────┐  ┌────────────┐  ┌────────────────┐  │
│  │ Fastify    │  │ MCP Server │  │ native-wasm    │  │
│  │ HTTP       │  │            │  │ (WASM ~460KB)  │  │
│  │            │  │ Agent      │  │ - Protocol     │  │
│  │            │  │            │  │ - Selector     │  │
│  │            │  │            │  │ - Flow Engine  │  │
│  │            │  │            │  │ - MCP Utils    │  │
│  └────────────┘  └────────────┘  └────────────────┘  │
└──────────────────────────────────────────────────────┘
```

**优势**：单一真实源，修一处全生效。

### Phase 3: OpenAI 直连模式（当前最新）

```
┌─────────────────────────────────────────────────────────┐
│                Chrome Extension (TS/JS)                  │
│  ┌────────────┐  ┌────────────┐  ┌───────────────────┐  │
│  │ Background │  │ Sidepanel  │  │ openai-tools-     │  │
│  │ Script     │  │ (Vue UI)   │  │ adapter.ts        │  │
│  │            │  │            │  │                   │  │
│  │ native-    │  │ useOpenAI  │  │ native-wasm       │  │
│  │ host.ts ◄──┼──│ Chat.ts   │  │ (WASM)            │  │
│  │ (消息桥接) │  │            │  │ - Protocol        │  │
│  │            │  │ execute-   │  │ - Selector        │  │
│  │ tools/     │  │ WithTool   │  │ - Flow Engine     │  │
│  │ browser/*  │  │ Loop()     │  │ - MCP Utils       │  │
│  │            │  │            │  │                   │  │
│  │ toolsMap   │  │ ┌───────┐  │  │                   │  │
│  │ handleCall │  │ 30s   │  │  │                   │  │
│  │ Tool()     │  │ timeout │  │  │                   │  │
│  │            │  │ loop    │  │  │                   │  │
│  │            │  │ detect  │  │  │                   │  │
│  └────────────┘  └───────┴──┘  └───────────────────┘  │
└─────────────────────┬──────────────────────────────────┘
                      │ (不再需要 Native Messaging)
┌─────────────────────▼──────────────────────────────────┐
│            OpenAI / DashScope / Qwen API                │
│  Function Calling ── 27 个浏览器工具                    │
│  JSON Schema ── sanitizeSchema(oneOf/anyOf 清理)        │
└────────────────────────────────────────────────────────┘
```

**核心创新**：绕过 Native Server，扩展直接与 OpenAI 兼容 API 通信，通过 Function Calling 调用浏览器工具。

---

## 2. 三种架构对比

### 2.1 原始架构（Phase 1）

| 维度           | 优点                            | 缺点                           |
| -------------- | ------------------------------- | ------------------------------ |
| **开发体验**   | 纯 TypeScript，无需 Rust 工具链 | 两端重复代码，bug 修复需改两处 |
| **构建依赖**   | 仅 Node.js + npm                | 无跨语言类型检查               |
| **运行时性能** | JS 引擎原生执行，无跨语言边界   | GC 开销大，大对象处理慢        |
| **一致性**     | —                               | 两端逻辑易产生分歧             |
| **部署**       | 无额外二进制                    | 依赖 Node.js 环境              |

### 2.2 WASM 共享架构（Phase 2）

| 维度           | 优点                             | 缺点                         |
| -------------- | -------------------------------- | ---------------------------- |
| **开发体验**   | 单一真实源，修一处全生效         | 需要 Rust + wasm-pack 工具链 |
| **运行时性能** | WASM 接近原生速度，无 JS GC 压力 | 跨 JS 边界有序列化开销       |
| **类型安全**   | serde 强类型序列化               | WASM 导出类型需手动映射到 TS |
| **一致性**     | 两端加载同一份二进制，100% 一致  | 版本对齐需要构建脚本保证     |
| **部署**       | 一份 WASM 产物全平台运行         | 增加 ~460KB 二进制文件       |

### 2.3 OpenAI 直连模式（Phase 3）

| 维度            | 优点                                      | 缺点                           |
| --------------- | ----------------------------------------- | ------------------------------ |
| **部署复杂度**  | **零依赖** — 无需启动 Native Server       | 需要配置 OpenAI API Key        |
| **延迟**        | 直连 API，少一次本地中转                  | 依赖网络质量                   |
| **工具支持**    | **27 个浏览器工具**全量可用               | 仅支持 OpenAI 兼容模型         |
| **Schema 兼容** | 自动清理 oneOf/anyOf，适配 DashScope/Qwen | 复杂 JSON Schema 需降级处理    |
| **稳定性**      | 30s 超时 + 循环检测 + 连续错误保护        | 需要 API 支持 Function Calling |
| **成本**        | 按 API 调用量计费                         | 多轮工具调用增加 token 消耗    |

---

## 3. 关键对比项

| 对比项            | Phase 1 (原始)            | Phase 2 (WASM)        | Phase 3 (OpenAI 直连)           |
| ----------------- | ------------------------- | --------------------- | ------------------------------- |
| **协议帧解析**    | 两端各一份 TS，易分歧     | 同一 WASM 二进制      | 不再需要协议帧解析              |
| **选择器生成**    | 仅扩展端有 TS 实现        | 双端共享 WASM         | 由 WASM 提供（直连模式可选）    |
| **流程引擎**      | 两端维护两份              | 单一 WASM 状态机      | 由 OpenAI Function Calling 驱动 |
| **工具调用链路**  | Native Msg → MCP Protocol | WASM Protocol → MCP   | chrome.runtime → toolsMap       |
| **Bug 修复成本**  | ×2（两端各改）            | ×1（改 Rust 一处）    | ×1（改 TS 一处）                |
| **Native Server** | 必需                      | 必需                  | **不需要**                      |
| **依赖环境**      | Node.js                   | Node.js + WASM 运行时 | 仅需浏览器 + OpenAI API         |

---

## 4. 工具调用链路对比

### 4.1 Native Server 模式

```
用户输入 → Sidepanel → Native Messaging → Native Server
  → MCP Client → Tool Request → Native Msg → Extension Background
  → handleCallTool → toolsMap → tool.execute()
  → 结果 → Native Server → MCP Client → Native Msg → Extension
  → Sidepanel UI
```

**延迟路径**：5 次跨进程通信（Extension ↔ Native Server ↔ MCP Client ↔ Extension）

### 4.2 OpenAI 直连模式

```
用户输入 → Sidepanel → OpenAI API (Function Calling)
  → tool_calls → chrome.runtime.sendMessage
  → native-host.ts (EXECUTE_TOOL_CALL)
  → handleCallTool → toolsMap → tool.execute()
  → 结果 → OpenAI API (tool result)
  → AI 生成回复 → Sidepanel UI
```

**延迟路径**：2 次跨进程通信（Extension ↔ OpenAI API via fetch）

### 4.3 链路对比

| 指标           | Native Server 模式           | OpenAI 直连模式         |
| -------------- | ---------------------------- | ----------------------- |
| **跨进程通信** | 5 次                         | 2 次                    |
| **网络请求**   | 0 次（纯本地）               | 2-10 次（API 调用）     |
| **总延迟**     | ~50-200ms（本地）            | ~500-3000ms（网络依赖） |
| **可靠性**     | 依赖本地服务稳定性           | 依赖网络和 API 稳定性   |
| **部署复杂度** | 需要启动和管理 Native Server | 仅需 API Key            |

---

## 5. 全平台运行分析

### 5.1 WASM 跨平台性

WASM 本身是**平台无关**的字节码格式。只要目标环境有 WASM 运行时，就可以执行。

| 平台                      | Chrome Extension | Native Server (Node.js) | 说明                    |
| ------------------------- | ---------------- | ----------------------- | ----------------------- |
| **macOS (x64)**           | ✅               | ✅                      | 已验证通过              |
| **macOS (Apple Silicon)** | ✅               | ✅                      | WASM 与 CPU 无关        |
| **Windows (x64)**         | ✅               | ✅                      | Node.js 内置 WASM 支持  |
| **Linux (x64)**           | ✅               | ✅                      | Chrome + Node.js 均支持 |
| **Linux (ARM64)**         | ✅               | ✅                      | WASM 不依赖 CPU 架构    |

### 5.2 OpenAI 直连模式平台支持

| 平台    | Chrome Extension | OpenAI API 可用性 | 说明                     |
| ------- | ---------------- | ----------------- | ------------------------ |
| Windows | ✅               | ✅                | 无需本地服务，仅需浏览器 |
| macOS   | ✅               | ✅                | 已验证                   |
| Linux   | ✅               | ✅                | 同上                     |

**关键区别**：OpenAI 直连模式不依赖本地服务，因此不受 Node.js 版本限制，**任何支持 Manifest V3 的浏览器均可运行**。

---

## 6. OpenAI 直连模式稳定性保障

### 6.1 问题与修复

| 问题                     | 根因                       | 修复方案                                    |
| ------------------------ | -------------------------- | ------------------------------------------- |
| Max tool call turns (10) | AI 循环调用工具无退出机制  | 30s 超时 + 重复调用检测 + 连续错误 3 次中断 |
| AI 回复英文              | systemNote 仅首轮发送      | **每轮都前置 system message**               |
| DashScope 400 错误       | JSON Schema 含 oneOf/anyOf | sanitizeSchema 自动清理                     |
| 点击成功无回复           | AI 返回空 content          | content undefined 策略 + 兜底回复           |
| 工具去重漏报             | JSON key 顺序不一致        | 规范化 key 排序后比较                       |
| read_page 稀疏回退失败   | sendMessage 包装器 throw   | 改用 chrome.tabs.sendMessage 原生调用       |

### 6.2 保护机制

| 机制         | 阈值               | 效果                   |
| ------------ | ------------------ | ---------------------- |
| 单次工具超时 | 30s                | 防止卡死               |
| 最大轮数     | 10 轮              | 防止无限循环           |
| 重复调用检测 | 相同工具+参数 3 次 | 中断循环并告知用户     |
| 连续错误中断 | 3 次连续失败       | 提前终止并返回错误摘要 |
| 系统指令     | 每轮携带           | 保证中文回复、工具总结 |

---

## 7. 总结

### 架构演进核心驱动力

1. **Phase 1 → Phase 2**：解决"两端代码不一致"问题，用 WASM 实现单一真实源
2. **Phase 2 → Phase 3**：解决"部署复杂度高"问题，用 OpenAI Function Calling 绕过 Native Server

### 当前三种模式并存

| 模式                     | 适用场景                             | 推荐用户           |
| ------------------------ | ------------------------------------ | ------------------ |
| **Native Server (WASM)** | 需要完整功能、离线可用、自定义 Agent | 高级用户、开发者   |
| **OpenAI 直连**          | 轻量使用、快速测试、无需本地服务     | 普通用户、快速验证 |
| **混合模式**             | 直连 + WASM 工具                     | 按需切换           |

### 选择建议

- **仅需浏览器自动化** → OpenAI 直连模式（零部署）
- **需要 Claude 模型 / 自定义 Agent** → Native Server 模式
- **生产环境部署** → 两者并存，按需切换
