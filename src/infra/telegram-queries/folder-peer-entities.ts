import { Api } from "telegram";
import { AppError } from "../../domain/errors.js";
import { parseFolderRef } from "../../domain/folder-ref.js";
import {
  excludedPeerKeysFromFolderFilter,
  entityFolderPeerKey,
  folderPeerKey,
  hasFolderRules,
  matchesFolderExclusionFlags,
  matchesFolderRules,
  peersFromFolderFilter,
  uniqueEntities
} from "../telegram-folder-expansion.js";
import { rawFolderFilters } from "../telegram-normalizers.js";
import {
  asRecord,
  readNumber
} from "../telegram-records.js";
import type { TelegramQueryContext } from "./telegram-query-context.js";

export async function getFolderPeerEntities(context: TelegramQueryContext, folderRef: string, limit?: number): Promise<unknown[]> {
  const folder = parseFolderRef(folderRef);
  const filter = await getFolderFilterById(context, folder.id);
  const excluded = excludedPeerKeysFromFolderFilter(filter);
  const explicitPeers = peersFromFolderFilter(filter).filter((peer) => !excluded.has(folderPeerKey(peer)));
  const explicitEntities = await Promise.all(explicitPeers.map((peer) => context.client.getEntity(peer)));
  const ruleEntities = await getFolderRuleEntities(context, filter, excluded, limit);
  return uniqueEntities([...explicitEntities, ...ruleEntities]).slice(0, limit);
}

export async function getFolderFilterById(context: TelegramQueryContext, folderId: number): Promise<unknown> {
  const response = await context.client.invoke(new Api.messages.GetDialogFilters());
  const filters = rawFolderFilters(response);
  const filter = filters.find((candidate) => readNumber(asRecord(candidate).id) === folderId);
  if (filter === undefined) {
    throw new AppError("FOLDER_NOT_FOUND", `Folder not found: ${folderId}`, {
      publicMessage: "Folder not found"
    });
  }
  return filter;
}

async function getFolderRuleEntities(
  context: TelegramQueryContext,
  filter: unknown,
  excluded: Set<string>,
  limit = 50
): Promise<unknown[]> {
  if (!hasFolderRules(filter)) {
    return [];
  }

  const dialogs = await context.client.getDialogs({ limit });
  return dialogs
    .filter((dialog) => matchesFolderRules(dialog, filter))
    .filter((dialog) => !matchesFolderExclusionFlags(dialog, filter))
    .map((dialog) => asRecord(dialog).entity ?? dialog)
    .filter((entity) => !excluded.has(entityFolderPeerKey(entity)));
}
