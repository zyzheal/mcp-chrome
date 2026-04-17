# Native WASM 核心文档

> Rust 编写的 WebAssembly 模块，为 Chrome 扩展和 Native Server 提供共享的可移植核心逻辑。

---

## 1. 概述

### 1.1 设计目标

将 Chrome 扩展（浏览器端 JS）和 Native Server（Node.js）中**不依赖平台特定 API** 的逻辑提取为 Rust 实现，编译为单文件 WASM，在两端共享：

| 提取逻辑                | 旧方案             | 新方案         |
| ----------------------- | ------------------ | -------------- |
| Native Messaging 协议帧 | 两端各一份 TS 实现 | 单一 WASM 模块 |
| CSS 选择器生成          | 扩展端独立实现     | WASM 统一      |
| 录制回放流程引擎        | 两端维护两份逻辑   | WASM 状态机    |
| MCP 协议工具与缓存      | 重复实现           | WASM 统一      |

### 1.2 什么在 WASM 中，什么不在

**在 WASM 中（可移植逻辑）**：

- 协议帧序列化/反序列化
- CSS 选择器生成策略
- 元素指纹与稳定性计算
- 指数退避重连管理
- Flow 流程引擎（状态机、变量插值、条件执行）
- MCP 协议工具定义、缓存、请求/响应

**留在 JS/TS 中（平台绑定）**：

- Chrome 扩展 API（tabs, storage, content scripts）
- Node.js API（fs, child_process, net）
- DOM API（querySelector, 截图, 脚本注入）
- SDK 集成（Claude Agent SDK, CDP）

---

## 2. 项目结构

```
packages/native-wasm/
├── Cargo.toml              # Rust 包配置
├── package.json            # npm 脚本入口
└── src/
    ├── lib.rs              # WASM 绑定入口（wasm_bindgen）
    ├── protocol.rs         # Native Messaging 协议
    ├── selector.rs         # CSS 选择器引擎
    ├── reconnect.rs        # 重连管理器
    ├── flow_engine.rs      # 录制回放流程引擎
    └── mcp.rs              # MCP 协议工具
```

### 2.1 依赖

| 依赖                           | 用途                              |
| ------------------------------ | --------------------------------- |
| `wasm-bindgen 0.2`             | Rust ↔ JS 绑定                    |
| `serde 1.0 + derive`           | JSON 序列化/反序列化              |
| `serde_json 1.0`               | JSON 处理                         |
| `getrandom 0.2 (js)`           | WASM 中的随机数（用于 UUID 生成） |
| `console_error_panic_hook 0.1` | panic 时输出可读错误              |

---

## 3. 模块详解

### 3.1 protocol — Native Messaging 协议

**文件**: `src/protocol.rs`

#### 3.1.1 帧格式

```
[4 bytes: uint32 little-endian 长度][N bytes: JSON 字符串]
```

最大消息大小: 16MB

#### 3.1.2 核心类型

| 类型                  | 说明                                                  |
| --------------------- | ----------------------------------------------------- |
| `NativeMessageType`   | 消息类型枚举（start, stop, ping, pong, call_tool 等） |
| `NativeMessage<P, E>` | 泛型消息结构，支持载荷和错误                          |
| `FramedMessage`       | 4 字节长度前缀 + JSON 载荷的帧封装                    |
| `MessageParser`       | 增量解析器状态机，支持分块数据流                      |
| `HeartbeatState`      | 心跳状态机（ping/pong 追踪、超时检测）                |
| `RequestTracker`      | 待处理请求追踪（超时检测）                            |

#### 3.1.3 WASM API

```javascript
// 帧封装
wasm.frameMessage(jsonStr); // JSON → base64(帧)
wasm.parseMessage(base64Data); // base64 → JSON

// 消息构造
wasm.createStartMessage(port); // 启动消息
wasm.createServerStartedResponse(port); // 启动响应
wasm.createErrorResponse(msg, code); // 错误响应
wasm.createHeartbeatPing(); // 心跳

// 增量解析器
const parser = new wasm.MessageParser();
parser.feed(chunkBytes); // 返回 JSON 数组的完整消息
parser.reset();

// 心跳状态机
const hb = new wasm.HeartbeatState(30000, 10000);
hb.shouldSendPing(); // 是否需要发送 ping
hb.markSentPing(); // 标记已发送
hb.recordReceived(); // 记录收到 pong
hb.isDead(); // 连接是否已死
```

