# 构建与发布命令速查

每个包各自一条命令就能构建出完整产物。

---

## 一、npm 包（Native Server）

```bash
cd app/native-server && pnpm run build
```

**产物**：

```
app/native-server/
├── dist/                    # Node.js 编译产物
│   ├── index.js             # 主入口
│   ├── cli.js               # CLI: chrome-mcp
│   ├── mcp/mcp-server-stdio.js
│   ├── server/
│   ├── agent/
│   └── scripts/
└── native-wasm/             # WASM 产物（构建时自动从 packages/native-wasm/pkg/ 复制）
    ├── native_wasm_bg.wasm  # ~460KB
    ├── native_wasm.js
    ├── native_wasm.d.ts
    └── package.json
```

**自动处理**：

1. 检查 WASM 是否存在，不存在则先构建
2. 复制 WASM 到 `native-wasm/`
3. TypeScript 编译
4. 复制配置、包装脚本
5. 添加可执行权限

---

## 二、扩展（本地加载）

```bash
cd app/chrome-extension && pnpm run build
```

**产物**：

```
app/chrome-extension/output/chrome-mv3/
├── manifest.json
├── background.js
├── sidepanel.html / popup.html / options.html
├── native-wasm/             # WASM 产物（构建时自动从 packages/native-wasm/pkg/ 复制）
│   ├── native_wasm_bg.wasm  # ~460KB
│   ├── native_wasm.js
│   └── ...
├── chunks/                  # JS 分块
├── content-scripts/         # 内容脚本
├── inject-scripts/
├── workers/
└── _locales/
```

**自动处理**：

1. 检查 WASM 是否存在，不存在则先构建
2. WXT 编译扩展
3. 复制 WASM 到 `output/chrome-mv3/native-wasm/`

---

## 三、native-wasm（WASM 核心）

```bash
cd packages/native-wasm && pnpm run build
```

**完整流水线**：

1. `cargo test`（27 个单元测试）
2. `wasm-pack build --release`
3. 复制到 `app/chrome-extension/native-wasm/` 和 `app/native-server/native-wasm/`

**子命令**：

| 命令                      | 功能                    |
| ------------------------- | ----------------------- |
| `pnpm run build:wasm`     | 仅 WASM 编译（release） |
| `pnpm run build:wasm:dev` | 仅 WASM 编译（debug）   |
| `pnpm run test`           | 运行 27 个单元测试      |
| `pnpm run clean`          | 清理产物                |

---

## 四、发布流程

### npm 包发布

```bash
# 构建
cd app/native-server && pnpm run build

# 递增版本（选一个）
npm version patch   # 0.1.0 → 0.1.1  bug 修复
npm version minor   # 0.1.0 → 0.2.0  新功能
npm version major   # 0.1.0 → 1.0.0  大版本

# 发布
pnpm publish --access public
```

### 扩展使用

直接加载产物目录：

```
Chrome → chrome://extensions/ → 开发者模式 → 加载 → app/chrome-extension/output/chrome-mv3/
```
