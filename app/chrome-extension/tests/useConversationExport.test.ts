import { describe, it, expect, vi } from 'vitest';
import type { AgentThread } from '@/entrypoints/sidepanel/composables/useAgentThreads';
import {
  threadToMarkdown,
  threadToHtml,
  downloadBlob,
  useConversationExport,
} from '@/entrypoints/sidepanel/composables/useConversationExport';

// Mock thread for testing
function createMockThread(): AgentThread {
  return {
    id: 'test-thread-1',
    requestId: 'req-1',
    title: '测试对话',
    createdAt: '2026-04-17T10:00:00Z',
    state: 'completed',
    attachments: [],
    items: [
      {
        kind: 'user_prompt',
        id: 'msg-1',
        requestId: 'req-1',
        createdAt: '2026-04-17T10:00:01Z',
        messageId: 'msg-1',
        text: '请帮我写一个快速排序函数',
        attachments: [],
      },
      {
        kind: 'assistant_text',
        id: 'msg-2',
        requestId: 'req-1',
        createdAt: '2026-04-17T10:00:02Z',
        messageId: 'msg-2',
        text: '好的，这是一个 TypeScript 实现的快速排序：\n\n```typescript\nfunction quickSort<T>(arr: T[]): T[] {\n  if (arr.length <= 1) return arr;\n  const pivot = arr[Math.floor(arr.length / 2)];\n  return [\n    ...quickSort(arr.filter(x => x < pivot)),\n    ...arr.filter(x => x === pivot),\n    ...quickSort(arr.filter(x => x > pivot)),\n  ];\n}\n```\n\n这个实现使用了 TypeScript 泛型。',
        isStreaming: false,
      },
    ],
    header: undefined,
  };
}

describe('threadToMarkdown', () => {
  it('should generate markdown with user and assistant messages', () => {
    const thread = createMockThread();
    const md = threadToMarkdown(thread);

    expect(md).toContain('# 对话记录 - 测试对话');
    expect(md).toContain('## 用户');
    expect(md).toContain('请帮我写一个快速排序函数');
    expect(md).toContain('## 助手');
    expect(md).toContain('TypeScript 实现的快速排序');
  });

  it('should preserve code blocks in markdown', () => {
    const thread = createMockThread();
    const md = threadToMarkdown(thread);

    expect(md).toContain('```typescript');
    expect(md).toContain('function quickSort');
  });

  it('should exclude tool calls when disabled', () => {
    const thread: AgentThread = {
      ...createMockThread(),
      items: [
        ...createMockThread().items,
        {
          kind: 'tool_use',
          id: 'tool-1',
          requestId: 'req-1',
          createdAt: '2026-04-17T10:00:03Z',
          messageId: 'msg-2',
          tool: {
            kind: 'generic',
            label: 'Run',
            title: 'npm test',
            severity: 'info',
            phase: 'use',
            raw: { content: 'Running tests...' },
          },
          isStreaming: false,
        },
      ],
    };

    const mdWithTools = threadToMarkdown(thread, { includeToolCalls: true });
    const mdNoTools = threadToMarkdown(thread, { includeToolCalls: false });

    expect(mdWithTools).toContain('**Run**');
    expect(mdNoTools).not.toContain('**Run**');
  });

  it('should exclude timestamps when disabled', () => {
    const thread = createMockThread();
    const mdWithTs = threadToMarkdown(thread, { includeTimestamps: true });
    const mdNoTs = threadToMarkdown(thread, { includeTimestamps: false });

    // With timestamps should have the formatTimestamp output
    expect(mdWithTs).toMatch(/\(\d{1,2}:\d{2}:\d{2}/);
    expect(mdNoTs).not.toMatch(/\(\d{1,2}:\d{2}:\d{2}/);
  });
});

describe('threadToHtml', () => {
  it('should generate valid HTML document', () => {
    const thread = createMockThread();
    const html = threadToHtml(thread);

    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<html lang="zh-CN">');
    expect(html).toContain('对话记录 - 测试对话');
    expect(html).toContain('用户');
    expect(html).toContain('助手');
  });

  it('should escape HTML in content', () => {
    const thread: AgentThread = {
      ...createMockThread(),
      items: [
        {
          kind: 'user_prompt',
          id: 'msg-xss',
          requestId: 'req-1',
          createdAt: '2026-04-17T10:00:01Z',
          messageId: 'msg-xss',
          text: '<script>alert("xss")</script>',
          attachments: [],
        },
      ],
    };

    const html = threadToHtml(thread);
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>alert');
  });

  it('should render code blocks with styling', () => {
    const thread = createMockThread();
    const html = threadToHtml(thread);

    expect(html).toContain('language-typescript');
    expect(html).toContain('background:#1e1e1e');
  });

  it('should include tool call styling when enabled', () => {
    const thread: AgentThread = {
      ...createMockThread(),
      items: [
        ...createMockThread().items,
        {
          kind: 'tool_result',
          id: 'tool-res-1',
          requestId: 'req-1',
          createdAt: '2026-04-17T10:00:04Z',
          messageId: 'msg-2',
          tool: {
            kind: 'generic',
            label: 'Run',
            title: 'Tests passed',
            severity: 'success',
            phase: 'result',
            raw: { content: 'All tests passed.' },
          },
          isError: false,
        },
      ],
    };

    const html = threadToHtml(thread, { includeToolCalls: true });
    expect(html).toContain('#22c55e'); // green color for success
    expect(html).toContain('OK');
  });
});

describe('downloadBlob', () => {
  it('should not throw with valid blob and filename', () => {
    // Mock URL.createObjectURL (not available in jsdom)
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn().mockReturnValue('blob:mock-url'),
      revokeObjectURL: vi.fn(),
    });

    const blob = new Blob(['test'], { type: 'text/plain' });
    expect(() => downloadBlob(blob, 'test.txt')).not.toThrow();

    vi.unstubAllGlobals();
  });
});

