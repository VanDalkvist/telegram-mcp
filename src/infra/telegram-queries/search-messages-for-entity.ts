import { Api } from "telegram";
import type { SearchMessagesInput } from "../../application/telegram-queries.js";
import type { MessageSummary } from "../../domain/types.js";
import {
  filterMessagesByDate,
  normalizeMessages,
  sortNewerToOlder
} from "../telegram-normalizers.js";
import { toUnixSeconds } from "../telegram-records.js";
import type { TelegramQueryContext } from "./telegram-query-context.js";

export async function searchMessagesForEntity(
  context: TelegramQueryContext,
  entity: unknown,
  chatRef: string,
  input: Pick<SearchMessagesInput, "query" | "limit" | "from_date" | "to_date">,
  filter?: Api.TypeMessagesFilter | undefined,
  page: { offsetId?: number | undefined } = {}
): Promise<MessageSummary[]> {
  const params: Record<string, unknown> = {
    limit: input.limit,
    search: input.query,
    offsetId: page.offsetId,
    offsetDate: input.to_date === undefined ? undefined : toUnixSeconds(input.to_date, "end"),
    waitTime: 0
  };
  if (filter !== undefined) {
    params.filter = filter;
  }
  const messages = await context.client.getMessages(entity, params);
  return sortNewerToOlder(filterMessagesByDate(normalizeMessages(messages, chatRef), input.from_date, input.to_date)).slice(0, input.limit);
}
