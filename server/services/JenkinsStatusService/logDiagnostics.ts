import type { JenkinsLogDiagnostics, MissingScriptPathDiagnostic } from './types';

export function trimForStorage(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 3)}...` : value;
}

export function extractCaseNameFromNodeId(nodeId: string): string {
  const cleanNodeId = nodeId.trim();
  if (!cleanNodeId) {
    return 'Jenkins diagnostic';
  }

  const parts = cleanNodeId.split('::').filter(Boolean);
  if (parts.length > 0) {
    return parts[parts.length - 1];
  }

  const filename = cleanNodeId.split(/[\\/]/).pop() ?? cleanNodeId;
  return filename.replace(/\.[^.]+$/, '') || cleanNodeId;
}

export function extractJenkinsLogDiagnostics(log: string): JenkinsLogDiagnostics {
  const lines = log.split(/\r?\n/);
  const missingScriptPaths: MissingScriptPathDiagnostic[] = [];
  const notableLineIndexes = new Set<number>();

  lines.forEach((line, index) => {
    if (
      line.includes('SCRIPT_PATHS') ||
      line.includes('exitCode=') ||
      line.includes('status=') ||
      line.includes('http_code=') ||
      line.includes('403 Forbidden') ||
      line.includes('crumb') ||
      line.includes('permission')
    ) {
      notableLineIndexes.add(index);
    }

    const missingPathMatch = line.match(/^\s*-\s+(.+?)\s+->\s+(.+?)\s*$/);
    if (missingPathMatch) {
      notableLineIndexes.add(index);
      missingScriptPaths.push({
        nodeId: missingPathMatch[1].trim(),
        filePath: missingPathMatch[2].trim(),
      });
    }
  });

  const exitCodeMatches = Array.from(log.matchAll(/exitCode=(\d+)/g));
  const lastExitCodeMatch = exitCodeMatches[exitCodeMatches.length - 1];
  const exitCode = lastExitCodeMatch ? Number.parseInt(lastExitCodeMatch[1], 10) : undefined;

  const callbackStatusMatch =
    log.match(/status=([^\s,，]+)/) ??
    log.match(/callback[^.\n\r]*(?:HTTP|status)[^\d]*(\d{3})/i) ??
    log.match(/http_code=(\d{3})/);
  const callbackStatus = callbackStatusMatch?.[1];

  const messages: string[] = [];
  if (missingScriptPaths.length > 0) {
    const paths = missingScriptPaths
      .map((item) => `${item.filePath} (${item.nodeId})`)
      .join(', ');
    messages.push(`SCRIPT_PATHS validation failed: missing ${paths}`);
  }
  if (typeof exitCode === 'number' && exitCode !== 0) {
    messages.push(`Jenkins test runner exited with code ${exitCode}`);
  }
  if (callbackStatus) {
    messages.push(`Jenkins callback failed with status ${callbackStatus}`);
  }
  if (log.includes('403 Forbidden') && /crumb|permission/i.test(log)) {
    messages.push('Jenkins returned 403 Forbidden; check crumb, credentials, and Job/Build permission');
  }

  const excerptLines = Array.from(notableLineIndexes)
    .sort((a, b) => a - b)
    .flatMap((index) => {
      const start = Math.max(0, index - 2);
      const end = Math.min(lines.length, index + 3);
      return lines.slice(start, end);
    });
  const dedupedExcerpt = Array.from(new Set(excerptLines)).join('\n');

  return {
    missingScriptPaths,
    exitCode,
    callbackStatus,
    messages,
    excerpt: trimForStorage(dedupedExcerpt, 4000),
  };
}
