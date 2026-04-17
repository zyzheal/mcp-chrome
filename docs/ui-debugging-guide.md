# UI 页面本地调试详细指南

## 一、打开调试工具

### 方法 1：Sidepanel DevTools（推荐）

```
1. 点击扩展图标打开 Sidepanel
2. 在 Sidepanel 内容区域右键点击
3. 选择 "检查" 或 "Inspect"
4. 新窗口打开 Sidepanel 专用 DevTools
```

**⚠️ 注意**：必须右键点击 Sidepanel **内容区域**，而不是 Chrome 界面。

### 方法 2：通过扩展管理页面

```
1. 打开 chrome://extensions/
2. 找到 "Chrome MCP Server" 扩展
3. 点击 "检查视图：sidepanel.html"
```

---

## 二、Console 调试

### 2.1 添加调试日志

在 Vue 组件中添加日志：

```vue
<script lang="ts" setup>
// SettingsView.vue

import { onMounted, ref } from 'vue';

onMounted(() => {
  console.log('🚀 [SettingsView] 组件已挂载');
  console.log('📍 [SettingsView] 当前配置:', config.value);
});

async function testConnection() {
  console.log('🔄 [SettingsView] 开始测试连接');
  console.log('📤 [SettingsView] 发送请求:', {
    baseUrl: config.value.baseUrl,
    model: config.value.model,
  });

  testing.value = true;
  const response = await fetch('http://127.0.0.1:12307/settings/openai/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      baseUrl: config.value.baseUrl,
      apiKey: config.value.apiKey,
      model: config.value.model,
    }),
  });

  const data = await response.json();
  console.log('📥 [SettingsView] 收到响应:', data);

  testing.value = false;
}

function toggleDebugMode() {
  console.log('🔄 [SettingsView] 切换调试模式:', debugMode.value.enabled);
}
</script>
```

### 2.2 Console 命令速查

```javascript
// 检查 Vue 组件状态（需要 Vue DevTools）
// 或者直接在组件中暴露到 window

// 查看当前配置
console.log('Config:', JSON.stringify(config.value));

// 模拟 API 响应
testResult.value = { success: true, message: '测试成功' };

// 手动触发函数
loadConfig();

// 检查 localStorage
console.log('LocalStorage:', localStorage.getItem('openai_config'));

// 测试 fetch
fetch('http://127.0.0.1:12307/ping')
  .then((r) => r.json())
  .then((d) => console.log('Ping 结果:', d));
```

---

## 三、Vue DevTools（强烈推荐）

### 3.1 安装 Vue DevTools

1. Chrome 扩展商店搜索 **"Vue.js devtools"**
2. 安装扩展（作者：Vue.js）
3. 安装后 DevTools 会出现 **"Vue"** 标签页

### 3.2 使用 Vue DevTools

```
1. 打开 Sidepanel DevTools
2. 点击 "Vue" 标签页
3. 左侧显示组件树
4. 点击组件查看详情
```

**功能列表**：

| 功能        | 说明                    |
| ----------- | ----------------------- |
| 组件树      | 显示所有 Vue 组件层级   |
| Props       | 查看传入的 props        |
| Data        | 查看响应式数据          |
| Computed    | 查看计算属性            |
| Setup State | 查看 setup 中定义的状态 |
| Events      | 查看触发的事件          |
| 编辑状态    | 双击值可以实时编辑      |

**示例**：

```
组件树:
└── SettingsView
    ├── config: { apiKey: '', baseUrl: '...', model: 'gpt-4o' }
    ├── testResult: null
    ├── testing: false
    └── debugMode: { enabled: false, countdown: '' }
```

### 3.3 实时编辑状态

```
1. 在 Vue DevTools 中找到 SettingsView
2. 找到 config.value.apiKey
3. 双击值，输入 'sk-test-key'
4. UI 会实时更新（显示密码框有内容）
```

---

## 四、Network 面板调试

### 4.1 检查 API 请求

```
1. DevTools → Network 标签
2. 篮选: XHR 或 Fetch
3. 点击 "测试连接" 按钮
4. 查看新请求
```

**请求详情**：

```
请求名称: settings/openai/test
方法: POST
URL: http://127.0.0.1:12307/settings/openai/test
状态: 200 OK (或 500 Error)
请求头:
  Content-Type: application/json
请求体:
  {
    "baseUrl": "https://api.openai.com/v1",
    "apiKey": "sk-...",
    "model": "gpt-4o"
  }
响应:
  {
    "success": true,
    "model": "gpt-4o"
  }
```

### 4.2 模拟请求失败

```javascript
// Console 中模拟超时
fetch('http://127.0.0.1:12307/settings/openai/test', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ apiKey: 'invalid-key' }),
  signal: AbortSignal.timeout(5000), // 5秒超时
})
  .then((r) => r.json())
  .then((d) => console.log(d))
  .catch((e) => console.error('请求失败:', e.message));
```

---

## 五、断点调试

### 5.1 Sources 面板设置断点

```
1. DevTools → Sources 标签
2. 左侧文件树找到 chunks/sidepanel-xxx.js
3. 搜索函数名（Ctrl+F）如 "testConnection"
4. 点击行号添加断点（蓝色标记）
5. 点击 "测试连接" 触发断点
6. 代码停在断点处
```

### 5.2 调试控制按钮

