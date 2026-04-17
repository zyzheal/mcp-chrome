import type { AgentThread, TimelineItem } from './useAgentThreads';
import { Document, Packer, Paragraph, TextRun, HeadingLevel, BorderStyle } from 'docx';
import { PDFDocument, StandardFonts, rgb, type RGB } from '@cantoo/pdf-lib';

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
 * Extract text content from a timeline item for export.
 * Truncates long content to avoid oversized exports.
 */
function extractText(item: TimelineItem, maxLength = 2000): string {
  switch (item.kind) {
    case 'user_prompt':
      return item.text;
    case 'assistant_text':
      return item.text;
    case 'tool_use': {
      const t = item.tool;
      return `[${t.label}] ${t.title}${t.command ? `: ${t.command}` : ''}`;
    }
    case 'tool_result': {
      const t = item.tool;
      const content = t.raw?.content || '';
      const truncated =
        content.length > maxLength ? content.slice(0, maxLength) + '... (truncated)' : content;
      return `[${t.label}] ${t.title}${t.severity === 'error' ? ' ERROR' : ' OK'}\n${truncated}`;
    }
    case 'status':
      return item.text || item.status;
    default:
      return '';
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Convert markdown code blocks to HTML.
 * Simple implementation: detects ```lang ... ``` blocks.
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
        // Close code block
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
      // Process inline markdown
      let html = escapeHtml(line);
      // Bold
      html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
      // Italic
      html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
      // Inline code
      html = html.replace(
        /`(.+?)`/g,
        '<code style="background:#f0f0f0;padding:2px 5px;border-radius:3px;font-size:13px;">$1</code>',
      );
      result.push(html);
    }
  }

  // Handle unclosed code block
  if (inCode && codeLines.length > 0) {
    const code = escapeHtml(codeLines.join('\n'));
    result.push(
      `<pre style="background:#1e1e1e;color:#d4d4d4;padding:12px;border-radius:6px;overflow-x:auto;font-family:'Fira Code',Consolas,monospace;font-size:13px;line-height:1.5;"><code>${code}</code></pre>`,
    );
  }

  return result.join('\n');
}

function getToolCallSection(
  item: TimelineItem,
  includeToolCalls: boolean,
  includeTimestamps: boolean,
): string {
  if (item.kind !== 'tool_use' && item.kind !== 'tool_result') return '';
  if (!includeToolCalls) return '';

  const t = item.tool;
  const statusEmoji = item.kind === 'tool_result' && item.isError ? 'FAIL' : 'OK';
  const phase = item.kind === 'tool_use' ? '调用' : '结果';

  return `- **${t.label}** (${phase}) ${statusEmoji}: ${t.title}\n${item.kind === 'tool_result' && t.raw?.content ? `  \`\`\`\n${t.raw.content.slice(0, 500)}${t.raw.content.length > 500 ? '\n... (已截断)' : ''}\n  \`\`\`` : ''}\n`;
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
          parts.push(getToolCallSection(item, true, includeTimestamps));
        }
        break;

      case 'tool_result':
        if (includeToolCalls) {
          parts.push(getToolCallSection(item, true, includeTimestamps));
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
  bodyParts.push(
    `<h1 style="font-size:24px;margin-bottom:4px;">对话记录 - ${escapeHtml(thread.title)}</h1>`,
  );
  if (includeTimestamps) {
    bodyParts.push(
      `<p style="color:#888;font-size:13px;margin-bottom:24px;">导出时间: ${new Date().toLocaleString()}</p>`,
    );
  }
  bodyParts.push('<hr style="border:none;border-top:1px solid #e0e0e0;margin-bottom:24px;">');

  for (const item of thread.items) {
    switch (item.kind) {
      case 'user_prompt':
        bodyParts.push(`<div style="margin-bottom:20px;">`);
        bodyParts.push(
          `<h3 style="color:#2563eb;margin-bottom:8px;font-size:16px;">用户${includeTimestamps ? `<span style="color:#888;font-weight:normal;font-size:12px;">${formatTimestamp(item.createdAt, true)}</span>` : ''}</h3>`,
        );
        bodyParts.push(
          `<div style="line-height:1.7;color:#333;">${markdownToHtml(item.text)}</div>`,
        );
        bodyParts.push(`</div>`);
        break;

      case 'assistant_text':
        bodyParts.push(`<div style="margin-bottom:20px;">`);
        bodyParts.push(
          `<h3 style="color:#059669;margin-bottom:8px;font-size:16px;">助手${includeTimestamps ? `<span style="color:#888;font-weight:normal;font-size:12px;">${formatTimestamp(item.createdAt, true)}</span>` : ''}</h3>`,
        );
        bodyParts.push(
          `<div style="line-height:1.7;color:#333;">${markdownToHtml(item.text)}</div>`,
        );
        bodyParts.push(`</div>`);
        break;

      case 'tool_use':
        if (includeToolCalls) {
          const t = item.tool;
          bodyParts.push(
            `<div style="margin:8px 0;padding:8px 12px;background:#f8f9fa;border-radius:6px;border-left:3px solid #6366f1;font-size:13px;color:#555;">`,
          );
          bodyParts.push(
            `<strong style="color:#6366f1;">${t.label}</strong> &rarr; ${escapeHtml(t.title)}`,
          );
          bodyParts.push(`</div>`);
        }
        break;

      case 'tool_result':
        if (includeToolCalls) {
          const t = item.tool;
          const isError = item.isError;
          const content = t.raw?.content || '';
          bodyParts.push(
            `<div style="margin:8px 0;padding:8px 12px;background:${isError ? '#fef2f2' : '#f0fdf4'};border-radius:6px;border-left:3px solid ${isError ? '#ef4444' : '#22c55e'};font-size:13px;">`,
          );
          bodyParts.push(
            `<strong style="color:${isError ? '#ef4444' : '#22c55e'};">${t.label} 结果 ${isError ? 'FAIL' : 'OK'}</strong> &rarr; ${escapeHtml(t.title)}`,
          );
          if (content) {
            bodyParts.push(
              `<pre style="margin-top:6px;max-height:200px;overflow:auto;background:#1e1e1e;color:#d4d4d4;padding:8px;border-radius:4px;font-size:12px;">${escapeHtml(content.length > 500 ? content.slice(0, 500) + '... (已截断)' : content)}</pre>`,
            );
          }
          bodyParts.push(`</div>`);
        }
        break;

      case 'status':
        if (item.text) {
          bodyParts.push(
            `<div style="margin:4px 0;font-size:12px;color:#888;font-style:italic;">${escapeHtml(item.text)}</div>`,
          );
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
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 800px; margin: 0 auto; padding: 32px 16px; background: #fff; color: #333; line-height: 1.6; }
  @media print { body { padding: 16px; } }
</style>
</head>
<body>
${bodyParts.join('\n')}
</body>
</html>`;
}

