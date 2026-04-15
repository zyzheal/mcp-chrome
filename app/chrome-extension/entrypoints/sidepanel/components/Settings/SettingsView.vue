<template>
  <div class="settings-container">
    <div class="settings-header">
      <button class="back-btn" @click="$emit('navigate:chat')" title="返回聊天">
        <svg viewBox="0 0 20 20" width="20" height="20" fill="currentColor">
          <path
            fill-rule="evenodd"
            d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z"
            clip-rule="evenodd"
          />
        </svg>
      </button>
      <h2 class="settings-title">设置</h2>
      <div class="back-btn-spacer"></div>
    </div>

    <div class="settings-content">
      <!-- 管理入口部分 -->
      <section class="settings-section management-section">
        <div class="management-card">
          <div class="management-icon-wrapper">
            <svg viewBox="0 0 24 24" width="32" height="32">
              <path
                fill="currentColor"
                d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
              />
            </svg>
          </div>
          <div class="management-content">
            <h3 class="management-title">智能助手</h3>
            <p class="management-desc">返回 AI Agent 对话与任务管理</p>
          </div>
          <button class="management-btn" @click="$emit('navigate:chat')">
            <span>进入智能助手</span>
            <svg viewBox="0 0 20 20" width="20" height="20" fill="currentColor">
              <path
                fill-rule="evenodd"
                d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
                clip-rule="evenodd"
              />
            </svg>
          </button>
        </div>
      </section>

      <!-- OpenAI 配置部分 -->
      <section class="settings-section">
        <div class="section-header">
          <div class="section-title-wrapper">
            <svg class="section-icon" viewBox="0 0 24 24" width="20" height="20">
              <path
                fill="currentColor"
                d="M12 2a10 10 0 1010 10A10 10 0 0012 2zm0 18a8 8 0 118-8 8 8 0 01-8 8z"
              />
              <circle cx="12" cy="12" r="3" fill="currentColor" />
            </svg>
            <h3 class="section-title">OpenAI 配置</h3>
          </div>
          <span
            class="status-badge"
            :class="{
              'status-success': isConnected && config.enabled,
              'status-warning': config.enabled && !isConnected && !configError,
              'status-error': !isConnected && configError,
            }"
          >
            {{
              config.enabled
                ? isConnected
                  ? '默认引擎'
                  : '默认 (未连接)'
                : isConnected
                  ? '已连接'
                  : configError
                    ? '未连接'
                    : '未测试'
            }}
          </span>
        </div>

        <form @submit.prevent="saveConfig" class="settings-form">
          <div class="form-row">
            <div class="form-field">
              <label class="field-label">
                API Key
                <span class="required">*</span>
              </label>
              <div class="input-wrapper">
                <input
                  v-model="config.apiKey"
                  :type="showApiKey ? 'text' : 'password'"
                  class="form-input"
                  placeholder="sk-..."
                  required
                />
                <button
                  type="button"
                  class="input-action-btn"
                  @click="showApiKey = !showApiKey"
                  title="显示/隐藏"
                >
                  <svg viewBox="0 0 24 24" width="18" height="18">
                    <path
                      fill="currentColor"
                      d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"
                    />
                  </svg>
                </button>
              </div>
            </div>
          </div>

          <div class="form-row">
            <div class="form-field">
              <label class="field-label">API Base URL</label>
              <input
                v-model="config.baseUrl"
                class="form-input"
                placeholder="https://api.openai.com/v1"
                type="url"
              />
              <p class="field-hint">支持 OpenAI 兼容的 API 端点</p>
            </div>
          </div>

          <div class="form-row form-row-inline">
            <div class="form-field">
              <label class="field-label">模型</label>
              <div class="select-wrapper">
                <select v-model="config.model" class="form-select">
                  <optgroup label="OpenAI">
                    <option value="gpt-4o">GPT-4o</option>
                    <option value="gpt-4o-mini">GPT-4o Mini</option>
                    <option value="gpt-4-turbo">GPT-4 Turbo</option>
                    <option value="gpt-4">GPT-4</option>
                    <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
                  </optgroup>
                  <optgroup label="通义千问">
                    <option value="qwen3.6-plus">Qwen 3.6 Plus</option>
                    <option value="qwen3.5-plus">Qwen 3.5 Plus</option>
                    <option value="qwen3-max-2026-01-23">Qwen 3 Max</option>
                    <option value="qwen3-coder-next">Qwen3 Coder Next</option>
                    <option value="qwen3-coder-plus">Qwen3 Coder Plus</option>
                  </optgroup>
                  <optgroup label="智谱">
                    <option value="glm-5">GLM-5</option>
                    <option value="glm-4.7">GLM-4.7</option>
                  </optgroup>
                  <optgroup label="Kimi">
                    <option value="kimi-k2.5">Kimi K2.5</option>
                  </optgroup>
                  <optgroup label="MiniMax">
                    <option value="MiniMax-M2.5">MiniMax M2.5</option>
                  </optgroup>
                  <option value="custom">自定义模型</option>
                </select>
              </div>
            </div>

            <div class="form-field" v-if="config.model === 'custom'">
              <label class="field-label">自定义模型名称</label>
              <input
                v-model="customModel"
                class="form-input"
                placeholder="例如: claude-sonnet-4-20250514"
              />
            </div>

            <div class="form-field" v-else>
              <label class="field-label">Max Tokens</label>
              <input
                v-model.number="config.maxTokens"
                class="form-input"
                type="number"
                min="1"
                max="128000"
              />
            </div>
          </div>

          <div class="form-row" v-if="config.model === 'custom'">
            <div class="form-field">
              <label class="field-label">Max Tokens</label>
              <input
                v-model.number="config.maxTokens"
                class="form-input"
                type="number"
                min="1"
                max="128000"
              />
            </div>
          </div>

          <div class="form-row form-row-inline">
            <div class="form-field">
              <label class="field-label">Temperature</label>
              <input
                v-model.number="config.temperature"
                class="form-input"
                type="number"
                min="0"
                max="2"
                step="0.1"
              />
            </div>

            <div class="form-field">
              <label class="field-label">Organization</label>
              <input v-model="config.organization" class="form-input" placeholder="可选" />
            </div>
          </div>

          <div class="form-row form-row-toggle">
            <div class="form-field">
              <label class="field-label toggle-label">
                <span class="toggle-name">作为聊天默认引擎</span>
                <span class="toggle-desc"
                  >开启后创建会话时直接调用此 API，不走本地 Claude 服务器</span
                >
              </label>
              <label class="switch">
                <input v-model="config.enabled" type="checkbox" />
                <span class="slider"></span>
              </label>
            </div>
          </div>

          <div class="form-row form-row-toggle" v-if="config.enabled">
            <div class="form-field">
              <label class="field-label toggle-label">
                <div>
                  <span class="toggle-name">仅文本返回模式</span>
                  <span class="toggle-desc">开启后只返回 AI 文本，不调用浏览器扩展工具</span>
                </div>
              </label>
              <label class="switch">
                <input v-model="config.textOnlyMode" type="checkbox" />
                <span class="slider"></span>
              </label>
            </div>
          </div>

          <div class="form-row form-row-toggle" v-if="config.enabled && !config.textOnlyMode">
            <div class="form-field">
              <label class="field-label toggle-label">
                <div>
                  <span class="toggle-name">需要工具时提示启动 Native Server</span>
                  <span class="toggle-desc">检测到需要使用扩展工具时，提示先启动本地 MCP 服务</span>
                </div>
              </label>
              <label class="switch">
                <input v-model="config.promptForNativeServer" type="checkbox" />
                <span class="slider"></span>
              </label>
            </div>
          </div>

          <div class="form-actions">
            <button
              type="button"
              class="btn btn-secondary"
              @click="testConnection"
              :disabled="testing"
            >
              <svg v-if="testing" class="spinner" viewBox="0 0 24 24" width="16" height="16">
                <circle
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  stroke-width="3"
                  fill="none"
                  stroke-dasharray="31.4 31.4"
                >
                  <animateTransform
                    attributeName="transform"
                    type="rotate"
                    from="0 12 12"
                    to="360 12 12"
                    dur="1s"
                    repeatCount="indefinite"
                  />
                </circle>
              </svg>
              {{ testing ? '测试中...' : '测试连接' }}
            </button>
            <button type="submit" class="btn btn-primary" :disabled="saving">
              {{ saving ? '保存中...' : '保存配置' }}
            </button>
          </div>

          <!-- 测试结果显示 -->
          <div
            v-if="testResult"
            class="test-result"
            :class="testResult.success ? 'success' : 'error'"
          >
            <svg
              v-if="testResult.success"
              class="result-icon"
              viewBox="0 0 24 24"
              width="18"
              height="18"
            >
              <path fill="currentColor" d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
            </svg>
            <svg v-else class="result-icon" viewBox="0 0 24 24" width="18" height="18">
              <path
                fill="currentColor"
                d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"
              />
            </svg>
            <span>{{ testResult.message }}</span>
          </div>
        </form>
      </section>

      <!-- 调试模式部分 -->
      <section class="settings-section">
        <div class="section-header">
          <div class="section-title-wrapper">
            <svg class="section-icon" viewBox="0 0 24 24" width="20" height="20">
              <path
                fill="currentColor"
                d="M20 8h-2.81c-.45-.78-1.07-1.45-1.82-1.96L17 4.41 15.59 3l-2.17 2.17C12.96 5.06 12.49 5 12 5c-.49 0-.96.06-1.41.17L8.41 3 7 4.41l1.62 1.63C7.88 6.55 7.26 7.22 6.81 8H4v2h2.09c-.05.33-.09.66-.09 1v1H4v2h2v1c0 .34.04.67.09 1H4v2h2.81c1.04 1.79 2.97 3 5.19 3s4.15-1.21 5.19-3H20v-2h-2.09c.05-.33.09-.66.09-1v-1h2v-2h-2v-1c0-.34-.04-.67-.09-1H20V8zm-6 8h-4v-2h4v2zm0-4h-4v-2h4v2z"
              />
            </svg>
            <h3 class="section-title">调试模式</h3>
          </div>
          <label class="switch">
            <input v-model="debugMode.enabled" type="checkbox" @change="toggleDebugMode" />
            <span class="slider"></span>
          </label>
        </div>

        <div class="debug-info">
          <p class="info-text">
            <svg class="info-icon" viewBox="0 0 24 24" width="16" height="16">
              <path
                fill="currentColor"
                d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"
              />
            </svg>
            启用调试模式后，本地 Claude 可以直接与插件通信，无需完整认证。
          </p>
          <p class="info-warning">
            <svg class="warning-icon" viewBox="0 0 24 24" width="16" height="16">
              <path fill="currentColor" d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" />
            </svg>
            仅在开发环境使用，生产环境请保持关闭！
          </p>
        </div>

        <div v-if="debugMode.enabled" class="debug-status">
          <div class="status-row">
            <span class="status-label">状态:</span>
            <span class="status-value status-active">运行中</span>
          </div>
          <div v-if="debugMode.expiresAt" class="status-row">
            <span class="status-label">剩余时间:</span>
            <span class="status-value">{{ debugMode.countdown }}</span>
          </div>
          <div class="status-row">
            <span class="status-label">Token:</span>
            <code class="token-code">{{ debugMode.token || 'debug-token' }}</code>
          </div>
          <button class="btn btn-secondary btn-sm" @click="copyDebugInfo"> 复制调试信息 </button>
        </div>
      </section>

      <!-- 预设配置 -->
      <section class="settings-section">
        <div class="section-header">
          <h3 class="section-title">预设配置</h3>
        </div>
        <div class="preset-list">
          <button
            v-for="preset in presets"
            :key="preset.id"
            class="preset-item"
            @click="applyPreset(preset)"
          >
            <div class="preset-icon-wrapper">
              <svg class="preset-icon" viewBox="0 0 24 24" width="18" height="18">
                <path fill="currentColor" :d="preset.icon" />
              </svg>
            </div>
            <div class="preset-content">
              <div class="preset-name">{{ preset.name }}</div>
              <div class="preset-url">{{ preset.baseUrl }}</div>
            </div>
            <svg
              v-if="config.baseUrl === preset.baseUrl"
              class="check-icon"
              viewBox="0 0 24 24"
              width="18"
              height="18"
            >
              <path fill="currentColor" d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
            </svg>
          </button>
        </div>
      </section>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';