| 按钮         | 功能                   | 快捷键    |
| ------------ | ---------------------- | --------- |
| ▶️ Resume    | 继续执行               | F8        |
| ⏭️ Step Over | 单步执行（不进入函数） | F10       |
| ⬇️ Step Into | 进入函数内部           | F11       |
| ⬆️ Step Out  | 退出当前函数           | Shift+F11 |

### 5.3 查看变量值

断点暂停时：

```
1. 右侧 Scope 面板显示当前作用域变量
2. Local: 当前函数内变量
3. Global: 全局变量
4. Watch: 添加表达式监视
```

---

## 六、CSS 调试

### 6.1 Elements 面板

```
1. DevTools → Elements 标签
2. 左侧显示 HTML 结构
3. 点击元素高亮对应 UI
4. 右侧 Styles 面板显示 CSS
```

### 6.2 实时修改样式

```
示例：修改按钮颜色
1. 找到 .btn-primary
2. 修改 background: #d97757 → #ff5722
3. 实时查看效果
```

### 6.3 检查 Scoped CSS

Vue scoped CSS 会添加特殊属性：

```html
<button class="btn-primary" data-v-abc123></button>
```

检查时注意：

- 样式选择器带 `[data-v-abc123]`
- 确认样式是否正确应用

---

## 七、热重载调试

### 7.1 开发模式

```bash
# 启动开发模式（监听文件变化）
cd /Users/heal/mcp-chrome/app/chrome-extension
npm run dev
```

开发模式下：

- 修改 `.vue` 文件自动重新构建
- 需要在 `chrome://extensions/` 手动刷新扩展

### 7.2 快速调试流程

```
1. 修改 SettingsView.vue（添加 console.log）
2. 构建自动完成
3. chrome://extensions/ → 点击刷新按钮 🔄
4. 打开 Sidepanel → DevTools → Console
5. 查看新日志
```

---

## 八、调试常见问题

### 问题 1：Console 看不到 Vue 叄件状态

**解决**：

```javascript
// 在组件 setup 中暴露状态到 window
onMounted(() => {
  // 仅开发环境
  if (process.env.NODE_ENV === 'development') {
    (window as any).__settings__ = {
      config: config.value,
      testResult: testResult.value,
    };
  }
});

// Console 中访问
console.log(window.__settings__);
```

### 问题 2：fetch 请求 CORS 错误

**解决**：

```
检查 Network 面板：
1. 是否有 CORS 错误提示
2. 检查请求 URL 是否正确
3. 确认服务器 CORS 配置
```

### 问题 3：样式不生效

**解决**：

```
1. Elements 面板检查元素
2. 查看计算样式是否被覆盖
3. 检查 scoped 选择器格式
```

### 问题 4：组件响应式失效

**解决**：

```javascript
// 确保使用 ref/reactive
const config = ref<OpenAIConfig>({...}); // ✅ 正确

// 错误：直接修改普通对象
// let config = {...}; // ❌ 非响应式
```

---

## 九、调试脚本示例

### 9.1 Console 测试脚本

```javascript
// 在 Sidepanel DevTools Console 执行

// 测试所有 API
async function testAllApis() {
  const base = 'http://127.0.0.1:12307';
  const endpoints = [
    { path: '/ping', name: 'Ping' },
    { path: '/debug/status', name: 'Debug Status' },
    { path: '/settings/openai/active', name: 'OpenAI Config' },
    { path: '/agent/engines', name: 'Engines' },
  ];

  console.log('🧪 开始测试所有 API...\n');

  for (const ep of endpoints) {
    try {
      const res = await fetch(base + ep.path);
      const data = await res.json();
      console.log(`✅ ${ep.name}:`, data);
    } catch (err) {
      console.error(`❌ ${ep.name}:`, err.message);
    }
  }
}

testAllApis();

// 测试连接
async function testOpenAI(apiKey) {
  const res = await fetch('http://127.0.0.1:12307/settings/openai/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey, model: 'gpt-4o' }),
  });
  const data = await res.json();
  console.log('OpenAI Test Result:', data);
}

testOpenAI('sk-your-key');
```

### 9.2 监控状态变化

```javascript
// 监控 debugMode 状态（如果有 Vue DevTools）
// 或手动添加 watch

import { watch } from 'vue';

watch(debugMode.enabled, (newVal, oldVal) => {
  console.log(`📊 Debug Mode: ${oldVal} → ${newVal}`);
});
```

---

## 十、完整调试检查清单

### UI 功能测试

| 功能          | 检查点               | 工具         |
| ------------- | -------------------- | ------------ |
| API Key 输入  | 输入、显示/隐藏      | Elements     |
| Base URL 输入 | 输入、预设选择       | Vue DevTools |
| 模型选择      | 下拉菜单             | Console      |
| 测试连接      | 按钮、加载状态、结果 | Network      |
| 调试模式开关  | 切换、倒计时         | Vue DevTools |
| 预设配置      | 点击切换             | Console      |

### 调试工具使用

| 工具         | 用途               | 打开方式            |
| ------------ | ------------------ | ------------------- |
| Console      | 日志输出、手动测试 | DevTools → Console  |
| Network      | API 请求监控       | DevTools → Network  |
| Vue DevTools | Vue 状态检查       | DevTools → Vue      |
| Elements     | CSS 检查           | DevTools → Elements |
| Sources      | 断点调试           | DevTools → Sources  |

---

**最后更新**: 2026-04-12
