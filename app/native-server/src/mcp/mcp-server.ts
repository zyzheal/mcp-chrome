import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { setupTools } from './register-tools';

let mcpServer: Server | null = null;

/**
 * Get or create the default MCP server instance (singleton).
 * Used for SSE transport which typically has one long-lived connection.
 */
export const getMcpServer = () => {
  if (mcpServer) {
    return mcpServer;
  }
  mcpServer = createMcpServer();
  return mcpServer;
};

/**
 * Create a new MCP server instance.
 * Used for StreamableHTTP transport which requires a fresh server instance per connection.
 */
export const createMcpServer = () => {
  const server = new Server(
    {
      name: 'ChromeMcpServer',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  setupTools(server);
  return server;
};
