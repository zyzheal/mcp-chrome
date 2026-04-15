<template>
  <div class="agent-theme relative h-full" :data-agent-theme="themeState.theme.value">
    <!-- Sessions List View -->
    <template v-if="viewRoute.isSessionsView.value">
      <AgentSessionsView
        :sessions="sessions.allSessions.value"
        :selected-session-id="sessions.selectedSessionId.value"
        :is-loading="sessions.isLoadingAllSessions.value"
        :is-creating="sessions.isCreatingSession.value"
        :error="sessions.sessionError.value"
        :running-session-ids="runningSessionIds"
        :projects-map="projectsMap"
        @session:select="handleSessionSelectAndNavigate"
        @session:new="handleNewSessionAndNavigate"
        @session:delete="handleDeleteSession"
        @session:rename="handleRenameSession"
        @session:open-project="handleSessionOpenProject"
        @open:settings="handleOpenAISettings"
        @back:home="handleBackHome"
      />
    </template>

    <!-- Chat Conversation View -->
    <template v-else>
      <AgentChatShell
        :error-message="activeChat.errorMessage.value"
        :usage="activeChat.lastUsage.value"
        :footer-label="useDirectOpenAI ? 'OpenAI' : `${engineDisplayName} Preview`"
        @error:dismiss="activeChat.errorMessage.value = null"
      >
        <!-- Header -->
        <template #header>
          <AgentTopBar
            :project-label="projectLabel"
            :session-label="sessionLabel"
            :connection-state="connectionState"
            :show-back-button="true"
            :brand-label="engineDisplayName"
            @toggle:project-menu="toggleProjectMenu"
            @toggle:session-menu="toggleSessionMenu"
            @toggle:settings-menu="toggleSettingsMenu"
            @toggle:open-project-menu="toggleOpenProjectMenu"
            @back="handleBackToSessions"
          />
        </template>

        <!-- Content -->
        <template #content>
          <AgentConversation :threads="threadState.threads.value" />
        </template>

        <!-- Composer -->
        <template #composer>
          <!-- Web Editor Changes Chips -->
          <WebEditorChanges />

          <AgentComposer
            :model-value="activeChat.input.value"
            :attachments="attachments.attachments.value"
            :attachment-error="attachments.error.value"
            :is-drag-over="attachments.isDragOver.value"
            :is-streaming="activeChat.isStreaming.value"
            :request-state="activeChat.requestState.value"
            :sending="activeChat.sending.value"
            :cancelling="activeChat.cancelling.value"
            :can-cancel="!!activeChat.currentRequestId.value"
            :can-send="activeChat.canSend.value"
            :placeholder="useDirectOpenAI ? 'Ask AI...' : 'Ask Claude to write code...'"
            :engine-name="currentEngineName"
            :selected-model="currentSessionModel"
            :available-models="currentAvailableModels"
            :reasoning-effort="currentReasoningEffort"
            :available-reasoning-efforts="currentAvailableReasoningEfforts"
            :enable-fake-caret="inputPreferences.fakeCaretEnabled.value"
            @update:model-value="activeChat.input.value = $event"
            @submit="handleSend"
            @cancel="activeChat.cancelCurrentRequest()"
            @attachment:add="handleAttachmentAdd"
            @attachment:remove="attachments.removeAttachment"
            @attachment:drop="attachments.handleDrop"
            @attachment:paste="attachments.handlePaste"
            @attachment:dragover="attachments.handleDragOver"
            @attachment:dragleave="attachments.handleDragLeave"
            @model:change="handleComposerModelChange"
            @reasoning-effort:change="handleComposerReasoningEffortChange"
            @session:settings="handleComposerOpenSettings"
            @session:reset="handleComposerReset"
          />
        </template>
      </AgentChatShell>
    </template>

    <!-- Click-outside handler for menus (z-40) -->
    <div
      v-if="projectMenuOpen || sessionMenuOpen || settingsMenuOpen || openProjectMenuOpen"
      class="fixed inset-0 z-40"
      @click="closeMenus"
    />

    <!-- Dropdown menus (z-50, outside stacking context) -->
    <AgentProjectMenu
      :open="projectMenuOpen"
      :projects="projects.projects.value"
      :selected-project-id="projects.selectedProjectId.value"
      :selected-cli="selectedCli"
      :model="model"
      :reasoning-effort="reasoningEffort"
      :use-ccr="useCcr"
      :enable-chrome-mcp="enableChromeMcp"
      :engines="server.engines.value"
      :is-picking="isPickingDirectory"
      :is-saving="isSavingPreference"
      :error="projects.projectError.value"
      @project:select="handleProjectSelect"
      @project:new="handleNewProject"
      @cli:update="selectedCli = $event"
      @model:update="model = $event"
      @reasoning-effort:update="reasoningEffort = $event"
      @ccr:update="useCcr = $event"
      @chrome-mcp:update="enableChromeMcp = $event"
      @save="handleSaveSettings"
    />

    <AgentSessionMenu
      :open="sessionMenuOpen"
      :sessions="sessions.sessions.value"
      :selected-session-id="sessions.selectedSessionId.value"
      :is-loading="sessions.isLoadingSessions.value"
      :is-creating="sessions.isCreatingSession.value"
      :error="sessions.sessionError.value"
      @session:select="handleSessionSelect"
      @session:new="handleNewSession"
      @session:delete="handleDeleteSession"
      @session:rename="handleRenameSession"
    />

    <AgentSettingsMenu
      :open="settingsMenuOpen"
      :theme="themeState.theme.value"
      :fake-caret-enabled="inputPreferences.fakeCaretEnabled.value"
      @theme:set="handleThemeChange"
      @reconnect="handleReconnect"
      @attachments:open="handleOpenAttachmentCache"
      @fake-caret:toggle="handleFakeCaretToggle"
      @openai:settings="handleOpenAISettings"
    />

    <AgentOpenProjectMenu
      :open="openProjectMenuOpen"
      :default-target="openProjectPreference.defaultTarget.value"
      @select="handleOpenProjectSelect"
      @close="closeOpenProjectMenu"
    />

    <!-- Session Settings Panel -->
    <AgentSessionSettingsPanel
      :open="sessionSettingsOpen"
      :session="sessions.selectedSession.value"
      :management-info="currentManagementInfo"
      :is-loading="sessionSettingsLoading"
      :is-saving="sessionSettingsSaving"
      @close="handleCloseSessionSettings"
      @save="handleSaveSessionSettings"
    />

    <!-- Attachment Cache Panel -->
    <AttachmentCachePanel :open="attachmentCacheOpen" @close="handleCloseAttachmentCache" />
  </div>
</template>

<script lang="ts" setup>
import { ref, computed, onMounted, onUnmounted, watch, provide } from 'vue';
import type { AgentStoredMessage, AgentMessage, CodexReasoningEffort } from 'chrome-mcp-shared';

