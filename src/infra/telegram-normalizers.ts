import { AppError } from "../domain/errors.js";
import { serializeFolderRef } from "../domain/folder-ref.js";
import { serializePeerRef } from "../domain/peer-ref.js";
import type {
  ChatMetadata,
  ChatSummary,
  ChatType,
  FolderKind,
  FolderSummary,
  MediaFilterType,
  Message,
  MessagePage,
  MessageSummary,
  ParticipantSummary,
  PeerRefValue,
  SearchCounterSummary
} from "../domain/types.js";
import {
  asRecord,
  isRecord,
  normalizeDate,
  readArray,
  readArrayLength,
  readNumber,
  readReplyToId,
  readString,
  readTextWithEntities,
  stringifyId,
  stringifyOptionalId,
  toDateWindowTimestampMs
} from "./telegram-records.js";

export function normalizeFolderFilters(response: unknown): FolderSummary[] {
  return rawFolderFilters(response).flatMap((filter) => {
    const summary = folderSummaryFromFilter(filter);
    return summary === undefined ? [] : [summary];
  });
}

export function rawFolderFilters(response: unknown): unknown[] {
  const record = asRecord(response);
  return Array.isArray(record.filters) ? record.filters : [];
}

export function folderSummaryFromRef(id: number, title = `folder:${id}`, kind: FolderKind = "dialog_filter"): FolderSummary {
  return {
    folder_ref: serializeFolderRef({ version: 1, id, title }),
    id,
    title,
    kind
  };
}

export function chatSummaryFromDialog(dialog: unknown): ChatSummary {
  const record = asRecord(dialog);
  const entity = record.entity ?? dialog;
  const entityRecord = asRecord(entity);
  const type = chatTypeFromDialog(dialog) ?? chatTypeFromEntity(entity);
  return makeChatSummary({
    entity,
    type,
    title: readString(record.title) ?? readTitle(entityRecord, type)
  });
}

export function chatSummaryFromEntity(entity: unknown): ChatSummary {
  const type = chatTypeFromEntity(entity);
  return makeChatSummary({
    entity,
    type,
    title: readTitle(asRecord(entity), type)
  });
}

export function chatMetadataFromEntity(entity: unknown): ChatMetadata {
  const summary = chatSummaryFromEntity(entity);
  const record = asRecord(entity);
  const metadata: ChatMetadata = { ...summary };
  const description = readString(record.about) ?? readString(record.description);
  const participantsCount = readNumber(record.participantsCount) ?? readNumber(record.participants_count);
  if (description !== undefined) {
    metadata.description = description;
  }
  if (participantsCount !== undefined) {
    metadata.participants_count = participantsCount;
  }
  return metadata;
}

export function normalizeMessages(messages: unknown[], chatRef: string): Message[] {
  return messages
    .filter((message) => message !== undefined && message !== null)
    .map((message) => normalizeMessage(message, chatRef));
}

export function normalizeGlobalSearchMessages(response: unknown): MessageSummary[] {
  const record = asRecord(response);
  const messages = Array.isArray(record.messages) ? record.messages : [];
  const entitiesByPeer = buildPeerEntityMap(response);
  return messages
    .filter((message) => message !== undefined && message !== null)
    .map((message) => {
      const chatRef = chatRefFromMessagePeer(message, entitiesByPeer, { requireEntity: true });
      return normalizeMessage(message, chatRef);
    });
}

export function normalizeMessagesFromResponse(response: unknown, fallbackChatRef: string): MessageSummary[] {
  const record = asRecord(response);
  const messages = Array.isArray(record.messages) ? record.messages : [];
  const entitiesByPeer = buildPeerEntityMap(response);
  return messages
    .filter((message) => message !== undefined && message !== null)
    .map((message) => {
      const peerChatRef = chatRefFromMessagePeer(message, entitiesByPeer);
      return normalizeMessage(message, peerChatRef.includes("unknown") ? fallbackChatRef : peerChatRef);
    });
}

export function filterMessagesByDate(messages: MessageSummary[], fromDate?: string | undefined, toDate?: string | undefined): MessageSummary[] {
  const minDate = fromDate === undefined ? undefined : toDateWindowTimestampMs(fromDate, "start");
  const maxDate = toDate === undefined ? undefined : toDateWindowTimestampMs(toDate, "end");
  return messages.filter((message) => {
    const timestamp = Date.parse(message.date);
    return (minDate === undefined || timestamp >= minDate) && (maxDate === undefined || timestamp <= maxDate);
  });
}

export function sortNewerToOlder(messages: MessageSummary[]): MessageSummary[] {
  return messages.sort((left, right) => Date.parse(right.date) - Date.parse(left.date));
}

