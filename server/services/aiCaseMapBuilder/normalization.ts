import {
  normalizeNodeMetadata,
  type AiCaseNodeKind,
  type AiCaseNodeMetadata,
} from '@shared/types/aiCaseNodeMetadata';
import type { AiCaseStructureData, AiCaseStructureNode } from '@shared/types/aiCaseStructure';

export function cloneStructureData(data: AiCaseStructureData): AiCaseStructureData {
  if (typeof structuredClone === 'function') {
    return structuredClone(data);
  }
  return JSON.parse(JSON.stringify(data)) as AiCaseStructureData;
}

export function inferNodeKind(depth: number, childCount: number): AiCaseNodeKind {
  if (depth === 0) return 'root';
  if (childCount === 0) return 'testcase';
  if (depth === 1) return 'module';
  return 'scenario';
}

function normalizeNode(node: AiCaseStructureNode, depth: number): AiCaseStructureNode {
  const children = Array.isArray(node.children) ? node.children : [];
  const inferredKind = inferNodeKind(depth, children.length);

  const metadata = normalizeNodeMetadata(node.metadata as Partial<AiCaseNodeMetadata> | undefined, {
    inferredKind,
  });

  node.metadata = metadata;
  node.expanded = node.expanded ?? true;

  if (children.length > 0) {
    node.children = children.map((child) => normalizeNode(child, depth + 1));
  } else {
    delete node.children;
  }

  return node;
}

export function normalizeStructureData(raw: unknown): AiCaseStructureData {
  if (!raw || typeof raw !== 'object') {
    throw new Error('mapData must be an object');
  }

  const candidate = raw as Partial<AiCaseStructureData>;
  if (!candidate.nodeData || typeof candidate.nodeData !== 'object') {
    throw new Error('mapData.nodeData is missing or invalid');
  }

  const cloned = cloneStructureData(candidate as AiCaseStructureData);
  cloned.nodeData = normalizeNode(cloned.nodeData, 0);
  return cloned;
}

export function cloneMapData(data: AiCaseStructureData): AiCaseStructureData {
  return cloneStructureData(data);
}

export function normalizeMapData(raw: unknown): AiCaseStructureData {
  return normalizeStructureData(raw);
}
