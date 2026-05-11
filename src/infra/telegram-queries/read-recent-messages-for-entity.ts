import type { GetRecentMessagesInput } from "../../application/telegram-queries.js";
import type { MessageSummary } from "../../domain/types.js";
import {
  filterMessagesByDate,
  normalizeMessages,
  sortNewerToOlder
} from "../telegram-normalizers.js";
import { toUnixSeconds } from "../telegram-records.js";
import type { TelegramQueryContext } from "./telegram-query-context.js";

export async function readRecentMessagesForEntity(
  context: TelegramQueryContext,
  entity: unknown,
  chatRef: string,
  input: Pick<GetRecentMessagesInput, "limit" | "from_date" | "to_date">
): Promise<MessageSummary[]> {
  const messages = await context.client.getMessages(entity, {
    limit: input.limit,
    offsetDate: toUnixSeconds(input.to_date, "end"),
    waitTime: 0
  });
  return sortNewerToOlder(filterMessagesByDate(normalizeMessages(messages, chatRef), input.from_date, input.to_date)).slice(0, input.limit);
}
