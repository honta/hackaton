import { describe, expect, it, vi } from 'vitest';
import { buildServer } from '../src/server.js';
import type { AuthBridgeEnv } from '../src/env.js';

const env: AuthBridgeEnv = {
  STRAVA_CLIENT_ID: '12345',
  STRAVA_CLIENT_SECRET: 'secret',
  STRAVA_REDIRECT_URI: 'http://127.0.0.1:8787/auth/strava/callback',
  AUTH_BRIDGE_PORT: 8787,
};

function mockFetch(payload: unknown, status = 200) {
  return vi.fn(async () => {
    return new Response(JSON.stringify(payload), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  });
}

describe('auth bridge server', () => {
  it('redirects to Strava authorization with a stored state', async () => {
    const app = await buildServer({ env, fetchImpl: mockFetch({}) as unknown as typeof fetch });

    const response = await app.inject({
      method: 'GET',
      url: '/auth/strava/start?return_to=https://demo.chromiumapp.org/provider_cb',
    });

    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toContain('https://www.strava.com/oauth/authorize');
    expect(response.headers.location).toContain('client_id=12345');
    expect(response.headers.location).toContain('state=');
  });

  it('exchanges the auth code, hands back a session, and consumes it once', async () => {
    const fetchImpl = mockFetch({
      access_token: 'access-token',
      refresh_token: 'refresh-token',
      expires_at: 1_900_000_000,
      scope: 'read,activity:read_all',
      athlete: {
        id: 77,
        firstname: 'Taylor',
        lastname: 'Swift',
      },
    }) as unknown as typeof fetch;

    const app = await buildServer({ env, fetchImpl });
    const start = await app.inject({
      method: 'GET',
      url: '/auth/strava/start?return_to=https://demo.chromiumapp.org/provider_cb',
    });
    const state = new URL(start.headers.location as string).searchParams.get('state');

    const callback = await app.inject({
      method: 'GET',
      url: `/auth/strava/callback?code=demo-code&scope=read&state=${state}`,
    });

    expect(callback.statusCode).toBe(302);
    const sessionId = new URL(callback.headers.location as string).searchParams.get('session');
    expect(sessionId).toBeTruthy();

    const consume = await app.inject({
      method: 'POST',
      url: '/auth/strava/session/consume',
      payload: { sessionId },
    });

    expect(consume.statusCode).toBe(200);
    expect(consume.json().accessToken).toBe('access-token');

    const consumeAgain = await app.inject({
      method: 'POST',
      url: '/auth/strava/session/consume',
      payload: { sessionId },
    });

    expect(consumeAgain.statusCode).toBe(404);
  });

  it('refreshes and deauthorizes through Strava', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            access_token: 'new-access',
            refresh_token: 'new-refresh',
            expires_at: 1_900_000_100,
            athlete: { id: 3 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    const app = await buildServer({ env, fetchImpl });

    const refresh = await app.inject({
      method: 'POST',
      url: '/auth/strava/token/refresh',
      payload: { refreshToken: 'refresh-token' },
    });

    expect(refresh.statusCode).toBe(200);
    expect(refresh.json().accessToken).toBe('new-access');

    const deauthorize = await app.inject({
      method: 'POST',
      url: '/auth/strava/deauthorize',
      payload: { accessToken: 'new-access' },
    });

    expect(deauthorize.statusCode).toBe(204);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
