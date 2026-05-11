import { Api } from "telegram";
import bigInt from "big-integer";
import { parsePeerRef } from "../../domain/peer-ref.js";
import type { GetThreadInput } from "../../application/telegram-queries.js";
import type { MessagePage, MessageSummary } from "../../domain/types.js";
import {
  normalizeMessagesFromResponse,
  pageForMessages
} from "../telegram-normalizers.js";
import { normalizeKnownError } from "../telegram-records.js";
import { entityLookupFromPeer } from "../telegram-requests.js";
import type { TelegramQueryContext } from "./telegram-query-context.js";

export async function getThread(context: TelegramQueryContext, input: GetThreadInput): Promise<{ messages: MessageSummary[]; page: MessagePage }> {
  try {
    const peer = parsePeerRef(input.chat_ref);
    const entity = await context.client.getEntity(entityLookupFromPeer(peer));
    const response = await context.client.invoke(
      new Api.messages.GetReplies({
        peer: entity as Api.TypeEntityLike,
        msgId: input.message_id,
        offsetId: input.before_message_id ?? 0,
        offsetDate: 0,
        addOffset: 0,
        limit: input.limit,
        maxId: 0,
        minId: 0,
        hash: bigInt(0)
      })
    );
    const messages = normalizeMessagesFromResponse(response, input.chat_ref).sort((left, right) => left.message_id - right.message_id);
    return { messages, page: pageForMessages(messages, "older_to_newer", messages.length >= input.limit) };
  } catch (error) {
    throw normalizeKnownError(error);
  }
}
