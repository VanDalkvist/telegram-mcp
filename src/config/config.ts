import { resolve } from "node:path";
import { config as loadDotenv } from "dotenv";
import { z } from "zod";
import { AppError } from "../domain/errors.js";

export interface AppConfig {
  telegramApiId: number;
  telegramApiHash: string;
  sessionPath: string;
  logPath: string;
}

export interface ConfigLoadOptions {
  cwd?: string;
  homeDir?: string;
}

const optionalPath = z.preprocess(
  (value) => (typeof value === "string" && value.trim().length === 0 ? undefined : value),
  z.string().trim().min(1).optional()
);

const envSchema = z.object({
  TELEGRAM_API_ID: z
    .string()
    .trim()
    .regex(/^\d+$/, "TELEGRAM_API_ID must be a numeric string")
    .transform((value) => Number.parseInt(value, 10)),
  TELEGRAM_API_HASH: z.string().trim().min(1, "TELEGRAM_API_HASH is required"),
  TELEGRAM_SESSION_PATH: optionalPath,
  TELEGRAM_LOG_PATH: optionalPath
});

export function loadConfigFromDotenv(options: ConfigLoadOptions = {}): AppConfig {
  loadDotenv({ path: resolve(options.cwd ?? process.cwd(), ".env"), quiet: true });
  return loadConfigFromEnv(process.env, options);
}

export function loadConfigFromEnv(
  env: NodeJS.ProcessEnv | Record<string, string | undefined>,
  options: ConfigLoadOptions = {}
): AppConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    throw new AppError("CONFIG_INVALID", parsed.error.issues.map((issue) => issue.message).join("; "), {
      publicMessage: "Telegram MCP configuration is invalid",
      details: { issues: parsed.error.issues.map((issue) => issue.message) }
    });
  }

  const cwd = options.cwd ?? process.cwd();
  const homeDir = options.homeDir ?? process.env.HOME;
  if (homeDir === undefined || homeDir.trim().length === 0) {
    throw new AppError("CONFIG_INVALID", "HOME is required to resolve the default session path", {
      publicMessage: "Telegram MCP configuration is invalid"
    });
  }

  return {
    telegramApiId: parsed.data.TELEGRAM_API_ID,
    telegramApiHash: parsed.data.TELEGRAM_API_HASH,
    sessionPath: resolveConfigPath(
      parsed.data.TELEGRAM_SESSION_PATH ?? "~/.config/telegram-mcp/session",
      cwd,
      homeDir
    ),
    logPath: resolveConfigPath(
      parsed.data.TELEGRAM_LOG_PATH ?? "~/.local/state/telegram-mcp/server.jsonl",
      cwd,
      homeDir
    )
  };
}

function resolveConfigPath(value: string, cwd: string, homeDir: string): string {
  if (value === "~") {
    return homeDir;
  }

  if (value.startsWith("~/")) {
    return resolve(homeDir, value.slice(2));
  }

  return resolve(cwd, value);
}
