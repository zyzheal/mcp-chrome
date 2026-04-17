/**
 * HTTP Server - Core server implementation.
 *
 * Responsibilities:
 * - Fastify instance management
 * - Plugin registration (CORS, etc.)
 * - Route delegation to specialized modules
 * - MCP transport handling
 * - Server lifecycle management
 */
import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import cors from '@fastify/cors';
import {
  NATIVE_SERVER_PORT,
  TIMEOUTS,
  SERVER_CONFIG,
  HTTP_STATUS,
  ERROR_MESSAGES,
} from '../constant';
import { NativeMessagingHost } from '../native-messaging-host';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { randomUUID } from 'node:crypto';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { getMcpServer, createMcpServer } from '../mcp/mcp-server';
import { AgentStreamManager } from '../agent/stream-manager';
import { AgentChatService } from '../agent/chat-service';
import { CodexEngine } from '../agent/engines/codex';
import { ClaudeEngine } from '../agent/engines/claude';
import { closeDb } from '../agent/db';
import {
  registerAgentRoutes,
  registerDebugRoutes,
  registerSettingsRoutes,
  registerStatusRoutes,
} from './routes';

// ============================================================
// Types
// ============================================================

interface ExtensionRequestPayload {
  data?: unknown;
}

// ============================================================
// Server Class
// ============================================================

export class Server {
  private fastify: FastifyInstance;
  public isRunning = false;
  private nativeHost: NativeMessagingHost | null = null;
  private transportsMap: Map<string, StreamableHTTPServerTransport | SSEServerTransport> =
    new Map();
  /** Map session ID to MCP server instance (for StreamableHTTP connections) */
  private mcpServersMap: Map<string, import('@modelcontextprotocol/sdk/server/index.js').Server> =
    new Map();
  /** Timeout for orphaned MCP server sessions (5 minutes) */
  private readonly MCP_SERVER_TIMEOUT_MS = 5 * 60 * 1000;
  private agentStreamManager: AgentStreamManager;
  private agentChatService: AgentChatService;

  constructor() {
    this.fastify = Fastify({ logger: SERVER_CONFIG.LOGGER_ENABLED });
    this.agentStreamManager = new AgentStreamManager();
    this.agentChatService = new AgentChatService({
      engines: [new CodexEngine(), new ClaudeEngine()],
      streamManager: this.agentStreamManager,
    });
    this.setupPlugins();
    this.setupRoutes();
  }

  /**
   * Associate NativeMessagingHost instance.
   */
  public setNativeHost(nativeHost: NativeMessagingHost): void {
    this.nativeHost = nativeHost;
  }

  private async setupPlugins(): Promise<void> {
    await this.fastify.register(cors, {
      origin: (origin, cb) => {
        // Allow requests with no origin (e.g., curl, server-to-server)
        if (!origin) {
          return cb(null, true);
        }
        // Check if origin matches any pattern in whitelist
        const allowed = SERVER_CONFIG.CORS_ORIGIN.some((pattern) =>
          pattern instanceof RegExp ? pattern.test(origin) : origin.startsWith(pattern),
        );
        cb(null, allowed);
      },
      methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
      credentials: true,
    });
  }

  private setupRoutes(): void {
    // Health check
    this.setupHealthRoutes();

    // Extension communication
    this.setupExtensionRoutes();

    // Agent routes (delegated to separate module)
    registerAgentRoutes(this.fastify, {
      streamManager: this.agentStreamManager,
      chatService: this.agentChatService,
    });

    // Debug mode routes
    registerDebugRoutes(this.fastify);

    // Settings routes
    registerSettingsRoutes(this.fastify);

    // Health & Status routes (nativeHost accessed via getter for late binding)
    registerStatusRoutes(this.fastify, {
      getNativeHost: () => this.nativeHost,
    });

    // MCP routes
    this.setupMcpRoutes();
  }

  // ============================================================
  // Health Routes
  // ============================================================

  private setupHealthRoutes(): void {
    this.fastify.get('/ping', async (_request: FastifyRequest, reply: FastifyReply) => {
      reply.status(HTTP_STATUS.OK).send({
        status: 'ok',
        message: 'pong',
      });
    });
  }

  // ============================================================
  // Extension Routes
  // ============================================================