// Composables
import {
  useAgentServer,
  useAgentChat,
  useOpenAIChat,
  useStandaloneAgent,
  useAttachments,
  useAgentTheme,
  useAgentThreads,
  useWebEditorTxState,
  useAgentChatViewRoute,
  useOpenProjectPreference,
  useAgentInputPreferences,
  WEB_EDITOR_TX_STATE_INJECTION_KEY,
  AGENT_SERVER_PORT_KEY,
  type AgentThemeId,
} from '../composables';
import type { OpenProjectTarget } from 'chrome-mcp-shared';

// New UI Components
import {
  AgentChatShell,
  AgentTopBar,
  AgentComposer,
  WebEditorChanges,
  AgentConversation,
  AgentProjectMenu,
  AgentSessionMenu,
  AgentSettingsMenu,
  AgentSessionSettingsPanel,
  AgentSessionsView,
  AgentOpenProjectMenu,
} from './agent-chat';
import type { SessionSettings } from './agent-chat/AgentSessionSettingsPanel.vue';
import AttachmentCachePanel from './agent-chat/AttachmentCachePanel.vue';

// Model utilities
import {
  getModelsForCli,
  getCodexReasoningEfforts,
  getDefaultModelForCli,
} from '@/common/agent-models';
import { BACKGROUND_MESSAGE_TYPES } from '@/common/message-types';

// Emits
const emit = defineEmits<{
  'navigate:settings': [];
  'back:home': [];
}>();

// Local UI state
const selectedCli = ref('');
const model = ref('');
const reasoningEffort = ref<CodexReasoningEffort>('medium');
const useCcr = ref(false);
const enableChromeMcp = ref(true);
const isSavingPreference = ref(false);

/**
 * Get normalized model value that is valid for the current CLI.
 * Returns empty string if:
 * - No CLI selected (use server default)
 * - Model is invalid for selected CLI
 */
function getNormalizedModel(): string {
  const trimmedModel = model.value.trim();
  if (!trimmedModel) return '';
  // No CLI selected = don't override model, let server use default
  if (!selectedCli.value) return '';
  const models = getModelsForCli(selectedCli.value);
  if (models.length === 0) return ''; // Unknown CLI
  const isValid = models.some((m) => m.id === trimmedModel);
  return isValid ? trimmedModel : '';
}

/**
 * Get normalized reasoning effort that is valid for the current model.
 * Used when creating/updating codex sessions.
 */
function getNormalizedReasoningEffort(): CodexReasoningEffort {
  if (selectedCli.value !== 'codex') return 'medium';
  const effectiveModel = getNormalizedModel() || getDefaultModelForCli('codex');
  const supported = getCodexReasoningEfforts(effectiveModel);
  return supported.includes(reasoningEffort.value)
    ? reasoningEffort.value
    : (supported[supported.length - 1] as CodexReasoningEffort);
}

const isPickingDirectory = ref(false);
const projectMenuOpen = ref(false);
const sessionMenuOpen = ref(false);
const settingsMenuOpen = ref(false);
const openProjectMenuOpen = ref(false);

// Track if sessions have been synced to server (to avoid duplicate syncs)
const sessionsSyncedToServer = ref(false);

// Open project context: which session/project to open when menu selects
const openProjectContext = ref<{ type: 'session' | 'project'; id: string } | null>(null);

// Session settings panel state
const sessionSettingsOpen = ref(false);
const sessionSettingsLoading = ref(false);
const sessionSettingsSaving = ref(false);
const currentManagementInfo = ref<import('chrome-mcp-shared').AgentManagementInfo | null>(null);

// Attachment cache panel state
const attachmentCacheOpen = ref(false);

// Initialize composables - use standalone agent for project/session management (no server dependency)
const agent = useStandaloneAgent();

// Server and chat composables (only used when server is available for AI chat)
// =============================================================================
// Chat: Server-based (native server)
// =============================================================================

const server = useAgentServer({
  getSessionId: () => agent.selectedSessionId.value,
  onMessage: (event) => chat.handleRealtimeEvent(event),
  onError: (error) => {
    chat.errorMessage.value = error;
  },
});

const chat = useAgentChat({
  getServerPort: () => server.serverPort.value,
  getSessionId: () => agent.selectedSessionId.value,
  ensureServer: () => server.ensureNativeServer(),
  openEventSource: () => server.openEventSource(),
});

// =============================================================================
// Chat: Standalone OpenAI (direct API, no native server)
// =============================================================================

const openaiChat = useOpenAIChat({
  getConfig: getSavedOpenAIConfig,
  getSessionId: () => agent.selectedSessionId.value,
  persistMessage: (msg) => {
    // Persist messages via standalone agent's storage
    agent.addChatMessage(msg);
  },
  loadSessionHistory: async () => {
    const stored = agent.getChatMessages();
    const sessionId = agent.selectedSessionId.value;
    return stored
      .filter((m) => m.sessionId === sessionId)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  },
});

// =============================================================================
// Determine which chat mode to use
// =============================================================================

/**
 * Whether to use direct OpenAI API (no native server).
 * Only use direct mode when:
 * 1. OpenAI config exists and is enabled, AND
 * 2. Server is not ready (neither via Native Messaging nor HTTP)
 */
const useDirectOpenAI = computed(() => {
  const config = getSavedOpenAIConfig();
  // If no OpenAI config or disabled, use MCP mode (default)
  if (!config) return false;
  if (!config.enabled) return false;
  // If server is ready (via Native Messaging or HTTP), use MCP mode
  if (server.isServerReady.value) return false;
  // Server not ready - use direct OpenAI API
  return true;
});

/**
 * Active chat composable - switches between server-based and direct OpenAI.
 */
const activeChat = computed(() => {
  return useDirectOpenAI.value ? openaiChat : chat;
});

// Alias standalone state to match existing code patterns
const projects = agent;
const sessions = agent;
const projectsMap = computed(() => {
  return new Map(projects.projects.value.map((p) => [p.id, p] as const));
});

const attachments = useAttachments();
const themeState = useAgentTheme();
const openProjectPreference = useOpenProjectPreference({
  getServerPort: () => server.serverPort.value,
});
const inputPreferences = useAgentInputPreferences();

// Initialize Web Editor TX state at root level and provide to children
// This prevents duplicate listener registration in child components
const webEditorTxState = useWebEditorTxState();
provide(WEB_EDITOR_TX_STATE_INJECTION_KEY, webEditorTxState);

// Provide server port for child components to build attachment URLs
provide(AGENT_SERVER_PORT_KEY, server.serverPort);

// View routing (sessions list vs chat conversation)
const viewRoute = useAgentChatViewRoute();

// Track running sessions for badge display
const runningSessionIds = computed(() => {
  // For now, only track current session's running state
  // Could be extended to track multiple sessions via background broadcast
  const currentId = sessions.selectedSessionId.value;
  // Use isRequestActive instead of isStreaming to correctly show running badge
  // even during tool execution when isStreaming might be false
  if (currentId && chat.isRequestActive.value) {
    return new Set([currentId]);
  }
  return new Set<string>();
});

// Thread state for grouping messages
// Use a computed that switches between chat and openaiChat based on active mode
const threadMessages = computed(() => activeChat.value.messages.value);
const threadRequestState = computed(() => activeChat.value.requestState.value);
const threadCurrentRequestId = computed(() => activeChat.value.currentRequestId.value);

