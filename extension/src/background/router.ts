import type {
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

export interface BackgroundService {
  getAuthStatus(): Promise<AuthStatus>;
  login(): Promise<AuthStatus>;
  logout(): Promise<AuthStatus>;
  getDashboard(windowDays?: 7 | 30 | 90): Promise<DashboardAnalytics>;
  getKudos(activityId?: number): Promise<KudosAnalytics>;
  getSegmentInsights(segmentId: number): Promise<SegmentInsights>;
  getHeatmap(): Promise<HeatmapOverlay>;
  getInsights(windowDays?: 7 | 30 | 90): Promise<InsightsPayload>;
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
  return async function route(message: RpcRequest): Promise<RpcResponse<unknown>> {
    try {
      switch (message.type) {
        case 'auth:status':
          return { ok: true, data: await service.getAuthStatus() };
        case 'auth:login':
          return { ok: true, data: await service.login() };
        case 'auth:logout':
          return { ok: true, data: await service.logout() };
        case 'stats:getDashboard':
          return { ok: true, data: await service.getDashboard(message.windowDays) };
        case 'stats:getKudos':
          return { ok: true, data: await service.getKudos(message.activityId) };
        case 'stats:getSegmentInsights':
          return { ok: true, data: await service.getSegmentInsights(message.segmentId) };
        case 'stats:getHeatmap':
          return { ok: true, data: await service.getHeatmap() };
        case 'stats:getInsights':
          return { ok: true, data: await service.getInsights(message.windowDays) };
        default:
          return toFailure(new RpcServiceError('UNKNOWN', 'Unsupported message.'));
      }
    } catch (error) {
      return toFailure(error);
    }
  };
}
