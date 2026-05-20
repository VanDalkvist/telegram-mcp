import { Api } from "telegram";
import type { SearchMessagesInput } from "../../application/telegram-queries.js";
import { parsePeerRef } from "../../domain/peer-ref.js";
import type { MessageSummary } from "../../domain/types.js";
import {
  filterMessagesByDate,
  normalizeGlobalSearchMessages
} from "../telegram-normalizers.js";
import { toUnixSeconds } from "../telegram-records.js";
import { entityLookupFromPeer } from "../telegram-requests.js";
import type { TelegramQueryContext } from "./telegram-query-context.js";

interface GlobalSearchCursor {
  offset_rate?: number;
  offset_id?: number;
  offset_peer?: string;
}

export async function searchGlobalMessages(
  context: TelegramQueryContext,
  input: Pick<SearchMessagesInput, "query" | "limit" | "from_date" | "to_date">,
  filter: Api.TypeMessagesFilter,
  cursor: GlobalSearchCursor = {}
): Promise<{ response: unknown; messages: MessageSummary[] }> {
  const response = await context.client.invoke(new Api.messages.SearchGlobal(globalSearchParams(input, filter, cursor)));
  return {
    response,
    messages: filterMessagesByDate(normalizeGlobalSearchMessages(response), input.from_date, input.to_date)
  };
}

function globalSearchParams(
  input: Pick<SearchMessagesInput, "query" | "limit" | "from_date" | "to_date">,
  filter: Api.TypeMessagesFilter,
  cursor: GlobalSearchCursor = {}
): {
  q: string;
  limit: number;
  filter: Api.TypeMessagesFilter;
  minDate?: number;
  maxDate?: number;
  offsetRate: number;
  offsetPeer: Api.TypeEntityLike;
  offsetId: number;
} {
  const requestParams: {
    q: string;
    limit: number;
    filter: Api.TypeMessagesFilter;
    minDate?: number;
    maxDate?: number;
    offsetRate: number;
    offsetPeer: Api.TypeEntityLike;
    offsetId: number;
  } = {
    q: input.query,
    limit: input.limit,
    filter,
    offsetRate: cursor.offset_rate ?? 0,
    offsetPeer: cursor.offset_peer === undefined ? new Api.InputPeerEmpty() : entityLookupFromPeer(parsePeerRef(cursor.offset_peer)),
    offsetId: cursor.offset_id ?? 0
  };
  if (input.from_date !== undefined) {
    requestParams.minDate = toUnixSeconds(input.from_date);
  }
  if (input.to_date !== undefined) {
    requestParams.maxDate = toUnixSeconds(input.to_date, "end");
  }
  return requestParams;
}
