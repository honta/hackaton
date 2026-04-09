# Strava Elevate MVP

A Chrome Extension (Manifest V3) that enhances the Strava web experience with dashboard analytics, kudos intelligence, segment insights, streaks, charts, and a live-data route heatmap.

## Workspace

- `extension/`: Chrome MV3 extension built with React, Vite, TypeScript, Tailwind, and Recharts
- `auth-bridge/`: legacy OAuth bridge kept in the repo, but no longer required for the default demo flow

## Prerequisites

- Node.js 20+
- `pnpm` 10+ (recommended)
- An active Strava login in the same Chrome profile where the extension will run

## Install

```bash
corepack pnpm install
```

If `pnpm` is not installed globally, `corepack` will provision it automatically.

## Run Dev

Start everything from the repo root with one command:

```bash
corepack pnpm dev
```

What this does:

- installs dependencies if they are missing
- starts the extension build watcher
- waits for `extension/dist` to be ready

The command keeps the watcher running until you press `Ctrl+C`.

## Load The Extension

1. Open `chrome://extensions`
2. Enable Developer mode
3. Click Load unpacked
4. Select `extension/dist`
5. Open `https://www.strava.com/dashboard`
6. Open `https://www.strava.com/dashboard` while already signed in to Strava
7. Click the injected `Use current Strava session` button

If the extension is already loaded and you rebuild, click the Reload button on the extension card in Chrome.

## Manual Commands

```bash
corepack pnpm --filter extension build --watch
corepack pnpm test
```

## Session-Based Login

- The extension does not require a Strava client ID or secret for the default flow.
- Authentication uses the existing logged-in Strava browser session.
- If you sign out of Strava, click Disconnect in the extension overlay or reconnect after signing back in.

## Architecture

- Background service worker manages browser-session auth state, Strava API requests, caching, and message RPC.
- Content script mounts page-aware widgets inside Shadow DOM roots and reinjects after Strava DOM changes.
- Shared analytics utilities aggregate dashboard totals, charts, streaks, achievements, kudos rankings, segment comparisons, and route heatmap geometry.
- `chrome.storage.local` stores auth state and cached API responses.

## What Works

- One-click login using the active Strava browser session
- Local session persistence inside the extension without manual OAuth setup
- Dashboard analytics overlay with totals, recent-window cards, weekly and monthly charts, streaks, fun facts, insights, achievements, and route heatmap
- Kudos analytics sampled from the most recent activities
- Segment insights based on the current segment and sampled recent detailed activities
- Fallback floating widgets when preferred Strava anchors are not available
- Unit and integration tests for analytics logic, session auth flow, background routing, and content mount resolution

## What Is Mocked

- None by default. All user-facing analytics are derived from live Strava data when the current browser session is authenticated.

## API Limitations

- Kudos analytics are sampled from recent activities to avoid excessive API usage.
- Segment relative performance is derived from recently fetched detailed activities because the full segment efforts list endpoint is subscription-gated.
- Heatmap routes use cached stream samples from the newest activities instead of loading every historical activity.
- Athlete stats returned by Strava exclude activities that are not visible to Everyone.
- Session-backed requests depend on Strava continuing to expose the current browser session to the endpoints used by the extension.
