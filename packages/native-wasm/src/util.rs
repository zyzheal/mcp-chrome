//! Shared utility functions used across the WASM crate.

/// Get current time in milliseconds.
///
/// In WASM, this relies on `std::time::SystemTime`. When compiled for WASM
/// and loaded in a browser or Node.js, the underlying time source comes from
/// the host environment.
pub fn current_time_ms() -> u64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}
