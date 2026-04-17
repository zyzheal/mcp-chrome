//! CSS Selector Engine
//!
//! Implements portable selector generation, fingerprinting, and stability scoring.
//! Mirrors the functionality in chrome-extension/shared/selector/.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::hash::{DefaultHasher, Hash, Hasher};

// ============================================================
// Types
// ============================================================

/// Element attributes needed for selector generation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ElementInfo {
    pub tag_name: String,
    pub id: Option<String>,
    pub class_list: Vec<String>,
    pub name: Option<String>,
    pub role: Option<String>,
    pub aria_label: Option<String>,
    pub data_test_id: Option<String>,
    pub text_content: Option<String>,
    pub parent_chain: Vec<ParentElement>,
    pub sibling_index: usize,
    pub sibling_count: usize,
}

/// Parent element info in the DOM chain
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParentElement {
    pub tag_name: String,
    pub id: Option<String>,
    pub class_list: Vec<String>,
    pub sibling_index: usize,
}

/// Generated selector candidates ranked by stability
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SelectorCandidate {
    pub selector: String,
    pub strategy: SelectorStrategy,
    pub score: f64,
}

/// Selector generation strategies
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum SelectorStrategy {
    /// Element has a unique id attribute
    Id,
    /// Element has a data-testid attribute
    DataTestId,
    /// Element has a unique name attribute
    Name,
    /// Element has unique aria-label
    AriaLabel,
    /// CSS class-based selector
    CssClass,
    /// Nth-child based selector
    NthChild,
    /// CSS path through the DOM
    CssPath,
    /// Text content based selector
    TextContent,
}

