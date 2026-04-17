/* @ts-self-types="./native_wasm.d.ts" */

export class FlowIdCache {
  __destroy_into_raw() {
    const ptr = this.__wbg_ptr;
    this.__wbg_ptr = 0;
    FlowIdCacheFinalization.unregister(this);
    return ptr;
  }
  free() {
    const ptr = this.__destroy_into_raw();
    wasm.__wbg_flowidcache_free(ptr, 0);
  }
  /**
   * Get flow info by slug
   * @param {string} slug
   * @returns {string}
   */
  getBySlug(slug) {
    let deferred3_0;
    let deferred3_1;
    try {
      const ptr0 = passStringToWasm0(slug, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
      const len0 = WASM_VECTOR_LEN;
      const ret = wasm.flowidcache_getBySlug(this.__wbg_ptr, ptr0, len0);
      var ptr2 = ret[0];
      var len2 = ret[1];
      if (ret[3]) {
        ptr2 = 0;
        len2 = 0;
        throw takeFromExternrefTable0(ret[2]);
      }
      deferred3_0 = ptr2;
      deferred3_1 = len2;
      return getStringFromWasm0(ptr2, len2);
    } finally {
      wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
    }
  }
  /**
   * Invalidate cache
   */
  invalidate() {
    wasm.flowidcache_invalidate(this.__wbg_ptr);
  }
  /**
   * Check if fresh
   * @returns {boolean}
   */
  isFresh() {
    const ret = wasm.flowidcache_isFresh(this.__wbg_ptr);
    return ret !== 0;
  }
  constructor() {
    const ret = wasm.flowidcache_new();
    this.__wbg_ptr = ret >>> 0;
    FlowIdCacheFinalization.register(this, this.__wbg_ptr, this);
    return this;
  }
  /**
   * Populate cache
   * @param {string} flows_json
   */
  populate(flows_json) {
    const ptr0 = passStringToWasm0(flows_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.flowidcache_populate(this.__wbg_ptr, ptr0, len0);
  }
}
if (Symbol.dispose) FlowIdCache.prototype[Symbol.dispose] = FlowIdCache.prototype.free;

export class HeartbeatState {
  __destroy_into_raw() {
    const ptr = this.__wbg_ptr;
    this.__wbg_ptr = 0;
    HeartbeatStateFinalization.unregister(this);
    return ptr;
  }
  free() {
    const ptr = this.__destroy_into_raw();
    wasm.__wbg_heartbeatstate_free(ptr, 0);
  }
  /**
   * Check if connection is dead
   * @returns {boolean}
   */
  isDead() {
    const ret = wasm.heartbeatstate_isDead(this.__wbg_ptr);
    return ret !== 0;
  }
  /**
   * Mark ping as sent
   */
  markSentPing() {
    wasm.heartbeatstate_markSentPing(this.__wbg_ptr);
  }
  /**
   * @param {bigint} interval_ms
   * @param {bigint} timeout_ms
   */
  constructor(interval_ms, timeout_ms) {
    const ret = wasm.heartbeatstate_new(interval_ms, timeout_ms);
    this.__wbg_ptr = ret >>> 0;
    HeartbeatStateFinalization.register(this, this.__wbg_ptr, this);
    return this;
  }
  /**
   * Record a received message
   */
  recordReceived() {
    wasm.heartbeatstate_recordReceived(this.__wbg_ptr);
  }
  /**
   * Check if we should send a ping
   * @returns {boolean}
   */
  shouldSendPing() {
    const ret = wasm.heartbeatstate_shouldSendPing(this.__wbg_ptr);
    return ret !== 0;
  }
  /**
   * Get state as JSON
   * @returns {string}
   */
  toJson() {
    let deferred2_0;
    let deferred2_1;
    try {
      const ret = wasm.heartbeatstate_toJson(this.__wbg_ptr);
      var ptr1 = ret[0];
      var len1 = ret[1];
      if (ret[3]) {
        ptr1 = 0;
        len1 = 0;
        throw takeFromExternrefTable0(ret[2]);
      }
      deferred2_0 = ptr1;
      deferred2_1 = len1;
      return getStringFromWasm0(ptr1, len1);
    } finally {
      wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
  }
}
if (Symbol.dispose) HeartbeatState.prototype[Symbol.dispose] = HeartbeatState.prototype.free;

export class MessageParser {
  __destroy_into_raw() {
    const ptr = this.__wbg_ptr;
    this.__wbg_ptr = 0;
    MessageParserFinalization.unregister(this);
    return ptr;
  }
  free() {
    const ptr = this.__destroy_into_raw();
    wasm.__wbg_messageparser_free(ptr, 0);
  }
  /**
   * Feed data bytes. Returns JSON array of complete message strings.
   * @param {Uint8Array} chunk
   * @returns {string}
   */
  feed(chunk) {
    let deferred2_0;
    let deferred2_1;
    try {
      const ptr0 = passArray8ToWasm0(chunk, wasm.__wbindgen_malloc);
      const len0 = WASM_VECTOR_LEN;
      const ret = wasm.messageparser_feed(this.__wbg_ptr, ptr0, len0);
      deferred2_0 = ret[0];
      deferred2_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
  }
  constructor() {
    const ret = wasm.messageparser_new();
    this.__wbg_ptr = ret >>> 0;
    MessageParserFinalization.register(this, this.__wbg_ptr, this);
    return this;
  }
  /**
   * Reset parser state
   */
  reset() {
    wasm.messageparser_reset(this.__wbg_ptr);
  }
}
if (Symbol.dispose) MessageParser.prototype[Symbol.dispose] = MessageParser.prototype.free;

export class ReconnectState {
  __destroy_into_raw() {
    const ptr = this.__wbg_ptr;
    this.__wbg_ptr = 0;
    ReconnectStateFinalization.unregister(this);
    return ptr;
  }
  free() {
    const ptr = this.__destroy_into_raw();
    wasm.__wbg_reconnectstate_free(ptr, 0);
  }
  /**
   * Disable auto-connect
   */
  disableAutoConnect() {
    wasm.reconnectstate_disableAutoConnect(this.__wbg_ptr);
  }
  /**
   * Enable auto-connect
   */
  enableAutoConnect() {
    wasm.reconnectstate_enableAutoConnect(this.__wbg_ptr);
  }
  /**
   * Manual disconnect
   */
  manualDisconnect() {
    wasm.reconnectstate_manualDisconnect(this.__wbg_ptr);
  }
  /**
   * Mark a successful connection
   */
  markConnected() {
    wasm.reconnectstate_markConnected(this.__wbg_ptr);
  }
  /**
   * Mark a failed connection attempt
   */
  markFailed() {
    wasm.reconnectstate_markFailed(this.__wbg_ptr);
  }
  constructor() {
    const ret = wasm.reconnectstate_new();
    this.__wbg_ptr = ret >>> 0;
    ReconnectStateFinalization.register(this, this.__wbg_ptr, this);
    return this;
  }
  /**
   * Calculate next delay with exponential backoff
   * @returns {bigint}
   */
  nextDelayMs() {
    const ret = wasm.reconnectstate_nextDelayMs(this.__wbg_ptr);
    return BigInt.asUintN(64, ret);
  }
  /**
   * Reset state
   */
  reset() {
    wasm.reconnectstate_reset(this.__wbg_ptr);
  }
  /**
   * @returns {boolean}
   */
  shouldReconnect() {
    const ret = wasm.reconnectstate_shouldReconnect(this.__wbg_ptr);
    return ret !== 0;
  }
  /**
   * Get status as JSON
   * @returns {string}
   */
  status() {
    let deferred2_0;
    let deferred2_1;
    try {
      const ret = wasm.reconnectstate_status(this.__wbg_ptr);
      var ptr1 = ret[0];
      var len1 = ret[1];
      if (ret[3]) {
        ptr1 = 0;
        len1 = 0;
        throw takeFromExternrefTable0(ret[2]);
      }
      deferred2_0 = ptr1;
      deferred2_1 = len1;
      return getStringFromWasm0(ptr1, len1);
    } finally {
      wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
  }
}
if (Symbol.dispose) ReconnectState.prototype[Symbol.dispose] = ReconnectState.prototype.free;

export class ToolListCache {
  __destroy_into_raw() {
    const ptr = this.__wbg_ptr;
    this.__wbg_ptr = 0;
    ToolListCacheFinalization.unregister(this);
    return ptr;
  }
  free() {
    const ptr = this.__destroy_into_raw();
    wasm.__wbg_toollistcache_free(ptr, 0);
  }
  /**
   * Get cached tools
   * @returns {string}
   */
  getTools() {
    let deferred2_0;
    let deferred2_1;
    try {
      const ret = wasm.toollistcache_getTools(this.__wbg_ptr);
      var ptr1 = ret[0];
      var len1 = ret[1];
      if (ret[3]) {
        ptr1 = 0;
        len1 = 0;
        throw takeFromExternrefTable0(ret[2]);
      }
      deferred2_0 = ptr1;
      deferred2_1 = len1;
      return getStringFromWasm0(ptr1, len1);
    } finally {
      wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
  }
  /**
   * Invalidate cache
   */
  invalidate() {
    wasm.toollistcache_invalidate(this.__wbg_ptr);
  }
  /**
   * Check if cache is fresh
   * @returns {boolean}
   */
  isFresh() {
    const ret = wasm.toollistcache_isFresh(this.__wbg_ptr);
    return ret !== 0;
  }
  constructor() {
    const ret = wasm.toollistcache_new();
    this.__wbg_ptr = ret >>> 0;
    ToolListCacheFinalization.register(this, this.__wbg_ptr, this);
    return this;
  }
  /**
   * Set cached tools
   * @param {string} tools_json
   * @param {string} source
   */
  setTools(tools_json, source) {
    const ptr0 = passStringToWasm0(tools_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(source, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    wasm.toollistcache_setTools(this.__wbg_ptr, ptr0, len0, ptr1, len1);
  }
  /**
   * Get cache status
   * @returns {string}
   */
  status() {
    let deferred2_0;
    let deferred2_1;
    try {
      const ret = wasm.toollistcache_status(this.__wbg_ptr);
      var ptr1 = ret[0];
      var len1 = ret[1];
      if (ret[3]) {
        ptr1 = 0;
        len1 = 0;
        throw takeFromExternrefTable0(ret[2]);
      }
      deferred2_0 = ptr1;
      deferred2_1 = len1;
      return getStringFromWasm0(ptr1, len1);
    } finally {
      wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
  }
}
if (Symbol.dispose) ToolListCache.prototype[Symbol.dispose] = ToolListCache.prototype.free;

/**
 * Build locator map
 * @param {string} element_json
 * @returns {string}
 */
export function buildLocatorMap(element_json) {
  let deferred3_0;
  let deferred3_1;
  try {
    const ptr0 = passStringToWasm0(element_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.buildLocatorMap(ptr0, len0);
    var ptr2 = ret[0];
    var len2 = ret[1];
    if (ret[3]) {
      ptr2 = 0;
      len2 = 0;
      throw takeFromExternrefTable0(ret[2]);
    }
    deferred3_0 = ptr2;
    deferred3_1 = len2;
    return getStringFromWasm0(ptr2, len2);
  } finally {
    wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
  }
}

/**
 * Calculate stability score
 * @param {string} element_json
 * @param {string} selector
 * @returns {string}
 */
export function calculateStability(element_json, selector) {
  let deferred4_0;
  let deferred4_1;
  try {
    const ptr0 = passStringToWasm0(element_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(selector, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.calculateStability(ptr0, len0, ptr1, len1);
    var ptr3 = ret[0];
    var len3 = ret[1];
    if (ret[3]) {
      ptr3 = 0;
      len3 = 0;
      throw takeFromExternrefTable0(ret[2]);
    }
    deferred4_0 = ptr3;
    deferred4_1 = len3;
    return getStringFromWasm0(ptr3, len3);
  } finally {
    wasm.__wbindgen_free(deferred4_0, deferred4_1, 1);
  }
}

/**
 * Create an error response
 * @param {string} error_message
 * @param {string} code
 * @returns {string}
 */
export function createErrorResponse(error_message, code) {
  let deferred4_0;
  let deferred4_1;
  try {
    const ptr0 = passStringToWasm0(error_message, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(code, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.createErrorResponse(ptr0, len0, ptr1, len1);
    var ptr3 = ret[0];
    var len3 = ret[1];
    if (ret[3]) {
      ptr3 = 0;
      len3 = 0;
      throw takeFromExternrefTable0(ret[2]);
    }
    deferred4_0 = ptr3;
    deferred4_1 = len3;
    return getStringFromWasm0(ptr3, len3);
  } finally {
    wasm.__wbindgen_free(deferred4_0, deferred4_1, 1);
  }
}

/**
 * Create a heartbeat ping message
 * @returns {string}
 */
export function createHeartbeatPing() {
  let deferred2_0;
  let deferred2_1;
  try {
    const ret = wasm.createHeartbeatPing();
    var ptr1 = ret[0];
    var len1 = ret[1];
    if (ret[3]) {
      ptr1 = 0;
      len1 = 0;
      throw takeFromExternrefTable0(ret[2]);
    }
    deferred2_0 = ptr1;
    deferred2_1 = len1;
    return getStringFromWasm0(ptr1, len1);
  } finally {
    wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
  }
}

/**
 * Create an MCP error response
 * @param {bigint} code
 * @param {string} message
 * @returns {string}
 */
export function createMcpError(code, message) {
  let deferred3_0;
  let deferred3_1;
  try {
    const ptr0 = passStringToWasm0(message, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.createMcpError(code, ptr0, len0);
    var ptr2 = ret[0];
    var len2 = ret[1];
    if (ret[3]) {
      ptr2 = 0;
      len2 = 0;
      throw takeFromExternrefTable0(ret[2]);
    }
    deferred3_0 = ptr2;
    deferred3_1 = len2;
    return getStringFromWasm0(ptr2, len2);
  } finally {
    wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
  }
}

/**
 * Create an MCP tools/list request
 * @returns {string}
 */
export function createMcpListTools() {
  let deferred2_0;
  let deferred2_1;
  try {
    const ret = wasm.createMcpListTools();
    var ptr1 = ret[0];
    var len1 = ret[1];
    if (ret[3]) {
      ptr1 = 0;
      len1 = 0;
      throw takeFromExternrefTable0(ret[2]);
    }
    deferred2_0 = ptr1;
    deferred2_1 = len1;
    return getStringFromWasm0(ptr1, len1);
  } finally {
    wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
  }
}

/**
 * Create an MCP success response
 * @param {string} result_json
 * @returns {string}
 */
export function createMcpSuccess(result_json) {
  let deferred3_0;
  let deferred3_1;
  try {
    const ptr0 = passStringToWasm0(result_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.createMcpSuccess(ptr0, len0);
    var ptr2 = ret[0];
    var len2 = ret[1];
    if (ret[3]) {
      ptr2 = 0;
      len2 = 0;
      throw takeFromExternrefTable0(ret[2]);
    }
    deferred3_0 = ptr2;
    deferred3_1 = len2;
    return getStringFromWasm0(ptr2, len2);
  } finally {
    wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
  }
}

/**
 * Create an MCP tool call request
 * @param {string} name
 * @param {string} arguments_json
 * @returns {string}
 */
export function createMcpToolCall(name, arguments_json) {
  let deferred4_0;
  let deferred4_1;
  try {
    const ptr0 = passStringToWasm0(name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(arguments_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.createMcpToolCall(ptr0, len0, ptr1, len1);
    var ptr3 = ret[0];
    var len3 = ret[1];
    if (ret[3]) {
      ptr3 = 0;
      len3 = 0;
      throw takeFromExternrefTable0(ret[2]);
    }
    deferred4_0 = ptr3;
    deferred4_1 = len3;
    return getStringFromWasm0(ptr3, len3);
  } finally {
    wasm.__wbindgen_free(deferred4_0, deferred4_1, 1);
  }
}

/**
 * Create a server started response
 * @param {number} port
 * @returns {string}
 */
export function createServerStartedResponse(port) {
  let deferred2_0;
  let deferred2_1;
  try {
    const ret = wasm.createServerStartedResponse(port);
    var ptr1 = ret[0];
    var len1 = ret[1];
    if (ret[3]) {
      ptr1 = 0;
      len1 = 0;
      throw takeFromExternrefTable0(ret[2]);
    }
    deferred2_0 = ptr1;
    deferred2_1 = len1;
    return getStringFromWasm0(ptr1, len1);
  } finally {
    wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
  }
}

/**
 * Create a start message for native host
 * @param {number} port
 * @returns {string}
 */
export function createStartMessage(port) {
  let deferred2_0;
  let deferred2_1;
  try {
    const ret = wasm.createStartMessage(port);
    var ptr1 = ret[0];
    var len1 = ret[1];
    if (ret[3]) {
      ptr1 = 0;
      len1 = 0;
      throw takeFromExternrefTable0(ret[2]);
    }
    deferred2_0 = ptr1;
    deferred2_1 = len1;
    return getStringFromWasm0(ptr1, len1);
  } finally {
    wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
  }
}

/**
 * Calculate fingerprint similarity
 * @param {string} fp_a_json
 * @param {string} fp_b_json
 * @returns {number}
 */
export function fingerprintSimilarity(fp_a_json, fp_b_json) {
  const ptr0 = passStringToWasm0(fp_a_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
  const len0 = WASM_VECTOR_LEN;
  const ptr1 = passStringToWasm0(fp_b_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
  const len1 = WASM_VECTOR_LEN;
  const ret = wasm.fingerprintSimilarity(ptr0, len0, ptr1, len1);
  if (ret[2]) {
    throw takeFromExternrefTable0(ret[1]);
  }
  return ret[0];
}

/**
 * Generate tool definition for a flow
 * @param {string} flow_json
 * @returns {string}
 */
export function flowToToolDefinition(flow_json) {
  let deferred3_0;
  let deferred3_1;
  try {
    const ptr0 = passStringToWasm0(flow_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.flowToToolDefinition(ptr0, len0);
    var ptr2 = ret[0];
    var len2 = ret[1];
    if (ret[3]) {
      ptr2 = 0;
      len2 = 0;
      throw takeFromExternrefTable0(ret[2]);
    }
    deferred3_0 = ptr2;
    deferred3_1 = len2;
    return getStringFromWasm0(ptr2, len2);
  } finally {
    wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
  }
}

/**
 * Frame a JSON message with 4-byte LE length prefix
 * Returns base64-encoded bytes ready for transmission
 * @param {string} json_str
 * @returns {string}
 */
export function frameMessage(json_str) {
  let deferred3_0;
  let deferred3_1;
  try {
    const ptr0 = passStringToWasm0(json_str, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.frameMessage(ptr0, len0);
    var ptr2 = ret[0];
    var len2 = ret[1];
    if (ret[3]) {
      ptr2 = 0;
      len2 = 0;
      throw takeFromExternrefTable0(ret[2]);
    }
    deferred3_0 = ptr2;
    deferred3_1 = len2;
    return getStringFromWasm0(ptr2, len2);
  } finally {
    wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
  }
}

/**
 * Generate element fingerprint
 * @param {string} element_json
 * @returns {string}
 */
export function generateFingerprint(element_json) {
  let deferred3_0;
  let deferred3_1;
  try {
    const ptr0 = passStringToWasm0(element_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.generateFingerprint(ptr0, len0);
    var ptr2 = ret[0];
    var len2 = ret[1];
    if (ret[3]) {
      ptr2 = 0;
      len2 = 0;
      throw takeFromExternrefTable0(ret[2]);
    }
    deferred3_0 = ptr2;
    deferred3_1 = len2;
    return getStringFromWasm0(ptr2, len2);
  } finally {
    wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
  }
}

/**
 * Generate CSS selectors for an element (JSON input -> JSON output)
 * @param {string} element_json
 * @returns {string}
 */
export function generateSelectors(element_json) {
  let deferred3_0;
  let deferred3_1;
  try {
    const ptr0 = passStringToWasm0(element_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.generateSelectors(ptr0, len0);
    var ptr2 = ret[0];
    var len2 = ret[1];
    if (ret[3]) {
      ptr2 = 0;
      len2 = 0;
      throw takeFromExternrefTable0(ret[2]);
    }
    deferred3_0 = ptr2;
    deferred3_1 = len2;
    return getStringFromWasm0(ptr2, len2);
  } finally {
    wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
  }
}

/**
 * Get flow execution status
 * @param {string} flow_json
 * @param {string} variables_json
 * @returns {string}
 */
export function getFlowStatus(flow_json, variables_json) {
  let deferred4_0;
  let deferred4_1;
  try {
    const ptr0 = passStringToWasm0(flow_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(variables_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.getFlowStatus(ptr0, len0, ptr1, len1);
    var ptr3 = ret[0];
    var len3 = ret[1];
    if (ret[3]) {
      ptr3 = 0;
      len3 = 0;
      throw takeFromExternrefTable0(ret[2]);
    }
    deferred4_0 = ptr3;
    deferred4_1 = len3;
    return getStringFromWasm0(ptr3, len3);
  } finally {
    wasm.__wbindgen_free(deferred4_0, deferred4_1, 1);
  }
}

/**
 * Get module info as JSON
 * @returns {string}
 */
export function getInfo() {
  let deferred2_0;
  let deferred2_1;
  try {
    const ret = wasm.getInfo();
    var ptr1 = ret[0];
    var len1 = ret[1];
    if (ret[3]) {
      ptr1 = 0;
      len1 = 0;
      throw takeFromExternrefTable0(ret[2]);
    }
    deferred2_0 = ptr1;
    deferred2_1 = len1;
    return getStringFromWasm0(ptr1, len1);
  } finally {
    wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
  }
}

/**
 * Get module version
 * @returns {string}
 */
export function getVersion() {
  let deferred1_0;
  let deferred1_1;
  try {
    const ret = wasm.getVersion();
    deferred1_0 = ret[0];
    deferred1_1 = ret[1];
    return getStringFromWasm0(ret[0], ret[1]);
  } finally {
    wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
  }
}

/**
 * Initialize the WASM module (called on load)
 */
export function init() {
  wasm.init();
}

/**
 * Parse a 4-byte LE length-prefixed message
 * Returns the JSON payload string
 * @param {string} base64_data
 * @returns {string}
 */
export function parseMessage(base64_data) {
  let deferred3_0;
  let deferred3_1;
  try {
    const ptr0 = passStringToWasm0(base64_data, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.parseMessage(ptr0, len0);
    var ptr2 = ret[0];
    var len2 = ret[1];
    if (ret[3]) {
      ptr2 = 0;
      len2 = 0;
      throw takeFromExternrefTable0(ret[2]);
    }
    deferred3_0 = ptr2;
    deferred3_1 = len2;
    return getStringFromWasm0(ptr2, len2);
  } finally {
    wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
  }
}

/**
 * Validate flow variables
 * @param {string} flow_json
 * @param {string} variables_json
 * @returns {string}
 */
export function validateFlowVariables(flow_json, variables_json) {
  let deferred4_0;
  let deferred4_1;
  try {
    const ptr0 = passStringToWasm0(flow_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(variables_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.validateFlowVariables(ptr0, len0, ptr1, len1);
    var ptr3 = ret[0];
    var len3 = ret[1];
    if (ret[3]) {
      ptr3 = 0;
      len3 = 0;
      throw takeFromExternrefTable0(ret[2]);
    }
    deferred4_0 = ptr3;
    deferred4_1 = len3;
    return getStringFromWasm0(ptr3, len3);
  } finally {
    wasm.__wbindgen_free(deferred4_0, deferred4_1, 1);
  }
}

/**
 * Validate a CSS selector
 * @param {string} sel
 * @returns {string}
 */
export function validateSelector(sel) {
  let deferred3_0;
  let deferred3_1;
  try {
    const ptr0 = passStringToWasm0(sel, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.validateSelector(ptr0, len0);
    var ptr2 = ret[0];
    var len2 = ret[1];
    if (ret[3]) {
      ptr2 = 0;
      len2 = 0;
      throw takeFromExternrefTable0(ret[2]);
    }
    deferred3_0 = ptr2;
    deferred3_1 = len2;
    return getStringFromWasm0(ptr2, len2);
  } finally {
    wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
  }
}
function __wbg_get_imports() {
  const import0 = {
    __proto__: null,
    __wbg_Error_960c155d3d49e4c2: function (arg0, arg1) {
      const ret = Error(getStringFromWasm0(arg0, arg1));
      return ret;
    },
    __wbg___wbindgen_is_function_3baa9db1a987f47d: function (arg0) {
      const ret = typeof arg0 === 'function';
      return ret;
    },
    __wbg___wbindgen_is_object_63322ec0cd6ea4ef: function (arg0) {
      const val = arg0;
      const ret = typeof val === 'object' && val !== null;
      return ret;
    },
    __wbg___wbindgen_is_string_6df3bf7ef1164ed3: function (arg0) {
      const ret = typeof arg0 === 'string';
      return ret;
    },
    __wbg___wbindgen_is_undefined_29a43b4d42920abd: function (arg0) {
      const ret = arg0 === undefined;
      return ret;
    },
    __wbg___wbindgen_throw_6b64449b9b9ed33c: function (arg0, arg1) {
      throw new Error(getStringFromWasm0(arg0, arg1));
    },
    __wbg_call_a24592a6f349a97e: function () {
      return handleError(function (arg0, arg1, arg2) {
        const ret = arg0.call(arg1, arg2);
        return ret;
      }, arguments);
    },
    __wbg_crypto_38df2bab126b63dc: function (arg0) {
      const ret = arg0.crypto;
      return ret;
    },
    __wbg_error_a6fa202b58aa1cd3: function (arg0, arg1) {
      let deferred0_0;
      let deferred0_1;
      try {
        deferred0_0 = arg0;
        deferred0_1 = arg1;
        console.error(getStringFromWasm0(arg0, arg1));
      } finally {
        wasm.__wbindgen_free(deferred0_0, deferred0_1, 1);
      }
    },
    __wbg_getRandomValues_c44a50d8cfdaebeb: function () {
      return handleError(function (arg0, arg1) {
        arg0.getRandomValues(arg1);
      }, arguments);
    },
    __wbg_length_9f1775224cf1d815: function (arg0) {
      const ret = arg0.length;
      return ret;
    },
    __wbg_msCrypto_bd5a034af96bcba6: function (arg0) {
      const ret = arg0.msCrypto;
      return ret;
    },
    __wbg_new_227d7c05414eb861: function () {
      const ret = new Error();
      return ret;
    },
    __wbg_new_with_length_8c854e41ea4dae9b: function (arg0) {
      const ret = new Uint8Array(arg0 >>> 0);
      return ret;
    },
    __wbg_node_84ea875411254db1: function (arg0) {
      const ret = arg0.node;
      return ret;
    },
    __wbg_process_44c7a14e11e9f69e: function (arg0) {
      const ret = arg0.process;
      return ret;
    },
    __wbg_prototypesetcall_a6b02eb00b0f4ce2: function (arg0, arg1, arg2) {
      Uint8Array.prototype.set.call(getArrayU8FromWasm0(arg0, arg1), arg2);
    },
    __wbg_randomFillSync_6c25eac9869eb53c: function () {
      return handleError(function (arg0, arg1) {
        arg0.randomFillSync(arg1);
      }, arguments);
    },
    __wbg_require_b4edbdcf3e2a1ef0: function () {
      return handleError(function () {
        const ret = module.require;
        return ret;
      }, arguments);
    },
    __wbg_stack_3b0d974bbf31e44f: function (arg0, arg1) {
      const ret = arg1.stack;
      const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
      const len1 = WASM_VECTOR_LEN;
      getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
      getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
    },
    __wbg_static_accessor_GLOBAL_8cfadc87a297ca02: function () {
      const ret = typeof global === 'undefined' ? null : global;
      return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
    },
    __wbg_static_accessor_GLOBAL_THIS_602256ae5c8f42cf: function () {
      const ret = typeof globalThis === 'undefined' ? null : globalThis;
      return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
    },
    __wbg_static_accessor_SELF_e445c1c7484aecc3: function () {
      const ret = typeof self === 'undefined' ? null : self;
      return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
    },
    __wbg_static_accessor_WINDOW_f20e8576ef1e0f17: function () {
      const ret = typeof window === 'undefined' ? null : window;
      return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
    },
    __wbg_subarray_f8ca46a25b1f5e0d: function (arg0, arg1, arg2) {
      const ret = arg0.subarray(arg1 >>> 0, arg2 >>> 0);
      return ret;
    },
    __wbg_versions_276b2795b1c6a219: function (arg0) {
      const ret = arg0.versions;
      return ret;
    },
    __wbindgen_cast_0000000000000001: function (arg0, arg1) {
      // Cast intrinsic for `Ref(Slice(U8)) -> NamedExternref("Uint8Array")`.
      const ret = getArrayU8FromWasm0(arg0, arg1);
      return ret;
    },
    __wbindgen_cast_0000000000000002: function (arg0, arg1) {
      // Cast intrinsic for `Ref(String) -> Externref`.
      const ret = getStringFromWasm0(arg0, arg1);
      return ret;
    },
    __wbindgen_init_externref_table: function () {
      const table = wasm.__wbindgen_externrefs;
      const offset = table.grow(4);
      table.set(0, undefined);
      table.set(offset + 0, undefined);
      table.set(offset + 1, null);
      table.set(offset + 2, true);
      table.set(offset + 3, false);
    },
  };
  return {
    __proto__: null,
    './native_wasm_bg.js': import0,
  };
}

const FlowIdCacheFinalization =
  typeof FinalizationRegistry === 'undefined'
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry((ptr) => wasm.__wbg_flowidcache_free(ptr >>> 0, 1));
const HeartbeatStateFinalization =
  typeof FinalizationRegistry === 'undefined'
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry((ptr) => wasm.__wbg_heartbeatstate_free(ptr >>> 0, 1));
const MessageParserFinalization =
  typeof FinalizationRegistry === 'undefined'
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry((ptr) => wasm.__wbg_messageparser_free(ptr >>> 0, 1));
const ReconnectStateFinalization =
  typeof FinalizationRegistry === 'undefined'
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry((ptr) => wasm.__wbg_reconnectstate_free(ptr >>> 0, 1));
const ToolListCacheFinalization =
  typeof FinalizationRegistry === 'undefined'
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry((ptr) => wasm.__wbg_toollistcache_free(ptr >>> 0, 1));

function addToExternrefTable0(obj) {
  const idx = wasm.__externref_table_alloc();
  wasm.__wbindgen_externrefs.set(idx, obj);
  return idx;
}

function getArrayU8FromWasm0(ptr, len) {
  ptr = ptr >>> 0;
  return getUint8ArrayMemory0().subarray(ptr / 1, ptr / 1 + len);
}

let cachedDataViewMemory0 = null;
function getDataViewMemory0() {
  if (
    cachedDataViewMemory0 === null ||
    cachedDataViewMemory0.buffer.detached === true ||
    (cachedDataViewMemory0.buffer.detached === undefined &&
      cachedDataViewMemory0.buffer !== wasm.memory.buffer)
  ) {
    cachedDataViewMemory0 = new DataView(wasm.memory.buffer);
  }
  return cachedDataViewMemory0;
}

function getStringFromWasm0(ptr, len) {
  ptr = ptr >>> 0;
  return decodeText(ptr, len);
}

let cachedUint8ArrayMemory0 = null;
function getUint8ArrayMemory0() {
  if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
    cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
  }
  return cachedUint8ArrayMemory0;
}

function handleError(f, args) {
  try {
    return f.apply(this, args);
  } catch (e) {
    const idx = addToExternrefTable0(e);
    wasm.__wbindgen_exn_store(idx);
  }
}

function isLikeNone(x) {
  return x === undefined || x === null;
}

function passArray8ToWasm0(arg, malloc) {
  const ptr = malloc(arg.length * 1, 1) >>> 0;
  getUint8ArrayMemory0().set(arg, ptr / 1);
  WASM_VECTOR_LEN = arg.length;
  return ptr;
}

function passStringToWasm0(arg, malloc, realloc) {
  if (realloc === undefined) {
    const buf = cachedTextEncoder.encode(arg);
    const ptr = malloc(buf.length, 1) >>> 0;
    getUint8ArrayMemory0()
      .subarray(ptr, ptr + buf.length)
      .set(buf);
    WASM_VECTOR_LEN = buf.length;
    return ptr;
  }

  let len = arg.length;
  let ptr = malloc(len, 1) >>> 0;

  const mem = getUint8ArrayMemory0();

  let offset = 0;

  for (; offset < len; offset++) {
    const code = arg.charCodeAt(offset);
    if (code > 0x7f) break;
    mem[ptr + offset] = code;
  }
  if (offset !== len) {
    if (offset !== 0) {
      arg = arg.slice(offset);
    }
    ptr = realloc(ptr, len, (len = offset + arg.length * 3), 1) >>> 0;
    const view = getUint8ArrayMemory0().subarray(ptr + offset, ptr + len);
    const ret = cachedTextEncoder.encodeInto(arg, view);

    offset += ret.written;
    ptr = realloc(ptr, len, offset, 1) >>> 0;
  }

  WASM_VECTOR_LEN = offset;
  return ptr;
}

function takeFromExternrefTable0(idx) {
  const value = wasm.__wbindgen_externrefs.get(idx);
  wasm.__externref_table_dealloc(idx);
  return value;
}

let cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
cachedTextDecoder.decode();
const MAX_SAFARI_DECODE_BYTES = 2146435072;
let numBytesDecoded = 0;
function decodeText(ptr, len) {
  numBytesDecoded += len;
  if (numBytesDecoded >= MAX_SAFARI_DECODE_BYTES) {
    cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
    cachedTextDecoder.decode();
    numBytesDecoded = len;
  }
  return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

const cachedTextEncoder = new TextEncoder();

if (!('encodeInto' in cachedTextEncoder)) {
  cachedTextEncoder.encodeInto = function (arg, view) {
    const buf = cachedTextEncoder.encode(arg);
    view.set(buf);
    return {
      read: arg.length,
      written: buf.length,
    };
  };
}

let WASM_VECTOR_LEN = 0;

let wasmModule, wasm;
function __wbg_finalize_init(instance, module) {
  wasm = instance.exports;
  wasmModule = module;
  cachedDataViewMemory0 = null;
  cachedUint8ArrayMemory0 = null;
  wasm.__wbindgen_start();
  return wasm;
}

async function __wbg_load(module, imports) {
  if (typeof Response === 'function' && module instanceof Response) {
    if (typeof WebAssembly.instantiateStreaming === 'function') {
      try {
        return await WebAssembly.instantiateStreaming(module, imports);
      } catch (e) {
        const validResponse = module.ok && expectedResponseType(module.type);

        if (validResponse && module.headers.get('Content-Type') !== 'application/wasm') {
          console.warn(
            '`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n',
            e,
          );
        } else {
          throw e;
        }
      }
    }

    const bytes = await module.arrayBuffer();
    return await WebAssembly.instantiate(bytes, imports);
  } else {
    const instance = await WebAssembly.instantiate(module, imports);

    if (instance instanceof WebAssembly.Instance) {
      return { instance, module };
    } else {
      return instance;
    }
  }

  function expectedResponseType(type) {
    switch (type) {
      case 'basic':
      case 'cors':
      case 'default':
        return true;
    }
    return false;
  }
}

function initSync(module) {
  if (wasm !== undefined) return wasm;

  if (module !== undefined) {
    if (Object.getPrototypeOf(module) === Object.prototype) {
      ({ module } = module);
    } else {
      console.warn('using deprecated parameters for `initSync()`; pass a single object instead');
    }
  }

  const imports = __wbg_get_imports();
  if (!(module instanceof WebAssembly.Module)) {
    module = new WebAssembly.Module(module);
  }
  const instance = new WebAssembly.Instance(module, imports);
  return __wbg_finalize_init(instance, module);
}

async function __wbg_init(module_or_path) {
  if (wasm !== undefined) return wasm;

  if (module_or_path !== undefined) {
    if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
      ({ module_or_path } = module_or_path);
    } else {
      console.warn(
        'using deprecated parameters for the initialization function; pass a single object instead',
      );
    }
  }

  if (module_or_path === undefined) {
    module_or_path = new URL('native_wasm_bg.wasm', import.meta.url);
  }
  const imports = __wbg_get_imports();

  if (
    typeof module_or_path === 'string' ||
    (typeof Request === 'function' && module_or_path instanceof Request) ||
    (typeof URL === 'function' && module_or_path instanceof URL)
  ) {
    module_or_path = fetch(module_or_path);
  }

  const { instance, module } = await __wbg_load(await module_or_path, imports);

  return __wbg_finalize_init(instance, module);
}

export { initSync, __wbg_init as default };
