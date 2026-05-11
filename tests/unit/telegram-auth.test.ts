import { describe, expect, test, vi } from "vitest";
import type { AppConfig } from "../../src/config/config.js";
import { authenticateTelegramSession } from "../../src/infra/telegram-auth.js";

describe("authenticateTelegramSession", () => {
  test("checks authorization before saving the session", async () => {
    const session = { save: vi.fn(() => "session-string") };
    const sessionStore = { load: vi.fn(), save: vi.fn() };
    const client = {
      start: vi.fn().mockResolvedValue(undefined),
      connect: vi.fn().mockResolvedValue(undefined),
      checkAuthorization: vi.fn().mockResolvedValue(true)
    };

    await authenticateTelegramSession(makeConfig(), makePrompts(), {
      sessionStore,
      createSession: () => session,
      createClient: () => client
    });

    expect(client.start).toHaveBeenCalledOnce();
    expect(client.connect).toHaveBeenCalledOnce();
    expect(client.checkAuthorization).toHaveBeenCalledOnce();
    expect(session.save).toHaveBeenCalledOnce();
    expect(sessionStore.save).toHaveBeenCalledWith("session-string");
  });

  test("does not save an unauthorized session", async () => {
    const sessionStore = { load: vi.fn(), save: vi.fn() };
    const client = {
      start: vi.fn().mockResolvedValue(undefined),
      connect: vi.fn().mockResolvedValue(undefined),
      checkAuthorization: vi.fn().mockResolvedValue(false)
    };

    await expect(
      authenticateTelegramSession(makeConfig(), makePrompts(), {
        sessionStore,
        createSession: () => ({ save: vi.fn(() => "session-string") }),
        createClient: () => client
      })
    ).rejects.toMatchObject({ code: "AUTH_REQUIRED" });

    expect(sessionStore.save).not.toHaveBeenCalled();
  });
});

function makePrompts() {
  return {
    phoneNumber: vi.fn(),
    phoneCode: vi.fn(),
    password: vi.fn(),
    onError: vi.fn()
  };
}

function makeConfig(): AppConfig {
  return {
    telegramApiId: 123,
    telegramApiHash: "hash",
    sessionPath: "/tmp/session",
    logPath: "/tmp/log"
  };
}
