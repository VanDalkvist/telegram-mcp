import { Api } from "telegram";
import { parsePeerRef } from "../../domain/peer-ref.js";
import type { SearchMessagesInput } from "../../application/telegram-queries.js";
import type { MessageSummary } from "../../domain/types.js";
import { normalizeKnownError } from "../telegram-records.js";
import { entityLookupFromPeer } from "../telegram-requests.js";
import type { TelegramQueryContext } from "./telegram-query-context.js";
import { searchFolderMessages } from "./search-folder-messages.js";
import { searchGlobalMessages } from "./search-global-messages.js";
import { searchMessagesForEntity } from "./search-messages-for-entity.js";

export async function searchMessages(context: TelegramQueryContext, input: SearchMessagesInput): Promise<{ messages: MessageSummary[] }> {
  try {
    if (input.chat_ref !== undefined) {
      const peer = parsePeerRef(input.chat_ref);
      const entity = await context.client.getEntity(entityLookupFromPeer(peer));
      return { messages: await searchMessagesForEntity(context, entity, input.chat_ref, input) };
    }

    if (input.folder_ref !== undefined) {
      return searchFolderMessages(context, { ...input, folder_ref: input.folder_ref });
    }

    return { messages: (await searchGlobalMessages(context, input, new Api.InputMessagesFilterEmpty())).messages };
  } catch (error) {
    throw normalizeKnownError(error);
  }
}
