/**
 * Standalone Agent Composable - Works without the native server.
 *
 * Provides project and session management using chrome.storage.local,
 * so the chat assistant UI is usable even when the native server is not running.
 */
import { ref, computed, watch, type Ref } from 'vue';
import type {
  AgentSession,
  AgentProject,
  AgentCliPreference,
  CreateAgentSessionInput,
  UpdateAgentSessionInput,
  AgentStoredMessage,
  AgentEngineInfo,
} from 'chrome-mcp-shared';

// Storage keys
const STORAGE_KEY_PROJECTS = 'standalone-projects';
const STORAGE_KEY_SESSIONS = 'standalone-sessions';
const STORAGE_KEY_MESSAGES = 'standalone-messages';
const STORAGE_KEY_SELECTED_PROJECT = 'standalone-selected-project-id';
const STORAGE_KEY_SELECTED_SESSION = 'standalone-selected-session-id';

// =============================================================================
// Storage helpers
// =============================================================================

async function loadFromStorage<T>(key: string, fallback: T): Promise<T> {
  try {
    const result = await chrome.storage.local.get(key);
    if (result[key]) {
      // Deserialize Date strings back to Date for comparison
      return result[key] as T;
    }
  } catch {
    // Ignore
  }
  return fallback;
}

/**
 * Load an array from storage with defensive type checking.
 * If the stored value is not an array, returns the fallback.
 */
async function loadArrayFromStorage<T>(key: string, fallback: T[]): Promise<T[]> {
  try {
    const result = await chrome.storage.local.get(key);
    if (result[key] && Array.isArray(result[key])) {
      return result[key] as T[];
    }
  } catch {
    // Ignore
  }
  return fallback;
}

async function saveToStorage<T>(key: string, value: T): Promise<void> {
  try {
    await chrome.storage.local.set({ [key]: value });
  } catch {
    // Ignore
  }
}

// =============================================================================
// Types
// =============================================================================

interface StandaloneAgentReturn {
  // Server-like state
  serverPort: Ref<null>;
  nativeConnected: Ref<false>;
  isServerReady: Ref<false>;
  engines: Ref<AgentEngineInfo[]>;

  // Project state
  projects: Ref<AgentProject[]>;
  selectedProjectId: Ref<string>;
  selectedProject: Ref<AgentProject | null>;
  isLoadingProjects: Ref<boolean>;
  projectError: Ref<string | null>;

  // Session state
  sessions: Ref<AgentSession[]>;
  allSessions: Ref<AgentSession[]>;
  selectedSessionId: Ref<string>;
  selectedSession: Ref<AgentSession | null>;
  isLoadingSessions: Ref<boolean>;
  isLoadingAllSessions: Ref<boolean>;
  isCreatingSession: Ref<boolean>;
  sessionError: Ref<string | null>;

  // Chat state (standalone - no server calls)
  chatMessages: Ref<AgentStoredMessage[]>;

  // Project methods
  fetchProjects: () => Promise<void>;
  loadSelectedProjectId: () => Promise<void>;
  saveSelectedProjectId: () => Promise<void>;
  handleProjectChanged: () => Promise<void>;
  ensureDefaultProject: () => Promise<AgentProject | null>;
  createProjectFromPath: (rootPath: string, name: string) => Promise<AgentProject | null>;
  saveProjectPreference: (
    cli?: string,
    model?: string,
    useCcr?: boolean,
    enableChromeMcp?: boolean,
  ) => Promise<void>;
  pickDirectory: () => Promise<string | null>;

  // Session methods
  fetchSessions: (projectId: string) => Promise<void>;
  fetchAllSessions: () => Promise<void>;
  loadSelectedSessionId: () => Promise<void>;
  saveSelectedSessionId: () => Promise<void>;
  selectSession: (sessionId: string) => Promise<void>;
  createSession: (
    projectId: string,
    input: CreateAgentSessionInput,
  ) => Promise<AgentSession | null>;
  getSession: (sessionId: string) => Promise<AgentSession | null>;
  updateSession: (
    sessionId: string,
    updates: UpdateAgentSessionInput,
  ) => Promise<AgentSession | null>;
  deleteSession: (sessionId: string) => Promise<boolean>;
  ensureDefaultSession: (
    projectId: string,
    engineName?: AgentCliPreference,
  ) => Promise<AgentSession | null>;
  renameSession: (sessionId: string, name: string) => Promise<boolean>;
  resetConversation: (sessionId: string) => Promise<{
    deletedMessages: number;
    clearedEngineSessionId: boolean;
    session: AgentSession | null;
  } | null>;
  fetchClaudeInfo: (sessionId: string) => Promise<null>;
  clearSessions: () => void;
  updateSessionPreview: (
    sessionId: string,
    preview: string,
    previewMeta?: AgentSession['previewMeta'],
  ) => void;

