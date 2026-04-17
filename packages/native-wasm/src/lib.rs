//! native-wasm: Portable core logic for Chrome MCP Extension + Native Server
//!
//! This crate compiles the protocol, selector engine, reconnect logic,
//! flow engine, and MCP utilities into a single WASM file.
//!
//! ## Architecture
//!
//! ```text
//! ┌─────────────────────────────────────────────────┐
//! │              Chrome Extension (JS)               │
//! │  ┌──────────┐  ┌──────────┐  ┌───────────────┐  │
//! │  │Background│  │ Content  │  │   Offscreen   │  │
//! │  │   SW     │  │  Script  │  │   (Worker)    │  │
//! │  └────┬─────┘  └────┬─────┘  └───────┬───────┘  │
//! │       │             │                │           │
//! │       └─────────────┴────────────────┘           │
//! │                     │                            │
//! │              ┌──────▼───────┐                    │
//! │              │  WASM Module │ ◄── This crate     │
//! │              │  (native.wasm) │                   │
//! │              └──────┬───────┘                    │
//! │    Chrome APIs ─────┘ (JS handles DOM/Chrome API)│
//! └─────────────────────────────────────────────────┘
//!         │ Native Messaging (stdio)
//!         ▼
//! ┌─────────────────────────────────────────────────┐
//! │           Native Server (Node.js)                │
//! │  ┌──────────────────┐  ┌──────────────────────┐ │
//! │  │ NativeMessaging  │  │     Fastify HTTP     │ │
//! │  │     Host         │  │    + MCP Server      │ │
//! │  └────────┬─────────┘  └──────────┬───────────┘ │
//! │           │                        │             │
//! │           └────────────────────────┘             │
//! │                     │                            │
//! │              ┌──────▼───────┐                    │
//! │              │  WASM Module │ ◄── Same crate     │
//! │              │  (native.wasm) │                   │
//! │              └──────┬───────┘                    │
//! │    Node.js APIs ────┘ (JS handles FS/Network)   │
//! └─────────────────────────────────────────────────┘
//! ```
//!
//! ## What's in WASM (portable):
//! - Native messaging protocol (4-byte framing, serialization)
//! - CSS selector engine (generation, fingerprinting, stability)
//! - Reconnect manager (exponential backoff with jitter)
//! - Record & Replay flow engine (state machine)
//! - MCP protocol utilities (caching, request/response)
//!
//! ## What stays in JS/TS (non-portable):
//! - Chrome extension APIs (tabs, storage, content scripts)
//! - Node.js APIs (fs, child_process, net)
//! - DOM APIs (querySelector, inject scripts, screenshots)
//! - SDK integrations (Claude Agent SDK, CDP)

mod protocol;
mod reconnect;
mod selector;
mod flow_engine;
mod mcp;
mod util;

use wasm_bindgen::prelude::*;

// ============================================================
// Initialization
// ============================================================

/// Initialize the WASM module (called on load)
#[wasm_bindgen(start)]
pub fn init() {
    console_error_panic_hook::set_once();
}

// ============================================================
// Protocol Module Exports
// ============================================================

/// Frame a JSON message with 4-byte LE length prefix
/// Returns base64-encoded bytes ready for transmission
#[wasm_bindgen(js_name = frameMessage)]
pub fn frame_message(json_str: &str) -> Result<String, JsError> {
    let value: serde_json::Value = serde_json::from_str(json_str)
        .map_err(|e| JsError::new(&format!("Invalid JSON input: {}", e)))?;
    let framed = protocol::FramedMessage::from_message(&value)
        .map_err(|e| JsError::new(&e.to_string()))?;
    Ok(base64_encode(&framed.into_bytes()))
}

/// Parse a 4-byte LE length-prefixed message
/// Returns the JSON payload string
#[wasm_bindgen(js_name = parseMessage)]
pub fn parse_message(base64_data: &str) -> Result<String, JsError> {
    let bytes = base64_decode(base64_data).map_err(|e| JsError::new(&e.to_string()))?;
    let value: serde_json::Value =
        protocol::FramedMessage::to_message(&bytes).map_err(|e| JsError::new(&e.to_string()))?;
    Ok(serde_json::to_string(&value).unwrap_or_default())
}

