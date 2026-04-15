/**
 * Debug Mode Routes - Simplified endpoints for local development
 *
 * Inline service code (no separate service file imports)
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { HTTP_STATUS } from '../../constant';

// ============================================================
// Inline Debug Mode Service
// ============================================================

interface DebugModeState {
  enabled: boolean;
  enabledAt?: number;
  expiresAt?: number;
  token?: string;
}

class DebugModeService {
  private state: DebugModeState = {
    enabled: process.env.DEBUG_MODE_ENABLED === 'true',
    token: process.env.DEBUG_MODE_TOKEN || 'debug-token',
  };

  isEnabled(): boolean {
    // Check if expired
    if (this.state.enabled && this.state.expiresAt) {
      if (Date.now() > this.state.expiresAt) {
        this.state.enabled = false;
        return false;
      }
    }
    return this.state.enabled;
  }

  async enable(token: string): Promise<{ success: boolean; expiresAt?: number }> {
    // Validate token (simple string comparison)
    const expectedToken = this.state.token || 'debug-token';
    if (token !== expectedToken) {
      return { success: false };
    }

    // Enable for 2 hours
    const expiresAt = Date.now() + 2 * 60 * 60 * 1000;

    this.state = {
      enabled: true,
      enabledAt: Date.now(),
      expiresAt,
      token,
    };

    console.log('[DebugMode] Enabled for 2 hours');
    return { success: true, expiresAt };
  }

  disable(): void {
    this.state.enabled = false;
    console.log('[DebugMode] Disabled');
  }

  getStatus(): { enabled: boolean; expiresAt?: number; enabledAt?: number } {
    return {
      enabled: this.state.enabled,
      expiresAt: this.state.expiresAt,
      enabledAt: this.state.enabledAt,
    };
  }

  isAuthenticated(origin?: string): boolean {
    if (!this.isEnabled()) {
      return false;
    }

    // Allow localhost and chrome-extension origins
    if (!origin) {
      return true;
    }

    const allowedPatterns = [
      /^chrome-extension:\/\//,
      /^http:\/\/localhost/,
      /^http:\/\/127\.0\.0\.1/,
    ];

    return allowedPatterns.some((pattern) => pattern.test(origin));
  }
}

// Singleton instance
const debugModeService = new DebugModeService();

// ============================================================
// Route Registration
// ============================================================

interface EnableDebugBody {
  token?: string;
}

export function registerDebugRoutes(fastify: FastifyInstance): void {
  /**
   * POST /debug/enable - Enable debug mode
   * Body: { token?: string }
   */
  fastify.post<{ Body: EnableDebugBody }>('/debug/enable', async (request, reply) => {
    const token = request.body?.token || 'debug-token';
    const result = await debugModeService.enable(token);

    if (!result.success) {
      return reply.status(HTTP_STATUS.UNAUTHORIZED).send({
        error: 'Invalid token',
      });
    }

    return reply.status(HTTP_STATUS.OK).send({
      enabled: true,
      expiresAt: result.expiresAt,
      message: 'Debug mode enabled for 2 hours',
    });
  });

  /**
   * GET /debug/status - Get debug mode status
   */
  fastify.get('/debug/status', async (request, reply) => {
    const status = debugModeService.getStatus();
    return reply.status(HTTP_STATUS.OK).send({
      enabled: status.enabled,
      expiresAt: status.expiresAt,
      enabledAt: status.enabledAt,
    });
  });

  /**
   * POST /debug/disable - Disable debug mode
   */
  fastify.post('/debug/disable', async (request, reply) => {
    debugModeService.disable();
    return reply.status(HTTP_STATUS.OK).send({
      disabled: true,
    });
  });

  /**
   * GET /debug/test - Test if debug mode allows access
   */
  fastify.get('/debug/test', async (request, reply) => {
    const origin = request.headers.origin;
    const isAllowed = debugModeService.isAuthenticated(origin);

    return reply.status(HTTP_STATUS.OK).send({
      allowed: isAllowed,
      origin,
      debugEnabled: debugModeService.isEnabled(),
    });
  });
}
