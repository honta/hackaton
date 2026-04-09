import type {
  ActivityStream,
  DashboardAnalytics,
  HeatmapOverlay,
  InsightsPayload,
  KudosAnalytics,
  StravaActivity,
  StravaAthlete,
  StravaKudoer,
  StravaSegment,
  StravaStats,
  TimeWindow,
  TotalsBlock,
  SegmentInsights,
} from './types';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function isWithinWindow(activity: StravaActivity, windowDays: number, now = Date.now()): boolean {
  const delta = now - new Date(activity.start_date).getTime();
  return delta <= windowDays * DAY_MS;
}

function extractTotals(stats: StravaStats, prefix: 'all_' | 'recent_' | 'ytd_'): TotalsBlock {
  const totals = Object.entries(stats)
    .filter(([key, value]) => key.startsWith(prefix) && typeof value === 'object' && value !== null)
    .map(([, value]) => value as TotalsBlock);

  return totals.reduce<TotalsBlock>(
    (accumulator, total) => ({
      count: accumulator.count + (total.count ?? 0),
      distance: accumulator.distance + (total.distance ?? 0),
      moving_time: accumulator.moving_time + (total.moving_time ?? 0),
      elapsed_time: accumulator.elapsed_time + (total.elapsed_time ?? 0),
      elevation_gain: accumulator.elevation_gain + (total.elevation_gain ?? 0),
    }),
    {
      count: 0,
      distance: 0,
      moving_time: 0,
      elapsed_time: 0,
      elevation_gain: 0,
    },
  );
}

export function computeStreak(activities: StravaActivity[], now = Date.now()): number {
  const uniqueDays = new Set(
    activities.map((activity) => startOfDay(new Date(activity.start_date_local || activity.start_date)).toISOString()),
  );

  let streak = 0;
  let cursor = startOfDay(new Date(now));

  while (true) {
    const key = cursor.toISOString();
    if (uniqueDays.has(key)) {
      streak += 1;
      cursor = new Date(cursor.getTime() - DAY_MS);
      continue;
    }

    if (streak === 0) {
      cursor = new Date(cursor.getTime() - DAY_MS);
      if (uniqueDays.has(cursor.toISOString())) {
        streak += 1;
        cursor = new Date(cursor.getTime() - DAY_MS);
        continue;
      }
    }

    break;
  }

  return streak;
}

function bucketWeekly(activities: StravaActivity[], count = 8, now = Date.now()) {
  return Array.from({ length: count }, (_, index) => {
    const rangeEnd = new Date(now - (count - index - 1) * WEEK_MS);
    const rangeStart = new Date(rangeEnd.getTime() - WEEK_MS);
    const bucket = activities.filter((activity) => {
      const time = new Date(activity.start_date).getTime();
      return time >= rangeStart.getTime() && time < rangeEnd.getTime();
    });

    return {
      label: new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(rangeEnd),
      distanceKm: bucket.reduce((sum, activity) => sum + activity.distance, 0) / 1000,
      elevation: bucket.reduce((sum, activity) => sum + activity.total_elevation_gain, 0),
    };
  });
}

function bucketMonthly(activities: StravaActivity[], count = 6, now = Date.now()) {
  return Array.from({ length: count }, (_, index) => {
    const current = new Date(now);
    current.setMonth(current.getMonth() - (count - index - 1), 1);
    current.setHours(0, 0, 0, 0);
    const next = new Date(current);
    next.setMonth(next.getMonth() + 1, 1);

    const bucket = activities.filter((activity) => {
      const time = new Date(activity.start_date).getTime();
      return time >= current.getTime() && time < next.getTime();
    });

    return {
      label: new Intl.DateTimeFormat('en', { month: 'short' }).format(current),
      distanceKm: bucket.reduce((sum, activity) => sum + activity.distance, 0) / 1000,
      kudos: bucket.reduce((sum, activity) => sum + activity.kudos_count, 0),
    };
  });
}

