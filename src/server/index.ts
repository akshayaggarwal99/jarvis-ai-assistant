import Fastify, { FastifyInstance } from 'fastify';
import fetch, { Response, RequestInit, Headers } from 'node-fetch';
import { loadEnv, getEnv } from '../config/env';
import { Logger } from '../core/logger';

loadEnv();

const port = parseInt(getEnv('JARVIS_SERVER_PORT') ?? '34115', 10);
const enableProxy = (getEnv('ENABLE_LOCAL_PROXY') ?? 'true') !== 'false';

const KEY_ENV_MAP: Record<string, string> = {
  openai: 'OPENAI_API_KEY',
  deepgram: 'DEEPGRAM_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  gemini: 'GEMINI_API_KEY'
};

type ProxyPayload = {
  url: string;
  options?: RequestInit;
  key?: string;
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

const forwardRequest = async (provider: string, payload: ProxyPayload): Promise<Response> => {
  if (!enableProxy) {
    throw new Error('Local proxy is disabled. Set ENABLE_LOCAL_PROXY=true to enable proxying.');
  }

  const { url, options = {}, key } = payload;
  if (!url) {
    throw new Error('Missing url in proxy request payload.');
  }

  const headers = new Headers(options.headers);

  if (provider === 'openai') {
    headers.set('Authorization', `Bearer ${key ?? ensureKey('openai')}`);
    headers.set('Content-Type', headers.get('Content-Type') || 'application/json');
  }

  if (provider === 'deepgram') {
    headers.set('Authorization', `Token ${key ?? ensureKey('deepgram')}`);
  }

  return fetch(url, { ...options, headers });
};

const buildServer = (): FastifyInstance => {
  const app = Fastify({ logger: true });

  app.get('/health', async () => ({ status: 'ok' }));

  app.get('/api/keys/:provider', async (request, reply) => {
    const provider = (request.params as { provider: string }).provider;
    const key = resolveApiKey(provider);

    if (!key) {
      reply.code(404);
      return { error: `${provider} key not configured` };
    }

    return { apiKey: key };
  });

  app.post('/api/proxy/:provider', async (request, reply) => {
    const provider = (request.params as { provider: string }).provider;

    if (!enableProxy) {
      reply.code(403);
      return { error: 'Local proxy is disabled' };
    }

    if (!KEY_ENV_MAP[provider]) {
      reply.code(404);
      return { error: `Unsupported provider: ${provider}` };
    }

    try {
      const response = await forwardRequest(provider, request.body as ProxyPayload);
      const bodyText = await response.text();

      reply.code(response.status);
      response.headers.forEach((headerValue, headerKey) => {
        if (headerValue) {
          reply.header(headerKey, headerValue);
        }
      });
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
    await server.listen({ port, host: '0.0.0.0' });
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

// Auto-start when run directly
start().catch(error => {
  Logger.error('Fatal error:', error);
  process.exit(1);
});
