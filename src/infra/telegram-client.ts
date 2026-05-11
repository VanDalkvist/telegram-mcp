import { Logger, TelegramClient } from "telegram";
import { LogLevel } from "telegram/extensions/Logger.js";
import { StringSession } from "telegram/sessions/index.js";
import type { AppConfig } from "../config/config.js";
import type { GramJsLikeClient } from "./telegram-client-adapter.js";

export interface AuthenticatedGramJsLikeClient extends GramJsLikeClient {
  connect(): Promise<void>;
  checkAuthorization(): Promise<boolean>;
}

export function createGramJsClient(session: string, config: AppConfig): AuthenticatedGramJsLikeClient {
  return new TelegramClient(new StringSession(session), config.telegramApiId, config.telegramApiHash, {
    baseLogger: new Logger(LogLevel.NONE),
    connectionRetries: 5
  }) as unknown as AuthenticatedGramJsLikeClient;
}
