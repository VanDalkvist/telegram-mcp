import { z, ZodError } from "zod";
import type { TelegramQueries } from "../../application/telegram-queries.js";
import { AppError } from "../../domain/errors.js";

export const telegramGetProfilePhotoInfoDescription =
  "Read whether one resolved participant or chat ref has a current profile photo.";

export const telegramGetProfilePhotoInfoSchema = z.object({
  peer_ref: z.string().trim().min(1)
});

export function createTelegramGetProfilePhotoInfoHandler(queries: TelegramQueries): (input: unknown) => Promise<unknown> {
  return async (input) => queries.getProfilePhotoInfo(parseTelegramGetProfilePhotoInfoInput(input));
}

function parseTelegramGetProfilePhotoInfoInput(input: unknown): z.infer<typeof telegramGetProfilePhotoInfoSchema> {
  try {
    return telegramGetProfilePhotoInfoSchema.parse(input ?? {});
  } catch (error) {
    if (error instanceof ZodError) {
      throw new AppError("CONFIG_INVALID", "Invalid input for telegram_get_profile_photo_info", {
        publicMessage: "Tool input is invalid",
        details: {
          tool: "telegram_get_profile_photo_info",
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
