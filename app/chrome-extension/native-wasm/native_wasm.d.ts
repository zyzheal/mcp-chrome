/* tslint:disable */
/* eslint-disable */

export class FlowIdCache {
  free(): void;
  [Symbol.dispose](): void;
  /**
   * Get flow info by slug
   */
  getBySlug(slug: string): string;
  /**
   * Invalidate cache
   */
  invalidate(): void;
  /**
   * Check if fresh
   */
  isFresh(): boolean;
  constructor();
  /**
   * Populate cache
   */
  populate(flows_json: string): void;
}

export class HeartbeatState {
  free(): void;
  [Symbol.dispose](): void;
  /**
   * Check if connection is dead
   */
  isDead(): boolean;
  /**
   * Mark ping as sent
   */
  markSentPing(): void;
  constructor(interval_ms: bigint, timeout_ms: bigint);
  /**
   * Record a received message
   */
  recordReceived(): void;
  /**
   * Check if we should send a ping
   */
  shouldSendPing(): boolean;
  /**
   * Get state as JSON
   */
  toJson(): string;
}

export class MessageParser {
  free(): void;
  [Symbol.dispose](): void;
  /**
   * Feed data bytes. Returns JSON array of complete message strings.
   */
  feed(chunk: Uint8Array): string;
  constructor();
  /**
   * Reset parser state
   */
  reset(): void;
}

export class ReconnectState {
  free(): void;
  [Symbol.dispose](): void;
  /**
   * Disable auto-connect
   */
  disableAutoConnect(): void;
  /**
   * Enable auto-connect
   */
  enableAutoConnect(): void;
  /**
   * Manual disconnect
   */
  manualDisconnect(): void;
  /**
   * Mark a successful connection
   */
  markConnected(): void;
  /**
   * Mark a failed connection attempt
   */
  markFailed(): void;
  constructor();
  /**
   * Calculate next delay with exponential backoff
   */
  nextDelayMs(): bigint;
  /**
   * Reset state
   */
  reset(): void;
  shouldReconnect(): boolean;
  /**
   * Get status as JSON
   */
  status(): string;
}

export class ToolListCache {
  free(): void;
  [Symbol.dispose](): void;
  /**
   * Get cached tools
   */
  getTools(): string;
  /**
   * Invalidate cache
   */
  invalidate(): void;
  /**
   * Check if cache is fresh
   */
  isFresh(): boolean;
  constructor();
  /**
   * Set cached tools
   */
  setTools(tools_json: string, source: string): void;
  /**
   * Get cache status
   */
  status(): string;
}

/**
 * Build locator map
 */
export function buildLocatorMap(element_json: string): string;

/**
 * Calculate stability score
 */
export function calculateStability(element_json: string, selector: string): string;

/**
 * Create an error response
 */
export function createErrorResponse(error_message: string, code: string): string;

/**
 * Create a heartbeat ping message
 */
export function createHeartbeatPing(): string;

/**
 * Create an MCP error response
 */
export function createMcpError(code: bigint, message: string): string;

/**
 * Create an MCP tools/list request
 */
export function createMcpListTools(): string;

/**
 * Create an MCP success response
 */
export function createMcpSuccess(result_json: string): string;

/**
 * Create an MCP tool call request
 */
export function createMcpToolCall(name: string, arguments_json: string): string;

/**
 * Create a server started response
 */
export function createServerStartedResponse(port: number): string;

/**
 * Create a start message for native host
 */
export function createStartMessage(port: number): string;

/**
 * Calculate fingerprint similarity
 */
export function fingerprintSimilarity(fp_a_json: string, fp_b_json: string): number;

/**
 * Generate tool definition for a flow
 */
export function flowToToolDefinition(flow_json: string): string;

/**
 * Frame a JSON message with 4-byte LE length prefix
 * Returns base64-encoded bytes ready for transmission
 */
export function frameMessage(json_str: string): string;

/**
 * Generate element fingerprint
 */
export function generateFingerprint(element_json: string): string;

/**
 * Generate CSS selectors for an element (JSON input -> JSON output)
 */
export function generateSelectors(element_json: string): string;

/**
 * Get flow execution status
 */
export function getFlowStatus(flow_json: string, variables_json: string): string;

/**
 * Get module info as JSON
 */
export function getInfo(): string;

/**
 * Get module version
 */
export function getVersion(): string;

/**
 * Initialize the WASM module (called on load)
 */
export function init(): void;

/**
 * Parse a 4-byte LE length-prefixed message
 * Returns the JSON payload string
 */
export function parseMessage(base64_data: string): string;

/**
 * Validate flow variables
 */
export function validateFlowVariables(flow_json: string, variables_json: string): string;

/**
 * Validate a CSS selector
 */
