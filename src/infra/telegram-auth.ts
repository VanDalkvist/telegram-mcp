import { Logger, TelegramClient } from "telegram";
import { LogLevel } from "telegram/extensions/Logger.js";
import { StringSession } from "telegram/sessions/index.js";
import type { AuthPrompts } from "../application/auth.js";
import type { AppConfig } from "../config/config.js";
import { AppError, normalizeTelegramError } from "../domain/errors.js";
import { FileSessionStore, type SessionStore } from "./file-session-store.js";

export interface TelegramAuthClient {
  start(prompts: AuthPrompts): Promise<void>;
  connect(): Promise<void>;
  checkAuthorization(): Promise<boolean>;
}

export interface TelegramAuthSession {
  save(): string;
}

export interface TelegramAuthDeps {
  sessionStore?: SessionStore;
  createSession?: () => TelegramAuthSession;
  createClient?: (session: TelegramAuthSession, config: AppConfig) => TelegramAuthClient;
}

export async function authenticateTelegramSession(
  config: AppConfig,
  prompts: AuthPrompts,
  deps: TelegramAuthDeps = {}
): Promise<void> {
  const sessionStore = deps.sessionStore ?? new FileSessionStore(config.sessionPath);
  const session = deps.createSession?.() ?? new StringSession("");
  const createClient = deps.createClient ?? createGramJsAuthClient;
  const client = createClient(session, config);

  try {
    await client.start(prompts);
    await client.connect();
    if (!(await client.checkAuthorization())) {
      throw new AppError("AUTH_REQUIRED", "Saved Telegram session did not pass authorization check", {
        publicMessage: "Telegram authorization is required"
      });
    }
    await sessionStore.save(session.save());
  } catch (error) {
    throw normalizeKnownAuthError(error);
  }
}

function createGramJsAuthClient(session: TelegramAuthSession, config: AppConfig): TelegramAuthClient {
  return new TelegramClient(session as StringSession, config.telegramApiId, config.telegramApiHash, {
    baseLogger: new Logger(LogLevel.WARN),
    connectionRetries: 5
  }) as unknown as TelegramAuthClient;
}

function normalizeKnownAuthError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }

  return normalizeTelegramError(error);
}