/// Create a start message for native host
#[wasm_bindgen(js_name = createStartMessage)]
pub fn create_start_message(port: u16) -> Result<String, JsError> {
    let msg = protocol::create_start_message(port);
    serde_json::to_string(&msg).map_err(|e| JsError::new(&e.to_string()))
}

/// Create a server started response
#[wasm_bindgen(js_name = createServerStartedResponse)]
pub fn create_server_started_response(port: u16) -> Result<String, JsError> {
    let msg = protocol::create_server_started_response(port);
    serde_json::to_string(&msg).map_err(|e| JsError::new(&e.to_string()))
}

/// Create an error response
#[wasm_bindgen(js_name = createErrorResponse)]
pub fn create_error_response(error_message: &str, code: &str) -> Result<String, JsError> {
    let msg = protocol::create_error_response(error_message, code);
    serde_json::to_string(&msg).map_err(|e| JsError::new(&e.to_string()))
}

/// Create a heartbeat ping message
#[wasm_bindgen(js_name = createHeartbeatPing)]
pub fn create_heartbeat_ping() -> Result<String, JsError> {
    let msg = protocol::create_heartbeat_ping();
    serde_json::to_string(&msg).map_err(|e| JsError::new(&e.to_string()))
}

// ============================================================
// MessageParser (incremental parsing state machine)
// ============================================================

#[wasm_bindgen]
pub struct MessageParser {
    inner: protocol::MessageParser,
}

#[wasm_bindgen]
impl MessageParser {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self {
            inner: protocol::MessageParser::new(),
        }
    }

    /// Feed data bytes. Returns JSON array of complete message strings.
    #[wasm_bindgen]
    pub fn feed(&mut self, chunk: &[u8]) -> String {
        let messages = self.inner.feed(chunk);
        let strings: Vec<String> = messages
            .iter()
            .filter_map(|m| String::from_utf8(m.clone()).ok())
            .collect();
        serde_json::to_string(&strings).unwrap_or_default()
    }

    /// Reset parser state
    #[wasm_bindgen]
    pub fn reset(&mut self) {
        self.inner.reset();
    }
}

// ============================================================
// Heartbeat State
// ============================================================

#[wasm_bindgen]
pub struct HeartbeatState {
    inner: protocol::HeartbeatState,
    interval_ms: u64,
    timeout_ms: u64,
}

#[wasm_bindgen]
impl HeartbeatState {
    #[wasm_bindgen(constructor)]
    pub fn new(interval_ms: u64, timeout_ms: u64) -> Self {
        Self {
            inner: protocol::HeartbeatState::new(),
            interval_ms,
            timeout_ms,
        }
    }

    /// Record a received message
    #[wasm_bindgen(js_name = recordReceived)]
    pub fn record_received(&mut self) {
        self.inner.record_received();
    }

    /// Check if we should send a ping
    #[wasm_bindgen(js_name = shouldSendPing)]
    pub fn should_send_ping(&self) -> bool {
        self.inner.should_send_ping(self.interval_ms)
    }

    /// Mark ping as sent
    #[wasm_bindgen(js_name = markSentPing)]
    pub fn mark_sent_ping(&mut self) {
        self.inner.mark_sent_ping();
    }

    /// Check if connection is dead
    #[wasm_bindgen(js_name = isDead)]
    pub fn is_dead(&self) -> bool {
        self.inner.is_dead(self.interval_ms, self.timeout_ms)
    }

    /// Get state as JSON
    #[wasm_bindgen(js_name = toJson)]
    pub fn to_json(&self) -> Result<String, JsError> {
        serde_json::to_string(&self.inner).map_err(|e| JsError::new(&e.to_string()))
    }
}

// ============================================================
// Reconnect Module Exports
// ============================================================

#[wasm_bindgen]
pub struct ReconnectState {
    inner: reconnect::ReconnectState,
}