  // Server methods (no-ops in standalone mode)
  ensureNativeServer: () => Promise<false>;
  openEventSource: () => void;
  reconnect: () => Promise<void>;
  fetchEngines: () => Promise<void>;

  // Chat methods (standalone)
  loadChatHistory: (projectId: string) => Promise<void>;
  getChatMessages: () => AgentStoredMessage[];
  setChatMessages: (msgs: AgentStoredMessage[]) => void;
  addChatMessage: (msg: AgentStoredMessage) => void;
}

/**
 * Generate a unique ID using the browser's built-in crypto.
 */
function generateId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    Date.now().toString(36) + Math.random().toString(36).slice(2)
  );
}

/**
 * Create a standalone agent composable that works without the native server.
 */
export function useStandaloneAgent(): StandaloneAgentReturn {
  // Server state (always false/null in standalone mode)
  const serverPort = ref<null>(null);
  const nativeConnected = ref(false);
  const isServerReady = computed(() => false as const);
  const engines = ref<AgentEngineInfo[]>([]);

  // Project state
  const projects = ref<AgentProject[]>([]);
  const selectedProjectId = ref('');
  const isLoadingProjects = ref(false);
  const projectError = ref<string | null>(null);

  // Session state
  const sessions = ref<AgentSession[]>([]);
  const allSessions = ref<AgentSession[]>([]);
  const selectedSessionId = ref('');
  const isLoadingSessions = ref(false);
  const isLoadingAllSessions = ref(false);
  const isCreatingSession = ref(false);
  const sessionError = ref<string | null>(null);

  // Chat state
  const chatMessages = ref<AgentStoredMessage[]>([]);

  // Computed
  const selectedProject = computed(() => {
    return projects.value.find((p) => p.id === selectedProjectId.value) || null;
  });

  const selectedSession = computed(() => {
    return sessions.value.find((s) => s.id === selectedSessionId.value) || null;
  });

  // =============================================================================
  // Project storage operations
  // =============================================================================

  async function fetchProjects(): Promise<void> {
    isLoadingProjects.value = true;
    try {
      const stored = await loadArrayFromStorage<AgentProject>(STORAGE_KEY_PROJECTS, []);
      projects.value = stored;
    } finally {
      isLoadingProjects.value = false;
    }
  }

  async function saveProjects(): Promise<void> {
    await saveToStorage(STORAGE_KEY_PROJECTS, projects.value);
  }

  async function loadSelectedProjectId(): Promise<void> {
    try {
      const result = await chrome.storage.local.get(STORAGE_KEY_SELECTED_PROJECT);
      if (result[STORAGE_KEY_SELECTED_PROJECT]) {
        selectedProjectId.value = result[STORAGE_KEY_SELECTED_PROJECT];
      }
    } catch {
      // Ignore
    }
  }

  async function saveSelectedProjectId(): Promise<void> {
    try {
      await chrome.storage.local.set({
        [STORAGE_KEY_SELECTED_PROJECT]: selectedProjectId.value,
      });
    } catch {
      // Ignore
    }
  }

  async function handleProjectChanged(): Promise<void> {
    await saveSelectedProjectId();
    if (selectedProjectId.value) {
      await fetchSessions(selectedProjectId.value);
    }
  }

  async function ensureDefaultProject(): Promise<AgentProject | null> {
    await fetchProjects();

    if (projects.value.length > 0) {
      // If no valid selection, select first
      if (
        !selectedProjectId.value ||
        !projects.value.find((p) => p.id === selectedProjectId.value)
      ) {
        selectedProjectId.value = projects.value[0].id;
        await saveSelectedProjectId();
      }
      return selectedProject.value;
    }

    // Create default project
    const project: AgentProject = {
      id: generateId(),
      name: 'Default',
      rootPath: '/dev',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      preferredCli: 'claude',
    };

    projects.value = [project];
    await saveProjects();

    selectedProjectId.value = project.id;
    await saveSelectedProjectId();

    return project;
  }

  async function createProjectFromPath(
    rootPath: string,
    name: string,
  ): Promise<AgentProject | null> {
    const project: AgentProject = {
      id: generateId(),
      name,
      rootPath,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      preferredCli: 'claude',
    };

    projects.value = [...projects.value, project];
    await saveProjects();

    selectedProjectId.value = project.id;
    await saveSelectedProjectId();

    return project;
  }

  async function saveProjectPreference(
    cli?: string,
    model?: string,
    useCcr?: boolean,
    enableChromeMcp?: boolean,
  ): Promise<void> {
    const project = selectedProject.value;
    if (!project) return;

    if (cli !== undefined) project.preferredCli = cli;
    if (model !== undefined) project.selectedModel = model;
    if (useCcr !== undefined) project.useCcr = useCcr;
    if (enableChromeMcp !== undefined) project.enableChromeMcp = enableChromeMcp;

    project.updatedAt = new Date().toISOString();
    await saveProjects();
  }

  async function pickDirectory(): Promise<string | null> {
    // Directory picker requires native server, not available in standalone mode
    projectError.value = 'Directory picker requires the native server to be running.';
    return null;
  }

  // =============================================================================
  // Session storage operations
  // =============================================================================

  async function saveSessions(): Promise<void> {
    await saveToStorage(STORAGE_KEY_SESSIONS, sessions.value);
  }

  async function saveAllSessions(): Promise<void> {
    await saveToStorage(STORAGE_KEY_SESSIONS, allSessions.value);
  }

  async function loadSelectedSessionId(): Promise<void> {
    try {
      const result = await chrome.storage.local.get(STORAGE_KEY_SELECTED_SESSION);
      if (result[STORAGE_KEY_SELECTED_SESSION]) {
        selectedSessionId.value = result[STORAGE_KEY_SELECTED_SESSION];
      }
    } catch {
      // Ignore
    }
  }

  async function saveSelectedSessionId(): Promise<void> {
    try {
      await chrome.storage.local.set({
        [STORAGE_KEY_SELECTED_SESSION]: selectedSessionId.value,
      });
    } catch {
      // Ignore
    }
  }

  async function fetchSessions(projectId: string): Promise<void> {
    if (!projectId) return;

    isLoadingSessions.value = true;
    sessionError.value = null;

    try {
      const stored = await loadArrayFromStorage<AgentSession>(STORAGE_KEY_SESSIONS, []);
      const projectSessions = stored.filter((s) => s.projectId === projectId);
      sessions.value = projectSessions.sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );

      if (sessions.value.length > 0 && !selectedSessionId.value) {
        selectedSessionId.value = sessions.value[0].id;
        await saveSelectedSessionId();
      }
    } catch (error) {
      sessionError.value = error instanceof Error ? error.message : 'Failed to fetch sessions';
    } finally {
      isLoadingSessions.value = false;
    }
  }

  async function fetchAllSessions(): Promise<void> {
    isLoadingAllSessions.value = true;
    sessionError.value = null;

    try {
      const stored = await loadArrayFromStorage<AgentSession>(STORAGE_KEY_SESSIONS, []);
      allSessions.value = stored.sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );
    } catch (error) {
      sessionError.value = error instanceof Error ? error.message : 'Failed to fetch sessions';
    } finally {
      isLoadingAllSessions.value = false;
    }
  }

  async function selectSession(sessionId: string): Promise<void> {
    if (selectedSessionId.value === sessionId) return;

    selectedSessionId.value = sessionId;
    await saveSelectedSessionId();
  }

  async function createSession(
    projectId: string,
    input: CreateAgentSessionInput,
  ): Promise<AgentSession | null> {
    isCreatingSession.value = true;
    sessionError.value = null;

    try {
      const session: AgentSession = {
        id: generateId(),
        projectId,
        name: input.name || 'New Session',
        engineName: input.engineName || 'claude',
        model: input.model || undefined,
        cliPreference: input.engineName || 'claude',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        preview: '',
        optionsConfig: input.optionsConfig,
      };

      // Add to sessions storage
      const stored = await loadArrayFromStorage<AgentSession>(STORAGE_KEY_SESSIONS, []);
      const updated = [...stored, session];
      await saveToStorage(STORAGE_KEY_SESSIONS, updated);

      // Update local state
      sessions.value = [session, ...sessions.value];
      allSessions.value = [session, ...allSessions.value.filter((s) => s.id !== session.id)];

      selectedSessionId.value = session.id;
      await saveSelectedSessionId();

      return session;
    } catch (error) {
      sessionError.value = error instanceof Error ? error.message : 'Failed to create session';
      return null;
    } finally {
      isCreatingSession.value = false;
    }
  }

  async function getSession(sessionId: string): Promise<AgentSession | null> {
    const stored = await loadFromStorage<AgentSession[]>(STORAGE_KEY_SESSIONS, []);
    return stored.find((s) => s.id === sessionId) || null;
  }

  async function updateSession(
    sessionId: string,
    updates: UpdateAgentSessionInput,
  ): Promise<AgentSession | null> {
    // Update in storage
    const stored = await loadFromStorage<AgentSession[]>(STORAGE_KEY_SESSIONS, []);
    const index = stored.findIndex((s) => s.id === sessionId);
    if (index === -1) return null;

    stored[index] = {
      ...stored[index],
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    await saveToStorage(STORAGE_KEY_SESSIONS, stored);

    // Update local state
    const updateLocal = (list: AgentSession[]) => {
      const idx = list.findIndex((s) => s.id === sessionId);
      if (idx !== -1) {
        list[idx] = stored[index];
      }
    };
    updateLocal(sessions.value);
    updateLocal(allSessions.value);

    return stored[index];
  }

  async function deleteSession(sessionId: string): Promise<boolean> {
    // Remove from storage
    const stored = await loadFromStorage<AgentSession[]>(STORAGE_KEY_SESSIONS, []);
    const filtered = stored.filter((s) => s.id !== sessionId);
    await saveToStorage(STORAGE_KEY_SESSIONS, filtered);

    // Remove messages
    const messages = await loadFromStorage<AgentStoredMessage[]>(STORAGE_KEY_MESSAGES, []);
    const filteredMessages = messages.filter((m) => m.sessionId !== sessionId);
    await saveToStorage(STORAGE_KEY_MESSAGES, filteredMessages);

    // Update local state
    sessions.value = sessions.value.filter((s) => s.id !== sessionId);
    allSessions.value = allSessions.value.filter((s) => s.id !== sessionId);

    // If deleted session was selected, select another
    if (selectedSessionId.value === sessionId) {
      selectedSessionId.value = sessions.value[0]?.id || '';
      await saveSelectedSessionId();
    }

    return true;
  }

  async function ensureDefaultSession(
    projectId: string,
    engineName: AgentCliPreference = 'claude',
  ): Promise<AgentSession | null> {
    await fetchSessions(projectId);

    if (sessions.value.length > 0) {
      if (
        !selectedSessionId.value ||
        !sessions.value.find((s) => s.id === selectedSessionId.value)
      ) {
        await selectSession(sessions.value[0].id);
      }
      return selectedSession.value;
    }

    return createSession(projectId, {
      engineName,
      name: 'Default Session',
    });
  }

  async function renameSession(sessionId: string, name: string): Promise<boolean> {
    const result = await updateSession(sessionId, { name });
    return result !== null;
  }

  async function resetConversation(sessionId: string): Promise<{
    deletedMessages: number;
    clearedEngineSessionId: boolean;
    session: AgentSession | null;
  } | null> {
    // Delete messages for this session
    const messages = await loadFromStorage<AgentStoredMessage[]>(STORAGE_KEY_MESSAGES, []);
    const beforeCount = messages.length;
    const filtered = messages.filter((m) => m.sessionId !== sessionId);
    await saveToStorage(STORAGE_KEY_MESSAGES, filtered);

    // Clear engine session ID
    await updateSession(sessionId, { engineSessionId: null });

    // Clear chat messages
    chatMessages.value = [];

    return {
      deletedMessages: beforeCount - filtered.length,
      clearedEngineSessionId: true,
      session: selectedSession.value,
    };
  }

  async function fetchClaudeInfo(_sessionId: string): Promise<null> {
    // Not available in standalone mode
    return null;
  }

  function clearSessions(): void {
    sessions.value = [];
    selectedSessionId.value = '';
  }

  function updateSessionPreview(
    sessionId: string,
    preview: string,
    previewMeta?: AgentSession['previewMeta'],
  ): void {
    const maxLen = 50;
    const trimmed = preview.trim().replace(/\s+/g, ' ');
    const truncated = trimmed.length > maxLen ? trimmed.slice(0, maxLen - 1) + '…' : trimmed;
    const now = new Date().toISOString();

    const update = (list: AgentSession[]) => {
      const index = list.findIndex((s) => s.id === sessionId);
      if (index !== -1) {
        list[index] = {
          ...list[index],
          preview: list[index].preview || truncated,
          previewMeta: list[index].previewMeta || previewMeta,
          updatedAt: now,
        };
      }
    };
    update(sessions.value);
    update(allSessions.value);
  }

  // =============================================================================
  // Chat operations (standalone)
  // =============================================================================

  async function loadChatHistory(_projectId: string): Promise<void> {
    // In standalone mode, we load by session, not project
    if (selectedSessionId.value) {
      const messages = await loadArrayFromStorage<AgentStoredMessage>(STORAGE_KEY_MESSAGES, []);
      const sessionMessages = messages
        .filter((m) => m.sessionId === selectedSessionId.value)
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      chatMessages.value = sessionMessages;
    }
  }

  function getChatMessages(): AgentStoredMessage[] {
    return chatMessages.value;
  }

  function setChatMessages(msgs: AgentStoredMessage[]): void {
    chatMessages.value = msgs;
  }

  function addChatMessage(msg: AgentStoredMessage): void {
    chatMessages.value = [...chatMessages.value, msg];

    // Also persist
    loadArrayFromStorage<AgentStoredMessage>(STORAGE_KEY_MESSAGES, []).then((stored) => {
      saveToStorage(STORAGE_KEY_MESSAGES, [...stored, msg]);
    });
  }

  // =============================================================================
  // Server methods (no-ops in standalone mode)
  // =============================================================================

  async function ensureNativeServer(): Promise<false> {
    return false;
  }

  function openEventSource(): void {
    // No-op in standalone mode
  }

  async function reconnect(): Promise<void> {
    // No-op in standalone mode
  }

  async function fetchEngines(): Promise<void> {
    // No-op in standalone mode
  }

  // =============================================================================
  // Watch for project changes
  // =============================================================================

  watch(selectedProjectId, async (newId) => {
    if (newId) {
      await fetchSessions(newId);
    } else {
      sessions.value = [];
    }
  });

  return {
    // Server-like state
    serverPort,
    nativeConnected,
    isServerReady,
    engines,

    // Project state
    projects,
    selectedProjectId,
    selectedProject,
    isLoadingProjects,
    projectError,

    // Session state
    sessions,
    allSessions,
    selectedSessionId,
    selectedSession,
    isLoadingSessions,
    isLoadingAllSessions,
    isCreatingSession,
    sessionError,

    // Chat state
    chatMessages,

    // Project methods
    fetchProjects,
    loadSelectedProjectId,
    saveSelectedProjectId,
    handleProjectChanged,
    ensureDefaultProject,
    createProjectFromPath,
    saveProjectPreference,
    pickDirectory,

    // Session methods
    fetchSessions,
    fetchAllSessions,
    loadSelectedSessionId,
    saveSelectedSessionId,
    selectSession,
    createSession,
    getSession,
    updateSession,
    deleteSession,
    ensureDefaultSession,
    renameSession,
    resetConversation,
    fetchClaudeInfo,
    clearSessions,
    updateSessionPreview,

    // Server methods (no-ops)
    ensureNativeServer,
    openEventSource,
    reconnect,
    fetchEngines,

    // Chat methods
    loadChatHistory,
    getChatMessages,
    setChatMessages,
    addChatMessage,
  };
}
