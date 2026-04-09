import type { RpcRequest } from '@/shared/types';
import { createMessageRouter } from './router';
import { createBackgroundService } from './service';

const service = createBackgroundService();
const routeMessage = createMessageRouter(service);

chrome.runtime.onMessage.addListener((message: RpcRequest, _sender, sendResponse) => {
  routeMessage(message)
    .then((response) => sendResponse(response))
    .catch((error) =>
      sendResponse({
        ok: false,
        error: {
          code: 'UNKNOWN',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
      }),
    );

  return true;
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'strava:refresh-token') {
    void service.getAuthStatus();
  }
});
