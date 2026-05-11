import { AppError } from "../../domain/errors.js";
import { parsePeerRef } from "../../domain/peer-ref.js";
import type { GetMessageInput } from "../../application/telegram-queries.js";
import type { Message } from "../../domain/types.js";
import { normalizeMessages } from "../telegram-normalizers.js";
import { normalizeKnownError } from "../telegram-records.js";
import { entityLookupFromPeer } from "../telegram-requests.js";
import type { TelegramQueryContext } from "./telegram-query-context.js";

export async function getMessage(context: TelegramQueryContext, input: GetMessageInput): Promise<{ message: Message }> {
  try {
    const peer = parsePeerRef(input.chat_ref);
    const entity = await context.client.getEntity(entityLookupFromPeer(peer));
    const messages = await context.client.getMessages(entity, { ids: input.message_id });
    const message = normalizeMessages(messages, input.chat_ref)[0];
    if (message === undefined) {
      throw new AppError("MESSAGE_NOT_FOUND", `Message not found: ${input.message_id}`, {
        publicMessage: "Message not found"
      });
    }

    return { message };
  } catch (error) {
    throw normalizeKnownError(error);
  }
}
