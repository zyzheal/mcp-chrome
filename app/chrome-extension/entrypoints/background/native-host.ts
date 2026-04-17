import { NativeMessageType } from 'chrome-mcp-shared';
import { BACKGROUND_MESSAGE_TYPES } from '@/common/message-types';
import { NATIVE_HOST, STORAGE_KEYS, ERROR_MESSAGES, SUCCESS_MESSAGES } from '@/common/constants';
import { getConnectionMode, type ConnectionMode } from '../../common/connection-mode.js';
import { handleCallTool } from './tools';
import { listPublished, getFlow } from './record-replay/flow-store';
import { acquireKeepalive } from './keepalive-manager';

const LOG_PREFIX = '[NativeHost]';

let nativePort: chrome.runtime.Port | null = null;
export const HOST_NAME = NATIVE_HOST.NAME;

// ==================== Reconnect Configuration ====================

const RECONNECT_BASE_DELAY_MS = 500;
const RECONNECT_MAX_DELAY_MS = 60_000;
const RECONNECT_MAX_FAST_ATTEMPTS = 8;
const RECONNECT_COOLDOWN_DELAY_MS = 5 * 60_000;

// ==================== Auto-connect State ====================

let keepaliveRelease: (() => void) | null = null;
let autoConnectEnabled = true;
let autoConnectLoaded = false;
let ensurePromise: Promise<boolean> | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempts = 0;
let manualDisconnect = false;

/**
 * Server status management interface
 */
interface ServerStatus {
  isRunning: boolean;
  port?: number;
  lastUpdated: number;
}

let currentServerStatus: ServerStatus = {
  isRunning: false,
  lastUpdated: Date.now(),
};

/**
 * Save server status to chrome.storage
 */
async function saveServerStatus(status: ServerStatus): Promise<void> {
  try {
    await chrome.storage.local.set({ [STORAGE_KEYS.SERVER_STATUS]: status });
  } catch (error) {
    console.error(ERROR_MESSAGES.SERVER_STATUS_SAVE_FAILED, error);
  }
}

/**
 * Load server status from chrome.storage
 */
async function loadServerStatus(): Promise<ServerStatus> {
  try {
    const result = await chrome.storage.local.get([STORAGE_KEYS.SERVER_STATUS]);
    if (result[STORAGE_KEYS.SERVER_STATUS]) {
      return result[STORAGE_KEYS.SERVER_STATUS];
    }
  } catch (error) {
    console.error(ERROR_MESSAGES.SERVER_STATUS_LOAD_FAILED, error);
  }
  return {
    isRunning: false,
    lastUpdated: Date.now(),
  };
}

/**
 * Broadcast server status change to all listeners
 */
function broadcastServerStatusChange(status: ServerStatus): void {
  chrome.runtime
    .sendMessage({
      type: BACKGROUND_MESSAGE_TYPES.SERVER_STATUS_CHANGED,
      payload: status,
    })
    .catch(() => {
      // Ignore errors if no listeners are present
    });
}

/**
 * Directly probe HTTP server to check if it's running.
 * Used as fallback when Native Messaging hasn't received SERVER_STARTED.
 */
async function probeHttpServer(): Promise<ServerStatus | null> {
  const defaultPort = NATIVE_HOST.DEFAULT_PORT;
  const portsToTry = currentServerStatus.port
    ? [currentServerStatus.port, defaultPort]
    : [defaultPort];

  for (const port of portsToTry) {
    if (!port) continue;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);
      const response = await fetch(`http://127.0.0.1:${port}/ping`, {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (response.ok) {
        console.log('[NativeHost] HTTP probe succeeded on port', port);
        return {
          isRunning: true,
          port: port,
          lastUpdated: Date.now(),
        };
      }
    } catch {
      // Try next port
    }
  }
  return null;
}

// ==================== Port Normalization ====================

/**
 * Normalize a port value to a valid port number or null.
 */
