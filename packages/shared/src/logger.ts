import pino from 'pino';

const base = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  formatters: {
    level: (label) => ({ level: label }),
  },
});

interface LogContext {
  jobId?: string;
  channelId?: string;
}

export function createLogger(context: LogContext) {
  return base.child(context);
}
