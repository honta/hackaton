import type {
  AuthStartPayload,
  AuthStatus,
  DashboardAnalytics,
  HeatmapOverlay,
  InsightsPayload,
  KudosAnalytics,
  RpcErrorCode,
  RpcRequest,
  RpcResponse,
  SegmentInsights,
} from '@/shared/types';

export interface RequestContext {
  tabId?: number;
}

export interface BackgroundService {
  getAuthStatus(context?: RequestContext): Promise<AuthStatus>;
  startAuth(returnTo: string): Promise<AuthStartPayload>;
  consumeSession(sessionId: string): Promise<AuthStatus>;
  login(context?: RequestContext): Promise<AuthStatus>;
  logout(context?: RequestContext): Promise<AuthStatus>;
  getDashboard(context?: RequestContext, windowDays?: 7 | 30 | 90): Promise<DashboardAnalytics>;
  getKudos(context?: RequestContext, activityId?: number): Promise<KudosAnalytics>;
  getSegmentInsights(context: RequestContext | undefined, segmentId: number): Promise<SegmentInsights>;
  getHeatmap(context?: RequestContext): Promise<HeatmapOverlay>;
  getInsights(context?: RequestContext, windowDays?: 7 | 30 | 90): Promise<InsightsPayload>;
}

export class RpcServiceError extends Error {
  constructor(
    public readonly code: RpcErrorCode,
    message: string,
    public readonly retryAt?: number,
  ) {
    super(message);
  }
}

function toFailure(error: unknown): RpcResponse<never> {
  if (error instanceof RpcServiceError) {
    return {
      ok: false,
      error: {
        code: error.code,
        message: error.message,
        retryAt: error.retryAt,
      },
    };
  }

  return {
    ok: false,
    error: {
      code: 'UNKNOWN',
      message: error instanceof Error ? error.message : 'Unknown error',
    },
  };
}

export function createMessageRouter(service: BackgroundService) {
  return async function route(message: RpcRequest, context?: RequestContext): Promise<RpcResponse<unknown>> {
    try {
      switch (message.type) {
        case 'auth:status':
          return { ok: true, data: await service.getAuthStatus(context) };
        case 'auth:start':
          return { ok: true, data: await service.startAuth(message.returnTo) };
        case 'auth:consume':
          return { ok: true, data: await service.consumeSession(message.sessionId) };
        case 'auth:login':
          return { ok: true, data: await service.login(context) };
        case 'auth:logout':
          return { ok: true, data: await service.logout(context) };
        case 'stats:getDashboard':
          return { ok: true, data: await service.getDashboard(context, message.windowDays) };
        case 'stats:getKudos':
          return { ok: true, data: await service.getKudos(context, message.activityId) };
        case 'stats:getSegmentInsights':
          return { ok: true, data: await service.getSegmentInsights(context, message.segmentId) };
        case 'stats:getHeatmap':
          return { ok: true, data: await service.getHeatmap(context) };
        case 'stats:getInsights':
          return { ok: true, data: await service.getInsights(context, message.windowDays) };
        default:
          return toFailure(new RpcServiceError('UNKNOWN', 'Unsupported message.'));
      }
    } catch (error) {
      return toFailure(error);
    }
  };
}