function createFunFacts(activities: StravaActivity[], stats: StravaStats): string[] {
  if (activities.length === 0) {
    return ['No recent activities yet. Connect Strava and complete an activity to unlock analytics.'];
  }

  const longest = [...activities].sort((left, right) => right.distance - left.distance)[0];
  const highest = [...activities].sort(
    (left, right) => right.total_elevation_gain - left.total_elevation_gain,
  )[0];

  return [
    `Longest recent activity: ${longest.name} at ${(longest.distance / 1000).toFixed(1)} km.`,
    `Biggest recent climb: ${highest.total_elevation_gain.toFixed(0)} m on ${highest.name}.`,
    `All-time biggest climb on Strava: ${(stats.biggest_climb_elevation_gain ?? 0).toFixed(0)} m.`,
  ];
}

function createInsights(activities: StravaActivity[]): string[] {
  if (activities.length === 0) {
    return ['No activity sample available yet.'];
  }

  const weekend = activities.filter((activity) => {
    const day = new Date(activity.start_date_local || activity.start_date).getDay();
    return day === 0 || day === 6;
  });
  const weekday = activities.length - weekend.length;
  const morning = activities.filter((activity) => {
    const hour = new Date(activity.start_date_local || activity.start_date).getHours();
    return hour < 12;
  }).length;
  const evening = activities.filter((activity) => {
    const hour = new Date(activity.start_date_local || activity.start_date).getHours();
    return hour >= 17;
  }).length;

  const meanSpeed =
    activities.reduce((sum, activity) => sum + (activity.average_speed ?? 0), 0) /
    Math.max(activities.length, 1);

  return [
    weekend.length >= weekday
      ? 'Weekend workouts dominate your recent sample.'
      : 'Weekday sessions are carrying most of your recent momentum.',
    morning >= evening ? 'Mornings are your sharpest training window.' : 'Evening sessions are your peak rhythm.',
    `Average pace across the sample trends around ${(meanSpeed * 3.6).toFixed(1)} km/h.`,
  ];
}

function createAchievements(
  allTime: DashboardAnalytics['allTimeTotals'],
  streak: number,
  activities: StravaActivity[],
): DashboardAnalytics['achievements'] {
  return [
    {
      title: 'Consistency Engine',
      description: 'Maintain a 3-day streak.',
      unlocked: streak >= 3,
    },
    {
      title: 'Century Builder',
      description: 'Log 100 km all-time.',
      unlocked: allTime.distance >= 100_000,
    },
    {
      title: 'Mountain Collector',
      description: 'Climb 1,000 m in the recent sample.',
      unlocked: activities.reduce((sum, activity) => sum + activity.total_elevation_gain, 0) >= 1_000,
    },
  ];
}

