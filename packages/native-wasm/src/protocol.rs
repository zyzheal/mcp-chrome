//! Native Messaging Protocol
//!
//! Implements the Chrome Native Messaging binary protocol:
//! - 4-byte little-endian length prefix
//! - JSON payload serialization/deserialization
//! - Message framing with size validation

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Maximum message size (16MB) - matches native-server/src/native-messaging-host.ts
const MAX_MESSAGE_SIZE_BYTES: u32 = 16 * 1024 * 1024;

/// Maximum parser buffer size (32MB) — prevents unbounded growth from partial data
const MAX_PARSER_BUFFER_SIZE: usize = 32 * 1024 * 1024;

/// Native message type constants - mirrors packages/shared/src/types.ts
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum NativeMessageType {
    Start,
    Started,
    Stop,
    Stopped,
    Ping,
    Pong,
    Error,
    ProcessData,
    ProcessDataResponse,
    CallTool,
    CallToolResponse,
    ServerStarted,
    ServerStopped,
    ErrorFromNativeHost,
    ConnectNative,
    EnsureNative,
    PingNative,
    DisconnectNative,
    /// Custom types not in the standard enum
    #[serde(untagged)]
    Other(String),
}

impl Default for NativeMessageType {
    fn default() -> Self {
        NativeMessageType::Other(String::new())
    }
}

/// Native message structure - mirrors NativeMessage<P, E> in shared/types.ts
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NativeMessage<P = serde_json::Value, E = serde_json::Value> {
    #[serde(rename = "type", skip_serializing_if = "Option::is_none")]
    pub msg_type: Option<String>,
    #[serde(rename = "responseToRequestId", skip_serializing_if = "Option::is_none")]
    pub response_to_request_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub payload: Option<P>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<E>,
    #[serde(rename = "requestId", skip_serializing_if = "Option::is_none")]
    pub request_id: Option<String>,
}

/// Server status - mirrors native-host.ts ServerStatus
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerStatus {
    #[serde(rename = "isRunning")]
    pub is_running: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub port: Option<u16>,
    #[serde(rename = "lastUpdated")]
    pub last_updated: u64,
    #[serde(rename = "mcpConnected", skip_serializing_if = "Option::is_none")]
    pub mcp_connected: Option<bool>,
}

/// Encoded message with 4-byte length prefix + payload
///
/// Note: In WASM, we cannot directly read/write stdio. Instead, we serialize
/// messages to/from byte arrays that the JavaScript host can handle.
pub struct FramedMessage {
    pub data: Vec<u8>,
}

impl FramedMessage {
    /// Serialize a message to bytes with 4-byte LE length prefix
    pub fn from_message<T: Serialize>(msg: &T) -> Result<Self, String> {
        let json = serde_json::to_string(msg).map_err(|e| format!("JSON serialize error: {e}"))?;
        let payload = json.into_bytes();
        let len = payload.len() as u32;

        if len > MAX_MESSAGE_SIZE_BYTES {
            return Err(format!(
                "Message size {} exceeds maximum {}",
                len, MAX_MESSAGE_SIZE_BYTES
            ));
        }

        let mut data = Vec::with_capacity(4 + payload.len());
        data.extend_from_slice(&len.to_le_bytes());
        data.extend_from_slice(&payload);

        Ok(Self { data })
    }

    /// Parse bytes with 4-byte LE length prefix into a message
    pub fn to_message<T: for<'de> Deserialize<'de>>(data: &[u8]) -> Result<T, String> {
        if data.len() < 4 {
            return Err("Insufficient data for length prefix".to_string());
        }

        let len_bytes: [u8; 4] = data[0..4]
            .try_into()
            .map_err(|_| "Failed to read length bytes")?;
        let expected_length = u32::from_le_bytes(len_bytes);

        if expected_length == 0 || expected_length > MAX_MESSAGE_SIZE_BYTES {
            return Err(format!("Invalid message length: {expected_length}"));
        }

        if data.len() < 4 + expected_length as usize {
            return Err(format!(
                "Incomplete message: need {} bytes, have {}",
                4 + expected_length as usize,
                data.len()
            ));
        }

        let payload = &data[4..4 + expected_length as usize];
        let json =
            std::str::from_utf8(payload).map_err(|e| format!("UTF-8 decode error: {e}"))?;

        serde_json::from_str(json).map_err(|e| format!("JSON parse error: {e}"))
    }

    /// Get the raw bytes for transmission
    pub fn into_bytes(self) -> Vec<u8> {
        self.data
    }
}

