/**
 * Agent CLI Model Definitions.
 *
 * Static model definitions for each CLI type.
 * Based on the pattern from Claudable (other/cweb).
 */

import type { CodexReasoningEffort } from 'chrome-mcp-shared';

// ============================================================
// Types
// ============================================================

export interface ModelDefinition {
  id: string;
  name: string;
  description?: string;
  supportsImages?: boolean;
  /** Supported reasoning effort levels for Codex models */
  supportedReasoningEfforts?: readonly CodexReasoningEffort[];
}

export type AgentCliType = 'claude' | 'codex' | 'cursor' | 'qwen' | 'glm' | 'kimi' | 'minimax';

// ============================================================
// Claude Models
// ============================================================

export const CLAUDE_MODELS: ModelDefinition[] = [
  {
    id: 'claude-sonnet-4-5-20250929',
    name: 'Claude Sonnet 4.5',
    description: 'Balanced model with large context window',
    supportsImages: true,
  },
  {
    id: 'claude-opus-4-5-20251101',
    name: 'Claude Opus 4.5',
    description: 'Strongest reasoning model',
    supportsImages: true,
  },
  {
    id: 'claude-haiku-4-5-20251001',
    name: 'Claude Haiku 4.5',
    description: 'Fast and cost-efficient',
    supportsImages: true,
  },
];

export const CLAUDE_DEFAULT_MODEL = 'claude-sonnet-4-5-20250929';

// ============================================================
// Codex Models
// ============================================================

/** Standard reasoning efforts supported by all models */
const CODEX_STANDARD_EFFORTS: readonly CodexReasoningEffort[] = ['low', 'medium', 'high'];
/** Extended reasoning efforts (includes xhigh) - only for gpt-5.2 and gpt-5.1-codex-max */
const CODEX_EXTENDED_EFFORTS: readonly CodexReasoningEffort[] = ['low', 'medium', 'high', 'xhigh'];

export const CODEX_MODELS: ModelDefinition[] = [
  {
    id: 'gpt-5.1',
    name: 'GPT-5.1',
    description: 'OpenAI high-quality reasoning model',
    supportedReasoningEfforts: CODEX_STANDARD_EFFORTS,
  },
  {
    id: 'gpt-5.2',
    name: 'GPT-5.2',
    description: 'OpenAI flagship reasoning model with extended effort support',
    supportedReasoningEfforts: CODEX_EXTENDED_EFFORTS,
  },
  {
    id: 'gpt-5.1-codex',
    name: 'GPT-5.1 Codex',
    description: 'Coding-optimized model for agent workflows',
    supportedReasoningEfforts: CODEX_STANDARD_EFFORTS,
  },
  {
    id: 'gpt-5.1-codex-max',
    name: 'GPT-5.1 Codex Max',
    description: 'Highest quality coding model with extended effort support',
    supportedReasoningEfforts: CODEX_EXTENDED_EFFORTS,
  },
  {
    id: 'gpt-5.1-codex-mini',
    name: 'GPT-5.1 Codex Mini',
    description: 'Fast, cost-efficient coding model',
    supportedReasoningEfforts: CODEX_STANDARD_EFFORTS,
  },
];

export const CODEX_DEFAULT_MODEL = 'gpt-5.1';

// Codex model alias normalization
const CODEX_ALIAS_MAP: Record<string, string> = {
  gpt5: 'gpt-5.1',
  gpt_5: 'gpt-5.1',
  'gpt-5': 'gpt-5.1',
  'gpt-5.0': 'gpt-5.1',
};

const CODEX_KNOWN_IDS = new Set(CODEX_MODELS.map((model) => model.id));

/**
 * Normalize a Codex model ID, handling aliases and falling back to default.
 */
export function normalizeCodexModelId(model?: string | null): string {
  if (!model || typeof model !== 'string') {
    return CODEX_DEFAULT_MODEL;
  }

  const trimmed = model.trim();
  if (!trimmed) {
    return CODEX_DEFAULT_MODEL;
  }

  const lower = trimmed.toLowerCase();
  if (CODEX_ALIAS_MAP[lower]) {
    return CODEX_ALIAS_MAP[lower];
  }

  if (CODEX_KNOWN_IDS.has(lower)) {
    return lower;
  }

  // If the exact casing exists, allow it
  if (CODEX_KNOWN_IDS.has(trimmed)) {
    return trimmed;
  }

  return CODEX_DEFAULT_MODEL;
}

/**
 * Get supported reasoning efforts for a Codex model.
 * Returns standard efforts (low/medium/high) for unknown models.
 */
export function getCodexReasoningEfforts(modelId?: string | null): readonly CodexReasoningEffort[] {
  const normalized = normalizeCodexModelId(modelId);
  const model = CODEX_MODELS.find((m) => m.id === normalized);
  return model?.supportedReasoningEfforts ?? CODEX_STANDARD_EFFORTS;
}

/**
 * Check if a model supports xhigh reasoning effort.
 */
