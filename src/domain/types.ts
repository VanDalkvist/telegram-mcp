export type ChatType = "channel" | "group" | "user";
export type MediaFilterType =
  | "links"
  | "photos"
  | "videos"
  | "photo_video"
  | "documents"
  | "gifs"
  | "voice"
  | "music"
  | "round_voice"
  | "round_video"
  | "mentions"
  | "geo"
  | "contacts"
  | "pinned";

export interface PeerRefValue {
  version: 1;
  type: ChatType;
  id: string;
  accessHash?: string;
  username?: string;
  title?: string;
}

export interface FolderRefValue {
  version: 1;
  id: number;
  title?: string;
}

export type FolderKind = "dialog_filter" | "chatlist";

export interface FolderSummary {
  folder_ref: string;
  id: number;
  title: string;
  kind: FolderKind;
  include_peers_count?: number;
  pinned_peers_count?: number;
  exclude_peers_count?: number;
}

export interface ChatSummary {
  chat_ref: string;
  id: string;
  title: string;
  username?: string;
  type: ChatType;
  is_public: boolean;
}

export interface ChatPage {
  order: "recent_first";
  next_cursor?: string;
}

export interface ChatMetadata extends ChatSummary {
  description?: string;
  participants_count?: number;
}

export interface SenderSummary {
  id: string;
  title?: string;
  username?: string;
  type?: ChatType;
}

export interface MessageSummary {
  chat_ref: string;
  message_id: number;
  date: string;
  sender?: SenderSummary;
  text: string;
  reply_to_message_id?: number;
  views?: number;
  forwards?: number;
  link?: string;
}

export interface Message extends MessageSummary {}

export interface MessagePage {
  before_message_id?: number;
  after_message_id?: number;
  order: "older_to_newer" | "newer_to_older";
  next_cursor?: string;
}

export interface BatchSearchResult {
  query: string;
  messages: MessageSummary[];
}

export interface SearchCounterSummary {
  media_type: MediaFilterType;
  count: number;
  inexact?: boolean;
}

export interface ParticipantSummary {
  id: string;
  participant_ref: string;
  title: string;
  username?: string;
  type?: ChatType;
  bot?: boolean;
}

export interface ProfilePhotoInfo {
  available: boolean;
}

export interface ProfilePhotoDownloadResult {
  output_file: string;
  status: "downloaded" | "skipped";
  bytes?: number;
  reason?: "no_visible_profile_photo" | "file_exists";
}
