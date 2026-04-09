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

  it('logs in through the current browser session and stores the athlete', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 42,
          firstname: 'Taylor',
          lastname: 'Swift',
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );

    const service = createBackgroundService({ fetchImpl, now: () => 1000 });
    const authStatus = await service.login();

    expect(authStatus.authenticated).toBe(true);
    expect(authStatus.mode).toBe('browser-session');
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://www.strava.com/api/v3/athlete',
      expect.objectContaining({
        cache: 'no-store',
        credentials: 'include',
      }),
    );

    const statusAfterLogin = await service.getAuthStatus();
    expect(statusAfterLogin.authenticated).toBe(true);
    expect(statusAfterLogin.athlete?.id).toBe(42);
  });

  it('clears local state when the browser session is unavailable', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response('Unauthorized', { status: 401 }));
    const service = createBackgroundService({ fetchImpl });

    await expect(service.login()).rejects.toThrow('Use current Strava session');
    expect((await service.getAuthStatus()).authenticated).toBe(false);
  });
});
