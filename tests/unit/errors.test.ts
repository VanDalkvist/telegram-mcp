import { describe, expect, test } from "vitest";
import { AppError, normalizeTelegramError, toPublicError } from "../../src/domain/errors.js";

describe("AppError", () => {
  test("keeps public error shape explicit", () => {
    const err = new AppError("CHAT_AMBIGUOUS", "Multiple chats match", {
      publicMessage: "Chat reference is ambiguous",
      details: { candidates: 2 }
    });

    expect(toPublicError(err)).toEqual({
      code: "CHAT_AMBIGUOUS",
      message: "Chat reference is ambiguous",
      details: { candidates: 2 }
    });
  });

  test("maps Telegram flood wait to RATE_LIMITED", () => {
    const normalized = normalizeTelegramError({ errorMessage: "FLOOD_WAIT_30", seconds: 30 });

    expect(normalized).toMatchObject({
      code: "RATE_LIMITED",
      retryAfterSeconds: 30
    });
  });

  test("maps auth-like Telegram errors to AUTH_REQUIRED", () => {
    expect(normalizeTelegramError({ errorMessage: "AUTH_KEY_UNREGISTERED" })).toMatchObject({
      code: "AUTH_REQUIRED"
    });
  });

  test("does not expose raw Telegram diagnostics for unknown Telegram errors", () => {
    const normalized = normalizeTelegramError({
      errorMessage: "SEARCH_QUERY_TOO_SHORT",
      code: 400
    });

    expect(toPublicError(normalized)).toEqual({
      code: "TELEGRAM_ERROR",
      message: "Telegram request failed",
      details: {
        telegram_error_code: 400
      }
    });
  });
});
