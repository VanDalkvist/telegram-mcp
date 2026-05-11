import { AppError } from "../../domain/errors.js";
import { parseFolderRef } from "../../domain/folder-ref.js";
import type { ResolveFolderInput } from "../../application/telegram-queries.js";
import type { FolderSummary } from "../../domain/types.js";
import { folderSummaryFromRef } from "../telegram-normalizers.js";
import type { TelegramQueryContext } from "./telegram-query-context.js";
import { listFolders } from "./list-folders.js";

export async function resolveFolder(context: TelegramQueryContext, input: ResolveFolderInput): Promise<{ folder: FolderSummary }> {
  if (looksLikeFolderRef(input.ref)) {
    const folder = parseFolderRef(input.ref);
    return { folder: folderSummaryFromRef(folder.id, folder.title) };
  }

  const normalizedRef = input.ref.trim();
  const numericId = Number.parseInt(normalizedRef, 10);
  const { folders } = await listFolders(context, {});

  if (/^\d+$/.test(normalizedRef)) {
    const folder = folders.find((candidate) => candidate.id === numericId);
    if (folder !== undefined) {
      return { folder };
    }
  }

  const exactMatches = folders.filter((folder) => folder.title === normalizedRef);
  if (exactMatches.length === 1) {
    return { folder: exactMatches[0]! };
  }

  if (exactMatches.length > 1) {
    throw new AppError("FOLDER_AMBIGUOUS", `Multiple folders match "${input.ref}"`, {
      publicMessage: "Folder reference is ambiguous",
      details: { candidates: exactMatches.map(({ folder_ref, id, title, kind }) => ({ folder_ref, id, title, kind })) }
    });
  }

  throw new AppError("FOLDER_NOT_FOUND", `Folder not found: ${input.ref}`, {
    publicMessage: "Folder not found"
  });
}

function looksLikeFolderRef(value: string): boolean {
  try {
    parseFolderRef(value);
    return true;
  } catch {
    return false;
  }
}
