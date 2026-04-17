# 无数据库快速启动指南

**适用场景**: 没有安装 SQLite 或不想配置数据库的开发环境

---

## 方案概述

| 功能         | 原方案     | 简化方案 |
| ------------ | ---------- | -------- |
| OpenAI 配置  | 数据库存储 | 环境变量 |
| Session 管理 | 数据库     | 内存存储 |
| 调试模式     | Token 验证 | 直接启用 |

---

## Step 1: 设置环境变量

创建 `.env` 文件在 `app/native-server/` 目录：

```bash
# app/native-server/.env

# OpenAI API 配置
OPENAI_API_KEY="sk-your-api-key-here"
OPENAI_BASE_URL="https://api.openai.com/v1"
OPENAI_DEFAULT_MODEL="gpt-4o"
OPENAI_MAX_TOKENS="4096"
OPENAI_TEMPERATURE="0.7"

# 调试模式配置
DEBUG_MODE_ENABLED="true"
DEBUG_MODE_TOKEN="debug-token"

# 服务器配置
NATIVE_SERVER_PORT="12306"
```

---

## Step 2: 简化版 OpenAI Engine

文件已创建：`app/native-server/src/agent/engines/openai.ts`

该引擎直接从环境变量读取配置，无需数据库。

---

## Step 3: 简化版调试模式

创建轻量级调试模式服务，无需数据库验证。

---

## Step 4: 启动服务器

```bash
cd /Users/heal/mcp-chrome/app/native-server
npm install
npm run dev
```

---

## Step 5: 测试连接

```bash
# 测试服务器是否运行
curl http://127.0.0.1:12306/ping

# 测试 OpenAI 配置
curl http://127.0.0.1:12306/agent/engines
```

---

## 限制说明

| 限制         | 说明               | 后续可升级     |
| ------------ | ------------------ | -------------- |
| 配置持久化   | 环境变量需手动设置 | → 数据库存储   |
| Session 恢复 | 重启后丢失         | → 数据库持久化 |
| 多用户支持   | 不支持             | → 用户系统     |

---

## 下一步

1. 确认环境变量已正确设置
2. 安装依赖 `pnpm install`
3. 启动服务器 `pnpm dev:native`
4. 测试 OpenAI Engine