export function pageForMessages(
  messages: MessageSummary[],
  order: MessagePage["order"],
  includeNextCursor = false,
  nextRate?: number | undefined,
  nextPeer?: string | undefined
): MessagePage {
  const page: MessagePage = { order };
  if (messages[0]?.message_id !== undefined) {
    page.before_message_id = messages[0].message_id;
  }
  if (messages.at(-1)?.message_id !== undefined) {
    page.after_message_id = messages.at(-1)!.message_id;
  }
  if (includeNextCursor && messages.at(-1)?.message_id !== undefined) {
    page.next_cursor = serializeSearchCursor({
      offset_id: messages.at(-1)!.message_id,
      ...(nextRate === undefined ? {} : { offset_rate: nextRate }),
      ...(nextPeer === undefined ? {} : { offset_peer: nextPeer })
    });
  }
  return page;
}

export function parseSearchCursor(value?: string | undefined): SearchCursor {
  if (value === undefined) {
    return {};
  }
  try {
    const decoded = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (!isRecord(decoded)) {
      return {};
    }
    const offsetId = readNumber(decoded.offset_id);
    const offsetRate = readNumber(decoded.offset_rate);
    const offsetPeer = readString(decoded.offset_peer);
    return {
      ...(offsetId === undefined ? {} : { offset_id: offsetId }),
      ...(offsetRate === undefined ? {} : { offset_rate: offsetRate }),
      ...(offsetPeer === undefined ? {} : { offset_peer: offsetPeer })
    };
  } catch {
    throw new AppError("CONFIG_INVALID", "Invalid search cursor", {
      publicMessage: "Tool input is invalid"
    });
  }
}

export function normalizeSearchCounters(response: unknown, fallbackMediaTypes: MediaFilterType[]): SearchCounterSummary[] {
  const counters = Array.isArray(response) ? response : [];
  return counters.flatMap((counter, index) => {
    const record = asRecord(counter);
    const count = readNumber(record.count);
    const mediaType = mediaTypeFromMessageFilter(record.filter) ?? fallbackMediaTypes[index];
    if (count === undefined || mediaType === undefined) {
      return [];
    }
    return [{
      media_type: mediaType,
      count,
      ...(record.inexact === true ? { inexact: true } : {})
    }];
  });
}

export function participantSummaryFromEntity(entity: unknown): ParticipantSummary {
  const summary = chatSummaryFromEntity(entity);
  const record = asRecord(entity);
  const accessHash = stringifyOptionalId(record.accessHash ?? record.access_hash);
  return {
    id: summary.id,
    participant_ref: serializePeerRef({
      version: 1,
      type: summary.type,
      id: summary.id,
      ...(accessHash === undefined ? {} : { accessHash })
    }),
    title: summary.title,
    ...(summary.username === undefined ? {} : { username: summary.username }),
    type: summary.type,
    ...(record.bot === true ? { bot: true } : {})
  };
}

function folderSummaryFromFilter(filter: unknown): FolderSummary | undefined {
  const record = asRecord(filter);
  const id = readNumber(record.id);
  if (id === undefined) {
    return undefined;
  }

  const title = readTextWithEntities(record.title);
  if (title === undefined) {
    return undefined;
  }

  const className = readString(record.className);
  const kind: FolderKind = className === "DialogFilterChatlist" ? "chatlist" : "dialog_filter";
  const summary = folderSummaryFromRef(id, title, kind);
  const includePeersCount = readArrayLength(record.includePeers ?? record.include_peers);
  const pinnedPeersCount = readArrayLength(record.pinnedPeers ?? record.pinned_peers);
  const excludePeersCount = readArrayLength(record.excludePeers ?? record.exclude_peers);
  if (includePeersCount !== undefined) {
    summary.include_peers_count = includePeersCount;
  }
  if (pinnedPeersCount !== undefined) {
    summary.pinned_peers_count = pinnedPeersCount;
  }
  if (excludePeersCount !== undefined) {
    summary.exclude_peers_count = excludePeersCount;
  }
  return summary;
}

function makeChatSummary(input: { entity: unknown; type: ChatType; title: string }): ChatSummary {
  const record = asRecord(input.entity);
  const id = stringifyId(record.id);
  const accessHash = stringifyOptionalId(record.accessHash ?? record.access_hash);
  const username = readString(record.username);
  const peer: PeerRefValue = {
    version: 1,
    type: input.type,
    id,
    ...(accessHash === undefined ? {} : { accessHash }),
    ...(username === undefined ? {} : { username }),
    title: input.title
  };

  return {
    chat_ref: serializePeerRef(peer),
    id,
    title: input.title,
    ...(username === undefined ? {} : { username }),
    type: input.type,
    is_public: username !== undefined
  };
}

function chatTypeFromDialog(dialog: unknown): ChatType | undefined {
  const record = asRecord(dialog);
  if (record.isUser === true) {
    return "user";
  }
  if (record.isGroup === true) {
    return "group";
  }
  if (record.isChannel === true) {
    return "channel";
  }

  return undefined;
}

