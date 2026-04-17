/**
 * Standalone OpenAI Chat - Sends messages directly to an OpenAI-compatible API.
 *
 * This composable bypasses the native server and communicates directly with
 * the configured OpenAI endpoint (URL + API Key + Model).
 */
import { ref, computed } from 'vue';
import type { AgentMessage, AgentStoredMessage } from 'chrome-mcp-shared';
import { mcpSchemaToOpenAITools, type OpenAIToolDefinition } from '@/common/openai-tools-adapter';
import { BACKGROUND_MESSAGE_TYPES } from '@/common/message-types';

// =============================================================================
// Types
// =============================================================================

export interface OpenAIChatConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  maxTokens?: number;
  temperature?: number;
  organization?: string;
  /** Whether to use this as the default chat engine (skip native server) */
  enabled: boolean;
  /** Text-only mode: return AI response without calling browser extension tools */
  textOnlyMode: boolean;
  /** Prompt user to start Native Server when tools are needed */
  promptForNativeServer: boolean;
}

export interface UseOpenAIChatOptions {
  getConfig: () => OpenAIChatConfig | null;
  getSessionId: () => string;
  /** Persist a stored message */
  persistMessage?: (msg: AgentStoredMessage) => void;
  /** Load persisted messages for current session */
  loadSessionHistory?: () => Promise<AgentStoredMessage[]>;
}

/**
 * Convert OpenAI-style content array to plain text string.
 * Handles both string content and multipart content arrays.
 */
function extractText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .filter((part: any) => part?.type === 'text')
      .map((part: any) => part.text || '')
      .join('\n');
  }
  if (content && typeof content === 'object') {
    return String((content as any).text || '');
  }
  return String(content ?? '');
}

/**
 * Check if native server is running by pinging the MCP endpoint.
 */
async function checkNativeServerRunning(): Promise<boolean> {
  try {
    // Try to get server status from background
    const port = await new Promise<number | null>((resolve) => {
      chrome.runtime.sendMessage({ type: 'get_server_status' }, (response) => {
        resolve(response?.serverStatus?.port ?? null);
      });
    });

    if (!port) return false;

    const response = await fetch(`http://127.0.0.1:${port}/ping`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Execute a single tool call via background script.
 */
async function executeToolCall(toolName: string, args: Record<string, unknown>): Promise<string> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(
        new Error(
          `Tool "${toolName}" timed out after 30s. The page may be unresponsive or the content script failed to load.`,
        ),
      );
    }, 30000);

    chrome.runtime.sendMessage(
      {
        type: BACKGROUND_MESSAGE_TYPES.EXECUTE_TOOL_CALL,
        payload: {
          toolName,
          args,
          requestId: crypto.randomUUID(),
        },
      },
      (response) => {
        clearTimeout(timeout);
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message || 'Background script error'));
          return;
        }
        if (!response?.success) {
          reject(new Error(response?.error || 'Tool execution failed'));
          return;
        }
        const result = response.result;
        if (result?.content && Array.isArray(result.content)) {
          const textParts = result.content
            .filter((c: any) => c.type === 'text')
            .map((c: any) => c.text)
            .join('\n');
          // Check isError flag from MCP-style tool result
          if (result.isError) {
            resolve(
              `[TOOL_ERROR] Tool "${toolName}" failed: ${textParts || JSON.stringify(result)}`,
            );
          } else {
            resolve(textParts || JSON.stringify(result));
          }
        } else {
          resolve(JSON.stringify(result ?? response));
        }
      },
    );
  });
}

function sanitizeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error ?? 'Unknown error');
}

/**
 * Convert OpenAI API messages to AgentMessage format.
 */
function openAiToAgentMessage(
  id: string,
  sessionId: string,
  role: string,
  content: unknown,
): AgentMessage {
  return {
    id,
    sessionId,
    role: role === 'user' ? 'user' : 'assistant',
    content: extractText(content),
    messageType: 'chat',
    createdAt: new Date().toISOString(),
  };
}

// =============================================================================
// Composable
// =============================================================================

