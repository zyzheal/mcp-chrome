//! MCP Protocol Utilities
//!
//! Implements portable MCP tool caching, request/response handling, and session management.
//! Mirrors the cache logic from native-server/src/mcp/register-tools.ts

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// ============================================================
// Constants
// ============================================================

/// Cache TTL in milliseconds (5 minutes)
const CACHE_TTL_MS: u64 = 5 * 60 * 1000;

/// Maximum cache entries
const MAX_CACHE_ENTRIES: usize = 50;

// ============================================================
// MCP Tool Types
// ============================================================

/// MCP Tool definition
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpTool {
    pub name: String,
    pub description: String,
    pub input_schema: ToolInputSchema,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolInputSchema {
    #[serde(rename = "type")]
    pub type_field: String,
    pub properties: HashMap<String, ToolProperty>,
    #[serde(default)]
    pub required: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolProperty {
    #[serde(default)]
    pub description: String,
    #[serde(rename = "type", default)]
    pub type_field: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub default: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub enum_field: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub items: Option<serde_json::Value>,
}

/// MCP Tool call result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCallResult {
    pub content: Vec<ContentBlock>,
    #[serde(rename = "isError")]
    pub is_error: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ContentBlock {
    Text { text: String },
    Image { data: String, mime_type: String },
    Resource { resource: ResourceContent },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResourceContent {
    pub uri: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mime_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub blob: Option<String>,
}

/// MCP Session state
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpSession {
    pub session_id: String,
    pub created_at_ms: u64,
    pub last_activity_ms: u64,
    pub transport_type: String, // "sse" | "streamableHttp"
    pub tools_cache_valid: bool,
}

impl McpSession {
    pub fn new(session_id: String, transport_type: String) -> Self {
        let now = current_time_ms();
        Self {
            session_id,
            created_at_ms: now,
            last_activity_ms: now,
            transport_type,
            tools_cache_valid: true,
        }
    }

    pub fn is_expired(&self, timeout_ms: u64) -> bool {
        current_time_ms() - self.last_activity_ms > timeout_ms
    }

    pub fn touch(&mut self) {
        self.last_activity_ms = current_time_ms();
    }

    pub fn invalidate_tools(&mut self) {
        self.tools_cache_valid = false;
    }
}

// ============================================================
// Tool List Cache
// ============================================================

/// Tool list cache - mirrors ToolListCache in register-tools.ts
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolListCache {
    tools: Option<CachedToolList>,
    last_fetch_time_ms: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CachedToolList {
    tools: Vec<McpTool>,
    timestamp_ms: u64,
    source: String, // "extension" | "fallback"
}

impl ToolListCache {
    pub fn new() -> Self {
        Self {
            tools: None,
            last_fetch_time_ms: None,
        }
    }

    /// Check if cache is still valid
    pub fn is_fresh(&self) -> bool {
        if let Some(ref cached) = self.tools {
            current_time_ms() - cached.timestamp_ms < CACHE_TTL_MS
        } else {
            false
        }
    }

    /// Get cached tools if fresh
    pub fn get_tools(&self) -> Option<&Vec<McpTool>> {
        if self.is_fresh() {
            self.tools.as_ref().map(|c| &c.tools)
        } else {
            None
        }
    }

    /// Set cached tools
    pub fn set_tools(&mut self, tools: Vec<McpTool>, source: String) {
        let now = current_time_ms();
        let capped = if tools.len() > MAX_CACHE_ENTRIES {
            tools.into_iter().take(MAX_CACHE_ENTRIES).collect()
        } else {
            tools
        };
        self.tools = Some(CachedToolList {
            tools: capped,
            timestamp_ms: now,
            source,
        });
        self.last_fetch_time_ms = Some(now);
    }

    /// Invalidate cache
    pub fn invalidate(&mut self) {
        self.tools = None;
        self.last_fetch_time_ms = None;
    }

    /// Get cache status
    pub fn status(&self) -> CacheStatus {
        let now = current_time_ms();
        if let Some(ref cached) = self.tools {
            CacheStatus {
                has_cache: true,
                age_seconds: ((now - cached.timestamp_ms) / 1000) as u64,
                tool_count: cached.tools.len(),
                source: cached.source.clone(),
            }
        } else {
            CacheStatus {
                has_cache: false,
                age_seconds: 0,
                tool_count: 0,
                source: String::new(),
            }
        }
    }
}

impl Default for ToolListCache {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CacheStatus {
    pub has_cache: bool,
    pub age_seconds: u64,
    pub tool_count: usize,
    pub source: String,
}

// ============================================================
// Flow ID Cache
// ============================================================

/// Flow info for slug -> ID resolution
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FlowInfo {
    pub id: String,
    pub slug: String,
    pub name: String,
}

/// Flow ID cache - mirrors FlowIdCache in register-tools.ts
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FlowIdCache {
    flows: HashMap<String, FlowInfo>,
    timestamp_ms: u64,
}

impl FlowIdCache {
    pub fn new() -> Self {
        Self {
            flows: HashMap::new(),
            timestamp_ms: 0,
        }
    }

    /// Get flow info by slug
    pub fn get_by_slug(&self, slug: &str) -> Option<&FlowInfo> {
        if self.timestamp_ms == 0 {
            return None;
        }
        if current_time_ms() - self.timestamp_ms > CACHE_TTL_MS {
            return None;
        }
        self.flows.get(slug)
    }

    /// Populate cache with flow info
    pub fn populate(&mut self, flows: Vec<FlowInfo>) {
        self.flows.clear();
        for flow in flows.into_iter().take(MAX_CACHE_ENTRIES) {
            self.flows.insert(flow.slug.clone(), flow);
        }
        self.timestamp_ms = current_time_ms();
    }

    /// Invalidate cache
    pub fn invalidate(&mut self) {
        self.flows.clear();
        self.timestamp_ms = 0;
    }

    /// Check if cache is fresh
    pub fn is_fresh(&self) -> bool {
        self.timestamp_ms > 0 && current_time_ms() - self.timestamp_ms < CACHE_TTL_MS
    }
}

impl Default for FlowIdCache {
    fn default() -> Self {
        Self::new()
    }
}

// ============================================================
// MCP Request/Response
// ============================================================

/// MCP JSON-RPC request
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpRequest {
    pub jsonrpc: String,
    pub id: Option<serde_json::Value>,
    pub method: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub params: Option<serde_json::Value>,
}

/// MCP JSON-RPC response
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpResponse {
    pub jsonrpc: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<McpError>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpError {
    pub code: i64,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<serde_json::Value>,
}

impl McpRequest {
    pub fn new(method: String, params: Option<serde_json::Value>) -> Self {
        Self {
            jsonrpc: "2.0".to_string(),
            id: None,
            method,
            params,
        }
    }

    pub fn tool_call(name: String, arguments_map: serde_json::Value) -> Self {
        Self {
            jsonrpc: "2.0".to_string(),
            id: Some(serde_json::Value::String(uuid_v4())),
            method: "tools/call".to_string(),
            params: Some(serde_json::json!({
                "name": name,
                "arguments": arguments_map,
            })),
        }
    }

    pub fn list_tools() -> Self {
        Self {
            jsonrpc: "2.0".to_string(),
            id: Some(serde_json::Value::String(uuid_v4())),
            method: "tools/list".to_string(),
            params: None,
        }
    }
}

impl McpResponse {
    pub fn success(result: serde_json::Value) -> Self {
        Self {
            jsonrpc: "2.0".to_string(),
            id: None,
            result: Some(result),
            error: None,
        }
    }

    pub fn error(code: i64, message: String) -> Self {
        Self {
            jsonrpc: "2.0".to_string(),
            id: None,
            result: None,
            error: Some(McpError {
                code,
                message,
                data: None,
            }),
        }
    }
}

// ============================================================
// Error Code Constants
// ============================================================

pub const MCP_ERROR_CODES: &str = r#"{
  "PARSE_ERROR": -32700,
  "INVALID_REQUEST": -32600,
  "METHOD_NOT_FOUND": -32601,
  "INVALID_PARAMS": -32602,
  "INTERNAL_ERROR": -32603,
  "REQUEST_TIMEOUT": -32000
}"#;

// ============================================================
// UUID v4 (simplified for WASM)
// ============================================================

fn uuid_v4() -> String {
    let mut bytes = [0u8; 16];
    getrandom::getrandom(&mut bytes).unwrap_or_else(|_| {
        // Fallback: use time-based hash if getrandom fails
        let t = current_time_ms();
        for (i, b) in t.to_le_bytes().iter().enumerate().take(8) {
            bytes[i] = *b;
        }
    });
    // Set version (4) and variant (RFC 4122) bits
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    format!(
        "{:02x}{:02x}{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}{:02x}{:02x}{:02x}{:02x}",
        bytes[0], bytes[1], bytes[2], bytes[3],
        bytes[4], bytes[5], bytes[6], bytes[7],
        bytes[8], bytes[9], bytes[10], bytes[11],
        bytes[12], bytes[13], bytes[14], bytes[15],
    )
}

pub use crate::util::current_time_ms;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_tool_cache_freshness() {
        let mut cache = ToolListCache::new();
        assert!(!cache.is_fresh());

        cache.set_tools(vec![], "test".to_string());
        assert!(cache.is_fresh());
    }

    #[test]
    fn test_tool_cache_invalidation() {
        let mut cache = ToolListCache::new();
        cache.set_tools(vec![], "test".to_string());
        assert!(cache.is_fresh());

        cache.invalidate();
        assert!(!cache.is_fresh());
    }

    #[test]
    fn test_flow_id_cache() {
        let mut cache = FlowIdCache::new();
        assert!(cache.get_by_slug("test").is_none());

        cache.populate(vec![FlowInfo {
            id: "flow-1".to_string(),
            slug: "test".to_string(),
            name: "Test Flow".to_string(),
        }]);

        assert!(cache.get_by_slug("test").is_some());
        assert!(cache.get_by_slug("unknown").is_none());
        assert!(cache.is_fresh());
    }

    #[test]
    fn test_mcp_request_tool_call() {
        let req = McpRequest::tool_call(
            "chrome_navigate".to_string(),
            serde_json::json!({ "url": "https://example.com" }),
        );
        assert_eq!(req.method, "tools/call");
        assert!(req.params.is_some());
    }

    #[test]
    fn test_mcp_response_success() {
        let resp = McpResponse::success(serde_json::json!({ "status": "ok" }));
        assert!(resp.result.is_some());
        assert!(resp.error.is_none());
    }

    #[test]
    fn test_mcp_session_expiry() {
        let mut session = McpSession::new("sess-1".to_string(), "sse".to_string());
        assert!(!session.is_expired(60_000));

        // Can't easily test expiry without manipulating time, but touch works
        session.touch();
        assert!(!session.is_expired(60_000));
    }
}
