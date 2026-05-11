export type LogSeverity = "debug" | "info" | "warn" | "error";

export interface LogFields {
  [key: string]: unknown;
}

export interface AppLogger {
  debug(event: string, fields?: LogFields): Promise<void>;
  info(event: string, fields?: LogFields): Promise<void>;
  warn(event: string, fields?: LogFields): Promise<void>;
  error(event: string, fields?: LogFields): Promise<void>;
}

export const noopLogger: AppLogger = {
  debug: async () => undefined,
  info: async () => undefined,
  warn: async () => undefined,
  error: async () => undefined
};
