import { parsePeerRef } from "../../domain/peer-ref.js";
import type { GetChatParticipantsInput } from "../../application/telegram-queries.js";
import type { ParticipantSummary } from "../../domain/types.js";
import { participantSummaryFromEntity } from "../telegram-normalizers.js";
import { normalizeKnownError } from "../telegram-records.js";
import {
  entityLookupFromPeer,
  participantFilterFor
} from "../telegram-requests.js";
import type { TelegramQueryContext } from "./telegram-query-context.js";

export async function getChatParticipants(
  context: TelegramQueryContext,
  input: GetChatParticipantsInput
): Promise<{ participants: ParticipantSummary[] }> {
  try {
    const peer = parsePeerRef(input.chat_ref);
    const entity = await context.client.getEntity(entityLookupFromPeer(peer));
    const participants = await context.client.getParticipants(entity, {
      filter: participantFilterFor(input),
      limit: input.limit,
      search: input.search
    });
    return { participants: participants.map((participant) => participantSummaryFromEntity(participant)) };
  } catch (error) {
    throw normalizeKnownError(error);
  }
}
