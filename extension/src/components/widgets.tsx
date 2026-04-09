import type { ReactNode } from 'react';
import clsx from 'clsx';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatDistance, formatDuration, formatDurationCompact, formatElevation, formatPercent, formatShortDate } from '@/shared/format';
import type { DashboardAnalytics, KudosAnalytics, SegmentInsights } from '@/shared/types';

function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-3">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-400">{subtitle ?? 'Live Strava data'}</p>
        <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
      </div>
    </div>
  );
}

function Panel({
  className,
  children,
  floating,
}: {
  className?: string;
  children: ReactNode;
  floating?: boolean;
}) {
  return (
    <div
      className={clsx(
        'se-enter overflow-hidden rounded-[28px] border border-white/70 bg-white/90 text-slate-900 shadow-widget backdrop-blur-xl',
        floating ? 'w-[360px] max-w-[calc(100vw-24px)]' : 'w-full',
        className,
      )}
    >
      {children}
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 p-4">
      <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function Avatar({ src, name }: { src?: string; name: string }) {
  if (src) {
    return <img alt={name} className="h-11 w-11 rounded-full object-cover" src={src} />;
  }

  return (
    <div className="flex h-11 w-11 items-center justify-center rounded-full bg-lava-100 text-sm font-semibold text-lava-700">
      {name
        .split(' ')
        .slice(0, 2)
        .map((value) => value[0])
        .join('')}
    </div>
  );
}

export function AuthPrompt({
  errorMessage,
  loading,
  onConnect,
  pageLabel,
  floating,
}: {
  errorMessage?: string | null;
  loading: boolean;
  onConnect: () => void;
  pageLabel: string;
  floating?: boolean;
}) {
  return (
    <Panel floating={floating}>
      <div className="bg-gradient-to-br from-lava-500 via-lava-400 to-orange-300 px-6 py-6 text-white">
        <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-white/70">STRAVA Buddy</p>
        <h2 className="mt-3 text-2xl font-semibold">Unlock premium analytics on {pageLabel}.</h2>
        <p className="mt-2 text-sm text-white/85">
          Use the Strava account already open in this browser to render live dashboard stats, kudos intelligence,
          segment insights, and route heatmaps.
        </p>
      </div>
      <div className="space-y-4 px-6 py-5">
        <ul className="space-y-2 text-sm text-slate-600">
          <li>No client ID, secret, or local auth bridge required</li>
          <li>Dashboard totals, streaks, charts, and achievements</li>
          <li>Recent kudos leaderboard with fan badges</li>
          <li>Sampled segment performance and route heatmap</li>
        </ul>
        <p className="text-xs leading-5 text-slate-500">
          Make sure you are already signed in on `strava.com` in this browser before clicking connect.
        </p>
        {errorMessage ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {errorMessage}
          </div>
        ) : null}
        <button
          className="w-full rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
          disabled={loading}
          onClick={onConnect}
          type="button"
        >
          {loading ? 'Connecting...' : 'Use current Strava session'}
        </button>
      </div>
    </Panel>
  );
}

export function ErrorPanel({
  title,
  message,
  actionLabel,
  onAction,
  floating,
}: {
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  floating?: boolean;
}) {
  return (
    <Panel className="p-5" floating={floating}>
      <SectionTitle subtitle="Attention" title={title} />
      <p className="text-sm leading-6 text-slate-600">{message}</p>
      {actionLabel && onAction ? (
        <button
          className="mt-4 rounded-2xl bg-lava-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-lava-600"
          onClick={onAction}
          type="button"
        >
          {actionLabel}
        </button>
      ) : null}
    </Panel>
  );
}

export function LoadingPanel({ label, floating }: { label: string; floating?: boolean }) {
  return (
    <Panel className="p-5" floating={floating}>
      <div className="flex items-center gap-4">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-lava-200 border-t-lava-500" />
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Loading</p>
          <p className="text-sm text-slate-600">{label}</p>
        </div>
      </div>
    </Panel>
  );
}

export function DashboardWidget({
  data,
  windowDays,
  onWindowChange,
  onDisconnect,
  floating,
}: {
  data: DashboardAnalytics;
  windowDays: 7 | 30 | 90;
  onWindowChange: (windowDays: 7 | 30 | 90) => void;
  onDisconnect: () => void;
  floating?: boolean;
}) {
  return (
    <Panel floating={floating}>
      <div className="bg-[radial-gradient(circle_at_top_left,_rgba(252,82,0,0.26),_transparent_42%),linear-gradient(135deg,_#ffffff,_#f8fafc)] px-6 py-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-lava-500">Dashboard Overlay</p>
            <h2 className="mt-2 text-2xl font-semibold text-slate-900">
              {data.athlete.firstname} {data.athlete.lastname}
            </h2>
            <p className="mt-1 text-sm text-slate-500">Live Strava analytics with sampled recent activity insights.</p>
          </div>
          <button
            className="rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-xs font-semibold text-slate-500 transition hover:border-slate-300 hover:text-slate-700"
            onClick={onDisconnect}
            type="button"
          >
            Disconnect
          </button>
        </div>

        <div className="mt-5 flex gap-2">
          {[7, 30, 90].map((value) => (
            <button
              key={value}
              className={clsx(
                'rounded-full px-3 py-1.5 text-xs font-semibold transition',
                windowDays === value
                  ? 'bg-slate-900 text-white'
                  : 'bg-white/80 text-slate-500 hover:bg-white hover:text-slate-900',
              )}
              onClick={() => onWindowChange(value as 7 | 30 | 90)}
              type="button"
            >
              {value}d
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-6 px-6 py-6">
        <div className="grid grid-cols-2 gap-3">
          <MetricCard label="Distance" value={formatDistance(data.recentTotals.distance)} />
          <MetricCard label="Moving Time" value={formatDuration(data.recentTotals.movingTime)} />
          <MetricCard label="Elevation" value={formatElevation(data.recentTotals.elevation)} />
          <MetricCard label="Kudos" value={data.recentTotals.kudos.toString()} />
        </div>

        <div className="grid grid-cols-3 gap-3 rounded-3xl bg-slate-950 px-5 py-4 text-white">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-white/50">All-time distance</p>
            <p className="mt-2 text-lg font-semibold">{formatDistance(data.allTimeTotals.distance)}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-white/50">All-time climb</p>
            <p className="mt-2 text-lg font-semibold">{formatElevation(data.allTimeTotals.elevation)}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-white/50">Streak</p>
            <p className="mt-2 text-lg font-semibold">{data.streak} days</p>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <div className="rounded-3xl border border-slate-200 p-4">
            <SectionTitle subtitle="Trend" title="Weekly Distance" />
            <div className="h-52">
              <ResponsiveContainer height="100%" width="100%">
                <AreaChart data={data.weeklyChart}>
                  <defs>
                    <linearGradient id="distanceFill" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stopColor="#fc5200" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="#fc5200" stopOpacity={0.03} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} axisLine={false} />
                  <Tooltip />
                  <Area dataKey="distanceKm" fill="url(#distanceFill)" stroke="#fc5200" strokeWidth={2} type="monotone" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 p-4">
            <SectionTitle subtitle="Trend" title="Monthly Kudos" />
            <div className="h-52">
              <ResponsiveContainer height="100%" width="100%">
                <BarChart data={data.monthlyChart}>
                  <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} axisLine={false} />
                  <Tooltip />
                  <Bar dataKey="kudos" fill="#132033" radius={[10, 10, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-3xl border border-slate-200 p-4">
            <SectionTitle subtitle="Heatmap" title="Recent Route Blend" />
            {data.heatmap.paths.length > 0 ? (
              <svg className="w-full rounded-3xl bg-slate-950/95 p-3" viewBox={`0 0 ${data.heatmap.width} ${data.heatmap.height}`}>
                <rect fill="url(#bgFade)" height={data.heatmap.height} rx="20" width={data.heatmap.width} x="0" y="0" />
                <defs>
                  <linearGradient id="bgFade" x1="0" x2="1" y1="0" y2="1">
                    <stop offset="0%" stopColor="#0f172a" />
                    <stop offset="100%" stopColor="#1e293b" />
                  </linearGradient>
                </defs>
                {data.heatmap.paths.map((path, index) => (
                  <path
                    key={`${path.d}-${index}`}
                    d={path.d}
                    fill="none"
                    opacity={path.opacity}
                    stroke="#fb923c"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="3"
                  />
                ))}
              </svg>
            ) : (
              <p className="text-sm text-slate-500">No route stream sample available yet.</p>
            )}
            <p className="mt-3 text-xs uppercase tracking-[0.18em] text-slate-400">
              Sample size: {data.heatmap.sampleCount} recent activities
            </p>
          </div>

          <div className="space-y-4">
            <div className="rounded-3xl border border-slate-200 p-4">
              <SectionTitle subtitle="Fun Facts" title="Highlights" />
              <div className="space-y-3 text-sm leading-6 text-slate-600">
                {data.funFacts.map((fact) => (
                  <p key={fact}>{fact}</p>
                ))}
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 p-4">
              <SectionTitle subtitle="Insights" title="Patterns" />
              <div className="space-y-3 text-sm leading-6 text-slate-600">
                {data.insights.map((insight) => (
                  <p key={insight}>{insight}</p>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 p-4">
          <SectionTitle subtitle="Achievements" title="Lightweight Badges" />
          <div className="grid gap-3 md:grid-cols-3">
            {data.achievements.map((achievement) => (
              <div
                key={achievement.title}
                className={clsx(
                  'rounded-2xl border px-4 py-4',
                  achievement.unlocked
                    ? 'border-lava-200 bg-lava-50'
                    : 'border-slate-200 bg-slate-50',
                )}
              >
                <p className="text-sm font-semibold text-slate-900">{achievement.title}</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">{achievement.description}</p>
                <p className="mt-3 text-xs font-semibold uppercase tracking-[0.2em] text-lava-500">
                  {achievement.unlocked ? 'Unlocked' : 'In Progress'}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Panel>
  );
}

export function KudosWidget({ data, floating }: { data: KudosAnalytics; floating?: boolean }) {
  return (
    <Panel className="p-5" floating={floating}>
      <SectionTitle subtitle="Recent activity sample" title="Kudos Analytics" />
      <div className="mb-4 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
        Ranked from the newest {data.sampleSize} activities. Sampled to respect Strava API limits.
      </div>
      <div className="space-y-3">
        {data.people.length > 0 ? (
          data.people.map((person) => (
            <div key={person.id} className="flex items-center justify-between rounded-2xl border border-slate-200 px-4 py-3">
              <div className="flex items-center gap-3">
                <Avatar name={person.name} src={person.avatarUrl} />
                <div>
                  <p className="font-semibold text-slate-900">{person.name}</p>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {person.badges.map((badge) => (
                      <span
                        key={badge}
                        className="rounded-full bg-lava-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-lava-600"
                      >
                        {badge}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              <div className="text-right">
                <p className="text-xl font-semibold text-slate-900">{person.count}</p>
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">kudos</p>
              </div>
            </div>
          ))
        ) : (
          <p className="text-sm text-slate-500">No recent kudoers available yet.</p>
        )}
      </div>
    </Panel>
  );
}

export function SegmentWidget({ data, floating }: { data: SegmentInsights; floating?: boolean }) {
  return (
    <Panel className="p-5" floating={floating}>
      <SectionTitle subtitle="Segment View" title={data.segmentName} />
      <div className="grid grid-cols-2 gap-3">
        <MetricCard label="Best Time" value={data.bestTimeSeconds ? formatDurationCompact(data.bestTimeSeconds) : 'n/a'} />
        <MetricCard
          label="Average Sample"
          value={data.averageTimeSeconds ? formatDurationCompact(Math.round(data.averageTimeSeconds)) : 'n/a'}
        />
        <MetricCard label="Attempts" value={data.attempts.toString()} />
        <MetricCard label="Relative" value={formatPercent(data.relativePerformance)} />
      </div>

      <div className="mt-5 rounded-3xl bg-slate-950 px-5 py-4 text-white">
        <p className="text-xs uppercase tracking-[0.2em] text-white/50">PR highlight</p>
        <p className="mt-2 text-lg font-semibold">
          {data.prDate ? `PR on ${formatShortDate(data.prDate)}` : 'No PR date returned by Strava'}
        </p>
        <p className="mt-2 text-sm text-white/75">
          {data.prCount} PR-tagged efforts found in the sampled detailed activities. Sample size: {data.sampleSize}.
        </p>
      </div>
    </Panel>
  );
}
