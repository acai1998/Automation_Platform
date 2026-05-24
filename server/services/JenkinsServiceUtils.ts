export function runGitCommand(command: string): string | undefined {
  try {
    const { execSync } = require('child_process') as typeof import('child_process');
    const output = execSync(command, {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return output || undefined;
  } catch {
    return undefined;
  }
}

export function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, '');
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, '\'')
    .replace(/&amp;/g, '&');
}

export function extractXmlValue(xml: string, pattern: RegExp): string | undefined {
  const match = pattern.exec(xml);
  if (!match?.[1]) {
    return undefined;
  }

  return decodeXmlEntities(match[1].trim());
}

export function extractXmlValues(xml: string, pattern: RegExp): string[] {
  return Array.from(
    new Set(
      Array.from(xml.matchAll(pattern))
        .map((match) => match[1]?.trim())
        .filter((value): value is string => Boolean(value))
        .map(decodeXmlEntities)
    )
  );
}

export function extractParameterNamesFromApiPayload(payload: Record<string, unknown>): string[] {
  const collected = new Set<string>();

  for (const key of ['actions', 'property']) {
    const source = payload[key];
    if (!Array.isArray(source)) {
      continue;
    }

    for (const entry of source) {
      if (!isRecord(entry)) {
        continue;
      }

      const definitions = entry.parameterDefinitions;
      if (!Array.isArray(definitions)) {
        continue;
      }

      for (const definition of definitions) {
        if (isRecord(definition) && typeof definition.name === 'string' && definition.name.trim()) {
          collected.add(definition.name.trim());
        }
      }
    }
  }

  return Array.from(collected);
}
