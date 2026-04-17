# Chrome 扩展本地调试指南

## 一、调试后端服务器

### 1. 查看服务器日志

```bash
# 启动服务器时查看日志
cd /Users/heal/mcp-chrome/app/native-server
node start-http.js

# 日志输出示例：
# ✅ HTTP Server started on port 12307
# [DebugMode] Enabled for 2 hours
```

### 2. 测试 API 端点

```bash
# 使用 curl 测试
curl -v http://127.0.0.1:12307/ping

# 测试 POST 请求
curl -v -X POST http://127.0.0.1:12307/debug/enable \
  -H "Content-Type: application/json" \
  -d '{"token":"debug-token"}'

# 使用测试脚本
bash scripts/test-local.sh 12307
```

### 3. 查看进程状态

```bash
# 检查端口占用
lsof -i :12307

# 查看进程详情
ps aux | grep "node"

# 杀掉进程（如果需要重启）
pkill -f "node start-http.js"
```

---

## 二、调试 Chrome 扩展前端

### 1. 打开 DevTools

#### Sidepanel DevTools

```
1. 打开 Sidepanel（点击扩展图标）
2. 在 Sidepanel 内右键点击
3. 选择"检查" / "Inspect"
```

这会打开一个独立的 DevTools 窗口，专门用于 Sidepanel。

#### Popup DevTools

```
1. 点击扩展图标打开 Popup
2. 在 Popup 上右键点击
3. 选择"检查"
```

#### Background Service Worker

```
1. 打开 chrome://extensions/
2. 找到你的扩展
3. 点击"Service Worker"链接
4. 查看 Background 脚本日志
```

### 2. Console 日志

在 Vue 组件中添加日志：

```javascript
// SettingsView.vue
onMounted(() => {
  console.log('[SettingsView] Mounted');
  console.log('[SettingsView] Loading config...');
  loadConfig();
});

async function testConnection() {
  console.log('[SettingsView] Testing connection with:', {
    baseUrl: config.value.baseUrl,
    model: config.value.model,
  });

  testing.value = true;
  // ...
}
```

### 3. Vue DevTools（推荐）

安装 Vue DevTools 扩展：

1. Chrome 扩展商店搜索 "Vue.js devtools"
2. 安装后，在 DevTools 中会出现 "Vue" 标签页

功能：

- 查看组件树
- 检查组件状态（props, data, computed）
- 实时编辑状态
- 查看事件

### 4. Network 面板

检查 API 请求：

```
1. 打开 DevTools → Network 标签
2. 筛选：XHR/Fetch
3. 观察请求：
   - URL
   - 状态码
   - 响应时间
   - 响应内容
```

示例检查点：

```
请求: POST http://127.0.0.1:12307/settings/openai/test
状态: 200 OK / 500 Error
响应: {"success":true,"model":"gpt-4o"}
```

---

## 三、调试技巧

### 1. 热重载（开发模式）

```bash
# 使用开发模式启动扩展
cd /Users/heal/mcp-chrome/app/chrome-extension
npm run dev

# 扩展会自动监听文件变化并重新构建
# 修改代码后，在 chrome://extensions/ 点击刷新按钮
```

### 2. 断点调试

在 DevTools Sources 面板：

```
1. 打开 Sources 标签
2. 找到 Vue 组件文件（.vue 文件会在 chunks 目录）
3. 点击行号添加断点
4. 刷新页面触发断点
5. 使用调试控制按钮：
   - 继续 (F8)
   - 单步执行 (F10)
   - 进入函数 (F11)
   - 退出函数 (Shift+F11)
```

### 3. 查看存储

检查 localStorage：

```javascript
// Console 中执行
localStorage.getItem('openai_config');
localStorage.setItem('openai_config', JSON.stringify({ apiKey: 'test' }));

// 查看 Chrome Storage
chrome.storage.sync.get(null, (data) => console.log(data));
chrome.storage.local.get(null, (data) => console.log(data));
```

### 4. 调试 CSS

使用 DevTools Elements 面板：

```
1. 选择元素
2. 查看 Styles 面板
3. 实时修改 CSS 属性
4. 检查盒模型（Box Model）
```

### 5. 测试不同场景

```javascript
// Console 中模拟状态
// 模拟成功响应
testResult.value = { success: true, message: '连接成功！模型：gpt-4o' };

// 模拟失败响应
testResult.value = { success: false, message: '连接失败：401 Unauthorized' };

// 模拟调试模式启用
debugMode.value = {
  enabled: true,
  token: 'debug-token',
  expiresAt: Date.now() + 2 * 60 * 60 * 1000,
  countdown: '2h 0m 0s',
};
```

