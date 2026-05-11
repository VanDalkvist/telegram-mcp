import { Api } from "telegram";
import { parsePeerRef } from "../../domain/peer-ref.js";
import type { GetDiscussionInput } from "../../application/telegram-queries.js";
import type { MessageSummary } from "../../domain/types.js";
import { normalizeMessagesFromResponse } from "../telegram-normalizers.js";
import { normalizeKnownError } from "../telegram-records.js";
import { entityLookupFromPeer } from "../telegram-requests.js";
import type { TelegramQueryContext } from "./telegram-query-context.js";

export async function getDiscussion(context: TelegramQueryContext, input: GetDiscussionInput): Promise<{ messages: MessageSummary[] }> {
  try {
    const peer = parsePeerRef(input.chat_ref);
    const entity = await context.client.getEntity(entityLookupFromPeer(peer));
    const response = await context.client.invoke(
      new Api.messages.GetDiscussionMessage({
        peer: entity as Api.TypeEntityLike,
        msgId: input.message_id
      })
    );
    return { messages: normalizeMessagesFromResponse(response, input.chat_ref) };
  } catch (error) {
    throw normalizeKnownError(error);
  }
}