export function supportsXhighEffort(modelId?: string | null): boolean {
  const efforts = getCodexReasoningEfforts(modelId);
  return efforts.includes('xhigh');
}

// ============================================================
// Cursor Models
// ============================================================

export const CURSOR_MODELS: ModelDefinition[] = [
  {
    id: 'auto',
    name: 'Auto',
    description: 'Cursor auto-selects the best model',
  },
  {
    id: 'claude-sonnet-4-5-20250929',
    name: 'Claude Sonnet 4.5',
    description: 'Anthropic Claude via Cursor',
    supportsImages: true,
  },
  {
    id: 'gpt-4.1',
    name: 'GPT-4.1',
    description: 'OpenAI model via Cursor',
  },
];

export const CURSOR_DEFAULT_MODEL = 'auto';

// ============================================================
// Qwen Models
// ============================================================

export const QWEN_MODELS: ModelDefinition[] = [
  {
    id: 'qwen3.6-plus',
    name: 'Qwen 3.6 Plus',
    description: 'Text generation, deep reasoning, visual understanding',
    supportsImages: true,
  },
  {
    id: 'qwen3.5-plus',
    name: 'Qwen 3.5 Plus',
    description: 'Text generation, deep reasoning, visual understanding',
    supportsImages: true,
  },
  {
    id: 'qwen3-max-2026-01-23',
    name: 'Qwen 3 Max',
    description: 'Text generation, deep reasoning',
  },
  {
    id: 'qwen3-coder-next',
    name: 'Qwen3 Coder Next',
    description: 'Text generation',
  },
  {
    id: 'qwen3-coder-plus',
    name: 'Qwen3 Coder Plus',
    description: 'Balanced model for coding',
  },
];

export const QWEN_DEFAULT_MODEL = 'qwen3.6-plus';

// ============================================================
// GLM Models
// ============================================================

export const GLM_MODELS: ModelDefinition[] = [
  {
    id: 'glm-5',
    name: 'GLM-5',
    description: 'Zhipu GLM-5 text generation, deep reasoning',
  },
  {
    id: 'glm-4.7',
    name: 'GLM-4.7',
    description: 'Zhipu GLM-4.7 text generation, deep reasoning',
  },
];

export const GLM_DEFAULT_MODEL = 'glm-5';

// ============================================================
// Kimi Models
// ============================================================

export const KIMI_MODELS: ModelDefinition[] = [
  {
    id: 'kimi-k2.5',
    name: 'Kimi K2.5',
    description: 'Text generation, deep reasoning, visual understanding',
    supportsImages: true,
  },
];

export const KIMI_DEFAULT_MODEL = 'kimi-k2.5';

// ============================================================
// MiniMax Models
// ============================================================

export const MINIMAX_MODELS: ModelDefinition[] = [
  {
    id: 'MiniMax-M2.5',
    name: 'MiniMax M2.5',
    description: 'MiniMax high-performance text generation',
  },
];

export const MINIMAX_DEFAULT_MODEL = 'MiniMax-M2.5';

// ============================================================
// Aggregated Definitions
// ============================================================

export const CLI_MODEL_DEFINITIONS: Record<AgentCliType, ModelDefinition[]> = {
  claude: CLAUDE_MODELS,
  codex: CODEX_MODELS,
  cursor: CURSOR_MODELS,
  qwen: QWEN_MODELS,
  glm: GLM_MODELS,
  kimi: KIMI_MODELS,
  minimax: MINIMAX_MODELS,
};

export const CLI_DEFAULT_MODELS: Record<AgentCliType, string> = {
  claude: CLAUDE_DEFAULT_MODEL,
  codex: CODEX_DEFAULT_MODEL,
  cursor: CURSOR_DEFAULT_MODEL,
  qwen: QWEN_DEFAULT_MODEL,
  glm: GLM_DEFAULT_MODEL,
  kimi: KIMI_DEFAULT_MODEL,
  minimax: MINIMAX_DEFAULT_MODEL,
};

// ============================================================
// Helper Functions
// ============================================================

/**
 * Get model definitions for a specific CLI type.
 */
export function getModelsForCli(cli: string | null | undefined): ModelDefinition[] {
  if (!cli) return [];
  const key = cli.toLowerCase() as AgentCliType;
  return CLI_MODEL_DEFINITIONS[key] || [];
}

/**
 * Get the default model for a CLI type.
 */
export function getDefaultModelForCli(cli: string | null | undefined): string {
  if (!cli) return '';
  const key = cli.toLowerCase() as AgentCliType;
  return CLI_DEFAULT_MODELS[key] || '';
}

/**
 * Get display name for a model ID.
 */
export function getModelDisplayName(
  cli: string | null | undefined,
  modelId: string | null | undefined,
): string {
  if (!cli || !modelId) return modelId || '';
  const models = getModelsForCli(cli);
  const model = models.find((m) => m.id === modelId);
  return model?.name || modelId;
}