/// Fingerprint for element identification across page reloads
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ElementFingerprint {
    pub hash: String,
    pub components: FingerprintComponents,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FingerprintComponents {
    pub tag_signature: String,
    pub attribute_hash: String,
    pub structural_hash: String,
    pub text_signature: String,
}

/// Stability score result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StabilityScore {
    pub overall: f64,
    pub factors: StabilityFactors,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StabilityFactors {
    pub selector_uniqueness: f64,
    pub selector_specificity: f64,
    pub dom_depth: f64,
    pub attribute_stability: f64,
    pub text_stability: f64,
}

/// Selector generation options
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SelectorOptions {
    pub max_depth: usize,
    pub prefer_id: bool,
    pub prefer_data_test_id: bool,
    pub prefer_name: bool,
    pub include_classes: bool,
    pub max_nth_depth: usize,
    pub min_score_threshold: f64,
}

impl Default for SelectorOptions {
    fn default() -> Self {
        Self {
            max_depth: 5,
            prefer_id: true,
            prefer_data_test_id: true,
            prefer_name: true,
            include_classes: true,
            max_nth_depth: 3,
            min_score_threshold: 0.3,
        }
    }
}

// ============================================================
// Selector Generation
// ============================================================

/// Generate the best selector for an element
pub fn generate_selector(element: &ElementInfo) -> Vec<SelectorCandidate> {
    let options = SelectorOptions::default();
    generate_selector_with_options(element, &options)
}

/// Generate selectors with custom options
pub fn generate_selector_with_options(
    element: &ElementInfo,
    options: &SelectorOptions,
) -> Vec<SelectorCandidate> {
    let mut candidates = Vec::new();

    // Strategy 1: ID-based (highest stability)
    if options.prefer_id {
        if let Some(id) = &element.id {
            if !id.is_empty() {
                let escaped = escape_css_identifier(id);
                let selector = format!("#{escaped}");
                candidates.push(SelectorCandidate {
                    selector,
                    strategy: SelectorStrategy::Id,
                    score: 1.0,
                });
            }
        }
    }

    // Strategy 2: data-testid (very stable)
    if options.prefer_data_test_id {
        if let Some(test_id) = &element.data_test_id {
            if !test_id.is_empty() {
                let selector = format!(
                    "[data-testid=\"{}\"]",
                    escape_css_string(test_id)
                );
                candidates.push(SelectorCandidate {
                    selector,
                    strategy: SelectorStrategy::DataTestId,
                    score: 0.95,
                });
            }
        }
    }

    // Strategy 3: name attribute (good for forms)
    if options.prefer_name {
        if let Some(name) = &element.name {
            if !name.is_empty() {
                let selector = format!("{}[name=\"{}\"]", element.tag_name, escape_css_string(name));
                candidates.push(SelectorCandidate {
                    selector,
                    strategy: SelectorStrategy::Name,
                    score: 0.9,
                });
            }
        }
    }

    // Strategy 4: aria-label (accessible elements)
    if let Some(aria) = &element.aria_label {
        if !aria.is_empty() {
            let selector = format!(
                "{}[aria-label=\"{}\"]",
                element.tag_name,
                escape_css_string(aria)
            );
            candidates.push(SelectorCandidate {
                selector,
                strategy: SelectorStrategy::AriaLabel,
                score: 0.85,
            });
        }
    }

    // Strategy 5: role attribute
    if let Some(role) = &element.role {
        if !role.is_empty() {
            let selector = format!("{}[role=\"{}\"]", element.tag_name, escape_css_string(role));
            candidates.push(SelectorCandidate {
                selector,
                strategy: SelectorStrategy::CssClass,
                score: 0.7,
            });
        }
    }

    // Strategy 6: class-based selectors
    if options.include_classes && !element.class_list.is_empty() {
        let class_selector = build_class_selector(element, &element.class_list);
        if !class_selector.is_empty() {
            candidates.push(SelectorCandidate {
                selector: class_selector,
                strategy: SelectorStrategy::CssClass,
                score: 0.6,
            });
        }
    }

    // Strategy 7: nth-child based
    if options.max_nth_depth > 0 {
        let nth_selector = build_nth_child_selector(element, options.max_nth_depth);
        if !nth_selector.is_empty() {
            candidates.push(SelectorCandidate {
                selector: nth_selector,
                strategy: SelectorStrategy::NthChild,
                score: 0.4,
            });
        }
    }

    // Strategy 8: full CSS path (fallback)
    let css_path = build_css_path(element, options.max_depth);
    candidates.push(SelectorCandidate {
        selector: css_path,
        strategy: SelectorStrategy::CssPath,
        score: 0.3,
    });

    // Strategy 9: text-based (least stable)
    if let Some(text) = &element.text_content {
        let trimmed = text.trim();
        if !trimmed.is_empty() && trimmed.len() < 100 {
            let selector = format!(
                "{}:contains(\"{}\")",
                element.tag_name,
                escape_css_string(trimmed)
            );
            candidates.push(SelectorCandidate {
                selector,
                strategy: SelectorStrategy::TextContent,
                score: 0.2,
            });
        }
    }

    // Sort by score descending
    candidates.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));

    // Filter below threshold
    candidates
        .into_iter()
        .filter(|c| c.score >= options.min_score_threshold)
        .collect()
}

/// Build a class-based selector
fn build_class_selector(element: &ElementInfo, classes: &[String]) -> String {
    // Use up to 3 meaningful classes (skip auto-generated ones)
    let meaningful: Vec<&String> = classes
        .iter()
        .filter(|c| {
            !c.starts_with('_') && // skip CSS modules
            !c.starts_with("css-") && // skip emotion/styled
            c.len() > 2 &&
            !c.chars().all(|ch| ch.is_ascii_digit())
        })
        .take(3)
        .collect();

    if meaningful.is_empty() {
        return String::new();
    }

    let class_part = meaningful
        .iter()
        .map(|c| format!(".{}", escape_css_identifier(c)))
        .collect::<Vec<_>>()
        .join("");

    format!("{}{}", element.tag_name, class_part)
}

