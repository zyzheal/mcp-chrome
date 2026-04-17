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
OpenAI API（携带 tools 参数）
  ↓ 返回 tool_calls
executeWithToolLoop()
  ↓
executeToolCall()
  ↓ chrome.runtime.sendMessage
background/native-host.ts (EXECUTE_TOOL_CALL handler)
  ↓
handleCallTool()
  ↓
tools/browser/* (实际执行)
  ↓ 返回结果
OpenAI API（下一轮对话）
  ↓ 最终回复
Sidepanel UI 显示
```

## 关键文件

### 前端（Sidepanel）

| 文件                                                                      | 作用                                                             |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `app/chrome-extension/entrypoints/sidepanel/composables/useOpenAIChat.ts` | 核心 composable，包含 `executeWithToolLoop` 和 `executeToolCall` |
| `app/chrome-extension/common/openai-tools-adapter.ts`                     | 将 MCP TOOL_SCHEMAS 转换为 OpenAI tools 格式                     |

### Background

| 文件                                                         | 作用                                                         |
| ------------------------------------------------------------ | ------------------------------------------------------------ |
| `app/chrome-extension/entrypoints/background/native-host.ts` | 包含 `EXECUTE_TOOL_CALL` 消息处理器，桥接到 `handleCallTool` |
| `app/chrome-extension/entrypoints/background/tools/index.ts` | `handleCallTool` 实现，从 `toolsMap` 查找并执行工具          |
| `app/chrome-extension/entrypoints/background/tools/browser/` | 具体浏览器工具实现                                           |

### 公共

| 文件                                           | 作用                                              |
| ---------------------------------------------- | ------------------------------------------------- |
| `app/chrome-extension/common/message-types.ts` | 定义 `BACKGROUND_MESSAGE_TYPES.EXECUTE_TOOL_CALL` |
| `packages/shared/src/tools.ts`                 | 定义所有工具的 MCP schema（TOOL_SCHEMAS）         |

## 配置

### 1. 设置 OpenAI 配置

在设置页面或通过 chrome.storage 配置：

```typescript
{
  baseUrl: "https://api.openai.com",  // 或任何 OpenAI 兼容 API
  apiKey: "sk-...",
  model: "gpt-4o",
  enabled: true,
  textOnlyMode: false,  // 必须为 false 才能使用工具
  promptForNativeServer: false,  // 设为 false 跳过 Native Server 检查
}
```

### 2. 关键配置项说明

| 配置项                  | 说明                                   | 推荐值                    |
| ----------------------- | -------------------------------------- | ------------------------- |
| `enabled`               | 启用 OpenAI 直连模式                   | `true`                    |
| `textOnlyMode`          | 仅文本模式，禁用工具调用               | `false`（需要工具时）     |
| `promptForNativeServer` | 检测工具关键词时提示启动 Native Server | `false`（直连模式不需要） |

## 工作原理

### 1. 工具 Schema 转换

`mcpSchemaToOpenAITools()` 将 MCP 工具 schema 转换为 OpenAI function calling 格式：

```typescript
// 输入 (MCP Schema)
{
  name: "chrome_screenshot",
  description: "Take a screenshot...",
  inputSchema: { type: "object", properties: {...} }
}

// 输出 (OpenAI Tools)
{
  type: "function",
  function: {
    name: "chrome_screenshot",
    description: "Take a screenshot...",
    parameters: { type: "object", properties: {...} }
  }
}
```

### 2. 多轮工具调用循环

`executeWithToolLoop()` 实现最多 10 轮的工具调用循环：

1. 发送请求（携带 `tools` 参数）
2. 检查响应是否包含 `tool_calls`
3. 如果有，逐个执行工具调用
4. 将工具结果附加到消息列表
5. 继续下一轮请求
6. 直到没有 `tool_calls` 或达到最大轮数

### 3. 消息路由

```
Sidepanel                          Background
   │                                  │
   ├── sendMessage ──────────────────►│
   │  {type: 'execute_tool_call',     │
   │   payload: {toolName, args}}     │
   │                                  ├──► handleCallTool()
   │                                  ├──► toolsMap.get(name).execute()
   │◄── sendResponse ◀───────────────┤
   │  {success: true, result: {...}}  │
   │                                  │
```

## 可用浏览器工具

| 工具名称                 | 功能                                      |
| ------------------------ | ----------------------------------------- |
| `get_windows_and_tabs`   | 获取当前打开的窗口和标签页                |
| `chrome_navigate`        | 导航到 URL / 刷新 / 前进后退              |
| `chrome_screenshot`      | 截图（支持元素/全页/base64）              |
| `chrome_close_tabs`      | 关闭标签页                                |
| `chrome_switch_tab`      | 切换到指定标签页                          |
| `chrome_get_web_content` | 获取页面 HTML/文本内容                    |
| `chrome_click_element`   | 点击元素（CSS/XPath/ref）                 |
| `chrome_fill_or_select`  | 填充表单字段                              |
| `chrome_read_page`       | 获取无障碍树（可见元素）                  |
| `chrome_computer`        | 鼠标/键盘综合操作                         |
| `chrome_network_request` | 发送网络请求（带浏览器 Cookie）           |
| `chrome_network_capture` | 网络请求捕获                              |
| `chrome_keyboard`        | 模拟键盘输入                              |
| `chrome_console`         | 捕获控制台输出                            |
| `chrome_history`         | 搜索浏览历史                              |
| `chrome_bookmark_search` | 搜索书签                                  |
| ...                      | 更多工具见 `packages/shared/src/tools.ts` |

## 测试

1. 加载扩展到 Chrome
2. 在设置页面配置 OpenAI API
3. 确保 `textOnlyMode` 为 false
4. 在侧边栏发送 "截图" 或 "总结当前页面内容"
5. 预期：AI 调用相应工具并返回结果

## 与 Native Server 模式的区别

| 特性     | OpenAI 直连                     | Native Server             |
| -------- | ------------------------------- | ------------------------- |
| 依赖     | 仅需 OpenAI API                 | 需要本地 Python/Node 服务 |
| 工具调用 | Function Calling（OpenAI 决定） | MCP Protocol              |
| 延迟     | 较低（直接 API）                | 较高（本地服务 + API）    |
| 部署     | 简单（无需本地服务）            | 复杂（需启动服务）        |
| 适用场景 | 轻量使用、快速测试              | 完整功能、Claude 模型     |

## 故障排除

### 问题：AI 不调用工具，只返回文本

- 检查 `textOnlyMode` 是否为 `false`
- 确认 `openai-tools-adapter.ts` 存在且被正确引用
- 检查 OpenAI 模型是否支持 function calling（推荐 gpt-4o、Claude 等）

### 问题：工具执行失败

- 检查 background 控制台是否有 `EXECUTE_TOOL_CALL` 日志
- 确认 `native-host.ts` 中的 handler 存在
- 检查工具名称是否匹配 `TOOL_SCHEMAS` 中定义的名称

### 问题：Background 没有收到消息

- 确认 `BACKGROUND_MESSAGE_TYPES.EXECUTE_TOOL_CALL` 已定义
- 检查 `native-host.ts` 的 `onMessage` 监听器是否正确注册
