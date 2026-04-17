<template>
  <div class="mode-indicator relative" ref="rootRef">
    <!-- Status button -->
    <button
      type="button"
      class="mode-btn text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1 transition-colors"
      :class="{
        'cursor-pointer hover:opacity-80': canSwitch,
      }"
      :style="buttonStyle"
      :title="tooltipText"
      @click="toggleMenu"
    >
      <span
        class="mode-dot inline-block w-1.5 h-1.5 rounded-full"
        :style="{ backgroundColor: dotColor }"
      />
      <span class="truncate max-w-[80px]">{{ modeLabel }}</span>
      <svg
        v-if="needsTools && !nativeServerReady"
        class="w-2.5 h-2.5 animate-pulse flex-shrink-0"
        :style="{ color: dotColor }"
        fill="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"
        />
      </svg>
    </button>

    <!-- Switch menu -->
    <Teleport :to="teleportTarget" :disabled="!teleportTarget">
      <Transition name="mode-menu">
        <div
          v-if="showMenu"
          class="absolute bottom-full left-0 mb-1 min-w-[200px] rounded-lg shadow-lg overflow-hidden z-50"
          :style="{
            backgroundColor: 'var(--ac-surface, #fff)',
            border: '1px solid var(--ac-border, #e0e0e0)',
          }"
          @click.stop
        >
          <!-- Warning banner -->
          <div
            v-if="needsTools && !nativeServerReady"
            class="px-3 py-2 text-xs"
            :style="{
              backgroundColor: 'var(--ac-warning-subtle, #fef3c7)',
              color: 'var(--ac-warning, #92400e)',
            }"
          >
            检测到需要浏览器操作，请选择模式：
          </div>

          <!-- Option 1: Native Server -->
          <button
            type="button"
            class="w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-gray-50"
            :style="{ color: 'var(--ac-text, #333)' }"
            @click="selectMode('native')"
          >
            <span
              class="w-2 h-2 rounded-full flex-shrink-0"
              :style="{ backgroundColor: nativeServerReady ? '#22c55e' : '#d1d5db' }"
            />
            <div class="flex flex-col items-start">
              <span class="font-medium">{{
                nativeServerReady ? 'Native Server' : '启动 Native Server'
              }}</span>
              <span class="text-xs opacity-60">完整浏览器工具支持</span>
            </div>
            <svg
              v-if="useNativeServer"
              class="w-4 h-4 ml-auto flex-shrink-0"
              :style="{ color: 'var(--ac-accent, #c87941)' }"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M5 13l4 4L19 7"
              />
            </svg>
          </button>

          <!-- Option 2: OpenAI Direct -->
          <button
            v-if="hasOpenAIConfig"
            type="button"
            class="w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-gray-50"
            :style="{ color: 'var(--ac-text, #333)' }"
            @click="selectMode('openai')"
          >
            <span
              class="w-2 h-2 rounded-full flex-shrink-0"
              :style="{ backgroundColor: '#3b82f6' }"
            />
            <div class="flex flex-col items-start">
              <span class="font-medium">OpenAI 直连</span>
              <span class="text-xs opacity-60">{{
                textOnlyMode ? '仅文本模式' : '支持 OpenAI 工具调用'
              }}</span>
            </div>
            <svg
              v-if="!useNativeServer"
              class="w-4 h-4 ml-auto flex-shrink-0"
              :style="{ color: 'var(--ac-accent, #c87941)' }"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M5 13l4 4L19 7"
              />
            </svg>
          </button>

          <!-- Option: Go to settings if no OpenAI config -->
          <button
            v-if="!hasOpenAIConfig && !nativeServerReady"
            type="button"
            class="w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-gray-50"
            :style="{ color: 'var(--ac-text-muted, #888)' }"
            @click="goToSettings"
          >
            <svg
              class="w-4 h-4 flex-shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              stroke-width="2"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
              />
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
            <span>去配置 OpenAI API</span>
          </button>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script lang="ts" setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';

// Props
const props = defineProps<{
  /** User input text */
  inputText: string;
  /** Whether Native Server is ready (SSE connected) */
  nativeServerReady: boolean;
  /** Whether OpenAI config exists */
  hasOpenAIConfig: boolean;
  /** Whether currently using Native Server mode (false = OpenAI direct) */
  useNativeServer: boolean;
  /** OpenAI text-only mode setting */
  textOnlyMode: boolean;
}>();

