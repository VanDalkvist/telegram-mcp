import type {
  GetChatInput,
  GetChatParticipantsInput,
  GetDiscussionInput,
  GetMessageContextInput,
  GetMessageInput,
  GetMessagesInput,
  GetRecentMessagesInput,
  GetSearchCountersInput,
  GetThreadInput,
  ListFolderChatsPageInput,
  ListFoldersInput,
  ListChatsInput,
  ResolveFolderInput,
  ResolveChatInput,
  SearchChatsInput,
  SearchMediaInput,
  SearchMessagesBatchInput,
  SearchMessagesInput,
  SearchMessagesPageInput,
  TelegramQueries
} from "../application/telegram-queries.js";
import type {
  BatchSearchResult,
  ChatPage,
  ChatMetadata,
  ChatSummary,
  FolderSummary,
  Message,
  MessagePage,
  MessageSummary,
  ParticipantSummary,
  SearchCounterSummary
} from "../domain/types.js";
import type { GramJsLikeClient } from "./telegram-client-types.js";
import type { TelegramQueryContext } from "./telegram-queries/telegram-query-context.js";
import { getChat } from "./telegram-queries/get-chat.js";
import { getChatParticipants } from "./telegram-queries/get-chat-participants.js";
import { getDiscussion } from "./telegram-queries/get-discussion.js";
import { getMessage } from "./telegram-queries/get-message.js";
import { getMessageContext } from "./telegram-queries/get-message-context.js";
import { getMessages } from "./telegram-queries/get-messages.js";
import { getRecentMessages } from "./telegram-queries/get-recent-messages.js";
import { getSearchCounters } from "./telegram-queries/get-search-counters.js";
import { getThread } from "./telegram-queries/get-thread.js";
import { listFolderChatsPage } from "./telegram-queries/list-folder-chats-page.js";
import { listChats } from "./telegram-queries/list-chats.js";
import { listFolders } from "./telegram-queries/list-folders.js";
import { resolveChat } from "./telegram-queries/resolve-chat.js";
import { resolveFolder } from "./telegram-queries/resolve-folder.js";
import { searchChats } from "./telegram-queries/search-chats.js";
import { searchMedia } from "./telegram-queries/search-media.js";
import { searchMessages } from "./telegram-queries/search-messages.js";
import { searchMessagesBatch } from "./telegram-queries/search-messages-batch.js";
import { searchMessagesPage } from "./telegram-queries/search-messages-page.js";

export type { GramJsLikeClient } from "./telegram-client-types.js";

export class TelegramClientAdapter implements TelegramQueries {
  private readonly context: TelegramQueryContext;

  public constructor(client: GramJsLikeClient) {
    this.context = { client };
  }

  public async listFolders(input: ListFoldersInput = {}): Promise<{ folders: FolderSummary[] }> {
    return listFolders(this.context, input);
  }

  public async resolveFolder(input: ResolveFolderInput): Promise<{ folder: FolderSummary }> {
    return resolveFolder(this.context, input);
  }

  public async listChats(input: ListChatsInput): Promise<{ chats: ChatSummary[] }> {
    return listChats(this.context, input);
  }

  public async listFolderChatsPage(input: ListFolderChatsPageInput): Promise<{ chats: ChatSummary[]; page: ChatPage }> {
    return listFolderChatsPage(this.context, input);
  }

  public async searchChats(input: SearchChatsInput): Promise<{ chats: ChatSummary[] }> {
    return searchChats(this.context, input);
  }

  public async resolveChat(input: ResolveChatInput): Promise<{ chat: ChatSummary }> {
    return resolveChat(this.context, input);
  }

  public async getChat(input: GetChatInput): Promise<{ chat: ChatMetadata }> {
    return getChat(this.context, input);
  }

  public async searchMessages(input: SearchMessagesInput): Promise<{ messages: MessageSummary[] }> {
    return searchMessages(this.context, input);
  }

  public async getRecentMessages(input: GetRecentMessagesInput): Promise<{ messages: MessageSummary[]; page: MessagePage }> {
    return getRecentMessages(this.context, input);
  }

  public async searchMessagesPage(input: SearchMessagesPageInput): Promise<{ messages: MessageSummary[]; page: MessagePage }> {
    return searchMessagesPage(this.context, input);
  }

  public async searchMessagesBatch(input: SearchMessagesBatchInput): Promise<{ results: BatchSearchResult[]; messages: MessageSummary[] }> {
    return searchMessagesBatch(this.context, input);
  }

  public async searchMedia(input: SearchMediaInput): Promise<{ messages: MessageSummary[] }> {
    return searchMedia(this.context, input);
  }

  public async getMessages(input: GetMessagesInput): Promise<{ messages: MessageSummary[]; page: MessagePage }> {
    return getMessages(this.context, input);
  }

  public async getMessage(input: GetMessageInput): Promise<{ message: Message }> {
    return getMessage(this.context, input);
  }

  public async getMessageContext(input: GetMessageContextInput): Promise<{
    target: Message;
    before: MessageSummary[];
    after: MessageSummary[];
  }> {
    return getMessageContext(this.context, input);
  }

  public async getThread(input: GetThreadInput): Promise<{ messages: MessageSummary[]; page: MessagePage }> {
    return getThread(this.context, input);
  }

  public async getDiscussion(input: GetDiscussionInput): Promise<{ messages: MessageSummary[] }> {
    return getDiscussion(this.context, input);
  }

  public async getSearchCounters(input: GetSearchCountersInput): Promise<{ counters: SearchCounterSummary[] }> {
    return getSearchCounters(this.context, input);
  }

  public async getChatParticipants(input: GetChatParticipantsInput): Promise<{ participants: ParticipantSummary[] }> {
    return getChatParticipants(this.context, input);
  }
}
