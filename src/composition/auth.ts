import type { AuthPrompts } from "../application/auth.js";
import type { AppConfig } from "../config/config.js";
import { authenticateTelegramSession, type TelegramAuthDeps } from "../infra/telegram-auth.js";

export type BuildTelegramAuthDeps = TelegramAuthDeps;

export function runTelegramAuthFlow(
  config: AppConfig,
  prompts: AuthPrompts,
  deps: BuildTelegramAuthDeps = {}
): Promise<void> {
  return authenticateTelegramSession(config, prompts, deps);
}
