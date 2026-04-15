<template>
  <div
    ref="wrapperRef"
    class="navigator-wrapper"
    :style="wrapperStyle"
    :class="{ 'navigator-dragging': isDragging }"
  >
    <!-- 触发按钮（同时作为拖拽手柄） -->
    <button
      ref="triggerRef"
      class="navigator-trigger"
      :class="{ 'navigator-trigger-active': isOpen }"
      @click="handleTriggerClick"
      @dblclick="resetToDefault"
      title="切换页面（可拖拽移动，双击重置位置）"
    >
      <svg
        class="navigator-icon"
        viewBox="0 0 24 24"
        width="20"
        height="20"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 12h16M4 18h16" />
      </svg>
    </button>

    <!-- 浮层菜单 -->
    <Transition name="navigator-menu">
      <div v-if="isOpen" class="navigator-overlay" @click="closeMenu">
        <div class="navigator-menu" :style="menuStyle" @click.stop>
          <div class="navigator-header">
            <span class="navigator-title">切换页面</span>
            <!-- MCP Connection Status Indicator -->
            <div class="navigator-status" :title="statusText">
              <span class="navigator-status-dot" :class="statusClass"></span>
              <span class="navigator-status-text">{{ statusText }}</span>
            </div>
            <button class="navigator-close" @click="closeMenu">
              <svg
                viewBox="0 0 24 24"
                width="18"
                height="18"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div class="navigator-items">
            <button
              class="navigator-item"
              :class="{ 'navigator-item-active': activeTab === 'workflows' }"
              @click="selectTab('workflows')"
            >
              <div class="navigator-item-icon">
                <svg
                  viewBox="0 0 24 24"
                  width="20"
                  height="20"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z"
                  />
                </svg>
              </div>
              <div class="navigator-item-content">
                <span class="navigator-item-title">工作流管理</span>
                <span class="navigator-item-desc">录制与回放自动化流程</span>
              </div>
              <div v-if="activeTab === 'workflows'" class="navigator-item-check">
                <svg
                  viewBox="0 0 24 24"
                  width="16"
                  height="16"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.5"
                >
                  <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
            </button>
            <button
              class="navigator-item"
              :class="{ 'navigator-item-active': activeTab === 'settings' }"
              @click="selectTab('settings')"
            >
              <div class="navigator-item-icon">
                <svg
                  viewBox="0 0 24 24"
                  width="20"
                  height="20"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                  />
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                </svg>
              </div>
              <div class="navigator-item-content">
                <span class="navigator-item-title">设置</span>
                <span class="navigator-item-desc">API 配置与调试</span>
              </div>
              <div v-if="activeTab === 'settings'" class="navigator-item-check">
                <svg
                  viewBox="0 0 24 24"
                  width="16"
                  height="16"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.5"
                >
                  <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
            </button>
            <button
              class="navigator-item"
              :class="{ 'navigator-item-active': activeTab === 'agent-chat' }"
              @click="selectTab('agent-chat')"
            >
              <div class="navigator-item-icon">
                <svg
                  viewBox="0 0 24 24"
                  width="20"
                  height="20"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                  />
                </svg>
              </div>
              <div class="navigator-item-content">
                <span class="navigator-item-title">智能助手</span>
                <span class="navigator-item-desc">AI Agent 对话与任务</span>
              </div>
              <div v-if="activeTab === 'agent-chat'" class="navigator-item-check">
                <svg
                  viewBox="0 0 24 24"
                  width="16"
                  height="16"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.5"
                >
                  <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
            </button>
            <button
              class="navigator-item"
              :class="{ 'navigator-item-active': activeTab === 'element-markers' }"
              @click="selectTab('element-markers')"
            >
              <div class="navigator-item-icon">
                <svg
                  viewBox="0 0 24 24"
                  width="20"
                  height="20"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"
                  />
                </svg>
              </div>
              <div class="navigator-item-content">
                <span class="navigator-item-title">元素标注管理</span>
                <span class="navigator-item-desc">管理页面元素标注</span>
              </div>
              <div v-if="activeTab === 'element-markers'" class="navigator-item-check">
                <svg
                  viewBox="0 0 24 24"
                  width="16"
                  height="16"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.5"
                >
                  <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script lang="ts" setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useFloatingDrag } from '../composables/useFloatingDrag';
import { BACKGROUND_MESSAGE_TYPES } from '@/common/message-types';

type TabType = 'workflows' | 'settings' | 'agent-chat' | 'element-markers';

const BUTTON_SIZE = 36;
const CLAMP_MARGIN = 12;

