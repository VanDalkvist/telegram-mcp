import type {
  BatchSearchResult,
  ChatPage,
  ChatMetadata,
  ChatSummary,
  FolderSummary,
  MediaFilterType,
  Message,
  MessagePage,
  MessageSummary,
  ProfilePhotoDownloadResult,
  ProfilePhotoInfo,
  ParticipantSummary,
  SearchCounterSummary
} from "../domain/types.js";

export type ChatFilterType = "any" | "channel" | "group" | "user";

export interface ListChatsInput {
  limit: number;
  type: ChatFilterType;
  folder_ref?: string | undefined;
}

export interface ListFolderChatsPageInput {
  folder_ref: string;
  limit: number;
  type: ChatFilterType;
  cursor?: string | undefined;
}

export interface SearchChatsInput {
  query: string;
  limit: number;
  type: ChatFilterType;
  folder_ref?: string | undefined;
}

export interface ResolveChatInput {
  ref: string;
}

export interface ListFoldersInput {}

export interface ResolveFolderInput {
  ref: string;
}

export interface GetChatInput {
  chat_ref: string;
}

export interface SearchMessagesInput {
  query: string;
  chat_ref?: string | undefined;
  folder_ref?: string | undefined;
  folder_chat_limit?: number | undefined;
  limit: number;
  from_date?: string | undefined;
  to_date?: string | undefined;
}

export interface GetRecentMessagesInput {
  chat_ref?: string | undefined;
  folder_ref?: string | undefined;
  folder_chat_limit?: number | undefined;
  limit: number;
  from_date: string;
  to_date: string;
}

export interface SearchMessagesPageInput extends SearchMessagesInput {
  cursor?: string | undefined;
}

export interface SearchMessagesBatchInput {
  queries: string[];
  chat_ref?: string | undefined;
  folder_ref?: string | undefined;
  folder_chat_limit?: number | undefined;
  limit: number;
  from_date?: string | undefined;
  to_date?: string | undefined;
}

export interface SearchMediaInput {
  media_type: MediaFilterType;
  query: string;
  chat_ref?: string | undefined;
  folder_ref?: string | undefined;
  folder_chat_limit?: number | undefined;
  limit: number;
  from_date?: string | undefined;
  to_date?: string | undefined;
}

export interface GetMessagesInput {
  chat_ref: string;
  limit: number;
  before_message_id?: number | undefined;
  after_message_id?: number | undefined;
}

export interface GetMessageInput {
  chat_ref: string;
  message_id: number;
}

export interface GetMessageContextInput extends GetMessageInput {
  before: number;
  after: number;
}

export interface GetThreadInput extends GetMessageInput {
  limit: number;
  before_message_id?: number | undefined;
}

export interface GetDiscussionInput extends GetMessageInput {}

export interface GetSearchCountersInput {
  chat_ref: string;
  media_types: MediaFilterType[];
}

export type ParticipantFilter = "recent" | "admins" | "bots";

export interface GetChatParticipantsInput {
  chat_ref: string;
  filter: ParticipantFilter;
  limit: number;
  search?: string | undefined;
}

export interface GetProfilePhotoInfoInput {
  peer_ref: string;
}

export interface DownloadProfilePhotoInput {
  peer_ref: string;
  output_file: string;
  overwrite: boolean;
}

export interface TelegramQueries {
  listFolders(input: ListFoldersInput): Promise<{ folders: FolderSummary[] }>;
  resolveFolder(input: ResolveFolderInput): Promise<{ folder: FolderSummary }>;
  listChats(input: ListChatsInput): Promise<{ chats: ChatSummary[] }>;
  listFolderChatsPage(input: ListFolderChatsPageInput): Promise<{ chats: ChatSummary[]; page: ChatPage }>;
  searchChats(input: SearchChatsInput): Promise<{ chats: ChatSummary[] }>;
  resolveChat(input: ResolveChatInput): Promise<{ chat: ChatSummary }>;
  getChat(input: GetChatInput): Promise<{ chat: ChatMetadata }>;
  searchMessages(input: SearchMessagesInput): Promise<{ messages: MessageSummary[] }>;
  getRecentMessages(input: GetRecentMessagesInput): Promise<{ messages: MessageSummary[]; page: MessagePage }>;
  searchMessagesPage(input: SearchMessagesPageInput): Promise<{ messages: MessageSummary[]; page: MessagePage }>;
  searchMessagesBatch(input: SearchMessagesBatchInput): Promise<{ results: BatchSearchResult[]; messages: MessageSummary[] }>;
  searchMedia(input: SearchMediaInput): Promise<{ messages: MessageSummary[] }>;
  getMessages(input: GetMessagesInput): Promise<{ messages: MessageSummary[]; page: MessagePage }>;
  getMessage(input: GetMessageInput): Promise<{ message: Message }>;
  getMessageContext(input: GetMessageContextInput): Promise<{
    target: Message;
    before: MessageSummary[];
    after: MessageSummary[];
  }>;
  getThread(input: GetThreadInput): Promise<{ messages: MessageSummary[]; page: MessagePage }>;
  getDiscussion(input: GetDiscussionInput): Promise<{ messages: MessageSummary[] }>;
  getSearchCounters(input: GetSearchCountersInput): Promise<{ counters: SearchCounterSummary[] }>;
  getChatParticipants(input: GetChatParticipantsInput): Promise<{ participants: ParticipantSummary[] }>;
  getProfilePhotoInfo(input: GetProfilePhotoInfoInput): Promise<{ profile_photo: ProfilePhotoInfo }>;
  downloadProfilePhoto(input: DownloadProfilePhotoInput): Promise<ProfilePhotoDownloadResult>;
}
