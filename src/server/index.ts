import Fastify, { FastifyInstance } from 'fastify';
import fetch, { Response, RequestInit, Headers } from 'node-fetch';
import { loadEnv, getEnv } from '../config/env';
import { Logger } from '../core/logger';
import { isAllowedProviderUrl } from '../security/url-policy';
import { timingSafeEqual } from 'crypto';

loadEnv();

const port = parseInt(getEnv('JARVIS_SERVER_PORT') ?? '34115', 10);
const proxyToken = getEnv('JARVIS_PROXY_TOKEN')?.trim();
const enableProxy = getEnv('ENABLE_LOCAL_PROXY') === 'true' && Boolean(proxyToken);

const KEY_ENV_MAP: Record<string, string> = {
  openai: 'OPENAI_API_KEY',
  deepgram: 'DEEPGRAM_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  gemini: 'GEMINI_API_KEY'
};

type ProxyPayload = {
  url: string;
  method?: 'GET' | 'POST';
  body?: string;
};

const resolveApiKey = (provider: string): string | undefined => {
  const envKey = KEY_ENV_MAP[provider];
  if (!envKey) {
    return undefined;
  }
  const value = getEnv(envKey);
  return value && value.trim() ? value.trim() : undefined;
};

const ensureKey = (provider: string): string => {
  const key = resolveApiKey(provider);
  if (!key) {
    throw new Error(`${provider} key not configured. Set ${KEY_ENV_MAP[provider] || provider.toUpperCase()} in your .env file.`);
  }
  return key;
};

const isAuthorized = (authorization?: string): boolean => {
  if (!proxyToken || !authorization?.startsWith('Bearer ')) return false;
  const supplied = Buffer.from(authorization.slice('Bearer '.length));
  const expected = Buffer.from(proxyToken);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
};

const forwardRequest = async (provider: string, payload: ProxyPayload): Promise<Response> => {
  if (!enableProxy) {
    throw new Error('Local proxy requires ENABLE_LOCAL_PROXY=true and JARVIS_PROXY_TOKEN.');
  }

  const { url, method = 'POST', body } = payload;
  if (!url || !isAllowedProviderUrl(provider, url)) {
    throw new Error('URL is not an approved endpoint for this provider.');
  }

  const headers = new Headers();

  if (provider === 'openai') {
    headers.set('Authorization', `Bearer ${ensureKey('openai')}`);
    headers.set('Content-Type', 'application/json');
  }

  if (provider === 'deepgram') {
    headers.set('Authorization', `Token ${ensureKey('deepgram')}`);
  }

  if (provider === 'anthropic') {
    headers.set('x-api-key', ensureKey('anthropic'));
    headers.set('anthropic-version', '2023-06-01');
    headers.set('Content-Type', 'application/json');
  }

  if (provider === 'gemini') {
    headers.set('x-goog-api-key', ensureKey('gemini'));
    headers.set('Content-Type', 'application/json');
  }

  return fetch(url, { method, body: method === 'POST' ? body : undefined, headers });
};

export const buildServer = (): FastifyInstance => {
  const app = Fastify({ logger: true, bodyLimit: 1024 * 1024 });

  app.get('/health', async () => ({ status: 'ok' }));

  app.post('/api/proxy/:provider', async (request, reply) => {
    const provider = (request.params as { provider: string }).provider;

    if (!enableProxy) {
      reply.code(403);
      return { error: 'Local proxy is disabled or missing JARVIS_PROXY_TOKEN' };
    }

    if (!isAuthorized(request.headers.authorization)) {
      reply.code(401);
      return { error: 'Unauthorized' };
    }

    if (!KEY_ENV_MAP[provider]) {
      reply.code(404);
      return { error: `Unsupported provider: ${provider}` };
    }

    try {
      const response = await forwardRequest(provider, request.body as ProxyPayload);
      const bodyText = await response.text();

      reply.code(response.status);
      const contentType = response.headers.get('content-type');
      const requestId = response.headers.get('x-request-id');
      if (contentType) reply.header('content-type', contentType);
      if (requestId) reply.header('x-request-id', requestId);
      return bodyText;
    } catch (error: any) {
      Logger.error('Proxy error:', error);
      reply.code(500);
      return { error: error.message || 'Proxy request failed' };
    }
  });

  return app;
};

export const start = async () => {
  const server = buildServer();
  try {
    await server.listen({ port, host: '127.0.0.1' });
    Logger.success(`🔌 Local server running on http://localhost:${port}`);
    
    // Handle graceful shutdown
    const shutdown = async (signal: string) => {
      Logger.info(`Received ${signal}, shutting down gracefully...`);
      await server.close();
      process.exit(0);
    };
    
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    
    // Keep process alive (server handles its own event loop)
    return server;
  } catch (error) {
    Logger.error('Failed to start local server:', error);
    process.exit(1);
  }
};

if (require.main === module) {
  start().catch(error => {
    Logger.error('Fatal error:', error);
    process.exit(1);
  });
}