function normalizePort(value: unknown): number | null {
  const n =
    typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;
  if (!Number.isFinite(n)) return null;
  const port = Math.floor(n);
  if (port <= 0 || port > 65535) return null;
  return port;
}

// ==================== Reconnect Utilities ====================

/**
 * Add jitter to a delay value to avoid thundering herd.
 */
function withJitter(ms: number): number {
  const ratio = 0.7 + Math.random() * 0.6;
  return Math.max(0, Math.round(ms * ratio));
}

/**
 * Calculate reconnect delay based on attempt number.
 * Uses exponential backoff with jitter, then switches to cooldown interval.
 */
function getReconnectDelayMs(attempt: number): number {
  if (attempt >= RECONNECT_MAX_FAST_ATTEMPTS) {
    return withJitter(RECONNECT_COOLDOWN_DELAY_MS);
  }
  const delay = Math.min(RECONNECT_BASE_DELAY_MS * Math.pow(2, attempt), RECONNECT_MAX_DELAY_MS);
  return withJitter(delay);
}

/**
 * Clear the reconnect timer if active.
 */
function clearReconnectTimer(): void {
  if (!reconnectTimer) return;
  clearTimeout(reconnectTimer);
  reconnectTimer = null;
}

/**
 * Reset reconnect state after successful connection.
 */
function resetReconnectState(): void {
  reconnectAttempts = 0;
  clearReconnectTimer();
}

// ==================== Keepalive Management ====================

/**
 * Sync keepalive hold based on autoConnectEnabled state.
 * When auto-connect is enabled, we hold a keepalive reference to keep SW alive.
 */
function syncKeepaliveHold(): void {
  if (autoConnectEnabled) {
    if (!keepaliveRelease) {
      keepaliveRelease = acquireKeepalive('native-host');
      console.debug(`${LOG_PREFIX} Acquired keepalive`);
    }
    return;
  }
  if (keepaliveRelease) {
    try {
      keepaliveRelease();
      console.debug(`${LOG_PREFIX} Released keepalive`);
    } catch {
      // Ignore
    }
    keepaliveRelease = null;
  }
}

// ==================== Auto-connect Settings ====================

/**
 * Load the nativeAutoConnectEnabled setting from storage.
 */
async function loadNativeAutoConnectEnabled(): Promise<boolean> {
  try {
    const result = await chrome.storage.local.get([STORAGE_KEYS.NATIVE_AUTO_CONNECT_ENABLED]);
    const raw = result[STORAGE_KEYS.NATIVE_AUTO_CONNECT_ENABLED];
    if (typeof raw === 'boolean') return raw;
  } catch (error) {
    console.warn(`${LOG_PREFIX} Failed to load nativeAutoConnectEnabled`, error);
  }
  return true; // Default to enabled
}

/**
 * Set the nativeAutoConnectEnabled setting and persist to storage.
 */
async function setNativeAutoConnectEnabled(enabled: boolean): Promise<void> {
  autoConnectEnabled = enabled;
  autoConnectLoaded = true;
  try {
    await chrome.storage.local.set({ [STORAGE_KEYS.NATIVE_AUTO_CONNECT_ENABLED]: enabled });
    console.debug(`${LOG_PREFIX} Set nativeAutoConnectEnabled=${enabled}`);
  } catch (error) {
    console.warn(`${LOG_PREFIX} Failed to persist nativeAutoConnectEnabled`, error);
  }
  syncKeepaliveHold();
}

// ==================== Port Preference ====================

/**
 * Get the preferred port for connecting to native server.
 * Priority: explicit override > user preference > last known port > default
 */
