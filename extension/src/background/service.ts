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
import { clearCache, clearStoredAuth, getCached, getStoredAuth, setCached, setStoredAuth } from './storage';
import { RpcServiceError, type BackgroundService } from './router';

const STRAVA_API_BASE = 'https://www.strava.com/api/v3';
const SESSION_REVALIDATE_MS = 5 * 60 * 1000;

interface CreateServiceDeps {
  fetchImpl?: typeof fetch;
  now?: () => number;
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
}: CreateServiceDeps = {}): BackgroundService {
  async function stravaFetch<T>(path: string, init?: RequestInit): Promise<T> {
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
      await clearStoredAuth();
      throw new RpcServiceError(
        'AUTH_REQUIRED',
        'Open Strava in this browser, sign in, then click "Use current Strava session".',
      );
    }

    if (response.status === 429) {
      throw new RpcServiceError(
        'RATE_LIMIT',
        'Strava rate limit reached. Wait a minute and try again.',
        parseRateLimit(response),
      );
    }

    return parseJson<T>(response);
  }

  async function probeSession(): Promise<StravaAthlete> {
    return stravaFetch<StravaAthlete>('/athlete', { cache: 'no-store' });
  }

  async function getAuth(): Promise<StoredAuthSession> {
    const auth = await getStoredAuth();

    if (!auth) {
      throw new RpcServiceError(
        'AUTH_REQUIRED',
        'Use your current Strava browser session to unlock analytics.',
      );
    }

    if (auth.lastValidatedAt + SESSION_REVALIDATE_MS <= now()) {
      const athlete = await probeSession();
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
      return cachedValue;
    }

    const value = await producer();
    await setCached(key, value, ttlMs);
    return value;
  }

  async function getAthlete(): Promise<StravaAthlete> {
    return cached('athlete', 15 * 60 * 1000, () => stravaFetch<StravaAthlete>('/athlete'));
  }

  async function getAthleteStats(athleteId: number): Promise<StravaStats> {
    return cached(`athlete-stats:${athleteId}`, 15 * 60 * 1000, () =>
      stravaFetch<StravaStats>(`/athletes/${athleteId}/stats`),
    );
  }

  async function getRecentActivities(days = 90, perPage = 60): Promise<StravaActivity[]> {
    const after = Math.floor((now() - days * 24 * 60 * 60 * 1000) / 1000);
    return cached(`activities:${days}:${perPage}`, 10 * 60 * 1000, () =>
      stravaFetch<StravaActivity[]>(`/athlete/activities?after=${after}&per_page=${perPage}`),
    );
  }

  async function getDetailedActivity(activityId: number): Promise<StravaActivity> {
    return cached(`activity-detail:${activityId}`, 20 * 60 * 1000, () =>
      stravaFetch<StravaActivity>(`/activities/${activityId}?include_all_efforts=true`),
    );
  }

  async function getRecentDetailedActivities(limit = 20): Promise<StravaActivity[]> {
    const activities = await getRecentActivities(90, Math.max(limit, 30));
    const selected = activities.slice(0, limit);
    const results = await Promise.allSettled(selected.map((activity) => getDetailedActivity(activity.id)));
    return results
      .filter((result): result is PromiseFulfilledResult<StravaActivity> => result.status === 'fulfilled')
      .map((result) => result.value);
  }

  async function getActivityKudoers(activityId: number): Promise<StravaKudoer[]> {
    return cached(`activity-kudos:${activityId}`, 60 * 60 * 1000, () =>
      stravaFetch<StravaKudoer[]>(`/activities/${activityId}/kudos?page=1&per_page=30`),
    );
  }

  async function getSegment(segmentId: number): Promise<StravaSegment> {
    return cached(`segment:${segmentId}`, 30 * 60 * 1000, () => stravaFetch<StravaSegment>(`/segments/${segmentId}`));
  }

  async function getActivityLatLngStream(activityId: number): Promise<ActivityStream | null> {
    return cached(`stream:${activityId}`, 60 * 60 * 1000, async () => {
      const streamSet = await stravaFetch<{ latlng?: { data: number[][] } }>(
        `/activities/${activityId}/streams?keys=latlng&key_by_type=true`,
      );

      if (!streamSet.latlng?.data?.length) {
        return null;
      }

      return {
        id: activityId,
        latlng: streamSet.latlng.data,
      };
    });
  }

  async function loadDashboard(windowDays: TimeWindow = 30): Promise<DashboardAnalytics> {
    const athlete = await getAthlete();
    const [stats, activities] = await Promise.all([getAthleteStats(athlete.id), getRecentActivities()]);
    const streamCandidates = activities.filter((activity) => (activity.start_latlng?.length ?? 0) > 0).slice(0, 12);
    const streamResults = await Promise.allSettled(
      streamCandidates.map((activity) => getActivityLatLngStream(activity.id)),
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
    async getAuthStatus(): Promise<AuthStatus> {
      const auth = await getStoredAuth();

      if (!auth) {
        return { authenticated: false };
      }

      try {
        const ensured = auth.lastValidatedAt + SESSION_REVALIDATE_MS <= now()
          ? await getAuth()
          : auth;

        return {
          authenticated: true,
          athlete: ensured.athlete,
          mode: ensured.mode,
        };
      } catch {
        await clearStoredAuth();
        return { authenticated: false };
      }
    },

    async login(): Promise<AuthStatus> {
      const athlete = await probeSession();
      const auth: StoredAuthSession = {
        mode: 'browser-session',
        athlete,
        lastValidatedAt: now(),
      };

      await setStoredAuth(auth);

      return {
        authenticated: true,
        athlete: auth.athlete,
        mode: auth.mode,
      };
    },

    async logout(): Promise<AuthStatus> {
      await clearStoredAuth();
      await clearCache();
      return { authenticated: false };
    },

    async getDashboard(windowDays = 30): Promise<DashboardAnalytics> {
      return loadDashboard(windowDays);
    },

    async getKudos(activityId?: number): Promise<KudosAnalytics> {
      const activities = await getRecentActivities(90, 30);
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
          kudoers: await getActivityKudoers(activity.id),
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

    async getSegmentInsights(segmentId: number): Promise<SegmentInsights> {
      const [segment, activities] = await Promise.all([getSegment(segmentId), getRecentDetailedActivities(24)]);
      return buildSegmentInsights(segment, activities);
    },

    async getHeatmap(): Promise<HeatmapOverlay> {
      const dashboard = await loadDashboard(30);
      return dashboard.heatmap;
    },

    async getInsights(windowDays = 30): Promise<InsightsPayload> {
      const dashboard = await loadDashboard(windowDays);
      return buildInsightsPayload(dashboard);
    },
  };
}