const threadState = useAgentThreads({
  messages: threadMessages,
  requestState: threadRequestState,
  currentRequestId: threadCurrentRequestId,
});

// Computed values
const projectLabel = computed(() => {
  const project = projects.selectedProject.value;
  return project?.name ?? 'No project';
});

const sessionLabel = computed(() => {
  const session = sessions.selectedSession.value;
  // Priority: preview (first user message) > name > 'New Session'
  return session?.preview || session?.name || 'New Session';
});

const connectionState = computed(() => {
  if (server.isServerReady.value) return 'ready';
  const openaiConfig = getSavedOpenAIConfig();
  if (openaiConfig !== null && openaiConfig.enabled) return 'ready'; // OpenAI config is available and enabled
  if (server.nativeConnected.value) return 'connecting';
  return 'disconnected';
});

// Computed values for AgentComposer
const currentEngineName = computed(() => sessions.selectedSession.value?.engineName ?? '');

// Engine display name for brand/footer
const engineDisplayName = computed(() => {
  const name = currentEngineName.value;
  switch (name) {
    case 'claude':
      return 'Claude Code';
    case 'codex':
      return 'Codex';
    case 'cursor':
      return 'Cursor';
    case 'qwen':
      return 'Qwen';
    case 'glm':
      return 'GLM';
    default:
      return 'Agent';
  }
});

const currentSessionModel = computed(() => {
  const session = sessions.selectedSession.value;
  if (!session) return '';
  // Use session model if set, otherwise use default for the engine
  return session.model || getDefaultModelForCli(session.engineName);
});

const currentAvailableModels = computed(() => {
  const session = sessions.selectedSession.value;
  if (!session) return [];
  return getModelsForCli(session.engineName);
});

const currentReasoningEffort = computed(() => {
  const session = sessions.selectedSession.value;
  if (!session || session.engineName !== 'codex') return 'medium' as CodexReasoningEffort;
  return session.optionsConfig?.codexConfig?.reasoningEffort ?? 'medium';
});

const currentAvailableReasoningEfforts = computed(() => {
  const session = sessions.selectedSession.value;
  if (!session || session.engineName !== 'codex') return [] as readonly CodexReasoningEffort[];
  const effectiveModel = currentSessionModel.value || getDefaultModelForCli('codex');
  return getCodexReasoningEfforts(effectiveModel);
});

// Track pending history load with nonce to prevent A→B→A race conditions
let historyLoadNonce = 0;

/**
 * Load chat history for a specific session with race-condition protection.
 * Uses a nonce to handle A→B→A scenarios where older requests for the same
 * session could return after newer ones.
 */
async function loadSessionHistory(sessionId: string): Promise<void> {
  const serverPort = server.serverPort.value;
  if (!serverPort || !sessionId) return;

  // Increment nonce for this load - any subsequent load will invalidate this one
  const myNonce = ++historyLoadNonce;

  /**
   * Check if this load is still valid.
   * Validates both the nonce (handles A→B→A) and current selection (handles switches).
   */
  const isStillValid = (): boolean => {
    return myNonce === historyLoadNonce && sessions.selectedSessionId.value === sessionId;
  };

  try {
    const url = `http://127.0.0.1:${serverPort}/agent/sessions/${encodeURIComponent(sessionId)}/history`;
    const response = await fetch(url);

    if (!isStillValid()) return;

    if (response.ok) {
      const data = await response.json();

      // Re-check after json parsing (parsing can be slow for large histories)
      if (!isStillValid()) return;

      const messages = data.messages || [];
      const converted = convertStoredMessages(messages);
      chat.setMessages(converted);
    } else {
      if (!isStillValid()) return;
      chat.setMessages([]);
    }
  } catch (error) {
    if (isStillValid()) {
      console.error('Failed to load session history:', error);
      chat.setMessages([]);
    }
  }
}

// Convert stored messages to AgentMessage format
function convertStoredMessages(stored: AgentStoredMessage[]): AgentMessage[] {
  return stored.map((m) => ({
    id: m.id,
    sessionId: m.sessionId,
    role: m.role,
    content: m.content,
    messageType: m.messageType,
    cliSource: m.cliSource ?? undefined,
    requestId: m.requestId,
    createdAt: m.createdAt ?? new Date().toISOString(),
    metadata: m.metadata,
  }));
}

/**
 * Clear streaming/request state when switching sessions.
 * Prevents stale cancel targets and running badges from carrying over.
 */
function clearRequestState(): void {
  // Clear both chat providers to handle mode switching
  chat.currentRequestId.value = null;
  chat.isStreaming.value = false;
  chat.requestState.value = 'idle';
  openaiChat.currentRequestId.value = null;
  openaiChat.isStreaming.value = false;
  openaiChat.requestState.value = 'idle';
}

// Menu handlers
function toggleProjectMenu(): void {
  projectMenuOpen.value = !projectMenuOpen.value;
  if (projectMenuOpen.value) {
    sessionMenuOpen.value = false;
    settingsMenuOpen.value = false;
    openProjectMenuOpen.value = false;
  }
}

function toggleSessionMenu(): void {
  sessionMenuOpen.value = !sessionMenuOpen.value;
  if (sessionMenuOpen.value) {
    projectMenuOpen.value = false;
    settingsMenuOpen.value = false;
    openProjectMenuOpen.value = false;
  }
}

function toggleSettingsMenu(): void {
  settingsMenuOpen.value = !settingsMenuOpen.value;
  if (settingsMenuOpen.value) {
    projectMenuOpen.value = false;
    sessionMenuOpen.value = false;
    openProjectMenuOpen.value = false;
  }
}

function toggleOpenProjectMenu(): void {
  openProjectMenuOpen.value = !openProjectMenuOpen.value;
  if (openProjectMenuOpen.value) {
    projectMenuOpen.value = false;
    sessionMenuOpen.value = false;
    settingsMenuOpen.value = false;
    // Set context to current session from chat view
    const sessionId = sessions.selectedSessionId.value;
    if (sessionId) {
      openProjectContext.value = { type: 'session', id: sessionId };
    }
  } else {
    openProjectContext.value = null;
  }
}

function closeOpenProjectMenu(): void {
  openProjectMenuOpen.value = false;
  openProjectContext.value = null;
}

/**
 * Handle session list item's open-project button click.
 * If user has a default preference, open directly; otherwise show menu.
 */
async function handleSessionOpenProject(sessionId: string): Promise<void> {
  const defaultTarget = openProjectPreference.defaultTarget.value;
  if (defaultTarget) {
    // User has default preference, open directly
    const result = await openProjectPreference.openBySession(sessionId, defaultTarget);
    if (!result.success) {
      alert(`Failed to open project: ${result.error}`);
    }
  } else {
    // No default, show menu
    openProjectContext.value = { type: 'session', id: sessionId };
    openProjectMenuOpen.value = true;
    projectMenuOpen.value = false;
    sessionMenuOpen.value = false;
    settingsMenuOpen.value = false;
  }
}

/**
 * Handle open project menu selection.
 * Saves preference and opens the project.
 */