async function getPreferredPort(override?: unknown): Promise<number> {
  const explicit = normalizePort(override);
  if (explicit) return explicit;

  try {
    const result = await chrome.storage.local.get([
      STORAGE_KEYS.NATIVE_SERVER_PORT,
      STORAGE_KEYS.SERVER_STATUS,
    ]);

    const userPort = normalizePort(result[STORAGE_KEYS.NATIVE_SERVER_PORT]);
    if (userPort) return userPort;

    const status = result[STORAGE_KEYS.SERVER_STATUS] as Partial<ServerStatus> | undefined;
    const statusPort = normalizePort(status?.port);
    if (statusPort) return statusPort;
  } catch (error) {
    console.warn(`${LOG_PREFIX} Failed to read preferred port`, error);
  }

  const inMemoryPort = normalizePort(currentServerStatus.port);
  if (inMemoryPort) return inMemoryPort;

  return NATIVE_HOST.DEFAULT_PORT;
}

// ==================== Reconnect Scheduling ====================

/**
 * Schedule a reconnect attempt with exponential backoff.
 */
function scheduleReconnect(reason: string): void {
  if (nativePort) return;
  if (manualDisconnect) return;
  if (!autoConnectEnabled) return;
  if (reconnectTimer) return;

  const delay = getReconnectDelayMs(reconnectAttempts);
  console.debug(
    `${LOG_PREFIX} Reconnect scheduled in ${delay}ms (attempt=${reconnectAttempts}, reason=${reason})`,
  );

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (nativePort) return;
    if (manualDisconnect || !autoConnectEnabled) return;

    reconnectAttempts += 1;
    void ensureNativeConnected(`reconnect:${reason}`).catch(() => {});
  }, delay);
}

// ==================== Server Status Update ====================

/**
 * Mark server as stopped and broadcast the change.
 */
async function markServerStopped(reason: string): Promise<void> {
  currentServerStatus = {
    isRunning: false,
    port: currentServerStatus.port,
    lastUpdated: Date.now(),
  };
  try {
    await saveServerStatus(currentServerStatus);
  } catch {
    // Ignore
  }
  broadcastServerStatusChange(currentServerStatus);
  console.debug(`${LOG_PREFIX} Server marked stopped (${reason})`);
}

// ==================== Core Ensure Function ====================

/**
 * Ensure native connection is established.
 * This is the main entry point for auto-connect logic.
 *
 * @param trigger - Description of what triggered this call (for logging)
 * @param portOverride - Optional explicit port to use
 * @returns Whether the connection is now established
 */
async function ensureNativeConnected(trigger: string, portOverride?: unknown): Promise<boolean> {
  // Check connection mode: skip Native Messaging in cli-direct mode
  const mode = await getConnectionMode();
  if (mode === 'cli-direct') {
    console.log(
      `${LOG_PREFIX} Skipping Native Messaging connection in cli-direct mode (trigger=${trigger})`,
    );
    currentServerStatus = {
      isRunning: false,
      port: undefined,
      lastUpdated: Date.now(),
    };
    broadcastServerStatusChange(currentServerStatus);
    return false;
  }

  // Concurrency protection: only one ensure flow at a time
  if (ensurePromise) return ensurePromise;

  ensurePromise = (async () => {
    // Load auto-connect setting if not yet loaded
    if (!autoConnectLoaded) {
      autoConnectEnabled = await loadNativeAutoConnectEnabled();
      autoConnectLoaded = true;
      syncKeepaliveHold();
    }

    // If auto-connect is disabled, do nothing
    if (!autoConnectEnabled) {
      console.debug(`${LOG_PREFIX} Auto-connect disabled, skipping ensure (trigger=${trigger})`);
      return false;
    }

    // Sync keepalive hold
    syncKeepaliveHold();

    // Already connected
    if (nativePort) {
      console.debug(`${LOG_PREFIX} Already connected (trigger=${trigger})`);
      return true;
    }

    // Get the port to use
    const port = await getPreferredPort(portOverride);
    console.debug(`${LOG_PREFIX} Attempting connection on port ${port} (trigger=${trigger})`);

    // Attempt connection
    const ok = connectNativeHost(port);
    if (!ok) {
      console.warn(`${LOG_PREFIX} Connection failed (trigger=${trigger})`);
      scheduleReconnect(`connect_failed:${trigger}`);
      return false;
    }

    console.debug(`${LOG_PREFIX} Connection initiated successfully (trigger=${trigger})`);
    // Note: Don't reset reconnect state here. Wait for SERVER_STARTED confirmation.
    // Chrome may return a Port but disconnect immediately if native host is missing.
    return true;
  })().finally(() => {
    ensurePromise = null;
  });

  return ensurePromise;
}