const emit = defineEmits<{
  'navigate:chat': [];
}>();

interface OpenAIConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  maxTokens: number;
  temperature: number;
  organization: string;
  /** Whether to use this as the default chat engine (skip native server) */
  enabled: boolean;
  /** Text-only mode: return AI response without calling browser extension tools */
  textOnlyMode: boolean;
  /** Prompt user to start Native Server when tools are needed */
  promptForNativeServer: boolean;
}

interface TestResult {
  success: boolean;
  message: string;
}

interface Preset {
  id: string;
  name: string;
  baseUrl: string;
  icon: string;
}

// 状态
const config = ref<OpenAIConfig>({
  apiKey: '',
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-4o',
  maxTokens: 4096,
  temperature: 0.7,
  organization: '',
  enabled: true,
  textOnlyMode: false,
  promptForNativeServer: true,
});

const customModel = ref('');

const showApiKey = ref(false);
const testing = ref(false);
const saving = ref(false);
const testResult = ref<TestResult | null>(null);
const configError = ref<string | null>(null);
const isConnected = ref(false);

// 调试模式
const debugMode = ref({
  enabled: false,
  token: 'debug-token',
  expiresAt: 0,
  countdown: '',
  countdownInterval: null as number | null,
});

// 预设配置
const presets: Preset[] = [
  {
    id: 'dashscope',
    name: '阿里云百炼',
    baseUrl: 'https://coding.dashscope.aliyuncs.com/v1',
    icon: 'M13 3v2H5v14h14V9h2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h8zm4 1l4 4h-4V4z',
  },
  {
    id: 'openai',
    name: 'OpenAI 官方',
    baseUrl: 'https://api.openai.com/v1',
    icon: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z',
  },
  {
    id: 'azure',
    name: 'Azure OpenAI',
    baseUrl: 'https://{resource}.openai.azure.com/openai/deployments/{deployment}',
    icon: 'M2.7.6C4.5 2.3 6.4 2 8 2c1.7 0 4.9.5 6.8 2.9.2.3.4.6.5.9 1.2-.4 3.8-1 5.9.8 2.3 2 2.9 5.2 1.4 7.8-.6 1-1.4 1.6-2.6 2.3v2.6c0 .8-.5 1.4-1.4 1.4H2.7c-.9 0-1.4-.6-1.4-1.4V2C1.3 1.2 1.9.6 2.7.6z',
  },
  {
    id: 'ollama',
    name: 'Ollama 本地',
    baseUrl: 'http://localhost:11434/v1',
    icon: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z',
  },
];

