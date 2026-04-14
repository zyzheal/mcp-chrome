import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  CallToolResult,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import nativeMessagingHostInstance from '../native-messaging-host';
import { NativeMessageType, TOOL_SCHEMAS } from 'chrome-mcp-shared';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';

// ============================================================
// Cache Configuration
// ============================================================

/** Cache TTL in milliseconds (5 minutes) */
const CACHE_TTL_MS = 5 * 60 * 1000;

/** Maximum cache entries */
const MAX_CACHE_ENTRIES = 50;

// ============================================================
// Tool List Cache
// ============================================================

interface CachedToolList {
  tools: Tool[];
  timestamp: number;
  source: 'extension' | 'fallback';
}

class ToolListCache {
  private cache: CachedToolList | null = null;
  private lastFetchTime: number = 0;
  private fetchPromise: Promise<Tool[]> | null = null;

  /**
   * Get cached tools or fetch new ones
   */
  async getTools(forceRefresh: boolean = false): Promise<Tool[]> {
    const now = Date.now();

    // Return cached if still valid and not forcing refresh
    if (!forceRefresh && this.cache && now - this.cache.timestamp < CACHE_TTL_MS) {
      console.error(
        '[ToolListCache] Returning cached tools (age: ${Math.round((now - this.cache.timestamp) / 1000)}s)',
      );
      return this.cache.tools;
    }

    // If already fetching, wait for that fetch to complete
    if (this.fetchPromise) {
      console.error('[ToolListCache] Waiting for ongoing fetch...');
      return this.fetchPromise;
    }

    // Start new fetch
    console.error('[ToolListCache] Starting new fetch...');
    this.fetchPromise = this.fetchToolsFromExtension();

    try {
      const tools = await this.fetchPromise;
      this.cache = {
        tools,
        timestamp: now,
        source: 'extension',
      };
      this.lastFetchTime = now;
      return tools;
    } catch (error) {
      // On error, return cached data if available, else empty
      console.error('[ToolListCache] Fetch failed:', error);
      if (this.cache) {
        console.error('[ToolListCache] Returning stale cache as fallback');
        return this.cache.tools;
      }
      return [];
    } finally {
      this.fetchPromise = null;
    }
  }

  /**
   * Fetch tools from extension
   */
  private async fetchToolsFromExtension(): Promise<Tool[]> {
    try {
      const response = await nativeMessagingHostInstance.sendRequestToExtensionAndWait(
        {},
        'rr_list_published_flows',
        20000,
      );

      if (response && response.status === 'success' && Array.isArray(response.items)) {
        return this.parseFlowItems(response.items);
      }
      return [];
    } catch (e) {
      console.error('[ToolListCache] Error fetching from extension:', e);
      throw e;
    }
  }

  /**
   * Parse flow items into Tool definitions
   */
  private parseFlowItems(items: any[]): Tool[] {
    const tools: Tool[] = [];
    for (const item of items) {
      const name = `flow.${item.slug}`;
      const description =
        (item.meta && item.meta.tool && item.meta.tool.description) ||
        item.description ||
        'Recorded flow';

      const properties: Record<string, any> = {};
      const required: string[] = [];

      for (const v of item.variables || []) {
        const desc = v.label || v.key;
        const typ = (v.type || 'string').toLowerCase();
        const prop: any = { description: desc };

        if (typ === 'boolean') prop.type = 'boolean';
        else if (typ === 'number') prop.type = 'number';
        else if (typ === 'enum') {
          prop.type = 'string';
          if (v.rules && Array.isArray(v.rules.enum)) prop.enum = v.rules.enum;
        } else if (typ === 'array') {
          prop.type = 'array';
          prop.items = { type: 'string' };
        } else {
          prop.type = 'string';
        }

        if (v.default !== undefined) prop.default = v.default;
        if (v.rules && v.rules.required) required.push(v.key);
        properties[v.key] = prop;
      }

      // Run options
      properties['tabTarget'] = { type: 'string', enum: ['current', 'new'], default: 'current' };
      properties['refresh'] = { type: 'boolean', default: false };
      properties['captureNetwork'] = { type: 'boolean', default: false };
      properties['returnLogs'] = { type: 'boolean', default: false };
      properties['timeoutMs'] = { type: 'number', minimum: 0 };

      tools.push({
        name,
        description,
        inputSchema: { type: 'object', properties, required },
      });
    }
    return tools;
  }

  /**
   * Invalidate cache
   */
  invalidate(): void {
    console.error('[ToolListCache] Cache invalidated');
    this.cache = null;
  }

