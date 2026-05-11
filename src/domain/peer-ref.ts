import { z } from "zod";
import { AppError } from "./errors.js";
import type { PeerRefValue } from "./types.js";

const peerRefSchema = z.object({
  version: z.literal(1),
  type: z.enum(["channel", "group", "user"]),
  id: z.string().min(1),
  accessHash: z.string().min(1).optional(),
  username: z.string().min(1).optional(),
  title: z.string().min(1).optional()
});

export function serializePeerRef(value: PeerRefValue): string {
  const parsed = peerRefSchema.parse(value);
  return JSON.stringify(parsed);
}

export function parsePeerRef(value: string): PeerRefValue {
  try {
    const parsedUnknown: unknown = JSON.parse(value);
    const parsed = peerRefSchema.parse(parsedUnknown);
    const peerRef: PeerRefValue = {
      version: parsed.version,
      type: parsed.type,
      id: parsed.id
    };
    if (parsed.accessHash !== undefined) {
      peerRef.accessHash = parsed.accessHash;
    }
    if (parsed.username !== undefined) {
      peerRef.username = parsed.username;
    }
    if (parsed.title !== undefined) {
      peerRef.title = parsed.title;
    }
    return peerRef;
  } catch (error) {
    throw new AppError("CHAT_NOT_FOUND", "Invalid chat_ref", {
      publicMessage: "Chat reference is invalid",
      cause: error
    });
  }
}
