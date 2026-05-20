import { Api } from "telegram";
import { parsePeerRef } from "../../domain/peer-ref.js";
import type { SearchMessagesPageInput } from "../../application/telegram-queries.js";
import type { MessagePage, MessageSummary } from "../../domain/types.js";
import {
  pageForMessages,
  parseSearchCursor
} from "../telegram-normalizers.js";
import {
  asRecord,
  normalizeKnownError,
  readNumber
} from "../telegram-records.js";
import { entityLookupFromPeer } from "../telegram-requests.js";
import type { TelegramQueryContext } from "./telegram-query-context.js";
import { searchFolderMessages } from "./search-folder-messages.js";
import { searchGlobalMessages } from "./search-global-messages.js";
import { searchMessagesForEntity } from "./search-messages-for-entity.js";

export async function searchMessagesPage(
  context: TelegramQueryContext,
  input: SearchMessagesPageInput
): Promise<{ messages: MessageSummary[]; page: MessagePage }> {
  try {
    const cursor = parseSearchCursor(input.cursor);
    if (input.chat_ref !== undefined) {
      const peer = parsePeerRef(input.chat_ref);
      const entity = await context.client.getEntity(entityLookupFromPeer(peer));
      const messages = await searchMessagesForEntity(context, entity, input.chat_ref, input, undefined, {
        offsetId: cursor.offset_id
      });
      return { messages, page: pageForMessages(messages, "newer_to_older", messages.length >= input.limit) };
    }

    if (input.folder_ref !== undefined) {
      const { messages } = await searchFolderMessages(context, { ...input, folder_ref: input.folder_ref });
      return { messages, page: pageForMessages(messages, "newer_to_older", false) };
    }

    const { response, messages } = await searchGlobalMessages(context, input, new Api.InputMessagesFilterEmpty(), cursor);
    const nextRate = readNumber(asRecord(response).nextRate ?? asRecord(response).next_rate);
    const nextPeer = messages.at(-1)?.chat_ref;
    return {
      messages,
      page: pageForMessages(messages, "newer_to_older", messages.length >= input.limit, nextRate, nextPeer)
    };
  } catch (error) {
    throw normalizeKnownError(error);
  }
}
