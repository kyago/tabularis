use serde_json::Value;

pub trait RuntimeEvents: Send + Sync {
    fn emit(&self, event: &str, payload: Value) -> Result<(), String>;

    fn emit_to(&self, _session_id: uuid::Uuid, event: &str, payload: Value) -> Result<(), String> {
        self.emit(event, payload)
    }

    /// Web sessions with a live socket subscribed to `event`; empty outside the web transport.
    fn subscribed_sessions(&self, _event: &str) -> Vec<uuid::Uuid> {
        Vec::new()
    }
}

#[derive(Default)]
pub struct NoopRuntimeEvents;

impl RuntimeEvents for NoopRuntimeEvents {
    fn emit(&self, _event: &str, _payload: Value) -> Result<(), String> {
        Ok(())
    }
}