/// Build nth-child selector through parent chain
fn build_nth_child_selector(element: &ElementInfo, max_depth: usize) -> String {
    let mut parts = vec![format!(
        "{}:nth-of-type({})",
        element.tag_name,
        element.sibling_index + 1
    )];

    for parent in element.parent_chain.iter().take(max_depth) {
        let parent_selector = if let Some(id) = &parent.id {
            format!("#{id}")
        } else if !parent.class_list.is_empty() {
            let classes: Vec<String> = parent.class_list.iter().take(2).map(|c| format!(".{c}")).collect();
            classes.join("")
        } else {
            parent.tag_name.clone()
        };

        parts.push(format!(
            "{} > :nth-of-type({})",
            parent_selector,
            parent.sibling_index + 1
        ));

        if parent.id.is_some() {
            break; // Found an ID anchor, stop going up
        }
    }

    parts.reverse();
    parts.join(" > ")
}

/// Build full CSS path from element to root
fn build_css_path(element: &ElementInfo, max_depth: usize) -> String {
    let mut parts = vec![element.tag_name.clone()];

    for parent in element.parent_chain.iter().take(max_depth) {
        let parent_str = if let Some(id) = &parent.id {
            format!("#{id}")
        } else {
            parent.tag_name.clone()
        };
        parts.push(parent_str);

        if parent.id.is_some() {
            break;
        }
    }

    parts.reverse();
    parts.join(" > ")
}

// ============================================================
// Element Fingerprinting
// ============================================================

/// Generate a stable fingerprint for an element
pub fn generate_fingerprint(element: &ElementInfo) -> ElementFingerprint {
    let tag_signature = compute_tag_signature(element);
    let attribute_hash = compute_attribute_hash(element);
    let structural_hash = compute_structural_hash(element);
    let text_signature = compute_text_signature(element);

    // Combined hash
    let mut hasher = DefaultHasher::new();
    tag_signature.hash(&mut hasher);
    attribute_hash.hash(&mut hasher);
    structural_hash.hash(&mut hasher);
    text_signature.hash(&mut hasher);
    let combined_hash = format!("{:016x}", hasher.finish());

    ElementFingerprint {
        hash: combined_hash,
        components: FingerprintComponents {
            tag_signature,
            attribute_hash,
            structural_hash,
            text_signature,
        },
    }
}

/// Tag signature: tagName + class signature
fn compute_tag_signature(element: &ElementInfo) -> String {
    let tag = element.tag_name.to_lowercase();
    let classes: Vec<&str> = element.class_list.iter().map(|s| s.as_str()).take(3).collect();
    let class_sig = if classes.is_empty() {
        String::new()
    } else {
        format!(".{}", classes.join("."))
    };
    format!("{tag}{class_sig}")
}

/// Attribute hash: deterministic hash of stable attributes
fn compute_attribute_hash(element: &ElementInfo) -> String {
    let mut hasher = DefaultHasher::new();
    element.tag_name.hash(&mut hasher);
    element.id.hash(&mut hasher);
    element.name.hash(&mut hasher);
    element.role.hash(&mut hasher);
    element.aria_label.hash(&mut hasher);
    element.data_test_id.hash(&mut hasher);
    format!("{:016x}", hasher.finish())
}

/// Structural hash: hash of parent chain structure
fn compute_structural_hash(element: &ElementInfo) -> String {
    let mut hasher = DefaultHasher::new();
    element.tag_name.hash(&mut hasher);
    element.sibling_index.hash(&mut hasher);
    for parent in &element.parent_chain {
        parent.tag_name.hash(&mut hasher);
        parent.sibling_index.hash(&mut hasher);
        parent.id.hash(&mut hasher);
    }
    format!("{:016x}", hasher.finish())
}

