import type { AgentTool } from '@earendil-works/pi-agent-core';
import { readPageTool } from './read-page';

export const PAGEHAND_TOOLS: AgentTool[] = [readPageTool];

export const ALLOWED_TOOL_NAMES = new Set(PAGEHAND_TOOLS.map((tool) => tool.name));
