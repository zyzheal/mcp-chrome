# Chrome MCP Server 🚀

> Turn your Chrome browser into your intelligent assistant — Let AI take control of your browser, transforming it into a powerful AI-controlled automation tool.

**Documentation**: [English](README.md) | [中文](README_zh.md)
**Architecture**: [ARCHITECTURE.md](docs/ARCHITECTURE.md) | [中文架构](docs/ARCHITECTURE_zh.md)
**Tools API**: [TOOLS.md](docs/TOOLS.md) | [中文工具](docs/TOOLS_zh.md)

---

## What is Chrome MCP Server?

Chrome MCP Server is a Chrome extension-based **Model Context Protocol (MCP) server** that exposes your Chrome browser functionality to AI assistants like Claude, enabling complex browser automation, content analysis, and semantic search. Unlike traditional browser automation tools (like Playwright), Chrome MCP Server directly uses your daily Chrome browser, leveraging existing user habits, configurations, and login states.

## Core Features

- **Chatbot/Model Agnostic**: Let any LLM or chatbot client automate your browser
- **Use Your Original Browser**: Seamlessly integrates with your existing browser environment
- **Fully Local**: Pure local MCP server ensuring user privacy
- **Streamable HTTP**: Streamable HTTP connection method
- **Cross-Tab**: Cross-tab context
- **Semantic Search**: Built-in vector database for intelligent browser tab content discovery
- **20+ Tools**: Screenshots, network monitoring, interactive operations, bookmarks, history, and more
- **SIMD-Accelerated AI**: Custom WebAssembly SIMD optimization for 4-8x faster vector operations

## Quick Start

### Prerequisites

- Node.js >= 20.0.0
- Chrome/Chromium browser
- pnpm (recommended) or npm

### Installation

#### Method 1: Production Release (Recommended)

1. **Download the latest release**: https://github.com/hangwin/mcp-chrome/releases

2. **Load the extension**:
   - Open Chrome → `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked" → select the downloaded extension folder

3. **Install mcp-chrome-bridge**:
   ```bash
   npm install -g mcp-chrome-bridge
   ```

#### Method 2: Development from Source

```bash
# Clone the repository
git clone https://github.com/hangwin/mcp-chrome.git
cd mcp-chrome

# Install dependencies
pnpm install

# Build the project
pnpm build

# Build WASM SIMD module (requires Rust toolchain)
pnpm build:wasm

# Start all services in development mode
pnpm dev
```

### Load Extension in Chrome

1. Open Chrome → `chrome://extensions/`
2. Enable "Developer mode" (top-right corner)
3. Click "Load unpacked"
4. Select the directory: `app/chrome-extension/.output/chrome-mv3`

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    Chrome Extension                      │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐ │
│  │  Sidepanel    │  │  Background   │  │  Content      │ │
│  │  (Vue 3 UI)   │  │  Service      │  │  Scripts      │ │
│  │              │  │              │  │              │ │
│  │  - AgentChat │  │  - Native     │  │  - Web Page   │ │
│  │  - Settings  │  │    Host       │  │    Injection  │ │
│  │  - Sessions  │  │  - Keepalive  │  │  - DOM Access │ │
│  └──────┬───────┘  └──────┬───────┘  └───────────────┘ │
│         │                 │                             │
└─────────┼─────────────────┼─────────────────────────────┘
          │                 │ Native Messaging
          │                 ▼
          │    ┌────────────────────────┐
          │    │   Native Server        │
          │    │   (Node.js :12306)     │
          │    │                        │
          │    │  - Fastify HTTP API    │
          │    │  - MCP Server          │
          │    │    (Streamable HTTP)   │
          │    │  - Agent Engines       │
          │    │    (Claude, Codex)     │
          │    └──────────┬─────────────┘
          │               │
          ▼               ▼
