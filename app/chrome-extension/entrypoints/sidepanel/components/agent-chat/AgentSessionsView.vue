<template>
  <div class="h-full flex flex-col" :style="containerStyle">
    <!-- Header: Back + Search + New Button -->
    <div class="flex-shrink-0 px-4 py-3 border-b" :style="headerStyle">
      <div class="flex items-center gap-2">
        <!-- Back to Main Page Button -->
        <button
          class="flex-shrink-0 p-2 cursor-pointer ac-btn"
          :style="{
            color: 'var(--ac-text-subtle)',
            borderRadius: 'var(--ac-radius-button)',
          }"
          title="返回主页"
          @click="$emit('back:home')"
        >
          <svg
            class="w-5 h-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a9 9 0 006.75-6.75M12 17.25a3 3 0 01-3-3v-4.5"
            />
          </svg>
        </button>

        <!-- Search Input -->
        <div class="flex-1 relative">
          <svg
            class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
            :style="{ color: 'var(--ac-text-subtle)' }"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Search sessions..."
            class="w-full pl-9 pr-3 py-2 text-sm"
            :style="inputStyle"
          />
        </div>

        <!-- New Session Button -->
        <button
          class="flex-shrink-0 px-3 py-2 text-sm font-medium cursor-pointer"
          :style="newButtonStyle"
          :disabled="isCreating"
          @click="handleNewSession"
        >
          <span v-if="isCreating">Creating...</span>
          <span v-else class="flex items-center gap-1">
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M12 4v16m8-8H4"
              />
            </svg>
            New
          </span>
        </button>

        <!-- Settings Button -->
        <button
          class="flex-shrink-0 p-2 cursor-pointer ac-btn"
          :style="{
            color: 'var(--ac-text-subtle)',
            borderRadius: 'var(--ac-radius-button)',
          }"
          title="OpenAI 配置"
          @click="$emit('open:settings')"
        >
          <svg
            class="w-5 h-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
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
        </button>
      </div>
    </div>

    <!-- Sessions List -->
    <div class="flex-1 overflow-y-auto ac-scroll">
      <!-- Loading State -->
      <div
        v-if="isLoading"
        class="flex items-center justify-center py-12"
        :style="{ color: 'var(--ac-text-muted)' }"
      >
        <span class="text-sm">Loading sessions...</span>
      </div>

      <!-- Empty State -->
      <div
        v-else-if="filteredSessions.length === 0"
        class="flex flex-col items-center justify-center py-12 px-4"
      >
        <div
          class="w-16 h-16 rounded-full flex items-center justify-center mb-4"
          :style="{ backgroundColor: 'var(--ac-surface-muted)' }"
        >
          <svg
            class="w-8 h-8"
            :style="{ color: 'var(--ac-text-subtle)' }"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="1.5"
              d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
            />
          </svg>
        </div>

        <!-- No search results -->
        <template v-if="searchQuery">
          <div class="text-sm font-medium mb-1" :style="{ color: 'var(--ac-text)' }">
            No matching sessions
          </div>
          <div class="text-xs text-center" :style="{ color: 'var(--ac-text-muted)' }">
            Try a different search term
          </div>
        </template>

        <!-- Has config but no sessions yet -->
        <template v-else-if="hasOpenAIConfig">
          <div class="text-sm font-medium mb-1" :style="{ color: 'var(--ac-text)' }">
            暂无会话
          </div>
          <div class="text-xs text-center mb-4" :style="{ color: 'var(--ac-text-muted)' }">
            使用 {{ configDisplayName }} 开始对话
          </div>
          <button
            class="px-4 py-2 text-sm font-medium cursor-pointer"
            :style="newButtonStyle"
            @click="handleNewSession"
          >
            创建新会话
          </button>
        </template>

        <!-- No config or using Native Server mode -->
        <template v-else>
          <div class="text-sm font-medium mb-1" :style="{ color: 'var(--ac-text)' }">
            暂无会话
          </div>
          <div class="text-xs text-center mb-4" :style="{ color: 'var(--ac-text-muted)' }">
            创建新会话开始对话
          </div>
          <button
            class="px-4 py-2 text-sm font-medium cursor-pointer"
            :style="newButtonStyle"
            @click="handleNewSession"
          >
            创建新会话
          </button>
        </template>
      </div>

      <!-- Session Items -->
      <div v-else>
        <AgentSessionListItem
          v-for="session in filteredSessions"
          :key="session.id"
          :session="session"
          :project-path="getProjectPath(session)"
          :selected="selectedSessionId === session.id"
          :is-running="isSessionRunning(session.id)"
          @click="handleSessionClick"
          @rename="handleSessionRename"
          @delete="handleSessionDelete"
          @open-project="handleSessionOpenProject"
        />
      </div>
    </div>

    <!-- Error Message (top-level, always visible) -->
    <div
      v-if="error"
      class="flex-shrink-0 px-4 py-2 text-xs border-t"
      :style="{
        color: 'var(--ac-danger)',
        backgroundColor: 'var(--ac-surface-muted)',
        borderColor: 'var(--ac-border)',
      }"
    >
      {{ error }}
    </div>
  </div>
