import {
  buildDashboardAnalytics,
  buildInsightsPayload,
  buildKudosAnalytics,
  buildSegmentInsights,
} from '@/shared/analytics';
import type {
  ActivityStream,
  AuthStatus,
  DashboardAnalytics,
  HeatmapOverlay,
  InsightsPayload,
  KudosAnalytics,
  StoredAuthSession,
  StravaActivity,
  StravaAthlete,
  StravaKudoer,
  StravaSegment,
  StravaStats,
  TimeWindow,
  SegmentInsights,
} from '@/shared/types';
import { createLogger } from '@/shared/logger';
import { clearCache, clearStoredAuth, getCached, getStoredAuth, setCached, setStoredAuth } from './storage';
import { RpcServiceError, type BackgroundService, type RequestContext } from './router';

const STRAVA_API_BASE = 'https://www.strava.com/api/v3';
const SESSION_REVALIDATE_MS = 5 * 60 * 1000;
const logger = createLogger('background');

interface CreateServiceDeps {
  fetchImpl?: typeof fetch;
  now?: () => number;
  executeScriptImpl?: typeof chrome.scripting.executeScript;
}

interface PageResponse {
  ok: boolean;
  status: number;
  retryAfter: string | null;
  bodyText: string;
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

export function createBackgroundService({
  fetchImpl = fetch,
  now = Date.now,
  executeScriptImpl,
}: CreateServiceDeps = {}): BackgroundService {
  const pageExecuteScript =
    executeScriptImpl ?? globalThis.chrome?.scripting?.executeScript?.bind(globalThis.chrome.scripting);

  async function executePageRequest(tabId: number, path: string, init?: RequestInit): Promise<PageResponse> {
    if (!pageExecuteScript) {
      throw new RpcServiceError(
        'API_ERROR',
        'Unable to access the current Strava tab. Reload the page and try again.',
      );
    }

    const [result] = await pageExecuteScript({
      target: { tabId },
      world: 'MAIN',
      args: [path, init ?? {}],
      func: async (requestPath: string, requestInit: RequestInit) => {
        const response = await fetch(`https://www.strava.com/api/v3${requestPath}`, {
          ...requestInit,
          credentials: 'include',
          headers: {
            Accept: 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
            ...(requestInit.headers ?? {}),
          },
        });

        return {
          ok: response.ok,
          status: response.status,
          retryAfter: response.headers.get('retry-after'),
          bodyText: await response.text(),
        };
      },
    });

    return result.result as PageResponse;
  }

  async function parsePageResponse<T>(pageResponse: PageResponse, path: string): Promise<T> {
    if (pageResponse.status === 401 || pageResponse.status === 403) {
      logger.warn('Strava session unavailable', { path, status: pageResponse.status });
      await clearStoredAuth();
      throw new RpcServiceError(
        'AUTH_REQUIRED',
        'Open Strava in this browser, sign in on strava.com, then click "Use current Strava session".',
      );
    }

    if (pageResponse.status === 429) {
      const retryAfter = Number(pageResponse.retryAfter ?? '60');
      const retryAt = Date.now() + retryAfter * 1000;
      logger.warn('Strava rate limit reached', { path, retryAt });
      throw new RpcServiceError(
        'RATE_LIMIT',
        'Strava rate limit reached. Wait a minute and try again.',
        retryAt,
      );
    }

    if (!pageResponse.ok) {
      throw new RpcServiceError('API_ERROR', `Strava request failed (${pageResponse.status}): ${pageResponse.bodyText}`);
    }

    return JSON.parse(pageResponse.bodyText) as T;
  }

  async function stravaFetch<T>(path: string, context?: RequestContext, init?: RequestInit): Promise<T> {
    logger.debug('Requesting Strava API', { path, method: init?.method ?? 'GET', tabId: context?.tabId });

    if (context?.tabId) {
      const pageResponse = await executePageRequest(context.tabId, path, init);
      logger.debug('Strava API page-context response ok', { path, status: pageResponse.status });
      return parsePageResponse<T>(pageResponse, path);
    }

    const response = await fetchImpl(`${STRAVA_API_BASE}${path}`, {
      ...init,
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
        ...(init?.headers ?? {}),
      },
    });

    if (response.status === 401 || response.status === 403) {
      logger.warn('Strava session unavailable', { path, status: response.status });
      await clearStoredAuth();
      throw new RpcServiceError(
        'AUTH_REQUIRED',
        'Open Strava in this browser, sign in, then click "Use current Strava session".',
      );
    }

    if (response.status === 429) {
      logger.warn('Strava rate limit reached', { path, retryAt: parseRateLimit(response) });
      throw new RpcServiceError(
        'RATE_LIMIT',
        'Strava rate limit reached. Wait a minute and try again.',
        parseRateLimit(response),
      );
    }

    logger.debug('Strava API response ok', { path, status: response.status });
    return parseJson<T>(response);
  }

