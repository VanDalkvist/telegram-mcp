import type { ListChatsInput } from "../../application/telegram-queries.js";
import type { ChatSummary } from "../../domain/types.js";
import { chatSummaryFromEntity } from "../telegram-normalizers.js";
import type { TelegramQueryContext } from "./telegram-query-context.js";
import { getFolderPeerEntities } from "./folder-peer-entities.js";

export async function listFolderChats(
  context: TelegramQueryContext,
  input: ListChatsInput & { folder_ref: string }
): Promise<{ chats: ChatSummary[] }> {
  const entities = await getFolderPeerEntities(context, input.folder_ref, input.limit);
  return {
    chats: entities.map((entity) => chatSummaryFromEntity(entity)).filter((chat) => matchesType(chat, input.type))
  };
}

export function matchesType(chat: ChatSummary, type: ListChatsInput["type"]): boolean {
  return type === "any" || chat.type === type;
}
