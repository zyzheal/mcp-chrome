import { createErrorResponse } from '@/common/tool-handler';
import { ERROR_MESSAGES } from '@/common/constants';
import * as browserTools from './browser';
import { flowRunTool, listPublishedFlowsTool } from './record-replay';

const tools = { ...browserTools, flowRunTool, listPublishedFlowsTool } as any;
const toolsMap = new Map(Object.values(tools).map((tool: any) => [tool.name, tool]));

// Log registered tools on startup (useful for debugging)
console.log('[Tools] Registered browser tools:', Array.from(toolsMap.keys()).join(', '));

/**
 * Tool call parameter interface
 */
export interface ToolCallParam {
  name: string;
  args: any;
}

/**
 * Handle tool execution
 */
export const handleCallTool = async (param: ToolCallParam) => {
  const tool = toolsMap.get(param.name);
  if (!tool) {
    console.error(
      `[Tools] Tool "${param.name}" not found. Available tools:`,
      Array.from(toolsMap.keys()),
    );
    return createErrorResponse(`Tool ${param.name} not found`);
  }

  try {
    return await tool.execute(param.args);
  } catch (error) {
    console.error(`[Tools] Tool execution failed for ${param.name}:`, error);
    return createErrorResponse(
      error instanceof Error ? error.message : ERROR_MESSAGES.TOOL_EXECUTION_FAILED,
    );
  }
};
