import { createRoot, type Root } from 'react-dom/client';
import { createLogger } from '@/shared/logger';
import { ContentApp, type PageContext } from './app';
import styles from './styles.css?inline';

export interface MountSpec {
  mode: 'anchored' | 'floating';
  anchor: Element;
}

const ROOT_ID = 'strava-buddy-root';
const logger = createLogger('content:runtime');

const PAGE_SELECTORS = {
  dashboard: ['#dashboard-feed', '[data-testid="dashboard-feed"]', '.dashboard-feed', 'main'],
  activity: ['.activity-summary-container', '.details', '.activity-actions', 'main'],
  segment: ['.segment-map', '.sidebar.spans5', '.segment-view', 'main'],
};

export function parsePageContext(pathname: string): PageContext | null {
  if (pathname === '/' || pathname.startsWith('/dashboard')) {
    return { kind: 'dashboard' };
  }

  const activityMatch = pathname.match(/^\/activities\/(\d+)/);
  if (activityMatch) {
    return { kind: 'activity', activityId: Number(activityMatch[1]) };
  }

  const segmentMatch = pathname.match(/^\/segments\/(\d+)/);
  if (segmentMatch) {
    return { kind: 'segment', segmentId: Number(segmentMatch[1]) };
  }

  return null;
}

export function resolveMountSpec(doc: Document, page: PageContext): MountSpec {
  const selectors = PAGE_SELECTORS[page.kind];

  for (const selector of selectors) {
    const anchor = doc.querySelector(selector);
    if (anchor) {
      return {
        mode: selector === 'main' ? 'floating' : 'anchored',
        anchor,
      };
    }
  }

  return {
    mode: 'floating',
    anchor: doc.body,
  };
}

function ensureHost(spec: MountSpec): { host: HTMLElement; mountPoint: HTMLDivElement } {
  const existing = document.getElementById(ROOT_ID);

  if (existing) {
    existing.remove();
  }

  const host = document.createElement('section');
  host.id = ROOT_ID;
  host.dataset.mode = spec.mode;

  if (spec.mode === 'floating') {
    host.style.position = 'fixed';
    host.style.top = '88px';
    host.style.right = '20px';
    host.style.zIndex = '2147483646';
  } else {
    host.style.margin = '16px 0';
  }

  const shadowRoot = host.attachShadow({ mode: 'open' });
  const styleTag = document.createElement('style');
  styleTag.textContent = styles;
  const mountPoint = document.createElement('div');
  shadowRoot.append(styleTag, mountPoint);

  if (spec.mode === 'floating') {
    document.body.append(host);
  } else {
    spec.anchor.insertAdjacentElement('afterend', host);
  }

  return { host, mountPoint };
}

export function startRuntime() {
  let currentKey = '';
  let root: Root | null = null;

  function render() {
    const page = parsePageContext(window.location.pathname);

    if (!page) {
      logger.debug('No supported Strava page detected', { pathname: window.location.pathname });
      const existing = document.getElementById(ROOT_ID);
      existing?.remove();
      root?.unmount();
      root = null;
      currentKey = '';
      return;
    }

    const spec = resolveMountSpec(document, page);
    const nextKey = `${page.kind}:${spec.mode}:${window.location.pathname}`;

    if (nextKey === currentKey && document.getElementById(ROOT_ID)) {
      return;
    }

    logger.info('Rendering widget', { page, mountMode: spec.mode });
    currentKey = nextKey;
    root?.unmount();
    const { mountPoint } = ensureHost(spec);
    root = createRoot(mountPoint);
    root.render(<ContentApp floating={spec.mode === 'floating'} page={page} />);
  }

  const observer = new MutationObserver(() => {
    window.clearTimeout((window as Window & { __stravaElevateRender?: number }).__stravaElevateRender);
    (window as Window & { __stravaElevateRender?: number }).__stravaElevateRender = window.setTimeout(render, 80);
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  let lastHref = window.location.href;
  window.setInterval(() => {
    if (window.location.href !== lastHref) {
      logger.info('Detected navigation change', { from: lastHref, to: window.location.href });
      lastHref = window.location.href;
      render();
    }
  }, 600);

  logger.info('Starting content runtime');
  render();
}