---

### 3.2 selector — CSS 选择器引擎

**文件**: `src/selector.rs`

#### 3.2.1 选择器生成策略（按稳定性排序）

| 优先级 | 策略                | 示例                        | 稳定性分 |
| ------ | ------------------- | --------------------------- | -------- |
| 1      | `#id`               | `#submit-btn`               | 1.0      |
| 2      | `[data-testid=...]` | `[data-testid="login-btn"]` | 0.9      |
| 3      | `[name=...]`        | `[name="username"]`         | 0.8      |
| 4      | `[aria-label=...]`  | `[aria-label="Close"]`      | 0.75     |
| 5      | `[role=...]`        | `[role="button"]`           | 0.7      |
| 6      | `.class1.class2`    | `.btn.btn-primary`          | 0.5      |
| 7      | `tag:nth-child(n)`  | `div:nth-child(3)`          | 0.4      |
| 8      | CSS 路径            | `html > body > div > span`  | 0.3      |
| 9      | 文本内容            | `:contains("Submit")`       | 0.2      |

#### 3.2.2 元素指纹

4 组件哈希：

- **标签签名**: tag + 属性键集合的 SHA-256 截断
- **属性哈希**: 属性键值对的哈希
- **结构哈希**: 父链 tag.class 序列的哈希
- **文本签名**: 前 100 字符文本的哈希

#### 3.2.3 WASM API

```javascript
// 选择器生成
wasm.generateSelectors(elementJson); // → JSON {best, all: [...]}
wasm.generateFingerprint(elementJson); // → JSON 指纹
wasm.fingerprintSimilarity(fpA, fpB); // → number [0, 1]
wasm.calculateStability(elementJson, sel); // → JSON 稳定性评分
wasm.validateSelector(selectorStr); // → JSON 校验结果
wasm.buildLocatorMap(elementJson); // → JSON 定位器映射
```

#### 3.2.4 输入格式

```json
{
  "tag": "button",
  "id": "submit-btn",
  "classes": ["btn", "btn-primary"],
  "attributes": { "data-testid": "submit", "type": "submit" },
  "parent_chain": [{ "tag": "form", "id": "login-form", "classes": [] }],
  "text_content": "Submit"
}
```

---

### 3.3 reconnect — 重连管理器

**文件**: `src/reconnect.rs`

#### 3.3.1 状态机

```
Initial → Connected → Disconnected → Waiting → Connecting
                              ↗        ↓
                              └── Cooldown (连续失败后)
```

#### 3.3.2 退避策略

| 参数     | 值        |
| -------- | --------- |
| 基础延迟 | 500ms     |
| 最大延迟 | 60s       |
| 冷却阈值 | 8 次失败  |
| 冷却延迟 | 5min      |
| 抖动     | ±30% 随机 |

#### 3.3.3 WASM API

```javascript
const rc = new wasm.ReconnectState();
rc.shouldReconnect(); // 是否应重连
rc.nextDelayMs(); // 计算下次延迟（含退避+抖动）
rc.markConnected(); // 标记连接成功（重置计数器）
rc.markFailed(); // 标记连接失败（递增计数器）
rc.manualDisconnect(); // 手动断开（停止重连）
rc.enableAutoConnect(); // 启用自动重连
rc.disableAutoConnect(); // 禁用自动重连
rc.reset(); // 重置所有状态
rc.status(); // → JSON 状态
```

---

### 3.4 flow_engine — 录制回放流程引擎

**文件**: `src/flow_engine.rs`

#### 3.4.1 状态机

```
Idle → Running → Completed
            ↘ Failed
            ↘ Cancelled
            ↗ Paused (可恢复)
```

#### 3.4.2 支持的步骤类型（14 种）

`navigate`, `click`, `fill`, `select`, `check`, `hover`, `wait`, `screenshot`,
`evaluate`, `keypress`, `scroll`, `extract`, `drag`, `upload`

#### 3.4.3 变量插值

支持 `{{variable.key}}` 模式，在步骤的 `target.selector` 和 `value` 中自动替换。

#### 3.4.4 WASM API

```javascript
// 验证流程变量
wasm.validateFlowVariables(flowJson, variablesJson);
// → {"valid": true} 或 {"valid": false, "missing": ["username"]}

// 生成 MCP 工具定义
wasm.flowToToolDefinition(flowJson);
// → {"name": "flow.login", "description": "...", "input_schema": {...}}

// 获取流程状态
wasm.getFlowStatus(flowJson, variablesJson);
// → {"flow_id": "...", "state": "idle", "current_step_index": 0, ...}
```

