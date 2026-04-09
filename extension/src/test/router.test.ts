import { createMessageRouter, RpcServiceError, type BackgroundService } from '@/background/router';

const service: BackgroundService = {
  getAuthStatus: vi.fn(async () => ({ authenticated: false })),
  startAuth: vi.fn(async () => ({ authUrl: 'http://127.0.0.1:8787/auth/strava/start?return_to=test' })),
  consumeSession: vi.fn(async () => ({ authenticated: true, mode: 'oauth-bridge' as const })),
  login: vi.fn(async () => ({ authenticated: true })),
  logout: vi.fn(async () => ({ authenticated: false })),
  getDashboard: vi.fn(async () => ({
    athlete: { id: 1, firstname: 'Alex', lastname: 'Rider' },
    windowDays: 30 as const,
    allTimeTotals: { distance: 0, movingTime: 0, elevation: 0 },
    recentTotals: { distance: 0, movingTime: 0, elevation: 0, kudos: 0, activityCount: 0 },
    streak: 0,
    weeklyChart: [],
    monthlyChart: [],
    funFacts: [],
    insights: [],
    achievements: [],
    heatmap: { width: 320, height: 220, sampleCount: 0, paths: [] },
    lastUpdated: new Date().toISOString(),
  })),
  getKudos: vi.fn(async () => ({ sampleSize: 0, totalKudos: 0, people: [] })),
  getSegmentInsights: vi.fn(async () => ({
    segmentId: 1,
    segmentName: 'Segment',
    bestTimeSeconds: null,
    averageTimeSeconds: null,
    attempts: 0,
    relativePerformance: null,
    prDate: null,
    sampleSize: 0,
    prCount: 0,
  })),
  getHeatmap: vi.fn(async () => ({ width: 320, height: 220, sampleCount: 0, paths: [] })),
  getInsights: vi.fn(async () => ({ streak: 0, funFacts: [], insights: [], achievements: [] })),
};

describe('background message router', () => {
  it('routes successful messages', async () => {
    const router = createMessageRouter(service);
    const response = await router({ type: 'stats:getDashboard', windowDays: 30 }, { tabId: 7 });
    expect(response.ok).toBe(true);
    expect(service.getDashboard).toHaveBeenCalledWith({ tabId: 7 }, 30);
  });

  it('normalizes service errors into RPC failures', async () => {
    const failingService: BackgroundService = {
      ...service,
      getKudos: vi.fn(async () => {
        throw new RpcServiceError('RATE_LIMIT', 'Slow down');
      }),
    };

    const router = createMessageRouter(failingService);
    const response = await router({ type: 'stats:getKudos' });
    expect(response.ok).toBe(false);
    if (!response.ok) {
      expect(response.error.code).toBe('RATE_LIMIT');
    }
  });
});