#[wasm_bindgen]
impl ReconnectState {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self {
            inner: reconnect::ReconnectState::new(),
        }
    }

    #[wasm_bindgen(js_name = shouldReconnect)]
    pub fn should_reconnect(&self) -> bool {
        self.inner.should_reconnect()
    }

    /// Calculate next delay with exponential backoff
    #[wasm_bindgen(js_name = nextDelayMs)]
    pub fn next_delay_ms(&self) -> u64 {
        self.inner.next_delay_ms()
    }

    /// Mark a successful connection
    #[wasm_bindgen(js_name = markConnected)]
    pub fn mark_connected(&mut self) {
        self.inner.mark_connected();
    }

    /// Mark a failed connection attempt
    #[wasm_bindgen(js_name = markFailed)]
    pub fn mark_failed(&mut self) {
        self.inner.mark_failed();
    }

    /// Manual disconnect
    #[wasm_bindgen(js_name = manualDisconnect)]
    pub fn manual_disconnect(&mut self) {
        self.inner.manual_disconnect();
    }

    /// Enable auto-connect
    #[wasm_bindgen(js_name = enableAutoConnect)]
    pub fn enable_auto_connect(&mut self) {
        self.inner.enable_auto_connect();
    }

    /// Disable auto-connect
    #[wasm_bindgen(js_name = disableAutoConnect)]
    pub fn disable_auto_connect(&mut self) {
        self.inner.disable_auto_connect();
    }

    /// Reset state
    #[wasm_bindgen]
    pub fn reset(&mut self) {
        self.inner.reset();
    }

    /// Get status as JSON
    #[wasm_bindgen]
    pub fn status(&self) -> Result<String, JsError> {
        serde_json::to_string(&self.inner.status()).map_err(|e| JsError::new(&e.to_string()))
    }
}

// ============================================================
// Selector Module Exports
// ============================================================

/// Generate CSS selectors for an element (JSON input -> JSON output)
#[wasm_bindgen(js_name = generateSelectors)]
pub fn generate_selectors(element_json: &str) -> Result<String, JsError> {
    let element: selector::ElementInfo =
        serde_json::from_str(element_json).map_err(|e| JsError::new(&e.to_string()))?;
    let candidates = selector::generate_selector(&element);
    serde_json::to_string(&candidates).map_err(|e| JsError::new(&e.to_string()))
}

/// Generate element fingerprint
#[wasm_bindgen(js_name = generateFingerprint)]
pub fn generate_fingerprint(element_json: &str) -> Result<String, JsError> {
    let element: selector::ElementInfo =
        serde_json::from_str(element_json).map_err(|e| JsError::new(&e.to_string()))?;
    let fp = selector::generate_fingerprint(&element);
    serde_json::to_string(&fp).map_err(|e| JsError::new(&e.to_string()))
}

/// Calculate fingerprint similarity
#[wasm_bindgen(js_name = fingerprintSimilarity)]
pub fn fingerprint_similarity(fp_a_json: &str, fp_b_json: &str) -> Result<f64, JsError> {
    let a: selector::ElementFingerprint =
        serde_json::from_str(fp_a_json).map_err(|e| JsError::new(&e.to_string()))?;
    let b: selector::ElementFingerprint =
        serde_json::from_str(fp_b_json).map_err(|e| JsError::new(&e.to_string()))?;
    Ok(selector::fingerprint_similarity(&a, &b))
}

/// Calculate stability score
#[wasm_bindgen(js_name = calculateStability)]
pub fn calculate_stability(element_json: &str, selector: &str) -> Result<String, JsError> {
    let element: selector::ElementInfo =
        serde_json::from_str(element_json).map_err(|e| JsError::new(&e.to_string()))?;
    let score = selector::calculate_stability(&element, selector);
    serde_json::to_string(&score).map_err(|e| JsError::new(&e.to_string()))
}

/// Validate a CSS selector
#[wasm_bindgen(js_name = validateSelector)]
pub fn validate_selector(sel: &str) -> Result<String, JsError> {
    let validation = selector::validate_selector(sel);
    serde_json::to_string(&validation).map_err(|e| JsError::new(&e.to_string()))
}

/// Build locator map
#[wasm_bindgen(js_name = buildLocatorMap)]
pub fn build_locator_map(element_json: &str) -> Result<String, JsError> {
    let element: selector::ElementInfo =
        serde_json::from_str(element_json).map_err(|e| JsError::new(&e.to_string()))?;
    let map = selector::build_locator_map(&element);
    serde_json::to_string(&map).map_err(|e| JsError::new(&e.to_string()))
}

// ============================================================
// Flow Engine Exports
// ============================================================

