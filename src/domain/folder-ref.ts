import { z } from "zod";
import { AppError } from "./errors.js";
import type { FolderRefValue } from "./types.js";

const folderRefSchema = z.object({
  version: z.literal(1),
  id: z.number().int().positive(),
  title: z.string().min(1).optional()
});

export function serializeFolderRef(value: FolderRefValue): string {
  const parsed = folderRefSchema.parse(value);
  return JSON.stringify(parsed);
}

export function parseFolderRef(value: string): FolderRefValue {
  try {
    const parsedUnknown: unknown = JSON.parse(value);
    const parsed = folderRefSchema.parse(parsedUnknown);
    const folderRef: FolderRefValue = {
      version: parsed.version,
      id: parsed.id
    };
    if (parsed.title !== undefined) {
      folderRef.title = parsed.title;
    }
    return folderRef;
  } catch (error) {
    throw new AppError("FOLDER_NOT_FOUND", "Invalid folder_ref", {
      publicMessage: "Folder reference is invalid",
      cause: error
    });
  }
}
