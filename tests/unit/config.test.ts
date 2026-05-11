import { describe, expect, test } from "vitest";
import { loadConfigFromEnv } from "../../src/config/config.js";

describe("loadConfigFromEnv", () => {
  test("fails fast when required Telegram config is missing", () => {
    expect(() => loadConfigFromEnv({}, { cwd: "/tmp/project", homeDir: "/tmp/home" })).toThrow(
      /CONFIG_INVALID/
    );
  });

  test("rejects malformed api id", () => {
    expect(() =>
      loadConfigFromEnv(
        { TELEGRAM_API_ID: "abc", TELEGRAM_API_HASH: "hash" },
        { cwd: "/tmp/project", homeDir: "/tmp/home" }
      )
    ).toThrow(/TELEGRAM_API_ID/);
  });

  test("loads required values and expands default session path", () => {
    const config = loadConfigFromEnv(
      { TELEGRAM_API_ID: "12345", TELEGRAM_API_HASH: "hash" },
      { cwd: "/tmp/project", homeDir: "/tmp/home" }
    );

    expect(config.telegramApiId).toBe(12345);
    expect(config.telegramApiHash).toBe("hash");
    expect(config.sessionPath).toBe("/tmp/home/.config/telegram-mcp/session");
    expect(config.logPath).toBe("/tmp/home/.local/state/telegram-mcp/server.jsonl");
  });

  test("treats blank optional paths as unset instead of resolving them to cwd", () => {
    const config = loadConfigFromEnv(
      {
        TELEGRAM_API_ID: "12345",
        TELEGRAM_API_HASH: "hash",
        TELEGRAM_SESSION_PATH: " ",
        TELEGRAM_LOG_PATH: ""
      },
      { cwd: "/tmp/project", homeDir: "/tmp/home" }
    );

    expect(config.sessionPath).toBe("/tmp/home/.config/telegram-mcp/session");
    expect(config.logPath).toBe("/tmp/home/.local/state/telegram-mcp/server.jsonl");
  });

  test("resolves custom session and log paths relative to cwd and home", () => {
    expect(
      loadConfigFromEnv(
        {
          TELEGRAM_API_ID: "12345",
          TELEGRAM_API_HASH: "hash",
          TELEGRAM_SESSION_PATH: "./sessions/main",
          TELEGRAM_LOG_PATH: "./logs/server.jsonl"
        },
        { cwd: "/tmp/project", homeDir: "/tmp/home" }
      )
    ).toMatchObject({
      sessionPath: "/tmp/project/sessions/main",
      logPath: "/tmp/project/logs/server.jsonl"
    });

    expect(
      loadConfigFromEnv(
        {
          TELEGRAM_API_ID: "12345",
          TELEGRAM_API_HASH: "hash",
          TELEGRAM_SESSION_PATH: "~/.telegram/session",
          TELEGRAM_LOG_PATH: "~/.telegram/logs/server.jsonl"
        },
        { cwd: "/tmp/project", homeDir: "/tmp/home" }
      )
    ).toMatchObject({
      sessionPath: "/tmp/home/.telegram/session",
      logPath: "/tmp/home/.telegram/logs/server.jsonl"
    });
  });
});
