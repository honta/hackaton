import type { RpcRequest } from '@/shared/types';
import { createLogger } from '@/shared/logger';
import { createMessageRouter } from './router';
import { createBackgroundService } from './service';

const logger = createLogger('background:rpc');
const service = createBackgroundService();
const routeMessage = createMessageRouter(service);

chrome.runtime.onMessage.addListener((message: RpcRequest, _sender, sendResponse) => {
  logger.info('Received message', message);
  routeMessage(message, { tabId: _sender.tab?.id })
    .then((response) => {
      logger.info('Sending response', response);
      sendResponse(response);
    })
    .catch((error) => {
      logger.error('Unhandled message failure', error);
      sendResponse({
        ok: false,
        error: {
          code: 'UNKNOWN',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
      });
    });

  return true;
});