/**
 * Connect to the native messaging host
 * @returns Whether the connection was initiated successfully
 */
export function connectNativeHost(port: number = NATIVE_HOST.DEFAULT_PORT): boolean {
  if (nativePort) {
    return true;
  }

  try {
    nativePort = chrome.runtime.connectNative(HOST_NAME);

    nativePort.onMessage.addListener(async (message) => {
      // ===== 融合版新增消息处理 =====

      // MCP Client 连接/断开状态
      if (message.type === 'mcp_connected') {
        console.log(`${LOG_PREFIX} MCP client connected`);
        broadcastServerStatusChange({
          isRunning: true,
          port: currentServerStatus.port,
          lastUpdated: Date.now(),
          mcpConnected: true,
        } as any);
        return;
      }

      if (message.type === 'mcp_disconnected') {
        console.log(`${LOG_PREFIX} MCP client disconnected`);
        broadcastServerStatusChange({
          isRunning: currentServerStatus.isRunning,
          port: currentServerStatus.port,
          lastUpdated: Date.now(),
          mcpConnected: false,
        } as any);
        return;
      }

      // 来自 MCP Client 的工具请求
      if (message.type === 'tool_request' && message.method) {
        const { method, params } = message;
        console.log(`${LOG_PREFIX} MCP tool_request: ${method}`);
        try {
          const result = await handleCallTool({
            name: method.replace('mcp__claude-in-chrome__', '').replace('browser_', ''),
            args: params,
          });
          nativePort?.postMessage({
            type: 'tool_response',
            payload: {
              status: 'success',
              message: SUCCESS_MESSAGES.TOOL_EXECUTED,
              data: result,
            },
          });
        } catch (error) {
          nativePort?.postMessage({
            type: 'tool_response',
            payload: {
              status: 'error',
              message: ERROR_MESSAGES.TOOL_EXECUTION_FAILED,
              error: error instanceof Error ? error.message : String(error),
            },
          });
        }
        return;
      }

      // Extension 自己发起的工具请求的执行命令
      if (message.type === 'EXECUTE_TOOL' && message.requestId) {
        const requestId = message.requestId;
        const payload = message.payload;
        console.log(`${LOG_PREFIX} EXECUTE_TOOL: ${payload?.name}`);
        try {
          const result = await handleCallTool(payload);
          nativePort?.postMessage({
            type: 'responseToRequestId',
            responseToRequestId: requestId,
            payload: {
              status: 'success',
              data: result,
            },
          });
        } catch (error) {
          nativePort?.postMessage({
            type: 'responseToRequestId',
            responseToRequestId: requestId,
            payload: {
              status: 'error',
              error: error instanceof Error ? error.message : String(error),
            },
          });
        }
        return;
      }

      // ===== 原有消息处理 =====

      if (message.type === NativeMessageType.PROCESS_DATA && message.requestId) {
        const requestId = message.requestId;
        const requestPayload = message.payload;

        nativePort?.postMessage({
          responseToRequestId: requestId,
          payload: {
            status: 'success',
            message: SUCCESS_MESSAGES.TOOL_EXECUTED,
            data: requestPayload,
          },
        });
      } else if (message.type === NativeMessageType.CALL_TOOL && message.requestId) {
        const requestId = message.requestId;
        try {
          const result = await handleCallTool(message.payload);
          nativePort?.postMessage({
            responseToRequestId: requestId,
            payload: {
              status: 'success',
              message: SUCCESS_MESSAGES.TOOL_EXECUTED,
              data: result,
            },
          });
        } catch (error) {
          nativePort?.postMessage({
            responseToRequestId: requestId,
            payload: {
              status: 'error',
              message: ERROR_MESSAGES.TOOL_EXECUTION_FAILED,
              error: error instanceof Error ? error.message : String(error),
            },
          });
        }
      } else if (message.type === 'rr_list_published_flows' && message.requestId) {
        const requestId = message.requestId;
        try {
          const published = await listPublished();
          const items = [] as any[];
          for (const p of published) {
            const flow = await getFlow(p.id);
            if (!flow) continue;
            items.push({
              id: p.id,
              slug: p.slug,
              version: p.version,
              name: p.name,
              description: p.description || flow.description || '',
              variables: flow.variables || [],
              meta: flow.meta || {},
            });
          }
          nativePort?.postMessage({
            responseToRequestId: requestId,
            payload: { status: 'success', items },
          });
        } catch (error: any) {
          nativePort?.postMessage({
            responseToRequestId: requestId,
            payload: { status: 'error', error: error?.message || String(error) },
          });
        }
      } else if (message.type === NativeMessageType.SERVER_STARTED) {
        const port = message.payload?.port;
        currentServerStatus = {
          isRunning: true,
          port: port,
          lastUpdated: Date.now(),
        };
        await saveServerStatus(currentServerStatus);
        broadcastServerStatusChange(currentServerStatus);
        // Server is confirmed running - now we can reset reconnect state
        resetReconnectState();
        console.log(`${SUCCESS_MESSAGES.SERVER_STARTED} on port ${port}`);
      } else if (message.type === NativeMessageType.SERVER_STOPPED) {
        currentServerStatus = {
          isRunning: false,
          port: currentServerStatus.port, // Keep last known port for reconnection
          lastUpdated: Date.now(),
        };
        await saveServerStatus(currentServerStatus);
        broadcastServerStatusChange(currentServerStatus);
        console.log(SUCCESS_MESSAGES.SERVER_STOPPED);
      } else if (message.type === NativeMessageType.ERROR_FROM_NATIVE_HOST) {
        console.error('Error from native host:', message.payload?.message || 'Unknown error');
      } else if (message.type === 'heartbeat_ping') {
        // Respond to heartbeat ping from native server
        nativePort?.postMessage({ type: 'pong_from_extension' });
      } else if (message.type === 'file_operation_response') {
        // Forward file operation response back to the requesting tool
        chrome.runtime.sendMessage(message).catch(() => {
          // Ignore if no listeners
        });
      }
    });

    nativePort.onDisconnect.addListener(() => {
      console.warn(ERROR_MESSAGES.NATIVE_DISCONNECTED, chrome.runtime.lastError);
      nativePort = null;

      // Mark server as stopped since native host disconnection means server is down
      void markServerStopped('native_port_disconnected');

      // Handle reconnection based on disconnect reason
      if (manualDisconnect) {
        manualDisconnect = false;
        return;
      }
      if (!autoConnectEnabled) return;
      scheduleReconnect('native_port_disconnected');
    });

    nativePort.postMessage({ type: NativeMessageType.START, payload: { port } });
    // Note: Don't reset reconnect state here. Wait for SERVER_STARTED confirmation.
    // Chrome may return a Port but disconnect immediately if native host is missing.
    return true;
  } catch (error) {
    console.warn(ERROR_MESSAGES.NATIVE_CONNECTION_FAILED, error);
    nativePort = null;
    return false;
  }
}

