import { getSecretOrEnv } from '../../utils/secrets';
import type { LlmConfig } from './types';

export function parsePositiveInt(value: string, fallback: number): number {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function parseTemperature(value: string, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(0, Math.min(1.2, parsed));
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createLlmConfig(): LlmConfig {
  const apiKey = getSecretOrEnv('AI_CASE_LLM_API_KEY');
  const baseUrl = getSecretOrEnv('AI_CASE_LLM_BASE_URL', 'https://api.openai.com/v1');
  const model = getSecretOrEnv('AI_CASE_LLM_MODEL', 'gpt-4o-mini');

  return {
    enabled: Boolean(apiKey && baseUrl && model),
    provider: getSecretOrEnv('AI_CASE_LLM_PROVIDER', 'openai-compatible'),
    baseUrl,
    model,
    apiKey,
    temperature: parseTemperature(getSecretOrEnv('AI_CASE_LLM_TEMPERATURE', '0.2'), 0.2),
    maxTokens: parsePositiveInt(getSecretOrEnv('AI_CASE_LLM_MAX_TOKENS', '3000'), 3000),
    timeoutMs: parsePositiveInt(getSecretOrEnv('AI_CASE_LLM_TIMEOUT_MS', '30000'), 30000),
  };
}