const props = defineProps<{
  activeTab: TabType;
}>();

const emit = defineEmits<{
  (e: 'change', tab: TabType): void;
}>();

const isOpen = ref(false);
const wrapperRef = ref<HTMLElement | null>(null);
const triggerRef = ref<HTMLElement | null>(null);

// MCP Connection state
const isServerReady = ref(false);
const nativeConnected = ref(false);
const httpServerRunning = ref(false);

// Poll for connection status
async function fetchConnectionStatus() {
  try {
    const res: any = await chrome.runtime.sendMessage({
      type: BACKGROUND_MESSAGE_TYPES.GET_AGENT_STATUS,
    });
    if (res?.success) {
      isServerReady.value = res.isServerReady ?? false;
      nativeConnected.value = res.nativeConnected ?? false;
      // Also check if HTTP server is running by pinging the endpoint
      const port = res.serverPort || 12306;
      try {
        const pingResponse = await fetch(`http://127.0.0.1:${port}/ping`, {
          method: 'GET',
          headers: { Accept: 'application/json' },
        });
        httpServerRunning.value = pingResponse.ok;
      } catch {
        httpServerRunning.value = false;
      }
    }
  } catch {
    isServerReady.value = false;
    nativeConnected.value = false;
    httpServerRunning.value = false;
  }
}

const statusClass = computed(() => {
  if (isServerReady.value) return 'status-ready';
  if (httpServerRunning.value && !nativeConnected.value) return 'status-warning';
  if (nativeConnected.value) return 'status-connecting';
  return 'status-disconnected';
});

const statusText = computed(() => {
  if (isServerReady.value) return 'MCP 已连接';
  if (httpServerRunning.value && !nativeConnected.value) return 'HTTP 服务运行中，Native 未连接';
  if (nativeConnected.value) return '连接中...';
  return '未连接';
});

let statusInterval: number | null = null;

onMounted(async () => {
  await fetchConnectionStatus();
  statusInterval = window.setInterval(fetchConnectionStatus, 5000);
});

onUnmounted(() => {
  if (statusInterval) {
    clearInterval(statusInterval);
  }
});

// Initialize floating drag
const { positionStyle, isDragging, resetToDefault } = useFloatingDrag(triggerRef, wrapperRef, {
  clampMargin: CLAMP_MARGIN,
  clickThresholdMs: 150,
  moveThresholdPx: 5,
  getDefaultPosition: () => ({
    left: window.innerWidth - BUTTON_SIZE - CLAMP_MARGIN,
    top: window.innerHeight - BUTTON_SIZE - CLAMP_MARGIN,
  }),
});

// Wrapper style with dynamic position
const wrapperStyle = computed(() => ({
  left: positionStyle.value.left,
  top: positionStyle.value.top,
}));

// Menu position: prefer appearing above and to the left of the trigger
const menuStyle = computed(() => {
  // Menu appears in fixed position near the trigger
  return {};
});

function handleTriggerClick() {
  // Only toggle menu if not currently dragging
  if (!isDragging.value) {
    isOpen.value = !isOpen.value;
  }
}

function closeMenu() {
  isOpen.value = false;
}

function selectTab(tab: TabType) {
  emit('change', tab);
  closeMenu();
}
</script>

<style scoped>
.navigator-wrapper {
  position: fixed;
  z-index: 1000;
  touch-action: none;
}

.navigator-dragging {
  cursor: grabbing;
}