async function handleOpenProjectSelect(target: OpenProjectTarget): Promise<void> {
  // Snapshot context before any await to prevent race condition
  // (close event may clear context while we're awaiting)
  const ctx = openProjectContext.value;

  // Close menu immediately for better UX
  closeOpenProjectMenu();

  if (!ctx) return;

  // Save as default preference (non-blocking for UX)
  void openProjectPreference.saveDefaultTarget(target);

  // Execute open action based on context
  let result;
  if (ctx.type === 'session') {
    result = await openProjectPreference.openBySession(ctx.id, target);
  } else {
    result = await openProjectPreference.openByProject(ctx.id, target);
  }

  if (!result.success) {
    alert(`Failed to open project: ${result.error}`);
  }
}

function closeMenus(): void {
  projectMenuOpen.value = false;
  sessionMenuOpen.value = false;
  settingsMenuOpen.value = false;
  openProjectMenuOpen.value = false;
  openProjectContext.value = null;
}

// Theme handler
async function handleThemeChange(theme: AgentThemeId): Promise<void> {
  await themeState.setTheme(theme);
  closeMenus();
}

// Fake caret toggle handler
async function handleFakeCaretToggle(enabled: boolean): Promise<void> {
  await inputPreferences.setFakeCaretEnabled(enabled);
}

// Server reconnect
async function handleReconnect(): Promise<void> {
  closeMenus();
  await server.reconnect();
}

// Attachment cache handlers
function handleOpenAttachmentCache(): void {
  attachmentCacheOpen.value = true;
  sessionSettingsOpen.value = false;
  closeMenus();
}

function handleCloseAttachmentCache(): void {
  attachmentCacheOpen.value = false;
}

// OpenAI Settings handler - navigate to settings tab
function handleOpenAISettings(): void {
  closeMenus();
  emit('navigate:settings');
}

// Session handlers
async function handleSessionSelect(sessionId: string): Promise<void> {
  await sessions.selectSession(sessionId);
  // Note: URL sync is handled by onSessionChanged callback
  closeMenus();
}

async function handleNewSession(): Promise<void> {
  const projectId = projects.selectedProjectId.value;
  if (!projectId) {
    console.error('[AgentChat] No project selected, cannot create session');
    return;
  }

  // Clear previous request state (in chat view, creating new session should reset state)
  clearRequestState();

  const engineName =
    (selectedCli.value as 'claude' | 'codex' | 'cursor' | 'qwen' | 'glm') || 'claude';

  // Include codex config if using codex engine
  const optionsConfig =
    engineName === 'codex'
      ? {
          codexConfig: {
            reasoningEffort: getNormalizedReasoningEffort(),
          },
        }
      : undefined;

  const session = await sessions.createSession(projectId, {
    engineName,
    name: `Session ${sessions.sessions.value.length + 1}`,
    optionsConfig,
  });

  // Guard: only clear messages if the new session is still selected
  // This prevents clearing messages if user switched during createSession await
  if (session && sessions.selectedSessionId.value === session.id) {
    chat.setMessages([]);
    // Note: URL sync is handled by onSessionChanged callback (triggered by createSession)
  }
  closeMenus();
}

async function handleDeleteSession(sessionId: string): Promise<void> {
  const wasCurrentSession = sessions.selectedSessionId.value === sessionId;
  const wasInChatView = viewRoute.isChatView.value;

  await sessions.deleteSession(sessionId);

  // Handle post-delete navigation and URL sync
  if (wasCurrentSession) {
    if (sessions.sessions.value.length === 0) {
      // No sessions left - go back to sessions list (will show empty state)
      // Also clear URL sessionId since there's no valid session
      viewRoute.setSessionId(null);
      if (wasInChatView) {
        viewRoute.goToSessions();
      }
    }
    // Note: If there are remaining sessions, useAgentSessions.deleteSession
    // already calls onSessionChanged which syncs URL via setSessionId
  }
}

async function handleRenameSession(sessionId: string, name: string): Promise<void> {
  await sessions.renameSession(sessionId, name);
}

async function handleOpenSessionSettings(sessionId: string): Promise<void> {
  closeMenus();
  sessionSettingsOpen.value = true;
  sessionSettingsLoading.value = true;
  currentManagementInfo.value = null;

  try {
    // Fetch Claude SDK management info if this is a Claude session
    const session = sessions.sessions.value.find((s) => s.id === sessionId);
    if (session?.engineName === 'claude') {
      const info = await sessions.fetchClaudeInfo(sessionId);
      if (info) {
        currentManagementInfo.value = info.managementInfo;
      }
    }
  } finally {
    sessionSettingsLoading.value = false;
  }
}

async function handleResetSession(sessionId: string): Promise<void> {
  closeMenus();
  const result = await sessions.resetConversation(sessionId);
  // Guard: only clear messages if the reset session is still selected
  // This prevents clearing messages if user switched during reset await
  if (result && sessions.selectedSessionId.value === sessionId) {
    chat.setMessages([]);
  }
}

// Composer direct model/reasoning effort change handlers
async function handleComposerModelChange(modelId: string): Promise<void> {
  const sessionId = sessions.selectedSessionId.value;
  if (!sessionId) return;

  await sessions.updateSession(sessionId, { model: modelId || null });
}

async function handleComposerReasoningEffortChange(effort: CodexReasoningEffort): Promise<void> {
  const sessionId = sessions.selectedSessionId.value;
  const session = sessions.selectedSession.value;
  if (!sessionId || !session) return;

  const existingOptions = session.optionsConfig ?? {};
  const existingCodexConfig = existingOptions.codexConfig ?? {};
  await sessions.updateSession(sessionId, {
    optionsConfig: {
      ...existingOptions,
      codexConfig: {
        ...existingCodexConfig,
        reasoningEffort: effort,
      },
    },
  });
}

// Composer session settings/reset handlers (without sessionId parameter)
function handleComposerOpenSettings(): void {
  const sessionId = sessions.selectedSessionId.value;
  if (sessionId) {
    handleOpenSessionSettings(sessionId);
  }
}

async function handleComposerReset(): Promise<void> {
  const sessionId = sessions.selectedSessionId.value;
  if (sessionId) {
    await handleResetSession(sessionId);
  }
}

function handleCloseSessionSettings(): void {
  sessionSettingsOpen.value = false;
  currentManagementInfo.value = null;
}

async function handleSaveSessionSettings(settings: SessionSettings): Promise<void> {
  const sessionId = sessions.selectedSessionId.value;
  if (!sessionId) return;

  sessionSettingsSaving.value = true;
  try {
    await sessions.updateSession(sessionId, {
      model: settings.model || null,
      permissionMode: settings.permissionMode || null,
      systemPromptConfig: settings.systemPromptConfig,
      optionsConfig: settings.optionsConfig,
    });
    sessionSettingsOpen.value = false;
    currentManagementInfo.value = null;
  } finally {
    sessionSettingsSaving.value = false;
  }
}

