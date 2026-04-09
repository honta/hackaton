import { useEffect, useState } from 'react';
import { AuthPrompt, DashboardWidget, ErrorPanel, KudosWidget, LoadingPanel, SegmentWidget } from '@/components/widgets';
import { createLogger } from '@/shared/logger';
import type {
  AuthStatus,
  DashboardAnalytics,
  KudosAnalytics,
  RpcRequest,
  RpcResponse,
  SegmentInsights,
  TimeWindow,
} from '@/shared/types';

const logger = createLogger('content:app');

export type PageContext =
  | { kind: 'dashboard' }
  | { kind: 'activity'; activityId: number }
  | { kind: 'segment'; segmentId: number };

function sendMessage<T>(message: RpcRequest): Promise<RpcResponse<T>> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response: RpcResponse<T>) => {
      logger.debug('RPC completed', { message, response });
      resolve(response);
    });
  });
}

function pageLabel(page: PageContext): string {
  switch (page.kind) {
    case 'dashboard':
      return 'your dashboard';
    case 'activity':
      return 'this activity';
    case 'segment':
      return 'this segment';
  }
}

export function ContentApp({ page, floating }: { page: PageContext; floating?: boolean }) {
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    void sendMessage<AuthStatus>({ type: 'auth:status' }).then((response) => {
      if (response.ok) {
        logger.info('Loaded auth status', response.data);
        setAuthStatus(response.data);
      }
    });
  }, []);

  async function handleConnect() {
    setAuthError(null);
    logger.info('Connect button clicked');
    setAuthBusy(true);
    const response = await sendMessage<AuthStatus>({ type: 'auth:login' });
    setAuthBusy(false);

    if (response.ok) {
      logger.info('Connect succeeded', response.data);
      setAuthStatus(response.data);
    } else {
      logger.warn('Connect failed', response.error);
      setAuthError(response.error.message);
    }
  }

  async function handleDisconnect() {
    logger.info('Disconnect button clicked');
    setAuthBusy(true);
    const response = await sendMessage<AuthStatus>({ type: 'auth:logout' });
    setAuthBusy(false);

    if (response.ok) {
      logger.info('Disconnect succeeded');
      setAuthStatus(response.data);
    } else {
      logger.warn('Disconnect failed', response.error);
    }
  }

  if (!authStatus) {
    return <LoadingPanel floating={floating} label="Checking Strava connection status..." />;
  }

  if (!authStatus.authenticated) {
    return (
      <AuthPrompt
        errorMessage={authError}
        floating={floating}
        loading={authBusy}
        onConnect={handleConnect}
        pageLabel={pageLabel(page)}
      />
    );
  }

  return <AuthenticatedContent floating={floating} onDisconnect={handleDisconnect} page={page} />;
}

function AuthenticatedContent({
  page,
  onDisconnect,
  floating,
}: {
  page: PageContext;
  onDisconnect: () => void;
  floating?: boolean;
}) {
  if (page.kind === 'dashboard') {
    return <DashboardContent floating={floating} onDisconnect={onDisconnect} />;
  }

  if (page.kind === 'activity') {
    return <KudosContent floating={floating} />;
  }

  return <SegmentContent floating={floating} page={page} />;
}

function DashboardContent({ onDisconnect, floating }: { onDisconnect: () => void; floating?: boolean }) {
  const [windowDays, setWindowDays] = useState<TimeWindow>(30);
  const [data, setData] = useState<DashboardAnalytics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setData(null);

    void sendMessage<DashboardAnalytics>({ type: 'stats:getDashboard', windowDays }).then((response) => {
      if (cancelled) {
        return;
      }

      if (response.ok) {
        logger.info('Dashboard analytics loaded', { windowDays });
        setData(response.data);
      } else {
        logger.warn('Dashboard analytics failed', response.error);
        setError(response.error.message);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [windowDays, reloadTick]);

  if (error) {
    return (
      <ErrorPanel
        actionLabel="Retry"
        floating={floating}
        message={error}
        onAction={() => setReloadTick((value) => value + 1)}
        title="Dashboard unavailable"
      />
    );
  }

  if (!data) {
    return <LoadingPanel floating={floating} label="Building dashboard analytics..." />;
  }

  return (
    <DashboardWidget
      data={data}
      floating={floating}
      onDisconnect={onDisconnect}
      onWindowChange={(nextWindow) => setWindowDays(nextWindow)}
      windowDays={windowDays}
    />
  );
}

function KudosContent({ floating }: { floating?: boolean }) {
  const [data, setData] = useState<KudosAnalytics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void sendMessage<KudosAnalytics>({ type: 'stats:getKudos' }).then((response) => {
      if (cancelled) {
        return;
      }

      if (response.ok) {
        logger.info('Kudos analytics loaded');
        setData(response.data);
      } else {
        logger.warn('Kudos analytics failed', response.error);
        setError(response.error.message);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [reloadTick]);

  if (error) {
    return (
      <ErrorPanel
        actionLabel="Retry"
        floating={floating}
        message={error}
        onAction={() => setReloadTick((value) => value + 1)}
        title="Kudos analytics unavailable"
      />
    );
  }

  if (!data) {
    return <LoadingPanel floating={floating} label="Loading kudos analytics..." />;
  }

  return <KudosWidget data={data} floating={floating} />;
}

function SegmentContent({ page, floating }: { page: Extract<PageContext, { kind: 'segment' }>; floating?: boolean }) {
  const [data, setData] = useState<SegmentInsights | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void sendMessage<SegmentInsights>({ type: 'stats:getSegmentInsights', segmentId: page.segmentId }).then((response) => {
      if (cancelled) {
        return;
      }

      if (response.ok) {
        logger.info('Segment insights loaded', { segmentId: page.segmentId });
        setData(response.data);
      } else {
        logger.warn('Segment insights failed', response.error);
        setError(response.error.message);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [page.segmentId, reloadTick]);

  if (error) {
    return (
      <ErrorPanel
        actionLabel="Retry"
        floating={floating}
        message={error}
        onAction={() => setReloadTick((value) => value + 1)}
        title="Segment insights unavailable"
      />
    );
  }

  if (!data) {
    return <LoadingPanel floating={floating} label="Computing segment insights..." />;
  }

  return <SegmentWidget data={data} floating={floating} />;
}
