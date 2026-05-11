import { parsePeerRef } from "../../domain/peer-ref.js";
import type { GetMessagesInput } from "../../application/telegram-queries.js";
import type { MessagePage, MessageSummary } from "../../domain/types.js";
import { normalizeMessages } from "../telegram-normalizers.js";
import { normalizeKnownError } from "../telegram-records.js";
import { entityLookupFromPeer } from "../telegram-requests.js";
import type { TelegramQueryContext } from "./telegram-query-context.js";

export async function getMessages(
  context: TelegramQueryContext,
  input: GetMessagesInput
): Promise<{ messages: MessageSummary[]; page: MessagePage }> {
  try {
    const peer = parsePeerRef(input.chat_ref);
    const entity = await context.client.getEntity(entityLookupFromPeer(peer));
    const messages = await context.client.getMessages(entity, {
      limit: input.limit,
      offsetId: input.before_message_id,
      minId: input.after_message_id
    });
    const normalized = normalizeMessages(messages, input.chat_ref).sort((left, right) => left.message_id - right.message_id);

    const page: MessagePage = {
      order: "older_to_newer"
    };
    if (normalized[0]?.message_id !== undefined) {
      page.before_message_id = normalized[0].message_id;
    }
    if (normalized.at(-1)?.message_id !== undefined) {
      page.after_message_id = normalized.at(-1)!.message_id;
    }

    return {
      messages: normalized,
      page
    };
  } catch (error) {
    throw normalizeKnownError(error);
  }
}