// Project handlers
async function handleProjectSelect(projectId: string): Promise<void> {
  // Clear request state and sessions before switching project
  // This prevents stale session data from mixing with the new project
  clearRequestState();
  sessions.clearSessions();

  projects.selectedProjectId.value = projectId;
  await projects.handleProjectChanged();

  // Guard: abort if user switched to a different project during await
  if (projects.selectedProjectId.value !== projectId) {
    closeMenus();
    return;
  }

  const project = projects.selectedProject.value;
  if (project) {
    selectedCli.value = project.preferredCli ?? '';
    model.value = project.selectedModel ?? '';
    useCcr.value = project.useCcr ?? false;
    enableChromeMcp.value = project.enableChromeMcp !== false;
  }

  // Fetch sessions for the new project from storage
  // ensureDefaultSession will handle restoring from storage if sessions exist
  await sessions.fetchSessions(projectId);

  // Only ensure default session if no sessions were found
  if (sessions.sessions.value.length === 0) {
    console.log(
      '[AgentChat.handleProjectSelect] No sessions found for new project, ensuring default...',
    );
    await sessions.ensureDefaultSession(
      projectId,
      (selectedCli.value as 'claude' | 'codex' | 'cursor' | 'qwen' | 'glm') || 'claude',
    );
  } else {
    console.log(
      '[AgentChat.handleProjectSelect] Found',
      sessions.sessions.value.length,
      'sessions for project, selecting first',
    );
    // Select first session if none selected
    if (!sessions.selectedSessionId.value && sessions.sessions.value.length > 0) {
      await sessions.selectSession(sessions.sessions.value[0].id);
    }
  }

  // Guard again after session handling
  if (projects.selectedProjectId.value !== projectId) {
    closeMenus();
    return;
  }

  // Ensure URL is synced after project switch (fallback for edge cases)
  // This handles rare cases where ensureDefaultSession doesn't trigger onSessionChanged
  viewRoute.setSessionId(sessions.selectedSessionId.value || null);

  closeMenus();
}

async function handleNewProject(): Promise<void> {
  isPickingDirectory.value = true;
  try {
    const path = await projects.pickDirectory();
    if (path) {
      // Extract directory name from path, handling trailing slashes
      const segments = path.split(/[/\\]/).filter((s) => s.length > 0);
      const dirName = segments.pop() || 'New Project';
      const project = await projects.createProjectFromPath(path, dirName);
      if (project) {
        selectedCli.value = project.preferredCli ?? '';
        model.value = project.selectedModel ?? '';
        useCcr.value = project.useCcr ?? false;
        enableChromeMcp.value = project.enableChromeMcp !== false;

        // Fetch sessions for the new project first
        await sessions.fetchSessions(project.id);

        // Only create default session if none exist
        if (sessions.sessions.value.length === 0) {
          console.log(
            '[AgentChat.handleNewProject] No sessions found for new project, creating default...',
          );
          const engineName =
            (selectedCli.value as 'claude' | 'codex' | 'cursor' | 'qwen' | 'glm') || 'claude';
          await sessions.ensureDefaultSession(project.id, engineName);
        } else {
          console.log(
            '[AgentChat.handleNewProject] Found',
            sessions.sessions.value.length,
            'sessions for new project',
          );
        }

        // Reconnect SSE and load session history
        if (sessions.selectedSessionId.value) {
          server.openEventSource();
          await loadSessionHistory(sessions.selectedSessionId.value);
        }
      }
    }
  } finally {
    isPickingDirectory.value = false;
    closeMenus();
  }
}

async function handleSaveSettings(): Promise<void> {
  const project = projects.selectedProject.value;
  if (!project) return;

  // Capture previous CLI to detect changes
  const previousCli = project.preferredCli ?? '';

  isSavingPreference.value = true;
  try {
    // Use normalized model to ensure valid value is saved
    const normalizedModel = getNormalizedModel();
    // Only save CCR if Claude CLI is selected
    const normalizedCcr = selectedCli.value === 'claude' ? useCcr.value : false;
    await projects.saveProjectPreference(
      selectedCli.value,
      normalizedModel,
      normalizedCcr,
      enableChromeMcp.value,
    );
    // Sync local state with normalized values
    model.value = normalizedModel;
    useCcr.value = normalizedCcr;

    // If CLI changed, create a new empty session with the new CLI
    const cliChanged = previousCli !== selectedCli.value;
    if (cliChanged && selectedCli.value) {
      const engineName = selectedCli.value as 'claude' | 'codex' | 'cursor' | 'qwen' | 'glm';

      // Include codex config if using codex engine
      const optionsConfig =
        engineName === 'codex'
          ? {
              codexConfig: {
                reasoningEffort: getNormalizedReasoningEffort(),
              },
            }
          : undefined;

      const session = await sessions.createSession(project.id, {
        engineName,
        name: `Session ${sessions.sessions.value.length + 1}`,
        optionsConfig,
      });

      // Guard: only clear messages if the new session is still selected
      // This prevents clearing messages if user switched during createSession await
      if (session && sessions.selectedSessionId.value === session.id) {
        chat.setMessages([]);
      }
    }
  } finally {
    isSavingPreference.value = false;
    closeMenus();
  }
}

// =============================================================================
// View Navigation
// =============================================================================

/**
 * Get the current OpenAI-compatible config from localStorage.
 * Returns null if not configured.
 */