export function validateSelector(sel: string): string;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly frameMessage: (a: number, b: number) => [number, number, number, number];
  readonly parseMessage: (a: number, b: number) => [number, number, number, number];
  readonly createStartMessage: (a: number) => [number, number, number, number];
  readonly createServerStartedResponse: (a: number) => [number, number, number, number];
  readonly createErrorResponse: (
    a: number,
    b: number,
    c: number,
    d: number,
  ) => [number, number, number, number];
  readonly createHeartbeatPing: () => [number, number, number, number];
  readonly __wbg_messageparser_free: (a: number, b: number) => void;
  readonly messageparser_new: () => number;
  readonly messageparser_feed: (a: number, b: number, c: number) => [number, number];
  readonly messageparser_reset: (a: number) => void;
  readonly __wbg_heartbeatstate_free: (a: number, b: number) => void;
  readonly heartbeatstate_new: (a: bigint, b: bigint) => number;
  readonly heartbeatstate_recordReceived: (a: number) => void;
  readonly heartbeatstate_shouldSendPing: (a: number) => number;
  readonly heartbeatstate_markSentPing: (a: number) => void;
  readonly heartbeatstate_isDead: (a: number) => number;
  readonly heartbeatstate_toJson: (a: number) => [number, number, number, number];
  readonly __wbg_reconnectstate_free: (a: number, b: number) => void;
  readonly reconnectstate_new: () => number;
  readonly reconnectstate_shouldReconnect: (a: number) => number;
  readonly reconnectstate_nextDelayMs: (a: number) => bigint;
  readonly reconnectstate_markConnected: (a: number) => void;
  readonly reconnectstate_markFailed: (a: number) => void;
  readonly reconnectstate_manualDisconnect: (a: number) => void;
  readonly reconnectstate_enableAutoConnect: (a: number) => void;
  readonly reconnectstate_disableAutoConnect: (a: number) => void;
  readonly reconnectstate_reset: (a: number) => void;
  readonly reconnectstate_status: (a: number) => [number, number, number, number];
  readonly generateSelectors: (a: number, b: number) => [number, number, number, number];
  readonly generateFingerprint: (a: number, b: number) => [number, number, number, number];
  readonly fingerprintSimilarity: (
    a: number,
    b: number,
    c: number,
    d: number,
  ) => [number, number, number];
  readonly calculateStability: (
    a: number,
    b: number,
    c: number,
    d: number,
  ) => [number, number, number, number];
  readonly validateSelector: (a: number, b: number) => [number, number, number, number];
  readonly buildLocatorMap: (a: number, b: number) => [number, number, number, number];
  readonly validateFlowVariables: (
    a: number,
    b: number,
    c: number,
    d: number,
  ) => [number, number, number, number];
  readonly flowToToolDefinition: (a: number, b: number) => [number, number, number, number];
  readonly getFlowStatus: (
    a: number,
    b: number,
    c: number,
    d: number,
  ) => [number, number, number, number];
  readonly createMcpToolCall: (
    a: number,
    b: number,
    c: number,
    d: number,
  ) => [number, number, number, number];
  readonly createMcpListTools: () => [number, number, number, number];
  readonly createMcpSuccess: (a: number, b: number) => [number, number, number, number];
  readonly createMcpError: (a: bigint, b: number, c: number) => [number, number, number, number];
  readonly __wbg_toollistcache_free: (a: number, b: number) => void;
  readonly toollistcache_new: () => number;
  readonly toollistcache_isFresh: (a: number) => number;
  readonly toollistcache_setTools: (a: number, b: number, c: number, d: number, e: number) => void;
  readonly toollistcache_getTools: (a: number) => [number, number, number, number];
  readonly toollistcache_invalidate: (a: number) => void;
  readonly toollistcache_status: (a: number) => [number, number, number, number];
  readonly __wbg_flowidcache_free: (a: number, b: number) => void;
  readonly flowidcache_new: () => number;
  readonly flowidcache_getBySlug: (
    a: number,
    b: number,
    c: number,
  ) => [number, number, number, number];
  readonly flowidcache_populate: (a: number, b: number, c: number) => void;
  readonly flowidcache_invalidate: (a: number) => void;
  readonly flowidcache_isFresh: (a: number) => number;
  readonly getVersion: () => [number, number];
  readonly getInfo: () => [number, number, number, number];
  readonly init: () => void;
  readonly __wbindgen_exn_store: (a: number) => void;
  readonly __externref_table_alloc: () => number;
  readonly __wbindgen_externrefs: WebAssembly.Table;
  readonly __wbindgen_free: (a: number, b: number, c: number) => void;
  readonly __wbindgen_malloc: (a: number, b: number) => number;
  readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
  readonly __externref_table_dealloc: (a: number) => void;
  readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init(
  module_or_path?:
    | { module_or_path: InitInput | Promise<InitInput> }
    | InitInput
    | Promise<InitInput>,
): Promise<InitOutput>;
