export type AppErrorCode =
  | "AUTH_REQUIRED"
  | "CONFIG_INVALID"
  | "CHAT_NOT_FOUND"
  | "CHAT_AMBIGUOUS"
  | "FOLDER_NOT_FOUND"
  | "FOLDER_AMBIGUOUS"
  | "MESSAGE_NOT_FOUND"
  | "ACCESS_DENIED"
  | "RATE_LIMITED"
  | "TELEGRAM_ERROR"
  | "INTERNAL_ERROR";

export interface AppErrorOptions {
  publicMessage?: string;
  details?: Record<string, unknown>;
  cause?: unknown;
  retryAfterSeconds?: number;
}

export class AppError extends Error {
  public readonly code: AppErrorCode;
  public readonly publicMessage: string;
  public readonly details: Record<string, unknown> | undefined;
  public readonly retryAfterSeconds: number | undefined;

  public constructor(code: AppErrorCode, message: string, options: AppErrorOptions = {}) {
    super(`${code}: ${message}`);
    this.name = "AppError";
    this.code = code;
    this.publicMessage = options.publicMessage ?? message;
    this.details = options.details;
    this.retryAfterSeconds = options.retryAfterSeconds;

    if (options.cause !== undefined) {
      this.cause = options.cause;
    }
  }
}

export interface PublicError {
  code: AppErrorCode;
  message: string;
  details?: Record<string, unknown>;
  retry_after_seconds?: number;
}

export function toPublicError(error: unknown): PublicError {
  if (error instanceof AppError) {
    const publicError: PublicError = {
      code: error.code,
      message: error.publicMessage
    };

    if (error.details !== undefined) {
      publicError.details = error.details;
    }

    if (error.retryAfterSeconds !== undefined) {
      publicError.retry_after_seconds = error.retryAfterSeconds;
    }

    return publicError;
  }

  return {
    code: "INTERNAL_ERROR",
    message: "Unexpected internal error"
  };
}

export function normalizeTelegramError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }

  const errorMessage = readErrorMessage(error);

  if (/FLOOD_WAIT/i.test(errorMessage)) {
    const retryAfterSeconds = readRetryAfterSeconds(error, errorMessage);
    const options: AppErrorOptions = {
      publicMessage: "Telegram rate limited the request",
      cause: error
    };
    if (retryAfterSeconds !== undefined) {
      options.retryAfterSeconds = retryAfterSeconds;
    }
    return new AppError("RATE_LIMITED", `Telegram rate limited the request: ${errorMessage}`, options);
  }

  if (/AUTH_KEY|SESSION|USER_DEACTIVATED|PHONE_CODE_EXPIRED/i.test(errorMessage)) {
    return new AppError("AUTH_REQUIRED", `Telegram session is not authorized: ${errorMessage}`, {
      publicMessage: "Telegram authorization is required",
      cause: error
    });
  }

  if (/CHAT_ADMIN_REQUIRED|CHANNEL_PRIVATE|USER_PRIVACY_RESTRICTED|FORBIDDEN/i.test(errorMessage)) {
    return new AppError("ACCESS_DENIED", `Telegram access denied: ${errorMessage}`, {
      publicMessage: "Telegram access denied",
      cause: error
    });
  }

  const details = buildTelegramErrorDetails(error);
  const options: AppErrorOptions = {
    publicMessage: "Telegram request failed",
    cause: error
  };
  if (details !== undefined) {
    options.details = details;
  }
  return new AppError("TELEGRAM_ERROR", `Telegram request failed: ${errorMessage}`, options);
}

function readErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }

  if (isRecord(error)) {
    const value = error.errorMessage ?? error.message ?? error.code;
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }

  return "UNKNOWN";
}

function readRetryAfterSeconds(error: unknown, errorMessage: string): number | undefined {
  if (isRecord(error) && typeof error.seconds === "number") {
    return error.seconds;
  }

  const match = errorMessage.match(/FLOOD_WAIT_?(\d+)/i);
  if (match?.[1] !== undefined) {
    return Number.parseInt(match[1], 10);
  }

  return undefined;
}

function buildTelegramErrorDetails(error: unknown): Record<string, unknown> | undefined {
  const details: Record<string, unknown> = {};

  if (isRecord(error)) {
    if (typeof error.code === "number" || typeof error.code === "string") {
      details.telegram_error_code = error.code;
    }

    if (typeof error.name === "string" && error.name.length > 0 && error.name !== "Error") {
      details.telegram_error_name = error.name;
    }
  } else if (error instanceof Error && error.name.length > 0 && error.name !== "Error") {
    details.telegram_error_name = error.name;
  }

  return Object.keys(details).length === 0 ? undefined : details;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
