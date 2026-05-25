import { z, ZodError } from "zod";
import type { TelegramQueries } from "../../application/telegram-queries.js";
import { AppError } from "../../domain/errors.js";

export const telegramDownloadProfilePhotoDescription =
  "Download one current profile photo for a resolved participant or chat ref to a local file.";

export const telegramDownloadProfilePhotoSchema = z.object({
  peer_ref: z.string().trim().min(1),
  output_file: z.string().trim().min(1),
  overwrite: z.boolean().default(false)
});

export function createTelegramDownloadProfilePhotoHandler(queries: TelegramQueries): (input: unknown) => Promise<unknown> {
  return async (input) => queries.downloadProfilePhoto(parseTelegramDownloadProfilePhotoInput(input));
}

function parseTelegramDownloadProfilePhotoInput(input: unknown): z.infer<typeof telegramDownloadProfilePhotoSchema> {
  try {
    return telegramDownloadProfilePhotoSchema.parse(input ?? {});
  } catch (error) {
    if (error instanceof ZodError) {
      throw new AppError("CONFIG_INVALID", "Invalid input for telegram_download_profile_photo", {
        publicMessage: "Tool input is invalid",
        details: {
          tool: "telegram_download_profile_photo",
          issues: error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message
          }))
        },
        cause: error
      });
    }
    throw error;
  }
}