┌─────────────────────────────────────────────────────────┐
│                   External Services                      │
│                                                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐ │
│  │  OpenAI     │  │  Claude     │  │  Codex CLI      │ │
│  │  Compatible │  │  Code CLI   │  │  (Anthropic)    │ │
│  │  APIs       │  │             │  │                 │ │
│  └─────────────┘  └─────────────┘  └─────────────────┘ │
│                                                         │
│  Supported Providers:                                   │
│  OpenAI, GPT-4o, Claude, Codex,                         │
│  Qwen (通义千问), GLM (智谱),                             │
│  Kimi, MiniMax                                          │
└─────────────────────────────────────────────────────────┘
```

### Connection Modes

| Mode                 | Description                                                 | Best For              |
| -------------------- | ----------------------------------------------------------- | --------------------- |
| **Native Messaging** | Extension ↔ Native Server via Chrome's native messaging API | Production use        |
| **HTTP Direct**      | Extension ↔ Native Server via HTTP (`127.0.0.1:12306`)      | Local development     |
| **OpenAI Direct**    | Extension ↔ OpenAI-compatible API (bypasses Native Server)  | Cloud-first workflows |

## Usage

### MCP Client Configuration

#### Streamable HTTP (Recommended)

```json
{
  "mcpServers": {
    "chrome-mcp-server": {
      "type": "streamableHttp",
      "url": "http://127.0.0.1:12306/mcp"
    }
  }
}
```

#### STDIO (Alternative)

```json
{
  "mcpServers": {
    "chrome-mcp-stdio": {
      "command": "npx",
      "args": ["node", "/path/to/mcp-chrome-bridge/dist/mcp/mcp-server-stdio.js"]
    }
  }
}
```

### Settings Configuration

After loading the extension, access settings via:

```
Sidepanel → Floating button (☰) → Settings
```

#### OpenAI Compatible API

Configure any OpenAI-compatible endpoint in the Settings page:

| Field       | Description           | Example                           |
| ----------- | --------------------- | --------------------------------- |
| API Key     | Authentication key    | `sk-xxx`                          |
| Base URL    | API endpoint URL      | `https://api.openai.com/v1`       |
| Model       | Model identifier      | `gpt-4o`, `qwen3.6-plus`, `glm-5` |
| Max Tokens  | Response length limit | `4096`                            |
| Temperature | Randomness control    | `0.7`                             |

**Preset configurations** are available for:

- OpenAI Official
- Azure OpenAI
- Ollama (local models)

#### OpenAI Direct Mode

Enable "作为聊天默认引擎" in Settings to bypass the Native Server and call the OpenAI-compatible API directly. Additional options:

- **Text-only mode**: AI returns text only, without calling browser extension tools
- **Prompt for Native Server**: When tools are needed, prompts the user to start the Native Server first

#### Debug Mode

For local development, enable debug mode to communicate with the extension without full MCP authentication. Includes a countdown timer (2 hours) and debug token.

## Available Tools

Complete tool list: [TOOLS.md](docs/TOOLS.md)

<details>
<summary><strong>Browser Management</strong></summary>

- `get_windows_and_tabs` - List all browser windows and tabs
- `chrome_navigate` - Navigate to URLs and control viewport
- `chrome_switch_tab` - Switch the current active tab
- `chrome_close_tabs` - Close specific tabs or windows
- `chrome_go_back_or_forward` - Browser navigation control
- `chrome_inject_script` - Inject content scripts into web pages
</details>

<details>
<summary><strong>Screenshots & Visual</strong></summary>

- `chrome_screenshot` - Advanced screenshot capture with element targeting
</details>

<details>
<summary><strong>Network Monitoring</strong></summary>

- `chrome_network_capture_start/stop` - webRequest API network capture
- `chrome_network_debugger_start/stop` - Debugger API with response bodies
- `chrome_network_request` - Send custom HTTP requests
</details>

<details>
<summary><strong>Content Analysis</strong></summary>

