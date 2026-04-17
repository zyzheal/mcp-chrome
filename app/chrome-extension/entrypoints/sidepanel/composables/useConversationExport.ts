import type { AgentThread, TimelineItem } from './useAgentThreads';

// =============================================================================
// Types
// =============================================================================

export type ExportFormat = 'markdown' | 'html' | 'docx' | 'pdf';

export interface ExportOptions {
  thread: AgentThread;
  fileName?: string;
  includeToolCalls?: boolean;
  includeTimestamps?: boolean;
}

// =============================================================================
// Helpers
// =============================================================================

function formatTimestamp(iso: string, include: boolean): string {
  if (!include) return '';
  const d = new Date(iso);
  return ` (${d.toLocaleTimeString()})`;
}

/**
 * Filter out internal MCP tool calls that should not appear in exports.
 */
const MCP_TOOL_PREFIXES = ['mcp__', 'chrome-mcp__', 'chrome_get_web_content'];

function shouldFilterTool(item: TimelineItem): boolean {
  if (item.kind !== 'tool_use' && item.kind !== 'tool_result') return false;
  const label = item.tool?.label?.toLowerCase() || '';
  const title = item.tool?.title?.toLowerCase() || '';
  return MCP_TOOL_PREFIXES.some(
    (prefix) => label.startsWith(prefix) || title.startsWith(prefix) || label.includes(prefix),
  );
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Convert markdown to HTML with proper styling.
 */
function markdownToHtml(text: string): string {
  const lines = text.split('\n');
  const result: string[] = [];
  let inCode = false;
  let lang = '';
  let codeLines: string[] = [];

  for (const line of lines) {
    const codeMatch = line.match(/^```(\w*)\s*$/);
    if (codeMatch) {
      if (inCode) {
        const code = escapeHtml(codeLines.join('\n'));
        result.push(
          `<pre style="background:#1e1e1e;color:#d4d4d4;padding:12px;border-radius:6px;overflow-x:auto;font-family:'Fira Code',Consolas,monospace;font-size:13px;line-height:1.5;"><code class="language-${lang}">${code}</code></pre>`,
        );
        codeLines = [];
        lang = '';
        inCode = false;
      } else {
        lang = codeMatch[1] || 'text';
        inCode = true;
      }
      continue;
    }

    if (inCode) {
      codeLines.push(line);
    } else {
      // Process markdown on raw text (before HTML escaping)
      let processed = line;
      // Bold
      processed = processed.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
      // Italic
      processed = processed.replace(/\*(.+?)\*/g, '<em>$1</em>');
      // Inline code
      processed = processed.replace(
        /`(.+?)`/g,
        '<code style="background:#f0f0f0;padding:2px 5px;border-radius:3px;font-size:13px;font-family:Consolas,monospace;">$1</code>',
      );
      result.push(processed);
    }
  }

  // Handle unclosed code block
  if (inCode && codeLines.length > 0) {
    const code = escapeHtml(codeLines.join('\n'));
    result.push(
      `<pre style="background:#1e1e1e;color:#d4d4d4;padding:12px;border-radius:6px;overflow-x:auto;font-family:'Fira Code',Consolas,monospace;font-size:13px;line-height:1.5;"><code>${code}</code></pre>`,
    );
  }

  return result.join('<br>');
}

// =============================================================================
// Markdown Export
// =============================================================================

export function threadToMarkdown(
  thread: AgentThread,
  options: { includeToolCalls?: boolean; includeTimestamps?: boolean } = {},
): string {
  const { includeToolCalls = true, includeTimestamps = true } = options;
  const parts: string[] = [];

  parts.push(`# 对话记录 - ${thread.title}`);
  if (includeTimestamps) {
    parts.push(`导出时间: ${new Date().toLocaleString()}`);
  }
  parts.push('---\n');

  for (const item of thread.items) {
    if (shouldFilterTool(item)) continue;

    switch (item.kind) {
      case 'user_prompt':
        parts.push(`## 用户${formatTimestamp(item.createdAt, includeTimestamps)}\n`);
        parts.push(item.text);
        parts.push('\n---\n');
        break;

      case 'assistant_text':
        parts.push(`## 助手${formatTimestamp(item.createdAt, includeTimestamps)}\n`);
        parts.push(item.text);
        parts.push('\n---\n');
        break;

      case 'tool_use':
        if (includeToolCalls) {
          const t = item.tool;
          parts.push(`- **${t.label}** (调用) OK: ${t.title}\n`);
        }
        break;

      case 'tool_result':
        if (includeToolCalls) {
          const t = item.tool;
          const status = item.isError ? 'FAIL' : 'OK';
          const content = t.raw?.content || '';
          parts.push(
            `- **${t.label}** (结果) ${status}: ${t.title}${content ? `\n  \`\`\`\n${content.slice(0, 500)}${content.length > 500 ? '\n... (已截断)' : ''}\n  \`\`\`` : ''}\n`,
          );
        }
        break;

      case 'status':
        if (item.text) {
          parts.push(`> ${item.text}`);
          parts.push('');
        }
        break;
    }
  }

  return parts.join('\n');
}

// =============================================================================
// HTML Export
// =============================================================================

export function threadToHtml(
  thread: AgentThread,
  options: { includeToolCalls?: boolean; includeTimestamps?: boolean } = {},
): string {
  const { includeToolCalls = true, includeTimestamps = true } = options;
  const bodyParts: string[] = [];

  // Header
  bodyParts.push(`<header class="doc-header">`);
  bodyParts.push(`<h1 class="doc-title">对话记录 - ${escapeHtml(thread.title)}</h1>`);
  if (includeTimestamps) {
    bodyParts.push(`<p class="doc-time">导出时间: ${new Date().toLocaleString()}</p>`);
  }
  bodyParts.push(`</header>`);

  for (const item of thread.items) {
    if (shouldFilterTool(item)) continue;

    switch (item.kind) {
      case 'user_prompt':
        bodyParts.push(`<div class="msg-block msg-user">`);
        bodyParts.push(
          `<h3 class="msg-role">用户${includeTimestamps ? `<span class="msg-time">${formatTimestamp(item.createdAt, true)}</span>` : ''}</h3>`,
        );
        bodyParts.push(`<div class="msg-content markdown-body">${markdownToHtml(item.text)}</div>`);
        bodyParts.push(`</div>`);
        break;

      case 'assistant_text':
        bodyParts.push(`<div class="msg-block msg-assistant">`);
        bodyParts.push(
          `<h3 class="msg-role">助手${includeTimestamps ? `<span class="msg-time">${formatTimestamp(item.createdAt, true)}</span>` : ''}</h3>`,
        );
        bodyParts.push(`<div class="msg-content markdown-body">${markdownToHtml(item.text)}</div>`);
        bodyParts.push(`</div>`);
        break;

      case 'tool_use':
        if (includeToolCalls) {
          const t = item.tool;
          bodyParts.push(`<div class="tool-call">`);
          bodyParts.push(
            `<span class="tool-label">${escapeHtml(t.label)}</span> &rarr; ${escapeHtml(t.title)}`,
          );
          bodyParts.push(`</div>`);
        }
        break;

      case 'tool_result':
        if (includeToolCalls) {
          const t = item.tool;
          const isError = item.isError;
          const content = t.raw?.content || '';
          bodyParts.push(`<div class="tool-result ${isError ? 'tool-error' : ''}">`);
          bodyParts.push(
            `<span class="tool-label">${escapeHtml(t.label)}</span> 结果 <strong>${isError ? 'FAIL' : 'OK'}</strong> &rarr; ${escapeHtml(t.title)}`,
          );
          if (content) {
            bodyParts.push(
              `<pre class="tool-code">${escapeHtml(content.length > 500 ? content.slice(0, 500) + '... (已截断)' : content)}</pre>`,
            );
          }
          bodyParts.push(`</div>`);
        }
        break;

      case 'status':
        if (item.text) {
          bodyParts.push(`<div class="status-msg">${escapeHtml(item.text)}</div>`);
        }
        break;
    }
  }

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>对话记录 - ${escapeHtml(thread.title)}</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'PingFang SC', 'Microsoft YaHei', sans-serif;
    max-width: 800px;
    margin: 0 auto;
    padding: 40px 20px;
    background: #fafafa;
    color: #1a1a1a;
    line-height: 1.6;
  }
  @media print { body { padding: 16px; background: #fff; } }

  .doc-header {
    margin-bottom: 32px;
    padding-bottom: 20px;
    border-bottom: 2px solid #e0e0e0;
  }
  .doc-title {
    font-size: 26px;
    font-weight: 700;
    color: #111;
    margin-bottom: 6px;
  }
  .doc-time { font-size: 13px; color: #888; }

  .msg-block {
    margin-bottom: 24px;
    padding: 16px 20px;
    border-radius: 12px;
    background: #fff;
    box-shadow: 0 1px 3px rgba(0,0,0,0.06);
  }
  .msg-user { border-left: 4px solid #2563eb; }
  .msg-assistant { border-left: 4px solid #059669; }

  .msg-role {
    font-size: 15px;
    font-weight: 600;
    margin-bottom: 10px;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .msg-user .msg-role { color: #2563eb; }
  .msg-assistant .msg-role { color: #059669; }
  .msg-time { font-weight: 400; font-size: 12px; color: #888; }

  .msg-content {
    font-size: 14px;
    line-height: 1.7;
    color: #333;
  }
  .msg-content strong { font-weight: 600; }
  .msg-content em { font-style: italic; color: #555; }

  .tool-call {
    margin: 8px 0 8px 20px;
    padding: 8px 12px;
    background: #f8f9fa;
    border-radius: 6px;
    border-left: 3px solid #6366f1;
    font-size: 13px;
    color: #555;
  }
  .tool-label { font-weight: 600; color: #6366f1; }

  .tool-result {
    margin: 8px 0 8px 20px;
    padding: 8px 12px;
    border-radius: 6px;
    border-left: 3px solid #22c55e;
    font-size: 13px;
    background: #f0fdf4;
  }
  .tool-result.tool-error { border-left-color: #ef4444; background: #fef2f2; }
  .tool-code {
    margin-top: 8px;
    max-height: 200px;
    overflow: auto;
    background: #1e1e1e;
    color: #d4d4d4;
    padding: 10px;
    border-radius: 6px;
    font-family: 'Fira Code', Consolas, monospace;
    font-size: 12px;
    line-height: 1.4;
  }

  .status-msg {
    margin: 6px 0;
    font-size: 12px;
    color: #888;
    font-style: italic;
    padding-left: 8px;
  }

  pre code, .tool-code { white-space: pre-wrap; word-break: break-word; }
</style>
</head>
<body>
${bodyParts.join('\n')}
</body>
</html>`;
}

// =============================================================================
// DOCX Export (native ZIP + OOXML, no external dependency)
// =============================================================================

/**
 * Create a valid ZIP archive for OOXML DOCX.
 * Uses DeflateRaw (no zlib header) for compatibility with Word.
 */
async function createDocxZip(files: Record<string, Uint8Array>): Promise<Blob> {
  const localHeaders: Uint8Array[] = [];
  const centralHeaders: Uint8Array[] = [];
  let centralDirOffset = 0;
  const fileEntries = Object.entries(files);

  // CRC32 lookup table
  const crcTable = (() => {
    const table: number[] = [];
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let j = 0; j < 8; j++) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      table[i] = c;
    }
    return table;
  })();

  function crc32(data: Uint8Array): number {
    let crc = 0xffffffff;
    for (const byte of data) {
      crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 0xff];
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  const dosDate = 0x0021; // Jan 1, 1980
  const dosTime = 0x0000;

  for (const [name, contentBytes] of fileEntries) {
    const encoder = new TextEncoder();
    const filenameBytes = encoder.encode(name);

    // Compress with deflate (raw, no zlib header)
    // Use CompressionStream with deflate-raw for Office compatibility
    const cs = new CompressionStream('deflate-raw');
    const writer = cs.writable.getWriter();
    writer.write(contentBytes);
    writer.close();
    const reader = cs.readable.getReader();
    const chunks: Uint8Array[] = [];
    let totalSize = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      totalSize += value.length;
    }

    let compressedData: Uint8Array;
    if (chunks.length === 0) {
      compressedData = new Uint8Array(0);
    } else if (chunks.length === 1) {
      compressedData = chunks[0];
    } else {
      compressedData = new Uint8Array(totalSize);
      let offset = 0;
      for (const chunk of chunks) {
        compressedData.set(chunk, offset);
        offset += chunk.length;
      }
    }

    const crc = crc32(contentBytes);
    const compressedSize = compressedData.length;
    const uncompressedSize = contentBytes.length;
    const filenameLength = filenameBytes.length;

    // General purpose bit 11 = UTF-8 filename (bit 11 = 0x800)
    const generalPurposeFlag = 0x800;

    // Local file header
    const localHeader = new Uint8Array(30 + filenameLength + compressedSize);
    const lv = new DataView(localHeader.buffer, localHeader.byteOffset, localHeader.byteLength);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, generalPurposeFlag, true);
    lv.setUint16(8, 8, true); // deflate
    lv.setUint16(10, dosTime, true);
    lv.setUint16(12, dosDate, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, compressedSize, true);
    lv.setUint32(22, uncompressedSize, true);
    lv.setUint16(26, filenameLength, true);
    lv.setUint16(28, 0, true);
    localHeader.set(filenameBytes, 30);
    localHeader.set(compressedData, 30 + filenameLength);
    localHeaders.push(localHeader);

    // Central directory header
    const centralHeader = new Uint8Array(46 + filenameLength);
    const cv = new DataView(
      centralHeader.buffer,
      centralHeader.byteOffset,
      centralHeader.byteLength,
    );
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, generalPurposeFlag, true);
    cv.setUint16(10, 8, true);
    cv.setUint16(12, dosTime, true);
    cv.setUint16(14, dosDate, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, compressedSize, true);
    cv.setUint32(24, uncompressedSize, true);
    cv.setUint16(28, filenameLength, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, centralDirOffset, true);
    centralHeader.set(filenameBytes, 46);
    centralHeaders.push(centralHeader);

    centralDirOffset += localHeader.length;
  }

  const centralDirSize = centralHeaders.reduce((sum, h) => sum + h.length, 0);

  // End of central directory
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer, eocd.byteOffset, eocd.byteLength);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, fileEntries.length, true);
  ev.setUint16(10, fileEntries.length, true);
  ev.setUint32(12, centralDirSize, true);
  ev.setUint32(16, centralDirOffset, true);
  ev.setUint16(20, 0, true);
  localHeaders.push(...centralHeaders, eocd);

  return new Blob(localHeaders, {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
}

/** Escape XML special characters. */
function xmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Build OOXML paragraphs with CJK font support. */
function buildOoxmlParagraphs(text: string): string {
  const blocks = text.split(/\n\n+/);
  let result = '';

  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;

    const codeMatch = trimmed.match(/^```(\w*)\n([\s\S]*?)```$/m);
    if (codeMatch) {
      const codeText = xmlEscape(codeMatch[2].trim());
      result += `<w:p><w:pPr><w:shd w:val="clear" w:color="F5F5F5" w:fill="F5F5F5"/><w:spacing w:before="100" w:after="100"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:eastAsia="Consolas" w:cs="Consolas"/><w:sz w:val="18"/><w:color w:val="333333"/></w:rPr><w:t xml:space="preserve">${codeText}</w:t></w:r></w:p>`;
    } else {
      const lines = trimmed.split('\n');
      const runs = lines
        .map(
          (line) =>
            `<w:r><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Microsoft YaHei" w:cs="Arial"/><w:sz w:val="22"/></w:rPr><w:t xml:space="preserve">${xmlEscape(line)}</w:t></w:r>`,
        )
        .join('');
      result += `<w:p><w:pPr><w:spacing w:after="120"/></w:pPr>${runs}</w:p>`;
    }
  }

  return result;
}

export async function threadToDocx(
  thread: AgentThread,
  options: { includeToolCalls?: boolean; includeTimestamps?: boolean } = {},
): Promise<Blob> {
  const { includeToolCalls = true, includeTimestamps = true } = options;
  let bodyXml = '';

  // Title
  bodyXml += `<w:p><w:pPr><w:outlineLvl w:val="0"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="28"/><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Microsoft YaHei" w:cs="Arial"/></w:rPr><w:t xml:space="preserve">对话记录 - ${xmlEscape(thread.title)}</w:t></w:r></w:p>`;

  if (includeTimestamps) {
    bodyXml += `<w:p><w:pPr><w:spacing w:after="200"/></w:pPr><w:r><w:rPr><w:i/><w:sz w:val="18"/><w:color w:val="888888"/><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Microsoft YaHei" w:cs="Arial"/></w:rPr><w:t xml:space="preserve">导出时间: ${xmlEscape(new Date().toLocaleString())}</w:t></w:r></w:p>`;
  }

  // Separator
  bodyXml += `<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="4" w:space="1" w:color="E0E0E0"/></w:pBdr><w:spacing w:after="200"/></w:pPr></w:p>`;

  // Items
  for (const item of thread.items) {
    if (shouldFilterTool(item)) continue;

    switch (item.kind) {
      case 'user_prompt':
        bodyXml += `<w:p><w:pPr><w:outlineLvl w:val="1"/><w:spacing w:before="200" w:after="100"/></w:pPr><w:r><w:rPr><w:b/><w:color w:val="2563EB"/><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Microsoft YaHei" w:cs="Arial"/></w:rPr><w:t xml:space="preserve">用户</w:t></w:r>`;
        if (includeTimestamps) {
          bodyXml += `<w:r><w:rPr><w:i/><w:sz w:val="18"/><w:color w:val="888888"/><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Microsoft YaHei" w:cs="Arial"/></w:rPr><w:t xml:space="preserve">${xmlEscape(formatTimestamp(item.createdAt, true))}</w:t></w:r>`;
        }
        bodyXml += `</w:p>`;
        bodyXml += buildOoxmlParagraphs(item.text);
        break;

      case 'assistant_text':
        bodyXml += `<w:p><w:pPr><w:outlineLvl w:val="1"/><w:spacing w:before="200" w:after="100"/></w:pPr><w:r><w:rPr><w:b/><w:color w:val="059669"/><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Microsoft YaHei" w:cs="Arial"/></w:rPr><w:t xml:space="preserve">助手</w:t></w:r>`;
        if (includeTimestamps) {
          bodyXml += `<w:r><w:rPr><w:i/><w:sz w:val="18"/><w:color w:val="888888"/><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Microsoft YaHei" w:cs="Arial"/></w:rPr><w:t xml:space="preserve">${xmlEscape(formatTimestamp(item.createdAt, true))}</w:t></w:r>`;
        }
        bodyXml += `</w:p>`;
        bodyXml += buildOoxmlParagraphs(item.text);
        break;

      case 'tool_use':
        if (includeToolCalls) {
          const t = item.tool;
          bodyXml += `<w:p><w:pPr><w:spacing w:before="80" w:after="40"/><w:ind w:left="360"/></w:pPr><w:r><w:rPr><w:b/><w:color w:val="6366F1"/><w:sz w:val="20"/><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Microsoft YaHei" w:cs="Arial"/></w:rPr><w:t xml:space="preserve">[${xmlEscape(t.label)}] ${xmlEscape(t.title)}</w:t></w:r></w:p>`;
        }
        break;

      case 'tool_result':
        if (includeToolCalls) {
          const t = item.tool;
          const isError = item.isError;
          const content = t.raw?.content || '';
          bodyXml += `<w:p><w:pPr><w:spacing w:before="80" w:after="40"/><w:ind w:left="360"/></w:pPr><w:r><w:rPr><w:b/><w:color w:val="${isError ? 'EF4444' : '22C55E'}"/><w:sz w:val="20"/><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Microsoft YaHei" w:cs="Arial"/></w:rPr><w:t xml:space="preserve">[${xmlEscape(t.label)}] 结果 ${isError ? 'FAIL' : 'OK'} -&gt; ${xmlEscape(t.title)}</w:t></w:r></w:p>`;
          if (content) {
            const truncated =
              content.length > 500 ? content.slice(0, 500) + '... (已截断)' : content;
            bodyXml += `<w:p><w:pPr><w:ind w:left="720"/><w:spacing w:after="80"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:eastAsia="Consolas" w:cs="Consolas"/><w:sz w:val="18"/><w:color w:val="666666"/></w:rPr><w:t xml:space="preserve">${xmlEscape(truncated)}</w:t></w:r></w:p>`;
          }
        }
        break;
    }

    if (item.kind === 'user_prompt' || item.kind === 'assistant_text') {
      bodyXml += `<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="2" w:space="1" w:color="F0F0F0"/></w:pBdr><w:spacing w:after="160"/></w:pPr></w:p>`;
    }
  }

  // document.xml with CJK font table
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
            xmlns:w15="http://schemas.microsoft.com/office/word/2012/wordml">
<w:body>${bodyXml}</w:body>
</w:document>`;

  // Content_Types.xml
  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

  // _rels/.rels
  const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

  // word/_rels/document.xml.rels
  const docRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
</Relationships>`;

  const encoder = new TextEncoder();
  return createDocxZip({
    '[Content_Types].xml': encoder.encode(contentTypesXml),
    '_rels/.rels': encoder.encode(relsXml),
    'word/document.xml': encoder.encode(documentXml),
    'word/_rels/document.xml.rels': encoder.encode(docRelsXml),
  });
}

// =============================================================================
// PDF Export (HTML file that opens with print-to-PDF support)
// =============================================================================

export async function threadToPdf(
  thread: AgentThread,
  options: { includeToolCalls?: boolean; includeTimestamps?: boolean } = {},
): Promise<void> {
  const { includeToolCalls = true, includeTimestamps = true } = options;

  // Generate well-styled HTML
  const htmlContent = threadToHtml(thread, { includeToolCalls, includeTimestamps });

  // Add print-ready styles with @media print rules and auto-close after print
  const printHtml = htmlContent.replace(
    '</head>',
    `<style>
  @media print {
    body { padding: 16px; background: #fff; }
    .msg-block { break-inside: avoid; }
    .no-print { display: none !important; }
  }
  @page { margin: 1.5cm; size: A4; }
</style>
<script>
  // Auto-trigger print dialog
  window.onload = function() {
    window.print();
    // Close tab after print dialog is dismissed
    window.addEventListener('afterprint', function() {
      // Try to close the tab (works for extension-created tabs)
      window.close();
      // Fallback: navigate away
      setTimeout(function() { window.location.href = 'about:blank'; }, 100);
    });
    // Safety timeout: if afterprint doesn't fire, close after 5 minutes
    setTimeout(function() {
      if (!document.hasFocus()) window.close();
    }, 300000);
  };
</script>
</head>`,
  );

  // Open a blank tab and write content directly (no blob URL visible)
  const printTab = window.open('about:blank', '_blank');
  if (!printTab) {
    throw new Error('弹窗被阻止，请允许弹窗后重试');
  }

  printTab.document.open();
  printTab.document.write(printHtml);
  printTab.document.close();
}

// =============================================================================
// Blob Download
// =============================================================================

/**
 * Trigger a file download from a Blob.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// =============================================================================
// Composable
// =============================================================================

/**
 * Composable for exporting conversation threads.
 */
export function useConversationExport() {
  async function exportThread(
    thread: AgentThread,
    format: ExportFormat,
    options: { includeToolCalls?: boolean; includeTimestamps?: boolean } = {},
  ): Promise<void> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const baseName = `conversation-${thread.title.slice(0, 30).replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g, '-')}-${timestamp}`;

    switch (format) {
      case 'markdown': {
        const md = threadToMarkdown(thread, options);
        const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
        downloadBlob(blob, `${baseName}.md`);
        break;
      }
      case 'html': {
        const html = threadToHtml(thread, options);
        const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
        downloadBlob(blob, `${baseName}.html`);
        break;
      }
      case 'docx': {
        const blob = await threadToDocx(thread, options);
        downloadBlob(blob, `${baseName}.docx`);
        break;
      }
      case 'pdf': {
        // PDF opens a print-ready HTML tab. User selects "Save as PDF" in print dialog.
        await threadToPdf(thread, options);
        break;
      }
    }
  }

  return {
    exportThread,
    threadToMarkdown,
    threadToHtml,
    threadToDocx,
    threadToPdf,
  };
}