export function useOpenAIChat(options: UseOpenAIChatOptions) {
  // State (same shape as useAgentChat)
  const messages = ref<AgentMessage[]>([]);
  const input = ref('');
  const sending = ref(false);
  const isStreaming = ref(false);
  const requestState = ref<'idle' | 'starting' | 'running' | 'completed' | 'cancelled' | 'error'>(
    'idle',
  );
  const errorMessage = ref<string | null>(null);
  const currentRequestId = ref<string | null>(null);
  const cancelling = ref(false);
  const lastUsage = ref<{
    inputTokens: number;
    outputTokens: number;
    totalCostUsd: number;
    durationMs: number;
    numTurns: number;
  } | null>(null);

  // Computed
  const canSend = computed(() => {
    return input.value.trim().length > 0 && !sending.value;
  });

  const isRequestActive = computed(() => {
    return requestState.value === 'starting' || requestState.value === 'running';
  });

  /**
   * Load session history from storage.
   */
  async function loadHistory(): Promise<void> {
    if (options.loadSessionHistory) {
      const stored = await options.loadSessionHistory();
      messages.value = stored.map((m) => ({
        id: m.id,
        sessionId: m.sessionId,
        role: m.role,
        content: m.content,
        messageType: m.messageType,
        requestId: m.requestId,
        createdAt: m.createdAt ?? new Date().toISOString(),
        metadata: m.metadata,
      }));
    }
  }

  /**
   * Check if the user instruction likely requires browser extension tools.
   */
  function needsBrowserTools(instruction: string): boolean {
    const keywords = [
      '点击',
      'click',
      '打开',
      'open',
      '导航',
      'navigate',
      '填充',
      'fill',
      '输入',
      'type',
      'input',
      '选择',
      'select',
      '截图',
      'screenshot',
      '滚动',
      'scroll',
      '标签页',
      'tab',
      '窗口',
      'window',
      '浏览器',
      'browser',
      '网页',
      'page',
      '元素',
      'element',
    ];
    const lower = instruction.toLowerCase();
    return keywords.some((keyword) => lower.includes(keyword));
  }

  /**
   * Core loop: send request with tools, handle tool calls, return final text.
   */
  async function executeWithToolLoop(
    config: OpenAIChatConfig,
    initialMessages: Array<{ role: string; content: string }>,
    systemNote: string,
    requestId: string,
    _sessionId: string,
    startTime: number,
  ): Promise<string> {
    const tools: OpenAIToolDefinition[] = config.textOnlyMode ? [] : mcpSchemaToOpenAITools();

    const messages = [...initialMessages];
    let maxTurns = 10;
    let assistantContent = '';

    // Track executed tool calls for loop detection (normalized for JSON key order)
    const recentToolCallKeys = new Set<string>();
    const MAX_REPEATED_CALLS = 3;
    let consecutiveErrors = 0;
    const MAX_CONSECUTIVE_ERRORS = 3;

    // Normalize tool call args to a stable string (sorted keys) for repeat detection
    const normalizeToolCallKey = (name: string, argsStr: string): string => {
      try {
        const args = JSON.parse(argsStr);
        const sorted = Object.keys(args)
          .sort()
          .reduce((obj: any, key) => {
            obj[key] = args[key];
            return obj;
          }, {});
        return `${name}:${JSON.stringify(sorted)}`;
      } catch {
        return `${name}:${argsStr}`;
      }
    };

    while (maxTurns-- > 0) {
      if (currentRequestId.value !== requestId) {
        throw new Error('Request cancelled');
      }

      let apiUrl = config.baseUrl.replace(/\/+$/, '');
      if (!apiUrl.endsWith('/v1/chat/completions') && !apiUrl.endsWith('/chat/completions')) {
        apiUrl += apiUrl.endsWith('/v1') ? '/chat/completions' : '/v1/chat/completions';
      }

      const turnNumber = 10 - maxTurns;

      // CRITICAL: Always include systemNote in every turn.
      // Some providers (DashScope/Qwen) drop system instructions after tool rounds,
      // causing AI to revert to English or skip tool summaries.
      const bodyMessages = systemNote
        ? [{ role: 'system', content: systemNote }, ...messages]
        : messages;
      console.log(
        `[OpenAI Chat] Turn ${turnNumber}: messages count=${bodyMessages.length}, roles=${bodyMessages.map((m: any) => m.role).join(', ')}`,
      );

      const requestBody: any = {
        model: config.model,
        messages: bodyMessages,
        stream: false,
      };

      if (tools.length > 0) {
        requestBody.tools = tools.map((t) => ({
          type: 'function',
          function: {
            name: t.function.name,
            description: t.function.description,
            parameters: t.function.parameters,
          },
        }));
        requestBody.tool_choice = 'auto';
      }

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new Error(errorText || `HTTP ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const choice = data.choices?.[0];
      if (!choice) throw new Error('No choices in OpenAI response');

      const message = choice.message;
      assistantContent = message?.content ?? '';

      console.log(
        `[OpenAI Chat] Turn ${turnNumber}: API response - content="${(assistantContent || '(empty)').substring(0, 100)}", has_tool_calls=${!!message?.tool_calls?.length}`,
      );
      if (message?.tool_calls?.length > 0) {
        console.log(
          `[OpenAI Chat] Turn ${turnNumber}: tool_calls =`,
          message.tool_calls.map((tc: any) => tc.function?.name).join(', '),
        );
      }

      if (data.usage) {
        lastUsage.value = {
          inputTokens: data.usage.prompt_tokens ?? 0,
          outputTokens: data.usage.completion_tokens ?? 0,
          totalCostUsd: 0,
          durationMs: Date.now() - startTime,
          numTurns: (lastUsage.value?.numTurns ?? 0) + 1,
        };
      }

      const toolCalls = message?.tool_calls;
      if (!toolCalls || toolCalls.length === 0) {
        console.log(`[OpenAI Chat] Turn ${turnNumber}: no tool calls, assistant response only`);
        break;
      }

      console.log(
        `[OpenAI Chat] Turn ${turnNumber}: ${toolCalls.length} tool call(s) requested:`,
        toolCalls.map((tc: any) => `${tc.function?.name}`).join(', '),
      );

      requestState.value = 'running';
      isStreaming.value = true;

      // Check for repeated tool calls
      for (const tc of toolCalls) {
        const normalizedKey = normalizeToolCallKey(
          tc.function?.name,
          tc.function?.arguments || '{}',
        );
        if (recentToolCallKeys.has(normalizedKey)) {
          const existing = [...recentToolCallKeys].filter((k) =>
            k.startsWith(`${tc.function?.name}:`),
          ).length;
          if (existing >= MAX_REPEATED_CALLS) {
            console.warn(
              `[OpenAI Chat] Detected repeated tool call (${existing}x): ${tc.function?.name}`,
            );
            return '检测到重复的工具调用循环。AI 多次尝试相同的操作但没有进展。请尝试更具体的指令，或检查目标页面是否正确。';
          }
        }
      }

      // Track this turn's tool calls for repeat detection
      for (const tc of toolCalls) {
        recentToolCallKeys.add(
          normalizeToolCallKey(tc.function?.name, tc.function?.arguments || '{}'),
        );
      }

      const toolResults: Array<{
        role: 'tool';
        tool_call_id: string;
        content: string;
      }> = [];
      let turnHasError = false;

      for (const toolCall of toolCalls) {
        const toolName = toolCall.function?.name;
        let toolArgs: Record<string, unknown>;
        try {
          toolArgs = JSON.parse(toolCall.function?.arguments || '{}');
        } catch {
          toolResults.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: `Error: Invalid JSON arguments: ${toolCall.function?.arguments}`,
          });
          turnHasError = true;
          console.error(`[OpenAI Chat] Turn ${turnNumber}: Invalid JSON args for ${toolName}`);
          continue;
        }

        console.log(
          `[OpenAI Chat] Turn ${turnNumber}: Executing ${toolName}`,
          JSON.stringify(toolArgs).substring(0, 300),
        );
        try {
          const result = await executeToolCall(toolName, toolArgs);
          const isToolError = result.startsWith('[TOOL_ERROR]');
          console.log(
            `[OpenAI Chat] Turn ${turnNumber}: ${toolName} ${isToolError ? 'FAILED' : 'OK'} (${result.length} chars)`,
            result.substring(0, 200),
          );
          toolResults.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: result,
          });
          if (isToolError) {
            turnHasError = true;
            consecutiveErrors++;
          } else {
            consecutiveErrors = 0; // Reset on success
          }
          console.log(
            `[OpenAI Chat] Turn ${turnNumber}: tool result pushed for ${toolName} (${result.substring(0, 150)}...)`,
          );
        } catch (error) {
          console.error(`[OpenAI Chat] Turn ${turnNumber}: Tool ${toolName} threw:`, error);
          const errorMsg = sanitizeError(error);
          toolResults.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: `Error: ${errorMsg}`,
          });
          turnHasError = true;
          consecutiveErrors++;
        }
      }

      // Break if too many consecutive tool errors
      if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        console.warn(`[OpenAI Chat] Too many consecutive tool errors (${consecutiveErrors})`);
        return `工具执行连续失败（已失败 ${consecutiveErrors} 次）。请检查浏览器状态或尝试不同的操作。`;
      }

      messages.push({
        role: 'assistant',
        // When tool_calls exist, some providers (DashScope) reject empty string content.
        // Use undefined to omit the field entirely when there's no text.
        content: assistantContent || undefined,
        tool_calls: toolCalls,
      });

      messages.push(
        ...toolResults.map((r) => ({
          role: 'tool' as const,
          tool_call_id: r.tool_call_id,
          content: r.content,
        })),
      );

      console.log(
        `[OpenAI Chat] Turn ${turnNumber}: after pushing, messages count=${messages.length}, roles=${messages.map((m: any) => m.role).join(', ')}`,
      );
    }

    if (maxTurns <= 0) {
      console.warn('[OpenAI Chat] Max tool call turns reached (10)');
      const lastTools = [...recentToolCallKeys].slice(-3);
      const toolSummary =
        lastTools.length > 0
          ? `最后尝试的工具: ${lastTools.map((k) => k.split(':')[0]).join(', ')}`
          : '';
      return `已达到最大工具调用次数限制（10轮）。操作未能完成，可能的原因：\n1. 目标页面元素无法定位\n2. 页面结构发生变化\n3. 工具执行遇到错误\n\n${toolSummary}\n\n请尝试更具体的指令，或分步骤执行操作。`;
    }

    console.log(`[OpenAI Chat] Loop ended. assistantContent length=${assistantContent.length}`);

    // Safety net: if AI returned empty content but tools were called successfully,
    // generate a summary so the user sees something meaningful.
    if (!assistantContent && recentToolCallKeys.size > 0) {
      const lastKey = [...recentToolCallKeys].pop()!;
      const toolName = lastKey.split(':')[0];
      return `工具 "${toolName}" 已执行完成。请查看页面变化确认操作结果。`;
    }

    return assistantContent;
  }

  /**
   * Send message to OpenAI-compatible API.
   */
  async function send(
    chatOptions: {
      projectId?: string;
      dbSessionId?: string;
      instruction?: string;
      displayText?: string;
      clientMeta?: any;
    } = {},
  ): Promise<void> {
    const userText = input.value.trim();
    const instructionText = chatOptions.instruction?.trim() || userText;

    if (!userText) return;

    const config = options.getConfig();
    if (!config) {
      errorMessage.value = '未配置 OpenAI 兼容的 API。请先在设置页面配置 URL、Key 和模型。';
      return;
    }

    // Always instruct AI to respond in Chinese
    let systemNote =
      '请用中文回复用户。使用浏览器工具时，如果操作成功，请简要说明执行结果；如果失败，请告知用户可能的原因。';
    if (config.textOnlyMode) {
      systemNote += '\n（当前为仅文本模式，无法使用浏览器工具，只能进行文本对话）';
    }

    const sessionId = options.getSessionId();
    if (!sessionId) {
      errorMessage.value = '未选择会话。';
      return;
    }

    // Normalize base URL - ensure it ends with /chat/completions
    let apiUrl = config.baseUrl.replace(/\/+$/, '');
    if (!apiUrl.endsWith('/v1/chat/completions') && !apiUrl.endsWith('/chat/completions')) {
      if (apiUrl.endsWith('/v1')) {
        // Already has /v1, just append /chat/completions
        apiUrl += '/chat/completions';
      } else {
        // No OpenAI path, add full path
        apiUrl += '/v1/chat/completions';
      }
    }

    const requestId = crypto.randomUUID();

    // Optimistic user message
    const tempMessageId = `temp-${Date.now()}`;
    const optimisticMessage: AgentMessage = {
      id: tempMessageId,
      sessionId,
      role: 'user',
      content: userText,
      messageType: 'chat',
      requestId,
      createdAt: new Date().toISOString(),
      metadata:
        chatOptions.displayText || chatOptions.clientMeta
          ? {
              displayText: chatOptions.displayText?.trim(),
              clientMeta: chatOptions.clientMeta,
            }
          : undefined,
    };

    messages.value.push(optimisticMessage);

    // Build messages array for OpenAI API
    // Include conversation history from current session
    const apiMessages: Array<{ role: string; content: string }> = messages.value
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({
        role: m.role === 'user' ? 'user' : 'assistant',
        content: m.content,
      }));

    sending.value = true;
    requestState.value = 'starting';
    currentRequestId.value = requestId;
    isStreaming.value = false;
    errorMessage.value = null;

    const savedInput = input.value;
    input.value = '';

    const startTime = Date.now();

    try {
      // Execute the main request (with possible function calling loop)
      const finalContent = await executeWithToolLoop(
        config,
        apiMessages,
        systemNote,
        requestId,
        sessionId,
        startTime,
      );

      if (finalContent !== null) {
        // Add assistant response
        const assistantMessageId = `resp-${Date.now()}`;
        const assistantMsg: AgentMessage = openAiToAgentMessage(
          assistantMessageId,
          sessionId,
          'assistant',
          finalContent,
        );
        assistantMsg.requestId = requestId;
        messages.value.push(assistantMsg);

        // Persist messages
        if (options.persistMessage) {
          const storedUser: AgentStoredMessage = {
            id: optimisticMessage.id,
            sessionId: optimisticMessage.sessionId,
            role: optimisticMessage.role,
            content: optimisticMessage.content,
            messageType: optimisticMessage.messageType,
            requestId,
            createdAt: optimisticMessage.createdAt,
            metadata: optimisticMessage.metadata,
          };
          options.persistMessage(storedUser);

          const storedAssistant: AgentStoredMessage = {
            id: assistantMsg.id,
            sessionId: assistantMsg.sessionId,
            role: assistantMsg.role,
            content: assistantMsg.content,
            messageType: assistantMsg.messageType,
            requestId,
            createdAt: assistantMsg.createdAt,
          };
          options.persistMessage(storedAssistant);
        }
      }

      requestState.value = 'completed';
      currentRequestId.value = null;
    } catch (error: unknown) {
      errorMessage.value =
        error instanceof Error ? `请求失败: ${error.message}` : '发送请求到 OpenAI API 失败。';

      console.error('[OpenAI Chat] Request failed:', error);

      // Restore input on error
      input.value = savedInput;

      // Remove optimistic message on error
      const msgIndex = messages.value.findIndex((m) => m.id === tempMessageId);
      if (msgIndex >= 0) {
        messages.value.splice(msgIndex, 1);
      }

      requestState.value = 'error';
      currentRequestId.value = null;
    } finally {
      sending.value = false;
      isStreaming.value = false;
    }
  }

  /**
   * Cancel current request (no-op for non-streaming OpenAI API).
   */
  async function cancelCurrentRequest(): Promise<void> {
    if (!currentRequestId.value) return;
    cancelling.value = true;
    // For non-streaming requests, we can't truly cancel mid-response
    // Just reset the state
    requestState.value = 'cancelled';
    currentRequestId.value = null;
    sending.value = false;
    cancelling.value = false;
  }

  function clearMessages(): void {
    messages.value = [];
  }

  function setMessages(newMessages: AgentMessage[]): void {
    messages.value = newMessages;
  }

  return {
    // State
    messages,
    input,
    sending,
    isStreaming,
    requestState,
    errorMessage,
    currentRequestId,
    cancelling,
    lastUsage,

    // Computed
    canSend,
    isRequestActive,

    // Methods
    send,
    cancelCurrentRequest,
    clearMessages,
    setMessages,
    loadHistory,
  };
}
