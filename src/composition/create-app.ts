import type { AppConfig } from "../config/config.js";
import { AppError, normalizeTelegramError } from "../domain/errors.js";
import { FileSessionStore, type SessionStore } from "../infra/file-session-store.js";
import { createGramJsClient, type AuthenticatedGramJsLikeClient } from "../infra/telegram-client.js";
import { TelegramClientAdapter } from "../infra/telegram-client-adapter.js";
import type { TelegramQueries } from "../application/telegram-queries.js";

export interface BuildTelegramQueriesDeps {
  sessionStore?: SessionStore;
  createClient?: (session: string, config: AppConfig) => AuthenticatedGramJsLikeClient;
  startupTimeoutMs?: number;
}

export interface TelegramRuntime {
  queries: TelegramQueries;
  dispose(): Promise<void>;
}

const DEFAULT_STARTUP_TIMEOUT_MS = 30_000;

export async function buildTelegramRuntime(
  config: AppConfig,
  deps: BuildTelegramQueriesDeps = {}
): Promise<TelegramRuntime> {
  const sessionStore = deps.sessionStore ?? new FileSessionStore(config.sessionPath);
  const session = await loadSession(sessionStore);
  const createClient = deps.createClient ?? createGramJsClient;
  const client = createClient(session, config);
  const startupTimeoutMs = deps.startupTimeoutMs ?? DEFAULT_STARTUP_TIMEOUT_MS;

  try {
    await withStartupTimeout(client.connect(), "connect", startupTimeoutMs);
    if (!(await withStartupTimeout(client.checkAuthorization(), "checkAuthorization", startupTimeoutMs))) {
      throw new AppError("AUTH_REQUIRED", "Telegram session is not authorized", {
        publicMessage: "Telegram authorization is required"
      });
    }
  } catch (error) {
    await disconnectClientAfterStartupFailure(client);
    throw normalizeKnownError(error);
  }

  return {
    queries: new TelegramClientAdapter(client),
    dispose: () => disconnectClient(client)
  };
}

async function withStartupTimeout<T>(operation: Promise<T>, stage: string, timeoutMs: number): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      reject(
        new AppError("TELEGRAM_ERROR", `Telegram startup timed out during ${stage} after ${timeoutMs}ms`, {
          publicMessage: "Telegram connection timed out",
          details: {
            stage,
            timeout_ms: timeoutMs
          }
        })
      );
    }, timeoutMs);
  });

  try {
    return await Promise.race([operation, timeoutPromise]);
  } finally {
    if (timeout !== undefined) {
      clearTimeout(timeout);
    }
  }
}

async function loadSession(sessionStore: SessionStore): Promise<string> {
  try {
    return await sessionStore.load();
  } catch (error) {
    throw normalizeKnownError(error);
  }
}

function normalizeKnownError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }

  if (isRecord(error) && error.code === "AUTH_REQUIRED") {
    return new AppError("AUTH_REQUIRED", "Telegram session is missing or invalid", {
      publicMessage: "Telegram authorization is required",
      cause: error
    });
  }

  return normalizeTelegramError(error);
}

async function disconnectClient(client: AuthenticatedGramJsLikeClient): Promise<void> {
  await client.disconnect?.();
}

async function disconnectClientAfterStartupFailure(client: AuthenticatedGramJsLikeClient): Promise<void> {
  try {
    await disconnectClient(client);
  } catch {
    // Preserve the original startup/auth error; the server logs cleanup failures after runtime ownership begins.
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
