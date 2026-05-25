import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { createHash, randomUUID } from "node:crypto";
import type { AppLogger } from "../application/logger.js";
import { noopLogger } from "../application/logger.js";
import type { TelegramQueries } from "../application/telegram-queries.js";
import { type PublicError, toPublicError } from "../domain/errors.js";
import { createToolHandlers } from "./mcp-tools.js";
import { toolSchemas, type ToolName } from "./tool-schemas.js";
import { telegramDownloadProfilePhotoDescription } from "./tools/telegram-download-profile-photo.js";
import { telegramGetProfilePhotoInfoDescription } from "./tools/telegram-get-profile-photo-info.js";

export interface McpServerOptions {
  logger?: AppLogger;
}

export function createMcpServer(queries: TelegramQueries, options: McpServerOptions = {}): McpServer {
  const server = new McpServer({
    name: "telegram-mcp",
    version: "0.1.0"
  });
  const handlers = createToolHandlers(queries);
  const logger = options.logger ?? noopLogger;

  registerTool(server, logger, "telegram_list_folders", "List Telegram folders/dialog filters visible to the authorized user.", handlers.telegram_list_folders);
  registerTool(server, logger, "telegram_resolve_folder", "Resolve a Telegram folder/dialog filter title, id, or folder_ref into a stable folder_ref.", handlers.telegram_resolve_folder);
  registerTool(server, logger, "telegram_list_chats", "List recent Telegram chats visible to the authorized user.", handlers.telegram_list_chats);
  registerTool(server, logger, "telegram_list_folder_chats", "List Telegram chats inside one resolved folder/dialog filter.", handlers.telegram_list_folder_chats);
  registerTool(server, logger, "telegram_list_folder_chats_page", "Page through Telegram chats inside one resolved folder/dialog filter. This is the inventory tool for large folders before per-chat message reads.", handlers.telegram_list_folder_chats_page);
  registerTool(server, logger, "telegram_search_chats", "Search Telegram chats, groups, channels, and users by query.", handlers.telegram_search_chats);
  registerTool(server, logger, "telegram_resolve_chat", "Resolve a user-provided chat reference into a stable chat_ref.", handlers.telegram_resolve_chat);
  registerTool(server, logger, "telegram_get_chat", "Get metadata for a resolved Telegram chat.", handlers.telegram_get_chat);
  registerTool(server, logger, "telegram_search_messages", "Search Telegram messages globally, inside one resolved chat, or across a Telegram folder/dialog filter.", handlers.telegram_search_messages);
  registerTool(server, logger, "telegram_get_recent_messages", "Read recent Telegram messages by date window inside one chat or one small folder. Folder-wide reads are capped at 50 chats; for larger folders use telegram_list_folder_chats_page, then call this tool per chat_ref.", handlers.telegram_get_recent_messages);
  registerTool(server, logger, "telegram_search_messages_page", "Search Telegram messages with cursor pagination support for chat and global scopes.", handlers.telegram_search_messages_page);
  registerTool(server, logger, "telegram_search_messages_batch", "Run several bounded Telegram message searches and return grouped plus deduped results.", handlers.telegram_search_messages_batch);
  registerTool(server, logger, "telegram_search_media", "Search Telegram messages by media filter such as links, documents, photos, or videos.", handlers.telegram_search_media);
  registerTool(server, logger, "telegram_get_messages", "Read message history for a resolved Telegram chat.", handlers.telegram_get_messages);
  registerTool(server, logger, "telegram_get_message", "Read one Telegram message by chat_ref and message id.", handlers.telegram_get_message);
  registerTool(
    server,
    logger,
    "telegram_get_message_context",
    "Read one Telegram message with neighboring messages from the same chat.",
    handlers.telegram_get_message_context
  );
  registerTool(server, logger, "telegram_get_thread", "Read replies for a Telegram message.", handlers.telegram_get_thread);
  registerTool(server, logger, "telegram_get_discussion", "Read discussion messages linked to a Telegram channel post.", handlers.telegram_get_discussion);
  registerTool(server, logger, "telegram_get_search_counters", "Read Telegram search counters by media filter for one chat.", handlers.telegram_get_search_counters);
  registerTool(server, logger, "telegram_get_chat_participants", "Read bounded Telegram chat participant summaries.", handlers.telegram_get_chat_participants);
  registerTool(server, logger, "telegram_get_profile_photo_info", telegramGetProfilePhotoInfoDescription, handlers.telegram_get_profile_photo_info);
  registerTool(server, logger, "telegram_download_profile_photo", telegramDownloadProfilePhotoDescription, handlers.telegram_download_profile_photo);

  return server;
}

