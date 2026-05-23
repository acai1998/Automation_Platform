import path from 'path';
import type { BrunoRequestIndex } from '@shared/types/bruno';

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'] as const;

function getBlock(content: string, blockName: string): string | null {
  const pattern = new RegExp(`${blockName}\\s*\\{([\\s\\S]*?)\\n\\}`, 'm');
  const match = pattern.exec(content);
  return match ? match[1] : null;
}

function getKeyValue(block: string | null, key: string): string | null {
  if (!block) return null;
  const pattern = new RegExp(`^\\s*${key}\\s*:\\s*(.+?)\\s*$`, 'm');
  const match = pattern.exec(block);
  return match ? match[1].trim() : null;
}

function getTags(content: string): string[] {
  const block = getBlock(content, 'tags');
  if (!block) return [];
  return block
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.includes(':'));
}

function getMethodBlock(content: string): { method: string; block: string | null } {
  for (const method of HTTP_METHODS) {
    const block = getBlock(content, method);
    if (block) return { method: method.toUpperCase(), block };
  }
  return { method: 'GET', block: null };
}

function toFolderPath(relativePath: string): string | null {
  const normalized = relativePath.replace(/\\/g, '/');
  const dir = path.posix.dirname(normalized);
  return dir === '.' ? null : dir;
}

function filenameWithoutExtension(relativePath: string): string {
  return path.posix.basename(relativePath.replace(/\\/g, '/'), '.bru');
}

export function parseBruRequestFile(relativePath: string, content: string): BrunoRequestIndex {
  const metaBlock = getBlock(content, 'meta');
  const { method, block } = getMethodBlock(content);
  const name = getKeyValue(metaBlock, 'name') ?? filenameWithoutExtension(relativePath);
  const urlTemplate = getKeyValue(block, 'url');

  return {
    name,
    method,
    relativePath: relativePath.replace(/\\/g, '/'),
    folderPath: toFolderPath(relativePath),
    urlTemplate,
    tags: getTags(content),
    hasTests: Boolean(getBlock(content, 'tests')),
    hasScripts: Boolean(getBlock(content, 'script:pre-request') || getBlock(content, 'script:post-response')),
  };
}