// 计算属性
const isConnectedComputed = computed(() => isConnected.value);

// 获取服务器端口（从 background 获取实际运行端口）
async function getServerPort(): Promise<number | null> {
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'get_server_status',
    });
    if (response?.serverStatus?.port) {
      return response.serverStatus.port;
    }
  } catch {
    // Ignore
  }
  return 12306; // Fallback default
}

async function loadConfig() {
  try {
    const saved = localStorage.getItem('openai_config');
    if (saved) {
      const data = JSON.parse(saved);
      config.value = {
        ...config.value,
        ...data,
      };
      // Restore custom model if it was a non-preset value
      const presetModels = [
        'gpt-4o',
        'gpt-4o-mini',
        'gpt-4-turbo',
        'gpt-4',
        'gpt-3.5-turbo',
        'qwen3.6-plus',
        'qwen3.5-plus',
        'qwen3-max-2026-01-23',
        'qwen3-coder-next',
        'qwen3-coder-plus',
        'glm-5',
        'glm-4.7',
        'kimi-k2.5',
        'MiniMax-M2.5',
        'custom',
      ];
      if (!presetModels.includes(config.value.model)) {
        customModel.value = config.value.model;
        config.value.model = 'custom';
      }
    }
  } catch (error) {
    console.warn('Failed to load config from localStorage:', error);
  }
}

