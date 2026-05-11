import { mkdir, appendFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { AppLogger, LogFields, LogSeverity } from "../application/logger.js";

export class JsonFileLogger implements AppLogger {
  public constructor(
    private readonly logPath: string,
    private readonly now: () => Date = () => new Date()
  ) {}

  public debug(event: string, fields: LogFields = {}): Promise<void> {
    return this.write("debug", event, fields);
  }

  public info(event: string, fields: LogFields = {}): Promise<void> {
    return this.write("info", event, fields);
  }

  public warn(event: string, fields: LogFields = {}): Promise<void> {
    return this.write("warn", event, fields);
  }

  public error(event: string, fields: LogFields = {}): Promise<void> {
    return this.write("error", event, fields);
  }

  private async write(severity: LogSeverity, event: string, fields: LogFields): Promise<void> {
    await mkdir(dirname(this.logPath), { recursive: true });
    const record = {
      ...fields,
      timestamp: this.now().toISOString(),
      severity,
      event
    };
    await appendFile(this.logPath, `${JSON.stringify(record)}\n`, "utf8");
  }
}
