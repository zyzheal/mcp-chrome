import { stdin, stdout } from 'process';
import { Server } from './server';
import { v4 as uuidv4 } from 'uuid';
import { NativeMessageType } from 'chrome-mcp-shared';
import { TIMEOUTS } from './constant';
import fileHandler from './file-handler';

// ============================================================
// Constants
// ============================================================

/** Maximum number of pending requests to prevent memory exhaustion */
const MAX_PENDING_REQUESTS = 100;

/** Heartbeat interval in milliseconds */
const HEARTBEAT_INTERVAL_MS = 30000;

/** Heartbeat timeout in milliseconds (if no response, consider disconnected) */
const HEARTBEAT_TIMEOUT_MS = 10000;

/** Maximum messages to process per tick to prevent blocking */
const MAX_MESSAGES_PER_TICK = 100;

/** Maximum message size in bytes to prevent memory attacks */
const MAX_MESSAGE_SIZE_BYTES = 16 * 1024 * 1024;

// ============================================================
// Types
// ============================================================

interface PendingRequest {
  resolve: (value: any) => void;
  reject: (reason?: any) => void;
  timeoutId: NodeJS.Timeout;
  messageType: string;
  messagePayload: any;
}

interface HeartbeatState {
  lastSentTime: number;
  lastReceivedTime: number;
  pendingPong: boolean;
  intervalId: NodeJS.Timeout | null;
}

interface ErrorResponse {
  success: false;
  error: string;
  code?: string;
}

// ============================================================
// Native Messaging Host Class
// ============================================================

export class NativeMessagingHost {
  private associatedServer: Server | null = null;
  private pendingRequests: Map<string, PendingRequest> = new Map();
  private heartbeatState: HeartbeatState = {
    lastSentTime: 0,
    lastReceivedTime: Date.now(),
    pendingPong: false,
    intervalId: null,
  };
  private isShuttingDown = false;
  private messageQueue: Array<{ message: any; resolve: () => void; reject: (err: Error) => void }> =
    [];
  private isProcessingQueue = false;

  public setServer(serverInstance: Server): void {
    this.associatedServer = serverInstance;
  }

  /**
   * Start the native messaging host
   */
  public start(): void {
    try {
      this.setupMessageHandling();
      this.startHeartbeat();
    } catch (error: any) {
      console.error('[NativeMessagingHost] Failed to start:', error.message);
      process.exit(1);
    }
  }

  // ============================================================
  // Message Handling
  // ============================================================

  private setupMessageHandling(): void {
    let buffer = Buffer.alloc(0);
    let expectedLength = -1;

    const processAvailable = async () => {
      let processed = 0;
      while (processed < MAX_MESSAGES_PER_TICK) {
        if (expectedLength === -1) {
          if (buffer.length < 4) break;
          expectedLength = buffer.readUInt32LE(0);
          // FIX: Use subarray instead of deprecated slice
          buffer = buffer.subarray(4);

          if (expectedLength <= 0 || expectedLength > MAX_MESSAGE_SIZE_BYTES) {
            this.sendError(`Invalid message length: ${expectedLength}`, 'INVALID_MESSAGE_LENGTH');
            expectedLength = -1;
            buffer = Buffer.alloc(0);
            break;
          }
        }

        if (buffer.length < expectedLength) break;

        // FIX: Use subarray instead of deprecated slice
        const messageBuffer = buffer.subarray(0, expectedLength);
        buffer = buffer.subarray(expectedLength);
        expectedLength = -1;
        processed++;

        try {
          const message = JSON.parse(messageBuffer.toString());
          // FIX: Add await to properly handle async message processing
          await this.handleMessage(message);
        } catch (error: any) {
          this.sendError(`Failed to parse message: ${error.message}`, 'PARSE_ERROR');
        }
      }

      if (processed === MAX_MESSAGES_PER_TICK) {
        setImmediate(processAvailable);
      }
    };

    stdin.on('readable', () => {
      let chunk;
      while ((chunk = stdin.read()) !== null) {
        buffer = Buffer.concat([buffer, chunk]);
        // Start processing (non-blocking)
        processAvailable().catch((err) => {
          console.error('[NativeMessagingHost] Error in processAvailable:', err.message);
        });
      }
    });

    stdin.on('end', () => {
      console.error('[NativeMessagingHost] stdin ended - Chrome extension disconnected');
      this.cleanup();
    });

    stdin.on('error', (err) => {
      console.error('[NativeMessagingHost] stdin error:', err.message);
      this.cleanup();
    });

    console.error(
      '[NativeMessagingHost] Message handling setup complete, waiting for messages from Chrome extension',
    );
  }