// =============================================================================
// DOCX Export
// =============================================================================

/**
 * Convert text content to DOCX paragraphs.
 * Preserves code blocks and basic formatting.
 */
function textToDocxParagraphs(text: string): Paragraph[] {
  const paragraphs: Paragraph[] = [];

  // Split by double newlines for paragraph breaks
  const blocks = text.split(/\n\n+/);

  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;

    // Check if it's a code block
    const codeMatch = trimmed.match(/^```(\w*)\n([\s\S]*?)```$/m);
    if (codeMatch) {
      paragraphs.push(
        new Paragraph({
          children: [
            new TextRun({
              text: codeMatch[2].trim(),
              font: 'Consolas',
              size: 18,
              color: '333333',
            }),
          ],
          spacing: { before: 100, after: 100 },
          shading: {
            type: 'clear',
            color: 'F5F5F5',
            fill: 'F5F5F5',
          },
        }),
      );
    } else {
      // Regular text - split by single newlines
      const lines = trimmed.split('\n');
      paragraphs.push(
        new Paragraph({
          children: lines.map(
            (line) =>
              new TextRun({
                text: line,
                size: 22,
              }),
          ),
          spacing: { after: 120 },
        }),
      );
    }
  }

  return paragraphs;
}

export async function threadToDocx(
  thread: AgentThread,
  options: { includeToolCalls?: boolean; includeTimestamps?: boolean } = {},
): Promise<Blob> {
  const { includeToolCalls = true, includeTimestamps = true } = options;
  const children: Paragraph[] = [];

  // Title
  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun(`对话记录 - ${thread.title}`)],
      spacing: { after: 100 },
    }),
  );

  if (includeTimestamps) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: `导出时间: ${new Date().toLocaleString()}`,
            italics: true,
            size: 18,
            color: '888888',
          }),
        ],
        spacing: { after: 200 },
      }),
    );
  }

  // Separator
  children.push(
    new Paragraph({
      border: {
        bottom: { style: BorderStyle.SINGLE, size: 4, space: 1, color: 'E0E0E0' },
      },
      spacing: { after: 200 },
    }),
  );

  // Items
  for (const item of thread.items) {
    switch (item.kind) {
      case 'user_prompt':
        children.push(
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            children: [
              new TextRun({ text: '用户', bold: true, color: '2563EB' }),
              ...(includeTimestamps
                ? [
                    new TextRun({
                      text: formatTimestamp(item.createdAt, true),
                      italics: true,
                      size: 18,
                      color: '888888',
                    }),
                  ]
                : []),
            ],
            spacing: { before: 200, after: 100 },
          }),
        );
        children.push(...textToDocxParagraphs(item.text));
        break;

      case 'assistant_text':
        children.push(
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            children: [
              new TextRun({ text: '助手', bold: true, color: '059669' }),
              ...(includeTimestamps
                ? [
                    new TextRun({
                      text: formatTimestamp(item.createdAt, true),
                      italics: true,
                      size: 18,
                      color: '888888',
                    }),
                  ]
                : []),
            ],
            spacing: { before: 200, after: 100 },
          }),
        );
        children.push(...textToDocxParagraphs(item.text));
        break;

      case 'tool_use':
        if (includeToolCalls) {
          const t = item.tool;
          children.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: `[${t.label}] ${t.title}`,
                  bold: true,
                  color: '6366F1',
                  size: 20,
                }),
              ],
              spacing: { before: 80, after: 40 },
              indent: { left: 360 },
            }),
          );
        }
        break;

      case 'tool_result':
        if (includeToolCalls) {
          const t = item.tool;
          const isError = item.isError;
          const content = t.raw?.content || '';
          children.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: `[${t.label}] 结果 ${isError ? 'FAIL' : 'OK'} -> ${t.title}`,
                  bold: true,
                  color: isError ? 'EF4444' : '22C55E',
                  size: 20,
                }),
              ],
              spacing: { before: 80, after: 40 },
              indent: { left: 360 },
            }),
          );
          if (content) {
            children.push(
              new Paragraph({
                children: [
                  new TextRun({
                    text: content.length > 500 ? content.slice(0, 500) + '... (已截断)' : content,
                    font: 'Consolas',
                    size: 18,
                    color: '666666',
                  }),
                ],
                indent: { left: 720 },
                spacing: { after: 80 },
              }),
            );
          }
        }
        break;
    }

    // Separator between items
    if (item.kind === 'user_prompt' || item.kind === 'assistant_text') {
      children.push(
        new Paragraph({
          border: {
            bottom: { style: BorderStyle.SINGLE, size: 2, space: 1, color: 'F0F0F0' },
          },
          spacing: { after: 160 },
        }),
      );
    }
  }

  const doc = new Document({
    sections: [
      {
        properties: {},
        children,
      },
    ],
  });

  return await Packer.toBlob(doc);
}

