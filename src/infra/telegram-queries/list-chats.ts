import type { ListChatsInput } from "../../application/telegram-queries.js";
import type { ChatSummary } from "../../domain/types.js";
import { chatSummaryFromDialog } from "../telegram-normalizers.js";
import { normalizeKnownError } from "../telegram-records.js";
import type { TelegramQueryContext } from "./telegram-query-context.js";
import { listFolderChats, matchesType } from "./list-folder-chats.js";

export async function listChats(context: TelegramQueryContext, input: ListChatsInput): Promise<{ chats: ChatSummary[] }> {
  try {
    if (input.folder_ref !== undefined) {
      return listFolderChats(context, { ...input, folder_ref: input.folder_ref });
    }

    const dialogs = await context.client.getDialogs({ limit: input.limit });
    return { chats: dialogs.map((dialog) => chatSummaryFromDialog(dialog)).filter((chat) => matchesType(chat, input.type)) };
  } catch (error) {
    throw normalizeKnownError(error);
  }
}