const resolvedModel = computed(() =>
  config.value.model === 'custom' ? customModel.value || 'gpt-4o' : config.value.model,
);

async function testConnection() {
  if (!config.value.apiKey) {
    testResult.value = { success: false, message: '请输入 API Key' };
    return;
  }

  testing.value = true;
  testResult.value = null;
  configError.value = null;

  const baseUrl = config.value.baseUrl.replace(/\/+$/, '');
  const model = resolvedModel.value;

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.value.apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'Hello' }],
        max_tokens: 1,
      }),
    });

    const data = await response.json();

    if (response.ok && data.choices?.length > 0) {
      testResult.value = { success: true, message: `连接成功！模型：${data.model || model}` };
      isConnected.value = true;
    } else {
      testResult.value = {
        success: false,
        message: data.error?.message || data.error || `请求失败 (${response.status})`,
      };
      isConnected.value = false;
      configError.value = data.error?.message || data.error || '连接失败';
    }
  } catch (error) {
    testResult.value = {
      success: false,
      message: error instanceof Error ? error.message : '连接失败，请检查网络或配置',
    };
    isConnected.value = false;
    configError.value = '连接失败';
  } finally {
    testing.value = false;
  }
}

async function saveConfig() {
  saving.value = true;
  testResult.value = null;

  try {
    // Save to localStorage (primary storage)
    localStorage.setItem(
      'openai_config',
      JSON.stringify({
        ...config.value,
        model: resolvedModel.value,
      }),
    );

    // Attempt to save to native server (best-effort, non-blocking)
    const port = await getServerPort();
    if (port) {
      try {
        await fetch(`http://127.0.0.1:${port}/settings/openai/save`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            baseUrl: config.value.baseUrl,
            apiKey: config.value.apiKey,
            model: resolvedModel.value,
            maxTokens: config.value.maxTokens,
            temperature: config.value.temperature,
            organization: config.value.organization,
          }),
        });
      } catch {
        // Server may not be running, config is still saved to localStorage
        // User can restart server to pick up the config
      }
    }

    testResult.value = { success: true, message: '配置已保存' };
  } catch (error) {
    testResult.value = {
      success: false,
      message: error instanceof Error ? error.message : '保存失败',
    };
  } finally {
    saving.value = false;
  }
}