---

## 四、常见问题排查

### 问题 1: API 请求失败

**检查步骤**:

```bash
# 1. 确认服务器运行
curl http://127.0.0.1:12307/ping

# 2. 检查 CORS
# Network 面板查看响应头是否有 CORS 错误

# 3. 检查请求格式
# Network 面板查看请求 body
```

**DevTools Console**:

```javascript
// 手动发送请求测试
fetch('http://127.0.0.1:12307/settings/openai/test', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ apiKey: 'test-key' }),
})
  .then((r) => r.json())
  .then((d) => console.log('Response:', d))
  .catch((e) => console.error('Error:', e));
```

### 问题 2: 组件状态异常

**检查步骤**:

```javascript
// Console 中检查 Vue 实例
// 使用 Vue DevTools 查看组件树
// 检查 props, data, computed 值
```

### 问题 3: 事件未触发

**检查步骤**:

```javascript
// 添加事件日志
button.addEventListener('click', () => {
  console.log('[Event] Button clicked');
});
```

### 问题 4: CSS 样式不生效

**检查步骤**:

```
1. DevTools Elements 面板
2. 查看元素计算样式
3. 检查是否有样式覆盖
4. 检查 scoped CSS 选择器
```

---

## 五、调试工具清单

| 工具            | 用途         | 打开方式               |
| --------------- | ------------ | ---------------------- |
| Chrome DevTools | 全面调试     | 右键 → 检查            |
| Vue DevTools    | Vue 组件调试 | DevTools → Vue 标签    |
| Network 面板    | API 请求监控 | DevTools → Network     |
| Console         | 日志/命令    | DevTools → Console     |
| Sources         | 断点调试     | DevTools → Sources     |
| Elements        | CSS 调试     | DevTools → Elements    |
| Application     | 存储查看     | DevTools → Application |

---

## 六、调试脚本示例

### 后端测试脚本

```bash
#!/bin/bash
# test-api.sh

BASE_URL="http://127.0.0.1:12307"

echo "Testing API endpoints..."

# 1. Ping
echo "1. Ping:"
curl -s "$BASE_URL/ping" | jq .

# 2. Debug Status
echo "2. Debug Status:"
curl -s "$BASE_URL/debug/status" | jq .

# 3. OpenAI Config
echo "3. OpenAI Config:"
curl -s "$BASE_URL/settings/openai/active" | jq .

# 4. Enable Debug
echo "4. Enable Debug:"
curl -s -X POST "$BASE_URL/debug/enable" \
  -H "Content-Type: application/json" \
  -d '{"token":"debug-token"}' | jq .

# 5. Test Connection
echo "5. Test OpenAI Connection:"
curl -s -X POST "$BASE_URL/settings/openai/test" \
  -H "Content-Type: application/json" \
  -d '{}' | jq .
```

### 前端测试脚本（Console）

```javascript
// 在 Sidepanel DevTools Console 中执行

// 测试 fetch
async function testApi() {
  const endpoints = ['/ping', '/debug/status', '/settings/openai/active'];

  for (const endpoint of endpoints) {
    try {
      const res = await fetch(`http://127.0.0.1:12307${endpoint}`);
      const data = await res.json();
      console.log(`✅ ${endpoint}:`, data);
    } catch (err) {
      console.error(`❌ ${endpoint}:`, err.message);
    }
  }
}

testApi();
```

---

## 七、最佳实践

### 1. 日志规范

```javascript
// 使用统一的日志前缀
console.log('[SettingsView]', 'Loading config...');
console.log('[SettingsView]', 'API response:', response);
console.error('[SettingsView]', 'Error:', error);
```

### 2. 错误处理

```javascript
try {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const data = await response.json();
  console.log('[API] Success:', data);
} catch (error) {
  console.error('[API] Error:', error.message);
  // 显示用户友好的错误信息
}
```

### 3. 状态监控

```javascript
// 使用 watch 监听状态变化
watch(debugMode.enabled, (newVal, oldVal) => {
  console.log('[DebugMode] Changed:', oldVal, '→', newVal);
});
```

### 4. 开发/生产切换

```javascript
// 使用环境变量
const API_BASE =
  process.env.NODE_ENV === 'development' ? 'http://127.0.0.1:12307' : 'https://api.production.com';
```

---

**最后更新**: 2026-04-12
