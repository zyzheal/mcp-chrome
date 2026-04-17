/**
 * Settings Routes - OpenAI configuration endpoints
 *
 * Simplified version with inline service code (no separate service file imports)
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { HTTP_STATUS } from '../../constant';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// ============================================================
// Inline OpenAI Config Service
// ============================================================

interface OpenAIProviderConfig {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  maxTokens?: number;
  temperature?: number;
}

// Persisted config storage location
const CONFIG_DIR = path.join(os.homedir(), '.mcp-chrome');
const CONFIG_FILE = path.join(CONFIG_DIR, 'openai-config.json');

function loadSavedConfig(): OpenAIProviderConfig | null {
  try {
    if (!fs.existsSync(CONFIG_FILE)) return null;
    const raw = fs.readFileSync(CONFIG_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveConfigToDisk(config: OpenAIProviderConfig): void {
  try {
    if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
  } catch {
    // Best-effort, don't fail the request
  }
}

function getOpenAIConfigFromEnv(): OpenAIProviderConfig {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error(
      'OPENAI_API_KEY is not set. ' + 'Please set it in your .env file or environment variables.',
    );
  }

  return {
    id: 'env-default',
    name: 'Environment Default',
    baseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
    apiKey,
    model: process.env.OPENAI_DEFAULT_MODEL || 'gpt-4o',
    maxTokens: Number.parseInt(process.env.OPENAI_MAX_TOKENS || '4096', 10),
    temperature: Number.parseFloat(process.env.OPENAI_TEMPERATURE || '0.7'),
  };
}

/**
 * Get active provider: saved config > env config.
 */
function getActiveProvider(): OpenAIProviderConfig | null {
  const saved = loadSavedConfig();
  if (saved) return saved;

  try {
    return getOpenAIConfigFromEnv();
  } catch {
    return null;
  }
}

async function testOpenAIConnection(
  config?: OpenAIProviderConfig,
): Promise<{ success: boolean; error?: string; model?: string }> {
  const providerConfig = config || getOpenAIConfigFromEnv();

  try {
    // Test with /models endpoint
    const url = `${providerConfig.baseUrl}/models`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${providerConfig.apiKey}`,
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      return {
        success: false,
        error: `HTTP ${response.status}: ${errorText}`,
      };
    }

    const data = await response.json();
    return {
      success: true,
      model: providerConfig.model,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Connection failed';
    return {
      success: false,
      error: message,
    };
  }
}

// ============================================================
// Route Registration
// ============================================================

export function registerSettingsRoutes(fastify: FastifyInstance): void {
  /**
   * GET /settings/openai/active - Get current OpenAI configuration
   */
  fastify.get('/settings/openai/active', async (request, reply) => {
    try {
      const provider = getActiveProvider();
      if (!provider) {
        return reply.status(HTTP_STATUS.NOT_FOUND).send({
          error: 'No OpenAI configuration found',
        });
      }

      // Don't expose the API key in response
      const { apiKey, ...safeConfig } = provider;
      return reply.status(HTTP_STATUS.OK).send({
        provider: safeConfig,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return reply.status(HTTP_STATUS.BAD_REQUEST).send({
        error: message,
      });
    }
  });

  /**
   * POST /settings/openai/save - Save OpenAI configuration
   */
  fastify.post<{
    Body?: {
      baseUrl?: string;
      apiKey?: string;
      model?: string;
      maxTokens?: number;
      temperature?: number;
      organization?: string;
    };
  }>('/settings/openai/save', async (request, reply) => {
    try {
      const { baseUrl, apiKey, model, maxTokens, temperature, organization } = request.body || {};

      if (!apiKey || !model) {
        return reply.status(HTTP_STATUS.BAD_REQUEST).send({
          error: 'apiKey and model are required',
        });
      }

      const config: OpenAIProviderConfig = {
        id: 'custom',
        name: organization || 'Custom',
        baseUrl: baseUrl || 'https://api.openai.com/v1',
        apiKey,
        model,
        maxTokens,
        temperature,
      };

      saveConfigToDisk(config);

      return reply.status(HTTP_STATUS.OK).send({
        success: true,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
        success: false,
        error: message,
      });
    }
  });

  /**
   * POST /settings/openai/test - Test OpenAI connection
   */
  fastify.post<{ Body?: { baseUrl?: string; apiKey?: string; model?: string } }>(
    '/settings/openai/test',
    async (request, reply) => {
      try {
        const { baseUrl, apiKey, model } = request.body || {};

        // Use provided values or fall back to env
        const config =
          baseUrl || apiKey || model
            ? {
                id: 'custom',
                name: 'Custom',
                baseUrl: baseUrl || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
                apiKey: apiKey || process.env.OPENAI_API_KEY || '',
                model: model || process.env.OPENAI_DEFAULT_MODEL || 'gpt-4o',
              }
            : undefined;

        const result = await testOpenAIConnection(config);

        if (!result.success) {
          return reply.status(HTTP_STATUS.BAD_GATEWAY).send(result);
        }

        return reply.status(HTTP_STATUS.OK).send(result);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
          success: false,
          error: message,
        });
      }
    },
  );

  /**
   * GET /settings/openai/models - List available models
   */
  fastify.get('/settings/openai/models', async (request, reply) => {
    try {
      const config = getOpenAIConfigFromEnv();
      const url = `${config.baseUrl}/models`;

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch models: ${response.status}`);
      }

      const data = await response.json();
      return reply.status(HTTP_STATUS.OK).send({
        models: data.data || [],
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
        error: message,
      });
    }
  });
}