describe('useConversationExport', () => {
  it('should return export functions', () => {
    const { exportThread, threadToMarkdown, threadToHtml, threadToDocx, threadToPdf } =
      useConversationExport();

    expect(typeof exportThread).toBe('function');
    expect(typeof threadToMarkdown).toBe('function');
    expect(typeof threadToHtml).toBe('function');
    expect(typeof threadToDocx).toBe('function');
    expect(typeof threadToPdf).toBe('function');
  });

  it('should export markdown without error', async () => {
    // Mock URL.createObjectURL (not available in jsdom)
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn().mockReturnValue('blob:mock-url'),
      revokeObjectURL: vi.fn(),
    });

    const { exportThread } = useConversationExport();
    const thread = createMockThread();

    // Mock document methods for download
    const mockAnchor = {
      href: '',
      download: '',
      click: vi.fn(),
    } as unknown as HTMLAnchorElement;
    vi.spyOn(document, 'createElement').mockReturnValue(mockAnchor);
    vi.spyOn(document.body, 'appendChild').mockReturnValue(mockAnchor);
    vi.spyOn(document.body, 'removeChild').mockReturnValue(mockAnchor);

    await exportThread(thread, 'markdown', {
      includeToolCalls: true,
      includeTimestamps: true,
    });

    expect(mockAnchor.download).toMatch(/\.md$/);

    vi.unstubAllGlobals();
  });

  it('should export HTML without error', async () => {
    // Mock URL.createObjectURL (not available in jsdom)
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn().mockReturnValue('blob:mock-url'),
      revokeObjectURL: vi.fn(),
    });

    const { exportThread } = useConversationExport();
    const thread = createMockThread();

    const mockAnchor = {
      href: '',
      download: '',
      click: vi.fn(),
    } as unknown as HTMLAnchorElement;
    vi.spyOn(document, 'createElement').mockReturnValue(mockAnchor);
    vi.spyOn(document.body, 'appendChild').mockReturnValue(mockAnchor);
    vi.spyOn(document.body, 'removeChild').mockReturnValue(mockAnchor);

    await exportThread(thread, 'html', {
      includeToolCalls: true,
      includeTimestamps: true,
    });

    expect(mockAnchor.download).toMatch(/\.html$/);

    vi.unstubAllGlobals();
  });
});