// Emits
const emit = defineEmits<{
  'mode:switch': [mode: 'native' | 'openai'];
  'navigate:settings': [];
}>();

// State
const showMenu = ref(false);
const rootRef = ref<HTMLElement | null>(null);
const teleportTarget = ref<string | null>(null);

// =============================================================================
// Tool keyword detection
// =============================================================================

const TOOL_KEYWORDS = [
  '点击',
  'click',
  '打开',
  'open',
  '导航',
  'navigate',
  '填充',
  'fill',
  '输入',
  'type',
  '选择',
  'select',
  '截图',
  'screenshot',
  '滚动',
  'scroll',
  '标签页',
  'tab',
  '窗口',
  'window',
  '浏览器',
  'browser',
  '网页',
  'page',
  '元素',
  'element',
  '总结',
  'summarize',
  '提取',
  'extract',
  '翻译',
  'translate',
  '分析',
  'analyze',
  '内容',
  'content',
  '信息',
  'information',
  '查找',
  'find',
  '搜索',
  'search',
];

const needsTools = computed(() => {
  if (!props.inputText.trim()) return false;
  const lower = props.inputText.toLowerCase();
  return TOOL_KEYWORDS.some((keyword) => lower.includes(keyword));
});

// =============================================================================
// Display logic
// =============================================================================

const modeLabel = computed(() => {
  if (props.useNativeServer) {
    if (props.nativeServerReady) return 'Native';
    return '未连接';
  }
  return 'OpenAI';
});

const dotColor = computed(() => {
  if (props.useNativeServer) {
    if (props.nativeServerReady) return '#22c55e';
    if (needsTools.value) return '#ef4444';
    return '#d1d5db';
  }
  if (needsTools.value && !props.textOnlyMode) return '#f59e0b';
  return '#3b82f6';
});

const buttonStyle = computed(() => ({
  color: 'var(--ac-text-muted)',
  fontFamily: 'var(--ac-font-mono)',
  backgroundColor: showMenu.value ? 'var(--ac-surface-muted)' : 'transparent',
}));

const tooltipText = computed(() => {
  if (props.useNativeServer) {
    if (props.nativeServerReady) return '使用 Native Server 模式（完整浏览器工具）';
    if (needsTools.value) return 'Native Server 未连接，但当前指令需要浏览器工具';
    return 'Native Server 未连接';
  }
  if (needsTools.value && !props.textOnlyMode)
    return '当前使用 OpenAI 直连，但指令可能需要浏览器工具';
  return '使用 OpenAI 直连模式';
});

const canSwitch = computed(() => {
  return !props.nativeServerReady || (props.hasOpenAIConfig && props.useNativeServer);
});

// =============================================================================
// Menu handling
// =============================================================================

function toggleMenu(): void {
  if (canSwitch.value) {
    showMenu.value = !showMenu.value;
  }
}

function selectMode(mode: 'native' | 'openai'): void {
  showMenu.value = false;
  emit('mode:switch', mode);
}

function goToSettings(): void {
  showMenu.value = false;
  emit('navigate:settings');
}

function handleClickOutside(e: MouseEvent): void {
  if (rootRef.value && !rootRef.value.contains(e.target as Node)) {
    showMenu.value = false;
  }
}

// =============================================================================
// Lifecycle
// =============================================================================

onMounted(() => {
  document.addEventListener('click', handleClickOutside);
  // Find a stable teleport target
  const agentTheme = rootRef.value?.closest('.agent-theme') as HTMLElement | null;
  const bodyEl = rootRef.value?.ownerDocument?.body;
  teleportTarget.value =
    agentTheme?.id && agentTheme.id.length > 0
      ? agentTheme.id
      : bodyEl?.id && bodyEl.id.length > 0
        ? bodyEl.id
        : 'body';
});

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside);
});

// Close menu when input changes (debounced)
watch(
  () => props.inputText,
  () => {
    showMenu.value = false;
  },
);
</script>

<style scoped>
.mode-menu-enter-active,
.mode-menu-leave-active {
  transition:
    opacity 0.15s ease,
    transform 0.15s ease;
}

.mode-menu-enter-from,
.mode-menu-leave-to {
  opacity: 0;
  transform: translateY(4px);
}
</style>
