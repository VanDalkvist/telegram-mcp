import { parsePeerRef } from "../../domain/peer-ref.js";
import type { SearchMediaInput } from "../../application/telegram-queries.js";
import type { MessageSummary } from "../../domain/types.js";
import { normalizeKnownError } from "../telegram-records.js";
import {
  entityLookupFromPeer,
  messageFilterFromMediaType
} from "../telegram-requests.js";
import type { TelegramQueryContext } from "./telegram-query-context.js";
import { searchFolderMessages } from "./search-folder-messages.js";
import { searchGlobalMessages } from "./search-global-messages.js";
import { searchMessagesForEntity } from "./search-messages-for-entity.js";

export async function searchMedia(context: TelegramQueryContext, input: SearchMediaInput): Promise<{ messages: MessageSummary[] }> {
  try {
    const filter = messageFilterFromMediaType(input.media_type);
    if (input.chat_ref !== undefined) {
      const peer = parsePeerRef(input.chat_ref);
      const entity = await context.client.getEntity(entityLookupFromPeer(peer));
      return { messages: await searchMessagesForEntity(context, entity, input.chat_ref, input, filter) };
    }

    if (input.folder_ref !== undefined) {
      return searchFolderMessages(context, { ...input, query: input.query, folder_ref: input.folder_ref }, filter);
    }

    return { messages: (await searchGlobalMessages(context, input, filter)).messages };
  } catch (error) {
    throw normalizeKnownError(error);
  }
}
