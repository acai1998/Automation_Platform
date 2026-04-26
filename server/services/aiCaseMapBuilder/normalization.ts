import {
  normalizeNodeMetadata,
  type AiCaseNodeKind,
  type AiCaseNodeMetadata,
} from '@shared/types/aiCaseNodeMetadata';
import type { AiCaseMapData, AiCaseMapNode } from '@shared/types/aiCaseMap';

export function cloneMapData(data: AiCaseMapData): AiCaseMapData {
  if (typeof structuredClone === 'function') {
    return structuredClone(data);
  }
  return JSON.parse(JSON.stringify(data)) as AiCaseMapData;
}

export function inferNodeKind(depth: number, childCount: number): AiCaseNodeKind {
  if (depth === 0) return 'root';
  if (childCount === 0) return 'testcase';
  if (depth === 1) return 'module';
  return 'scenario';
}

function normalizeNode(node: AiCaseMapNode, depth: number): AiCaseMapNode {
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

export function normalizeMapData(raw: unknown): AiCaseMapData {
  if (!raw || typeof raw !== 'object') {
    throw new Error('mapData 必须是对象');
  }

  const candidate = raw as Partial<AiCaseMapData>;
  if (!candidate.nodeData || typeof candidate.nodeData !== 'object') {
    throw new Error('mapData.nodeData 缺失或格式不正确');
  }

  const cloned = cloneMapData(candidate as AiCaseMapData);
  cloned.nodeData = normalizeNode(cloned.nodeData, 0);
  return cloned;
}
