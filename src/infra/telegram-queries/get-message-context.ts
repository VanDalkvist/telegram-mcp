import { parsePeerRef } from "../../domain/peer-ref.js";
import type { GetMessageContextInput } from "../../application/telegram-queries.js";
import type { Message, MessageSummary } from "../../domain/types.js";
import { normalizeMessages } from "../telegram-normalizers.js";
import { entityLookupFromPeer } from "../telegram-requests.js";
import type { TelegramQueryContext } from "./telegram-query-context.js";
import { getMessage } from "./get-message.js";

export async function getMessageContext(
  context: TelegramQueryContext,
  input: GetMessageContextInput
): Promise<{
  target: Message;
  before: MessageSummary[];
  after: MessageSummary[];
}> {
  const { message: target } = await getMessage(context, input);
  const peer = parsePeerRef(input.chat_ref);
  const entity = await context.client.getEntity(entityLookupFromPeer(peer));

  const beforeMessages = await context.client.getMessages(entity, {
    limit: input.before,
    offsetId: input.message_id
  });
  const afterMessages = await context.client.getMessages(entity, {
    limit: input.after,
    minId: input.message_id,
    reverse: true
  });

  return {
    target,
    before: normalizeMessages(beforeMessages, input.chat_ref).sort((left, right) => left.message_id - right.message_id),
    after: normalizeMessages(afterMessages, input.chat_ref).sort((left, right) => left.message_id - right.message_id)
  };
}