function registerTool(
  server: McpServer,
  logger: AppLogger,
  name: ToolName,
  description: string,
  handler: (input: unknown) => Promise<unknown>
): void {
  server.registerTool(
    name,
    {
      description,
      inputSchema: toolSchemas[name]
    },
    async (args: unknown): Promise<CallToolResult> => {
      const startedAt = Date.now();
      const correlationId = randomUUID();
      await writeToolLog(logger, "info", "tool_call_started", {
        operation: name,
        correlation_id: correlationId,
        outcome: "started",
        ...summarizeToolArgsForLog(name, args)
      });

      try {
        const result = await handler(args);
        await writeToolLog(logger, "info", "tool_call_completed", {
          operation: name,
          correlation_id: correlationId,
          outcome: "success",
          duration_ms: Date.now() - startedAt
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          structuredContent: asStructuredContent(result)
        };
      } catch (error) {
        const publicError = toPublicError(error);
        const logError = sanitizePublicErrorForLog(publicError);
        await writeToolLog(logger, severityForPublicError(publicError), "tool_call_failed", {
          operation: name,
          correlation_id: correlationId,
          outcome: outcomeForPublicError(publicError),
          duration_ms: Date.now() - startedAt,
          error_type: errorTypeForPublicError(publicError),
          error_code: logError.code,
          error_message: logError.message,
          error_details: logError.details
        });
        return {
          isError: true,
          content: [{ type: "text", text: JSON.stringify({ error: publicError }, null, 2) }],
          structuredContent: { error: publicError }
        };
      }
    }
  );
}

export function sanitizePublicErrorForLog(error: PublicError): PublicError {
  const sanitized: PublicError = {
    code: error.code,
    message: error.message
  };
  const details = sanitizePublicErrorDetails(error.details);
  if (details !== undefined) {
    sanitized.details = details;
  }
  if (error.retry_after_seconds !== undefined) {
    sanitized.retry_after_seconds = error.retry_after_seconds;
  }
  return sanitized;
}

export function summarizeToolArgsForLog(name: ToolName, args: unknown): Record<string, unknown> {
  const summary: Record<string, unknown> = {};
  if (!isRecord(args)) {
    return summary;
  }

  for (const key of ["limit", "type", "from_date", "to_date", "before_message_id", "after_message_id", "message_id", "before", "after", "folder_chat_limit", "media_type", "filter", "overwrite"]) {
    const value = args[key];
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      summary[key] = value;
    }
  }

  if (typeof args.query === "string") {
    summary.query_length = args.query.length;
  }

  if (Array.isArray(args.queries)) {
    summary.queries_count = args.queries.length;
    summary.queries_total_length = args.queries.reduce((total, value) => total + (typeof value === "string" ? value.length : 0), 0);
  }

  if (Array.isArray(args.media_types)) {
    summary.media_types_count = args.media_types.length;
  }

  if (typeof args.cursor === "string") {
    summary.cursor_sha256 = sha256(args.cursor);
  }

  if (typeof args.ref === "string") {
    summary.ref_sha256 = sha256(args.ref);
  }

  if (typeof args.chat_ref === "string") {
    summary.chat_ref_sha256 = sha256(args.chat_ref);
  }

  if (typeof args.peer_ref === "string") {
    summary.peer_ref_sha256 = sha256(args.peer_ref);
  }

  if (typeof args.folder_ref === "string") {
    summary.folder_ref_sha256 = sha256(args.folder_ref);
  }

  if (typeof args.output_file === "string") {
    summary.output_file_sha256 = sha256(args.output_file);
  }

  if (
    name === "telegram_search_messages" ||
    name === "telegram_get_recent_messages" ||
    name === "telegram_search_messages_page" ||
    name === "telegram_search_messages_batch" ||
    name === "telegram_search_media"
  ) {
    summary.scope = typeof args.chat_ref === "string" ? "chat" : typeof args.folder_ref === "string" ? "folder" : "global";
  }

  if (name === "telegram_get_profile_photo_info" || name === "telegram_download_profile_photo") {
    summary.scope = "peer";
  }

  return summary;
}

function sanitizePublicErrorDetails(details: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (details === undefined) {
    return undefined;
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(details)) {
    if (Array.isArray(value)) {
      sanitized[`${key}_count`] = value.length;
      continue;
    }
    if (typeof value === "number" || typeof value === "boolean") {
      sanitized[key] = value;
    }
  }

  return Object.keys(sanitized).length > 0 ? sanitized : undefined;
}

async function writeToolLog(
  logger: AppLogger,
  severity: "info" | "warn" | "error",
  event: string,
  fields: Record<string, unknown>
): Promise<void> {
  try {
    await logger[severity](event, fields);
  } catch (error) {
    process.stderr.write(
      `${JSON.stringify({
        error: {
          code: "LOG_WRITE_FAILED",
          message: "Failed to write Telegram MCP diagnostic log",
          event,
          cause: error instanceof Error ? error.message : String(error)
        }
      })}\n`
    );
  }
}

function severityForPublicError(error: PublicError): "warn" | "error" {
  if (["CONFIG_INVALID", "AUTH_REQUIRED", "ACCESS_DENIED", "CHAT_NOT_FOUND", "CHAT_AMBIGUOUS", "FOLDER_NOT_FOUND", "FOLDER_AMBIGUOUS", "MESSAGE_NOT_FOUND", "RATE_LIMITED"].includes(error.code)) {
    return "warn";
  }

  return "error";
}

function outcomeForPublicError(error: PublicError): "rejected" | "failed" {
  if (["CONFIG_INVALID", "AUTH_REQUIRED", "ACCESS_DENIED", "CHAT_NOT_FOUND", "CHAT_AMBIGUOUS", "FOLDER_NOT_FOUND", "FOLDER_AMBIGUOUS", "MESSAGE_NOT_FOUND", "RATE_LIMITED"].includes(error.code)) {
    return "rejected";
  }

  return "failed";
}

function errorTypeForPublicError(error: PublicError): string {
  switch (error.code) {
    case "CONFIG_INVALID":
      return "validation_error";
    case "AUTH_REQUIRED":
      return "auth_error";
    case "ACCESS_DENIED":
      return "access_denied";
    case "CHAT_NOT_FOUND":
    case "FOLDER_NOT_FOUND":
    case "MESSAGE_NOT_FOUND":
      return "not_found";
    case "CHAT_AMBIGUOUS":
    case "FOLDER_AMBIGUOUS":
      return "conflict";
    case "RATE_LIMITED":
      return "rate_limit";
    case "TELEGRAM_ERROR":
      return "dependency_error";
    case "INTERNAL_ERROR":
      return "unexpected_error";
  }
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function asStructuredContent(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : { value };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