  private setupExtensionRoutes(): void {
    this.fastify.get(
      '/ask-extension',
      async (request: FastifyRequest<{ Body: ExtensionRequestPayload }>, reply: FastifyReply) => {
        if (!this.nativeHost) {
          return reply
            .status(HTTP_STATUS.INTERNAL_SERVER_ERROR)
            .send({ error: ERROR_MESSAGES.NATIVE_HOST_NOT_AVAILABLE });
        }
        if (!this.isRunning) {
          return reply
            .status(HTTP_STATUS.INTERNAL_SERVER_ERROR)
            .send({ error: ERROR_MESSAGES.SERVER_NOT_RUNNING });
        }

        try {
          const extensionResponse = await this.nativeHost.sendRequestToExtensionAndWait(
            request.query,
            'process_data',
            TIMEOUTS.EXTENSION_REQUEST_TIMEOUT,
          );
          return reply.status(HTTP_STATUS.OK).send({ status: 'success', data: extensionResponse });
        } catch (error: unknown) {
          const err = error as Error;
          if (err.message.includes('timed out')) {
            return reply
              .status(HTTP_STATUS.GATEWAY_TIMEOUT)
              .send({ status: 'error', message: ERROR_MESSAGES.REQUEST_TIMEOUT });
          } else {
            return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
              status: 'error',
              message: `Failed to get response from extension: ${err.message}`,
            });
          }
        }
      },
    );
  }

  // ============================================================
  // MCP Routes
  // ============================================================

  private setupMcpRoutes(): void {
    // SSE endpoint
    this.fastify.get('/sse', async (_, reply) => {
      try {
        reply.raw.writeHead(HTTP_STATUS.OK, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        });

        const transport = new SSEServerTransport('/messages', reply.raw);
        this.transportsMap.set(transport.sessionId, transport);

        reply.raw.on('close', () => {
          this.transportsMap.delete(transport.sessionId);
        });

        const server = getMcpServer();
        console.error('[Server] SSE MCP connection established');
        await server.connect(transport);

        reply.raw.write(':\n\n');
      } catch (error) {
        if (!reply.sent) {
          reply.code(HTTP_STATUS.INTERNAL_SERVER_ERROR).send(ERROR_MESSAGES.INTERNAL_SERVER_ERROR);
        }
      }
    });

    // SSE messages endpoint
    this.fastify.post('/messages', async (req, reply) => {
      try {
        const { sessionId } = req.query as { sessionId?: string };
        const transport = this.transportsMap.get(sessionId || '') as SSEServerTransport;
        if (!sessionId || !transport) {
          reply.code(HTTP_STATUS.BAD_REQUEST).send('No transport found for sessionId');
          return;
        }

        await transport.handlePostMessage(req.raw, reply.raw, req.body);
      } catch (error) {
        if (!reply.sent) {
          reply.code(HTTP_STATUS.INTERNAL_SERVER_ERROR).send(ERROR_MESSAGES.INTERNAL_SERVER_ERROR);
        }
      }
    });

    // MCP POST endpoint
    this.fastify.post('/mcp', async (request, reply) => {
      const sessionId = request.headers['mcp-session-id'] as string | undefined;
      let transport: StreamableHTTPServerTransport | undefined = this.transportsMap.get(
        sessionId || '',
      ) as StreamableHTTPServerTransport;

      if (transport) {
        // Transport found, proceed
      } else if (!sessionId && isInitializeRequest(request.body)) {
        const newSessionId = randomUUID();
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => newSessionId,
          onsessioninitialized: (initializedSessionId) => {
            if (transport && initializedSessionId === newSessionId) {
              this.transportsMap.set(initializedSessionId, transport);
            }
          },
        });

        const server = createMcpServer();
        this.mcpServersMap.set(newSessionId, server);

        // Safety timer: close orphaned sessions that never complete initialization
        const serverCleanupTimer = setTimeout(() => {
          if (this.mcpServersMap.has(newSessionId)) {
            console.error(`[Server] Closing orphaned MCP session ${newSessionId}`);
            const orphanedServer = this.mcpServersMap.get(newSessionId);
            orphanedServer?.close().catch(() => {});
            this.mcpServersMap.delete(newSessionId);
            this.transportsMap.delete(newSessionId);
          }
        }, this.MCP_SERVER_TIMEOUT_MS);

        transport.onclose = () => {
          clearTimeout(serverCleanupTimer);
          const sid = transport?.sessionId;
          if (sid) {
            this.transportsMap.delete(sid);
            const mcpServer = this.mcpServersMap.get(sid);
            if (mcpServer) {
              void mcpServer.close();
              this.mcpServersMap.delete(sid);
            }
          }
        };
        await server.connect(transport);
        console.error('[Server] StreamableHTTP MCP connection established');
      } else {
        reply.code(HTTP_STATUS.BAD_REQUEST).send({ error: ERROR_MESSAGES.INVALID_MCP_REQUEST });
        return;
      }

      try {
        await transport.handleRequest(request.raw, reply.raw, request.body);
      } catch (error) {
        if (!reply.sent) {
          reply
            .code(HTTP_STATUS.INTERNAL_SERVER_ERROR)
            .send({ error: ERROR_MESSAGES.MCP_REQUEST_PROCESSING_ERROR });
        }
      }
    });

    // MCP GET endpoint (SSE stream)
    this.fastify.get('/mcp', async (request, reply) => {
      const sessionId = request.headers['mcp-session-id'] as string | undefined;
      const transport = sessionId
        ? (this.transportsMap.get(sessionId) as StreamableHTTPServerTransport)
        : undefined;

      if (!transport) {
        reply.code(HTTP_STATUS.BAD_REQUEST).send({ error: ERROR_MESSAGES.INVALID_SSE_SESSION });
        return;
      }

      reply.raw.setHeader('Content-Type', 'text/event-stream');
      reply.raw.setHeader('Cache-Control', 'no-cache');
      reply.raw.setHeader('Connection', 'keep-alive');
      reply.raw.flushHeaders();

      try {
        await transport.handleRequest(request.raw, reply.raw);
        if (!reply.sent) {
          reply.hijack();
        }
      } catch (error) {
        if (!reply.raw.writableEnded) {
          reply.raw.end();
        }
      }

      request.socket.on('close', () => {
        request.log.info(`SSE client disconnected for session: ${sessionId}`);
      });
    });

    // MCP DELETE endpoint
    this.fastify.delete('/mcp', async (request, reply) => {
      const sessionId = request.headers['mcp-session-id'] as string | undefined;
      const transport = sessionId
        ? (this.transportsMap.get(sessionId) as StreamableHTTPServerTransport)
        : undefined;

      if (!transport) {
        reply.code(HTTP_STATUS.BAD_REQUEST).send({ error: ERROR_MESSAGES.INVALID_SESSION_ID });
        return;
      }

      try {
        await transport.handleRequest(request.raw, reply.raw);
        if (!reply.sent) {
          reply.code(HTTP_STATUS.NO_CONTENT).send();
        }
      } catch (error) {
        if (!reply.sent) {
          reply
            .code(HTTP_STATUS.INTERNAL_SERVER_ERROR)
            .send({ error: ERROR_MESSAGES.MCP_SESSION_DELETION_ERROR });
        }
      }
    });
  }

  // ============================================================
  // Server Lifecycle
  // ============================================================

  public async start(port = NATIVE_SERVER_PORT, nativeHost: NativeMessagingHost): Promise<void> {
    if (!this.nativeHost) {
      this.nativeHost = nativeHost;
    } else if (this.nativeHost !== nativeHost) {
      this.nativeHost = nativeHost;
    }

    if (this.isRunning) {
      console.error('[Server] Start called but already running, port:', port);
      return;
    }

    console.error(
      `[Server] Starting Fastify server on port ${port}, host ${SERVER_CONFIG.HOST}...`,
    );
    try {
      await this.fastify.listen({ port, host: SERVER_CONFIG.HOST });

      // Set port environment variables after successful listen for Chrome MCP URL resolution
      process.env.CHROME_MCP_PORT = String(port);
      process.env.MCP_HTTP_PORT = String(port);

      this.isRunning = true;
      console.error(`[Server] Server started successfully on http://${SERVER_CONFIG.HOST}:${port}`);
      console.error(`[Server] MCP endpoint: http://${SERVER_CONFIG.HOST}:${port}/mcp`);
      console.error(`[Server] Agent API: http://${SERVER_CONFIG.HOST}:${port}/agent/`);
    } catch (err) {
      this.isRunning = false;
      console.error(`[Server] Failed to start server on port ${port}:`, err);
      throw err;
    }
  }

  public async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    try {
      await this.fastify.close();
      closeDb();
      this.isRunning = false;
    } catch (err) {
      this.isRunning = false;
      closeDb();
      throw err;
    }
  }

  public getInstance(): FastifyInstance {
    return this.fastify;
  }
}

const serverInstance = new Server();
export default serverInstance;