function chatTypeFromEntity(entity: unknown): ChatType {
  const record = asRecord(entity);
  const className = readString(record.className);
  if (className === "User" || record.firstName !== undefined || record.lastName !== undefined) {
    return "user";
  }
  if (record.megagroup === true || className === "Chat") {
    return "group";
  }
  return "channel";
}

function readTitle(record: Record<string, unknown>, type: ChatType): string {
  const title = readString(record.title);
  if (title !== undefined) {
    return title;
  }

  const firstName = readString(record.firstName) ?? readString(record.first_name);
  const lastName = readString(record.lastName) ?? readString(record.last_name);
  const userTitle = [firstName, lastName].filter(Boolean).join(" ");
  if (userTitle.length > 0) {
    return userTitle;
  }

  return `${type}:${stringifyId(record.id)}`;
}

function normalizeMessage(message: unknown, chatRef: string): Message {
  const record = asRecord(message);
  const messageId = readNumber(record.id);
  if (messageId === undefined) {
    throw new AppError("TELEGRAM_ERROR", "Telegram message is missing id", {
      publicMessage: "Telegram returned an unsupported message"
    });
  }

  const normalized: Message = {
    chat_ref: chatRef,
    message_id: messageId,
    date: normalizeDate(record.date),
    text: readString(record.message) ?? readString(record.text) ?? ""
  };
  const replyToMessageId = readReplyToId(record.replyTo ?? record.reply_to);
  const views = readNumber(record.views);
  const forwards = readNumber(record.forwards);
  if (replyToMessageId !== undefined) {
    normalized.reply_to_message_id = replyToMessageId;
  }
  if (views !== undefined) {
    normalized.views = views;
  }
  if (forwards !== undefined) {
    normalized.forwards = forwards;
  }
  return normalized;
}

function serializeSearchCursor(cursor: SearchCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

interface SearchCursor {
  offset_id?: number;
  offset_rate?: number;
  offset_peer?: string;
}

function buildPeerEntityMap(response: unknown): Map<string, unknown> {
  const record = asRecord(response);
  const entities = [
    ...readArray(record.chats),
    ...readArray(record.users)
  ];
  const map = new Map<string, unknown>();
  for (const entity of entities) {
    const entityRecord = asRecord(entity);
    const id = stringifyOptionalId(entityRecord.id);
    if (id === undefined) {
      continue;
    }
    const type = chatTypeFromEntity(entity);
    map.set(`${type}:${id}`, entity);
    if (type === "channel" || type === "group") {
      map.set(`channel:${id}`, entity);
    }
  }
  return map;
}

function chatRefFromMessagePeer(
  message: unknown,
  entitiesByPeer = new Map<string, unknown>(),
  options: { requireEntity?: boolean } = {}
): string {
  const record = asRecord(message);
  const peer = asRecord(record.peerId ?? record.peer_id ?? {});
  const id =
    stringifyOptionalId(peer.channelId ?? peer.chatId ?? peer.userId) ??
    stringifyOptionalId(record.chatId ?? record.chat_id) ??
    "unknown";
  const type: ChatType = peer.userId !== undefined ? "user" : peer.chatId !== undefined ? "group" : "channel";
  const entity = entitiesByPeer.get(`${type}:${id}`);
  if (entity !== undefined) {
    return chatSummaryFromEntity(entity).chat_ref;
  }
  if (options.requireEntity === true) {
    throw new AppError("TELEGRAM_ERROR", "Telegram search result is missing peer entity", {
      publicMessage: "Telegram returned an unsupported message"
    });
  }
  return serializePeerRef({ version: 1, type, id });
}

function mediaTypeFromMessageFilter(filter: unknown): MediaFilterType | undefined {
  const className = readString(asRecord(filter).className);
  switch (className) {
    case "InputMessagesFilterUrl":
      return "links";
    case "InputMessagesFilterPhotos":
      return "photos";
    case "InputMessagesFilterVideo":
      return "videos";
    case "InputMessagesFilterPhotoVideo":
      return "photo_video";
    case "InputMessagesFilterDocument":
      return "documents";
    case "InputMessagesFilterGif":
      return "gifs";
    case "InputMessagesFilterVoice":
      return "voice";
    case "InputMessagesFilterMusic":
      return "music";
    case "InputMessagesFilterRoundVoice":
      return "round_voice";
    case "InputMessagesFilterRoundVideo":
      return "round_video";
    case "InputMessagesFilterMyMentions":
      return "mentions";
    case "InputMessagesFilterGeo":
      return "geo";
    case "InputMessagesFilterContacts":
      return "contacts";
    case "InputMessagesFilterPinned":
      return "pinned";
    default:
      return undefined;
  }
}
