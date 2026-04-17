/**
 * Adapter to convert MCP TOOL_SCHEMAS to OpenAI function calling format.
 *
 * MCP schema structure:
 *   { name: string, description: string, inputSchema: { type: 'object', properties: {...} } }
 *
 * OpenAI tools structure:
 *   { type: 'function', function: { name: string, description: string, parameters: {...} } }
 */
import { TOOL_SCHEMAS } from 'chrome-mcp-shared';

export interface OpenAIToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

/**
 * Convert MCP TOOL_SCHEMAS to OpenAI function calling tools format.
 */
export function mcpSchemaToOpenAITools(): OpenAIToolDefinition[] {
  return TOOL_SCHEMAS.map((schema) => ({
    type: 'function' as const,
    function: {
      name: schema.name,
      description: schema.description || '',
      parameters: schema.inputSchema as Record<string, unknown>,
    },
  }));
}