/// Text signature: normalized first 50 chars of text
fn compute_text_signature(element: &ElementInfo) -> String {
    if let Some(text) = &element.text_content {
        let normalized: String = text
            .chars()
            .filter(|c| !c.is_whitespace())
            .take(50)
            .collect::<String>()
            .to_lowercase();
        let mut hasher = DefaultHasher::new();
        normalized.hash(&mut hasher);
        format!("{:016x}", hasher.finish())
    } else {
        String::new()
    }
}

/// Compare two fingerprints for similarity
pub fn fingerprint_similarity(a: &ElementFingerprint, b: &ElementFingerprint) -> f64 {
    let mut score = 0.0;
    let mut weight = 0.0;

    // Tag signature match (highest weight)
    weight += 0.3;
    if a.components.tag_signature == b.components.tag_signature {
        score += 0.3;
    }

    // Attribute hash match
    weight += 0.3;
    if a.components.attribute_hash == b.components.attribute_hash {
        score += 0.3;
    }

    // Structural hash match
    weight += 0.25;
    if a.components.structural_hash == b.components.structural_hash {
        score += 0.25;
    }

    // Text signature match
    weight += 0.15;
    if !a.components.text_signature.is_empty() && !b.components.text_signature.is_empty() {
        if a.components.text_signature == b.components.text_signature {
            score += 0.15;
        }
    } else if a.components.text_signature.is_empty() && b.components.text_signature.is_empty() {
        // Both have no text - neutral
        score += 0.075;
    }

    score / weight
}

// ============================================================
// Stability Scoring
// ============================================================

/// Calculate stability score for a selector
pub fn calculate_stability(
    element: &ElementInfo,
    selector: &str,
) -> StabilityScore {
    // Selector uniqueness (simplified: based on selector type)
    let uniqueness = score_uniqueness(element, selector);

    // Specificity (simplified: count of IDs, classes, elements)
    let specificity = score_specificity(selector);

    // DOM depth penalty
    let depth_penalty = score_dom_depth(element);

    // Attribute stability (IDs and data-testid are most stable)
    let attr_stability = score_attribute_stability(element);

    // Text stability (text changes frequently)
    let text_stability = score_text_stability(element);

    // Weighted combination
    let overall = uniqueness * 0.30
        + specificity * 0.25
        + depth_penalty * 0.20
        + attr_stability * 0.15
        + text_stability * 0.10;

    StabilityScore {
        overall: (overall * 100.0).round() / 100.0,
        factors: StabilityFactors {
            selector_uniqueness: (uniqueness * 100.0).round() / 100.0,
            selector_specificity: (specificity * 100.0).round() / 100.0,
            dom_depth: (depth_penalty * 100.0).round() / 100.0,
            attribute_stability: (attr_stability * 100.0).round() / 100.0,
            text_stability: (text_stability * 100.0).round() / 100.0,
        },
    }
}

fn score_uniqueness(element: &ElementInfo, selector: &str) -> f64 {
    // Simplified: selectors with IDs are considered unique
    if selector.starts_with('#') {
        return 1.0;
    }
    if selector.contains("[data-testid=") {
        return 0.95;
    }
    if selector.contains("[name=") {
        return 0.9;
    }
    if selector.contains("[aria-label=") {
        return 0.85;
    }

    // Class-based: check if it's specific enough
    let class_count = selector.matches('.').count();
    if class_count >= 2 {
        return 0.7;
    }
    if class_count >= 1 {
        return 0.5;
    }

    // Nth-child based: low uniqueness
    if selector.contains(":nth") {
        return 0.3;
    }

    // Plain CSS path: depends on depth
    let depth = element.parent_chain.len();
    if depth >= 3 {
        0.4
    } else {
        0.2
    }
}

fn score_specificity(selector: &str) -> f64 {
    let id_count = selector.matches('#').count() as f64;
    let class_count = selector.matches('.').count() as f64;
    let attr_count = selector.matches('[').count() as f64;
    let pseudo_count = selector.matches(':').count() as f64;

    // Specificity: (ids * 100 + classes * 10 + attrs * 10 + pseudo * 1)
    let raw = id_count * 100.0 + class_count * 10.0 + attr_count * 10.0 + pseudo_count;
    // Normalize to 0-1 (cap at 200)
    (raw / 200.0).min(1.0)
}

