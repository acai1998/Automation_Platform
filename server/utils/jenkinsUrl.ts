function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, '');
}

export function normalizeConfiguredJenkinsBaseUrl(baseUrl: string): string {
  const normalized = normalizeBaseUrl(baseUrl);

  if (!normalized) {
    return normalized;
  }

  try {
    const parsedUrl = new URL(normalized);

    if (
      (parsedUrl.hostname === 'jenkins.wiac.xyz' || parsedUrl.hostname === 'www.wiac.xyz')
      && parsedUrl.port === '8080'
    ) {
      parsedUrl.protocol = 'https:';
      parsedUrl.hostname = 'jenkins.wiac.xyz';
      parsedUrl.port = '';
    }

    return normalizeBaseUrl(parsedUrl.toString());
  } catch {
    return normalized;
  }
}

