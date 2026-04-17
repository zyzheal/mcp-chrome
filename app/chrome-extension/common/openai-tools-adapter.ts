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
 * Sanitize a JSON Schema object for maximum OpenAI-compatible API compatibility.
 * Removes unsupported constructs like `oneOf` that some providers reject.
 */
function sanitizeSchema(schema: unknown): Record<string, unknown> {
  if (!schema || typeof schema !== 'object') return (schema as Record<string, unknown>) || {};

  const result = { ...(schema as Record<string, unknown>) };

  // Remove unsupported JSON Schema constructs
  delete result.oneOf;
  delete result.anyOf;
  delete result.allOf;
  delete result.not;
  delete result.if;
  delete result.then;
  delete result.else;

  // Recursively sanitize nested properties
  if (result.properties && typeof result.properties === 'object') {
    const sanitizedProps: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(result.properties)) {
      if (val && typeof val === 'object') {
        const v = val as Record<string, unknown>;
        // Replace oneOf/anyOf with a simple 'string' type fallback
        if (v.oneOf || v.anyOf) {
          sanitizedProps[key] = {
            type: 'string',
            description: v.description || '',
          };
        } else {
          sanitizedProps[key] = sanitizeSchema(val);
        }
      } else {
        sanitizedProps[key] = val;
      }
    }
    result.properties = sanitizedProps;
  }

  // Recursively sanitize items (for arrays)
  if (result.items && typeof result.items === 'object') {
    result.items = sanitizeSchema(result.items);
  }

  return result;
}

/**
 * Convert MCP TOOL_SCHEMAS to OpenAI function calling tools format.
 * Sanitizes schemas to remove constructs not supported by all providers (DashScope, etc).
 */
export function mcpSchemaToOpenAITools(): OpenAIToolDefinition[] {
  return TOOL_SCHEMAS.map((schema) => ({
    type: 'function' as const,
    function: {
      name: schema.name,
      description: schema.description || '',
      parameters: sanitizeSchema(schema.inputSchema) as Record<string, unknown>,
    },
  }));
}