fn score_dom_depth(element: &ElementInfo) -> f64 {
    let depth = element.parent_chain.len();
    // Deeper elements are less stable (more DOM restructuring)
    if depth == 0 {
        1.0
    } else if depth <= 2 {
        0.8
    } else if depth <= 4 {
        0.6
    } else if depth <= 6 {
        0.4
    } else {
        0.2
    }
}

fn score_attribute_stability(element: &ElementInfo) -> f64 {
    let mut score: f64 = 0.0;

    if element.id.is_some() && !element.id.as_ref().unwrap().is_empty() {
        score += 0.4;
    }
    if element
        .data_test_id
        .as_ref()
        .is_some_and(|s| !s.is_empty())
    {
        score += 0.3;
    }
    if element.name.as_ref().is_some_and(|s| !s.is_empty()) {
        score += 0.15;
    }
    if element
        .aria_label
        .as_ref()
        .is_some_and(|s| !s.is_empty())
    {
        score += 0.1;
    }
    if element.role.as_ref().is_some_and(|s| !s.is_empty()) {
        score += 0.05;
    }

    score.min(1.0)
}

fn score_text_stability(element: &ElementInfo) -> f64 {
    match &element.text_content {
        None => 1.0,
        Some(text) => {
            let trimmed = text.trim();
            if trimmed.is_empty() {
                return 1.0;
            }
            // Longer text = more stable (less likely to change entirely)
            let len = trimmed.len() as f64;
            if len > 50.0 {
                0.8
            } else if len > 20.0 {
                0.6
            } else if len > 5.0 {
                0.4
            } else {
                0.2
            }
        }
    }
}

// ============================================================
// Selector Validation & Locator
// ============================================================