  /**
   * Get cache status
   */
  getStatus(): { hasCache: boolean; age: number; toolCount: number } {
    const now = Date.now();
    return {
      hasCache: this.cache !== null,
      age: this.cache ? Math.round((now - this.cache.timestamp) / 1000) : 0,
      toolCount: this.cache?.tools.length || 0,
    };
  }
}

// Singleton cache instance
const toolListCache = new ToolListCache();

// ============================================================
// Flow ID Cache (for resolving slug to ID)
// ============================================================

interface FlowInfo {
  id: string;
  slug: string;
  name: string;
}

class FlowIdCache {
  private flows: Map<string, FlowInfo> = new Map(); // slug -> FlowInfo
  private timestamp: number = 0;

  async getFlowBySlug(slug: string): Promise<FlowInfo | null> {
    // Check cache
    const cached = this.flows.get(slug);
    if (cached && Date.now() - this.timestamp < CACHE_TTL_MS) {
      return cached;
    }

    // Refresh cache
    try {
      const response = await nativeMessagingHostInstance.sendRequestToExtensionAndWait(
        {},
        'rr_list_published_flows',
        20000,
      );

      if (response && response.status === 'success' && Array.isArray(response.items)) {
        this.flows.clear();
        for (const item of response.items) {
          const info: FlowInfo = {
            id: item.id,
            slug: item.slug,
            name: item.name || item.slug,
          };
          this.flows.set(item.slug, info);
        }
        this.timestamp = Date.now();
        return this.flows.get(slug) || null;
      }
    } catch (e) {
      console.error('[FlowIdCache] Error refreshing cache:', e);
    }

    return cached || null;
  }

  invalidate(): void {
    this.flows.clear();
    this.timestamp = 0;
  }
}

const flowIdCache = new FlowIdCache();

// ============================================================
// Tool Setup
// ============================================================

export const setupTools = (server: Server) => {
  // List tools handler - with caching
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    try {
      const dynamicTools = await toolListCache.getTools();
      console.error(
        `[setupTools] Returning ${dynamicTools.length} dynamic tools + ${TOOL_SCHEMAS.length} static tools`,
      );
      return { tools: [...TOOL_SCHEMAS, ...dynamicTools] };
    } catch (error) {
      console.error('[setupTools] Error getting tools:', error);
      // Fallback to static tools only
      return { tools: TOOL_SCHEMAS };
    }
  });

  // Call tool handler
  server.setRequestHandler(CallToolRequestSchema, async (request) =>
    handleToolCall(request.params.name, request.params.arguments || {}),
  );
};

/**
 * Invalidate tool cache (can be called when flows are updated)
 */
export const invalidateToolCache = (): void => {
  toolListCache.invalidate();
  flowIdCache.invalidate();
  console.error('[register-tools] Tool caches invalidated');
};

const handleToolCall = async (name: string, args: any): Promise<CallToolResult> => {
  try {
    // If calling a dynamic flow tool (name starts with flow.), proxy to common flow-run tool
    if (name && name.startsWith('flow.')) {
      const slug = name.slice('flow.'.length);

      try {
        // Use cached flow info
        const flowInfo = await flowIdCache.getFlowBySlug(slug);

        if (!flowInfo) {
          return {
            content: [{ type: 'text', text: `Flow not found for tool ${name}` }],
            isError: true,
          };
        }

        const flowArgs = { flowId: flowInfo.id, args };
        const proxyRes = await nativeMessagingHostInstance.sendRequestToExtensionAndWait(
          { name: 'record_replay_flow_run', args: flowArgs },
          NativeMessageType.CALL_TOOL,
          120000,
        );

        if (proxyRes.status === 'success') {
          return proxyRes.data;
        }

        return {
          content: [{ type: 'text', text: `Error calling dynamic flow tool: ${proxyRes.error}` }],
          isError: true,
        };
      } catch (err: any) {
        return {
          content: [
            {
              type: 'text',
              text: `Error resolving dynamic flow tool: ${err?.message || String(err)}`,
            },
          ],
          isError: true,
        };
      }
    }

    // Send request to Chrome extension and wait for response
    const response = await nativeMessagingHostInstance.sendRequestToExtensionAndWait(
      { name, args },
      NativeMessageType.CALL_TOOL,
      120000, // Extended timeout for long tasks like performance analysis
    );

    if (response.status === 'success') {
      return response.data;
    } else {
      return {
        content: [
          {
            type: 'text',
            text: `Error calling tool: ${response.error}`,
          },
        ],
        isError: true,
      };
    }
  } catch (error: any) {
    return {
      content: [
        {
          type: 'text',
          text: `Error calling tool: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
};
