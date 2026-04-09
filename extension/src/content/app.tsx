import { useEffect, useState } from 'react';
import { AuthPrompt, DashboardWidget, ErrorPanel, KudosWidget, LoadingPanel, SegmentWidget } from '@/components/widgets';
import type {
  AuthStatus,
  DashboardAnalytics,
  KudosAnalytics,
  RpcRequest,
  RpcResponse,
  SegmentInsights,
  TimeWindow,
} from '@/shared/types';

export type PageContext =
  | { kind: 'dashboard' }
  | { kind: 'activity'; activityId: number }
  | { kind: 'segment'; segmentId: number };

function sendMessage<T>(message: RpcRequest): Promise<RpcResponse<T>> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response: RpcResponse<T>) => {
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

  useEffect(() => {
    void sendMessage<AuthStatus>({ type: 'auth:status' }).then((response) => {
      if (response.ok) {
        setAuthStatus(response.data);
      }
    });
  }, []);

  async function handleConnect() {
    setAuthBusy(true);
    const response = await sendMessage<AuthStatus>({ type: 'auth:login' });
    setAuthBusy(false);

    if (response.ok) {
      setAuthStatus(response.data);
    }
  }

  async function handleDisconnect() {
    setAuthBusy(true);
    const response = await sendMessage<AuthStatus>({ type: 'auth:logout' });
    setAuthBusy(false);

    if (response.ok) {
      setAuthStatus(response.data);
    }
  }

  if (!authStatus) {
    return <LoadingPanel floating={floating} label="Checking Strava connection status..." />;
  }

  if (!authStatus.authenticated) {
    return <AuthPrompt floating={floating} loading={authBusy} onConnect={handleConnect} pageLabel={pageLabel(page)} />;
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
        setData(response.data);
      } else {
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
        setData(response.data);
      } else {
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
        setData(response.data);
      } else {
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