/// Message parser for incremental reading (state machine)
///
/// This replaces the buffer-based parsing in native-messaging-host.ts
/// setupMessageHandling()
pub struct MessageParser {
    buffer: Vec<u8>,
    expected_length: i64,
}

impl MessageParser {
    pub fn new() -> Self {
        Self {
            buffer: Vec::new(),
            expected_length: -1,
        }
    }

    /// Feed data into the parser. Returns complete messages that can be parsed.
    pub fn feed(&mut self, chunk: &[u8]) -> Vec<Vec<u8>> {
        if self.buffer.len() + chunk.len() > MAX_PARSER_BUFFER_SIZE {
            self.reset();
            return Vec::new();
        }
        self.buffer.extend_from_slice(chunk);
        let mut complete_messages = Vec::new();

        loop {
            if self.expected_length == -1 {
                // Need at least 4 bytes for length header
                if self.buffer.len() < 4 {
                    break;
                }
                let len_bytes: [u8; 4] = match self.buffer[0..4].try_into() {
                    Ok(bytes) => bytes,
                    Err(_) => break,
                };
                self.expected_length = u32::from_le_bytes(len_bytes) as i64;
                self.buffer.drain(0..4);

                // Validate length
                if self.expected_length <= 0
                    || self.expected_length > MAX_MESSAGE_SIZE_BYTES as i64
                {
                    // Invalid length - reset parser
                    self.expected_length = -1;
                    self.buffer.clear();
                    break;
                }
            }

            // Check if we have enough data for the message
            if self.buffer.len() < self.expected_length as usize {
                break;
            }

            // Extract complete message
            let message = self.buffer.drain(0..self.expected_length as usize).collect();
            complete_messages.push(message);
            self.expected_length = -1;

            // Safety limit: process at most 100 messages per feed call
            if complete_messages.len() >= 100 {
                break;
            }
        }

        complete_messages
    }

    /// Reset the parser state
    pub fn reset(&mut self) {
        self.buffer.clear();
        self.expected_length = -1;
    }
}

impl Default for MessageParser {
    fn default() -> Self {
        Self::new()
    }
}

/// Heartbeat state machine - mirrors HeartbeatState in native-messaging-host.ts
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HeartbeatState {
    pub last_sent_time: u64,
    pub last_received_time: u64,
    pub pending_pong: bool,
}

impl HeartbeatState {
    pub fn new() -> Self {
        Self {
            last_sent_time: 0,
            last_received_time: current_time_ms(),
            pending_pong: false,
        }
    }

    /// Record a received message (pong or any message)
    pub fn record_received(&mut self) {
        self.last_received_time = current_time_ms();
        self.pending_pong = false;
    }

    /// Send a heartbeat ping if needed
    pub fn should_send_ping(&self, interval_ms: u64) -> bool {
        !self.pending_pong
            && current_time_ms() - self.last_sent_time >= interval_ms
    }

    /// Mark ping as sent
    pub fn mark_sent_ping(&mut self) {
        self.last_sent_time = current_time_ms();
        self.pending_pong = true;
    }

    /// Check if connection appears dead
    pub fn is_dead(&self, interval_ms: u64, timeout_ms: u64) -> bool {
        current_time_ms() - self.last_received_time > interval_ms + timeout_ms
    }

    /// Get time since last received message
    pub fn time_since_last_received_ms(&self) -> u64 {
        current_time_ms() - self.last_received_time
    }
}

impl Default for HeartbeatState {
    fn default() -> Self {
        Self::new()
    }
}

/// Pending request tracker - mirrors pendingRequests Map in native-messaging-host.ts
#[derive(Debug, Serialize, Deserialize)]
pub struct PendingRequest {
    pub request_id: String,
    pub message_type: String,
    pub created_at_ms: u64,
    pub timeout_ms: u64,
}

/// Request tracker for managing pending requests
pub struct RequestTracker {
    requests: HashMap<String, PendingRequest>,
    max_pending: usize,
}

impl RequestTracker {
    pub fn new(max_pending: usize) -> Self {
        Self {
            requests: HashMap::new(),
            max_pending,
        }
    }

    /// Add a pending request
    pub fn add(&mut self, request_id: String, message_type: String, timeout_ms: u64) -> bool {
        if self.requests.len() >= self.max_pending {
            return false;
        }
        self.requests.insert(
            request_id.clone(),
            PendingRequest {
                request_id,
                message_type,
                created_at_ms: current_time_ms(),
                timeout_ms,
            },
        );
        true
    }

    /// Remove and return a pending request
    pub fn remove(&mut self, request_id: &str) -> Option<PendingRequest> {
        self.requests.remove(request_id)
    }

