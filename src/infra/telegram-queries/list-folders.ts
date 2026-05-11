import { Api } from "telegram";
import type { ListFoldersInput } from "../../application/telegram-queries.js";
import type { FolderSummary } from "../../domain/types.js";
import { normalizeFolderFilters } from "../telegram-normalizers.js";
import { normalizeKnownError } from "../telegram-records.js";
import type { TelegramQueryContext } from "./telegram-query-context.js";

export async function listFolders(context: TelegramQueryContext, _input: ListFoldersInput = {}): Promise<{ folders: FolderSummary[] }> {
  try {
    const response = await context.client.invoke(new Api.messages.GetDialogFilters());
    return { folders: normalizeFolderFilters(response) };
  } catch (error) {
    throw normalizeKnownError(error);
  }
}
