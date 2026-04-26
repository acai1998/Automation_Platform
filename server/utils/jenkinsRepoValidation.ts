export function normalizeGitRemoteUrl(remoteUrl: string | undefined): string | undefined {
  if (!remoteUrl) return undefined;

  const trimmed = remoteUrl.trim();
  if (!trimmed) return undefined;

  const sshMatch = trimmed.match(/^git@([^:]+):(.+)$/);
  if (sshMatch) {
    const path = sshMatch[2].replace(/\.git$/, '');
    return `https://${sshMatch[1]}/${path}`;
  }

  return trimmed.replace(/\.git$/, '');
}

function normalizeComparableRepoUrl(remoteUrl: string | undefined): string | undefined {
  const normalized = normalizeGitRemoteUrl(remoteUrl);
  if (!normalized) return undefined;

  try {
    const url = new URL(normalized);
    const normalizedPath = url.pathname.replace(/\/+$/, '').toLowerCase();
    return `${url.protocol}//${url.host.toLowerCase()}${normalizedPath}`;
  } catch {
    return normalized.replace(/\/+$/, '').toLowerCase();
  }
}

export function isMisconfiguredTestRepoUrl(
  testRepoUrl: string | undefined,
  platformRepoUrl: string | undefined
): boolean {
  const normalizedTestRepoUrl = normalizeComparableRepoUrl(testRepoUrl);
  const normalizedPlatformRepoUrl = normalizeComparableRepoUrl(platformRepoUrl);

  if (!normalizedTestRepoUrl || !normalizedPlatformRepoUrl) {
    return false;
  }

  return normalizedTestRepoUrl === normalizedPlatformRepoUrl;
}