---

### 3.5 mcp — MCP 协议工具

**文件**: `src/mcp.rs`

#### 3.5.1 缓存机制

| 缓存          | TTL    | 用途                |
| ------------- | ------ | ------------------- |
| ToolListCache | 5 分钟 | 工具列表缓存        |
| FlowIdCache   | 5 分钟 | Flow slug → ID 映射 |

#### 3.5.2 WASM API

```javascript
// MCP 请求构造
wasm.createMcpToolCall(name, argsJson); // tools/call 请求
wasm.createMcpListTools(); // tools/list 请求

// MCP 响应构造
wasm.createMcpSuccess(resultJson); // 成功响应
wasm.createMcpError(code, message); // 错误响应

// 工具缓存
const cache = new wasm.ToolListCache();
cache.isFresh(); // 缓存是否有效
cache.setTools(toolsJson, source); // 设置缓存
cache.getTools(); // 获取缓存工具
cache.invalidate(); // 清除缓存
cache.status(); // 缓存状态

// Flow ID 缓存
const flowCache = new wasm.FlowIdCache();
flowCache.getBySlug('login'); // 按 slug 查找
flowCache.populate(flowsJson); // 批量填充
flowCache.isFresh(); // 是否有效
flowCache.invalidate(); // 清除
```

---

## 4. 构建

### 4.1 完整流水线

```bash
# 在 monorepo 根目录
pnpm run build:native-wasm
```

流水线步骤：

1. `cargo test` — 运行 27 个单元测试
2. `wasm-pack build --release` — 编译优化 WASM
3. 复制产物到消费方：
   - `app/chrome-extension/native-wasm/`
   - `app/native-server/native-wasm/`

### 4.2 产物

| 文件                       | 大小   | 用途                |
| -------------------------- | ------ | ------------------- |
| `native_wasm_bg.wasm`      | ~460KB | WASM 二进制         |
| `native_wasm.js`           | ~34KB  | ES 模块绑定         |
| `native_wasm.d.ts`         | ~10KB  | TypeScript 类型声明 |
| `native_wasm_bg.wasm.d.ts` | ~4.7KB | WASM 内存类型       |

### 4.3 开发模式

```bash
# debug 模式（带调试符号，无 wasm-opt）
pnpm run build:native-wasm:dev

# 单独运行测试
cd packages/native-wasm && cargo test
```

### 4.4 Cargo.toml 配置

```toml
[package.metadata.wasm-pack.profile.release]
wasm-opt = false  # release 编译已优化，跳过额外优化

[package.metadata.wasm-pack.profile.dev]
wasm-opt = false
```

---

## 5. 集成指南

### 5.1 Chrome 扩展侧

```javascript
// 在 Background Script 或 Content Script 中
import init, * as wasm from '../native-wasm/native_wasm.js';

await init();

// 使用
const msg = wasm.createStartMessage(12306);
const selectors = wasm.generateSelectors(elementInfo);
```

### 5.2 Native Server 侧

```javascript
// 在 Node.js 中
import init, * as wasm from '../native-wasm/native_wasm.js';
import { readFileSync } from 'fs';

// 加载 WASM 字节
const wasmBytes = readFileSync('./native-wasm/native_wasm_bg.wasm');
await init(wasmBytes);

// 使用相同的 API
const rc = new wasm.ReconnectState();
```

---

## 6. 测试

```bash
cd packages/native-wasm
cargo test
```

当前覆盖: **27 个测试**，覆盖所有 5 个模块：

| 模块        | 测试数 | 覆盖                                          |
| ----------- | ------ | --------------------------------------------- |
| protocol    | 4      | 帧封装、增量解析、心跳、请求追踪              |
| selector    | 5      | CSS 转义、选择器生成、指纹、相似度、稳定性    |
| reconnect   | 5      | 初始状态、退避、连接标记、冷却、重启用        |
| flow_engine | 6      | 流程执行、变量验证、暂停/恢复、取消、工具定义 |
| mcp         | 6      | 缓存、Flow ID、MCP 请求、MCP 响应、会话过期   |

---

> **文档版本**: 1.0.0
> **最后更新**: 2026-04-15
> **维护者**: MCP-Chrome 开发团队
