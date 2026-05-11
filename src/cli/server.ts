import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfigFromDotenv } from "../config/config.js";
import { toPublicError } from "../domain/errors.js";
import { createLazyTelegramQueries } from "../composition/create-app.js";
import { JsonFileLogger } from "../infra/logger.js";
import { createMcpServer } from "../interface/mcp-server.js";

export async function runServer(): Promise<void> {
  try {
    const config = loadConfigFromDotenv();
    const logger = new JsonFileLogger(config.logPath);
    await logger.info("server_starting", {
      operation: "mcp_server",
      correlation_id: `process-${process.pid}`,
      outcome: "started",
      pid: process.pid
    });
    const queries = createLazyTelegramQueries(config);
    const server = createMcpServer(queries, { logger });
    await server.connect(new StdioServerTransport());
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ error: toPublicError(error) })}\n`);
    process.exitCode = 1;
  }
}
