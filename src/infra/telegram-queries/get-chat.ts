import { parsePeerRef } from "../../domain/peer-ref.js";
import type { GetChatInput } from "../../application/telegram-queries.js";
import type { ChatMetadata } from "../../domain/types.js";
import { chatMetadataFromEntity } from "../telegram-normalizers.js";
import { normalizeKnownError } from "../telegram-records.js";
import { entityLookupFromPeer } from "../telegram-requests.js";
import type { TelegramQueryContext } from "./telegram-query-context.js";

export async function getChat(context: TelegramQueryContext, input: GetChatInput): Promise<{ chat: ChatMetadata }> {
  try {
    const peer = parsePeerRef(input.chat_ref);
    const entity = await context.client.getEntity(entityLookupFromPeer(peer));
    return { chat: chatMetadataFromEntity(entity) };
  } catch (error) {
    throw normalizeKnownError(error);
  }
}
