# OpenAI 直连模式 - Function Calling 指南

**无需 Native Server** — 直接通过 OpenAI API 调用浏览器扩展工具

---

## 概述

OpenAI 直连模式允许扩展直接与 OpenAI 兼容的 API 通信，并通过 Function Calling 机制调用浏览器扩展工具（截图、点击、导航等），无需经过 Native Server。

## 架构

```
用户输入 "截图"
  ↓
useOpenAIChat.send()
  ↓
OpenAI API（携带 tools 参数，system note 每轮携带）
  ↓ 返回 tool_calls
executeWithToolLoop()
  ├── 30s 超时保护
  ├── 重复调用检测（相同工具+参数 3 次 → 中断）
  └── 连续错误保护（3 次失败 → 提前终止）
  ↓
executeToolCall()
  ↓ chrome.runtime.sendMessage
background/native-host.ts (EXECUTE_TOOL_CALL handler)
  ↓
handleCallTool() → toolsMap → tool.execute()
  ↓ 返回结果
OpenAI API（下一轮对话，system note 始终前置）
  ↓ AI 生成中文回复
Sidepanel UI 显示
```

## 关键文件

### 前端（Sidepanel）

| 文件               | 作用                                                                       |
| ------------------ | -------------------------------------------------------------------------- |
| `useOpenAIChat.ts` | 核心 composable，`executeWithToolLoop` + `executeToolCall`，含循环保护机制 |

### Background

| 文件              | 作用                                                    |
| ----------------- | ------------------------------------------------------- |
| `native-host.ts`  | `EXECUTE_TOOL_CALL` 消息处理器，桥接到 `handleCallTool` |
| `tools/index.ts`  | `handleCallTool` 实现，从 `toolsMap` 查找并执行工具     |
| `tools/browser/*` | 30+ 具体浏览器工具实现                                  |

### 公共

| 文件                           | 作用                                                                 |
| ------------------------------ | -------------------------------------------------------------------- |
| `openai-tools-adapter.ts`      | MCP Schema → OpenAI tools 转换，含 `sanitizeSchema` 清理 oneOf/anyOf |
| `message-types.ts`             | 定义 `BACKGROUND_MESSAGE_TYPES.EXECUTE_TOOL_CALL`                    |
| `packages/shared/src/tools.ts` | 所有工具的 MCP schema（TOOL_SCHEMAS）                                |

## 配置

### 1. 设置 OpenAI 配置

```typescript
{
  baseUrl: "https://api.openai.com",  // 或 DashScope/Qwen 等兼容 API
  apiKey: "sk-...",
  model: "gpt-4o",                    // 支持 Function Calling 的模型
  enabled: true,
  textOnlyMode: false,                // 必须 false 才能使用工具
  promptForNativeServer: false,       // false 跳过 Native Server 检查
}
```

### 2. 关键配置项

| 配置项                  | 说明                   | 推荐值  |
| ----------------------- | ---------------------- | ------- |
| `enabled`               | 启用 OpenAI 直连模式   | `true`  |
| `textOnlyMode`          | 禁用工具调用           | `false` |
| `promptForNativeServer` | 提示启动 Native Server | `false` |

### 3. 兼容的 API 提供商

| 提供商               | Base URL                         | 注意事项                         |
| -------------------- | -------------------------------- | -------------------------------- |
| OpenAI               | `https://api.openai.com`         | 原生支持                         |
| DashScope (通义千问) | `https://dashscope.aliyuncs.com` | 需清理 oneOf/anyOf（已自动处理） |
| 其他 OpenAI 兼容     | 任意                             | 需支持 Function Calling          |

## 工作原理

### 1. 工具 Schema 转换

`mcpSchemaToOpenAITools()` 将 MCP 工具 schema 转换为 OpenAI function calling 格式：

```typescript
// 输入 (MCP Schema)
{ name: "chrome_screenshot", description: "...", inputSchema: { ... } }

// sanitizeSchema 清理 oneOf/anyOf/allOf/not 等不兼容构造
// 输出 (OpenAI Tools)
{ type: "function", function: { name: "...", description: "...", parameters: { ... } } }
```

### 2. 多轮工具调用循环

`executeWithToolLoop()` 实现最多 10 轮的工具调用循环：

1. 发送请求（携带 `tools` 参数 + **system note 始终前置**）
2. 检查响应是否包含 `tool_calls`
3. 如果没有，break 循环，返回 AI 文本回复
4. 如果有，检测**重复调用**（相同工具+参数 3 次 → 中断）
5. 逐个执行工具调用（30s 超时）
6. 将工具结果附加到消息列表
7. 检查**连续错误**（3 次失败 → 提前终止）
8. 继续下一轮请求
9. 直到没有 `tool_calls` 或达到最大轮数

### 3. 消息路由

```
Sidepanel                          Background
   │                                  │
   ├── sendMessage ──────────────────►│
   │  {type: 'EXECUTE_TOOL_CALL',     │
   │   payload: {toolName, args}}     │
   │                                  ├──► handleCallTool()
   │                                  ├──► toolsMap.get(name).execute()
   │◄── sendResponse ◀───────────────┤
   │  {success: true, result: {...}}  │
   │                                  │
```

## 可用浏览器工具（27+）