/**
 * Initialize native host listeners and load initial state
 */
export const initNativeHostListener = () => {
  // Initialize server status from storage
  loadServerStatus()
    .then((status) => {
      currentServerStatus = status;
    })
    .catch((error) => {
      console.error(ERROR_MESSAGES.SERVER_STATUS_LOAD_FAILED, error);
    });

  // Auto-connect on SW activation (covers SW restart after idle termination)
  void ensureNativeConnected('sw_startup').catch(() => {});

  // Auto-connect on Chrome browser startup
  chrome.runtime.onStartup.addListener(() => {
    void ensureNativeConnected('onStartup').catch(() => {});
  });

  // Auto-connect on extension install/update
  chrome.runtime.onInstalled.addListener(() => {
    void ensureNativeConnected('onInstalled').catch(() => {});
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    // Allow UI to call tools directly
    if (message && message.type === 'call_tool' && message.name) {
      handleCallTool({ name: message.name, args: message.args })
        .then((res) => sendResponse({ success: true, result: res }))
        .catch((err) =>
          sendResponse({ success: false, error: err instanceof Error ? err.message : String(err) }),
        );
      return true;
    }

    const msgType = typeof message === 'string' ? message : message?.type;

    // ENSURE_NATIVE: Trigger ensure without changing autoConnectEnabled
    if (msgType === NativeMessageType.ENSURE_NATIVE) {
      const portOverride = typeof message === 'object' ? message.port : undefined;
      ensureNativeConnected('ui_ensure', portOverride)
        .then((connected) => {
          sendResponse({ success: true, connected, autoConnectEnabled });
        })
        .catch((e) => {
          sendResponse({ success: false, connected: nativePort !== null, error: String(e) });
        });
      return true;
    }

    // CONNECT_NATIVE: Explicit user connect, re-enables auto-connect
    if (msgType === NativeMessageType.CONNECT_NATIVE) {
      const portOverride = typeof message === 'object' ? message.port : undefined;
      const normalized = normalizePort(portOverride);

      (async () => {
        // Explicit user connect: re-enable auto-connect
        await setNativeAutoConnectEnabled(true);

        if (normalized) {
          // Best-effort: persist preferred port
          try {
            await chrome.storage.local.set({ [STORAGE_KEYS.NATIVE_SERVER_PORT]: normalized });
          } catch {
            // Ignore
          }
        }

        return ensureNativeConnected('ui_connect', normalized ?? undefined);
      })()
        .then((connected) => {
          sendResponse({ success: true, connected });
        })
        .catch((e) => {
          sendResponse({ success: false, connected: nativePort !== null, error: String(e) });
        });
      return true;
    }

    if (msgType === NativeMessageType.PING_NATIVE) {
      const connected = nativePort !== null;
      sendResponse({ connected, autoConnectEnabled });
      return true;
    }

    // DISCONNECT_NATIVE: Explicit user disconnect, disables auto-connect
    if (msgType === NativeMessageType.DISCONNECT_NATIVE) {
      (async () => {
        // Explicit user disconnect: disable auto-connect and stop reconnect loop
        await setNativeAutoConnectEnabled(false);
        clearReconnectTimer();
        reconnectAttempts = 0;
        syncKeepaliveHold();

        if (nativePort) {
          // Only set manualDisconnect if we actually have a port to disconnect.
          // This prevents the flag from persisting when there's no active connection.
          manualDisconnect = true;
          try {
            nativePort.disconnect();
          } catch {
            // Ignore
          }
          nativePort = null;
        }
        await markServerStopped('manual_disconnect');
      })()
        .then(() => {
          sendResponse({ success: true });
        })
        .catch((e) => {
          sendResponse({ success: false, error: String(e) });
        });
      return true;
    }

    if (message.type === BACKGROUND_MESSAGE_TYPES.GET_SERVER_STATUS) {
      // If server status shows not running, try HTTP probe as fallback
      // This handles cases where server was started externally (not via Native Messaging)
      if (!currentServerStatus.isRunning) {
        const httpStatus = probeHttpServer();
        // probeHttpServer is async but we need to respond immediately
        // Fire and forget - next call will have updated status
        httpStatus
          .then((status) => {
            if (status) {
              currentServerStatus = status;
              saveServerStatus(status).catch(() => {});
              broadcastServerStatusChange(status);
            }
          })
          .catch(() => {});
      }
      sendResponse({
        success: true,
        serverStatus: currentServerStatus,
        connected: nativePort !== null,
      });
      return true;
    }

    // GET_AGENT_STATUS: Return detailed agent connection status
    if (message.type === BACKGROUND_MESSAGE_TYPES.GET_AGENT_STATUS) {
      sendResponse({
        success: true,
        isServerReady: currentServerStatus.isRunning,
        nativeConnected: nativePort !== null,
        serverPort: currentServerStatus.port,
      });
      return true;
    }

    // EXECUTE_TOOL_CALL: Bridge for OpenAI direct mode to call browser tools
    if (message.type === BACKGROUND_MESSAGE_TYPES.EXECUTE_TOOL_CALL) {
      const { toolName, args, requestId } = message.payload || {};
      console.log(`[NativeHost] EXECUTE_TOOL_CALL: ${toolName} (requestId: ${requestId})`, args);

      handleCallTool({ name: toolName, args })
        .then((result) => {
          const isError = result?.isError ?? false;
          console.log(
            `[NativeHost] Tool "${toolName}" ${isError ? 'failed' : 'succeeded'}:`,
            result?.content?.[0]?.text?.substring(0, 200),
          );
          sendResponse({
            success: true,
            requestId,
            result,
          });
        })
        .catch((error) => {
          console.error(`[NativeHost] Tool "${toolName}" threw exception:`, error);
          sendResponse({
            success: false,
            requestId,
            error: error instanceof Error ? error.message : String(error),
          });
        });
      return true;
    }

    if (message.type === BACKGROUND_MESSAGE_TYPES.REFRESH_SERVER_STATUS) {
      loadServerStatus()
        .then((storedStatus) => {
          currentServerStatus = storedStatus;
          sendResponse({
            success: true,
            serverStatus: currentServerStatus,
            connected: nativePort !== null,
          });
        })
        .catch((error) => {
          console.error(ERROR_MESSAGES.SERVER_STATUS_LOAD_FAILED, error);
          sendResponse({
            success: false,
            error: ERROR_MESSAGES.SERVER_STATUS_LOAD_FAILED,
            serverStatus: currentServerStatus,
            connected: nativePort !== null,
          });
        });
      return true;
    }

    // Forward file operation messages to native host
    if (message.type === 'forward_to_native' && message.message) {
      if (nativePort) {
        nativePort.postMessage(message.message);
        sendResponse({ success: true });
      } else {
        sendResponse({ success: false, error: 'Native host not connected' });
      }
      return true;
    }

    // SET_CONNECTION_MODE: Switch between native-server and cli-direct modes
    if (message.type === 'SET_CONNECTION_MODE') {
      const newMode = message.mode as ConnectionMode;
      if (newMode === 'cli-direct') {
        // Disconnect existing native messaging connection
        if (nativePort) {
          manualDisconnect = true;
          try {
            nativePort.disconnect();
          } catch {
            // Ignore
          }
          nativePort = null;
        }
        clearReconnectTimer();
        reconnectAttempts = 0;
        currentServerStatus = {
          isRunning: false,
          port: undefined,
          lastUpdated: Date.now(),
        };
        void saveServerStatus(currentServerStatus);
        broadcastServerStatusChange(currentServerStatus);
        console.log(`${LOG_PREFIX} Switched to cli-direct mode, native messaging disconnected`);
      } else if (newMode === 'native-server') {
        // Re-enable auto-connect and trigger reconnection
        void setNativeAutoConnectEnabled(true);
        clearReconnectTimer();
        reconnectAttempts = 0;
        manualDisconnect = false;
        void ensureNativeConnected('mode_switch').catch(() => {});
        console.log(`${LOG_PREFIX} Switched to native-server mode, initiating connection`);
      }
      sendResponse({ success: true, mode: newMode });
      return true;
    }
  });
};