  async function probeSession(context?: RequestContext): Promise<StravaAthlete> {
    return stravaFetch<StravaAthlete>('/athlete', context, { cache: 'no-store' });
  }

  async function getAuth(context?: RequestContext): Promise<StoredAuthSession> {
    const auth = await getStoredAuth();

    if (!auth) {
      logger.info('No stored browser session found');
      throw new RpcServiceError(
        'AUTH_REQUIRED',
        'Use your current Strava browser session to unlock analytics.',
      );
    }

    if (auth.lastValidatedAt + SESSION_REVALIDATE_MS <= now()) {
      logger.info('Revalidating stored browser session');
      const athlete = await probeSession(context);
      const refreshedAuth: StoredAuthSession = {
        mode: 'browser-session',
        athlete,
        lastValidatedAt: now(),
      };
      await setStoredAuth(refreshedAuth);
      return refreshedAuth;
    }

    return auth;
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
      cached(`athlete-stats:${athlete.id}`, 15 * 60 * 1000, () => stravaFetch<StravaStats>(`/athletes/${athlete.id}/stats`, context)),
      cached(`activities:90:60`, 10 * 60 * 1000, () => {
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
      const auth = await getStoredAuth();

      if (!auth) {
        logger.info('Auth status requested: not authenticated');
        return { authenticated: false };
      }

      try {
        const ensured = auth.lastValidatedAt + SESSION_REVALIDATE_MS <= now()
          ? await getAuth(context)
          : auth;

        logger.info('Auth status requested: authenticated', { athleteId: ensured.athlete.id });
        return {
          authenticated: true,
          athlete: ensured.athlete,
          mode: ensured.mode,
        };
      } catch (error) {
        logger.warn('Stored session invalid, clearing local auth state', error);
        await clearStoredAuth();
        return { authenticated: false };
      }
    },

    async login(context?: RequestContext): Promise<AuthStatus> {
      logger.info('Attempting browser-session login');
      const athlete = await probeSession(context);
      const auth: StoredAuthSession = {
        mode: 'browser-session',
        athlete,
        lastValidatedAt: now(),
      };

      await setStoredAuth(auth);
      logger.info('Browser-session login succeeded', { athleteId: athlete.id });

      return {
        authenticated: true,
        athlete: auth.athlete,
        mode: auth.mode,
      };
    },

    async logout(): Promise<AuthStatus> {
      logger.info('Clearing local session and cache');
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
        return cached(`activities:90:30`, 10 * 60 * 1000, () =>
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
        cached(`segment:${segmentId}`, 30 * 60 * 1000, () => stravaFetch<StravaSegment>(`/segments/${segmentId}`, context)),
        (async () => {
          const after = Math.floor((now() - 90 * 24 * 60 * 60 * 1000) / 1000);
          const recentActivities = await cached(`activities:90:30`, 10 * 60 * 1000, () =>
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