/// Validate a selector and return its confidence score
pub fn validate_selector(selector: &str) -> SelectorValidation {
    let issues = Vec::new();
    let is_valid = !selector.is_empty() && !selector.contains("contains(");

    let strategy = if selector.starts_with('#') {
        "id"
    } else if selector.contains("[data-testid=") {
        "data-testid"
    } else if selector.contains("[name=") {
        "name"
    } else if selector.contains("[aria-label=") {
        "aria-label"
    } else if selector.contains(':') {
        "pseudo"
    } else if selector.contains('.') {
        "class"
    } else {
        "tag"
    }
    .to_string();

    let confidence = match strategy.as_str() {
        "id" => 1.0,
        "data-testid" => 0.95,
        "name" => 0.9,
        "aria-label" => 0.85,
        "class" => 0.5,
        "pseudo" => 0.4,
        "tag" => 0.3,
        _ => 0.2,
    };

    SelectorValidation {
        is_valid,
        strategy,
        confidence,
        issues,
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SelectorValidation {
    pub is_valid: bool,
    pub strategy: String,
    pub confidence: f64,
    pub issues: Vec<String>,
}

/// Build a locator map from multiple selector strategies
pub fn build_locator_map(element: &ElementInfo) -> HashMap<String, String> {
    let mut map = HashMap::new();
    let selectors = generate_selector(element);

    for candidate in &selectors {
        let key = format!("{:?}", candidate.strategy).to_lowercase();
        map.insert(key, candidate.selector.clone());
    }

    // Also add direct attribute-based locators
    if let Some(id) = &element.id {
        map.insert("id".to_string(), format!("#{id}"));
    }
    if let Some(name) = &element.name {
        map.insert("name".to_string(), format!("[name=\"{name}\"]"));
    }
    if let Some(test_id) = &element.data_test_id {
        map.insert("data_test_id".to_string(), format!("[data-testid=\"{test_id}\"]"));
    }
    if let Some(aria) = &element.aria_label {
        map.insert("aria_label".to_string(), format!("[aria-label=\"{aria}\"]"));
    }

    map
}

// ============================================================
// Utility Functions
// ============================================================

/// Escape a CSS identifier (for use in #id, .class, etc.)
fn escape_css_identifier(s: &str) -> String {
    let mut result = String::with_capacity(s.len());
    for ch in s.chars() {
        match ch {
            '#' | '.' | ':' | '[' | ']' | '(' | ')' | '{' | '}' | '+' | '~' | '>' | '\\' | '"' | '\'' => {
                result.push('\\');
                result.push(ch);
            }
            _ if ch.is_ascii_control() || (ch as u32) > 127 => {
                result.push_str(&format!("\\{:06x}", ch as u32));
            }
            _ if ch.is_ascii_digit() && result.is_empty() => {
                result.push('\\');
                result.push(ch);
            }
            _ => result.push(ch),
        }
    }
    result
}

/// Escape a CSS string value (for use in attribute selectors)
fn escape_css_string(s: &str) -> String {
    s.replace('\\', "\\\\")
        .replace('"', "\\\"")
        .replace('\n', "\\A ")
        .replace('\r', "\\D ")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_test_element() -> ElementInfo {
        ElementInfo {
            tag_name: "button".to_string(),
            id: Some("login-btn".to_string()),
            class_list: vec!["btn".to_string(), "btn-primary".to_string(), "_css-abc123".to_string()],
            name: None,
            role: Some("button".to_string()),
            aria_label: Some("Login to your account".to_string()),
            data_test_id: Some("login-button".to_string()),
            text_content: Some("Login".to_string()),
            parent_chain: vec![
                ParentElement {
                    tag_name: "div".to_string(),
                    id: Some("header".to_string()),
                    class_list: vec!["header-nav".to_string()],
                    sibling_index: 0,
                },
            ],
            sibling_index: 2,
            sibling_count: 5,
        }
    }

    #[test]
    fn test_generate_selector() {
        let element = make_test_element();
        let candidates = generate_selector(&element);

        // Should have multiple candidates
        assert!(!candidates.is_empty());

        // Best should be ID-based
        assert_eq!(candidates[0].strategy, SelectorStrategy::Id);
        assert_eq!(candidates[0].selector, "#login-btn");
    }

    #[test]
    fn test_generate_selector_without_id() {
        let mut element = make_test_element();
        element.id = None;

        let candidates = generate_selector(&element);

        // Best should be data-testid
        assert_eq!(candidates[0].strategy, SelectorStrategy::DataTestId);
    }

    #[test]
    fn test_fingerprint_generation() {
        let element = make_test_element();
        let fp = generate_fingerprint(&element);

        assert!(!fp.hash.is_empty());
        assert!(!fp.components.tag_signature.is_empty());
        assert!(!fp.components.attribute_hash.is_empty());
        assert!(!fp.components.structural_hash.is_empty());
    }

    #[test]
    fn test_fingerprint_similarity() {
        let element = make_test_element();
        let fp1 = generate_fingerprint(&element);
        let fp2 = generate_fingerprint(&element);

        // Same element should be very similar
        let sim = fingerprint_similarity(&fp1, &fp2);
        assert!((sim - 1.0).abs() < 0.01);
    }

    #[test]
    fn test_stability_scoring() {
        let element = make_test_element();
        let score = calculate_stability(&element, "#login-btn");

        assert!(score.overall > 0.0 && score.overall <= 1.0);
        assert!(score.factors.selector_uniqueness > 0.5);
    }

    #[test]
    fn test_css_escape() {
        assert_eq!(escape_css_identifier("foo"), "foo");
        assert_eq!(escape_css_identifier("foo.bar"), "foo\\.bar");
        assert_eq!(escape_css_identifier("123abc"), "\\123abc");
    }
}
