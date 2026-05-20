import { chatSummaryFromDialog, chatSummaryFromEntity } from "./telegram-normalizers.js";
import { asRecord, readArray, readNumber, stringifyOptionalId } from "./telegram-records.js";

export function peersFromFolderFilter(filter: unknown): unknown[] {
  const record = asRecord(filter);
  return uniquePeers([
    ...readArray(record.pinnedPeers ?? record.pinned_peers),
    ...readArray(record.includePeers ?? record.include_peers)
  ]);
}

export function excludedPeerKeysFromFolderFilter(filter: unknown): Set<string> {
  const record = asRecord(filter);
  return new Set(readArray(record.excludePeers ?? record.exclude_peers).map((peer) => folderPeerKey(peer)));
}

export function hasFolderRules(filter: unknown): boolean {
  const record = asRecord(filter);
  return (
    record.groups === true ||
    record.broadcasts === true ||
    record.bots === true ||
    record.contacts === true ||
    record.nonContacts === true ||
    record.non_contacts === true
  );
}

export function matchesFolderRules(dialog: unknown, filter: unknown): boolean {
  const record = asRecord(filter);
  const chat = chatSummaryFromDialog(dialog);
  const entity = asRecord(asRecord(dialog).entity ?? dialog);

  if (record.groups === true && chat.type === "group") {
    return true;
  }
  if (record.broadcasts === true && chat.type === "channel") {
    return true;
  }
  if (record.bots === true && chat.type === "user" && entity.bot === true) {
    return true;
  }
  if (record.contacts === true && chat.type === "user" && entity.contact === true) {
    return true;
  }
  if ((record.nonContacts === true || record.non_contacts === true) && chat.type === "user" && entity.contact !== true) {
    return true;
  }

  return false;
}

export function matchesFolderExclusionFlags(dialog: unknown, filter: unknown): boolean {
  const filterRecord = asRecord(filter);
  const dialogRecord = asRecord(dialog);
  if ((filterRecord.excludeMuted === true || filterRecord.exclude_muted === true) && isDialogMuted(dialogRecord)) {
    return true;
  }
  if ((filterRecord.excludeRead === true || filterRecord.exclude_read === true) && isDialogRead(dialogRecord)) {
    return true;
  }
  if ((filterRecord.excludeArchived === true || filterRecord.exclude_archived === true) && isDialogArchived(dialogRecord)) {
    return true;
  }
  return false;
}

export function uniqueEntities(entities: unknown[]): unknown[] {
  const seen = new Set<string>();
  const unique: unknown[] = [];
  for (const entity of entities) {
    const key = entityPeerKey(entity);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(entity);
  }
  return unique;
}

export function entityPeerKey(entity: unknown): string {
  const chat = chatSummaryFromEntity(entity);
  return `${chat.type}:${chat.id}`;
}

export function entityFolderPeerKey(entity: unknown): string {
  const record = asRecord(entity);
  const id = stringifyOptionalId(record.id);
  if (id === undefined) {
    return JSON.stringify(entity);
  }
  if (record.className === "User" || record.firstName !== undefined || record.first_name !== undefined || record.lastName !== undefined || record.last_name !== undefined) {
    return `user:${id}`;
  }
  if (record.className === "Chat") {
    return `chat:${id}`;
  }
  return `channel:${id}`;
}

export function folderPeerKey(peer: unknown): string {
  const record = asRecord(peer);
  const channelId = stringifyOptionalId(record.channelId ?? record.channel_id);
  if (channelId !== undefined) {
    return `channel:${channelId}`;
  }
  const chatId = stringifyOptionalId(record.chatId ?? record.chat_id);
  if (chatId !== undefined) {
    return `chat:${chatId}`;
  }
  const userId = stringifyOptionalId(record.userId ?? record.user_id);
  if (userId !== undefined) {
    return `user:${userId}`;
  }
  return JSON.stringify(peer);
}

function uniquePeers(peers: unknown[]): unknown[] {
  const seen = new Set<string>();
  const unique: unknown[] = [];
  for (const peer of peers) {
    const key = JSON.stringify(peer);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(peer);
  }
  return unique;
}

function isDialogMuted(dialog: Record<string, unknown>): boolean {
  if (dialog.isMuted === true || dialog.is_muted === true || dialog.muted === true) {
    return true;
  }
  const notifySettings = asRecord(dialog.notifySettings ?? dialog.notify_settings);
  const muteUntil = readNumber(notifySettings.muteUntil ?? notifySettings.mute_until);
  return muteUntil !== undefined && muteUntil > Math.floor(Date.now() / 1000);
}

function isDialogRead(dialog: Record<string, unknown>): boolean {
  const unreadCount = readNumber(dialog.unreadCount ?? dialog.unread_count);
  if (unreadCount === undefined) {
    return false;
  }
  return unreadCount === 0 && dialog.unreadMark !== true && dialog.unread_mark !== true;
}

function isDialogArchived(dialog: Record<string, unknown>): boolean {
  if (dialog.archived === true || dialog.isArchived === true || dialog.is_archived === true) {
    return true;
  }
  return readNumber(dialog.folderId ?? dialog.folder_id) === 1;
}
