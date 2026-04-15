/**
 * Composable for managing Agent Server connection state.
 * Handles native host connection, server status, and SSE stream.
 */
import { ref, computed, onUnmounted } from 'vue';
import { NativeMessageType } from 'chrome-mcp-shared';
import { BACKGROUND_MESSAGE_TYPES } from '@/common/message-types';
import type { AgentEngineInfo, RealtimeEvent } from 'chrome-mcp-shared';

interface ServerStatus {
  isRunning: boolean;
  port?: number;
  lastUpdated: number;
}

export interface UseAgentServerOptions {
  /**
   * Get the session ID for SSE routing.
   * Must be provided by caller (typically DB session ID).
   */
  getSessionId?: () => string;
  onMessage?: (event: RealtimeEvent) => void;
  onError?: (error: string) => void;
}

export function useAgentServer(options: UseAgentServerOptions = {}) {
  // State
  const serverPort = ref<number | null>(null);
  const nativeConnected = ref(false);
  const serverStatus = ref<ServerStatus | null>(null);
  const connecting = ref(false);
  const engines = ref<AgentEngineInfo[]>([]);
  const eventSource = ref<EventSource | null>(null);

  // Reconnection state
  let reconnectAttempts = 0;
  const MAX_RECONNECT_ATTEMPTS = 5;
  const BASE_RECONNECT_DELAY = 1000;

  // Track which sessionId the current SSE connection is subscribed to
  let currentStreamSessionId: string | null = null;

  // Computed
  /**
   * Whether the server is ready for use.
   * Returns true when server status shows running and we have a port.
   * This works for both:
   * 1. Full Native Messaging connection, OR
   * 2. HTTP-only detection (external server start)
   */
  const isServerReady = computed(() => {
    return serverStatus.value?.isRunning === true && serverPort.value !== null;
  });

  // Check native host connection using existing message type
  async function checkNativeHost(): Promise<boolean> {
    try {
      const response = await chrome.runtime.sendMessage({
        type: NativeMessageType.PING_NATIVE,
      });
      nativeConnected.value = response?.connected ?? false;
      return nativeConnected.value;
    } catch (error) {
      console.error('Failed to check native host:', error);
      nativeConnected.value = false;
      return false;
    }
  }

  /**
   * Start native host connection.
   * @param forceConnect - If true, use CONNECT_NATIVE (re-enables auto-connect).
   *                       If false, use ENSURE_NATIVE (respects current auto-connect setting).
   */
  async function startNativeHost(forceConnect = false): Promise<boolean> {
    try {
      const response = await chrome.runtime.sendMessage({
        type: forceConnect ? NativeMessageType.CONNECT_NATIVE : NativeMessageType.ENSURE_NATIVE,
      });
      // Handle both response formats: { connected: boolean } and { success: boolean }
      nativeConnected.value =
        typeof response?.connected === 'boolean'
          ? response.connected
          : (response?.success ?? false);
      return nativeConnected.value;
    } catch (error) {
      console.error('Failed to start native host:', error);
      nativeConnected.value = false;
      return false;
    }
  }

  // Get server status using existing message type
  async function getServerStatus(): Promise<ServerStatus | null> {
    try {
      const response = await chrome.runtime.sendMessage({
        type: BACKGROUND_MESSAGE_TYPES.GET_SERVER_STATUS,
      });
      if (response?.serverStatus) {
        serverStatus.value = response.serverStatus;
        if (response.serverStatus.port) {
          serverPort.value = response.serverStatus.port;
        }
        // Also update native connected status from response
        if (typeof response.connected === 'boolean') {
          nativeConnected.value = response.connected;
        }
        return response.serverStatus;
      }
      return null;
    } catch (error) {
      console.error('Failed to get server status:', error);
      return null;
    }
  }

  /**
   * Directly probe HTTP server to check if it's running and get port.
   * Used as fallback when Native Messaging is not available.
   */
  async function probeHttpServer(port?: number): Promise<number | null> {
    const portsToTry = port ? [port, NATIVE_HOST.DEFAULT_PORT] : [NATIVE_HOST.DEFAULT_PORT];
    for (const p of portsToTry) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000);
        const response = await fetch(`http://127.0.0.1:${p}/ping`, {
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        if (response.ok) {
          console.log(`[AgentServer] HTTP server probe succeeded on port ${p}`);
          return p;
        }
      } catch {
        // Try next port
      }
    }
    return null;
  }

  interface EnsureNativeServerOptions {
    /** If true, use CONNECT_NATIVE to re-enable auto-connect */
    forceConnect?: boolean;
  }

  // Ensure native server is ready
  async function ensureNativeServer(opts: EnsureNativeServerOptions = {}): Promise<boolean> {
    const { forceConnect = false } = opts;
    connecting.value = true;
    try {
      // Step 1: Check native host connection
      let connected = await checkNativeHost();
      if (!connected) {
        // Try to start native host
        connected = await startNativeHost(forceConnect);
      }

      // Step 2: Poll for server status (handles async SERVER_STARTED race condition)
      const POLL_INTERVAL = 200;
      const POLL_TIMEOUT = 3000; // Reduced from 5s to 3s
      const start = Date.now();

      while (Date.now() - start < POLL_TIMEOUT) {
        const status = await getServerStatus();
        if (status?.isRunning && status.port) {
          serverPort.value = status.port;
          serverStatus.value = status;
          // Server confirmed via Native Messaging - fetch engines and return
          await fetchEngines();
          return true;
        }
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));
      }

      // Step 3: Native Messaging did not confirm server running - try HTTP probe
      // This handles cases where:
      // - Server was started externally (npm run dev, node -e, etc.)
      // - Native Messaging connected but SERVER_STARTED not received
      // - Native Messaging connected to old dead process
      console.warn('[AgentServer] Native Messaging did not confirm server, trying HTTP probe...');
      const httpPort = await probeHttpServer();
      if (httpPort) {
        serverPort.value = httpPort;
        serverStatus.value = { isRunning: true, port: httpPort, lastUpdated: Date.now() };
        nativeConnected.value = false; // HTTP server started externally
        console.log('[AgentServer] HTTP server detected on port', httpPort, '- enabling MCP mode');
        await fetchEngines();
        return true;
      }

      console.error('[AgentServer] Server not running - neither via Native Messaging nor HTTP');
      return false;
    } finally {
      connecting.value = false;
    }
  }

  // Fetch available engines
  async function fetchEngines(): Promise<void> {
    if (!serverPort.value) return;
    try {
      const url = `http://127.0.0.1:${serverPort.value}/agent/engines`;
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        engines.value = data.engines || [];
      }
    } catch (error) {
      console.error('Failed to fetch engines:', error);
    }
  }

  // Check if SSE is connected
  function isEventSourceConnected(): boolean {
    return eventSource.value !== null && eventSource.value.readyState === EventSource.OPEN;
  }

  // Open SSE connection (skip if already connected to same session)
  function openEventSource(): void {
    const targetSessionId = options.getSessionId?.()?.trim() ?? '';
    if (!serverPort.value || !targetSessionId) return;

    // Skip if already connected to the same session
    if (isEventSourceConnected() && currentStreamSessionId === targetSessionId) {
      console.log('[AgentServer] SSE already connected to session, skipping reconnect');
      return;
    }

    // Close existing connection before subscribing to a new session
    closeEventSource();

    currentStreamSessionId = targetSessionId;
    const url = `http://127.0.0.1:${serverPort.value}/agent/chat/${encodeURIComponent(targetSessionId)}/stream`;
    const es = new EventSource(url);

    es.onopen = () => {
      console.log('[AgentServer] SSE connection opened');
      reconnectAttempts = 0;
    };

    es.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data) as RealtimeEvent;
        options.onMessage?.(parsed);
      } catch (err) {
        console.error('[AgentServer] Failed to parse SSE message:', err);
      }
    };

    es.onerror = (error) => {
      console.error('[AgentServer] SSE error:', error);
      es.close();
      eventSource.value = null;

      // Attempt reconnection with exponential backoff
      if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        const delay = BASE_RECONNECT_DELAY * Math.pow(2, reconnectAttempts);
        reconnectAttempts++;
        console.log(`[AgentServer] Reconnecting in ${delay}ms (attempt ${reconnectAttempts})`);
        setTimeout(() => {
          if (isServerReady.value) {
            openEventSource();
          }
        }, delay);
      } else {
        options.onError?.('SSE connection failed after multiple attempts');
      }
    };

    eventSource.value = es;
  }

  // Close SSE connection
  function closeEventSource(): void {
    if (eventSource.value) {
      eventSource.value.close();
      eventSource.value = null;
    }
    currentStreamSessionId = null;
  }

  // Reconnect to server (explicit user action, re-enables auto-connect)
  async function reconnect(): Promise<void> {
    closeEventSource();
    reconnectAttempts = 0;
    // Explicit user reconnect: force connect to re-enable auto-connect in background
    await ensureNativeServer({ forceConnect: true });
    if (isServerReady.value) {
      openEventSource();
    }
  }

  // Initialize
  async function initialize(): Promise<void> {
    await ensureNativeServer();
    // Note: SSE connection is now opened explicitly when session is ready
  }

  // Cleanup on unmount
  onUnmounted(() => {
    closeEventSource();
  });

  return {
    // State
    serverPort,
    nativeConnected,
    serverStatus,
    connecting,
    engines,
    eventSource,

    // Computed
    isServerReady,

    // Methods
    ensureNativeServer,
    fetchEngines,
    openEventSource,
    closeEventSource,
    isEventSourceConnected,
    reconnect,
    initialize,
  };
}
