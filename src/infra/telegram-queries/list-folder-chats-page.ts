import { AppError } from "../../domain/errors.js";
import { parsePeerRef } from "../../domain/peer-ref.js";
import type { ListFolderChatsPageInput } from "../../application/telegram-queries.js";
import type { ChatPage, ChatSummary } from "../../domain/types.js";
import { chatSummaryFromEntity } from "../telegram-normalizers.js";
import {
  asRecord,
  normalizeKnownError,
  readString
} from "../telegram-records.js";
import { getFolderPeerEntities } from "./folder-peer-entities.js";
import { matchesType } from "./list-folder-chats.js";
import type { TelegramQueryContext } from "./telegram-query-context.js";

export async function listFolderChatsPage(
  context: TelegramQueryContext,
  input: ListFolderChatsPageInput
): Promise<{ chats: ChatSummary[]; page: ChatPage }> {
  try {
    const cursor = parseFolderChatCursor(input.cursor);
    const entities = await getFolderPeerEntities(context, input.folder_ref);
    const chats = entities.map((entity) => chatSummaryFromEntity(entity)).filter((chat) => matchesType(chat, input.type));
    const startIndex = cursor === undefined ? 0 : startIndexAfterCursor(chats, cursor);
    const pageChats = chats.slice(startIndex, startIndex + input.limit);
    return { chats: pageChats, page: pageForFolderChats(chats, pageChats, startIndex, input.limit) };
  } catch (error) {
    throw normalizeKnownError(error);
  }
}

function pageForFolderChats(allChats: ChatSummary[], pageChats: ChatSummary[], startIndex: number, limit: number): ChatPage {
  const page: ChatPage = { order: "recent_first" };
  if (pageChats.length > 0 && startIndex + limit < allChats.length) {
    page.next_cursor = serializeFolderChatCursor(pageChats.at(-1)!);
  }
  return page;
}

function serializeFolderChatCursor(chat: ChatSummary): string {
  return Buffer.from(JSON.stringify({
    offset_peer: chat.chat_ref
  }), "utf8").toString("base64url");
}

function parseFolderChatCursor(value?: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  try {
    const decoded = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    const record = asRecord(decoded);
    const offsetPeerRef = readString(record.offset_peer);
    if (offsetPeerRef === undefined) {
      throwInvalidCursor();
    }
    try {
      parsePeerRef(offsetPeerRef);
    } catch {
      throwInvalidCursor();
    }
    return offsetPeerRef;
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throwInvalidCursor();
  }
}

function startIndexAfterCursor(chats: ChatSummary[], cursor: string): number {
  const cursorIndex = chats.findIndex((chat) => chat.chat_ref === cursor);
  if (cursorIndex === -1) {
    throwInvalidCursor();
  }
  return cursorIndex + 1;
}

function throwInvalidCursor(): never {
  throw new AppError("CONFIG_INVALID", "Invalid folder chat cursor", {
    publicMessage: "Tool input is invalid"
  });
}
