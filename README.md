# Strava Elevate MVP

A Chrome Extension (Manifest V3) that enhances the Strava web experience with dashboard analytics, kudos intelligence, segment insights, streaks, charts, and a live-data route heatmap.

## Workspace

- `extension/`: Chrome MV3 extension built with React, Vite, TypeScript, Tailwind, and Recharts
- `auth-bridge/`: local Fastify service that owns Strava OAuth token exchange and refresh

## Prerequisites

- Node.js 20+
- `pnpm` 10+ (recommended)
- A Strava API application from `https://www.strava.com/settings/api`

## Environment

Create `auth-bridge/.env`:

```bash
STRAVA_CLIENT_ID=your_client_id
STRAVA_CLIENT_SECRET=your_client_secret
STRAVA_REDIRECT_URI=http://127.0.0.1:8787/auth/strava/callback
AUTH_BRIDGE_PORT=8787
```

Create `extension/.env.local`:

```bash
VITE_AUTH_BRIDGE_BASE_URL=http://127.0.0.1:8787
```

## Install

```bash
pnpm install
pnpm build
```

If `pnpm` is not available, `npm install` also works because the repo uses standard workspace manifests in addition to `pnpm-workspace.yaml`.

## Run The Auth Bridge

```bash
pnpm --filter auth-bridge dev
```

The Strava app callback domain must allow `127.0.0.1`.

## Load The Extension

1. Open `chrome://extensions`
2. Enable Developer mode
3. Click Load unpacked
4. Select `extension/dist`
5. Open `https://www.strava.com/dashboard`
6. Use the injected Connect with Strava button

## Development

```bash
pnpm --filter extension build --watch
pnpm --filter auth-bridge dev
pnpm test
```

## Architecture

- Background service worker manages OAuth, token refresh, Strava API requests, caching, and message RPC.
- Content script mounts page-aware widgets inside Shadow DOM roots and reinjects after Strava DOM changes.
- Shared analytics utilities aggregate dashboard totals, charts, streaks, achievements, kudos rankings, segment comparisons, and route heatmap geometry.
- `chrome.storage.local` stores auth state and cached API responses.

## What Works

- Real Strava OAuth through the local auth bridge
- Access token storage, refresh-token rotation, and manual deauthorization
- Dashboard analytics overlay with totals, recent-window cards, weekly and monthly charts, streaks, fun facts, insights, achievements, and route heatmap
- Kudos analytics sampled from the most recent activities
- Segment insights based on the current segment and sampled recent detailed activities
- Fallback floating widgets when preferred Strava anchors are not available
- Unit and integration tests for analytics logic, auth bridge flows, background routing, and content mount resolution

## What Is Mocked

- None by default. All user-facing analytics are derived from live Strava API data.

## API Limitations

- Kudos analytics are sampled from recent activities to avoid excessive API usage.
- Segment relative performance is derived from recently fetched detailed activities because the full segment efforts list endpoint is subscription-gated.
- Heatmap routes use cached stream samples from the newest activities instead of loading every historical activity.
- Athlete stats returned by Strava exclude activities that are not visible to Everyone.
