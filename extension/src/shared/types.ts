export type TimeWindow = 7 | 30 | 90;

export interface StravaAthlete {
  id: number;
  firstname: string;
  lastname: string;
  username?: string;
  city?: string;
  state?: string;
  country?: string;
  profile?: string;
  profile_medium?: string;
  premium?: boolean;
}

export interface TotalsBlock {
  count: number;
  distance: number;
  moving_time: number;
  elapsed_time: number;
  elevation_gain: number;
}

export interface StravaStats {
  biggest_ride_distance?: number;
  biggest_climb_elevation_gain?: number;
  [key: string]: unknown;
}

export interface StravaActivity {
  id: number;
  name: string;
  distance: number;
  moving_time: number;
  elapsed_time: number;
  total_elevation_gain: number;
  kudos_count: number;
  achievement_count: number;
  start_date: string;
  start_date_local: string;
  timezone?: string;
  sport_type: string;
  type?: string;
  average_speed?: number;
  max_speed?: number;
  average_heartrate?: number;
  average_watts?: number;
  start_latlng?: [number, number] | [];
  end_latlng?: [number, number] | [];
  map?: {
    summary_polyline?: string;
  };
  segment_efforts?: StravaSegmentEffort[];
}

export interface StravaSegmentEffort {
  id: number;
  name: string;
  elapsed_time: number;
  moving_time?: number;
  start_date?: string;
  start_date_local?: string;
  pr_rank?: number | null;
  achievements?: Array<{
    type_id?: number;
    type?: string;
    rank?: number;
  }>;
  segment?: {
    id: number;
    name: string;
  };
}

export interface StravaSegment {
  id: number;
  name: string;
  distance: number;
  effort_count?: number;
  athlete_pr_effort?: {
    elapsed_time: number;
    start_date_local: string;
  } | null;
}

export interface StravaKudoer {
  id: number;
  firstname: string;
  lastname: string;
  profile?: string;
  profile_medium?: string;
}

export interface ActivityStream {
  id: number;
  latlng: number[][];
}

export interface StoredAuthSession {
  mode: 'oauth-bridge';
  athlete: StravaAthlete;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  scope?: string;
}

export interface AuthStatus {
  authenticated: boolean;
  athlete?: StravaAthlete;
  mode?: 'oauth-bridge';
  expiresAt?: number;
  scope?: string;
}

export interface AuthStartPayload {
  authUrl: string;
}

export interface DashboardAnalytics {
  athlete: StravaAthlete;
  windowDays: TimeWindow;
  allTimeTotals: {
    distance: number;
    movingTime: number;
    elevation: number;
  };
  recentTotals: {
    distance: number;
    movingTime: number;
    elevation: number;
    kudos: number;
    activityCount: number;
  };
  streak: number;
  weeklyChart: Array<{
    label: string;
    distanceKm: number;
    elevation: number;
  }>;
  monthlyChart: Array<{
    label: string;
    distanceKm: number;
    kudos: number;
  }>;
  funFacts: string[];
  insights: string[];
  achievements: Array<{
    title: string;
    description: string;
    unlocked: boolean;
  }>;
  heatmap: HeatmapOverlay;
  lastUpdated: string;
}

export interface HeatmapOverlay {
  width: number;
  height: number;
  sampleCount: number;
  paths: Array<{
    d: string;
    opacity: number;
  }>;
}

export interface KudosAnalytics {
  sampleSize: number;
  totalKudos: number;
  people: Array<{
    id: number;
    name: string;
    avatarUrl: string;
    count: number;
    badges: string[];
  }>;
}

export interface SegmentInsights {
  segmentId: number;
  segmentName: string;
  bestTimeSeconds: number | null;
  averageTimeSeconds: number | null;
  attempts: number;
  relativePerformance: number | null;
  prDate: string | null;
  sampleSize: number;
  prCount: number;
}

export interface InsightsPayload {
  streak: number;
  funFacts: string[];
  insights: string[];
  achievements: DashboardAnalytics['achievements'];
}

export type RpcErrorCode =
  | 'AUTH_REQUIRED'
  | 'AUTH_FAILED'
  | 'RATE_LIMIT'
  | 'API_ERROR'
  | 'NOT_FOUND'
  | 'UNKNOWN';

export interface RpcError {
  code: RpcErrorCode;
  message: string;
  retryAt?: number;
}

export type RpcSuccess<T> = { ok: true; data: T };
export type RpcFailure = { ok: false; error: RpcError };
export type RpcResponse<T> = RpcSuccess<T> | RpcFailure;

export type RpcRequest =
  | { type: 'auth:status' }
  | { type: 'auth:start'; returnTo: string }
  | { type: 'auth:consume'; sessionId: string }
  | { type: 'auth:login' }
  | { type: 'auth:logout' }
  | { type: 'stats:getDashboard'; windowDays?: TimeWindow }
  | { type: 'stats:getKudos'; activityId?: number }
  | { type: 'stats:getSegmentInsights'; segmentId: number }
  | { type: 'stats:getHeatmap' }
  | { type: 'stats:getInsights'; windowDays?: TimeWindow };
