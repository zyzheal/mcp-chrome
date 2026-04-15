/**
 * UI 调试辅助工具
 *
 * 使用方法：
 * 1. 在 SettingsView.vue 中导入: import { debugHelpers } from './debug-helpers'
 * 2. 在 onMounted 中调用: debugHelpers.init()
 * 3. 打开 Sidepanel DevTools Console 使用调试命令
 */

export const debugHelpers = {
  /**
   * 初始化调试辅助工具
   * 在组件 mounted 时调用
   */
  init() {
    if (typeof window === 'undefined') return;

    // 暴露调试命令到 window
    (window as any).__debug_settings__ = {
      help: this.showHelp,
      testApi: this.testAllApis,
      testConnection: this.testOpenAIConnection,
      checkStorage: this.checkLocalStorage,
      mockSuccess: this.mockSuccessResult,
      mockError: this.mockErrorResult,
      info: this.showInfo,
    };

    console.log('🔧 调试工具已加载！输入 __debug_settings__.help() 查看可用命令');
  },

  /**
   * 显示帮助信息
   */
  showHelp() {
    console.log(`
📋 可用调试命令:
  
  __debug_settings__.testApi()         - 测试所有 API 端点
  __debug_settings__.testConnection()  - 测试 OpenAI 连接
  __debug_settings__.checkStorage()    - 检查 localStorage
  __debug_settings__.mockSuccess()     - 模拟成功响应
  __debug_settings__.mockError()       - 模拟错误响应
  __debug_settings__.info()            - 显示当前状态信息
    `);
  },

  /**
   * 测试所有 API 端点
   */
  async testAllApis() {
    const base = 'http://127.0.0.1:12307';
    const endpoints = [
      { path: '/ping', method: 'GET', name: 'Ping' },
      { path: '/debug/status', method: 'GET', name: 'Debug Status' },
      { path: '/settings/openai/active', method: 'GET', name: 'OpenAI Config' },
      { path: '/agent/engines', method: 'GET', name: 'Engines' },
      { path: '/debug/test', method: 'GET', name: 'Debug Test' },
    ];

    console.log('🧪 测试所有 API 端点...\n');

    for (const ep of endpoints) {
      try {
        const res = await fetch(base + ep.path, { method: ep.method });
        const data = await res.json();
        console.log(`✅ ${ep.name}:`, data);
      } catch (err) {
        console.error(`❌ ${ep.name}:`, (err as Error).message);
      }
    }
  },

  /**
   * 测试 OpenAI 连接
   */
  async testOpenAIConnection(apiKey?: string, baseUrl?: string, model?: string) {
    console.log('🔄 测试 OpenAI 连接...');

    const body = {
      apiKey: apiKey || 'test-key',
      baseUrl: baseUrl || 'https://api.openai.com/v1',
      model: model || 'gpt-4o',
    };

    console.log('📤 请求参数:', body);

    try {
      const res = await fetch('http://127.0.0.1:12307/settings/openai/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      console.log('📥 响应:', data);
      return data;
    } catch (err) {
      console.error('❌ 请求失败:', (err as Error).message);
    }
  },

  /**
   * 检查 localStorage
   */
  checkLocalStorage() {
    console.log('📦 LocalStorage 内容:\n');

    const keys = ['openai_config', 'debug_mode'];

    for (const key of keys) {
      const value = localStorage.getItem(key);
      if (value) {
        console.log(`${key}:`, JSON.parse(value));
      } else {
        console.log(`${key}: (未设置)`);
      }
    }

    // 显示所有存储
    console.log('\n所有 localStorage:');
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) {
        console.log(`  ${key}: ${localStorage.getItem(key)?.substring(0, 100)}...`);
      }
    }
  },

  /**
   * 模拟成功响应（用于 UI 测试）
   */
  mockSuccessResult() {
    console.log('✅ 模拟成功响应');
    // 需要在 Vue DevTools 中手动设置 testResult
    console.log('请在 Vue DevTools 中设置:');
    console.log('  testResult = { success: true, message: "连接成功！模型：gpt-4o" }');
  },

  /**
   * 模拟错误响应（用于 UI 测试）
   */
  mockErrorResult() {
    console.log('❌ 模拟错误响应');
    console.log('请在 Vue DevTools 中设置:');
    console.log('  testResult = { success: false, message: "连接失败：401 Unauthorized" }');
  },

  /**
   * 显示当前状态信息
   */
  async showInfo() {
    console.log('📊 当前状态信息:\n');

    // 检查服务器状态
    try {
      const ping = await fetch('http://127.0.0.1:12307/ping');
      const pingData = await ping.json();
      console.log('服务器:', pingData.status === 'ok' ? '✅ 运行中' : '❌ 异常');
    } catch {
      console.log('服务器: ❌ 未运行');
    }

    // 检查调试模式
    try {
      const debug = await fetch('http://127.0.0.1:12307/debug/status');
      const debugData = await debug.json();
      console.log('调试模式:', debugData.enabled ? '✅ 已启用' : '⭕ 未启用');
    } catch {
      console.log('调试模式: ❌ 无法获取状态');
    }

    // 检查 OpenAI 配置
    try {
      const config = await fetch('http://127.0.0.1:12307/settings/openai/active');
      const configData = await config.json();
      console.log('OpenAI 配置:', configData.provider ? '✅ 已配置' : '❌ 未配置');
      if (configData.provider) {
        console.log('  Base URL:', configData.provider.baseUrl);
        console.log('  Model:', configData.provider.model);
      }
    } catch {
      console.log('OpenAI 配置: ❌ 无法获取配置');
    }
  },
};

// 自动类型声明
declare global {
  interface Window {
    __debug_settings__: {
      help: () => void;
      testApi: () => Promise<void>;
      testConnection: (apiKey?: string, baseUrl?: string, model?: string) => Promise<any>;
      checkStorage: () => void;
      mockSuccess: () => void;
      mockError: () => void;
      info: () => Promise<void>;
    };
  }
}
