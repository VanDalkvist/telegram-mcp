import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfigFromDotenv } from "../config/config.js";
import { toPublicError } from "../domain/errors.js";
import { buildTelegramRuntime } from "../composition/create-app.js";
import { JsonFileLogger } from "../infra/logger.js";
import { createMcpServer } from "../interface/mcp-server.js";
import type { AppConfig } from "../config/config.js";
import type { AppLogger } from "../application/logger.js";
import type { TelegramRuntime } from "../composition/create-app.js";

export interface RunServerDeps {
  loadConfig: () => AppConfig;
  createLogger: (logPath: string) => AppLogger;
  buildRuntime: (config: AppConfig) => Promise<TelegramRuntime>;
  createServer: typeof createMcpServer;
  createTransport: () => StdioServerTransport;
}

export async function runServer(): Promise<void> {
  return runServerWithDeps({
    loadConfig: loadConfigFromDotenv,
    createLogger: (logPath) => new JsonFileLogger(logPath),
    buildRuntime: buildTelegramRuntime,
    createServer: createMcpServer,
    createTransport: () => new StdioServerTransport()
  });
}

export async function runServerWithDeps(deps: RunServerDeps): Promise<void> {
  let runtime: TelegramRuntime | undefined;
  try {
    const config = deps.loadConfig();
    const logger = deps.createLogger(config.logPath);
    await logger.info("server_starting", {
      operation: "mcp_server",
      correlation_id: `process-${process.pid}`,
      outcome: "started",
      pid: process.pid
    });
    runtime = await deps.buildRuntime(config);
    const server = deps.createServer(runtime.queries, { logger });
    await server.connect(deps.createTransport());
  } catch (error) {
    await disposeRuntime(runtime);
    process.stderr.write(`${JSON.stringify({ error: toPublicError(error) })}\n`);
    process.exitCode = 1;
  }
}

async function disposeRuntime(runtime: TelegramRuntime | undefined): Promise<void> {
  if (runtime === undefined) {
    return;
  }
  try {
    await runtime.dispose();
  } catch (error) {
    process.stderr.write(
      `${JSON.stringify({
        error: {
          code: "CLEANUP_FAILED",
          message: "Failed to dispose Telegram MCP queries after startup failure",
          cause: error instanceof Error ? error.message : String(error)
        }
      })}\n`
    );
  }
}
