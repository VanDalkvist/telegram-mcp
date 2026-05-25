import { ZodError } from "zod";
import type { TelegramQueries } from "../application/telegram-queries.js";
import { AppError } from "../domain/errors.js";
import { toolSchemas, type ToolName } from "./tool-schemas.js";
import { createTelegramDownloadProfilePhotoHandler } from "./tools/telegram-download-profile-photo.js";
import { createTelegramGetProfilePhotoInfoHandler } from "./tools/telegram-get-profile-photo-info.js";

type ToolHandler = (input: unknown) => Promise<unknown>;
export type ToolHandlers = Record<ToolName, ToolHandler>;

export function createToolHandlers(queries: TelegramQueries): ToolHandlers {
  return {
    telegram_list_folders: async (input) =>
      queries.listFolders(parseToolInput("telegram_list_folders", input)),
    telegram_resolve_folder: async (input) =>
      queries.resolveFolder(parseToolInput("telegram_resolve_folder", input)),
    telegram_list_chats: async (input) =>
      queries.listChats(parseToolInput("telegram_list_chats", input)),
    telegram_list_folder_chats: async (input) =>
      queries.listChats(parseToolInput("telegram_list_folder_chats", input)),
    telegram_list_folder_chats_page: async (input) =>
      queries.listFolderChatsPage(parseToolInput("telegram_list_folder_chats_page", input)),
    telegram_search_chats: async (input) =>
      queries.searchChats(parseToolInput("telegram_search_chats", input)),
    telegram_resolve_chat: async (input) =>
      queries.resolveChat(parseToolInput("telegram_resolve_chat", input)),
    telegram_get_chat: async (input) => queries.getChat(parseToolInput("telegram_get_chat", input)),
    telegram_search_messages: async (input) =>
      queries.searchMessages(parseToolInput("telegram_search_messages", input)),
    telegram_get_recent_messages: async (input) =>
      queries.getRecentMessages(parseToolInput("telegram_get_recent_messages", input)),
    telegram_search_messages_page: async (input) =>
      queries.searchMessagesPage(parseToolInput("telegram_search_messages_page", input)),
    telegram_search_messages_batch: async (input) =>
      queries.searchMessagesBatch(parseToolInput("telegram_search_messages_batch", input)),
    telegram_search_media: async (input) =>
      queries.searchMedia(parseToolInput("telegram_search_media", input)),
    telegram_get_messages: async (input) =>
      queries.getMessages(parseToolInput("telegram_get_messages", input)),
    telegram_get_message: async (input) =>
      queries.getMessage(parseToolInput("telegram_get_message", input)),
    telegram_get_message_context: async (input) =>
      queries.getMessageContext(parseToolInput("telegram_get_message_context", input)),
    telegram_get_thread: async (input) =>
      queries.getThread(parseToolInput("telegram_get_thread", input)),
    telegram_get_discussion: async (input) =>
      queries.getDiscussion(parseToolInput("telegram_get_discussion", input)),
    telegram_get_search_counters: async (input) =>
      queries.getSearchCounters(parseToolInput("telegram_get_search_counters", input)),
    telegram_get_chat_participants: async (input) =>
      queries.getChatParticipants(parseToolInput("telegram_get_chat_participants", input)),
    telegram_get_profile_photo_info: createTelegramGetProfilePhotoInfoHandler(queries),
    telegram_download_profile_photo: createTelegramDownloadProfilePhotoHandler(queries)
  };
}

function parseToolInput<TName extends ToolName>(
  toolName: TName,
  input: unknown
): ReturnType<(typeof toolSchemas)[TName]["parse"]> {
  try {
    return toolSchemas[toolName].parse(input ?? {}) as ReturnType<(typeof toolSchemas)[TName]["parse"]>;
  } catch (error) {
    if (error instanceof ZodError) {
      throw new AppError("CONFIG_INVALID", `Invalid input for ${toolName}`, {
        publicMessage: "Tool input is invalid",
        details: {
          tool: toolName,
          issues: error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message
          }))
        },
        cause: error
      });
    }

    throw error;
  }
}
