import { Api } from "telegram";
import type { SearchMessagesInput } from "../../application/telegram-queries.js";
import type { MessageSummary } from "../../domain/types.js";
import {
  chatSummaryFromEntity,
  sortNewerToOlder
} from "../telegram-normalizers.js";
import { normalizeKnownError } from "../telegram-records.js";
import type { TelegramQueryContext } from "./telegram-query-context.js";
import { getFolderPeerEntities } from "./folder-peer-entities.js";
import { searchMessagesForEntity } from "./search-messages-for-entity.js";

export async function searchFolderMessages(
  context: TelegramQueryContext,
  input: Pick<SearchMessagesInput, "query" | "limit" | "from_date" | "to_date" | "folder_chat_limit"> & { folder_ref: string },
  filter?: Api.TypeMessagesFilter | undefined
): Promise<{ messages: MessageSummary[] }> {
  const entities = await getFolderPeerEntities(context, input.folder_ref, input.folder_chat_limit ?? 5);
  try {
    const chunks: MessageSummary[][] = [];
    for (const entity of entities) {
      const chat = chatSummaryFromEntity(entity);
      chunks.push(await searchMessagesForEntity(context, entity, chat.chat_ref, input, filter));
    }

    return {
      messages: sortNewerToOlder(chunks.flat()).slice(0, input.limit)
    };
  } catch (error) {
    throw normalizeKnownError(error);
  }
}
