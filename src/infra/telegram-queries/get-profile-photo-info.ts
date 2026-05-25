import { parsePeerRef } from "../../domain/peer-ref.js";
import type { GetProfilePhotoInfoInput } from "../../application/telegram-queries.js";
import { asRecord, normalizeKnownError, readString } from "../telegram-records.js";
import { entityLookupFromPeer } from "../telegram-requests.js";
import type { TelegramQueryContext } from "./telegram-query-context.js";

export async function getProfilePhotoInfo(
  context: TelegramQueryContext,
  input: GetProfilePhotoInfoInput
): Promise<{ profile_photo: { available: boolean } }> {
  try {
    const peer = parsePeerRef(input.peer_ref);
    const entity = await context.client.getEntity(entityLookupFromPeer(peer));
    return {
      profile_photo: {
        available: hasProfilePhoto(entity)
      }
    };
  } catch (error) {
    throw normalizeKnownError(error);
  }
}

function hasProfilePhoto(entity: unknown): boolean {
  const photo = asRecord(asRecord(entity).photo);
  const className = readString(photo.className);
  if (className !== undefined) {
    return className === "UserProfilePhoto" || className === "ChatPhoto";
  }
  return Object.keys(photo).length > 0;
}
