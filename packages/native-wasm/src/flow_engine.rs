//! Record & Replay Flow Engine
//!
//! Implements the portable state machine for flow execution.
//! Mirrors the core engine logic from chrome-extension/entrypoints/background/record-replay-v3/.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// ============================================================
// Flow Definition Types
// ============================================================

/// A complete flow definition
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Flow {
    pub id: String,
    pub slug: String,
    pub name: String,
    pub description: Option<String>,
    pub version: u32,
    pub steps: Vec<Step>,
    pub variables: Vec<FlowVariable>,
    pub meta: Option<FlowMeta>,
    pub published: bool,
}

/// Flow metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FlowMeta {
    pub tool: Option<ToolMeta>,
    pub created_at_ms: Option<u64>,
    pub updated_at_ms: Option<u64>,
    pub tags: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolMeta {
    pub description: Option<String>,
    pub category: Option<String>,
}

/// A single step in a flow
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Step {
    pub id: String,
    pub r#type: StepType,
    pub action: String,
    pub target: Option<StepTarget>,
    pub value: Option<serde_json::Value>,
    pub options: Option<HashMap<String, serde_json::Value>>,
    pub conditions: Option<Vec<StepCondition>>,
    pub metadata: Option<HashMap<String, serde_json::Value>>,
}

/// Step types
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum StepType {
    #[serde(rename = "navigate")]
    Navigate,
    #[serde(rename = "click")]
    Click,
    #[serde(rename = "fill")]
    Fill,
    #[serde(rename = "select")]
    Select,
    #[serde(rename = "check")]
    Check,
    #[serde(rename = "hover")]
    Hover,
    #[serde(rename = "wait")]
    Wait,
    #[serde(rename = "screenshot")]
    Screenshot,
    #[serde(rename = "evaluate")]
    Evaluate,
    #[serde(rename = "keypress")]
    Keypress,
    #[serde(rename = "scroll")]
    Scroll,
    #[serde(rename = "conditional")]
    Conditional,
    #[serde(rename = "assert")]
    Assert,
}

