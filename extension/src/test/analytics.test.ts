import { buildDashboardAnalytics, buildHeatmap, buildKudosAnalytics, buildSegmentInsights, computeStreak } from '@/shared/analytics';
import type { StravaActivity, StravaSegment, StravaStats } from '@/shared/types';

const activities: StravaActivity[] = [
  {
    id: 1,
    name: 'Morning Ride',
    distance: 42_000,
    moving_time: 4_000,
    elapsed_time: 4_300,
    total_elevation_gain: 500,
    kudos_count: 12,
    achievement_count: 2,
    start_date: '2026-04-08T08:00:00Z',
    start_date_local: '2026-04-08T10:00:00Z',
    sport_type: 'Ride',
    average_speed: 10,
    start_latlng: [40, -73],
    segment_efforts: [
      {
        id: 11,
        name: 'Climb',
        elapsed_time: 340,
        pr_rank: 1,
        segment: { id: 999, name: 'Climb' },
      },
    ],
  },
  {
    id: 2,
    name: 'Lunch Run',
    distance: 12_000,
    moving_time: 3_200,
    elapsed_time: 3_400,
    total_elevation_gain: 120,
    kudos_count: 8,
    achievement_count: 1,
    start_date: '2026-04-07T12:00:00Z',
    start_date_local: '2026-04-07T14:00:00Z',
    sport_type: 'Run',
    average_speed: 4,
    start_latlng: [40.1, -73.1],
  },
];

const stats: StravaStats = {
  all_ride_totals: {
    count: 20,
    distance: 500_000,
    moving_time: 80_000,
    elapsed_time: 82_000,
    elevation_gain: 6_000,
  },
  all_run_totals: {
    count: 14,
    distance: 120_000,
    moving_time: 28_000,
    elapsed_time: 29_000,
    elevation_gain: 1_200,
  },
  biggest_climb_elevation_gain: 1_600,
};

describe('analytics builders', () => {
  it('computes streaks across consecutive days', () => {
    const streak = computeStreak(activities, new Date('2026-04-08T18:00:00Z').getTime());
    expect(streak).toBe(2);
  });

  it('builds dashboard analytics from live activity samples', () => {
    const dashboard = buildDashboardAnalytics({
      athlete: { id: 9, firstname: 'Alex', lastname: 'Rider' },
      stats,
      activities,
      streams: [{ id: 1, latlng: [[40, -73], [40.2, -73.2]] }],
      kudosEntries: [
        {
          activityId: 1,
          kudoers: [
            { id: 1, firstname: 'Sam', lastname: 'Hill' },
            { id: 2, firstname: 'Pat', lastname: 'Lee' },
          ],
        },
        {
          activityId: 2,
          kudoers: [
            { id: 1, firstname: 'Sam', lastname: 'Hill' },
            { id: 3, firstname: 'Alex', lastname: 'Stone' },
          ],
        },
      ],
      windowDays: 30,
      now: new Date('2026-04-08T18:00:00Z').getTime(),
    });

    expect(dashboard.recentTotals.activityCount).toBe(2);
    expect(dashboard.allTimeTotals.distance).toBe(620_000);
    expect(dashboard.heatmap.sampleCount).toBe(1);
    expect(dashboard.funFacts[0]).toContain('Longest recent activity');
    expect(dashboard.topKudoers).toHaveLength(3);
    expect(dashboard.topKudoers[0].name).toBe('Sam Hill');
  });

  it('aggregates recent kudoers into a leaderboard', () => {
    const kudos = buildKudosAnalytics([
      {
        activityId: 1,
        kudoers: [
          { id: 1, firstname: 'Sam', lastname: 'Hill' },
          { id: 2, firstname: 'Pat', lastname: 'Lee' },
        ],
      },
      {
        activityId: 2,
        kudoers: [
          { id: 1, firstname: 'Sam', lastname: 'Hill' },
          { id: 1, firstname: 'Sam', lastname: 'Hill' },
        ],
      },
    ]);

    expect(kudos.people[0].name).toBe('Sam Hill');
    expect(kudos.people[0].badges).toContain('Top Fan');
    expect(kudos.people[0].badges).toContain('Legend');
  });

  it('derives segment insights from sampled detailed activities', () => {
    const segment: StravaSegment = {
      id: 999,
      name: 'Climb',
      distance: 1000,
      athlete_pr_effort: {
        elapsed_time: 320,
        start_date_local: '2026-03-01T08:00:00Z',
      },
    };

    const insights = buildSegmentInsights(segment, activities);
    expect(insights.attempts).toBe(1);
    expect(insights.bestTimeSeconds).toBe(320);
    expect(insights.prCount).toBe(1);
  });

  it('builds a heatmap without blowing the stack on large stream samples', () => {
    const latlng = Array.from({ length: 50_000 }, (_, index) => [40 + index * 0.00001, -73 - index * 0.00001]);
    const heatmap = buildHeatmap([{ id: 1, latlng }]);

    expect(heatmap.sampleCount).toBe(1);
    expect(heatmap.paths).toHaveLength(1);
  });
});
