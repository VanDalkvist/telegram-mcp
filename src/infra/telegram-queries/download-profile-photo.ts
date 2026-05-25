import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { parsePeerRef } from "../../domain/peer-ref.js";
import { AppError } from "../../domain/errors.js";
import type { DownloadProfilePhotoInput } from "../../application/telegram-queries.js";
import type { ProfilePhotoDownloadResult } from "../../domain/types.js";
import { normalizeKnownError } from "../telegram-records.js";
import { entityLookupFromPeer } from "../telegram-requests.js";
import type { TelegramQueryContext } from "./telegram-query-context.js";

export async function downloadProfilePhoto(
  context: TelegramQueryContext,
  input: DownloadProfilePhotoInput
): Promise<ProfilePhotoDownloadResult> {
  try {
    const peer = parsePeerRef(input.peer_ref);
    const entity = await context.client.getEntity(entityLookupFromPeer(peer));
    const outputFile = resolve(input.output_file);
    const media = await context.client.downloadProfilePhoto(entity, { isBig: true });
    if (typeof media === "string") {
      throw new AppError("TELEGRAM_ERROR", "Telegram profile photo download returned an unexpected file path", {
        publicMessage: "Telegram returned an unsupported profile photo"
      });
    }
    if (!Buffer.isBuffer(media) || media.length === 0) {
      return { output_file: outputFile, status: "skipped", reason: "no_visible_profile_photo" };
    }
    const written = await writeOutputFile(outputFile, media, input.overwrite);
    if (!written) {
      return { output_file: outputFile, status: "skipped", reason: "file_exists" };
    }
    return { output_file: outputFile, status: "downloaded", bytes: media.length };
  } catch (error) {
    throw normalizeKnownError(error);
  }
}

async function writeOutputFile(outputFile: string, media: Buffer, overwrite: boolean): Promise<boolean> {
  try {
    await mkdir(dirname(outputFile), { recursive: true });
    await writeFile(outputFile, media, { flag: overwrite ? "w" : "wx", mode: 0o600 });
    return true;
  } catch (error) {
    if (isFileExistsError(error)) {
      return false;
    }
    throw new AppError("CONFIG_INVALID", "Profile photo output file is not writable", {
      publicMessage: "Profile photo output file is not writable",
      cause: error
    });
  }
}

function isFileExistsError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "EEXIST";
}
