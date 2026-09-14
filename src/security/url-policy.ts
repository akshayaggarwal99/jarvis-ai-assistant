const SAFE_EXTERNAL_PROTOCOLS = new Set(['https:']);

export function isSafeExternalUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return SAFE_EXTERNAL_PROTOCOLS.has(url.protocol) && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function isSafeLoopbackHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const loopbackHosts = new Set(['localhost', '127.0.0.1', '[::1]']);
    return (url.protocol === 'http:' || url.protocol === 'https:') &&
      loopbackHosts.has(url.hostname) && !url.username && !url.password && !url.hash;
  } catch {
    return false;
  }
}

const PROVIDER_HOSTS: Record<string, string> = {
  openai: 'api.openai.com',
  deepgram: 'api.deepgram.com',
  anthropic: 'api.anthropic.com',
  gemini: 'generativelanguage.googleapis.com'
};

export function isAllowedProviderUrl(provider: string, value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' &&
      url.hostname === PROVIDER_HOSTS[provider] &&
      !url.username && !url.password && !url.hash;
  } catch {
    return false;
  }
}
