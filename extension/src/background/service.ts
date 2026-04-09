import {
  buildDashboardAnalytics,
  buildInsightsPayload,
  buildKudosAnalytics,
  buildSegmentInsights,
} from '@/shared/analytics';
import type {
  ActivityStream,
  AuthStartPayload,
  AuthStatus,
  DashboardAnalytics,
  HeatmapOverlay,
  InsightsPayload,
  KudosAnalytics,
  SegmentInsights,
  StoredAuthSession,
  StravaActivity,
  StravaKudoer,
  StravaSegment,
  StravaStats,
  StravaAthlete,
  TimeWindow,
} from '@/shared/types';
import { createLogger } from '@/shared/logger';
import { clearCache, clearStoredAuth, getCached, getStoredAuth, setCached, setStoredAuth } from './storage';
import { RpcServiceError, type BackgroundService, type RequestContext } from './router';

const STRAVA_API_BASE = 'https://www.strava.com/api/v3';
const AUTH_BRIDGE_BASE = 'http://127.0.0.1:8787';
const TOKEN_REFRESH_SKEW_MS = 60 * 1000;
const logger = createLogger('background');

interface CreateServiceDeps {
  fetchImpl?: typeof fetch;
  now?: () => number;
}

interface BridgeSessionResponse {
  athlete: StravaAthlete;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  scope?: string;
}

function parseRateLimit(response: Response) {
  const retryAfterSeconds = Number(response.headers.get('retry-after') ?? '60');
  return Date.now() + retryAfterSeconds * 1000;
}

async function parseJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const text = await response.text();
    throw new RpcServiceError('API_ERROR', `Strava request failed (${response.status}): ${text}`);
  }

  return response.json() as Promise<T>;
}

function getBridgeAuthError(path: string, status: number): RpcServiceError {
  return new RpcServiceError(
    'AUTH_REQUIRED',
    [
      `Strava returned ${status} for ${path}.`,
      'Reconnect through the local OAuth bridge.',
    ].join(' '),
  );
}

