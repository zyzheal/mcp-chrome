/**
 * Active Tab Tracker - Tracks the user's currently visible tab.
 *
 * Uses chrome.tabs.onActivated and chrome.windows.onFocusChanged to maintain
 * an accurate reference to the tab the user is currently looking at.
 *
 * This is more reliable than chrome.tabs.query({ active: true, currentWindow: true })
 * in background script contexts, especially after tool operations that may change
 * tab/window focus.
 */

interface ActiveTabInfo {
  tabId: number;
  windowId: number;
  updatedAt: number;
}

let activeTab: ActiveTabInfo | null = null;

/**
 * Initialize the active tab tracker. Call once from background entry point.
 */
export function initActiveTabTracker(): void {
  // Initialize current state
  chrome.windows
    .getLastFocused({ windowTypes: ['normal'] })
    .then((window) => {
      if (window?.id) {
        chrome.tabs.query({ active: true, windowId: window.id }).then((tabs) => {
          if (tabs[0]?.id) {
            activeTab = {
              tabId: tabs[0].id,
              windowId: window.id!,
              updatedAt: Date.now(),
            };
            console.log(
              `[ActiveTabTracker] Initialized: tabId=${activeTab.tabId}, windowId=${activeTab.windowId}`,
            );
          }
        });
      }
    })
    .catch(() => {
      console.warn('[ActiveTabTracker] Failed to initialize');
    });

  // Track tab activation (user clicks a tab or navigates within a window)
  chrome.tabs.onActivated.addListener((activeInfo) => {
    activeTab = {
      tabId: activeInfo.tabId,
      windowId: activeInfo.windowId,
      updatedAt: Date.now(),
    };
  });

  // Track window focus changes (user switches between browser windows)
  chrome.windows.onFocusChanged.addListener((windowId) => {
    if (windowId === chrome.windows.WINDOW_ID_NONE) return;
    chrome.tabs
      .query({ active: true, windowId })
      .then((tabs) => {
        if (tabs[0]?.id) {
          activeTab = {
            tabId: tabs[0].id,
            windowId,
            updatedAt: Date.now(),
          };
        }
      })
      .catch(() => {});
  });

  // Clean up when tabs are closed
  chrome.tabs.onRemoved.addListener((tabId) => {
    if (activeTab?.tabId === tabId) {
      // Tab was closed, clear and re-resolve
      activeTab = null;
      chrome.windows
        .getLastFocused({ windowTypes: ['normal'] })
        .then((window) => {
          if (window?.id) {
            return chrome.tabs.query({ active: true, windowId: window.id });
          }
          return [];
        })
        .then((tabs) => {
          if (tabs[0]?.id && activeTab === null) {
            activeTab = {
              tabId: tabs[0].id,
              windowId: tabs[0].windowId!,
              updatedAt: Date.now(),
            };
          }
        })
        .catch(() => {});
    }
  });
}

/**
 * Get the currently active tab info.
 * Returns null if tracker hasn't initialized or no tab is found.
 */
export function getActiveTabInfo(): ActiveTabInfo | null {
  return activeTab;
}

/**
 * Query the currently active tab (full chrome.tabs.Tab object).
 * Always queries Chrome API for the real-time active tab in the last-focused window,
 * rather than relying on the cached tracker state which may be slightly stale.
 * Returns null if not found.
 */
export async function queryActiveTab(): Promise<chrome.tabs.Tab | null> {
  // Always query the real current state from Chrome API
  try {
    const window = await chrome.windows.getLastFocused({ windowTypes: ['normal'] });
    if (window?.id) {
      const tabs = await chrome.tabs.query({ active: true, windowId: window.id });
      if (tabs[0]) return tabs[0];
    }
  } catch {
    // ignore
  }

  // Fallback: any active tab in current window
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tabs[0]) return tabs[0];

  // Last resort: use cached tracker
  if (activeTab) {
    try {
      return await chrome.tabs.get(activeTab.tabId);
    } catch {
      // ignore
    }
  }

  return null;
}