function getSavedOpenAIConfig(): {
  baseUrl: string;
  apiKey: string;
  model: string;
  enabled: boolean;
} | null {
  try {
    const saved = localStorage.getItem('openai_config');
    if (saved) {
      const data = JSON.parse(saved);
      if (data.baseUrl && data.apiKey) {
        return {
          baseUrl: data.baseUrl,
          apiKey: data.apiKey,
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
function getProviderDisplayName(baseUrl: string): string {
  const url = baseUrl.toLowerCase();
  if (url.includes('dashscope') || url.includes('aliyun')) return '阿里云百炼';
  if (url.includes('openai.azure.com')) return 'Azure OpenAI';
  if (url.includes('localhost') || url.includes('127.0.0.1') || url.includes('11434'))
    return 'Ollama 本地';
  if (url.includes('api.openai.com')) return 'OpenAI 官方';
  if (url.includes('dashscope')) return '通义千问';
  if (url.includes('bigmodel') || url.includes('zhipu')) return '智谱';
  if (url.includes('moonshot') || url.includes('kimi')) return 'Kimi';
  if (url.includes('minimax')) return 'MiniMax';
  return '自定义';
}

/**
 * Handle session selection from sessions list and navigate to chat view.
 * Supports cross-project selection: if the selected session belongs to a different
 * project, the project context will be switched automatically.
 */
async function handleSessionSelectAndNavigate(sessionId: string): Promise<void> {
  // Only clear request state when switching to a DIFFERENT session
  // If re-entering the same session, preserve the running state
  // (e.g., user exits to list and comes back while request is still running)
  const isSameSession = sessions.selectedSessionId.value === sessionId;
  if (!isSameSession) {
    clearRequestState();
  }

  // Find the session's projectId from allSessions, fallback to API if not found
  const targetProjectId =
    sessions.allSessions.value.find((s) => s.id === sessionId)?.projectId ??
    (await sessions.getSession(sessionId))?.projectId;

  if (!targetProjectId) {
    console.warn('[AgentChat] Unable to resolve projectId for session:', sessionId);
    return;
  }

  // If the session belongs to a different project, switch project context first
  if (projects.selectedProjectId.value !== targetProjectId) {
    // Clear sessions before switching to prevent stale data mixing
    sessions.clearSessions();
    projects.selectedProjectId.value = targetProjectId;
    await projects.handleProjectChanged();

    // Guard: abort if user switched to a different project during await
    if (projects.selectedProjectId.value !== targetProjectId) {
      return;
    }

    // Sync local UI state with the new project's preferences
    const project = projects.selectedProject.value;
    if (project) {
      selectedCli.value = project.preferredCli ?? '';
      model.value = project.selectedModel ?? '';
      useCcr.value = project.useCcr ?? false;
      enableChromeMcp.value = project.enableChromeMcp !== false;
    }

    // Fetch sessions for the new project
    await sessions.fetchSessions(targetProjectId);

    // Guard again after fetchSessions
    if (projects.selectedProjectId.value !== targetProjectId) {
      return;
    }
  }

  await sessions.selectSession(sessionId);

  // Guard against stale navigation if user switched to a different session during await
  if (sessions.selectedSessionId.value !== sessionId) {
    return;
  }

  viewRoute.goToChat(sessionId);

  // Open SSE only if native server is available; load history regardless
  if (server.isServerReady.value) {
    server.openEventSource();
  }
  await loadSessionHistory(sessionId);
}

/**
 * Derive engine name from OpenAI config baseUrl.
 * Used to display the correct engine badge in the session list.
 */
function getEngineNameFromConfig(baseUrl: string): string {
  const url = baseUrl.toLowerCase();
  if (url.includes('dashscope') || url.includes('aliyun')) return 'qwen';
  if (url.includes('bigmodel') || url.includes('zhipu')) return 'glm';
  if (url.includes('moonshot') || url.includes('kimi')) return 'kimi';
  if (url.includes('minimax')) return 'minimax';
  if (url.includes('openai.azure.com')) return 'claude';
  return 'claude'; // Default: use claude for unknown providers
}

/**
 * Create a new session and navigate to chat view.
 */
async function handleNewSessionAndNavigate(): Promise<void> {
  console.log('[AgentChat] handleNewSessionAndNavigate called');

  // If no project selected, try to ensure one exists
  if (!projects.selectedProjectId.value) {
    console.log('[AgentChat] No project selected, attempting to ensure default project...');
    if (projects.projects.value.length === 0) {
      await projects.ensureDefaultProject();
      await projects.fetchProjects();
    }
    if (!projects.selectedProjectId.value && projects.projects.value.length > 0) {
      projects.selectedProjectId.value = projects.projects.value[0].id;
      await projects.saveSelectedProjectId();
    }
    if (!projects.selectedProjectId.value) {
      console.error('[AgentChat] Still no project after attempt to create one');
      sessions.sessionError.value = 'No project selected. Please wait for server to be ready.';
      return;
    }
  }

  // Check OpenAI-compatible configuration (optional, can use Native Server instead)
  const openAIConfig = getSavedOpenAIConfig();

  console.log('[AgentChat] Creating session with config:', {
    provider: openAIConfig ? getProviderDisplayName(openAIConfig.baseUrl) : 'Native Server',
    model: openAIConfig?.model || 'default',
    engineName: openAIConfig?.enabled
      ? getEngineNameFromConfig(openAIConfig.baseUrl)
      : selectedCli.value,
  });

  // Clear previous state before creating new session
  clearRequestState();

  // Use engine name derived from config when OpenAI is enabled, otherwise use selected CLI
  const engineName = openAIConfig?.enabled
    ? getEngineNameFromConfig(openAIConfig.baseUrl)
    : (selectedCli.value as 'claude' | 'codex' | 'cursor' | 'qwen' | 'glm' | 'kimi' | 'minimax') ||
      'claude';
  const optionsConfig =
    engineName === 'codex'
      ? {
          codexConfig: {
            reasoningEffort: getNormalizedReasoningEffort(),
          },
        }
      : undefined;

  const session = await sessions.createSession(projects.selectedProjectId.value, {
    engineName,
    model: openAIConfig?.model || undefined,
    name: `Session ${sessions.sessions.value.length + 1}`,
    optionsConfig,
  });
  console.log(
    '[AgentChat] createSession result:',
    session ? session.id : 'null',
    'error:',
    sessions.sessionError.value,
  );

  // Guard against stale navigation if user switched during createSession await
  if (session && sessions.selectedSessionId.value === session.id) {
    chat.setMessages([]);
    openaiChat.clearMessages();
    viewRoute.goToChat(session.id);

    // Only open SSE if native server is available (skip for direct OpenAI mode)
    if (server.isServerReady.value) {
      server.openEventSource();
    }
  }
}

/**
 * Navigate back to sessions list.
 */
function handleBackToSessions(): void {
  viewRoute.goToSessions();
}

/**
 * Navigate back to main extension page (workflows tab).
 */
function handleBackHome(): void {
  emit('back:home');
}

// =============================================================================
// Web Editor Selection Context
// =============================================================================

/**
 * Build instruction with web editor selection context prepended.
 * This provides AI with element context when user asks to modify selected element.
 *
 * Format:
 * ```
 * [WebEditorSelectionContext]
 * pageUrl: <pageUrl>
 * tagName: <tagName>
 * label: <label>
 * selectors: [<up to 3>]
 * fingerprint: <fingerprint>
 *
 * [UserRequest]
 * <user original input>
 * ```
 *
 * @param userInput - The user's original input text
 * @returns Instruction with context prepended, or original input if no selection
 */
function buildInstructionWithSelectionContext(userInput: string): string {
  const selection = webEditorTxState.selectedElement.value;
  const txState = webEditorTxState.txState.value;
  const selectionPageUrl = webEditorTxState.selectionPageUrl.value;

  // No selection = return original input
  if (!selection) {
    return userInput;
  }

  // Build context lines
  const contextLines: string[] = ['[WebEditorSelectionContext]'];

  // Page URL - prefer selection's pageUrl (more recent), fall back to txState
  const pageUrl = selectionPageUrl || txState?.pageUrl;
  if (pageUrl) {
    contextLines.push(`pageUrl: ${pageUrl}`);
  }

  // Element key for stable identification
  if (selection.elementKey) {
    contextLines.push(`elementKey: ${selection.elementKey}`);
  }

  // Element info
  contextLines.push(`tagName: ${selection.tagName || 'unknown'}`);
  contextLines.push(`label: ${selection.label || selection.fullLabel || 'unknown'}`);

  // Selectors (up to 3)
  const selectors = selection.locator?.selectors ?? [];
  const topSelectors = selectors.slice(0, 3);
  if (topSelectors.length > 0) {
    contextLines.push(`selectors: [${topSelectors.map((s) => `"${s}"`).join(', ')}]`);
  }

  // Fingerprint for similarity matching
  if (selection.locator?.fingerprint) {
    contextLines.push(`fingerprint: ${selection.locator.fingerprint}`);
  }

  // Combine context with user request
  return `${contextLines.join('\n')}\n\n[UserRequest]\n${userInput}`;
}

// Attachment handlers
function handleAttachmentAdd(): void {
  // Create and click a hidden file input
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.multiple = true;
  input.onchange = (e) => attachments.handleFileSelect(e);
  input.click();
}

// Send handler
async function handleSend(): Promise<void> {
  const dbSessionId = sessions.selectedSessionId.value;
  if (!dbSessionId) {
    activeChat.value.errorMessage.value = 'No session selected.';
    return;
  }

  // If using direct OpenAI mode, send without server-dependent features
  if (useDirectOpenAI.value) {
    const messageText = openaiChat.input.value.trim();
    if (!messageText) return;

    // Selection context not supported in direct OpenAI mode
    await openaiChat.send({
      dbSessionId,
    });

    // Update session preview with first user message
    sessions.updateSessionPreview(dbSessionId, messageText);
    return;
  }

  // Native server mode - full feature support
  // Ensure session is synced to server before sending
  const sessionSynced = await sessions.ensureSessionSynced(dbSessionId);
  if (!sessionSynced) {
    chat.errorMessage.value = 'Failed to sync session to server. Please try refreshing the page.';
    return;
  }

  const messageText = chat.input.value.trim();
  if (!messageText) return;

  // Check if user has selected an element in web editor
  const selection = webEditorTxState.selectedElement.value;
  const txState = webEditorTxState.txState.value;
  const selectionPageUrl = webEditorTxState.selectionPageUrl.value;

  // Capture selection info before sending (for clear after success)
  const selectionTabId = webEditorTxState.tabId.value;
  const selectionElementKey = selection?.elementKey ?? null;

  // When a web editor element is selected, store structured metadata on the user message
  // so the thread header can render as a chip (same style as "Web editor apply")
  const selectionClientMeta = selection
    ? {
        kind: 'web_editor_apply_single' as const,
        pageUrl: selectionPageUrl || txState?.pageUrl || 'unknown',
        elementCount: 1,
        elementLabels: [
          selection.label || selection.fullLabel || selection.tagName || 'selected element',
        ],
      }
    : undefined;

  // Build instruction with web editor selection context (if any)
  // The UI will show the original messageText, but the actual instruction
  // sent to the server will include element context for AI to understand
  const instructionWithContext = buildInstructionWithSelectionContext(messageText);

  // Use getAttachments() to strip previewUrl and avoid payload bloat
  chat.attachments.value = attachments.getAttachments() ?? [];

  // Session-level config is now used by backend; no need to pass cliPreference/model
  // For selection context messages, use the user's input as displayText
  // so the chip shows meaningful content instead of a generic label
  await chat.send({
    projectId: projects.selectedProjectId.value || undefined,
    dbSessionId,
    // Pass the context-enriched instruction to be sent to server
    instruction: instructionWithContext,
    // Attach metadata only when selection context exists
    // Use user's original message as displayText for better UX
    displayText: selection ? messageText : undefined,
    clientMeta: selectionClientMeta,
  });

  // Clear web editor selection after successful send
  // This "consumes" the selection context so it won't be re-injected in next message
  if (selectionElementKey && selectionTabId) {
    // Check if user has selected a DIFFERENT element during the loading period
    // Compare both elementKey AND tabId to handle cross-tab scenarios
    // (elementKey like "div#app" is not unique across tabs/pages)
    const currentElementKey = webEditorTxState.selectedElement.value?.elementKey ?? null;
    const currentTabId = webEditorTxState.tabId.value;

    const isSameSelection =
      currentElementKey === selectionElementKey && currentTabId === selectionTabId;

    if (!isSameSelection && currentElementKey !== null) {
      // User selected a new element (or switched tab) during send - preserve it, don't clear
    } else {
      // Same element or already deselected - proceed with clear
      // Try to clear via message (web-editor may be open)
      chrome.runtime
        .sendMessage({
          type: BACKGROUND_MESSAGE_TYPES.WEB_EDITOR_CLEAR_SELECTION,
          payload: { tabId: selectionTabId },
        })
        .then((response: { success: boolean } | undefined) => {
          // If web-editor didn't respond (closed/not active), clear local state
          // Use captured selectionTabId/selectionElementKey to avoid clearing new selection
          if (!response?.success) {
            clearLocalSelectionState(selectionTabId, selectionElementKey);
          }
          // If success, web-editor will broadcast null selection which will clear our state
        })
        .catch(() => {
          // Message failed - clear sidepanel local state directly
          clearLocalSelectionState(selectionTabId, selectionElementKey);
        });
    }
  }

  // Update session preview with first user message (if not already set)
  // Note: Use original messageText, not the context-enriched version
  // Include previewMeta for special chip rendering in session list
  sessions.updateSessionPreview(
    dbSessionId,
    messageText,
    selectionClientMeta
      ? {
          displayText: messageText,
          clientMeta: selectionClientMeta,
          fullContent: instructionWithContext,
        }
      : undefined,
  );

  attachments.clearAttachments();
}

/**
 * Clear sidepanel local selection state.
 * Used when web-editor is closed or unreachable.
 *
 * @param expectedTabId - The tab ID that was selected at send time
 * @param expectedElementKey - The element key that was selected at send time
 */
function clearLocalSelectionState(expectedTabId: number, expectedElementKey: string): void {
  // Double-check we're still on the same selection to avoid clearing new selection
  const currentTabId = webEditorTxState.tabId.value;
  const currentElementKey = webEditorTxState.selectedElement.value?.elementKey ?? null;

  // Only clear if still pointing to the same selection (or already cleared)
  const shouldClear =
    currentElementKey === null ||
    (currentTabId === expectedTabId && currentElementKey === expectedElementKey);

  if (!shouldClear) {
    // User switched to a different selection - don't clear
    return;
  }

  // Clear the reactive state
  webEditorTxState.selectedElement.value = null;
  webEditorTxState.selectionPageUrl.value = null;

  // Clear session storage to prevent "revival" on refresh/tab switch
  if (expectedTabId) {
    const storageKey = `web-editor-v2-selection-${expectedTabId}`;
    chrome.storage.session.remove(storageKey).catch(() => {
      // Ignore storage errors
    });
  }
}

// Initialize
onMounted(async () => {
  console.log('[AgentChat.onMounted] Starting initialization...');

  // Initialize theme
  await themeState.initTheme();

  // Load open project preference
  await openProjectPreference.loadDefaultTarget();

  // Load input preferences (fake caret, etc.)
  await inputPreferences.init();

  // CRITICAL INITIALIZATION ORDER:
  // 1. First load projects from storage
  // 2. Then load selected project ID from storage (MUST happen before ensureDefaultProject)
  // 3. Then ensure default project exists (won't overwrite if already loaded)
  // 4. Then load sessions from storage
  // 5. Finally ensure default session exists (won't create if already exists)

  // Step 1: Load projects from storage
  console.log('[AgentChat.onMounted] Step 1: Loading projects...');
  await projects.fetchProjects();

  // Step 2: Load selected project ID from storage (skipIfSet=false to always load)
  console.log('[AgentChat.onMounted] Step 2: Loading selected project ID...');
  await projects.loadSelectedProjectId(false);

  // Step 3: Ensure default project exists (won't create if projects already exist)
  console.log('[AgentChat.onMounted] Step 3: Ensuring default project...');
  await projects.ensureDefaultProject();
  console.log(
    '[AgentChat.onMounted] After ensureDefaultProject, selectedProjectId:',
    projects.selectedProjectId.value,
  );

  // Step 3.5: Clean up orphan sessions (sessions whose project no longer exists)
  console.log('[AgentChat.onMounted] Step 3.5: Cleaning up orphan sessions...');
  await sessions.cleanupOrphanSessions();

  // Step 4: Load all sessions from storage
  console.log('[AgentChat.onMounted] Step 4: Loading all sessions...');
  await sessions.fetchAllSessions();
  console.log(
    '[AgentChat.onMounted] After fetchAllSessions, allSessions.count:',
    sessions.allSessions.value.length,
  );

  // Step 5: Load selected session ID from storage
  console.log('[AgentChat.onMounted] Step 5: Loading selected session ID...');
  await sessions.loadSelectedSessionId();

  // Validate project selection
  const hasValidSelection =
    projects.selectedProjectId.value &&
    projects.projects.value.some((p) => p.id === projects.selectedProjectId.value);

  if (!hasValidSelection && projects.projects.value.length > 0) {
    console.warn('[AgentChat] Selected project no longer exists, falling back to first project');
    projects.selectedProjectId.value = projects.projects.value[0].id;
    await projects.saveSelectedProjectId();
  }

  // Load settings and sessions for the current project
  if (projects.selectedProjectId.value) {
    const project = projects.selectedProject.value;
    if (project) {
      selectedCli.value = project.preferredCli ?? '';
      model.value = project.selectedModel ?? '';
      useCcr.value = project.useCcr ?? false;
      enableChromeMcp.value = project.enableChromeMcp !== false;
    }

    // CRITICAL: Fetch sessions for the current project BEFORE ensureDefaultSession
    // This prevents ensureDefaultSession from creating duplicate default sessions
    console.log(
      '[AgentChat] Step 6: Fetching sessions for project:',
      projects.selectedProjectId.value,
    );
    console.log(
      '[AgentChat] Before fetchSessions, sessions.value.length:',
      sessions.sessions.value.length,
    );
    console.log(
      '[AgentChat] Before fetchSessions, allSessions.value.length:',
      sessions.allSessions.value.length,
    );
    console.log('[AgentChat] Current projectId:', projects.selectedProjectId.value);
    await sessions.fetchSessions(projects.selectedProjectId.value);
    console.log(
      '[AgentChat] After fetchSessions, sessions.value.length:',
      sessions.sessions.value.length,
    );
    console.log(
      '[AgentChat] After fetchSessions, sessions.value:',
      sessions.sessions.value.map((s) => ({ id: s.id, projectId: s.projectId, name: s.name })),
    );

    // Additional check: if sessions.value is still empty, check storage directly
    if (sessions.sessions.value.length === 0) {
      const stored = await chrome.storage.local.get('standalone-sessions');
      const storedSessions = stored['standalone-sessions'] || [];
      console.log(
        '[AgentChat] Storage check - all stored sessions:',
        storedSessions.map((s) => ({ id: s.id, projectId: s.projectId, name: s.name })),
      );
      console.log(
        '[AgentChat] Storage check - sessions for current project:',
        storedSessions
          .filter((s) => s.projectId === projects.selectedProjectId.value)
          .map((s) => ({ id: s.id, projectId: s.projectId, name: s.name })),
      );
    }

    // Parse URL parameters to determine initial view
    const initialRoute = viewRoute.initFromUrl();

    // Handle deep link: URL specifies session to open directly
    if (initialRoute.view === 'chat' && initialRoute.sessionId) {
      const targetSession =
        sessions.allSessions.value.find((s) => s.id === initialRoute.sessionId) ??
        sessions.sessions.value.find((s) => s.id === initialRoute.sessionId);

      if (targetSession) {
        await handleSessionSelectAndNavigate(targetSession.id);
      } else {
        viewRoute.goToSessions();
      }
    }

    // Ensure a default session exists (for new users)
    // Check both sessions.value and allSessions.value to determine if sessions exist
    const sessionsForProject = sessions.sessions.value.filter(
      (s) => s.projectId === projects.selectedProjectId.value,
    );
    const allSessionsForProject = sessions.allSessions.value.filter(
      (s) => s.projectId === projects.selectedProjectId.value,
    );
    const hasSessions = sessionsForProject.length > 0 || allSessionsForProject.length > 0;

    console.log(
      '[AgentChat] Session check - sessions.value.length:',
      sessions.sessions.value.length,
    );
    console.log(
      '[AgentChat] Session check - allSessions.value.length:',
      sessions.allSessions.value.length,
    );
    console.log('[AgentChat] Session check - sessionsForProject:', sessionsForProject.length);
    console.log('[AgentChat] Session check - allSessionsForProject:', allSessionsForProject.length);
    console.log('[AgentChat] Session check - hasSessions:', hasSessions);

    if (!hasSessions) {
      console.log('[AgentChat] No sessions found for project, ensuring default session...');
      await sessions.ensureDefaultSession(
        projects.selectedProjectId.value,
        (selectedCli.value as 'claude' | 'codex' | 'cursor' | 'qwen' | 'glm') || 'claude',
      );
    } else {
      console.log('[AgentChat] Sessions already exist for project, skipping ensureDefaultSession');
    }

    // Try to initialize server (non-blocking, for AI chat functionality)
    await server.initialize();

    // Only open SSE and load history if we're in chat view with a valid session AND server is ready
    if (
      viewRoute.isChatView.value &&
      sessions.selectedSessionId.value &&
      server.isServerReady.value
    ) {
      server.openEventSource();
      await loadSessionHistory(sessions.selectedSessionId.value);
    }
  }

  console.log('[AgentChat.onMounted] Initialization complete');
});

// Watch for server becoming ready (enables AI chat functionality)
watch(
  () => server.isServerReady.value,
  async (ready) => {
    if (ready && viewRoute.isChatView.value && sessions.selectedSessionId.value) {
      // Server just came online while user is in chat view - open SSE
      server.openEventSource();
      await loadSessionHistory(sessions.selectedSessionId.value);
    }
    // When server becomes ready for the first time, sync existing sessions to ensure they exist on server
    if (ready && !sessionsSyncedToServer.value) {
      sessionsSyncedToServer.value = true;
      await sessions.syncAllSessionsToServer();
    }
  },
);

// Watch for changes in selected project ID and ensure it's always valid
watch(
  () => projects.selectedProjectId.value,
  async (id) => {
    if (!id && projects.projects.value.length > 0) {
      projects.selectedProjectId.value = projects.projects.value[0].id;
      await projects.saveSelectedProjectId();
    }
  },
);

// Close menus on Escape key
const handleEscape = (e: KeyboardEvent) => {
  if (e.key === 'Escape') {
    closeMenus();
  }
};

onMounted(() => {
  document.addEventListener('keydown', handleEscape);
});

onUnmounted(() => {
  document.removeEventListener('keydown', handleEscape);
});
</script>