/// Step target for element-based actions
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StepTarget {
    pub selector: Option<String>,
    pub selector_type: Option<String>, // "css" | "xpath"
    pub ref_id: Option<String>,
    pub frame_id: Option<i64>,
    pub coordinates: Option<Coordinates>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Coordinates {
    pub x: f64,
    pub y: f64,
}

/// Flow variable definition
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FlowVariable {
    pub key: String,
    pub label: String,
    pub r#type: String, // "string" | "number" | "boolean" | "enum" | "array"
    pub default: Option<serde_json::Value>,
    pub rules: Option<VariableRules>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VariableRules {
    pub required: bool,
    pub r#enum: Option<Vec<String>>,
}

/// Step condition
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StepCondition {
    pub r#type: ConditionType,
    pub expression: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum ConditionType {
    #[serde(rename = "url_match")]
    UrlMatch,
    #[serde(rename = "element_exists")]
    ElementExists,
    #[serde(rename = "text_visible")]
    TextVisible,
    #[serde(rename = "variable_eq")]
    VariableEq,
}

// ============================================================
// Flow Execution State Machine
// ============================================================

/// Execution state
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum ExecutionState {
    Idle,
    Running,
    Paused,
    Completed,
    Failed,
    Cancelled,
}

/// Flow execution result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecutionResult {
    pub flow_id: String,
    pub state: ExecutionState,
    pub current_step_index: usize,
    pub total_steps: usize,
    pub start_time_ms: u64,
    pub end_time_ms: Option<u64>,
    pub error: Option<String>,
    pub captured_data: HashMap<String, serde_json::Value>,
    pub step_results: Vec<StepExecutionResult>,
    pub return_logs: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StepExecutionResult {
    pub step_id: String,
    pub step_type: StepType,
    pub success: bool,
    pub duration_ms: u64,
    pub error: Option<String>,
    pub captured_value: Option<serde_json::Value>,
}

/// Flow execution engine (state machine)
pub struct FlowExecutor {
    flow: Flow,
    state: ExecutionState,
    current_step_index: usize,
    variables: HashMap<String, serde_json::Value>,
    captured_data: HashMap<String, serde_json::Value>,
    step_results: Vec<StepExecutionResult>,
    start_time_ms: u64,
}

impl FlowExecutor {
    /// Create a new executor for the given flow
    pub fn new(flow: Flow, input_variables: HashMap<String, serde_json::Value>) -> Self {
        let now = current_time_ms();
        let mut executor = Self {
            flow,
            state: ExecutionState::Idle,
            current_step_index: 0,
            variables: input_variables,
            captured_data: HashMap::new(),
            step_results: Vec::new(),
            start_time_ms: now,
        };
        executor.apply_default_variables();
        executor
    }

    /// Apply default variable values
    fn apply_default_variables(&mut self) {
        for var in &self.flow.variables {
            if !self.variables.contains_key(&var.key) {
                if let Some(default) = &var.default {
                    self.variables.insert(var.key.clone(), default.clone());
                }
            }
        }
    }

    /// Validate all required variables are present
    pub fn validate_variables(&self) -> Result<(), Vec<String>> {
        let mut missing = Vec::new();
        for var in &self.flow.variables {
            if var
                .rules
                .as_ref()
                .is_some_and(|r| r.required)
                && !self.variables.contains_key(&var.key)
            {
                missing.push(var.key.clone());
            }
        }
        if missing.is_empty() {
            Ok(())
        } else {
            Err(missing)
        }
    }

    /// Start execution (returns first step to execute, or None if complete)
    pub fn start(&mut self) -> Result<Option<Step>, String> {
        if self.state != ExecutionState::Idle {
            return Err(format!("Cannot start from state: {:?}", self.state));
        }

        self.validate_variables().map_err(|missing| {
            format!("Missing required variables: {}", missing.join(", "))
        })?;

        self.state = ExecutionState::Running;
        self.current_step_index = 0;
        self.step_results.clear();

        self.next_step()
    }

    /// Mark current step as completed and advance
    pub fn mark_step_completed(
        &mut self,
        captured_value: Option<serde_json::Value>,
    ) -> Result<Option<Step>, String> {
        if self.state != ExecutionState::Running {
            return Err("Not running".to_string());
        }

        let step = &self.flow.steps[self.current_step_index];
        let result = StepExecutionResult {
            step_id: step.id.clone(),
            step_type: step.r#type.clone(),
            success: true,
            duration_ms: 0, // Would be tracked by JS host
            error: None,
            captured_value: captured_value.clone(),
        };
        self.step_results.push(result);

        // Store captured data with variable interpolation
        if let Some(value) = captured_value {
            self.captured_data
                .insert(format!("step_{}", self.current_step_index), value);
        }

        self.current_step_index += 1;
        self.next_step()
    }

    /// Mark current step as failed
    pub fn mark_step_failed(&mut self, error: String) -> ExecutionResult {
        let step = self.flow.steps.get(self.current_step_index);
        let result = StepExecutionResult {
            step_id: step.map(|s| s.id.clone()).unwrap_or_default(),
            step_type: step.map(|s| s.r#type.clone()).unwrap_or(StepType::Wait),
            success: false,
            duration_ms: 0,
            error: Some(error.clone()),
            captured_value: None,
        };
        self.step_results.push(result);

        self.state = ExecutionState::Failed;
        self.build_result(Some(error))
    }

    /// Pause execution
    pub fn pause(&mut self) -> Result<(), String> {
        if self.state != ExecutionState::Running {
            return Err("Not running".to_string());
        }
        self.state = ExecutionState::Paused;
        Ok(())
    }

    /// Resume execution from pause
    pub fn resume(&mut self) -> Result<Option<Step>, String> {
        if self.state != ExecutionState::Paused {
            return Err("Not paused".to_string());
        }
        self.state = ExecutionState::Running;
        self.next_step()
    }

    /// Cancel execution
    pub fn cancel(&mut self) -> ExecutionResult {
        self.state = ExecutionState::Cancelled;
        self.build_result(None)
    }

    /// Get next step to execute, or None if all steps are done
    fn next_step(&mut self) -> Result<Option<Step>, String> {
        if self.current_step_index >= self.flow.steps.len() {
            self.state = ExecutionState::Completed;
            return Ok(None);
        }

        let step = &self.flow.steps[self.current_step_index];

        // Check conditions
        if let Some(conditions) = &step.conditions {
            for condition in conditions {
                if !self.evaluate_condition(condition) {
                    // Skip this step
                    self.current_step_index += 1;
                    return self.next_step();
                }
            }
        }

        // Resolve variable interpolations in step
        let resolved_step = self.resolve_variables(step);
        Ok(Some(resolved_step))
    }

    /// Evaluate a step condition
    fn evaluate_condition(&self, condition: &StepCondition) -> bool {
        match condition.r#type {
            ConditionType::UrlMatch => {
                // URL pattern matching - simplified
                self.variables
                    .get("current_url")
                    .map(|url| url.to_string().contains(&condition.expression))
                    .unwrap_or(false)
            }
            ConditionType::ElementExists => {
                // Element existence must be checked by JS host
                false
            }
            ConditionType::TextVisible => {
                // Text visibility must be checked by JS host
                false
            }
            ConditionType::VariableEq => {
                // Check if a variable equals the expression
                if let Some(parts) = condition.expression.split_once('=') {
                    if let Some(value) = self.variables.get(parts.0) {
                        return value.to_string() == parts.1;
                    }
                }
                false
            }
        }
    }

    /// Resolve variable interpolations in a step
    fn resolve_variables(&self, step: &Step) -> Step {
        // Only clone the fields that actually need interpolation
        let resolved_target = step.target.as_ref().map(|target| {
            let mut resolved = target.clone();
            if let Some(ref mut selector) = resolved.selector {
                if selector.contains("{{") {
                    *selector = self.interpolate_string(selector);
                }
            }
            resolved
        });

        let resolved_value = step.value.as_ref().map(|v| self.interpolate_value(v));

        Step {
            id: step.id.clone(),
            r#type: step.r#type.clone(),
            action: step.action.clone(),
            target: resolved_target,
            value: resolved_value,
            options: step.options.clone(),
            conditions: step.conditions.clone(),
            metadata: step.metadata.clone(),
        }
    }

    /// Interpolate variables in a string using single-pass scanning
    fn interpolate_string(&self, input: &str) -> String {
        // Fast path: no variables to interpolate
        if self.variables.is_empty() || !input.contains("{{") {
            return input.to_string();
        }

        let mut result = String::with_capacity(input.len() * 2);
        let mut chars = input.chars().peekable();

        while let Some(ch) = chars.next() {
            if ch == '{' && chars.peek() == Some(&'{') {
                chars.next(); // consume second '{'
                let mut key = String::new();
                let mut found_end = false;

                while let Some(c) = chars.next() {
                    if c == '}' && chars.peek() == Some(&'}') {
                        chars.next(); // consume second '}'
                        found_end = true;
                        break;
                    }
                    key.push(c);
                }

                if found_end {
                    if let Some(value) = self.variables.get(&key) {
                        match value {
                            serde_json::Value::String(s) => result.push_str(s),
                            _ => result.push_str(&value.to_string()),
                        }
                    } else {
                        // Variable not found, keep original pattern
                        result.push_str("{{");
                        result.push_str(&key);
                        result.push_str("}}");
                    }
                } else {
                    // No closing }}, keep what we consumed
                    result.push_str("{{");
                    result.push_str(&key);
                }
            } else {
                result.push(ch);
            }
        }
        result
    }

    /// Interpolate variables in a JSON value
    fn interpolate_value(&self, value: &serde_json::Value) -> serde_json::Value {
        match value {
            serde_json::Value::String(s) => {
                serde_json::Value::String(self.interpolate_string(s))
            }
            serde_json::Value::Object(map) => {
                let new_map: HashMap<String, serde_json::Value> = map
                    .iter()
                    .map(|(k, v)| (k.clone(), self.interpolate_value(v)))
                    .collect();
                serde_json::Value::Object(
                    new_map.into_iter().collect()
                )
            }
            serde_json::Value::Array(arr) => {
                serde_json::Value::Array(
                    arr.iter().map(|v| self.interpolate_value(v)).collect()
                )
            }
            other => other.clone(),
        }
    }

    /// Build the final result
    pub fn build_result(&self, error: Option<String>) -> ExecutionResult {
        ExecutionResult {
            flow_id: self.flow.id.clone(),
            state: self.state.clone(),
            current_step_index: self.current_step_index,
            total_steps: self.flow.steps.len(),
            start_time_ms: self.start_time_ms,
            end_time_ms: Some(current_time_ms()),
            error,
            captured_data: self.captured_data.clone(),
            step_results: self.step_results.clone(),
            return_logs: false,
        }
    }

    /// Get current state
    pub fn get_status(&self) -> ExecutionResult {
        self.build_result(None)
    }
}

/// Run options for flow execution
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FlowRunOptions {
    pub tab_target: Option<String>, // "current" | "new"
    pub refresh: bool,
    pub capture_network: bool,
    pub return_logs: bool,
    pub timeout_ms: Option<u64>,
    pub start_url: Option<String>,
}

/// Format flow as an MCP tool definition
pub fn flow_to_tool_definition(flow: &Flow) -> ToolDefinition {
    let mut properties: HashMap<String, ToolProperty> = HashMap::new();
    let mut required: Vec<String> = Vec::new();

    for var in &flow.variables {
        let prop = ToolProperty {
            description: var.label.clone(),
            r#type: match var.r#type.as_str() {
                "boolean" => "boolean".to_string(),
                "number" => "number".to_string(),
                "array" => "array".to_string(),
                "enum" => "string".to_string(),
                _ => "string".to_string(),
            },
            default: var.default.clone(),
            r#enum: var.rules.as_ref().and_then(|r| r.r#enum.clone()),
            items: if var.r#type == "array" {
                Some(serde_json::json!({ "type": "string" }))
            } else {
                None
            },
        };

        if var
            .rules
            .as_ref()
            .is_some_and(|r| r.required)
        {
            required.push(var.key.clone());
        }

        properties.insert(var.key.clone(), prop);
    }

    // Add run options
    properties.insert(
        "tabTarget".to_string(),
        ToolProperty {
            description: "Target tab: 'current' or 'new'".to_string(),
            r#type: "string".to_string(),
            default: Some(serde_json::json!("current")),
            r#enum: Some(vec!["current".to_string(), "new".to_string()]),
            items: None,
        },
    );
    properties.insert(
        "refresh".to_string(),
        ToolProperty {
            description: "Refresh before running".to_string(),
            r#type: "boolean".to_string(),
            default: Some(serde_json::json!(false)),
            r#enum: None,
            items: None,
        },
    );
    properties.insert(
        "captureNetwork".to_string(),
        ToolProperty {
            description: "Capture network snippets for debugging".to_string(),
            r#type: "boolean".to_string(),
            default: Some(serde_json::json!(false)),
            r#enum: None,
            items: None,
        },
    );
    properties.insert(
        "returnLogs".to_string(),
        ToolProperty {
            description: "Return run logs".to_string(),
            r#type: "boolean".to_string(),
            default: Some(serde_json::json!(false)),
            r#enum: None,
            items: None,
        },
    );
    properties.insert(
        "timeoutMs".to_string(),
        ToolProperty {
            description: "Global timeout in ms".to_string(),
            r#type: "number".to_string(),
            default: None,
            r#enum: None,
            items: None,
        },
    );

    let description = flow
        .meta
        .as_ref()
        .and_then(|m| m.tool.as_ref())
        .and_then(|t| t.description.clone())
        .or_else(|| flow.description.clone())
        .unwrap_or_else(|| format!("Run flow: {}", flow.name));

    ToolDefinition {
        name: format!("flow.{}", flow.slug),
        description,
        input_schema: ToolInputSchema {
            r#type: "object".to_string(),
            properties,
            required,
        },
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolDefinition {
    pub name: String,
    pub description: String,
    pub input_schema: ToolInputSchema,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolInputSchema {
    pub r#type: String,
    pub properties: HashMap<String, ToolProperty>,
    pub required: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolProperty {
    pub description: String,
    pub r#type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub default: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub r#enum: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub items: Option<serde_json::Value>,
}

// ============================================================
// Trigger Types
// ============================================================

/// Trigger definition
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Trigger {
    pub id: String,
    pub flow_id: String,
    pub trigger_type: TriggerType,
    pub enabled: bool,
    pub config: TriggerConfig,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum TriggerType {
    #[serde(rename = "url")]
    Url,
    #[serde(rename = "interval")]
    Interval,
    #[serde(rename = "cron")]
    Cron,
    #[serde(rename = "dom")]
    Dom,
    #[serde(rename = "context_menu")]
    ContextMenu,
    #[serde(rename = "command")]
    Command,
    #[serde(rename = "manual")]
    Manual,
    #[serde(rename = "once")]
    Once,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TriggerConfig {
    pub url_pattern: Option<String>,
    pub interval_ms: Option<u64>,
    pub cron_expression: Option<String>,
    pub selector: Option<String>,
    pub command: Option<String>,
}

pub use crate::util::current_time_ms;

#[cfg(test)]
mod tests {
    use super::*;

    fn make_test_flow() -> Flow {
        Flow {
            id: "flow-1".to_string(),
            slug: "login-test".to_string(),
            name: "Login Test".to_string(),
            description: Some("A test login flow".to_string()),
            version: 1,
            steps: vec![
                Step {
                    id: "step-1".to_string(),
                    r#type: StepType::Navigate,
                    action: "navigate".to_string(),
                    target: Some(StepTarget {
                        selector: None,
                        selector_type: None,
                        ref_id: None,
                        frame_id: None,
                        coordinates: None,
                    }),
                    value: Some(serde_json::json!("https://example.com/login")),
                    options: None,
                    conditions: None,
                    metadata: None,
                },
                Step {
                    id: "step-2".to_string(),
                    r#type: StepType::Fill,
                    action: "fill".to_string(),
                    target: Some(StepTarget {
                        selector: Some("#username".to_string()),
                        selector_type: Some("css".to_string()),
                        ref_id: None,
                        frame_id: None,
                        coordinates: None,
                    }),
                    value: Some(serde_json::json!("{{username}}")),
                    options: None,
                    conditions: None,
                    metadata: None,
                },
            ],
            variables: vec![FlowVariable {
                key: "username".to_string(),
                label: "Username".to_string(),
                r#type: "string".to_string(),
                default: Some(serde_json::json!("admin")),
                rules: Some(VariableRules {
                    required: true,
                    r#enum: None,
                }),
            }],
            meta: None,
            published: true,
        }
    }

    #[test]
    fn test_flow_execution() {
        let flow = make_test_flow();
        let mut vars = HashMap::new();
        vars.insert("username".to_string(), serde_json::json!("testuser"));

        let mut executor = FlowExecutor::new(flow, vars);

        // Start execution
        let step = executor.start().unwrap();
        assert!(step.is_some());
        assert_eq!(executor.state, ExecutionState::Running);
        assert_eq!(executor.current_step_index, 0);

        // Complete first step (navigate)
        let step = executor.mark_step_completed(None).unwrap();
        assert!(step.is_some());
        assert_eq!(executor.current_step_index, 1);

        // Check variable interpolation in second step
        let step = step.unwrap();
        assert_eq!(
            step.value,
            Some(serde_json::json!("testuser"))
        );

        // Complete second step (fill)
        let step = executor.mark_step_completed(None).unwrap();
        assert!(step.is_none());
        assert_eq!(executor.state, ExecutionState::Completed);
    }

    #[test]
    fn test_variable_validation() {
        let mut flow = make_test_flow();
        // Make the variable required but remove its default
        flow.variables[0].default = None;

        // Missing required variable
        let executor = FlowExecutor::new(flow, HashMap::new());
        let result = executor.validate_variables();
        assert!(result.is_err());
    }

    #[test]
    fn test_pause_resume() {
        let flow = make_test_flow();
        let mut vars = HashMap::new();
        vars.insert("username".to_string(), serde_json::json!("test"));

        let mut executor = FlowExecutor::new(flow, vars);
        executor.start().unwrap();
        assert_eq!(executor.state, ExecutionState::Running);

        executor.pause().unwrap();
        assert_eq!(executor.state, ExecutionState::Paused);

        executor.resume().unwrap();
        assert_eq!(executor.state, ExecutionState::Running);
    }

    #[test]
    fn test_cancel() {
        let flow = make_test_flow();
        let mut vars = HashMap::new();
        vars.insert("username".to_string(), serde_json::json!("test"));

        let mut executor = FlowExecutor::new(flow, vars);
        executor.start().unwrap();

        let result = executor.cancel();
        assert_eq!(result.state, ExecutionState::Cancelled);
    }

    #[test]
    fn test_tool_definition() {
        let flow = make_test_flow();
        let tool = flow_to_tool_definition(&flow);

        assert_eq!(tool.name, "flow.login-test");
        assert!(tool.input_schema.properties.contains_key("username"));
        assert!(tool.input_schema.required.contains(&"username".to_string()));
        assert!(tool.input_schema.properties.contains_key("tabTarget"));
        assert!(tool.input_schema.properties.contains_key("refresh"));
    }
}
