import {
  incrementNodeVersion,
  parseStatus,
  STATUS_HISTORY_MAX_LENGTH,
  type AiCaseNodeMetadata,
  type AiCaseNodeStatus,
} from '@shared/types/aiCaseNodeMetadata';
import type {
  AiCaseStructureData,
  AiCaseStructureNode,
  AiCaseStructureStatusUpdateResult,
} from '@shared/types/aiCaseStructure';
import type { AiCaseNodeStatusUpdateResult } from '@shared/types/aiCaseMap';
import { cloneStructureData, normalizeStructureData } from './normalization';

export function updateNodeStatusInStructure(
  structureData: AiCaseStructureData,
  nodeId: string,
  nextStatus: AiCaseNodeStatus,
): AiCaseStructureStatusUpdateResult {
  const normalized = normalizeStructureData(structureData);
  const next = cloneStructureData(normalized);
  let previousStatus: AiCaseNodeStatus | null = null;
  let nodeTopic = '';
  let nodePath: string | null = null;
  let updated = false;

  const visit = (node: AiCaseStructureNode, path: string[]): boolean => {
    const currentPath = [...path, node.topic];
    if (node.id === nodeId) {
      const metadata = node.metadata as AiCaseNodeMetadata;
      previousStatus = parseStatus(metadata.status, 'todo');
      nodeTopic = node.topic;
      nodePath = currentPath.join(' / ');
      const now = Date.now();

      node.metadata = {
        ...metadata,
        status: nextStatus,
        nodeVersion: incrementNodeVersion(metadata.nodeVersion),
        updatedAt: now,
        statusHistory: [...(metadata.statusHistory ?? []), { status: nextStatus, at: now }].slice(-STATUS_HISTORY_MAX_LENGTH),
      };
      updated = true;
      return true;
    }

    for (const child of node.children ?? []) {
      if (visit(child, currentPath)) {
        return true;
      }
    }

    return false;
  };

  visit(next.nodeData, []);

  return {
    updated,
    previousStatus,
    currentStatus: nextStatus,
    nodeTopic,
    nodePath,
    structureData: next,
  };
}

export function updateNodeStatusInMap(
  structureData: AiCaseStructureData,
  nodeId: string,
  nextStatus: AiCaseNodeStatus,
): AiCaseNodeStatusUpdateResult {
  const result = updateNodeStatusInStructure(structureData, nodeId, nextStatus);
  return {
    ...result,
    mapData: result.structureData,
  };
}
