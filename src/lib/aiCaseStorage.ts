import type { AiCaseAttachmentRecord, AiCaseWorkspaceDocument } from '@/types/aiCases';

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
