import { parsePageContext, resolveMountSpec } from '@/content/runtime';

describe('content runtime mounting', () => {
  it('detects supported Strava pages', () => {
    expect(parsePageContext('/dashboard')).toEqual({ kind: 'dashboard' });
    expect(parsePageContext('/activities/123456')).toEqual({ kind: 'activity', activityId: 123456 });
    expect(parsePageContext('/segments/77')).toEqual({ kind: 'segment', segmentId: 77 });
    expect(parsePageContext('/clubs/77')).toBeNull();
  });

  it('anchors to a preferred selector when available', () => {
    document.body.innerHTML = '<main><div id="dashboard-feed"></div></main>';
    const spec = resolveMountSpec(document, { kind: 'dashboard' });
    expect(spec.mode).toBe('anchored');
    expect((spec.anchor as HTMLElement).id).toBe('dashboard-feed');
  });

  it('falls back to a floating widget when the page anchor is missing', () => {
    document.body.innerHTML = '<main><div class="other-node"></div></main>';
    const spec = resolveMountSpec(document, { kind: 'segment', segmentId: 99 });
    expect(spec.mode).toBe('floating');
    expect(spec.anchor.tagName).toBe('MAIN');
  });
});
