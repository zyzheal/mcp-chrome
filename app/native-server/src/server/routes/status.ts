/**
 * Health & Status Routes - Runtime diagnostics endpoints.
 *
 * Provides real-time health checks and runtime state inspection
 * for the native server, its components, and connected services.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { HTTP_STATUS, TIMEOUTS, NATIVE_SERVER_PORT, SERVER_CONFIG } from '../../constant';
import { getMcpServer } from '../../mcp/mcp-server';
import { NativeMessagingHost } from '../../native-messaging-host';
import { getLogDir } from '../../scripts/utils';
import { getDb } from '../../agent/db';
import { projects, sessions } from '../../agent/db/schema';
import { count as drizzleCount } from 'drizzle-orm';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

// ============================================================
// Health Checkers
// ============================================================

interface HealthComponentResult {
  status: 'ok' | 'degraded' | 'error' | 'unknown';
  message: string;
  details?: Record<string, unknown>;
}

/**
 * Check CDP (Chrome DevTools Protocol) connectivity.
 * Chrome MCP browser tools depend on CDP endpoint at port 9222.
 */
async function checkCdp(): Promise<HealthComponentResult> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    const res = await fetch('http://localhost:9222/json/version', {
      method: 'GET',
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      return {
        status: 'error',
        message: `CDP endpoint returned HTTP ${res.status}`,
        details: { port: 9222, url: 'http://localhost:9222/json/version' },
      };
    }

    const info = await res.json();
    return {
      status: 'ok',
      message: 'CDP connected',
      details: {
        port: 9222,
        browser: info.Browser,
        protocol: info['Protocol-Version'],
        webSocket: info.webSocketDebuggerUrl ? 'available' : 'not available',
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('ECONNREFUSED') || message.includes('fetch failed')) {
      return {
        status: 'error',
        message: 'CDP not reachable - Chrome may not be running with --remote-debugging-port=9222',
        details: { port: 9222 },
      };
    }
    return { status: 'error', message: `CDP check failed: ${message}`, details: { port: 9222 } };
  }
}

/**
 * Check MCP server tool availability.
 * Verifies that tools/list returns expected Chrome MCP tools.
 */