- `search_tabs_content` - AI-powered semantic search across browser tabs
- `chrome_get_web_content` - Extract HTML/text content from pages
- `chrome_get_interactive_elements` - Find clickable elements
- `chrome_console` - Capture and retrieve console output
</details>

<details>
<summary><strong>Interaction</strong></summary>

- `chrome_click_element` - Click elements using CSS selectors
- `chrome_fill_or_select` - Fill forms and select options
- `chrome_keyboard` - Simulate keyboard input
</details>

<details>
<summary><strong>Data Management</strong></summary>

- `chrome_history` - Search browser history with time filters
- `chrome_bookmark_search` - Find bookmarks by keywords
- `chrome_bookmark_add` - Add new bookmarks with folder support
- `chrome_bookmark_delete` - Delete bookmarks
</details>

## Development

### Project Structure

```
mcp-chrome/
├── app/
│   ├── chrome-extension/     # Chrome extension (Vue 3 + WXT)
│   │   ├── entrypoints/
│   │   │   ├── background/   # Background service worker
│   │   │   ├── sidepanel/    # Sidepanel UI (Vue components)
│   │   │   └── content/      # Content scripts
│   │   ├── common/           # Shared types and constants
│   │   └── workers/          # Web Workers (WASM SIMD)
│   └── native-server/        # Native server (Node.js + Fastify)
│       ├── src/
│       │   ├── agent/        # Agent engines and services
│       │   ├── server/       # Fastify HTTP server and routes
│       │   └── mcp/          # MCP server implementation
│       └── scripts/          # Development helper scripts
├── packages/
│   ├── shared/               # Shared TypeScript types
│   └── wasm-simd/            # Rust WebAssembly SIMD module
└── docs/                     # Documentation
```

### Key Commands

```bash
# Development
pnpm dev              # Start all services in dev mode
pnpm dev:extension    # Watch-mode for Chrome extension
pnpm dev:native       # Watch-mode for native server

# Build
pnpm build            # Build all packages
pnpm build:extension  # Build Chrome extension only
pnpm build:native     # Build native server only
pnpm build:wasm       # Build WASM SIMD module

# Quality
pnpm test             # Run all tests
pnpm lint             # ESLint check
pnpm typecheck        # TypeScript type checking
pnpm format           # Prettier formatting

# Cleanup
pnpm clean:dist       # Remove all dist directories
pnpm clean:modules    # Remove all node_modules
```

### WASM SIMD Build

The WASM SIMD module requires a Rust toolchain. Run the environment check before building:

```bash
cd packages/wasm-simd
pnpm check:env        # Verify Rust, wasm-pack, and targets
pnpm build            # Build with environment check
pnpm build:force      # Build without environment check
```

Required tools:

- `rustc` >= 1.70
- `cargo`
- `wasm-pack` (`cargo install wasm-pack`)
- `wasm32-unknown-unknown` target (`rustup target add wasm32-unknown-unknown`)

### Debugging

**Backend server logs**:

```bash
cd app/native-server
node dist/index.js
```

**Extension console**:

- Sidepanel: Right-click content area → "Inspect"
- Background service worker: `chrome://extensions/` → "Service Worker" link

**API testing**:

```bash
# Use the debug tools script
cd app/native-server/scripts
bash debug-tools.sh status    # Check server status
bash debug-tools.sh test      # Test all API endpoints
bash debug-tools.sh config    # View OpenAI config
```

## Contributing

See [CONTRIBUTING.md](docs/CONTRIBUTING.md) for detailed guidelines.

## Troubleshooting

- [Troubleshooting Guide](docs/TROUBLESHOOTING.md) | [中文](docs/TROUBLESHOOTING_zh.md)
- [Debugging Guide](docs/debugging-guide.md)
- [UI Debugging Guide](docs/ui-debugging-guide.md)

## License

MIT License — see [LICENSE](LICENSE)
