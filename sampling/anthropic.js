import { existsSync, readFileSync } from 'fs';

const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504, 529]);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export function loadEnvFile(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const text = line.trim();
    if (!text || text.startsWith('#')) continue;
    const equals = text.indexOf('=');
    if (equals === -1) continue;
    const key = text.slice(0, equals).trim();
    const value = text.slice(equals + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  }
}

function backoff(attempt) {
  return Math.min(30000, 1000 * 2 ** (attempt + 1)) + Math.floor(Math.random() * 500);
}

export async function anthropicMessages(body, options = {}) {
  const apiKey = options.apiKey || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not set. Copy .env.local.example to .env.local and add your key.');
  }

  const maxRetries = options.maxRetries ?? 5;
  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify(body)
      });

      if (response.ok) return response.json();

      const payload = await response.json().catch(() => ({}));
      const message = payload.error?.message || `Anthropic API error ${response.status}`;
      if (!RETRYABLE_STATUS.has(response.status) || attempt === maxRetries) throw new Error(message);

      const retryAfter = Number(response.headers.get('retry-after'));
      const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : backoff(attempt);
      lastError = new Error(message);
      await sleep(wait);
    } catch (error) {
      const networkError = /fetch failed|network|ECONN|ETIMEDOUT|EAI_AGAIN/i.test(error.message || '');
      if (!networkError || attempt === maxRetries) throw error;
      lastError = error;
      await sleep(backoff(attempt));
    }
  }

  throw lastError || new Error('Anthropic request failed after retries.');
}

export function usageSummary(usage = {}) {
  return {
    inputTokens: usage.input_tokens || 0,
    cacheCreationInputTokens: usage.cache_creation_input_tokens || 0,
    cacheReadInputTokens: usage.cache_read_input_tokens || 0,
    outputTokens: usage.output_tokens || 0
  };
}
