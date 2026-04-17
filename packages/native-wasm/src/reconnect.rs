//! Reconnect Manager
//!
//! Implements exponential backoff with jitter for auto-reconnection.
//! Mirrors the reconnect logic in chrome-extension/entrypoints/background/native-host.ts

use serde::{Deserialize, Serialize};

// ============================================================
// Constants (mirrors native-host.ts)
// ============================================================

const RECONNECT_BASE_DELAY_MS: u64 = 500;
const RECONNECT_MAX_DELAY_MS: u64 = 60_000;
const RECONNECT_MAX_FAST_ATTEMPTS: u64 = 8;
const RECONNECT_COOLDOWN_DELAY_MS: u64 = 5 * 60_000;

// ============================================================
// State
// ============================================================

/// Reconnection state machine
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReconnectState {
    pub enabled: bool,
    pub attempts: u64,
    pub manual_disconnect: bool,
    pub connected: bool,
    pub last_connected_at_ms: Option<u64>,
}

impl ReconnectState {
    pub fn new() -> Self {
        Self {
            enabled: true,
            attempts: 0,
            manual_disconnect: false,
            connected: false,
            last_connected_at_ms: None,
        }
    }

    /// Should we attempt to reconnect?
    pub fn should_reconnect(&self) -> bool {
        self.enabled && !self.connected && !self.manual_disconnect
    }

    /// Calculate the next reconnect delay with exponential backoff and jitter
    pub fn next_delay_ms(&self) -> u64 {
        if self.attempts >= RECONNECT_MAX_FAST_ATTEMPTS {
            // Cooldown mode: fixed long interval with jitter
            with_jitter(RECONNECT_COOLDOWN_DELAY_MS)
        } else {
            // Exponential backoff: base * 2^attempt, capped at max
            let delay = std::cmp::min(
                RECONNECT_BASE_DELAY_MS * 2u64.pow(self.attempts as u32),
                RECONNECT_MAX_DELAY_MS,
            );
            with_jitter(delay)
        }
    }

    /// Mark a successful connection
    pub fn mark_connected(&mut self) {
        self.connected = true;
        self.attempts = 0;
        self.manual_disconnect = false;
        self.last_connected_at_ms = Some(current_time_ms());
    }

    /// Mark a failed connection attempt
    pub fn mark_failed(&mut self) {
        self.connected = false;
        self.attempts += 1;
    }

    /// Manual disconnect: disable auto-reconnect
    pub fn manual_disconnect(&mut self) {
        self.connected = false;
        self.manual_disconnect = true;
        self.enabled = false;
        self.attempts = 0;
    }

    /// Re-enable auto-connect
    pub fn enable_auto_connect(&mut self) {
        self.enabled = true;
        self.manual_disconnect = false;
    }

    /// Disable auto-connect
    pub fn disable_auto_connect(&mut self) {
        self.enabled = false;
    }

    /// Reset to initial state
    pub fn reset(&mut self) {
        self.attempts = 0;
        self.connected = false;
        self.manual_disconnect = false;
    }

    /// Get current state as a status object
    pub fn status(&self) -> ReconnectStatus {
        ReconnectStatus {
            enabled: self.enabled,
            attempts: self.attempts,
            connected: self.connected,
            next_delay_ms: if self.should_reconnect() {
                Some(self.next_delay_ms())
            } else {
                None
            },
            time_since_connected_ms: self.last_connected_at_ms.map(|t| current_time_ms() - t),
        }
    }
}

impl Default for ReconnectState {
    fn default() -> Self {
        Self::new()
    }
}

/// Status snapshot for serialization
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReconnectStatus {
    pub enabled: bool,
    pub attempts: u64,
    pub connected: bool,
    pub next_delay_ms: Option<u64>,
    pub time_since_connected_ms: Option<u64>,
}

// ============================================================
// Jitter
// ============================================================

