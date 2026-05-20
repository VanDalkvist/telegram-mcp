import { AppError } from "../../domain/errors.js";
import { parseFolderRef } from "../../domain/folder-ref.js";
import { parsePeerRef } from "../../domain/peer-ref.js";
import type { ListFolderChatsPageInput } from "../../application/telegram-queries.js";
import type { ChatPage, ChatSummary } from "../../domain/types.js";
import { chatSummaryFromDialog } from "../telegram-normalizers.js";
import {
  asRecord,
  normalizeKnownError,
  readNumber,
  readString
} from "../telegram-records.js";
import { entityLookupFromPeer } from "../telegram-requests.js";
import { getFolderFilterById } from "./folder-peer-entities.js";
import { matchesType } from "./list-folder-chats.js";
import type { TelegramQueryContext } from "./telegram-query-context.js";

type FolderChatCursorParams = {
  offsetDate: number;
  offsetId: number;
  offsetPeer: unknown;
  ignorePinned: true;
};

export async function listFolderChatsPage(
  context: TelegramQueryContext,
  input: ListFolderChatsPageInput
): Promise<{ chats: ChatSummary[]; page: ChatPage }> {
  try {
    const folder = parseFolderRef(input.folder_ref);
    const cursorParams = parseFolderChatCursor(input.cursor);
    await getFolderFilterById(context, folder.id);

    const dialogs = await context.client.getDialogs({
      folder: folder.id,
      limit: input.limit,
      ...cursorParams
    });
    const chats = dialogs.map((dialog) => chatSummaryFromDialog(dialog)).filter((chat) => matchesType(chat, input.type));
    return { chats, page: pageForFolderDialogs(dialogs, input.limit) };
  } catch (error) {
    throw normalizeKnownError(error);
  }
}

function pageForFolderDialogs(dialogs: unknown[], limit: number): ChatPage {
  const page: ChatPage = { order: "recent_first" };
  if (dialogs.length >= limit && dialogs.length > 0) {
    page.next_cursor = serializeFolderChatCursor(dialogs.at(-1));
  }
  return page;
}

function serializeFolderChatCursor(dialog: unknown): string {
  const offsetDate = readDialogDate(dialog);
  const offsetId = readDialogMessageId(dialog);
  const offsetPeer = chatSummaryFromDialog(dialog).chat_ref;
  if (offsetDate === undefined || offsetId === undefined) {
    throw new AppError("TELEGRAM_ERROR", "Telegram dialog is missing pagination fields", {
      publicMessage: "Telegram returned an unsupported dialog"
    });
  }

  return Buffer.from(JSON.stringify({
    offset_date: offsetDate,
    offset_id: offsetId,
    offset_peer: offsetPeer
  }), "utf8").toString("base64url");
}

function parseFolderChatCursor(value?: string | undefined): Partial<FolderChatCursorParams> {
  if (value === undefined) {
    return {};
  }

  try {
    const decoded = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    const record = asRecord(decoded);
    const offsetDate = readNumber(record.offset_date);
    const offsetId = readNumber(record.offset_id);
    const offsetPeerRef = readString(record.offset_peer);
    if (offsetDate === undefined || offsetId === undefined || offsetPeerRef === undefined) {
      throwInvalidCursor();
    }

    return {
      offsetDate,
      offsetId,
      offsetPeer: offsetPeerFromCursor(offsetPeerRef),
      ignorePinned: true
    };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throwInvalidCursor();
  }
}

function offsetPeerFromCursor(value: string): unknown {
  try {
    return entityLookupFromPeer(parsePeerRef(value));
  } catch {
    throwInvalidCursor();
  }
}

function readDialogDate(dialog: unknown): number | undefined {
  const record = asRecord(dialog);
  const value = record.date ?? asRecord(record.message).date;
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return Math.floor(value.getTime() / 1000);
  }
  return undefined;
}

function readDialogMessageId(dialog: unknown): number | undefined {
  const record = asRecord(dialog);
  return readNumber(asRecord(record.message).id) ?? readNumber(asRecord(record.dialog).topMessage ?? asRecord(record.dialog).top_message);
}

function throwInvalidCursor(): never {
  throw new AppError("CONFIG_INVALID", "Invalid folder chat cursor", {
    publicMessage: "Tool input is invalid"
  });
}
