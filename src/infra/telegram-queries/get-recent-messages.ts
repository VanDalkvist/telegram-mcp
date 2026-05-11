import { AppError } from "../../domain/errors.js";
import { parsePeerRef } from "../../domain/peer-ref.js";
import type { GetRecentMessagesInput } from "../../application/telegram-queries.js";
import type { MessagePage, MessageSummary } from "../../domain/types.js";
import {
  chatSummaryFromEntity,
  pageForMessages,
  sortNewerToOlder
} from "../telegram-normalizers.js";
import { normalizeKnownError } from "../telegram-records.js";
import { entityLookupFromPeer } from "../telegram-requests.js";
import type { TelegramQueryContext } from "./telegram-query-context.js";
import { getFolderPeerEntities } from "./folder-peer-entities.js";
import { readRecentMessagesForEntity } from "./read-recent-messages-for-entity.js";

export async function getRecentMessages(
  context: TelegramQueryContext,
  input: GetRecentMessagesInput
): Promise<{ messages: MessageSummary[]; page: MessagePage }> {
  try {
    if (input.chat_ref !== undefined) {
      const peer = parsePeerRef(input.chat_ref);
      const entity = await context.client.getEntity(entityLookupFromPeer(peer));
      const messages = await readRecentMessagesForEntity(context, entity, input.chat_ref, input);
      return { messages, page: pageForMessages(messages, "newer_to_older") };
    }

    if (input.folder_ref !== undefined) {
      const entities = await getFolderPeerEntities(context, input.folder_ref, input.folder_chat_limit ?? 5);
      const chunks: MessageSummary[][] = [];
      for (const entity of entities) {
        const chat = chatSummaryFromEntity(entity);
        chunks.push(await readRecentMessagesForEntity(context, entity, chat.chat_ref, input));
      }
      const messages = sortNewerToOlder(chunks.flat()).slice(0, input.limit);
      return { messages, page: pageForMessages(messages, "newer_to_older") };
    }

    throw new AppError("CONFIG_INVALID", "chat_ref or folder_ref is required", {
      publicMessage: "Tool input is invalid"
    });
  } catch (error) {
    throw normalizeKnownError(error);
  }
}
