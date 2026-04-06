import type { AiCaseAttachmentRecord, AiCaseNode, AiCaseMindData, AiCaseWorkspaceDocument } from '@/types/aiCases';

const DB_NAME = 'automation-platform-ai-cases';
const DB_VERSION = 1;
const DOC_STORE = 'workspace_documents';
const ATTACHMENT_STORE = 'workspace_attachments';
const ATTACHMENT_BY_DOC_NODE_INDEX = 'by_doc_node';
const ATTACHMENT_BY_DOC_INDEX = 'by_doc';

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(DOC_STORE)) {
        db.createObjectStore(DOC_STORE, { keyPath: 'id' });
      }

      if (!db.objectStoreNames.contains(ATTACHMENT_STORE)) {
        const attachmentStore = db.createObjectStore(ATTACHMENT_STORE, { keyPath: 'id' });
        attachmentStore.createIndex(ATTACHMENT_BY_DOC_NODE_INDEX, ['docId', 'nodeId'], {
          unique: false,
        });
        attachmentStore.createIndex(ATTACHMENT_BY_DOC_INDEX, 'docId', {
          unique: false,
        });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Failed to open IndexedDB'));
  });
}

export async function listAllWorkspaceDocuments(): Promise<AiCaseWorkspaceDocument[]> {
  const db = await openDb();

  try {
    const tx = db.transaction(DOC_STORE, 'readonly');
    const store = tx.objectStore(DOC_STORE);
    const docs = await requestToPromise<AiCaseWorkspaceDocument[]>(store.getAll());
    return [...docs].sort((a, b) => b.updatedAt - a.updatedAt);
  } finally {
    db.close();
  }
}

export async function deleteWorkspaceDocument(docId: string): Promise<void> {
  const db = await openDb();

  try {
    const tx = db.transaction(DOC_STORE, 'readwrite');
    const store = tx.objectStore(DOC_STORE);
    await requestToPromise(store.delete(docId));
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Failed to delete workspace document'));
      tx.onabort = () => reject(tx.error ?? new Error('Delete workspace document transaction aborted'));
    });
  } finally {
    db.close();
  }
}

export async function getWorkspaceDocument(docId: string): Promise<AiCaseWorkspaceDocument | null> {
  const db = await openDb();

  try {
    const tx = db.transaction(DOC_STORE, 'readonly');
    const store = tx.objectStore(DOC_STORE);
    const doc = await requestToPromise<AiCaseWorkspaceDocument | undefined>(store.get(docId));
    return doc ?? null;
  } finally {
    db.close();
  }
}

export async function saveWorkspaceDocument(doc: AiCaseWorkspaceDocument): Promise<void> {
  const db = await openDb();

  try {
    const tx = db.transaction(DOC_STORE, 'readwrite');
    const store = tx.objectStore(DOC_STORE);
    await requestToPromise(store.put(doc));
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Failed to save workspace document'));
      tx.onabort = () => reject(tx.error ?? new Error('Workspace transaction aborted'));
    });
  } finally {
    db.close();
  }
}

export async function saveNodeAttachment(attachment: AiCaseAttachmentRecord): Promise<void> {
  const db = await openDb();

  try {
    const tx = db.transaction(ATTACHMENT_STORE, 'readwrite');
    const store = tx.objectStore(ATTACHMENT_STORE);
    await requestToPromise(store.put(attachment));
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Failed to save node attachment'));
      tx.onabort = () => reject(tx.error ?? new Error('Attachment transaction aborted'));
    });
  } finally {
    db.close();
  }
}

export async function listNodeAttachments(docId: string, nodeId: string): Promise<AiCaseAttachmentRecord[]> {
  const db = await openDb();

  try {
    const tx = db.transaction(ATTACHMENT_STORE, 'readonly');
    const store = tx.objectStore(ATTACHMENT_STORE);
    const index = store.index(ATTACHMENT_BY_DOC_NODE_INDEX);
    const rows = await requestToPromise<AiCaseAttachmentRecord[]>(index.getAll([docId, nodeId]));
    return [...rows].sort((a, b) => b.createdAt - a.createdAt);
  } finally {
    db.close();
  }
}