  /**
   * Handle incoming message from Chrome extension
   * FIX: Now properly async and handles all cases
   */
  private async handleMessage(message: any): Promise<void> {
    if (!message || typeof message !== 'object') {
      this.sendError('Invalid message format', 'INVALID_FORMAT');
      return;
    }

    // Update heartbeat received time
    this.heartbeatState.lastReceivedTime = Date.now();
    this.heartbeatState.pendingPong = false;

    console.error(
      `[NativeMessagingHost] Received message: type=${message.type || 'unknown'}, hasRequestId=${!!message.requestId}`,
    );

    // Handle response to our request
    if (message.responseToRequestId) {
      this.handleResponse(message);
      return;
    }

    // Handle directive messages from Chrome
    try {
      switch (message.type) {
        case NativeMessageType.START:
          console.error(
            `[NativeMessagingHost] START message received, port=${message.payload?.port || 12306}`,
          );
          await this.startServer(message.payload?.port || 12306);
          break;
        case NativeMessageType.STOP:
          console.error('[NativeMessagingHost] STOP message received');
          await this.stopServer();
          break;
        case 'ping_from_extension':
          console.error('[NativeMessagingHost] ping_from_extension received, sending pong');
          this.sendMessage({ type: 'pong_to_extension' });
          break;
        case 'pong_from_extension':
          // Heartbeat response - already handled by updating lastReceivedTime
          console.error('[NativeMessagingHost] Heartbeat pong received');
          break;
        case 'file_operation':
          await this.handleFileOperation(message);
          break;
        default:
          if (!message.responseToRequestId) {
            console.error(
              `[NativeMessagingHost] Unknown message type: ${message.type || 'no type'}`,
            );
            this.sendError(
              `Unknown message type: ${message.type || 'no type'}`,
              'UNKNOWN_MESSAGE_TYPE',
            );
          }
      }
    } catch (error: any) {
      console.error(
        `[NativeMessagingHost] Failed to handle message type=${message.type}:`,
        error.message,
      );
      this.sendError(`Failed to handle message: ${error.message}`, 'HANDLER_ERROR');
    }
  }

  /**
   * Handle response to a previous request
   */
  private handleResponse(message: any): void {
    const requestId = message.responseToRequestId;
    const pending = this.pendingRequests.get(requestId);

    if (pending) {
      clearTimeout(pending.timeoutId);
      this.pendingRequests.delete(requestId);

      if (message.error) {
        console.error(`[NativeMessagingHost] Response for ${requestId}: error=${message.error}`);
        pending.reject(new Error(message.error));
      } else {
        console.error(`[NativeMessagingHost] Response for ${requestId}: success`);
        pending.resolve(message.payload);
      }
    } else {
      console.error(`[NativeMessagingHost] Received response for unknown requestId: ${requestId}`);
    }
  }

  /**
   * Handle file operations from the extension
   */
  private async handleFileOperation(message: any): Promise<void> {
    try {
      const result = await fileHandler.handleFileRequest(message.payload);

      if (message.requestId) {
        this.sendMessage({
          type: 'file_operation_response',
          responseToRequestId: message.requestId,
          payload: result,
        });
      } else {
        this.sendMessage({
          type: 'file_operation_result',
          payload: result,
        });
      }
    } catch (error: any) {
      const errorMessage = error.message || 'Unknown error during file operation';

      if (message.requestId) {
        // FIX: Unified error response format
        this.sendMessage({
          type: 'file_operation_response',
          responseToRequestId: message.requestId,
          payload: this.createErrorResponse(errorMessage, 'FILE_OPERATION_ERROR'),
        });
      } else {
        this.sendError(`File operation failed: ${errorMessage}`, 'FILE_OPERATION_ERROR');
      }
    }
  }

  // ============================================================
  // Request/Response Pattern
  // ============================================================