</template>

<script lang="ts" setup>
import { ref, computed } from 'vue';
import type { AgentSession, AgentProject } from 'chrome-mcp-shared';
import AgentSessionListItem from './AgentSessionListItem.vue';

// =============================================================================
// Props & Emits
// =============================================================================

const props = defineProps<{
  sessions: AgentSession[];
  selectedSessionId: string;
  isLoading: boolean;
  isCreating: boolean;
  error: string | null;
  /**
   * Map of sessionId -> running status.
   * Used to display running badge on sessions with active executions.
   */
  runningSessionIds?: Set<string>;
  /**
   * Map of projectId -> AgentProject for looking up project paths.
   * Used to display project path for each session.
   */
  projectsMap?: Map<string, AgentProject>;
}>();

const emit = defineEmits<{
  'session:select': [sessionId: string];
  'session:new': [];
  'session:delete': [sessionId: string];
  'session:rename': [sessionId: string, name: string];
  'session:open-project': [sessionId: string];
  'open:settings': [];
  /** Navigate back to main extension page (workflows tab) */
  'back:home': [];
}>();

// =============================================================================
// Local State
// =============================================================================

const searchQuery = ref('');

// =============================================================================
// OpenAI Config Detection (reactive)
// =============================================================================

/**
 * Read the current OpenAI config from localStorage.
 * This is called reactively so the empty state updates when config changes.
 */
function readOpenAIConfig(): { baseUrl: string; model: string; enabled: boolean } | null {
  try {
    const saved = localStorage.getItem('openai_config');
    if (saved) {
      const data = JSON.parse(saved);
      if (data.baseUrl && data.apiKey) {
        return {
          baseUrl: data.baseUrl,
          model: data.model || 'gpt-4o',
          enabled: data.enabled ?? true,
        };
      }
    }
  } catch {
    // Ignore
  }
  return null;
}

/**
 * Derive provider display name from baseUrl.
 */
function getProviderFromBaseUrl(baseUrl: string): string {
  const url = baseUrl.toLowerCase();
  if (url.includes('dashscope') || url.includes('aliyun')) return '阿里云百炼';
  if (url.includes('openai.azure.com')) return 'Azure OpenAI';
  if (url.includes('localhost') || url.includes('127.0.0.1') || url.includes('11434'))
    return 'Ollama 本地';
  if (url.includes('api.openai.com')) return 'OpenAI 官方';
  if (url.includes('bigmodel') || url.includes('zhipu')) return '智谱';
  if (url.includes('moonshot') || url.includes('kimi')) return 'Kimi';
  if (url.includes('minimax')) return 'MiniMax';
  return '自定义';
}

const hasOpenAIConfig = computed(() => {
  const config = readOpenAIConfig();
  return config !== null && config.enabled;
});

const configDisplayName = computed(() => {
  const config = readOpenAIConfig();
  if (!config) return '';
  const provider = getProviderFromBaseUrl(config.baseUrl);
  return `${provider} / ${config.model}`;
});

/**
 * Filter sessions by search query.
 * Searches in: name, preview, model, engineName
 */
const filteredSessions = computed(() => {
  const query = searchQuery.value.toLowerCase().trim();
  if (!query) {
    // Sort by updatedAt descending (most recent first)
    return [...props.sessions].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
  }

  return props.sessions
    .filter((session) => {
      const searchFields = [
        session.name || '',
        session.preview || '',
        session.model || '',
        session.engineName || '',
      ]
        .join(' ')
        .toLowerCase();

      return searchFields.includes(query);
    })
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
});

// =============================================================================
// Computed: Styles
// =============================================================================

const containerStyle = computed(() => ({
  backgroundColor: 'var(--ac-surface)',
}));

const headerStyle = computed(() => ({
  borderColor: 'var(--ac-border)',
  backgroundColor: 'var(--ac-surface)',
}));

const inputStyle = computed(() => ({
  backgroundColor: 'var(--ac-surface-muted)',
  border: 'var(--ac-border-width) solid var(--ac-border)',
  borderRadius: 'var(--ac-radius-button)',
  color: 'var(--ac-text)',
  outline: 'none',
}));

const newButtonStyle = computed(() => ({
  backgroundColor: 'var(--ac-accent)',
  color: 'var(--ac-accent-contrast)',
  borderRadius: 'var(--ac-radius-button)',
}));

// =============================================================================
// Methods
// =============================================================================

function isSessionRunning(sessionId: string): boolean {
  return props.runningSessionIds?.has(sessionId) ?? false;
}

/**
 * Get the project root path for a session.
 */
function getProjectPath(session: AgentSession): string | undefined {
  return props.projectsMap?.get(session.projectId)?.rootPath;
}

function handleSessionClick(sessionId: string): void {
  emit('session:select', sessionId);
}

function handleNewSession(): void {
  emit('session:new');
}

function handleSessionRename(sessionId: string, name: string): void {
  emit('session:rename', sessionId, name);
}

function handleSessionDelete(sessionId: string): void {
  emit('session:delete', sessionId);
}

function handleSessionOpenProject(sessionId: string): void {
  emit('session:open-project', sessionId);
}
</script>
