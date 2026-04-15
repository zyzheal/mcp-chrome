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
  cleanupOrphanSessions: () => Promise<void>;
  /**
   * Sync all existing sessions to native server.
   * Called when server becomes ready to ensure local sessions are synced.
   */
  syncAllSessionsToServer: () => Promise<void>;
  /**
   * Check if a session exists on the native server and sync if not.
   */
  ensureSessionSynced: (sessionId: string) => Promise<boolean>;

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

  // Track if sessions have been synced to server (to avoid duplicate syncs)
  let sessionsSynced = false;

  // Track if ensureDefaultSession is running to prevent concurrent calls
  let ensureDefaultSessionRunning = false;

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

      // Migration: Remove invalid projects (no name, no id, or corrupted)
      const validProjects = stored.filter((p) => p.id && p.name);
      if (validProjects.length !== stored.length) {
        projects.value = validProjects;
        await saveProjects();
        console.log('[StandaloneAgent] Removed invalid projects');
      }

      // Migration: Fix invalid rootPath (must be under /Users/heal for native server)
      const validRootPath = '/Users/heal/.chrome-mcp-agent/workspaces/default';
      let migrated = false;
      for (const project of projects.value) {
        if (!project.rootPath || !project.rootPath.startsWith('/Users/heal')) {
          project.rootPath = validRootPath;
          migrated = true;
        }
      }
      if (migrated) {
        await saveProjects();
        console.log('[StandaloneAgent] Migrated project rootPaths to valid path');
      }

      // Migration: Clear selectedProjectId if the project no longer exists
      if (
        selectedProjectId.value &&
        !projects.value.some((p) => p.id === selectedProjectId.value)
      ) {
        console.warn(
          `[StandaloneAgent] Selected project ${selectedProjectId.value} no longer exists, clearing selection`,
        );
        selectedProjectId.value = '';
        await saveSelectedProjectId();
      }
    } finally {
      isLoadingProjects.value = false;
    }
  }

  async function saveProjects(): Promise<void> {
    await saveToStorage(STORAGE_KEY_PROJECTS, projects.value);
  }

  async function loadSelectedProjectId(skipIfSet: boolean = true): Promise<void> {
    // Only load from storage if not already set (unless skipIfSet is false)
    if (skipIfSet && selectedProjectId.value) {
      return;
    }

    try {
      const result = await chrome.storage.local.get(STORAGE_KEY_SELECTED_PROJECT);
      if (result[STORAGE_KEY_SELECTED_PROJECT]) {
        const loadedId = result[STORAGE_KEY_SELECTED_PROJECT];
        // Validate: only set if the project actually exists in current projects list
        if (projects.value.some((p) => p.id === loadedId)) {
          selectedProjectId.value = loadedId;
        } else {
          console.warn(
            `[StandaloneAgent] Stored selected project ${loadedId} not found in projects list`,
          );
          // Clear the invalid selected project ID
          selectedProjectId.value = '';
          await saveSelectedProjectId();
        }
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

    // Create default project with a valid rootPath (must be under /Users/heal for native server)
    const project: AgentProject = {
      id: generateId(),
      name: 'Default',
      rootPath: '/Users/heal/.chrome-mcp-agent/workspaces/default',
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

  /**
   * Clean up orphan sessions (sessions whose project no longer exists).
   * Loads all projects from storage to determine valid project IDs.
   */
  async function cleanupOrphanSessions(): Promise<void> {
    // Load all projects from storage to determine valid project IDs
    const storedProjects = await loadArrayFromStorage<AgentProject>(STORAGE_KEY_PROJECTS, []);
    const validProjectIds = storedProjects.map((p) => p.id);

    const storedSessions = await loadArrayFromStorage<AgentSession>(STORAGE_KEY_SESSIONS, []);
    const orphanSessions = storedSessions.filter((s) => !validProjectIds.includes(s.projectId));

    if (orphanSessions.length > 0) {
      console.log(
        '[StandaloneAgent] Found',
        orphanSessions.length,
        'orphan sessions, cleaning up...',
      );
      console.log(
        '[StandaloneAgent] Orphan sessions:',
        orphanSessions.map((s) => ({ id: s.id, projectId: s.projectId, name: s.name })),
      );
      console.log('[StandaloneAgent] Valid project IDs:', validProjectIds);

      // Keep only sessions with valid project IDs
      const validSessions = storedSessions.filter((s) => validProjectIds.includes(s.projectId));
      await saveToStorage(STORAGE_KEY_SESSIONS, validSessions);

      // Update reactive state
      allSessions.value = validSessions.sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );

      // Clear selected session if it was an orphan
      if (selectedSessionId.value && !validSessions.find((s) => s.id === selectedSessionId.value)) {
        selectedSessionId.value = '';
        await saveSelectedSessionId();
      }

      console.log(
        '[StandaloneAgent] Orphan sessions cleaned up. Remaining sessions:',
        validSessions.length,
      );
    }
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
    console.warn('[StandaloneAgent.fetchSessions] Starting for project:', projectId);
    if (!projectId) {
      console.warn('[StandaloneAgent.fetchSessions] No projectId, skipping');
      return;
    }

    isLoadingSessions.value = true;
    sessionError.value = null;

    try {
      const stored = await loadArrayFromStorage<AgentSession>(STORAGE_KEY_SESSIONS, []);
      console.warn(
        '[StandaloneAgent.fetchSessions] Loaded',
        stored.length,
        'sessions from storage',
      );
      console.warn(
        '[StandaloneAgent.fetchSessions] All stored sessions:',
        stored.map((s) => ({ id: s.id, projectId: s.projectId, name: s.name })),
      );

      const projectSessions = stored.filter((s) => s.projectId === projectId);
      console.warn(
        '[StandaloneAgent.fetchSessions] Found',
        projectSessions.length,
        'sessions for this project',
      );
      console.warn(
        '[StandaloneAgent.fetchSessions] Project sessions:',
        projectSessions.map((s) => ({ id: s.id, name: s.name })),
      );

      sessions.value = projectSessions.sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );

      if (sessions.value.length > 0 && !selectedSessionId.value) {
        console.warn(
          '[StandaloneAgent.fetchSessions] Auto-selecting first session:',
          sessions.value[0].id,
        );
        selectedSessionId.value = sessions.value[0].id;
        await saveSelectedSessionId();
      }
    } catch (error) {
      console.error('[StandaloneAgent.fetchSessions] Error:', error);
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

  /**
   * Sync all existing sessions to native server if available.
   * Called when server becomes ready to ensure local sessions are synced.
   * Only syncs once per page load to avoid duplicate sync attempts.
   */
  async function syncAllSessionsToServer(): Promise<void> {
    // Prevent duplicate sync attempts
    if (sessionsSynced) {
      console.log('[StandaloneAgent] Sessions already synced to server, skipping duplicate sync');
      return;
    }

    const port = await getServerPort();
    if (!port) {
      console.log('[StandaloneAgent] Native server not running, skipping session sync');
      return;
    }

    try {
      // First sync all projects
      for (const project of projects.value) {
        await syncProjectToServer(project);
      }

      // Then sync all sessions
      const stored = await loadArrayFromStorage<AgentSession>(STORAGE_KEY_SESSIONS, []);
      if (stored.length === 0) {
        console.log('[StandaloneAgent] No local sessions to sync');
        sessionsSynced = true;
        return;
      }

      console.log(`[StandaloneAgent] Syncing ${stored.length} sessions to server...`);
      const results = await Promise.all(stored.map((session) => syncSessionToServer(session)));
      const successCount = results.filter((r) => r).length;
      console.log(
        `[StandaloneAgent] Finished syncing ${stored.length} sessions: ${successCount}/${stored.length} succeeded`,
      );

      // Mark as synced only if all sessions succeeded
      if (successCount === stored.length) {
        sessionsSynced = true;
      }
    } catch (error) {
      console.error('[StandaloneAgent] Failed to sync sessions:', error);
    }
  }

  /**
   * Check if a session exists on the native server.
   * If not, sync it. Returns true if session exists or was synced successfully.
   */
  async function ensureSessionSynced(sessionId: string): Promise<boolean> {
    const port = await getServerPort();
    if (!port) {
      console.log('[StandaloneAgent] Native server not running, cannot check session sync');
      return false;
    }

    try {
      // Try to get session from server
      const url = `http://127.0.0.1:${port}/agent/sessions/${encodeURIComponent(sessionId)}`;
      const response = await fetch(url);

      if (response.ok) {
        // Session exists on server
        console.log(`[StandaloneAgent] Session ${sessionId} confirmed on server`);
        return true;
      }

      if (response.status === 404) {
        // Session doesn't exist on server - find it locally and sync
        console.log(`[StandaloneAgent] Session ${sessionId} not found on server, syncing...`);
        const stored = await loadArrayFromStorage<AgentSession>(STORAGE_KEY_SESSIONS, []);
        const session = stored.find((s) => s.id === sessionId);
        if (session) {
          // Ensure project is synced first
          const project = projects.value.find((p) => p.id === session.projectId);
          if (project) {
            await syncProjectToServer(project);
          }
          // Sync the session and return result
          const syncResult = await syncSessionToServer(session);
          if (syncResult) {
            console.log(`[StandaloneAgent] Session ${sessionId} synced to server successfully`);
          } else {
            console.error(`[StandaloneAgent] Session ${sessionId} sync failed`);
          }
          return syncResult;
        }
        console.warn(`[StandaloneAgent] Session ${sessionId} not found locally either`);
        return false;
      }

      // Other error - log but don't fail
      console.warn(
        `[StandaloneAgent] Failed to check session ${sessionId}: HTTP ${response.status}`,
      );
      return false;
    } catch (error) {
      console.error('[StandaloneAgent] Error checking session sync:', error);
      return false;
    }
  }

  async function selectSession(sessionId: string): Promise<void> {
    if (selectedSessionId.value === sessionId) return;

    selectedSessionId.value = sessionId;
    await saveSelectedSessionId();
  }

  /**
   * Get server port if native server is running.
   */
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
    return null;
  }

  /**
   * Sync project to native server if available.
   * Best-effort, non-blocking.
   */
  async function syncProjectToServer(project: AgentProject): Promise<boolean> {
    const port = await getServerPort();
    if (!port) {
      console.log('[StandaloneAgent] Native server not running, cannot sync project');
      return false;
    }

    try {
      const url = `http://127.0.0.1:${port}/agent/projects`;
      console.log(`[StandaloneAgent] Syncing project ${project.id} to server...`);
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: project.id,
          name: project.name,
          rootPath: project.rootPath,
          preferredCli: project.preferredCli,
          selectedModel: project.selectedModel,
          useCcr: project.useCcr,
          enableChromeMcp: project.enableChromeMcp,
        }),
      });
      const responseText = await response.text().catch(() => '');
      if (!response.ok) {
        if (response.status === 409) {
          console.log(`[StandaloneAgent] Project already exists on server: ${project.id}`);
          return true;
        }
        console.error(
          `[StandaloneAgent] Failed to sync project ${project.id}: HTTP ${response.status} ${responseText}`,
        );
        return false;
      }
      console.log(`[StandaloneAgent] Project synced to server: ${project.id}`);
      return true;
    } catch (err) {
      console.error(`[StandaloneAgent] Failed to sync project:`, err);
      return false;
    }
  }

  /**
   * Sync session to native server if available.
   * @param retryCount - Number of retries attempted (for internal use)
   * @returns true if sync succeeded, false if failed after retries
   */
  async function syncSessionToServer(session: AgentSession, retryCount = 0): Promise<boolean> {
    const port = await getServerPort();
    if (!port) {
      console.log('[StandaloneAgent] Native server not running, session stored locally only');
      return false;
    }

    try {
      // First, ensure project exists on server
      let project = projects.value.find((p) => p.id === session.projectId);

      // If project not found in reactive state, try to load from storage
      if (!project) {
        console.log(
          `[StandaloneAgent] Project ${session.projectId} not in projects.value, loading from storage...`,
        );
        const storedProjects = await loadArrayFromStorage<AgentProject>(STORAGE_KEY_PROJECTS, []);
        project = storedProjects.find((p) => p.id === session.projectId);
        if (project) {
          console.log(`[StandaloneAgent] Project ${session.projectId} loaded from storage`);
          // Update reactive state
          projects.value = storedProjects;
        }
      }

      if (project) {
        await syncProjectToServer(project);
      } else {
        console.error(
          `[StandaloneAgent] Project ${session.projectId} not found in local state or storage, cannot sync session`,
        );
        return false;
      }

      const url = `http://127.0.0.1:${port}/agent/projects/${encodeURIComponent(session.projectId)}/sessions`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: session.id,
          engineName: session.engineName,
          name: session.name,
          model: session.model,
          optionsConfig: session.optionsConfig,
        }),
      });
      if (!response.ok) {
        const errorText = await response.text().catch(() => '');

        // Handle 409 Conflict - session already exists on server
        if (response.status === 409) {
          console.log(
            `[StandaloneAgent] Session ${session.id} already exists on server (409 Conflict), skipping sync`,
          );
          return true; // Consider it as success since session exists
        }

        // Handle UNIQUE constraint error in 500 response
        if (errorText.includes('UNIQUE constraint failed')) {
          console.log(
            `[StandaloneAgent] Session ${session.id} already exists on server (UNIQUE constraint), skipping sync`,
          );
          return true; // Consider it as success since session exists
        }

        // Retry logic: if server returns 400 (e.g., project not found yet), retry up to 3 times
        if (response.status === 400 && retryCount < 3) {
          console.log(`[StandaloneAgent] Sync failed (400), retrying... (${retryCount + 1}/3)`);
          await new Promise((resolve) => setTimeout(resolve, 500));
          return syncSessionToServer(session, retryCount + 1);
        }

        console.error(
          `[StandaloneAgent] Failed to sync session ${session.id}: HTTP ${response.status} ${errorText}`,
        );
        return false;
      }
      console.log(`[StandaloneAgent] Session synced to server: ${session.id}`);
      return true;
    } catch (err) {
      // Network error - retry up to 3 times with exponential backoff
      if (retryCount < 3) {
        const delay = 500 * Math.pow(2, retryCount);
        console.log(
          `[StandaloneAgent] Sync error, retrying in ${delay}ms... (${retryCount + 1}/3)`,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        return syncSessionToServer(session, retryCount + 1);
      }
      console.error(`[StandaloneAgent] Failed to sync session:`, err);
      return false;
    }
  }

  async function createSession(
    projectId: string,
    input: CreateAgentSessionInput,
  ): Promise<AgentSession | null> {
    isCreatingSession.value = true;
    sessionError.value = null;

    try {
      // Ensure the project exists - if not, switch to a valid project
      let effectiveProjectId = projectId;
      let project = projects.value.find((p) => p.id === projectId);

      if (!project) {
        console.warn(`[StandaloneAgent] Project ${projectId} not found, attempting to fix...`);
        // Try loading projects from storage in case reactive state is stale
        const storedProjects = await loadArrayFromStorage<AgentProject>(STORAGE_KEY_PROJECTS, []);
        project = storedProjects.find((p) => p.id === projectId);

        if (project) {
          // Project exists in storage but not in reactive state - update reactive state
          projects.value = storedProjects;
          console.log(`[StandaloneAgent] Project ${projectId} restored from storage`);
        } else {
          // Project truly doesn't exist - switch to first available or create default
          if (storedProjects.length > 0) {
            effectiveProjectId = storedProjects[0].id;
            selectedProjectId.value = effectiveProjectId;
            await saveSelectedProjectId();
            projects.value = storedProjects;
            console.warn(`[StandaloneAgent] Switched to project ${effectiveProjectId}`);
          } else {
            const defaultProject = await ensureDefaultProject();
            if (!defaultProject) {
              sessionError.value = 'No valid project available';
              return null;
            }
            effectiveProjectId = defaultProject.id;
            console.warn(
              `[StandaloneAgent] Created and switched to default project ${effectiveProjectId}`,
            );
          }
        }
      }

      const session: AgentSession = {
        id: generateId(),
        projectId: effectiveProjectId,
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

      // Sync to native server (blocking to ensure server has the session before use)
      const syncResult = await syncSessionToServer(session);
      if (!syncResult) {
        console.error(`[StandaloneAgent] Failed to sync session ${session.id} to server`);
        sessionError.value = 'Failed to sync session to server';
        return null;
      }

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
    // Prevent concurrent calls to ensureDefaultSession
    if (ensureDefaultSessionRunning) {
      console.warn(
        '[StandaloneAgent.ensureDefaultSession] Already running, skipping concurrent call',
      );
      return selectedSession.value;
    }
    ensureDefaultSessionRunning = true;

    try {
      console.warn(
        '[StandaloneAgent.ensureDefaultSession] Starting for project:',
        projectId,
        'engine:',
        engineName,
      );
      console.warn(
        '[StandaloneAgent.ensureDefaultSession] Current sessions.value.length:',
        sessions.value.length,
      );
      console.warn(
        '[StandaloneAgent.ensureDefaultSession] Current selectedSessionId:',
        selectedSessionId.value,
      );
      console.warn(
        '[StandaloneAgent.ensureDefaultSession] allSessions.value.length:',
        allSessions.value.length,
      );

      // CRITICAL: Check storage directly first before any reactive state checks
      // This is the most reliable way to determine if sessions exist
      const storedSessions = await loadArrayFromStorage<AgentSession>(STORAGE_KEY_SESSIONS, []);
      const storedSessionsForProject = storedSessions.filter((s) => s.projectId === projectId);
      console.warn(
        '[StandaloneAgent.ensureDefaultSession] Storage check: Found',
        storedSessionsForProject.length,
        'sessions in storage for this project',
      );
      console.warn(
        '[StandaloneAgent.ensureDefaultSession] Storage sessions:',
        storedSessionsForProject.map((s) => ({ id: s.id, projectId: s.projectId, name: s.name })),
      );

      // If sessions exist in storage, use them (don't create new ones)
      if (storedSessionsForProject.length > 0) {
        console.warn('[StandaloneAgent.ensureDefaultSession] Using existing sessions from storage');
        allSessions.value = storedSessions.sort(
          (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
        );
        sessions.value = storedSessionsForProject.sort(
          (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
        );

        // Select first session if none selected or selected is invalid
        if (
          !selectedSessionId.value ||
          !sessions.value.find((s) => s.id === selectedSessionId.value)
        ) {
          console.warn(
            '[StandaloneAgent.ensureDefaultSession] Selecting first session from storage:',
            sessions.value[0].id,
          );
          await selectSession(sessions.value[0].id);
        }
        return selectedSession.value;
      }

      console.warn(
        '[StandaloneAgent.ensureDefaultSession] No sessions in storage, will check reactive state...',
      );

      // Fallback: Check reactive state (should not happen if storage was empty)
      if (sessions.value.length > 0) {
        if (
          !selectedSessionId.value ||
          !sessions.value.find((s) => s.id === selectedSessionId.value)
        ) {
          console.warn(
            '[StandaloneAgent.ensureDefaultSession] Selecting first session from reactive state:',
            sessions.value[0].id,
          );
          await selectSession(sessions.value[0].id);
        }
        return selectedSession.value;
      }

      // Also check allSessions as fallback
      const sessionsForProject = allSessions.value.filter((s) => s.projectId === projectId);
      if (sessionsForProject.length > 0) {
        console.warn(
          '[StandaloneAgent.ensureDefaultSession] Found',
          sessionsForProject.length,
          'sessions in allSessions',
        );
        sessions.value = sessionsForProject;
        if (
          !selectedSessionId.value ||
          !sessions.value.find((s) => s.id === selectedSessionId.value)
        ) {
          await selectSession(sessionsForProject[0].id);
        }
        return selectedSession.value;
      }

      // No sessions found anywhere - create default session
      console.warn(
        '[StandaloneAgent.ensureDefaultSession] No sessions found anywhere, creating default session',
      );
      return createSession(projectId, {
        engineName,
        name: 'Default Session',
      });
    } finally {
      ensureDefaultSessionRunning = false;
    }
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
    syncAllSessionsToServer,
    ensureSessionSynced,
    cleanupOrphanSessions,

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
