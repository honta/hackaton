# STRAVA Buddy

A Chrome Extension (Manifest V3) that enhances the Strava web experience with dashboard analytics, kudos intelligence, segment insights, streaks, charts, and a live-data route heatmap.

## Workspace

- `extension/`: Chrome MV3 extension built with React, Vite, TypeScript, Tailwind, and Recharts
- `auth-bridge/`: local Fastify service that handles the Strava OAuth exchange and token refresh

## Prerequisites

- Node.js 20+
- `pnpm` 10+ (recommended)
- A Strava OAuth client

## Install

```bash
corepack pnpm install
```

If `pnpm` is not installed globally, `corepack` will provision it automatically.

## Configure OAuth

Create `auth-bridge/.env` from the example and fill in your Strava app credentials:

```bash
cp auth-bridge/.env.example auth-bridge/.env
```

Required values:

- `STRAVA_CLIENT_ID`
- `STRAVA_CLIENT_SECRET`
- `STRAVA_REDIRECT_URI`
- `AUTH_BRIDGE_PORT`

For local development, `STRAVA_REDIRECT_URI` should point to the bridge callback, for example:

```text
http://127.0.0.1:8787/auth/strava/callback
```

## Run Dev

Start everything from the repo root with one command:

```bash
corepack pnpm dev
```

What this does:

- installs dependencies if they are missing
- starts the extension build watcher
- starts the auth-bridge watcher when `auth-bridge/.env` exists
- waits for `extension/dist` to be ready

The command keeps the watcher running until you press `Ctrl+C`.

## Load The Extension

1. Open `chrome://extensions`
2. Enable Developer mode
3. Click Load unpacked
4. Select `extension/dist`
5. Open `https://www.strava.com/dashboard`
6. Click the injected `Connect with Strava OAuth` button
7. Complete the OAuth redirect flow

If the extension is already loaded and you rebuild, click the Reload button on the extension card in Chrome.

## Manual Commands

```bash
corepack pnpm --filter extension build --watch
corepack pnpm --filter auth-bridge dev
corepack pnpm test
```

## OAuth Login

- The extension uses the local `auth-bridge` service for the Strava OAuth code exchange.
- Access and refresh tokens are stored in `chrome.storage.local`.
- The background worker refreshes expired access tokens through the bridge.
- If you click Disconnect, the extension clears local cache and asks Strava to deauthorize the current token.

## Architecture

- Background service worker manages OAuth auth state, Strava API requests, caching, and message RPC.
- Content script mounts page-aware widgets inside Shadow DOM roots and reinjects after Strava DOM changes.
- Shared analytics utilities aggregate dashboard totals, charts, streaks, achievements, kudos rankings, segment comparisons, and route heatmap geometry.
- `chrome.storage.local` stores auth state and cached API responses.

## What Works

- OAuth login through the local bridge
- Local token persistence and refresh inside the extension
- Dashboard analytics overlay with totals, recent-window cards, weekly and monthly charts, streaks, fun facts, insights, achievements, and route heatmap
- Kudos analytics sampled from the most recent activities
- Segment insights based on the current segment and sampled recent detailed activities
- Fallback floating widgets when preferred Strava anchors are not available
- Unit and integration tests for analytics logic, session auth flow, background routing, and content mount resolution

## What Is Mocked

- None by default. All user-facing analytics are derived from live Strava data when OAuth is configured and authenticated.

## API Limitations

- Kudos analytics are sampled from recent activities to avoid excessive API usage.
- Segment relative performance is derived from recently fetched detailed activities because the full segment efforts list endpoint is subscription-gated.
- Heatmap routes use cached stream samples from the newest activities instead of loading every historical activity.
- Athlete stats returned by Strava exclude activities that are not visible to Everyone.
- The bridge must be running locally for login, token refresh, and logout deauthorization.
