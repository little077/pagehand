import type { AgentTool } from '@earendil-works/pi-agent-core';
import { askUserTool } from './ask-user';
import { inspectTool } from './inspect';
import { interactTool } from './interact';
import { listTabsTool } from './list-tabs';
import { pdfTool } from './pdf';
import { readPageTool } from './read-page';
import { readSelectionTool } from './read-selection';
import { readTabTool } from './read-tab';
import { screenshotTool } from './screenshot';

export const PAGEHAND_TOOLS: AgentTool[] = [
  readPageTool,
  listTabsTool,
  readTabTool,
  readSelectionTool,
  inspectTool,
  screenshotTool,
  interactTool,
  pdfTool,
  askUserTool,
];

export const ALLOWED_TOOL_NAMES = new Set(PAGEHAND_TOOLS.map((tool) => tool.name));

/** 纯文本模型看不到截图工具，避免它先选错再收到能力错误。 */
export function availableTools(supportsImages: boolean): AgentTool[] {
  return supportsImages
    ? PAGEHAND_TOOLS
    : PAGEHAND_TOOLS.filter((tool) => tool.name !== 'screenshot');
}
