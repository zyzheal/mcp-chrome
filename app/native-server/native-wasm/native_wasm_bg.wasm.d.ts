/* tslint:disable */
/* eslint-disable */
export const memory: WebAssembly.Memory;
export const frameMessage: (a: number, b: number) => [number, number, number, number];
export const parseMessage: (a: number, b: number) => [number, number, number, number];
export const createStartMessage: (a: number) => [number, number, number, number];
export const createServerStartedResponse: (a: number) => [number, number, number, number];
export const createErrorResponse: (
  a: number,
  b: number,
  c: number,
  d: number,
) => [number, number, number, number];
export const createHeartbeatPing: () => [number, number, number, number];
export const __wbg_messageparser_free: (a: number, b: number) => void;
export const messageparser_new: () => number;
export const messageparser_feed: (a: number, b: number, c: number) => [number, number];
export const messageparser_reset: (a: number) => void;
export const __wbg_heartbeatstate_free: (a: number, b: number) => void;
export const heartbeatstate_new: (a: bigint, b: bigint) => number;
export const heartbeatstate_recordReceived: (a: number) => void;
export const heartbeatstate_shouldSendPing: (a: number) => number;
export const heartbeatstate_markSentPing: (a: number) => void;
export const heartbeatstate_isDead: (a: number) => number;
export const heartbeatstate_toJson: (a: number) => [number, number, number, number];
export const __wbg_reconnectstate_free: (a: number, b: number) => void;
export const reconnectstate_new: () => number;
export const reconnectstate_shouldReconnect: (a: number) => number;
export const reconnectstate_nextDelayMs: (a: number) => bigint;
export const reconnectstate_markConnected: (a: number) => void;
export const reconnectstate_markFailed: (a: number) => void;
export const reconnectstate_manualDisconnect: (a: number) => void;
export const reconnectstate_enableAutoConnect: (a: number) => void;
export const reconnectstate_disableAutoConnect: (a: number) => void;
export const reconnectstate_reset: (a: number) => void;
export const reconnectstate_status: (a: number) => [number, number, number, number];
export const generateSelectors: (a: number, b: number) => [number, number, number, number];
export const generateFingerprint: (a: number, b: number) => [number, number, number, number];
export const fingerprintSimilarity: (
  a: number,
  b: number,
  c: number,
  d: number,
) => [number, number, number];
export const calculateStability: (
  a: number,
  b: number,
  c: number,
  d: number,
) => [number, number, number, number];
export const validateSelector: (a: number, b: number) => [number, number, number, number];
export const buildLocatorMap: (a: number, b: number) => [number, number, number, number];
export const validateFlowVariables: (
  a: number,
  b: number,
  c: number,
  d: number,
) => [number, number, number, number];
export const flowToToolDefinition: (a: number, b: number) => [number, number, number, number];
export const getFlowStatus: (
  a: number,
  b: number,
  c: number,
  d: number,
) => [number, number, number, number];
export const createMcpToolCall: (
  a: number,
  b: number,
  c: number,
  d: number,
) => [number, number, number, number];
export const createMcpListTools: () => [number, number, number, number];
export const createMcpSuccess: (a: number, b: number) => [number, number, number, number];
export const createMcpError: (a: bigint, b: number, c: number) => [number, number, number, number];
export const __wbg_toollistcache_free: (a: number, b: number) => void;
export const toollistcache_new: () => number;
export const toollistcache_isFresh: (a: number) => number;
export const toollistcache_setTools: (
  a: number,
  b: number,
  c: number,
  d: number,
  e: number,
) => void;
export const toollistcache_getTools: (a: number) => [number, number, number, number];
export const toollistcache_invalidate: (a: number) => void;
export const toollistcache_status: (a: number) => [number, number, number, number];
export const __wbg_flowidcache_free: (a: number, b: number) => void;
export const flowidcache_new: () => number;
export const flowidcache_getBySlug: (
  a: number,
  b: number,
  c: number,
) => [number, number, number, number];
export const flowidcache_populate: (a: number, b: number, c: number) => void;
export const flowidcache_invalidate: (a: number) => void;
export const flowidcache_isFresh: (a: number) => number;
export const getVersion: () => [number, number];
export const getInfo: () => [number, number, number, number];
export const init: () => void;
export const __wbindgen_exn_store: (a: number) => void;
export const __externref_table_alloc: () => number;
export const __wbindgen_externrefs: WebAssembly.Table;
export const __wbindgen_free: (a: number, b: number, c: number) => void;
export const __wbindgen_malloc: (a: number, b: number) => number;
export const __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
export const __externref_table_dealloc: (a: number) => void;
export const __wbindgen_start: () => void;