export function createBackgroundService({
  fetchImpl = fetch,
  now = Date.now,
}: CreateServiceDeps = {}): BackgroundService {
  async function bridgeFetch<T>(path: string, init?: RequestInit): Promise<T> {
    let response: Response;
    try {
      response = await fetchImpl(`${AUTH_BRIDGE_BASE}${path}`, {
        ...init,
        headers: {
          Accept: 'application/json',
          ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
          ...(init?.headers ?? {}),
        },
      });
    } catch (error) {
      logger.warn('Auth bridge is unavailable', error);
      throw new RpcServiceError(
        'AUTH_FAILED',
        'Auth bridge is not reachable. Start auth-bridge locally and try again.',
      );
    }

    if (!response.ok) {
      const text = await response.text();
      throw new RpcServiceError(
        'AUTH_FAILED',
        `Auth bridge request failed (${response.status}). ${text || 'Check auth-bridge logs and configuration.'}`,
      );
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return response.json() as Promise<T>;
  }

  async function hydrateStoredAuth(payload: BridgeSessionResponse): Promise<StoredAuthSession> {
    const auth: StoredAuthSession = {
      mode: 'oauth-bridge',
      athlete: payload.athlete,
      accessToken: payload.accessToken,
      refreshToken: payload.refreshToken,
      expiresAt: payload.expiresAt,
      scope: payload.scope ?? '',
    };
    await setStoredAuth(auth);
    return auth;
  }

  async function refreshAuth(auth: StoredAuthSession): Promise<StoredAuthSession> {
    logger.info('Refreshing Strava OAuth token', { athleteId: auth.athlete.id });
    const refreshed = await bridgeFetch<BridgeSessionResponse>('/auth/strava/token/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken: auth.refreshToken }),
    });
    return hydrateStoredAuth(refreshed);
  }

  async function getAuth(_context?: RequestContext): Promise<StoredAuthSession> {
    const auth = await getStoredAuth();

    if (!auth) {
      logger.info('No stored OAuth session found');
      throw new RpcServiceError(
        'AUTH_REQUIRED',
        'Connect Strava through the local OAuth bridge to unlock analytics.',
      );
    }

    if (auth.expiresAt <= now() + TOKEN_REFRESH_SKEW_MS) {
      return refreshAuth(auth);
    }

    return auth;
  }

  async function stravaFetch<T>(path: string, context?: RequestContext, init?: RequestInit): Promise<T> {
    logger.debug('Requesting Strava API', { path, method: init?.method ?? 'GET', tabId: context?.tabId });
    const auth = await getAuth(context);
    const response = await fetchImpl(`${STRAVA_API_BASE}${path}`, {
      ...init,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${auth.accessToken}`,
        ...(init?.headers ?? {}),
      },
    });

    if (response.status === 401 || response.status === 403) {
      logger.warn('Stored OAuth token rejected by Strava', { path, status: response.status });
      await clearStoredAuth();
      throw getBridgeAuthError(path, response.status);
    }

    if (response.status === 429) {
      const retryAt = parseRateLimit(response);
      logger.warn('Strava rate limit reached', { path, retryAt });
      throw new RpcServiceError(
        'RATE_LIMIT',
        'Strava rate limit reached. Wait a minute and try again.',
        retryAt,
      );
    }

    logger.debug('Strava API response ok', { path, status: response.status });
    return parseJson<T>(response);
  }

  async function cached<T>(key: string, ttlMs: number, producer: () => Promise<T>): Promise<T> {
    const cachedValue = await getCached<T>(key);

    if (cachedValue) {
      logger.debug('Cache hit', { key });
      return cachedValue;
    }

    logger.debug('Cache miss', { key });
    const value = await producer();
    await setCached(key, value, ttlMs);
    return value;
  }

  async function loadDashboard(context?: RequestContext, windowDays: TimeWindow = 30): Promise<DashboardAnalytics> {
    logger.info('Loading dashboard analytics', { windowDays });
    const athlete = await cached('athlete', 15 * 60 * 1000, () => stravaFetch<StravaAthlete>('/athlete', context));
    const [stats, activities] = await Promise.all([
      cached(`athlete-stats:${athlete.id}`, 15 * 60 * 1000, () =>
        stravaFetch<StravaStats>(`/athletes/${athlete.id}/stats`, context),
      ),
      cached('activities:90:60', 10 * 60 * 1000, () => {
        const after = Math.floor((now() - 90 * 24 * 60 * 60 * 1000) / 1000);
        return stravaFetch<StravaActivity[]>(`/athlete/activities?after=${after}&per_page=60`, context);
      }),
    ]);
    const streamCandidates = activities.filter((activity) => (activity.start_latlng?.length ?? 0) > 0).slice(0, 12);
    const streamResults = await Promise.allSettled(
      streamCandidates.map((activity) =>
        cached(`stream:${activity.id}`, 60 * 60 * 1000, async () => {
          const streamSet = await stravaFetch<{ latlng?: { data: number[][] } }>(
            `/activities/${activity.id}/streams?keys=latlng&key_by_type=true`,
            context,
          );

          if (!streamSet.latlng?.data?.length) {
            return null;
          }

          return {
            id: activity.id,
            latlng: streamSet.latlng.data,
          };
        }),
      ),
    );
    const streams = streamResults
      .filter((result): result is PromiseFulfilledResult<ActivityStream | null> => result.status === 'fulfilled')
      .map((result) => result.value)
      .filter((value): value is ActivityStream => value !== null);

    return buildDashboardAnalytics({
      athlete,
      stats,
      activities,
      streams,
      windowDays,
      now: now(),
    });
  }

  return {
    async getAuthStatus(context?: RequestContext): Promise<AuthStatus> {
      try {
        const auth = await getAuth(context);
        logger.info('Auth status requested: authenticated', { athleteId: auth.athlete.id });
        return {
          authenticated: true,
          athlete: auth.athlete,
          mode: auth.mode,
          expiresAt: auth.expiresAt,
          scope: auth.scope,
        };
      } catch (error) {
        if (error instanceof RpcServiceError && error.code === 'AUTH_REQUIRED') {
          logger.info('Auth status requested: not authenticated');
        } else {
          logger.warn('Stored OAuth session invalid, clearing local auth state', error);
          await clearStoredAuth();
        }
        return { authenticated: false };
      }
    },

    async startAuth(returnTo: string): Promise<AuthStartPayload> {
      await bridgeFetch<{ ok: boolean; now: number }>('/health');
      const authUrl = new URL('/auth/strava/start', AUTH_BRIDGE_BASE);
      authUrl.searchParams.set('return_to', returnTo);
      return { authUrl: authUrl.toString() };
    },

    async consumeSession(sessionId: string): Promise<AuthStatus> {
      logger.info('Consuming OAuth bridge session');
      const session = await bridgeFetch<BridgeSessionResponse>('/auth/strava/session/consume', {
        method: 'POST',
        body: JSON.stringify({ sessionId }),
      });
      await clearCache();
      const auth = await hydrateStoredAuth(session);
      logger.info('OAuth bridge login succeeded', { athleteId: auth.athlete.id });
      return {
        authenticated: true,
        athlete: auth.athlete,
        mode: auth.mode,
        expiresAt: auth.expiresAt,
        scope: auth.scope,
      };
    },

    async login(): Promise<AuthStatus> {
      throw new RpcServiceError(
        'AUTH_FAILED',
        'Use the OAuth bridge start flow instead of direct login.',
      );
    },

    async logout(): Promise<AuthStatus> {
      const auth = await getStoredAuth();
      if (auth) {
        try {
          await bridgeFetch<void>('/auth/strava/deauthorize', {
            method: 'POST',
            body: JSON.stringify({ accessToken: auth.accessToken }),
          });
        } catch (error) {
          logger.warn('Failed to deauthorize Strava token during logout', error);
        }
      }

      logger.info('Clearing local OAuth session and cache');
      await clearStoredAuth();
      await clearCache();
      return { authenticated: false };
    },

    async getDashboard(context, windowDays = 30): Promise<DashboardAnalytics> {
      return loadDashboard(context, windowDays);
    },

    async getKudos(context, activityId?: number): Promise<KudosAnalytics> {
      logger.info('Loading kudos analytics', { activityId });
      const activities = await (async () => {
        const after = Math.floor((now() - 90 * 24 * 60 * 60 * 1000) / 1000);
        return cached('activities:90:30', 10 * 60 * 1000, () =>
          stravaFetch<StravaActivity[]>(`/athlete/activities?after=${after}&per_page=30`, context),
        );
      })();
      const selected = activities.slice(0, 20);
      const sampledActivities =
        activityId && !selected.some((activity) => activity.id === activityId)
          ? [activities.find((activity) => activity.id === activityId), ...selected].filter(
              (activity): activity is StravaActivity => Boolean(activity),
            )
          : selected;
      const kudoers = await Promise.allSettled(
        sampledActivities.map(async (activity) => ({
          activityId: activity.id,
          kudoers: await cached(`activity-kudos:${activity.id}`, 60 * 60 * 1000, () =>
            stravaFetch<StravaKudoer[]>(`/activities/${activity.id}/kudos?page=1&per_page=30`, context),
          ),
        })),
      );

      return buildKudosAnalytics(
        kudoers
          .filter(
            (result): result is PromiseFulfilledResult<{ activityId: number; kudoers: StravaKudoer[] }> =>
              result.status === 'fulfilled',
          )
          .map((result) => result.value),
      );
    },

    async getSegmentInsights(context, segmentId: number): Promise<SegmentInsights> {
      logger.info('Loading segment insights', { segmentId });
      const [segment, activities] = await Promise.all([
        cached(`segment:${segmentId}`, 30 * 60 * 1000, () =>
          stravaFetch<StravaSegment>(`/segments/${segmentId}`, context),
        ),
        (async () => {
          const after = Math.floor((now() - 90 * 24 * 60 * 60 * 1000) / 1000);
          const recentActivities = await cached('activities:90:30', 10 * 60 * 1000, () =>
            stravaFetch<StravaActivity[]>(`/athlete/activities?after=${after}&per_page=30`, context),
          );
          const selected = recentActivities.slice(0, 24);
          const results = await Promise.allSettled(
            selected.map((activity) =>
              cached(`activity-detail:${activity.id}`, 20 * 60 * 1000, () =>
                stravaFetch<StravaActivity>(`/activities/${activity.id}?include_all_efforts=true`, context),
              ),
            ),
          );
          return results
            .filter((result): result is PromiseFulfilledResult<StravaActivity> => result.status === 'fulfilled')
            .map((result) => result.value);
        })(),
      ]);
      return buildSegmentInsights(segment, activities);
    },

    async getHeatmap(context): Promise<HeatmapOverlay> {
      logger.info('Loading heatmap');
      const dashboard = await loadDashboard(context, 30);
      return dashboard.heatmap;
    },

    async getInsights(context, windowDays = 30): Promise<InsightsPayload> {
      logger.info('Loading insights payload', { windowDays });
      const dashboard = await loadDashboard(context, windowDays);
      return buildInsightsPayload(dashboard);
    },
  };
}