.navigator-trigger {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--ac-surface, #ffffff);
  border: var(--ac-border-width, 1px) solid var(--ac-border, #e7e5e4);
  border-radius: var(--ac-radius-button, 8px);
  color: var(--ac-text-muted, #6e6e6e);
  cursor: grab;
  transition: all var(--ac-motion-fast, 120ms) ease;
  box-shadow: var(--ac-shadow-card, 0 1px 3px rgba(0, 0, 0, 0.08));
  touch-action: none;
  user-select: none;
}

.navigator-trigger:hover {
  background: var(--ac-hover-bg, #f5f5f4);
  color: var(--ac-text, #1a1a1a);
  box-shadow: var(--ac-shadow-float, 0 4px 20px -2px rgba(0, 0, 0, 0.05));
}

.navigator-trigger:active,
.navigator-dragging .navigator-trigger {
  cursor: grabbing;
}

.navigator-trigger-active {
  background: var(--ac-accent, #d97757);
  color: var(--ac-accent-contrast, #ffffff);
  border-color: var(--ac-accent, #d97757);
}

.navigator-trigger-active:hover {
  background: var(--ac-accent-hover, #c4664a);
  color: var(--ac-accent-contrast, #ffffff);
}

.navigator-icon {
  flex-shrink: 0;
  pointer-events: none;
}

.navigator-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.3);
  display: flex;
  align-items: flex-end;
  justify-content: flex-end;
  padding: 12px;
}

.navigator-menu {
  width: 280px;
  max-height: calc(100vh - 80px);
  background: var(--ac-surface, #ffffff);
  border: var(--ac-border-width, 1px) solid var(--ac-border, #e7e5e4);
  border-radius: var(--ac-radius-card, 12px);
  box-shadow: var(--ac-shadow-float, 0 4px 20px -2px rgba(0, 0, 0, 0.05));
  overflow: hidden;
}

.navigator-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: var(--ac-border-width, 1px) solid var(--ac-border, #e7e5e4);
  gap: 8px;
}

.navigator-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--ac-text, #1a1a1a);
}

/* Connection Status Indicator */
.navigator-status {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  background: var(--ac-surface-muted, #f5f5f5);
  border-radius: var(--ac-radius-button, 6px);
}

.navigator-status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  transition: background-color var(--ac-motion-fast, 120ms) ease;
}

.navigator-status-dot.status-ready {
  background: var(--ac-success, #22c55e);
  box-shadow: 0 0 6px var(--ac-success, rgba(34, 197, 94, 0.5));
}

.navigator-status-dot.status-connecting {
  background: var(--ac-warning, #f59e0b);
  box-shadow: 0 0 6px var(--ac-warning, rgba(245, 158, 11, 0.5));
}

.navigator-status-dot.status-warning {
  background: var(--ac-warning, #f59e0b);
  box-shadow: 0 0 6px var(--ac-warning, rgba(245, 158, 11, 0.5));
}

.navigator-status-dot.status-disconnected {
  background: var(--ac-text-subtle, #a8a29e);
}

.navigator-status-text {
  font-size: 11px;
  font-weight: 500;
  color: var(--ac-text-muted, #6e6e6e);
  white-space: nowrap;
}

.navigator-close {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  border-radius: var(--ac-radius-button, 8px);
  color: var(--ac-text-muted, #6e6e6e);
  cursor: pointer;
  transition: all var(--ac-motion-fast, 120ms) ease;
}

.navigator-close:hover {
  background: var(--ac-hover-bg, #f5f5f4);
  color: var(--ac-text, #1a1a1a);
}

.navigator-items {
  padding: 8px;
}

.navigator-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: transparent;
  border: none;
  border-radius: var(--ac-radius-inner, 8px);
  cursor: pointer;
  transition: all var(--ac-motion-fast, 120ms) ease;
  text-align: left;
}

.navigator-item:hover {
  background: var(--ac-hover-bg, #f5f5f4);
}

.navigator-item-active {
  background: var(--ac-accent-subtle, rgba(217, 119, 87, 0.12));
}

.navigator-item-active:hover {
  background: var(--ac-accent-subtle, rgba(217, 119, 87, 0.12));
}

.navigator-item-icon {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--ac-surface-muted, #f2f0eb);
  border-radius: var(--ac-radius-button, 8px);
  color: var(--ac-text-muted, #6e6e6e);
  flex-shrink: 0;
}

.navigator-item-active .navigator-item-icon {
  background: var(--ac-accent, #d97757);
  color: var(--ac-accent-contrast, #ffffff);
}

.navigator-item-content {
  flex: 1;
  min-width: 0;
}

.navigator-item-title {
  display: block;
  font-size: 14px;
  font-weight: 500;
  color: var(--ac-text, #1a1a1a);
  line-height: 1.3;
}

.navigator-item-desc {
  display: block;
  font-size: 12px;
  color: var(--ac-text-subtle, #a8a29e);
  line-height: 1.3;
  margin-top: 2px;
}

.navigator-item-check {
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--ac-accent, #d97757);
  flex-shrink: 0;
}

/* Transition animations */
.navigator-menu-enter-active,
.navigator-menu-leave-active {
  transition: opacity var(--ac-motion-fast, 120ms) ease;
}

.navigator-menu-enter-active .navigator-menu,
.navigator-menu-leave-active .navigator-menu {
  transition:
    transform var(--ac-motion-fast, 120ms) ease,
    opacity var(--ac-motion-fast, 120ms) ease;
}

.navigator-menu-enter-from,
.navigator-menu-leave-to {
  opacity: 0;
}

.navigator-menu-enter-from .navigator-menu,
.navigator-menu-leave-to .navigator-menu {
  opacity: 0;
  transform: translateY(8px);
}
</style>