export async function deleteNodeAttachment(attachmentId: string): Promise<void> {
  const db = await openDb();

  try {
    const tx = db.transaction(ATTACHMENT_STORE, 'readwrite');
    const store = tx.objectStore(ATTACHMENT_STORE);
    await requestToPromise(store.delete(attachmentId));
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Failed to delete attachment'));
      tx.onabort = () => reject(tx.error ?? new Error('Delete attachment transaction aborted'));
    });
  } finally {
    db.close();
  }
}

export async function listWorkspaceAttachments(docId: string): Promise<AiCaseAttachmentRecord[]> {
  const db = await openDb();

  try {
    const tx = db.transaction(ATTACHMENT_STORE, 'readonly');
    const store = tx.objectStore(ATTACHMENT_STORE);
    const index = store.index(ATTACHMENT_BY_DOC_INDEX);
    const rows = await requestToPromise<AiCaseAttachmentRecord[]>(index.getAll(docId));
    return rows;
  } finally {
    db.close();
  }
}

export async function deleteStaleWorkspaceAttachments(docId: string, activeNodeIds: string[]): Promise<number> {
  const db = await openDb();
  const activeNodeIdSet = new Set(activeNodeIds);

  try {
    const tx = db.transaction(ATTACHMENT_STORE, 'readwrite');
    const store = tx.objectStore(ATTACHMENT_STORE);
    const index = store.index(ATTACHMENT_BY_DOC_INDEX);
    const rows = await requestToPromise<AiCaseAttachmentRecord[]>(index.getAll(docId));

    const staleRows = rows.filter((row) => !activeNodeIdSet.has(row.nodeId));
    await Promise.all(staleRows.map((row) => requestToPromise(store.delete(row.id))));

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Failed to cleanup stale attachments'));
      tx.onabort = () => reject(tx.error ?? new Error('Cleanup stale attachments transaction aborted'));
    });

    return staleRows.length;
  } finally {
    db.close();
  }
}

/**
 * 将脑图数据导出为 Markdown 格式字符串。
 * 层级结构：# 根节点 / ## 功能模块 / ### 测试场景 / - [ ] 测试点
 */
export function exportMindDataToMarkdown(mindData: AiCaseMindData): string {
  const lines: string[] = [];

  function walkNode(node: AiCaseNode, depth: number): void {
    const kind = node.metadata?.kind ?? 'testcase';
    const topic = (node.topic ?? '').replace(/\s*\[.*?\]\s*/g, '').trim();

    if (!topic) return;

    if (depth === 0) {
      lines.push(`# ${topic}`);
      lines.push('');
    } else if (kind === 'module') {
      lines.push(`## ${topic}`);
      lines.push('');
    } else if (kind === 'scenario') {
      lines.push(`### ${topic}`);
      lines.push('');
    } else if (kind === 'testcase') {
      const priority = node.metadata?.priority ? ` [${node.metadata.priority}]` : '';
      const status = node.metadata?.status ? ` (${node.metadata.status})` : '';
      lines.push(`- [ ] **${topic}**${priority}${status}`);

      const children = (node.children ?? []) as AiCaseNode[];

      if (children.length > 0) {
        // 新格式：子节点为前置条件/测试步骤/预期结果
        for (const child of children) {
          const childTopic = (child.topic ?? '').trim();
          if (!childTopic) continue;
          lines.push(`  - ${childTopic}`);
        }
      } else if (node.note) {
        // 兼容旧格式：只有 note 的 testcase
        for (const noteLine of node.note.split(/\r?\n/)) {
          const trimmedLine = noteLine.trim();
          if (trimmedLine) {
            lines.push(`  - ${trimmedLine}`);
          }
        }
      }

      return; // testcase 子节点已在上面处理，不再递归
    } else {
      // 未知类型，作为普通列表项
      const indent = '  '.repeat(Math.max(0, depth - 1));
      lines.push(`${indent}- ${topic}`);
    }

    // 递归子节点（非 testcase 类型才继续向下）
    const children = (node.children ?? []) as AiCaseNode[];
    for (const child of children) {
      walkNode(child, depth + 1);
    }
  }

  walkNode(mindData.nodeData, 0);
  return lines.join('\n');
}

/**
 * 触发浏览器下载指定文本内容为文件
 */
export function downloadTextFile(content: string, filename: string, mimeType = 'text/markdown'): void {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
