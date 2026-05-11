import type { SearchChatsInput } from "../../application/telegram-queries.js";
import type { ChatSummary } from "../../domain/types.js";
import type { TelegramQueryContext } from "./telegram-query-context.js";
import { listChats } from "./list-chats.js";

export async function searchChats(context: TelegramQueryContext, input: SearchChatsInput): Promise<{ chats: ChatSummary[] }> {
  const { chats } = await listChats(context, {
    limit: Math.max(input.limit, 100),
    type: input.type,
    folder_ref: input.folder_ref
  });
  const query = input.query.toLocaleLowerCase();
  return {
    chats: chats
      .filter((chat) => chat.title.toLocaleLowerCase().includes(query) || chat.username?.toLocaleLowerCase().includes(query))
      .slice(0, input.limit)
  };
}
