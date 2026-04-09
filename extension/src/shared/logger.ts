type LogLevel = 'debug' | 'info' | 'warn' | 'error';

function log(level: LogLevel, scope: string, message: string, ...args: unknown[]) {
  const prefix = `[STRAVA Buddy][${scope}]`;
  const method = level === 'debug' ? 'log' : level;
  console[method](`${prefix} ${message}`, ...args);
}

export function createLogger(scope: string) {
  return {
    debug(message: string, ...args: unknown[]) {
      log('debug', scope, message, ...args);
    },
    info(message: string, ...args: unknown[]) {
      log('info', scope, message, ...args);
    },
    warn(message: string, ...args: unknown[]) {
      log('warn', scope, message, ...args);
    },
    error(message: string, ...args: unknown[]) {
      log('error', scope, message, ...args);
    },
  };
}
