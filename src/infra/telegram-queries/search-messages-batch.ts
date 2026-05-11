import type { SearchMessagesBatchInput } from "../../application/telegram-queries.js";
import type { BatchSearchResult, MessageSummary } from "../../domain/types.js";
import { sortNewerToOlder } from "../telegram-normalizers.js";
import type { TelegramQueryContext } from "./telegram-query-context.js";
import { searchMessages } from "./search-messages.js";

export async function searchMessagesBatch(
  context: TelegramQueryContext,
  input: SearchMessagesBatchInput
): Promise<{ results: BatchSearchResult[]; messages: MessageSummary[] }> {
  const results: BatchSearchResult[] = [];
  const seen = new Set<string>();
  const deduped: MessageSummary[] = [];

  for (const query of input.queries) {
    const result = await searchMessages(context, {
      query,
      chat_ref: input.chat_ref,
      folder_ref: input.folder_ref,
      folder_chat_limit: input.folder_chat_limit,
      limit: input.limit,
      from_date: input.from_date,
      to_date: input.to_date
    });
    results.push({ query, messages: result.messages });
    for (const message of result.messages) {
      const key = `${message.chat_ref}:${message.message_id}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      deduped.push(message);
    }
  }

  return { results, messages: sortNewerToOlder(deduped).slice(0, input.limit) };
}