/// Validate flow variables
#[wasm_bindgen(js_name = validateFlowVariables)]
pub fn validate_flow_variables(flow_json: &str, variables_json: &str) -> Result<String, JsError> {
    let flow: flow_engine::Flow =
        serde_json::from_str(flow_json).map_err(|e| JsError::new(&e.to_string()))?;
    let variables: serde_json::Value =
        serde_json::from_str(variables_json).map_err(|e| JsError::new(&e.to_string()))?;

    let vars: std::collections::HashMap<String, serde_json::Value> =
        serde_json::from_value(variables).unwrap_or_default();

    let executor = flow_engine::FlowExecutor::new(flow, vars);
    match executor.validate_variables() {
        Ok(()) => Ok(serde_json::json!({ "valid": true }).to_string()),
        Err(missing) => Ok(serde_json::json!({
            "valid": false,
            "missing": missing
        })
        .to_string()),
    }
}

/// Generate tool definition for a flow
#[wasm_bindgen(js_name = flowToToolDefinition)]
pub fn flow_to_tool_definition(flow_json: &str) -> Result<String, JsError> {
    let flow: flow_engine::Flow =
        serde_json::from_str(flow_json).map_err(|e| JsError::new(&e.to_string()))?;
    let tool = flow_engine::flow_to_tool_definition(&flow);
    serde_json::to_string(&tool).map_err(|e| JsError::new(&e.to_string()))
}

/// Get flow execution status
#[wasm_bindgen(js_name = getFlowStatus)]
pub fn get_flow_status(flow_json: &str, variables_json: &str) -> Result<String, JsError> {
    let flow: flow_engine::Flow =
        serde_json::from_str(flow_json).map_err(|e| JsError::new(&e.to_string()))?;
    let variables: serde_json::Value =
        serde_json::from_str(variables_json).map_err(|e| JsError::new(&e.to_string()))?;
    let vars: std::collections::HashMap<String, serde_json::Value> =
        serde_json::from_value(variables).unwrap_or_default();

    let executor = flow_engine::FlowExecutor::new(flow, vars);
    let status = executor.get_status();
    serde_json::to_string(&status).map_err(|e| JsError::new(&e.to_string()))
}

// ============================================================
// MCP Module Exports
// ============================================================

/// Create an MCP tool call request
#[wasm_bindgen(js_name = createMcpToolCall)]
pub fn create_mcp_tool_call(name: &str, arguments_json: &str) -> Result<String, JsError> {
    let args: serde_json::Value =
        serde_json::from_str(arguments_json).map_err(|e| JsError::new(&e.to_string()))?;
    let req = mcp::McpRequest::tool_call(name.to_string(), args);
    serde_json::to_string(&req).map_err(|e| JsError::new(&e.to_string()))
}

/// Create an MCP tools/list request
#[wasm_bindgen(js_name = createMcpListTools)]
pub fn create_mcp_list_tools() -> Result<String, JsError> {
    let req = mcp::McpRequest::list_tools();
    serde_json::to_string(&req).map_err(|e| JsError::new(&e.to_string()))
}

/// Create an MCP success response
#[wasm_bindgen(js_name = createMcpSuccess)]
pub fn create_mcp_success(result_json: &str) -> Result<String, JsError> {
    let result: serde_json::Value =
        serde_json::from_str(result_json).map_err(|e| JsError::new(&e.to_string()))?;
    let resp = mcp::McpResponse::success(result);
    serde_json::to_string(&resp).map_err(|e| JsError::new(&e.to_string()))
}

/// Create an MCP error response
#[wasm_bindgen(js_name = createMcpError)]
pub fn create_mcp_error(code: i64, message: &str) -> Result<String, JsError> {
    let resp = mcp::McpResponse::error(code, message.to_string());
    serde_json::to_string(&resp).map_err(|e| JsError::new(&e.to_string()))
}

#[wasm_bindgen]
pub struct ToolListCache {
    inner: mcp::ToolListCache,
}

#[wasm_bindgen]
impl ToolListCache {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self {
            inner: mcp::ToolListCache::new(),
        }
    }

    /// Check if cache is fresh
    #[wasm_bindgen(js_name = isFresh)]
    pub fn is_fresh(&self) -> bool {
        self.inner.is_fresh()
    }

    /// Set cached tools
    #[wasm_bindgen(js_name = setTools)]
    pub fn set_tools(&mut self, tools_json: &str, source: &str) {
        let tools: Vec<mcp::McpTool> = match serde_json::from_str(tools_json) {
            Ok(t) => t,
            Err(_) => return,
        };
        self.inner.set_tools(tools, source.to_string());
    }

    /// Get cached tools
    #[wasm_bindgen(js_name = getTools)]
    pub fn get_tools(&self) -> Result<String, JsError> {
        match self.inner.get_tools() {
            Some(tools) => serde_json::to_string(tools).map_err(|e| JsError::new(&e.to_string())),
            None => Ok("null".to_string()),
        }
    }

    /// Invalidate cache
    #[wasm_bindgen]
    pub fn invalidate(&mut self) {
        self.inner.invalidate();
    }

    /// Get cache status
    #[wasm_bindgen]
    pub fn status(&self) -> Result<String, JsError> {
        serde_json::to_string(&self.inner.status()).map_err(|e| JsError::new(&e.to_string()))
    }
}

