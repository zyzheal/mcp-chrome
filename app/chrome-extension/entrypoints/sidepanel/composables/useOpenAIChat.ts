/**
 * Standalone OpenAI Chat - Sends messages directly to an OpenAI-compatible API.
 *
 * This composable bypasses the native server and communicates directly with
 * the configured OpenAI endpoint (URL + API Key + Model).
 */
import { ref, computed } from 'vue';
import type { AgentMessage, AgentStoredMessage } from 'chrome-mcp-shared';

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

    // Check if user needs browser tools but is in text-only mode or native server not running
    if (
      !config.textOnlyMode &&
      config.promptForNativeServer &&
      needsBrowserTools(instructionText)
    ) {
      // Check if native server is running
      const serverRunning = await checkNativeServerRunning();
      if (!serverRunning) {
        errorMessage.value =
          '检测到您可能需要使用浏览器扩展工具（如点击、打开网页等）。当前 Native Server 未运行，请：\\n\\n1. 启动 Native Server：cd /Users/heal/mcp-chrome/app/native-server && npm run dev\\n2. 或在设置中开启"仅文本返回模式"（仅聊天对话推荐）';
        return;
      }
    }

    // If text-only mode is enabled, add a system note to avoid tool usage
    let systemNote = '';
    if (config.textOnlyMode) {
      systemNote = '（当前为仅文本模式，无法使用浏览器工具，只能进行文本对话）';
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
      // Build request body
      const requestBody: any = {
        model: config.model,
        messages: apiMessages,
        stream: false,
      };

      // Add system note for text-only mode
      if (systemNote) {
        requestBody.messages = [{ role: 'system', content: systemNote }, ...apiMessages];
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

      const assistantContent = data.choices?.[0]?.message?.content ?? '';
      const assistantMessageId = data.id || `resp-${Date.now()}`;

      // Extract usage if available
      if (data.usage) {
        lastUsage.value = {
          inputTokens: data.usage.prompt_tokens ?? 0,
          outputTokens: data.usage.completion_tokens ?? 0,
          totalCostUsd: 0, // Not provided by most OpenAI-compatible APIs
          durationMs: Date.now() - startTime,
          numTurns: (lastUsage.value?.numTurns ?? 0) + 1,
        };
      }

      // Add assistant response
      const assistantMsg: AgentMessage = openAiToAgentMessage(
        assistantMessageId,
        sessionId,
        'assistant',
        assistantContent,
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