export function buildHeatmap(streams: ActivityStream[]): HeatmapOverlay {
  const width = 320;
  const height = 220;
  const flattened = streams.flatMap((stream) => stream.latlng);

  if (flattened.length === 0) {
    return {
      width,
      height,
      sampleCount: 0,
      paths: [],
    };
  }

  const lats = flattened.map(([lat]) => lat);
  const lngs = flattened.map(([, lng]) => lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const latSpan = Math.max(maxLat - minLat, 0.0001);
  const lngSpan = Math.max(maxLng - minLng, 0.0001);

  const paths = streams
    .filter((stream) => stream.latlng.length > 1)
    .map((stream, index) => {
      const d = stream.latlng
        .map(([lat, lng], pointIndex) => {
          const x = 16 + ((lng - minLng) / lngSpan) * (width - 32);
          const y = 16 + (1 - (lat - minLat) / latSpan) * (height - 32);
          return `${pointIndex === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
        })
        .join(' ');

      return {
        d,
        opacity: 0.12 + ((index + 1) / Math.max(streams.length, 1)) * 0.32,
      };
    });

  return {
    width,
    height,
    sampleCount: streams.length,
    paths,
  };
}

export function buildKudosAnalytics(entries: Array<{ activityId: number; kudoers: StravaKudoer[] }>): KudosAnalytics {
  const leaderboard = new Map<number, { name: string; avatarUrl: string; count: number }>();

  for (const entry of entries) {
    for (const athlete of entry.kudoers) {
      const existing = leaderboard.get(athlete.id);
      const name = `${athlete.firstname} ${athlete.lastname}`.trim();
      leaderboard.set(athlete.id, {
        name,
        avatarUrl: athlete.profile_medium ?? athlete.profile ?? '',
        count: (existing?.count ?? 0) + 1,
      });
    }
  }

  const people = [...leaderboard.entries()]
    .sort((left, right) => right[1].count - left[1].count)
    .slice(0, 6)
    .map(([id, value], index) => ({
      id,
      name: value.name,
      avatarUrl: value.avatarUrl,
      count: value.count,
      badges: [
        ...(index === 0 ? ['Top Fan'] : []),
        ...(value.count >= 3 ? ['Legend'] : []),
      ],
    }));

  return {
    sampleSize: entries.length,
    totalKudos: [...leaderboard.values()].reduce((sum, value) => sum + value.count, 0),
    people,
  };
}

export function buildSegmentInsights(
  segment: StravaSegment,
  activities: StravaActivity[],
): SegmentInsights {
  const efforts = activities.flatMap((activity) =>
    (activity.segment_efforts ?? []).filter((effort) => effort.segment?.id === segment.id),
  );

  const averageTimeSeconds =
    efforts.length > 0
      ? efforts.reduce((sum, effort) => sum + effort.elapsed_time, 0) / efforts.length
      : null;
  const bestTimeSeconds =
    segment.athlete_pr_effort?.elapsed_time ??
    (efforts.length > 0 ? Math.min(...efforts.map((effort) => effort.elapsed_time)) : null);
  const relativePerformance =
    averageTimeSeconds !== null && bestTimeSeconds !== null
      ? ((averageTimeSeconds - bestTimeSeconds) / bestTimeSeconds) * 100
      : null;

  return {
    segmentId: segment.id,
    segmentName: segment.name,
    bestTimeSeconds,
    averageTimeSeconds,
    attempts: efforts.length,
    relativePerformance,
    prDate: segment.athlete_pr_effort?.start_date_local ?? null,
    sampleSize: activities.length,
    prCount: efforts.filter((effort) => effort.pr_rank === 1).length,
  };
}

export function buildDashboardAnalytics({
  athlete,
  stats,
  activities,
  streams,
  windowDays,
  now = Date.now(),
}: {
  athlete: StravaAthlete;
  stats: StravaStats;
  activities: StravaActivity[];
  streams: ActivityStream[];
  windowDays: TimeWindow;
  now?: number;
}): DashboardAnalytics {
  const windowed = activities.filter((activity) => isWithinWindow(activity, windowDays, now));
  const allTime = extractTotals(stats, 'all_');
  const heatmap = buildHeatmap(streams);

  return {
    athlete,
    windowDays,
    allTimeTotals: {
      distance: allTime.distance,
      movingTime: allTime.moving_time,
      elevation: allTime.elevation_gain,
    },
    recentTotals: {
      distance: windowed.reduce((sum, activity) => sum + activity.distance, 0),
      movingTime: windowed.reduce((sum, activity) => sum + activity.moving_time, 0),
      elevation: windowed.reduce((sum, activity) => sum + activity.total_elevation_gain, 0),
      kudos: windowed.reduce((sum, activity) => sum + activity.kudos_count, 0),
      activityCount: windowed.length,
    },
    streak: computeStreak(activities, now),
    weeklyChart: bucketWeekly(activities, 8, now),
    monthlyChart: bucketMonthly(activities, 6, now),
    funFacts: createFunFacts(windowed, stats),
    insights: createInsights(windowed),
    achievements: createAchievements(
      {
        distance: allTime.distance,
        movingTime: allTime.moving_time,
        elevation: allTime.elevation_gain,
      },
      computeStreak(activities, now),
      windowed,
    ),
    heatmap,
    lastUpdated: new Date(now).toISOString(),
  };
}

export function buildInsightsPayload(dashboard: DashboardAnalytics): InsightsPayload {
  return {
    streak: dashboard.streak,
    funFacts: dashboard.funFacts,
    insights: dashboard.insights,
    achievements: dashboard.achievements,
  };
}