/// Apply jitter to a delay value (ratio: 0.7 to 1.3)
///
/// In WASM, we use a simple hash-based pseudo-random since `getrandom` is available.
fn with_jitter(ms: u64) -> u64 {
    let now = current_time_ms();
    // Simple hash-based pseudo-random in range [0.7, 1.3]
    let ratio = 70 + ((now.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407) >> 33) % 61);
    let ratio = (ratio as f64) / 100.0;
    ((ms as f64 * ratio).round() as u64).max(1)
}

// ============================================================
// Time utility
// ============================================================

pub use crate::util::current_time_ms;

// ============================================================
// Connection Mode
// ============================================================

/// Connection mode - mirrors connection-mode.ts
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum ConnectionMode {
    #[serde(rename = "native-server")]
    NativeServer,
    #[serde(rename = "cli-direct")]
    CliDirect,
}

impl ConnectionMode {
    pub fn is_native_server(&self) -> bool {
        matches!(self, ConnectionMode::NativeServer)
    }

    pub fn is_cli_direct(&self) -> bool {
        matches!(self, ConnectionMode::CliDirect)
    }
}

impl Default for ConnectionMode {
    fn default() -> Self {
        ConnectionMode::NativeServer
    }
}

/// Connection mode manager
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectionModeManager {
    pub current_mode: ConnectionMode,
    pub last_switched_ms: Option<u64>,
}

impl ConnectionModeManager {
    pub fn new() -> Self {
        Self {
            current_mode: ConnectionMode::default(),
            last_switched_ms: None,
        }
    }

    pub fn switch_to(&mut self, mode: ConnectionMode) {
        self.current_mode = mode;
        self.last_switched_ms = Some(current_time_ms());
    }

    pub fn is_native_server(&self) -> bool {
        self.current_mode.is_native_server()
    }

    pub fn is_cli_direct(&self) -> bool {
        self.current_mode.is_cli_direct()
    }
}

impl Default for ConnectionModeManager {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_initial_state() {
        let state = ReconnectState::new();
        assert!(state.should_reconnect());
        assert_eq!(state.attempts, 0);
        assert!(!state.connected);
    }

    #[test]
    fn test_backoff_progression() {
        let mut state = ReconnectState::new();

        // First attempt
        let delay0 = state.next_delay_ms();
        assert!(delay0 >= 350 && delay0 <= 650); // 500 * [0.7, 1.3]

        state.mark_failed();
        let delay1 = state.next_delay_ms();
        assert!(delay1 > delay0); // Should be ~1000ms with jitter

        state.mark_failed();
        let delay2 = state.next_delay_ms();
        assert!(delay2 > delay1); // Should be ~2000ms with jitter
    }

    #[test]
    fn test_cooldown_mode() {
        let mut state = ReconnectState::new();

        // Fast-forward to cooldown mode
        for _ in 0..RECONNECT_MAX_FAST_ATTEMPTS {
            state.mark_failed();
        }

        let delay = state.next_delay_ms();
        // Should be ~5 minutes with jitter (210000 to 390000 ms)
        assert!(delay > 200_000 && delay < 400_000);
    }

    #[test]
    fn test_mark_connected_resets() {
        let mut state = ReconnectState::new();
        state.mark_failed();
        state.mark_failed();
        assert_eq!(state.attempts, 2);

        state.mark_connected();
        assert_eq!(state.attempts, 0);
        assert!(state.connected);
    }

    #[test]
    fn test_manual_disconnect() {
        let mut state = ReconnectState::new();
        state.manual_disconnect();
        assert!(!state.should_reconnect());
        assert!(!state.enabled);
        assert!(state.manual_disconnect);
    }

    #[test]
    fn test_re_enable() {
        let mut state = ReconnectState::new();
        state.disable_auto_connect();
        assert!(!state.should_reconnect());

        state.enable_auto_connect();
        assert!(state.should_reconnect());
    }
}
