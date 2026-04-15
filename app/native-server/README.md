# @zyzheal/chrome-mcp

Chrome Native Messaging Host - 让 AI Agent 通过 MCP 协议控制 Chrome 浏览器。

## 功能特性

- 通过 Chrome Native Messaging 协议与 Chrome 扩展进行双向通信
- **支持多浏览器**: Chrome 和 Chromium (包括 Linux、macOS 和 Windows)
- 提供 MCP (Model Context Protocol) 服务，支持 AI Agent 通过 stdio 协议控制浏览器
- 提供 RESTful API 服务
- 完全使用 TypeScript 开发
- 包含完整的诊断和修复工具

## 快速开始

### 安装

```bash
npm install -g @zyzheal/chrome-mcp
```

### 使用流程

```
安装 → 注册 → 启动 Chrome 扩展 → AI Agent 通过 MCP 控制浏览器
```

## 命令详解

### 1. `chrome-mcp` - 用户管理工具

#### 注册 Native Messaging Host

```bash
# 自动检测并注册所有已安装的浏览器
chrome-mcp register --detect

# 仅注册 Chrome
chrome-mcp register --browser chrome

# 仅注册 Chromium
chrome-mcp register --browser chromium

# 注册所有支持的浏览器
chrome-mcp register --browser all

# 强制重新注册
chrome-mcp register --force

# 系统级注册（需要管理员权限）
sudo chrome-mcp register
# 或
chrome-mcp register --system
```

**注册位置：**

| 系统    | 路径                                                            |
| ------- | --------------------------------------------------------------- |
| Linux   | `~/.config/[browser-name]/NativeMessagingHosts/`                |
| macOS   | `~/Library/Application Support/[Browser]/NativeMessagingHosts/` |
| Windows | `%APPDATA%\[Browser]\NativeMessagingHosts\`                     |

#### 诊断安装问题

```bash
# 运行诊断检查
chrome-mcp doctor

# 自动修复常见问题
chrome-mcp doctor --fix

# 针对特定浏览器诊断
chrome-mcp doctor --browser chrome
```

#### 修复权限问题

```bash
chrome-mcp fix-permissions
```

#### 更新端口配置

```bash
chrome-mcp update-port 3000
```

#### 导出诊断报告

```bash
# 输出 Markdown 格式报告
chrome-mcp report

# 输出 JSON 格式
chrome-mcp report --json

# 保存到文件
chrome-mcp report --output report.md

# 复制到剪贴板
chrome-mcp report --copy

# 包含完整日志
chrome-mcp report --include-logs full
```

### 2. `mcp-chrome-stdio` - AI Agent MCP 服务

此命令供 AI Agent（如 Claude Desktop、Cursor 等）使用，通过 stdio 协议代理工具调用到 Chrome 扩展。

**在 AI Agent 配置中添加：**

```json
{
  "mcpServers": {
    "chrome": {
      "command": "mcp-chrome-stdio"
    }
  }
}
```

## 开发环境设置

### 前置条件

- Node.js 20+
- npm 8+

### 本地开发

```bash
# 安装依赖
npm install

# 启动开发模式（自动构建并注册）
npm run dev

# 构建
npm run build

# 测试
npm run test
```

## 浏览器支持

| 浏览器        | Linux | macOS | Windows |
| ------------- | ----- | ----- | ------- |
| Google Chrome | ✓     | ✓     | ✓       |
| Chromium      | ✓     | ✓     | ✓       |

## 与 Chrome 扩展集成

以下是 Chrome 扩展中如何使用此服务的示例：

```javascript
// background.js
let nativePort = null;

function startServer() {
  if (nativePort) return;

  nativePort = chrome.runtime.connectNative('com.yourcompany.fastify_native_host');

  nativePort.onMessage.addListener((message) => {
    if (message.type === 'started') {
      console.log(`服务已启动，端口: ${message.payload.port}`);
    }
  });

  nativePort.postMessage({ type: 'start', payload: { port: 3000 } });
}

chrome.runtime.onStartup.addListener(startServer);
```

## 架构说明

```
AI Agent (Claude/Cursor)
    ↓ (stdio 协议)
mcp-chrome-stdio (MCP 代理)
    ↓ (HTTP Streamable)
Chrome 扩展中的 MCP 服务器
    ↓ (Native Messaging)
chrome-mcp (本地服务)
    ↓
Chrome 浏览器操作
```

## 许可证

MIT