  /**
   * Send request to Chrome and wait for response
   * FIX: Added max pending requests limit and cancellation notification
   */
  public sendRequestToExtensionAndWait(
    messagePayload: any,
    messageType: string = 'request_data',
    timeoutMs: number = TIMEOUTS.DEFAULT_REQUEST_TIMEOUT,
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      // FIX: Check pending requests limit to prevent memory exhaustion
      if (this.pendingRequests.size >= MAX_PENDING_REQUESTS) {
        reject(new Error('Too many pending requests, please try again later'));
        return;
      }

      if (this.isShuttingDown) {
        reject(new Error('Native host is shutting down'));
        return;
      }

      const requestId = uuidv4();

      const timeoutId = setTimeout(() => {
        // FIX: Send cancellation notification to extension
        this.sendMessage({
          type: 'request_cancelled',
          requestId: requestId,
          reason: `Request timed out after ${timeoutMs}ms`,
        });

        this.pendingRequests.delete(requestId);
        reject(new Error(`Request timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      // Store request info for potential cancellation
      this.pendingRequests.set(requestId, {
        resolve,
        reject,
        timeoutId,
        messageType,
        messagePayload,
      });

      this.sendMessage({
        type: messageType,
        payload: messagePayload,
        requestId: requestId,
      });
    });
  }

  /**
   * Cancel a pending request
   */
  public cancelRequest(requestId: string, reason: string = 'Cancelled by caller'): void {
    const pending = this.pendingRequests.get(requestId);
    if (pending) {
      clearTimeout(pending.timeoutId);
      this.pendingRequests.delete(requestId);

      // Notify extension about cancellation
      this.sendMessage({
        type: 'request_cancelled',
        requestId: requestId,
        reason: reason,
      });

      pending.reject(new Error(reason));
    }
  }

  // ============================================================
  // Server Lifecycle
  // ============================================================

  /**
   * Start Fastify server
   */
  private async startServer(port: number): Promise<void> {
    if (!this.associatedServer) {
      this.sendError('Internal error: server instance not set', 'INTERNAL_ERROR');
      return;
    }

    try {
      if (this.associatedServer.isRunning) {
        console.error(
          `[NativeMessagingHost] Server already running, ignoring START request for port ${port}`,
        );
        this.sendMessage({
          type: NativeMessageType.ERROR,
          payload: this.createErrorResponse('Server is already running', 'SERVER_ALREADY_RUNNING'),
        });
        return;
      }

      console.error(`[NativeMessagingHost] Starting server on port ${port}...`);
      await this.associatedServer.start(port, this);
      console.error(`[NativeMessagingHost] Server started successfully on port ${port}`);

      this.sendMessage({
        type: NativeMessageType.SERVER_STARTED,
        payload: { port },
      });
    } catch (error: any) {
      console.error(`[NativeMessagingHost] Failed to start server on port ${port}:`, error.message);
      this.sendError(`Failed to start server: ${error.message}`, 'SERVER_START_ERROR');
    }
  }

  /**
   * Stop Fastify server
   */
  private async stopServer(): Promise<void> {
    if (!this.associatedServer) {
      this.sendError('Internal error: server instance not set', 'INTERNAL_ERROR');
      return;
    }

    try {
      if (!this.associatedServer.isRunning) {
        this.sendMessage({
          type: NativeMessageType.ERROR,
          payload: this.createErrorResponse('Server is not running', 'SERVER_NOT_RUNNING'),
        });
        return;
      }

      await this.associatedServer.stop();
      this.sendMessage({ type: NativeMessageType.SERVER_STOPPED });
    } catch (error: any) {
      this.sendError(`Failed to stop server: ${error.message}`, 'SERVER_STOP_ERROR');
    }
  }

  // ============================================================
  // Heartbeat Mechanism
  // ============================================================

  /**
   * Start heartbeat to detect connection issues
   * FIX: Added heartbeat mechanism
   */
  private startHeartbeat(): void {
    this.heartbeatState.intervalId = setInterval(() => {
      if (this.isShuttingDown) {
        this.stopHeartbeat();
        return;
      }

      const now = Date.now();
      const timeSinceLastReceived = now - this.heartbeatState.lastReceivedTime;

      // If we haven't received anything for too long, consider disconnected
      if (timeSinceLastReceived > HEARTBEAT_INTERVAL_MS + HEARTBEAT_TIMEOUT_MS) {
        console.error('[NativeMessagingHost] Heartbeat timeout - connection appears dead');
        this.cleanup();
        return;
      }

      // Send heartbeat ping
      if (!this.heartbeatState.pendingPong) {
        this.heartbeatState.lastSentTime = now;
        this.heartbeatState.pendingPong = true;
        this.sendMessage({ type: 'heartbeat_ping' });
        console.error('[NativeMessagingHost] Heartbeat ping sent');
      }
    }, HEARTBEAT_INTERVAL_MS);

    console.error('[NativeMessagingHost] Heartbeat mechanism started');
  }

  /**
   * Stop heartbeat
   */
  private stopHeartbeat(): void {
    if (this.heartbeatState.intervalId) {
      clearInterval(this.heartbeatState.intervalId);
      this.heartbeatState.intervalId = null;
    }
  }

  // ============================================================
  // Message Sending
  // ============================================================

  /**
   * Send message to Chrome extension
   * FIX: Use synchronous write for atomic message delivery
   */
  public sendMessage(message: any): void {
    try {
      const messageString = JSON.stringify(message);
      const messageBuffer = Buffer.from(messageString);
      const headerBuffer = Buffer.alloc(4);
      headerBuffer.writeUInt32LE(messageBuffer.length, 0);

      const fullBuffer = Buffer.concat([headerBuffer, messageBuffer]);
      const messageType = message.type || 'unknown';

      // FIX: Use synchronous write to ensure atomic message delivery
      // This prevents message interleaving in high-concurrency scenarios
      try {
        stdout.write(fullBuffer);
        console.error(`[NativeMessagingHost] Sent message: type=${messageType}`);
      } catch (writeError: any) {
        console.error(
          `[NativeMessagingHost] Failed to write message type=${messageType}:`,
          writeError.message,
        );
      }
    } catch (error: any) {
      console.error(`[NativeMessagingHost] Failed to prepare message:`, error.message);
    }
  }

  /**
   * Send error message to Chrome extension
   * FIX: Unified error response format
   */
  private sendError(errorMessage: string, code?: string): void {
    console.error(`[NativeMessagingHost] ERROR: ${errorMessage} (${code || 'unknown'})`);
    this.sendMessage({
      type: NativeMessageType.ERROR_FROM_NATIVE_HOST,
      payload: this.createErrorResponse(errorMessage, code),
    });
  }

  /**
   * Create standardized error response
   */
  private createErrorResponse(errorMessage: string, code?: string): ErrorResponse {
    return {
      success: false,
      error: errorMessage,
      code: code || 'UNKNOWN_ERROR',
    };
  }

  // ============================================================
  // Cleanup
  // ============================================================

  /**
   * Clean up resources before exit
   */
  private cleanup(): void {
    if (this.isShuttingDown) return;

    this.isShuttingDown = true;
    console.error('[NativeMessagingHost] Cleanup called - shutting down');

    // Stop heartbeat
    this.stopHeartbeat();

    // Reject all pending requests
    const pendingCount = this.pendingRequests.size;
    this.pendingRequests.forEach((pending, requestId) => {
      clearTimeout(pending.timeoutId);
      pending.reject(new Error('Native host is shutting down or Chrome disconnected.'));
    });
    this.pendingRequests.clear();
    console.error(`[NativeMessagingHost] Cleared ${pendingCount} pending requests`);

    // Stop server if running
    if (this.associatedServer && this.associatedServer.isRunning) {
      console.error('[NativeMessagingHost] Stopping associated server before exit');
      this.associatedServer
        .stop()
        .then(() => {
          console.error('[NativeMessagingHost] Server stopped, exiting');
          process.exit(0);
        })
        .catch((err) => {
          console.error('[NativeMessagingHost] Server stop failed:', err.message);
          process.exit(1);
        });
    } else {
      console.error('[NativeMessagingHost] No running server, exiting directly');
      process.exit(0);
    }
  }

  /**
   * Get current pending requests count (for monitoring)
   */
  public getPendingRequestsCount(): number {
    return this.pendingRequests.size;
  }

  /**
   * Check if connection is healthy
   */
  public isConnectionHealthy(): boolean {
    const timeSinceLastReceived = Date.now() - this.heartbeatState.lastReceivedTime;
    return timeSinceLastReceived < HEARTBEAT_INTERVAL_MS + HEARTBEAT_TIMEOUT_MS;
  }
}

const nativeMessagingHostInstance = new NativeMessagingHost();
export default nativeMessagingHostInstance;