    /// Check if a request exists
    pub fn contains(&self, request_id: &str) -> bool {
        self.requests.contains_key(request_id)
    }

    /// Get count of pending requests
    pub fn len(&self) -> usize {
        self.requests.len()
    }

    pub fn is_empty(&self) -> bool {
        self.requests.is_empty()
    }

    /// Check for timed-out requests, returns list of expired request IDs
    pub fn check_timeouts(&mut self) -> Vec<String> {
        let now = current_time_ms();
        let expired: Vec<String> = self.requests
            .iter()
            .filter(|(_, r)| now - r.created_at_ms > r.timeout_ms)
            .map(|(k, _)| k.clone())
            .collect();
        for id in &expired {
            self.requests.remove(id);
        }
        expired
    }
}

impl Default for RequestTracker {
    fn default() -> Self {
        Self::new(100)
    }
}

/// Get current time in milliseconds
pub use crate::util::current_time_ms;

/// Create a start message
pub fn create_start_message(port: u16) -> NativeMessage {
    NativeMessage {
        msg_type: Some("start".to_string()),
        response_to_request_id: None,
        payload: Some(serde_json::json!({ "port": port })),
        error: None,
        request_id: None,
    }
}

/// Create a server started response
pub fn create_server_started_response(port: u16) -> NativeMessage {
    NativeMessage {
        msg_type: Some("server_started".to_string()),
        response_to_request_id: None,
        payload: Some(serde_json::json!({ "port": port })),
        error: None,
        request_id: None,
    }
}

/// Create an error response
pub fn create_error_response(error_message: &str, code: &str) -> NativeMessage {
    NativeMessage {
        msg_type: Some("error_from_native_host".to_string()),
        response_to_request_id: None,
        payload: Some(serde_json::json!({
            "success": false,
            "error": error_message,
            "code": code,
        })),
        error: None,
        request_id: None,
    }
}

/// Create a tool request message
pub fn create_tool_request(name: &str, args: &serde_json::Value) -> NativeMessage {
    NativeMessage {
        msg_type: Some("call_tool".to_string()),
        response_to_request_id: None,
        payload: Some(serde_json::json!({ "name": name, "args": args })),
        error: None,
        request_id: None,
    }
}

/// Create a heartbeat ping message
pub fn create_heartbeat_ping() -> NativeMessage {
    NativeMessage {
        msg_type: Some("heartbeat_ping".to_string()),
        response_to_request_id: None,
        payload: None,
        error: None,
        request_id: None,
    }
}

/// Validate a native message has required fields
pub fn validate_message(msg: &NativeMessage) -> Result<(), String> {
    if msg.msg_type.is_none() && msg.response_to_request_id.is_none() {
        return Err("Message must have either 'type' or 'responseToRequestId'".to_string());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_frame_and_parse_message() {
        let msg = create_start_message(12306);
        let framed = FramedMessage::from_message(&msg).unwrap();
        let parsed: NativeMessage = FramedMessage::to_message(&framed.data).unwrap();
        assert_eq!(parsed.msg_type, Some("start".to_string()));
    }

    #[test]
    fn test_message_parser_incremental() {
        let msg = create_start_message(12306);
        let framed = FramedMessage::from_message(&msg).unwrap();
        let bytes = framed.into_bytes();

        // Feed partial chunks — split AFTER the 4-byte header to ensure
        // the parser reads the length correctly on first feed
        let mut parser = MessageParser::new();
        let payload_len = bytes.len() - 4;
        let mid = 4 + payload_len / 2;
        let messages1 = parser.feed(&bytes[..mid]);
        assert!(messages1.is_empty());

        let messages2 = parser.feed(&bytes[mid..]);
        assert_eq!(messages2.len(), 1);

        // The feed method returns raw JSON payload bytes (without length prefix),
        // so parse directly as JSON
        let json = String::from_utf8(messages2[0].clone()).unwrap();
        let parsed: NativeMessage = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.msg_type, Some("start".to_string()));
    }

    #[test]
    fn test_heartbeat_state() {
        let mut hb = HeartbeatState::new();
        assert!(!hb.pending_pong);

        hb.mark_sent_ping();
        assert!(hb.pending_pong);

        hb.record_received();
        assert!(!hb.pending_pong);
    }

    #[test]
    fn test_request_tracker() {
        let mut tracker = RequestTracker::new(100);
        assert!(tracker.add("req1".to_string(), "call_tool".to_string(), 5000));
        assert!(tracker.contains("req1"));
        assert_eq!(tracker.len(), 1);

        let removed = tracker.remove("req1");
        assert!(removed.is_some());
        assert!(tracker.is_empty());
    }
}