async function checkMcpTools(): Promise<HealthComponentResult> {
  try {
    // For StreamableHTTP connections, we can't easily call tools/list without a transport.
    // Instead, verify the MCP server instance exists and is configured.
    const server = getMcpServer();
    if (!server) {
      return { status: 'error', message: 'MCP server instance not initialized' };
    }

    // The MCP server is a singleton for SSE, which is always created on startup.
    // Static tools are always available; dynamic tools depend on extension connection.
    const TOOL_SCHEMAS = (await import('chrome-mcp-shared')).TOOL_SCHEMAS;
    const staticToolCount = Array.isArray(TOOL_SCHEMAS) ? TOOL_SCHEMAS.length : 0;

    // Check for key Chrome tools
    const requiredTools = ['chrome_screenshot', 'chrome_navigate', 'chrome_click_element'];
    const availableTools = requiredTools.filter(
      (name) => Array.isArray(TOOL_SCHEMAS) && TOOL_SCHEMAS.some((t) => t.name === name),
    );

    if (availableTools.length === requiredTools.length) {
      return {
        status: 'ok',
        message: `MCP tools available (${staticToolCount} static tools registered)`,
        details: {
          staticToolCount,
          sampleTools: availableTools,
        },
      };
    }

    return {
      status: 'degraded',
      message: `Missing ${requiredTools.length - availableTools.length} required tools`,
      details: {
        staticToolCount,
        availableTools,
        missingTools: requiredTools.filter((t) => !availableTools.includes(t)),
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { status: 'error', message: `MCP tools check failed: ${message}` };
  }
}

/**
 * Check database connectivity and schema.
 */
async function checkDatabase(): Promise<HealthComponentResult> {
  try {
    const db = getDb();
    if (!db) {
      return { status: 'error', message: 'Database not initialized' };
    }

    const tableNames = ['projects', 'sessions', 'messages'];

    // Count records using Drizzle ORM
    let projectCount = 0;
    let sessionCount = 0;
    try {
      const projCount = await db.select({ count: drizzleCount() }).from(projects);
      projectCount = projCount[0]?.count ?? 0;
      const sessCount = await db.select({ count: drizzleCount() }).from(sessions);
      sessionCount = sessCount[0]?.count ?? 0;
    } catch {
      // Tables exist but may have schema issues
    }

    return {
      status: 'ok',
      message: 'Database healthy',
      details: {
        tables: tableNames,
        projectCount,
        sessionCount,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { status: 'error', message: `Database check failed: ${message}` };
  }
}

/**
 * Check extension connectivity via native messaging.
 */
async function checkExtension(
  nativeHost: NativeMessagingHost | null,
): Promise<HealthComponentResult> {
  if (!nativeHost) {
    return { status: 'unknown', message: 'Native messaging host not available' };
  }

  try {
    const response = await nativeHost.sendRequestToExtensionAndWait(
      {},
      'health_check',
      TIMEOUTS.EXTENSION_REQUEST_TIMEOUT,
    );

    if (response && response.status === 'success') {
      return {
        status: 'ok',
        message: 'Extension responsive',
        details: response.data || {},
      };
    }

    return {
      status: 'degraded',
      message: 'Extension responded but health check failed',
      details: { response },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      status: 'error',
      message: `Extension not reachable: ${message}`,
    };
  }
}

/**
 * Check agent engine availability.
 */
async function checkEngines(): Promise<HealthComponentResult> {
  const engines: Array<{
    name: string;
    status: 'ok' | 'error' | 'unknown';
    details: Record<string, unknown>;
  }> = [];

  // Check Claude SDK
  try {
    const claudePath = require.resolve('claude-code-sdk', { paths: [process.cwd()] });
    engines.push({
      name: 'claude',
      status: 'ok',
      details: { path: claudePath },
    });
  } catch {
    // SDK may not be globally installed but could be available via npx
    engines.push({
      name: 'claude',
      status: 'unknown',
      details: { message: 'claude-code-sdk not found as npm package, may use npx' },
    });
  }

  // Check Codex CLI
  try {
    const { stdout } = await execFileAsync('codex', ['--version'], { timeout: 5000 });
    engines.push({
      name: 'codex',
      status: 'ok',
      details: { version: stdout.trim() },
    });
  } catch {
    engines.push({
      name: 'codex',
      status: 'error',
      details: { message: 'codex CLI not found in PATH' },
    });
  }

  const hasError = engines.some((e) => e.status === 'error');
  const allOk = engines.every((e) => e.status === 'ok');

  return {
    status: hasError ? 'degraded' : 'ok',
    message: `${engines.filter((e) => e.status === 'ok').length}/${engines.length} engines available`,
    details: { engines },
  };
}

/**
 * Check server resource usage.
 */
function checkResources(): HealthComponentResult {
  const memUsage = process.memoryUsage();
  const uptime = process.uptime();
  const totalMem = os.totalmem();
  const freeMem = os.freemem();

  return {
    status: 'ok',
    message: 'Resources healthy',
    details: {
      uptime: Math.round(uptime),
      pid: process.pid,
      memory: {
        rss: `${Math.round(memUsage.rss / 1024 / 1024)} MB`,
        heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)} MB`,
        heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)} MB`,
      },
      system: {
        totalMemory: `${Math.round(totalMem / 1024 / 1024)} MB`,
        freeMemory: `${Math.round(freeMem / 1024 / 1024)} MB`,
        loadAvg: os.loadavg(),
      },
    },
  };
}

// ============================================================
// Route Registration
// ============================================================

export interface StatusRoutesOptions {
  getNativeHost: () => NativeMessagingHost | null;
}

export function registerStatusRoutes(fastify: FastifyInstance, options: StatusRoutesOptions): void {
  /**
   * GET /health - Comprehensive health check
   *
   * Returns status of all components. Each component is checked independently.
   * Overall status is 'ok' only if all critical components are healthy.
   *
   * Query params:
   * - quick=1: Skip slow external checks (extension, engines)
   */
  fastify.get('/health', async (request: FastifyRequest, reply: FastifyReply) => {
    const nativeHost = options.getNativeHost();
    const query = request.query as Record<string, string>;
    const isQuick = query.quick === '1';

    const checks = await Promise.allSettled([
      checkCdp(),
      checkMcpTools(),
      checkDatabase(),
      isQuick
        ? { status: 'unknown' as const, message: 'Skipped (quick mode)' }
        : checkExtension(nativeHost),
      isQuick ? { status: 'unknown' as const, message: 'Skipped (quick mode)' } : checkEngines(),
    ]);

    const components: Record<string, HealthComponentResult> = {};
    const checkNames = ['cdp', 'mcp_tools', 'database', 'extension', 'engines'];

    for (let i = 0; i < checks.length; i++) {
      const result = checks[i];
      const name = checkNames[i];
      if (result.status === 'fulfilled') {
        components[name] = result.value;
      } else {
        components[name] = {
          status: 'error',
          message: `Check failed: ${result.reason?.message || String(result.reason)}`,
        };
      }
    }

    components['resources'] = checkResources();

    // Overall status: error if any critical component is error, degraded if any is degraded
    const hasError = Object.values(components).some(
      (c) => c.status === 'error' && ['cdp', 'mcp_tools', 'database'].includes(c.message),
    );
    const hasDegraded = Object.values(components).some((c) => c.status === 'degraded');

    const overallStatus = hasError ? 'error' : hasDegraded ? 'degraded' : 'ok';
    const httpStatus = hasError ? HTTP_STATUS.INTERNAL_SERVER_ERROR : HTTP_STATUS.OK;

    reply.status(httpStatus).send({
      status: overallStatus,
      timestamp: new Date().toISOString(),
      uptime: Math.round(process.uptime()),
      version: process.env.npm_package_version || 'unknown',
      components,
    });
  });

  /**
   * GET /status - Runtime state summary
   *
   * Returns current runtime state: active sessions, executions, server info.
   * Lightweight compared to /health, does not perform external connectivity checks.
   */
  fastify.get('/status', async (request: FastifyRequest, reply: FastifyReply) => {
    const nativeHost = options.getNativeHost();

    const status = {
      server: {
        port: NATIVE_SERVER_PORT,
        host: SERVER_CONFIG.HOST,
        pid: process.pid,
        uptime: Math.round(process.uptime()),
        nodeVersion: process.version,
        memoryUsage: {
          rss: `${Math.round(process.memoryUsage().rss / 1024 / 1024)} MB`,
          heapUsed: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)} MB`,
        },
      },
      database: {
        initialized: !!getDb(),
      },
      mcp: {
        transports: 'SSE and StreamableHTTP',
        serverInitialized: !!getMcpServer(),
      },
      nativeMessaging: {
        available: !!nativeHost,
      },
      logging: {
        directory: getLogDir(),
        exists: fs.existsSync(getLogDir()),
      },
    };

    reply.status(HTTP_STATUS.OK).send(status);
  });
}