#[wasm_bindgen]
pub struct FlowIdCache {
    inner: mcp::FlowIdCache,
}

#[wasm_bindgen]
impl FlowIdCache {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self {
            inner: mcp::FlowIdCache::new(),
        }
    }

    /// Get flow info by slug
    #[wasm_bindgen(js_name = getBySlug)]
    pub fn get_by_slug(&self, slug: &str) -> Result<String, JsError> {
        match self.inner.get_by_slug(slug) {
            Some(info) => serde_json::to_string(info).map_err(|e| JsError::new(&e.to_string())),
            None => Ok("null".to_string()),
        }
    }

    /// Populate cache
    #[wasm_bindgen]
    pub fn populate(&mut self, flows_json: &str) {
        let flows: Vec<mcp::FlowInfo> = match serde_json::from_str(flows_json) {
            Ok(f) => f,
            Err(_) => return,
        };
        self.inner.populate(flows);
    }

    /// Invalidate cache
    #[wasm_bindgen]
    pub fn invalidate(&mut self) {
        self.inner.invalidate();
    }

    /// Check if fresh
    #[wasm_bindgen(js_name = isFresh)]
    pub fn is_fresh(&self) -> bool {
        self.inner.is_fresh()
    }
}

// ============================================================
// Utility Functions
// ============================================================

/// Base64 encode bytes to string
fn base64_encode(bytes: &[u8]) -> String {
    use std::fmt::Write;
    const CHARS: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut result = String::new();
    for chunk in bytes.chunks(3) {
        let b0 = chunk[0] as u32;
        let b1 = chunk.get(1).map(|&b| b as u32).unwrap_or(0);
        let b2 = chunk.get(2).map(|&b| b as u32).unwrap_or(0);
        let n = (b0 << 16) | (b1 << 8) | b2;
        let c0 = CHARS[(n >> 18) as usize];
        let c1 = CHARS[((n >> 12) & 0x3F) as usize];
        let c2 = if chunk.len() > 1 {
            CHARS[((n >> 6) & 0x3F) as usize]
        } else {
            b'='
        };
        let c3 = if chunk.len() > 2 {
            CHARS[(n & 0x3F) as usize]
        } else {
            b'='
        };
        write!(result, "{}{}{}{}", c0 as char, c1 as char, c2 as char, c3 as char).unwrap();
    }
    result
}

/// Base64 decode string to bytes
fn base64_decode(s: &str) -> Result<Vec<u8>, String> {
    let s = s.trim_end_matches('=');
    let mut bytes = Vec::new();
    let mut buf = 0u32;
    let mut bits = 0u32;

    for ch in s.chars() {
        let val = match ch {
            'A'..='Z' => ch as u32 - 'A' as u32,
            'a'..='z' => ch as u32 - 'a' as u32 + 26,
            '0'..='9' => ch as u32 - '0' as u32 + 52,
            '+' => 62,
            '/' => 63,
            _ => return Err(format!("Invalid base64 character: {ch}")),
        };
        buf = (buf << 6) | val;
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            bytes.push((buf >> bits) as u8);
        }
    }
    Ok(bytes)
}

/// Get module version
#[wasm_bindgen(js_name = getVersion)]
pub fn get_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

/// Get module info as JSON
#[wasm_bindgen(js_name = getInfo)]
pub fn get_info() -> Result<String, JsError> {
    let info = serde_json::json!({
        "name": env!("CARGO_PKG_NAME"),
        "version": env!("CARGO_PKG_VERSION"),
        "modules": [
            "protocol",
            "selector",
            "reconnect",
            "flow_engine",
            "mcp"
        ]
    });
    serde_json::to_string(&info).map_err(|e| JsError::new(&e.to_string()))
}
