import { chatSummaryFromDialog, chatSummaryFromEntity } from "./telegram-normalizers.js";
import { asRecord, readArray, stringifyOptionalId } from "./telegram-records.js";

export function peersFromFolderFilter(filter: unknown): unknown[] {
  const record = asRecord(filter);
  return uniquePeers([
    ...readArray(record.pinnedPeers ?? record.pinned_peers),
    ...readArray(record.includePeers ?? record.include_peers)
  ]);
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
  const chat = chatSummaryFromEntity(entity);
  return `peer:${chat.id}`;
}

export function folderPeerKey(peer: unknown): string {
  const record = asRecord(peer);
  const channelId = stringifyOptionalId(record.channelId ?? record.channel_id);
  if (channelId !== undefined) {
    return `peer:${channelId}`;
  }
  const chatId = stringifyOptionalId(record.chatId ?? record.chat_id);
  if (chatId !== undefined) {
    return `peer:${chatId}`;
  }
  const userId = stringifyOptionalId(record.userId ?? record.user_id);
  if (userId !== undefined) {
    return `peer:${userId}`;
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
