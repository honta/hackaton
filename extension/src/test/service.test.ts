import { createBackgroundService } from '@/background/service';

function createChromeStorageMock() {
  const store = new Map<string, unknown>();

  return {
    local: {
      async get(key: string | string[] | null) {
        if (key === null) {
          return Object.fromEntries(store.entries());
        }

        if (Array.isArray(key)) {
          return Object.fromEntries(key.map((entry) => [entry, store.get(entry)]));
        }

        return { [key]: store.get(key) };
      },
      async set(values: Record<string, unknown>) {
        for (const [key, value] of Object.entries(values)) {
          store.set(key, value);
        }
      },
      async remove(keys: string | string[]) {
        for (const key of Array.isArray(keys) ? keys : [keys]) {
          store.delete(key);
        }
      },
    },
  };
}

describe('background service session auth', () => {
  beforeEach(() => {
    vi.stubGlobal('chrome', {
      storage: createChromeStorageMock(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('builds an OAuth start URL when the auth bridge is healthy', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({ ok: true, now: 1000 }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );

    const service = createBackgroundService({ fetchImpl });
    const result = await service.startAuth('https://www.strava.com/dashboard');

    expect(result.authUrl).toContain('http://127.0.0.1:8787/auth/strava/start');
    expect(result.authUrl).toContain(encodeURIComponent('https://www.strava.com/dashboard'));
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://127.0.0.1:8787/health',
      expect.objectContaining({ headers: expect.objectContaining({ Accept: 'application/json' }) }),
    );
  });

  it('consumes an OAuth bridge session and stores the athlete', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          athlete: {
            id: 42,
            firstname: 'Taylor',
            lastname: 'Swift',
          },
          accessToken: 'access-token',
          refreshToken: 'refresh-token',
          expiresAt: 2_000_000,
          scope: 'read,activity:read_all',
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );

    const service = createBackgroundService({ fetchImpl, now: () => 1000 });
    const authStatus = await service.consumeSession('session-123');

    expect(authStatus.authenticated).toBe(true);
    expect(authStatus.mode).toBe('oauth-bridge');
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://127.0.0.1:8787/auth/strava/session/consume',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ sessionId: 'session-123' }),
      }),
    );

    const statusAfterLogin = await service.getAuthStatus();
    expect(statusAfterLogin.authenticated).toBe(true);
    expect(statusAfterLogin.athlete?.id).toBe(42);
  });
});
