import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { z } from 'zod';
import type { AuthBridgeEnv } from './env.js';
import { MemorySessionStore } from './session-store.js';

const startQuerySchema = z.object({
  return_to: z.string().url(),
});

const callbackQuerySchema = z.object({
  code: z.string().min(1),
  scope: z.string().default(''),
  state: z.string().min(1),
});

const consumeBodySchema = z.object({
  sessionId: z.string().uuid(),
});

const refreshBodySchema = z.object({
  refreshToken: z.string().min(1),
});

const deauthorizeBodySchema = z.object({
  accessToken: z.string().min(1),
});

interface TokenExchangeResponse {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  athlete: unknown;
  scope?: string;
}

export interface ServerDeps {
  env: AuthBridgeEnv;
  fetchImpl?: typeof fetch;
  now?: () => number;
  store?: MemorySessionStore;
}

function buildTokenForm(env: AuthBridgeEnv, grantType: 'authorization_code' | 'refresh_token', codeOrToken: string) {
  const form = new URLSearchParams();
  form.set('client_id', env.STRAVA_CLIENT_ID);
  form.set('client_secret', env.STRAVA_CLIENT_SECRET);
  form.set('grant_type', grantType);

  if (grantType === 'authorization_code') {
    form.set('code', codeOrToken);
  } else {
    form.set('refresh_token', codeOrToken);
  }

  return form;
}

async function exchangeToken(
  fetchImpl: typeof fetch,
  env: AuthBridgeEnv,
  grantType: 'authorization_code' | 'refresh_token',
  codeOrToken: string,
): Promise<TokenExchangeResponse> {
  const response = await fetchImpl('https://www.strava.com/api/v3/oauth/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: buildTokenForm(env, grantType, codeOrToken).toString(),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Strava token exchange failed: ${response.status} ${text}`);
  }

  return response.json() as Promise<TokenExchangeResponse>;
}

export async function buildServer({
  env,
  fetchImpl = fetch,
  now = Date.now,
  store = new MemorySessionStore(now),
}: ServerDeps): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  await app.register(cors, {
    origin: true,
  });

  app.get('/auth/strava/start', async (request, reply) => {
    const { return_to: returnTo } = startQuerySchema.parse(request.query);
    const pendingState = store.createState(returnTo);
    const authUrl = new URL('https://www.strava.com/oauth/authorize');
    authUrl.searchParams.set('client_id', env.STRAVA_CLIENT_ID);
    authUrl.searchParams.set('redirect_uri', env.STRAVA_REDIRECT_URI);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('approval_prompt', 'auto');
    authUrl.searchParams.set('scope', 'read,activity:read_all,read_all');
    authUrl.searchParams.set('state', pendingState.id);

    return reply.redirect(authUrl.toString());
  });

  app.get('/auth/strava/callback', async (request, reply) => {
    const query = callbackQuerySchema.parse(request.query);
    const pendingState = store.consumeState(query.state);

    if (!pendingState) {
      return reply.status(400).send({ error: 'invalid_state' });
    }

    const tokenResponse = await exchangeToken(fetchImpl, env, 'authorization_code', query.code);
    const session = store.createSession({
      accessToken: tokenResponse.access_token,
      refreshToken: tokenResponse.refresh_token,
      expiresAt: tokenResponse.expires_at * 1000,
      athlete: tokenResponse.athlete,
      scope: tokenResponse.scope ?? query.scope,
    });

    const returnUrl = new URL(pendingState.returnTo);
    returnUrl.searchParams.set('session', session.id);

    return reply.redirect(returnUrl.toString());
  });

  app.post('/auth/strava/session/consume', async (request, reply) => {
    const { sessionId } = consumeBodySchema.parse(request.body);
    const session = store.consumeSession(sessionId);

    if (!session) {
      return reply.status(404).send({ error: 'session_not_found' });
    }

    return reply.send({
      athlete: session.athlete,
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      expiresAt: session.expiresAt,
      scope: session.scope,
    });
  });

  app.post('/auth/strava/token/refresh', async (request, reply) => {
    const { refreshToken } = refreshBodySchema.parse(request.body);
    const tokenResponse = await exchangeToken(fetchImpl, env, 'refresh_token', refreshToken);

    return reply.send({
      athlete: tokenResponse.athlete,
      accessToken: tokenResponse.access_token,
      refreshToken: tokenResponse.refresh_token,
      expiresAt: tokenResponse.expires_at * 1000,
      scope: tokenResponse.scope ?? '',
    });
  });

  app.post('/auth/strava/deauthorize', async (request, reply) => {
    const { accessToken } = deauthorizeBodySchema.parse(request.body);
    const form = new URLSearchParams();
    form.set('access_token', accessToken);

    const response = await fetchImpl('https://www.strava.com/oauth/deauthorize', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
    });

    if (!response.ok) {
      const text = await response.text();
      return reply.status(response.status).send({ error: 'deauthorize_failed', detail: text });
    }

    return reply.status(204).send();
  });

  app.get('/health', async () => ({ ok: true, now: now() }));

  return app;
}
