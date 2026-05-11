import { mkdir, mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "vitest";
import { JsonFileLogger } from "../../src/infra/logger.js";

describe("JsonFileLogger", () => {
  test("writes append-only JSONL records and creates parent directories", async () => {
    const root = await mkdtemp(join(tmpdir(), "telegram-mcp-logs-"));
    const logPath = join(root, "nested", "server.jsonl");
    const logger = new JsonFileLogger(logPath, () => new Date("2026-05-08T10:00:00.000Z"));

    await logger.info("server_starting", { pid: 123 });
    await logger.error("tool_call_failed", { tool: "telegram_search_messages" });

    const lines = (await readFile(logPath, "utf8")).trim().split("\n").map((line) => JSON.parse(line));
    expect(lines).toEqual([
      {
        timestamp: "2026-05-08T10:00:00.000Z",
        severity: "info",
        event: "server_starting",
        pid: 123
      },
      {
        timestamp: "2026-05-08T10:00:00.000Z",
        severity: "error",
        event: "tool_call_failed",
        tool: "telegram_search_messages"
      }
    ]);
  });

  test("fails when the configured log path points at a directory", async () => {
    const root = await mkdtemp(join(tmpdir(), "telegram-mcp-log-dir-"));
    const logPath = join(root, "server.jsonl");
    await mkdir(logPath);
    const logger = new JsonFileLogger(logPath);

    await expect(logger.info("server_starting")).rejects.toThrow();
  });
});
