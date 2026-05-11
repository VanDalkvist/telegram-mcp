import { Api } from "telegram";
import { parsePeerRef } from "../../domain/peer-ref.js";
import type { GetSearchCountersInput } from "../../application/telegram-queries.js";
import type { SearchCounterSummary } from "../../domain/types.js";
import { normalizeSearchCounters } from "../telegram-normalizers.js";
import { normalizeKnownError } from "../telegram-records.js";
import {
  entityLookupFromPeer,
  messageFilterFromMediaType
} from "../telegram-requests.js";
import type { TelegramQueryContext } from "./telegram-query-context.js";

export async function getSearchCounters(
  context: TelegramQueryContext,
  input: GetSearchCountersInput
): Promise<{ counters: SearchCounterSummary[] }> {
  try {
    const peer = parsePeerRef(input.chat_ref);
    const entity = await context.client.getEntity(entityLookupFromPeer(peer));
    const filters = input.media_types.map((mediaType) => messageFilterFromMediaType(mediaType));
    const response = await context.client.invoke(
      new Api.messages.GetSearchCounters({
        peer: entity as Api.TypeEntityLike,
        filters
      })
    );
    return { counters: normalizeSearchCounters(response, input.media_types) };
  } catch (error) {
    throw normalizeKnownError(error);
  }
}
