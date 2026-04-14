// Connection mode type for switching between Native Server and CLI Direct modes
export type ConnectionMode = 'native-server' | 'cli-direct';

const CONNECTION_MODE_KEY = 'claudeInChromeConnectionMode';
const DEFAULT_MODE: ConnectionMode = 'native-server';

/**
 * Get the current connection mode from chrome.storage.local.
 * Returns 'native-server' if not set.
 */
export async function getConnectionMode(): Promise<ConnectionMode> {
  try {
    const result = await chrome.storage.local.get(CONNECTION_MODE_KEY);
    const mode = result[CONNECTION_MODE_KEY] as ConnectionMode | undefined;
    if (mode === 'native-server' || mode === 'cli-direct') {
      return mode;
    }
    return DEFAULT_MODE;
  } catch {
    return DEFAULT_MODE;
  }
}

/**
 * Set the connection mode in chrome.storage.local.
 */
export async function setConnectionMode(mode: ConnectionMode): Promise<void> {
  await chrome.storage.local.set({ [CONNECTION_MODE_KEY]: mode });
}

/**
 * Broadcast connection mode change to all contexts.
 */
export function broadcastConnectionModeChange(mode: ConnectionMode): void {
  chrome.runtime.sendMessage({
    type: 'CONNECTION_MODE_CHANGED',
    mode,
  }).catch(() => { /* ignored */ });
}