async function toggleDebugMode() {
  const port = await getServerPort();
  if (!port) return;

  if (debugMode.value.enabled) {
    // Enable debug mode
    try {
      const response = await fetch(`http://127.0.0.1:${port}/debug/enable`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: debugMode.value.token }),
      });

      const data = await response.json();
      if (data.enabled) {
        debugMode.value.expiresAt = data.expiresAt;
        startCountdown();
      } else {
        debugMode.value.enabled = false;
      }
    } catch (error) {
      console.error('Failed to enable debug mode:', error);
      debugMode.value.enabled = false;
    }
  } else {
    // Disable debug mode
    try {
      await fetch(`http://127.0.0.1:${port}/debug/disable`, { method: 'POST' });
    } catch (error) {
      console.error('Failed to disable debug mode:', error);
    }
    stopCountdown();
  }
}

function startCountdown() {
  stopCountdown();
  debugMode.value.countdownInterval = window.setInterval(() => {
    if (!debugMode.value.expiresAt) return;

    const now = Date.now();
    const diff = debugMode.value.expiresAt - now;

    if (diff <= 0) {
      debugMode.value.enabled = false;
      stopCountdown();
      return;
    }

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);

    debugMode.value.countdown = `${hours}h ${minutes}m ${seconds}s`;
  }, 1000);
}

function stopCountdown() {
  if (debugMode.value.countdownInterval) {
    clearInterval(debugMode.value.countdownInterval);
    debugMode.value.countdownInterval = null;
  }
}

async function copyDebugInfo() {
  const port = await getServerPort();
  const info = `Debug Mode Enabled
Token: ${debugMode.value.token}
Expires: ${debugMode.value.countdown}
Server: http://127.0.0.1:${port || 12306}`;

  navigator.clipboard.writeText(info);
}

