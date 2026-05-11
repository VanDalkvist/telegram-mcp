import { beforeEach, describe, expect, test, vi } from "vitest";
import { AppError } from "../../src/domain/errors.js";
import { runServerWithDeps } from "../../src/cli/server.js";
import type { AppConfig } from "../../src/config/config.js";
import type { TelegramQueries } from "../../src/application/telegram-queries.js";

describe("runServerWithDeps", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    process.exitCode = undefined;
  });

  test("checks Telegram readiness before connecting MCP stdio", async () => {
    const queries = { listChats: vi.fn() } as unknown as TelegramQueries;
    const runtime = { queries, dispose: vi.fn().mockResolvedValue(undefined) };
    const connect = vi.fn().mockResolvedValue(undefined);
    const buildRuntime = vi.fn().mockResolvedValue(runtime);
    const createServer = vi.fn().mockReturnValue({ connect });

    await runServerWithDeps({
      loadConfig: () => makeConfig(),
      createLogger: () => ({ info: vi.fn().mockResolvedValue(undefined), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
      buildRuntime,
      createServer,
      createTransport: () => ({}) as never
    });

    expect(buildRuntime).toHaveBeenCalledOnce();
    expect(createServer).toHaveBeenCalledWith(queries, expect.any(Object));
    expect(connect).toHaveBeenCalledOnce();
    expect(buildRuntime.mock.invocationCallOrder[0]).toBeLessThan(connect.mock.invocationCallOrder[0]!);
  });

  test("does not expose MCP tools when Telegram auth is invalid", async () => {
    const connect = vi.fn();
    const createServer = vi.fn().mockReturnValue({ connect });
    const stderrWrite = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    await runServerWithDeps({
      loadConfig: () => makeConfig(),
      createLogger: () => ({ info: vi.fn().mockResolvedValue(undefined), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
      buildRuntime: vi.fn().mockRejectedValue(
        new AppError("AUTH_REQUIRED", "Telegram session is not authorized", {
          publicMessage: "Telegram authorization is required"
        })
      ),
      createServer,
      createTransport: () => ({}) as never
    });

    expect(createServer).not.toHaveBeenCalled();
    expect(connect).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
    expect(stderrWrite.mock.calls[0]![0]).toContain("AUTH_REQUIRED");
  });

  test("disposes initialized Telegram queries if MCP transport connection fails", async () => {
    const dispose = vi.fn().mockResolvedValue(undefined);
    const queries = { listChats: vi.fn() } as unknown as TelegramQueries;
    const runtime = { queries, dispose };
    const connect = vi.fn().mockRejectedValue(new Error("transport failed"));
    const stderrWrite = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    await runServerWithDeps({
      loadConfig: () => makeConfig(),
      createLogger: () => ({ info: vi.fn().mockResolvedValue(undefined), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
      buildRuntime: vi.fn().mockResolvedValue(runtime),
      createServer: vi.fn().mockReturnValue({ connect }),
      createTransport: () => ({}) as never
    });

    expect(dispose).toHaveBeenCalledOnce();
    expect(process.exitCode).toBe(1);
    expect(stderrWrite.mock.calls[0]![0]).toContain("INTERNAL_ERROR");
  });
});

function makeConfig(): AppConfig {
  return {
    telegramApiId: 123,
    telegramApiHash: "hash",
    sessionPath: "/tmp/session",
    logPath: "/tmp/telegram-mcp/server.jsonl"
  };
}
