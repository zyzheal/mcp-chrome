import { createErrorResponse, ToolResult } from '@/common/tool-handler';
import { BaseBrowserToolExecutor } from '../base-browser';
import { TOOL_NAMES } from 'chrome-mcp-shared';
import { TOOL_MESSAGE_TYPES } from '@/common/message-types';
import { ERROR_MESSAGES } from '@/common/constants';
import { listMarkersForUrl } from '@/entrypoints/background/element-marker/element-marker-storage';

interface ReadPageStats {
  processed: number;
  included: number;
  durationMs: number;
}

interface ReadPageParams {
  filter?: 'interactive'; // when omitted, return all visible elements
  depth?: number; // maximum DOM depth to traverse (0 = root only)
  refId?: string; // focus on subtree rooted at this refId
  tabId?: number; // target existing tab id
  windowId?: number; // when no tabId, pick active tab from this window
}

class ReadPageTool extends BaseBrowserToolExecutor {
  name = TOOL_NAMES.BROWSER.READ_PAGE;

  // Execute read page
  async execute(args: ReadPageParams): Promise<ToolResult> {
    const { filter, depth, refId } = args || {};

    // Validate refId parameter
    const focusRefId = typeof refId === 'string' ? refId.trim() : '';
    if (refId !== undefined && !focusRefId) {
      return createErrorResponse(
        `${ERROR_MESSAGES.INVALID_PARAMETERS}: refId must be a non-empty string`,
      );
    }

    // Validate depth parameter
    const requestedDepth = depth === undefined ? undefined : Number(depth);
    if (requestedDepth !== undefined && (!Number.isInteger(requestedDepth) || requestedDepth < 0)) {
      return createErrorResponse(
        `${ERROR_MESSAGES.INVALID_PARAMETERS}: depth must be a non-negative integer`,
      );
    }

    // Track if user explicitly controlled the output (skip sparse heuristics)
    const userControlled = requestedDepth !== undefined || !!focusRefId;

    try {
      // Tip text returned to callers to guide next action
      const standardTips =
        "If the specific element you need is missing from the returned data, use the 'screenshot' tool to capture the current viewport and confirm the element's on-screen coordinates. Also note: 'markedElements' are user-marked elements and have the highest priority when choosing targets.";

      const explicit = await this.tryGetTab(args?.tabId);
      const tab = explicit || (await this.getActiveTabOrThrowInWindow(args?.windowId));
      if (!tab.id)
        return createErrorResponse(ERROR_MESSAGES.TAB_NOT_FOUND + ': Active tab has no ID');

      // Load any user-marked elements for this URL (priority hints)
      const currentUrl = String(tab.url || '');
      const userMarkers = currentUrl ? await listMarkersForUrl(currentUrl) : [];

      // Inject helper in ISOLATED world to enable chrome.runtime messaging
      // Inject into all frames to support same-origin iframe operations
      await this.injectContentScript(
        tab.id,
        ['inject-scripts/accessibility-tree-helper.js'],
        false,
        'ISOLATED',
        true,
      );

      // Ask content script to generate accessibility tree
      const resp = await this.sendMessageToTab(tab.id, {
        action: TOOL_MESSAGE_TYPES.GENERATE_ACCESSIBILITY_TREE,
        filter: filter || null,
        depth: requestedDepth,
        refId: focusRefId || undefined,
      });

      // Evaluate tree result and decide whether to fallback
      const treeOk = resp && resp.success === true;
      const pageContent: string =
        resp && typeof resp.pageContent === 'string' ? resp.pageContent : '';

      // Extract stats from response
      const stats: ReadPageStats | null =
        treeOk && resp?.stats
          ? {
              processed: resp.stats.processed ?? 0,
              included: resp.stats.included ?? 0,
              durationMs: resp.stats.durationMs ?? 0,
            }
          : null;

      const lines = pageContent
        ? pageContent.split('\n').filter((l: string) => l.trim().length > 0).length
        : 0;
      const refCount = Array.isArray(resp?.refMap) ? resp.refMap.length : 0;

      // Skip sparse heuristics when user explicitly controls output
      const isSparse = !userControlled && lines < 10 && refCount < 3;

      // Build user-marked elements for inclusion
      const markedElements = userMarkers.map((m) => ({
        name: m.name,
        selector: m.selector,
        selectorType: m.selectorType || 'css',
        urlMatch: { type: m.matchType, origin: m.origin, path: m.path },
        source: 'marker',
        priority: 'highest',
      }));

      // Helper to convert elements array to pageContent format
      const formatElementsAsPageContent = (elements: any[]): string => {
        const out: string[] = [];
        for (const e of elements || []) {
          const type = typeof e?.type === 'string' && e.type ? e.type : 'element';
          const rawText = typeof e?.text === 'string' ? e.text.trim() : '';
          const text =
            rawText.length > 0
              ? ` "${rawText.replace(/\s+/g, ' ').slice(0, 100).replace(/"/g, '\\"')}"`
              : '';
          const selector =
            typeof e?.selector === 'string' && e.selector ? ` selector="${e.selector}"` : '';
          const coords =
            e?.coordinates && Number.isFinite(e.coordinates.x) && Number.isFinite(e.coordinates.y)
              ? ` (x=${Math.round(e.coordinates.x)},y=${Math.round(e.coordinates.y)})`
              : '';
          out.push(`- ${type}${text}${selector}${coords}`);
          if (out.length >= 150) break;
        }
        return out.join('\n');
      };

      // Unified base payload structure - consistent keys for stable contract
      const basePayload: Record<string, any> = {
        success: true,
        filter: filter || 'all',
        pageContent,
        tips: standardTips,
        viewport: treeOk ? resp.viewport : { width: null, height: null, dpr: null },
        stats: stats || { processed: 0, included: 0, durationMs: 0 },
        refMapCount: refCount,
        sparse: treeOk ? isSparse : false,
        depth: requestedDepth ?? null,
        focus: focusRefId ? { refId: focusRefId, found: treeOk } : null,
        markedElements,
        elements: [],
        count: 0,
        fallbackUsed: false,
        fallbackSource: null,
        reason: null,
      };

      // Normal path: return tree
      if (treeOk && !isSparse) {
        return {
          content: [{ type: 'text', text: JSON.stringify(basePayload) }],
          isError: false,
        };
      }

      // When refId is explicitly provided, do not fallback (refs are frame-local and may expire)
      if (focusRefId) {
        return createErrorResponse(resp?.error || `refId "${focusRefId}" not found or expired`);
      }

      // When user explicitly controls depth, do not override with fallback heuristics
      if (requestedDepth !== undefined) {
        return createErrorResponse(resp?.error || 'Failed to generate accessibility tree');
      }

      // --- Fallback path: try get_interactive_elements ---

      // Use non-throwing injection so fallback failure doesn't abort the whole operation
      try {
        await this.injectContentScript(
          tab.id,
          ['inject-scripts/interactive-elements-helper.js'],
          false,
          'ISOLATED',
          true, // match primary injection: scan all frames
        );
      } catch (injectErr) {
        // Log but continue — fallback injection failure is not fatal
        console.warn('[ReadPage] Fallback script injection failed, continuing anyway:', injectErr);
      }

      // Wait for script readiness via dedicated ping (not the generic this.name_ping)
      const scriptReady = await this.waitForScript(tab.id, 'chrome_get_interactive_elements_ping');

      let fallback: any = null;
      if (scriptReady) {
        try {
          // 3s is generous for content-script synchronous message handling (normally <50ms)
          fallback = await Promise.race([
            chrome.tabs.sendMessage(tab.id, {
              action: TOOL_MESSAGE_TYPES.GET_INTERACTIVE_ELEMENTS,
              includeCoordinates: true,
            }),
            new Promise<null>((r) => setTimeout(() => r(null), 3000)),
          ]);
        } catch (msgErr) {
          console.warn('[ReadPage] Fallback message send failed:', msgErr);
        }
      }

      console.log(
        '[ReadPage] Fallback response:',
        fallback ? JSON.stringify(fallback).slice(0, 300) : 'null',
      );

      if (
        fallback &&
        fallback.success &&
        Array.isArray(fallback.elements) &&
        fallback.elements.length > 0
      ) {
        const limited = fallback.elements.slice(0, 150);
        // Merge user markers at the front, de-duplicated by selector
        const markerEls = userMarkers.map((m) => ({
          type: 'marker',
          selector: m.selector,
          text: m.name,
          selectorType: m.selectorType || 'css',
          isInteractive: true,
          source: 'marker',
          priority: 'highest',
        }));
        const seen = new Set(markerEls.map((e) => e.selector));
        const merged = [...markerEls, ...limited.filter((e: any) => !seen.has(e.selector))];

        basePayload.fallbackUsed = true;
        basePayload.fallbackSource = 'get_interactive_elements';
        basePayload.reason = treeOk ? 'sparse_tree' : resp?.error || 'tree_failed';
        basePayload.elements = merged;
        basePayload.count = merged.length; // consistent with actual returned array
        if (!basePayload.pageContent) {
          basePayload.pageContent = formatElementsAsPageContent(merged);
        }

        return {
          content: [{ type: 'text', text: JSON.stringify(basePayload) }],
          isError: false,
        };
      }

      // --- Both tree and fallback returned sparse/empty results ---
      // IMPORTANT: This is NOT an error — the page genuinely has minimal content.
      // Return a successful response with a warning so the agent can decide what to do next
      // (e.g., take a screenshot, navigate to a different URL).
      // Returning an error here wastes a tool-call turn and may confuse the agent.

      const diag = `treeOk=${treeOk}, lines=${lines}, refCount=${refCount}, isSparse=${isSparse}`;
      const fallbackInfo = fallback
        ? `fallback: success=${fallback.success}, elements=${Array.isArray(fallback.elements) ? fallback.elements.length : 'N/A'}`
        : 'fallback: no response or script not ready';
      console.warn(`[ReadPage] Sparse page detected. Diagnostics: ${diag}, ${fallbackInfo}`);

      basePayload.sparse = true;
      basePayload.warning = `Page has minimal content (${lines} visible elements, ${refCount} interactive refs). The page may be blank, a login screen, or a media-only page. Consider using the 'screenshot' tool to see what is visually on the page.`;

      return {
        content: [{ type: 'text', text: JSON.stringify(basePayload) }],
        isError: false,
      };
    } catch (error) {
      console.error('Error in read page tool:', error);
      return createErrorResponse(
        `Error generating accessibility tree: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Wait for a content script to respond to a ping, confirming it is loaded and ready.
   * Returns true if the script responds within timeout, false otherwise.
   */
  private async waitForScript(
    tabId: number,
    pingAction: string,
    timeoutMs = 2000,
  ): Promise<boolean> {
    try {
      const response = await Promise.race([
        chrome.tabs.sendMessage(tabId, { action: pingAction }),
        new Promise<null>((r) => setTimeout(() => r(null), timeoutMs)),
      ]);
      return response && response.status === 'pong';
    } catch {
      return false;
    }
  }
}

export const readPageTool = new ReadPageTool();
