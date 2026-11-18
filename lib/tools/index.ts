import type { AgentTool } from '@earendil-works/pi-agent-core';
import { askUserTool } from './ask-user';
import { inspectTool } from './inspect';
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
  pdfTool,
  askUserTool,
];

export const ALLOWED_TOOL_NAMES = new Set(PAGEHAND_TOOLS.map((tool) => tool.name));
