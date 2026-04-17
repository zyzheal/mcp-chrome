# 开始使用 - Chrome MCP Server

**快速开始你的 AI 浏览器自动化之旅**

---

## 🚀 5 分钟快速启动

### 步骤 1: 设置 API Key

```bash
cd app/native-server

# 复制环境变量模板
cp .env.example .env

# 编辑 .env 文件，设置你的 API Key
# 可以使用以下任一编辑器：
nano .env
# 或
code .env
# 或
vim .env
```

在 `.env` 文件中设置：

```bash
OPENAI_API_KEY="sk-your-api-key-here"
```

### 步骤 2: 安装依赖

```bash
npm install
```

### 步骤 3: 启动服务器

```bash
# 方式 1: 使用快速启动脚本（推荐）
npm run quick-start

# 方式 2: 直接开发模式
npm run dev
```

### 步骤 4: 验证运行

```bash
# 测试服务器
curl http://127.0.0.1:12306/ping

# 测试 OpenAI 连接
curl http://127.0.0.1:12306/settings/openai/test
```

---

## 📖 详细文档导航

| 文档                                                   | 用途               | 阅读时间 |
| ------------------------------------------------------ | ------------------ | -------- |
| [QUICKSTART.md](./QUICKSTART.md)                       | 完整启动指南       | 5 分钟   |
| [QUICKSTART_NO_DB.md](./QUICKSTART_NO_DB.md)           | 无数据库方案说明   | 3 分钟   |
| [requirements-analysis.md](./requirements-analysis.md) | 需求分析           | 10 分钟  |
| [technical-design.md](./technical-design.md)           | 技术设计           | 15 分钟  |
| [OPENAI_ENGINE.md](./OPENAI_ENGINE.md)                 | OpenAI Engine 配置 | 5 分钟   |

---

## 🔧 常用命令

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 快速启动（推荐）
npm run quick-start

# 构建生产版本
npm run build

# 运行测试
npm test

# 运行 API 测试脚本
bash scripts/test-local.sh 12306

# 格式化代码
npm run format

# 代码检查
npm run lint
```

---

## 🎯 核心功能

### 1. OpenAI 兼容 API 支持

支持任何 OpenAI 兼容的 API 端点：

```bash
# OpenAI 官方
OPENAI_BASE_URL="https://api.openai.com/v1"

# Azure OpenAI
OPENAI_BASE_URL="https://your-resource.openai.azure.com/..."

# 本地模型 (Ollama)
OPENAI_BASE_URL="http://localhost:11434/v1"

# 第三方服务
OPENAI_BASE_URL="https://api.deepseek.com/v1"
```

**通过设置页面配置**：

1. 打开浏览器扩展 Sidepanel
2. 点击右上角浮动按钮
3. 选择"设置"
4. 填写 API Key、Base URL、选择模型
5. 点击"测试连接"验证

### 2. 调试模式

本地开发无需复杂认证：

```bash
# 启用调试模式
curl -X POST http://127.0.0.1:12306/debug/enable \
  -H "Content-Type: application/json" \
  -d '{"token":"debug-token"}'

# 查看状态
curl http://127.0.0.1:12306/debug/status
```

**通过设置页面启用**：

1. 打开设置页面
2. 在"调试模式"部分打开开关
3. 查看倒计时和 Token 信息
4. 可一键复制调试信息

### 3. 多引擎支持

| 引擎   | 说明            | 状态    |
| ------ | --------------- | ------- |
| Claude | Claude Code CLI | ✅      |
| Codex  | Codex CLI       | ✅      |
| OpenAI | 直接 API 调用   | ✅ 新增 |

---

## 🛠️ 故障排除

### 问题：`npm install` 失败

```bash
# 清除缓存重试
npm cache clean --force
npm install

# 或使用 pnpm
pnpm install
```

### 问题：端口被占用

```bash
# 查看占用端口的进程
lsof -i :12306

# 杀死进程
kill -9 <PID>

# 或修改端口
echo 'NATIVE_SERVER_PORT="12307"' >> .env
```

### 问题：OPENAI_API_KEY 错误

1. 检查 `.env` 文件是否存在
2. 确认 API Key 格式正确（以 `sk-` 开头）
3. 检查账户余额
4. 重启服务器

### 问题：连接超时

```bash
# 检查服务器是否运行
curl http://127.0.0.1:12306/ping

# 检查防火墙
# macOS: 系统偏好设置 > 安全性与隐私 > 防火墙
# Windows: Windows Defender 防火墙
```

---

## 📞 获取帮助

### 遇到问题？

1. **查看文档**: [docs/](./) 目录
2. **查看日志**: 服务器启动时的错误信息
3. **提交 Issue**: GitHub Issues

### 常用链接

- [完整文档](./)
- [API 参考](./QUICKSTART.md#可用-api-端点)
- [环境变量配置](./QUICKSTART.md#环境变量参考)

---

## ✅ 检查清单

开始前确认：

- [ ] Node.js >= 20.0.0 已安装
- [ ] 有效的 OpenAI API Key
- [ ] `.env` 文件已正确配置
- [ ] 端口 12306 未被占用

启动后验证：

- [ ] 服务器正常启动
- [ ] `/ping` 端点返回 `pong`
- [ ] `/settings/openai/test` 测试通过
- [ ] `/agent/engines` 返回可用引擎列表

---

**最后更新**: 2026-04-12
**文档版本**: 1.0