| 工具名称                 | 功能                         |
| ------------------------ | ---------------------------- |
| `get_windows_and_tabs`   | 获取当前窗口和标签页         |
| `chrome_navigate`        | 导航到 URL / 刷新 / 前进后退 |
| `chrome_screenshot`      | 截图（元素/全页/base64/PNG） |
| `chrome_close_tabs`      | 关闭标签页                   |
| `chrome_switch_tab`      | 切换标签页                   |
| `chrome_get_web_content` | 获取页面 HTML/文本           |
| `chrome_click_element`   | 点击元素（CSS/XPath/ref）    |
| `chrome_fill_or_select`  | 填充表单字段                 |
| `chrome_read_page`       | 无障碍树（含稀疏页面回退）   |
| `chrome_computer`        | 鼠标/键盘综合操作            |
| `chrome_network_request` | 发送网络请求（带 Cookie）    |
| `chrome_network_capture` | 网络请求捕获                 |
| `chrome_keyboard`        | 模拟键盘输入                 |
| `chrome_console`         | 捕获控制台输出               |
| `chrome_history`         | 搜索浏览历史                 |
| `chrome_bookmark_search` | 搜索书签                     |
| `chrome_file_upload`     | 文件上传                     |
| `chrome_handle_dialog`   | 处理对话框                   |
| `chrome_handle_download` | 处理下载                     |
| `chrome_element_picker`  | 元素选取器                   |
| `chrome_inject_script`   | 注入脚本                     |
| `chrome_javascript`      | 执行 JavaScript              |
| `chrome_userscript`      | 用户脚本                     |
| `chrome_web_fetch`       | 网页抓取                     |
| `chrome_performance`     | 性能追踪                     |
| `chrome_gif_recorder`    | GIF 录制                     |
| `chrome_flow_run`        | 运行录制流程                 |

## 稳定性保障

### 保护机制

| 机制         | 阈值               | 效果                   |
| ------------ | ------------------ | ---------------------- |
| 单次工具超时 | 30s                | 防止卡死               |
| 最大轮数     | 10 轮              | 防止无限循环           |
| 重复调用检测 | 相同工具+参数 3 次 | 中断循环并告知用户     |
| 连续错误中断 | 3 次连续失败       | 提前终止并返回错误摘要 |
| 系统指令     | 每轮携带           | 保证中文回复、工具总结 |
| 空内容兜底   | AI 返回空 content  | 自动生成工具执行摘要   |

### 已知问题与修复

| 问题                     | 根因                       | 修复状态                      |
| ------------------------ | -------------------------- | ----------------------------- |
| Max tool call turns (10) | AI 循环调用工具无退出机制  | ✅ 已修复                     |
| AI 回复英文              | systemNote 仅首轮发送      | ✅ 已修复（每轮携带）         |
| DashScope 400 错误       | JSON Schema 含 oneOf/anyOf | ✅ 已修复（sanitizeSchema）   |
| 点击成功无回复           | AI 返回空 content          | ✅ 已修复（undefined + 兜底） |
| 工具去重漏报             | JSON key 顺序不一致        | ✅ 已修复（规范化排序）       |
| read_page 稀疏回退       | sendMessage 包装器 throw   | ✅ 已修复（原生调用）         |

## 测试

1. 加载扩展到 Chrome
2. 在设置页面配置 OpenAI API
3. 确保 `textOnlyMode` 为 `false`
4. 在侧边栏发送 "截图" 或 "总结当前页面内容"
5. 预期：AI 调用相应工具并返回中文回复

## 与 Native Server 模式的区别

| 特性     | OpenAI 直连                     | Native Server                |
| -------- | ------------------------------- | ---------------------------- |
| 依赖     | 仅需 OpenAI API                 | 需要本地 Node.js 服务        |
| 工具调用 | Function Calling（OpenAI 决定） | MCP Protocol                 |
| 延迟     | 较低（直连 API，2 次跨进程）    | 较高（本地中转，5 次跨进程） |
| 部署     | 简单（无需本地服务）            | 复杂（需启动服务）           |
| 适用场景 | 轻量使用、快速测试              | 完整功能、Claude 模型        |
| 离线     | 需要网络                        | 本地运行（可选）             |

## 故障排除

### 问题：AI 不调用工具，只返回文本

- 检查 `textOnlyMode` 是否为 `false`
- 确认 `openai-tools-adapter.ts` 被正确引用
- 检查模型是否支持 Function Calling（推荐 gpt-4o、qwen-plus 等）

### 问题：工具执行失败

- 检查 Background 控制台是否有 `EXECUTE_TOOL_CALL` 日志
- 确认 `native-host.ts` 中的 handler 已注册
- 检查工具名称是否匹配 `TOOL_SCHEMAS` 中定义的名称

### 问题：400 invalid_parameter_error

- 已由 `sanitizeSchema` 自动清理 oneOf/anyOf
- 如仍出现，检查 API 提供商的 JSON Schema 要求

### 问题：Background 没有收到消息

- 确认 `BACKGROUND_MESSAGE_TYPES.EXECUTE_TOOL_CALL` 已定义
- 检查 `native-host.ts` 的 `onMessage` 监听器已注册

### 问题：AI 返回英文而非中文

- 已修复：system note 现在每轮都携带中文指令
- 如仍出现，检查 API 提供商是否支持 system message
