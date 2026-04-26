import { parseStatus } from '@shared/types/aiCaseNodeMetadata';
import type { AiCaseMapData, AiCaseMapNode, AiCaseWorkspaceCounters } from '@shared/types/aiCaseMap';
import { inferNodeKind } from './normalization';

export function calculateWorkspaceCounters(mapData: AiCaseMapData): AiCaseWorkspaceCounters {
  const stats: AiCaseWorkspaceCounters = {
    totalCases: 0,
    todoCases: 0,
    doingCases: 0,
    blockedCases: 0,
    passedCases: 0,
    failedCases: 0,
    skippedCases: 0,
  };

  const visit = (node: AiCaseMapNode, depth: number): void => {
    const children = Array.isArray(node.children) ? node.children : [];
    const kind = node.metadata?.kind ?? inferNodeKind(depth, children.length);
    const shouldCount = kind === 'testcase';

    if (shouldCount) {
      const status = parseStatus(node.metadata?.status, 'todo');
      stats.totalCases += 1;
      if (status === 'todo') stats.todoCases += 1;
      if (status === 'doing') stats.doingCases += 1;
      if (status === 'blocked') stats.blockedCases += 1;
      if (status === 'passed') stats.passedCases += 1;
      if (status === 'failed') stats.failedCases += 1;
      if (status === 'skipped') stats.skippedCases += 1;
    }

    children.forEach((child) => visit(child, depth + 1));
  };

  visit(mapData.nodeData, 0);
  return stats;
}