function applyPreset(preset: Preset) {
  config.value.baseUrl = preset.baseUrl;
}

// 生命周期
onMounted(() => {
  loadConfig();
});

onUnmounted(() => {
  stopCountdown();
});
</script>

<style scoped>
/* Settings Container */
.settings-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--ac-surface, #ffffff);
}

.settings-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: var(--ac-border-width, 1px) solid var(--ac-border, #e7e5e4);
  background: var(--ac-surface, #ffffff);
}

.back-btn {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  border-radius: var(--ac-radius-button, 8px);
  color: var(--ac-text, #262626);
  cursor: pointer;
  transition: all var(--ac-motion-fast, 150ms) ease;
  flex-shrink: 0;
}

.back-btn:hover {
  background: var(--ac-hover-bg, #f5f5f5);
}

.back-btn-spacer {
  width: 36px;
  flex-shrink: 0;
}

.settings-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--ac-text, #1a1a1a);
  margin: 0;
}

.settings-content {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

/* Section */
.settings-section {
  background: var(--ac-surface, #ffffff);
  border: var(--ac-border-width, 1px) solid var(--ac-border, #e7e5e4);
  border-radius: var(--ac-radius-card, 12px);
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: var(--ac-border-width, 1px) solid var(--ac-border, #e7e5e4);
  background: var(--ac-surface-muted, #f9f9f9);
}

.section-title-wrapper {
  display: flex;
  align-items: center;
  gap: 10px;
}

.section-icon {
  color: var(--ac-text-muted, #737373);
  flex-shrink: 0;
}

.section-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--ac-text, #262626);
  margin: 0;
}

.status-badge {
  font-size: 12px;
  padding: 4px 10px;
  border-radius: 12px;
  font-weight: 500;
  background: var(--ac-surface-muted, #f5f5f5);
  color: var(--ac-text-muted, #737373);
}

.status-success {
  background: var(--ac-success-subtle, rgba(34, 197, 94, 0.12));
  color: var(--ac-success, #22c55e);
}

.status-error {
  background: var(--ac-danger-subtle, rgba(239, 68, 68, 0.12));
  color: var(--ac-danger, #ef4444);
}

.status-warning {
  background: var(--ac-warning-subtle, rgba(245, 158, 11, 0.12));
  color: var(--ac-warning, #f59e0b);
}

/* Settings Form */
.settings-form {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.form-row {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.form-row-inline {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.form-row-toggle {
  display: flex;
  align-items: center;
}

.form-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.toggle-label {
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
}

.toggle-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--ac-text, #262626);
}

.toggle-desc {
  display: block;
  font-size: 11px;
  font-weight: 400;
  color: var(--ac-text-muted, #737373);
  margin-top: 2px;
}

.field-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--ac-text, #262626);
  display: flex;
  align-items: center;
  gap: 4px;
}

.required {
  color: var(--ac-danger, #ef4444);
  font-size: 14px;
}

.input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.form-input {
  width: 100%;
  height: 44px;
  padding: 0 16px;
  background: var(--ac-surface-muted, #f5f5f5);
  border: 1px solid transparent;
  border-radius: var(--ac-radius-inner, 10px);
  font-size: 14px;
  color: var(--ac-text, #262626);
  font-family: inherit;
  outline: none;
  transition: all var(--ac-motion-fast, 150ms) ease;
}

.form-input:focus {
  background: var(--ac-surface, #ffffff);
  border-color: var(--ac-accent, #d97757);
  box-shadow: 0 0 0 3px var(--ac-accent-subtle, rgba(217, 119, 87, 0.15));
}

.form-input::placeholder {
  color: var(--ac-text-muted, #a3a3a3);
}

.input-action-btn {
  position: absolute;
  right: 8px;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  border-radius: var(--ac-radius-button, 6px);
  color: var(--ac-text-muted, #737373);
  cursor: pointer;
  transition: all var(--ac-motion-fast, 150ms) ease;
}

.input-action-btn:hover {
  background: var(--ac-hover-bg, rgba(0, 0, 0, 0.05));
  color: var(--ac-text, #262626);
}

.form-input[type='number'] {
  -moz-appearance: textfield;
}

.form-input[type='number']::-webkit-outer-spin-button,
.form-input[type='number']::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.field-hint {
  font-size: 12px;
  color: var(--ac-text-subtle, #a3a3a3);
  margin-top: 2px;
}

/* Select */
.select-wrapper {
  position: relative;
}

.form-select {
  width: 100%;
  height: 44px;
  padding: 0 40px 0 16px;
  background: var(--ac-surface-muted, #f5f5f5);
  border: 1px solid transparent;
  border-radius: var(--ac-radius-inner, 10px);
  font-size: 14px;
  color: var(--ac-text, #262626);
  font-family: inherit;
  outline: none;
  cursor: pointer;
  appearance: none;
  transition: all var(--ac-motion-fast, 150ms) ease;
}

.form-select:focus {
  background: var(--ac-surface, #ffffff);
  border-color: var(--ac-accent, #d97757);
  box-shadow: 0 0 0 3px var(--ac-accent-subtle, rgba(217, 119, 87, 0.15));
}

.select-wrapper::after {
  content: '';
  position: absolute;
  right: 12px;
  top: 50%;
  transform: translateY(-50%);
  width: 0;
  height: 0;
  border-left: 5px solid transparent;
  border-right: 5px solid transparent;
  border-top: 6px solid var(--ac-text-subtle, #737373);
  pointer-events: none;
}

.form-select optgroup {
  color: var(--ac-text, #262626);
  font-weight: 500;
}

.form-select option {
  padding: 4px 8px;
}

/* Form Actions */
.form-actions {
  display: flex;
  gap: 12px;
  padding-top: 8px;
}

.btn {
  flex: 1;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: none;
  border-radius: var(--ac-radius-button, 10px);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all var(--ac-motion-fast, 150ms) ease;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-secondary {
  background: var(--ac-surface-muted, #f5f5f5);
  color: var(--ac-text, #262626);
}

.btn-secondary:hover:not(:disabled) {
  background: var(--ac-hover-bg, #e5e5e5);
}

.btn-primary {
  background: var(--ac-accent, #d97757);
  color: var(--ac-accent-contrast, #ffffff);
}

.btn-primary:hover:not(:disabled) {
  background: var(--ac-accent-hover, #c4664a);
  box-shadow: var(--ac-shadow-float, 0 4px 12px rgba(0, 0, 0, 0.15));
}

.btn-sm {
  height: 36px;
  font-size: 13px;
}

/* Spinner */
.spinner {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

/* Test Result */
.test-result {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  border-radius: var(--ac-radius-inner, 8px);
  font-size: 14px;
  margin-top: 8px;
}

.test-result.success {
  background: var(--ac-success-subtle, rgba(34, 197, 94, 0.1));
  color: var(--ac-success, #22c55e);
  border: 1px solid var(--ac-success-subtle, rgba(34, 197, 94, 0.2));
}

.test-result.error {
  background: var(--ac-danger-subtle, rgba(239, 68, 68, 0.1));
  color: var(--ac-danger, #ef4444);
  border: 1px solid var(--ac-danger-subtle, rgba(239, 68, 68, 0.2));
}

.result-icon {
  flex-shrink: 0;
}

/* Debug Info */
.debug-info {
  padding: 16px 20px;
  background: var(--ac-surface-muted, #f5f5f5);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.info-text,
.info-warning {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  margin: 0;
}

.info-text {
  color: var(--ac-text, #262626);
}

.info-warning {
  color: var(--ac-danger, #ef4444);
}

.info-icon,
.warning-icon {
  flex-shrink: 0;
}

.info-icon {
  color: var(--ac-accent, #d97757);
}

.warning-icon {
  color: var(--ac-danger, #ef4444);
}

/* Debug Status */
.debug-status {
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.status-row {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 13px;
}

.status-label {
  color: var(--ac-text-muted, #737373);
  font-weight: 500;
}

.status-value {
  color: var(--ac-text, #262626);
  font-family: var(--ac-font-mono, 'Monaco', 'Menlo', 'Ubuntu Mono', monospace);
}

.status-value.status-active {
  color: var(--ac-success, #22c55e);
  font-weight: 600;
}

.token-code {
  background: var(--ac-surface-muted, #f5f5f5);
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  color: var(--ac-text, #262626);
}

/* Switch */
.switch {
  position: relative;
  display: inline-block;
  width: 48px;
  height: 26px;
}

.switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.slider {
  position: absolute;
  cursor: pointer;
  inset: 0;
  background: var(--ac-surface-muted, #d4d4d4);
  border-radius: 26px;
  transition: all var(--ac-motion-fast, 150ms) ease;
}

.slider:before {
  position: absolute;
  content: '';
  height: 20px;
  width: 20px;
  left: 3px;
  bottom: 3px;
  background: var(--ac-surface, #ffffff);
  border-radius: 50%;
  transition: all var(--ac-motion-fast, 150ms) ease;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
}

input:checked + .slider {
  background: var(--ac-accent, #d97757);
}

input:checked + .slider:before {
  transform: translateX(22px);
}

/* Preset List */
.preset-list {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.preset-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: var(--ac-surface-muted, #f5f5f5);
  border: 1px solid transparent;
  border-radius: var(--ac-radius-inner, 10px);
  cursor: pointer;
  transition: all var(--ac-motion-fast, 150ms) ease;
  text-align: left;
}

.preset-item:hover {
  background: var(--ac-hover-bg, #e5e5e5);
  border-color: var(--ac-border, #e7e5e4);
}

.preset-icon-wrapper {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--ac-surface, #ffffff);
  border-radius: var(--ac-radius-button, 8px);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
}

.preset-icon {
  color: var(--ac-text-muted, #737373);
}

.preset-content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.preset-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--ac-text, #262626);
}

.preset-url {
  font-size: 12px;
  color: var(--ac-text-muted, #737373);
  font-family: var(--ac-font-mono, 'Monaco', 'Menlo', 'Ubuntu Mono', monospace);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.check-icon {
  color: var(--ac-success, #22c55e);
  flex-shrink: 0;
}

/* Scrollbar */
.settings-content::-webkit-scrollbar {
  width: 6px;
}

.settings-content::-webkit-scrollbar-track {
  background: transparent;
}

.settings-content::-webkit-scrollbar-thumb {
  background: var(--ac-border, #e5e5e5);
  border-radius: 3px;
}

.settings-content::-webkit-scrollbar-thumb:hover {
  background: var(--ac-text-muted, #a3a3a3);
}

/* Management Section */
.management-section {
  margin-bottom: 12px;
}

.management-card {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 20px;
  background: linear-gradient(
    135deg,
    var(--ac-accent-subtle, rgba(217, 119, 87, 0.15)) 0%,
    var(--ac-surface-muted, #f5f5f5) 100%
  );
  border: 1px solid var(--ac-border, #e7e5e4);
  border-radius: var(--ac-radius-card, 12px);
}

.management-icon-wrapper {
  width: 56px;
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--ac-accent, #d97757);
  border-radius: var(--ac-radius-button, 12px);
  color: var(--ac-accent-contrast, #ffffff);
  flex-shrink: 0;
  box-shadow: 0 4px 12px rgba(217, 119, 87, 0.3);
}

.management-content {
  flex: 1;
  min-width: 0;
}

.management-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--ac-text, #1a1a1a);
  margin: 0 0 4px 0;
}

.management-desc {
  font-size: 13px;
  color: var(--ac-text-muted, #737373);
  margin: 0;
}

.management-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 20px;
  background: var(--ac-accent, #d97757);
  border: none;
  border-radius: var(--ac-radius-button, 10px);
  color: var(--ac-accent-contrast, #ffffff);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all var(--ac-motion-fast, 150ms) ease;
  white-space: nowrap;
}

.management-btn:hover {
  background: var(--ac-accent-hover, #c4664a);
  transform: translateX(2px);
  box-shadow: 0 4px 12px rgba(217, 119, 87, 0.4);
}

.management-btn span {
  flex: 1;
}
</style>