// =============================================================================
// PDF Export
// =============================================================================

export async function threadToPdf(
  thread: AgentThread,
  options: { includeToolCalls?: boolean; includeTimestamps?: boolean } = {},
): Promise<Blob> {
  const { includeToolCalls = true, includeTimestamps = true } = options;

  const pdfDoc = await PDFDocument.create();
  const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const courierFont = await pdfDoc.embedFont(StandardFonts.Courier);

  const pageWidth = 595; // A4 width
  const pageHeight = 842; // A4 height
  const margin = 50;
  const contentWidth = pageWidth - margin * 2;

  let page = pdfDoc.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;

  function checkSpace(needed: number): void {
    if (y - needed < margin) {
      page = pdfDoc.addPage([pageWidth, pageHeight]);
      y = pageHeight - margin;
    }
  }

  function drawText(
    text: string,
    font: typeof helveticaFont,
    size: number,
    color: RGB = rgb(0.2, 0.2, 0.2),
  ): void {
    checkSpace(size + 4);
    page.drawText(text, {
      x: margin,
      y: y - size,
      size,
      font,
      color,
    });
    y -= size + 4;
  }

  function drawWrappedText(
    text: string,
    font: typeof helveticaFont,
    size: number,
    color: RGB = rgb(0.2, 0.2, 0.2),
  ): void {
    const lines = wrapText(text, contentWidth, font, size);
    for (const line of lines) {
      drawText(line, font, size, color);
    }
  }

  function drawCodeBlock(text: string): void {
    const lines = text.split('\n');
    checkSpace(lines.length * 14 + 16);

    // Background
    page.drawRectangle({
      x: margin - 5,
      y: y - lines.length * 14 - 12,
      width: contentWidth + 10,
      height: lines.length * 14 + 16,
      color: rgb(0.95, 0.95, 0.95),
    });

    for (const line of lines) {
      const wrapped = wrapText(line, contentWidth - 10, courierFont, 10);
      for (const wl of wrapped) {
        page.drawText(wl, {
          x: margin + 5,
          y: y - 14,
          size: 10,
          font: courierFont,
          color: rgb(0.3, 0.3, 0.3),
        });
        y -= 14;
      }
    }
    y -= 8;
  }

  function wrapText(
    text: string,
    maxWidth: number,
    font: typeof helveticaFont,
    size: number,
  ): string[] {
    const lines: string[] = [];
    for (const paragraph of text.split('\n')) {
      if (paragraph.trim() === '') {
        lines.push('');
        continue;
      }
      let remaining = paragraph;
      while (remaining.length > 0) {
        const charCount = font.widthOfTextAtSize(remaining, size);
        if (charCount <= maxWidth) {
          lines.push(remaining);
          break;
        }
        // Find break point
        let breakIndex = Math.floor((remaining.length * maxWidth) / charCount);
        // Don't break in the middle of a word
        while (breakIndex > 0 && remaining[breakIndex] !== ' ') breakIndex--;
        if (breakIndex <= 0)
          breakIndex = Math.max(
            1,
            Math.floor(maxWidth / (font.widthOfTextAtSize('W', size) || 10)),
          );
        lines.push(remaining.slice(0, breakIndex));
        remaining = remaining.slice(breakIndex).trimStart();
      }
    }
    return lines;
  }

  // ---- Title ----
  drawText(`对话记录 - ${thread.title}`, helveticaBold, 18, rgb(0.1, 0.1, 0.1));
  if (includeTimestamps) {
    drawText(`导出时间: ${new Date().toLocaleString()}`, helveticaFont, 10, rgb(0.5, 0.5, 0.5));
  }

  // Separator line
  page.drawLine({
    start: { x: margin, y: y - 8 },
    end: { x: pageWidth - margin, y: y - 8 },
    color: rgb(0.85, 0.85, 0.85),
    thickness: 1,
  });
  y -= 20;

  // ---- Items ----
  for (const item of thread.items) {
    switch (item.kind) {
      case 'user_prompt': {
        drawText('用户', helveticaBold, 13, rgb(0.15, 0.39, 0.74));
        if (includeTimestamps) {
          drawText(formatTimestamp(item.createdAt, true), helveticaFont, 9, rgb(0.5, 0.5, 0.5));
        }
        drawWrappedText(item.text, helveticaFont, 11);
        y -= 8;
        break;
      }
      case 'assistant_text': {
        drawText('助手', helveticaBold, 13, rgb(0.02, 0.59, 0.41));
        if (includeTimestamps) {
          drawText(formatTimestamp(item.createdAt, true), helveticaFont, 9, rgb(0.5, 0.5, 0.5));
        }

        // Process text: detect code blocks
        const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g;
        let lastIndex = 0;
        let match;
        while ((match = codeBlockRegex.exec(item.text)) !== null) {
          // Text before code block
          if (match.index > lastIndex) {
            const beforeText = item.text.slice(lastIndex, match.index).trim();
            if (beforeText) {
              drawWrappedText(beforeText, helveticaFont, 11);
            }
          }
          // Code block
          drawCodeBlock(match[2].trim());
          lastIndex = match.index + match[0].length;
        }
        // Remaining text after last code block
        if (lastIndex < item.text.length) {
          const remaining = item.text.slice(lastIndex).trim();
          if (remaining) {
            drawWrappedText(remaining, helveticaFont, 11);
          }
        }
        y -= 8;
        break;
      }
      case 'tool_use':
        if (includeToolCalls) {
          const t = item.tool;
          drawText(`[${t.label}] ${t.title}`, helveticaFont, 10, rgb(0.39, 0.4, 0.95));
        }
        break;
      case 'tool_result':
        if (includeToolCalls) {
          const t = item.tool;
          const isError = item.isError;
          const content = t.raw?.content || '';
          drawText(
            `[${t.label}] 结果 ${isError ? 'FAIL' : 'OK'} -> ${t.title}`,
            helveticaFont,
            10,
            isError ? rgb(0.94, 0.27, 0.27) : rgb(0.13, 0.77, 0.37),
          );
          if (content) {
            drawCodeBlock(
              content.length > 500 ? content.slice(0, 500) + '\n... (已截断)' : content,
            );
          }
        }
        break;
    }
  }

  // Add page numbers
  const pages = pdfDoc.getPages();
  for (let i = 0; i < pages.length; i++) {
    const p = pages[i];
    const { height } = p.getSize();
    p.drawText(`Page ${i + 1} / ${pages.length}`, {
      x: margin,
      y: 20,
      size: 8,
      font: helveticaFont,
      color: rgb(0.6, 0.6, 0.6),
    });
  }

  const pdfBytes = await pdfDoc.save();
  return new Blob([pdfBytes], { type: 'application/pdf' });
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
 * Works with both Native Server and OpenAI Direct modes.
 */
export function useConversationExport() {
  /**
   * Export a thread to the specified format.
   */
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
        const blob = await threadToPdf(thread, options);
        downloadBlob(blob, `${baseName}.pdf`);
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
