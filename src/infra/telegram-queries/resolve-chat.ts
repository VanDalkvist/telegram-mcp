import { AppError } from "../../domain/errors.js";
import { parsePeerRef } from "../../domain/peer-ref.js";
import type { ResolveChatInput } from "../../application/telegram-queries.js";
import type { ChatSummary } from "../../domain/types.js";
import { chatSummaryFromEntity } from "../telegram-normalizers.js";
import { entityLookupFromPeer } from "../telegram-requests.js";
import type { TelegramQueryContext } from "./telegram-query-context.js";
import { searchChats } from "./search-chats.js";

export async function resolveChat(context: TelegramQueryContext, input: ResolveChatInput): Promise<{ chat: ChatSummary }> {
  if (looksLikePeerRef(input.ref)) {
    return { chat: await getSummaryFromPeerRef(context, input.ref) };
  }

  const normalizedRef = input.ref.trim();
  if (normalizedRef.startsWith("@") || /^https?:\/\/t\.me\//i.test(normalizedRef)) {
    return { chat: chatSummaryFromEntity(await context.client.getEntity(normalizedRef.replace(/^https?:\/\/t\.me\//i, "@"))) };
  }

  if (/^-?\d+$/.test(normalizedRef)) {
    return { chat: chatSummaryFromEntity(await context.client.getEntity(Number.parseInt(normalizedRef, 10))) };
  }

  const { chats } = await searchChats(context, { query: normalizedRef, limit: 50, type: "any" });
  const exactMatches = chats.filter((chat) => chat.title === normalizedRef || chat.username === normalizedRef.replace(/^@/, ""));

  if (exactMatches.length === 1) {
    return { chat: exactMatches[0]! };
  }

  if (exactMatches.length > 1) {
    throw new AppError("CHAT_AMBIGUOUS", `Multiple chats match "${input.ref}"`, {
      publicMessage: "Chat reference is ambiguous",
      details: { candidates: exactMatches.map(({ chat_ref, title, username, type }) => ({ chat_ref, title, username, type })) }
    });
  }

  throw new AppError("CHAT_NOT_FOUND", `Chat not found: ${input.ref}`, {
    publicMessage: "Chat not found"
  });
}

async function getSummaryFromPeerRef(context: TelegramQueryContext, chatRef: string): Promise<ChatSummary> {
  const peer = parsePeerRef(chatRef);
  const entity = await context.client.getEntity(entityLookupFromPeer(peer));
  return chatSummaryFromEntity(entity);
}

function looksLikePeerRef(value: string): boolean {
  try {
    parsePeerRef(value);
    return true;
  } catch {
    return false;
  }
}
