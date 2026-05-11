import { Api } from "telegram";
import type { GetChatParticipantsInput } from "../application/telegram-queries.js";
import type { MediaFilterType, PeerRefValue } from "../domain/types.js";
import { toBigInteger } from "./telegram-records.js";

export function entityLookupFromPeer(peer: PeerRefValue): unknown {
  if (peer.accessHash !== undefined) {
    const id = toBigInteger(peer.id);
    const accessHash = toBigInteger(peer.accessHash);
    if (peer.type === "channel" || peer.type === "group") {
      return new Api.InputPeerChannel({ channelId: id, accessHash });
    }
    if (peer.type === "user") {
      return new Api.InputPeerUser({ userId: id, accessHash });
    }
  }

  if (peer.type === "group") {
    return new Api.InputPeerChat({ chatId: toBigInteger(peer.id) });
  }

  if (peer.username !== undefined) {
    return `@${peer.username}`;
  }

  return toBigInteger(peer.id);
}

export function messageFilterFromMediaType(mediaType: MediaFilterType): Api.TypeMessagesFilter {
  switch (mediaType) {
    case "links":
      return new Api.InputMessagesFilterUrl();
    case "photos":
      return new Api.InputMessagesFilterPhotos();
    case "videos":
      return new Api.InputMessagesFilterVideo();
    case "photo_video":
      return new Api.InputMessagesFilterPhotoVideo();
    case "documents":
      return new Api.InputMessagesFilterDocument();
    case "gifs":
      return new Api.InputMessagesFilterGif();
    case "voice":
      return new Api.InputMessagesFilterVoice();
    case "music":
      return new Api.InputMessagesFilterMusic();
    case "round_voice":
      return new Api.InputMessagesFilterRoundVoice();
    case "round_video":
      return new Api.InputMessagesFilterRoundVideo();
    case "mentions":
      return new Api.InputMessagesFilterMyMentions();
    case "geo":
      return new Api.InputMessagesFilterGeo();
    case "contacts":
      return new Api.InputMessagesFilterContacts();
    case "pinned":
      return new Api.InputMessagesFilterPinned();
  }
}

export function participantFilterFor(input: GetChatParticipantsInput): Api.TypeChannelParticipantsFilter | undefined {
  if (input.search !== undefined) {
    return new Api.ChannelParticipantsSearch({ q: input.search });
  }
  switch (input.filter) {
    case "recent":
      return undefined;
    case "admins":
      return new Api.ChannelParticipantsAdmins();
    case "bots":
      return new Api.ChannelParticipantsBots();
  }
}
