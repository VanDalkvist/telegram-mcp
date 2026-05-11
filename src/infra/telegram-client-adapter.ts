import { Api } from "telegram";
import bigInt from "big-integer";
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
import { AppError } from "../domain/errors.js";
import { parseFolderRef } from "../domain/folder-ref.js";
import { parsePeerRef } from "../domain/peer-ref.js";
import type {
  BatchSearchResult,
  ChatMetadata,
  ChatSummary,
  FolderSummary,
  Message,
  MessagePage,
  MessageSummary,
  ParticipantSummary,
  SearchCounterSummary
} from "../domain/types.js";
import {
  entityFolderPeerKey,
  folderPeerKey,
  hasFolderRules,
  matchesFolderRules,
  peersFromFolderFilter,
  uniqueEntities
} from "./telegram-folder-expansion.js";
import {
  chatMetadataFromEntity,
  chatSummaryFromDialog,
  chatSummaryFromEntity,
  filterMessagesByDate,
  folderSummaryFromRef,
  normalizeFolderFilters,
  normalizeGlobalSearchMessages,
  normalizeMessages,
  normalizeMessagesFromResponse,
  normalizeSearchCounters,
  pageForMessages,
  parseSearchCursor,
  participantSummaryFromEntity,
  rawFolderFilters,
  sortNewerToOlder
} from "./telegram-normalizers.js";
import {
  asRecord,
  normalizeKnownError,
  readArray,
  readNumber,
  toUnixSeconds
} from "./telegram-records.js";
import {
  entityLookupFromPeer,
  messageFilterFromMediaType,
  participantFilterFor
} from "./telegram-requests.js";

export interface GramJsLikeClient {
  getDialogs(params?: { limit?: number; folder?: number }): Promise<unknown[]>;
  getEntity(entity: unknown): Promise<unknown>;
  getMessages(entity: unknown, params?: Record<string, unknown>): Promise<unknown[]>;
  getParticipants(entity: unknown, params?: Record<string, unknown>): Promise<unknown[]>;
  invoke(request: unknown): Promise<unknown>;
}

export class TelegramClientAdapter implements TelegramQueries {
  public constructor(private readonly client: GramJsLikeClient) {}

  public async listFolders(_input: ListFoldersInput = {}): Promise<{ folders: FolderSummary[] }> {
    try {
      const response = await this.client.invoke(new Api.messages.GetDialogFilters());
      return { folders: normalizeFolderFilters(response) };
    } catch (error) {
      throw normalizeKnownError(error);
    }
  }

  public async resolveFolder(input: ResolveFolderInput): Promise<{ folder: FolderSummary }> {
    if (looksLikeFolderRef(input.ref)) {
      const folder = parseFolderRef(input.ref);
      return { folder: folderSummaryFromRef(folder.id, folder.title) };
    }

    const normalizedRef = input.ref.trim();
    const numericId = Number.parseInt(normalizedRef, 10);
    const { folders } = await this.listFolders({});

    if (/^\d+$/.test(normalizedRef)) {
      const folder = folders.find((candidate) => candidate.id === numericId);
      if (folder !== undefined) {
        return { folder };
      }
    }

    const exactMatches = folders.filter((folder) => folder.title === normalizedRef);
    if (exactMatches.length === 1) {
      return { folder: exactMatches[0]! };
    }

    if (exactMatches.length > 1) {
      throw new AppError("FOLDER_AMBIGUOUS", `Multiple folders match "${input.ref}"`, {
        publicMessage: "Folder reference is ambiguous",
        details: { candidates: exactMatches.map(({ folder_ref, id, title, kind }) => ({ folder_ref, id, title, kind })) }
      });
    }

    throw new AppError("FOLDER_NOT_FOUND", `Folder not found: ${input.ref}`, {
      publicMessage: "Folder not found"
    });
  }

  public async listChats(input: ListChatsInput): Promise<{ chats: ChatSummary[] }> {
    try {
      if (input.folder_ref !== undefined) {
        return this.listFolderChats({ ...input, folder_ref: input.folder_ref });
      }

      const dialogs = await this.client.getDialogs({ limit: input.limit });
      return { chats: dialogs.map((dialog) => chatSummaryFromDialog(dialog)).filter((chat) => matchesType(chat, input.type)) };
    } catch (error) {
      throw normalizeKnownError(error);
    }
  }

  public async searchChats(input: SearchChatsInput): Promise<{ chats: ChatSummary[] }> {
    const { chats } = await this.listChats({
      limit: Math.max(input.limit, 100),
      type: input.type,
      folder_ref: input.folder_ref
    });
    const query = input.query.toLocaleLowerCase();
    return {
      chats: chats
        .filter((chat) => chat.title.toLocaleLowerCase().includes(query) || chat.username?.toLocaleLowerCase().includes(query))
        .slice(0, input.limit)
    };
  }

  public async resolveChat(input: ResolveChatInput): Promise<{ chat: ChatSummary }> {
    if (looksLikePeerRef(input.ref)) {
      return { chat: await this.getSummaryFromPeerRef(input.ref) };
    }

    const normalizedRef = normalizeChatRefInput(input.ref);
    if (normalizedRef.startsWith("@") || /^https?:\/\/t\.me\//i.test(normalizedRef)) {
      return { chat: chatSummaryFromEntity(await this.client.getEntity(normalizedRef.replace(/^https?:\/\/t\.me\//i, "@"))) };
    }

    if (/^-?\d+$/.test(normalizedRef)) {
      return { chat: chatSummaryFromEntity(await this.client.getEntity(Number.parseInt(normalizedRef, 10))) };
    }

    const { chats } = await this.searchChats({ query: normalizedRef, limit: 50, type: "any" });
    const exactMatches = chats.filter((chat) => chat.title === normalizedRef || chat.username === normalizedRef.replace(/^@/, ""));

    if (exactMatches.length === 1) {
      return { chat: exactMatches[0]! };
    }

    if (exactMatches.length > 1) {
      throw new AppError("CHAT_AMBIGUOUS", `Multiple chats match "${input.ref}"`, {
        publicMessage: "Chat reference is ambiguous",
        details: { candidates: exactMatches.map(({ chat_ref, title, username, type }) => ({ chat_ref, title, username, type })) }
      });
    }

    throw new AppError("CHAT_NOT_FOUND", `Chat not found: ${input.ref}`, {
      publicMessage: "Chat not found"
    });
  }

  public async getChat(input: GetChatInput): Promise<{ chat: ChatMetadata }> {
    try {
      const peer = parsePeerRef(input.chat_ref);
      const entity = await this.client.getEntity(entityLookupFromPeer(peer));
      return { chat: chatMetadataFromEntity(entity) };
    } catch (error) {
      throw normalizeKnownError(error);
    }
  }

  public async searchMessages(input: SearchMessagesInput): Promise<{ messages: MessageSummary[] }> {
    try {
      if (input.chat_ref !== undefined) {
        const peer = parsePeerRef(input.chat_ref);
        const entity = await this.client.getEntity(entityLookupFromPeer(peer));
        const messages = await this.client.getMessages(entity, {
          limit: input.limit,
          search: input.query,
          offsetDate: input.to_date === undefined ? undefined : toUnixSeconds(input.to_date)
        });

        return { messages: normalizeMessages(messages, input.chat_ref) };
      }

      if (input.folder_ref !== undefined) {
        return this.searchFolderMessages({ ...input, folder_ref: input.folder_ref });
      }

      const requestParams: {
        q: string;
        limit: number;
        filter: Api.InputMessagesFilterEmpty;
        minDate?: number;
        maxDate?: number;
        offsetRate: number;
        offsetPeer: Api.InputPeerEmpty;
        offsetId: number;
      } = {
        q: input.query,
        limit: input.limit,
        filter: new Api.InputMessagesFilterEmpty(),
        offsetRate: 0,
        offsetPeer: new Api.InputPeerEmpty(),
        offsetId: 0
      };
      if (input.from_date !== undefined) {
        requestParams.minDate = toUnixSeconds(input.from_date);
      }
      if (input.to_date !== undefined) {
        requestParams.maxDate = toUnixSeconds(input.to_date);
      }
      const response = await this.client.invoke(new Api.messages.SearchGlobal(requestParams));
      return { messages: normalizeGlobalSearchMessages(response) };
    } catch (error) {
      throw normalizeKnownError(error);
    }
  }

  public async getRecentMessages(input: GetRecentMessagesInput): Promise<{ messages: MessageSummary[]; page: MessagePage }> {
    try {
      if (input.chat_ref !== undefined) {
        const peer = parsePeerRef(input.chat_ref);
        const entity = await this.client.getEntity(entityLookupFromPeer(peer));
        const messages = await this.readRecentMessagesForEntity(entity, input.chat_ref, input);
        return { messages, page: pageForMessages(messages, "newer_to_older") };
      }

      if (input.folder_ref !== undefined) {
        const entities = await this.getFolderPeerEntities(input.folder_ref, input.folder_chat_limit ?? 5);
        const chunks: MessageSummary[][] = [];
        for (const entity of entities) {
          const chat = chatSummaryFromEntity(entity);
          chunks.push(await this.readRecentMessagesForEntity(entity, chat.chat_ref, input));
        }
        const messages = sortNewerToOlder(chunks.flat()).slice(0, input.limit);
        return { messages, page: pageForMessages(messages, "newer_to_older") };
      }

      throw new AppError("CONFIG_INVALID", "chat_ref or folder_ref is required", {
        publicMessage: "Tool input is invalid"
      });
    } catch (error) {
      throw normalizeKnownError(error);
    }
  }

  public async searchMessagesPage(input: SearchMessagesPageInput): Promise<{ messages: MessageSummary[]; page: MessagePage }> {
    try {
      const cursor = parseSearchCursor(input.cursor);
      if (input.chat_ref !== undefined) {
        const peer = parsePeerRef(input.chat_ref);
        const entity = await this.client.getEntity(entityLookupFromPeer(peer));
        const messages = await this.searchMessagesForEntity(entity, input.chat_ref, input, undefined, {
          offsetId: cursor.offset_id
        });
        return { messages, page: pageForMessages(messages, "newer_to_older", messages.length >= input.limit) };
      }

      if (input.folder_ref !== undefined) {
        const { messages } = await this.searchFolderMessages({ ...input, folder_ref: input.folder_ref });
        return { messages, page: pageForMessages(messages, "newer_to_older", false) };
      }

      const requestParams: {
        q: string;
        limit: number;
        filter: Api.TypeMessagesFilter;
        minDate?: number;
        maxDate?: number;
        offsetRate: number;
        offsetPeer: Api.InputPeerEmpty;
        offsetId: number;
      } = {
        q: input.query,
        limit: input.limit,
        filter: new Api.InputMessagesFilterEmpty(),
        offsetRate: cursor.offset_rate ?? 0,
        offsetPeer: new Api.InputPeerEmpty(),
        offsetId: cursor.offset_id ?? 0
      };
      if (input.from_date !== undefined) {
        requestParams.minDate = toUnixSeconds(input.from_date);
      }
      if (input.to_date !== undefined) {
        requestParams.maxDate = toUnixSeconds(input.to_date);
      }
      const response = await this.client.invoke(new Api.messages.SearchGlobal(requestParams));
      const messages = normalizeGlobalSearchMessages(response);
      const nextRate = readNumber(asRecord(response).nextRate ?? asRecord(response).next_rate);
      return {
        messages,
        page: pageForMessages(messages, "newer_to_older", messages.length >= input.limit, nextRate)
      };
    } catch (error) {
      throw normalizeKnownError(error);
    }
  }

  public async searchMessagesBatch(input: SearchMessagesBatchInput): Promise<{ results: BatchSearchResult[]; messages: MessageSummary[] }> {
    const results: BatchSearchResult[] = [];
    const seen = new Set<string>();
    const deduped: MessageSummary[] = [];

    for (const query of input.queries) {
      const result = await this.searchMessages({
        query,
        chat_ref: input.chat_ref,
        folder_ref: input.folder_ref,
        folder_chat_limit: input.folder_chat_limit,
        limit: input.limit,
        from_date: input.from_date,
        to_date: input.to_date
      });
      results.push({ query, messages: result.messages });
      for (const message of result.messages) {
        const key = `${message.chat_ref}:${message.message_id}`;
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        deduped.push(message);
      }
    }

    return { results, messages: sortNewerToOlder(deduped).slice(0, input.limit) };
  }

  public async searchMedia(input: SearchMediaInput): Promise<{ messages: MessageSummary[] }> {
    try {
      const filter = messageFilterFromMediaType(input.media_type);
      if (input.chat_ref !== undefined) {
        const peer = parsePeerRef(input.chat_ref);
        const entity = await this.client.getEntity(entityLookupFromPeer(peer));
        return { messages: await this.searchMessagesForEntity(entity, input.chat_ref, input, filter) };
      }

      if (input.folder_ref !== undefined) {
        return this.searchFolderMessages({ ...input, query: input.query, folder_ref: input.folder_ref }, filter);
      }

      const requestParams: {
        q: string;
        limit: number;
        filter: Api.TypeMessagesFilter;
        minDate?: number;
        maxDate?: number;
        offsetRate: number;
        offsetPeer: Api.InputPeerEmpty;
        offsetId: number;
      } = {
        q: input.query,
        limit: input.limit,
        filter,
        offsetRate: 0,
        offsetPeer: new Api.InputPeerEmpty(),
        offsetId: 0
      };
      if (input.from_date !== undefined) {
        requestParams.minDate = toUnixSeconds(input.from_date);
      }
      if (input.to_date !== undefined) {
        requestParams.maxDate = toUnixSeconds(input.to_date);
      }
      const response = await this.client.invoke(new Api.messages.SearchGlobal(requestParams));
      return { messages: normalizeGlobalSearchMessages(response) };
    } catch (error) {
      throw normalizeKnownError(error);
    }
  }

  public async getMessages(input: GetMessagesInput): Promise<{ messages: MessageSummary[]; page: MessagePage }> {
    try {
      const peer = parsePeerRef(input.chat_ref);
      const entity = await this.client.getEntity(entityLookupFromPeer(peer));
      const messages = await this.client.getMessages(entity, {
        limit: input.limit,
        offsetId: input.before_message_id,
        minId: input.after_message_id
      });
      const normalized = normalizeMessages(messages, input.chat_ref).sort((left, right) => left.message_id - right.message_id);

      const page: MessagePage = {
        order: "older_to_newer"
      };
      if (normalized[0]?.message_id !== undefined) {
        page.before_message_id = normalized[0].message_id;
      }
      if (normalized.at(-1)?.message_id !== undefined) {
        page.after_message_id = normalized.at(-1)!.message_id;
      }

      return {
        messages: normalized,
        page
      };
    } catch (error) {
      throw normalizeKnownError(error);
    }
  }

  public async getMessage(input: GetMessageInput): Promise<{ message: Message }> {
    try {
      const peer = parsePeerRef(input.chat_ref);
      const entity = await this.client.getEntity(entityLookupFromPeer(peer));
      const messages = await this.client.getMessages(entity, { ids: input.message_id });
      const message = normalizeMessages(messages, input.chat_ref)[0];
      if (message === undefined) {
        throw new AppError("MESSAGE_NOT_FOUND", `Message not found: ${input.message_id}`, {
          publicMessage: "Message not found"
        });
      }

      return { message };
    } catch (error) {
      throw normalizeKnownError(error);
    }
  }

  public async getMessageContext(input: GetMessageContextInput): Promise<{
    target: Message;
    before: MessageSummary[];
    after: MessageSummary[];
  }> {
    const { message: target } = await this.getMessage(input);
    const peer = parsePeerRef(input.chat_ref);
    const entity = await this.client.getEntity(entityLookupFromPeer(peer));

    const beforeMessages = await this.client.getMessages(entity, {
      limit: input.before,
      offsetId: input.message_id
    });
    const afterMessages = await this.client.getMessages(entity, {
      limit: input.after,
      minId: input.message_id,
      reverse: true
    });

    return {
      target,
      before: normalizeMessages(beforeMessages, input.chat_ref).sort((left, right) => left.message_id - right.message_id),
      after: normalizeMessages(afterMessages, input.chat_ref).sort((left, right) => left.message_id - right.message_id)
    };
  }

  public async getThread(input: GetThreadInput): Promise<{ messages: MessageSummary[]; page: MessagePage }> {
    try {
      const peer = parsePeerRef(input.chat_ref);
      const entity = await this.client.getEntity(entityLookupFromPeer(peer));
      const response = await this.client.invoke(
        new Api.messages.GetReplies({
          peer: entity as Api.TypeEntityLike,
          msgId: input.message_id,
          offsetId: input.before_message_id ?? 0,
          offsetDate: 0,
          addOffset: 0,
          limit: input.limit,
          maxId: 0,
          minId: 0,
          hash: bigInt(0)
        })
      );
      const messages = normalizeMessagesFromResponse(response, input.chat_ref).sort((left, right) => left.message_id - right.message_id);
      return { messages, page: pageForMessages(messages, "older_to_newer", messages.length >= input.limit) };
    } catch (error) {
      throw normalizeKnownError(error);
    }
  }

  public async getDiscussion(input: GetDiscussionInput): Promise<{ messages: MessageSummary[] }> {
    try {
      const peer = parsePeerRef(input.chat_ref);
      const entity = await this.client.getEntity(entityLookupFromPeer(peer));
      const response = await this.client.invoke(
        new Api.messages.GetDiscussionMessage({
          peer: entity as Api.TypeEntityLike,
          msgId: input.message_id
        })
      );
      return { messages: normalizeMessagesFromResponse(response, input.chat_ref) };
    } catch (error) {
      throw normalizeKnownError(error);
    }
  }

  public async getSearchCounters(input: GetSearchCountersInput): Promise<{ counters: SearchCounterSummary[] }> {
    try {
      const peer = parsePeerRef(input.chat_ref);
      const entity = await this.client.getEntity(entityLookupFromPeer(peer));
      const filters = input.media_types.map((mediaType) => messageFilterFromMediaType(mediaType));
      const response = await this.client.invoke(
        new Api.messages.GetSearchCounters({
          peer: entity as Api.TypeEntityLike,
          filters
        })
      );
      return { counters: normalizeSearchCounters(response, input.media_types) };
    } catch (error) {
      throw normalizeKnownError(error);
    }
  }

  public async getChatParticipants(input: GetChatParticipantsInput): Promise<{ participants: ParticipantSummary[] }> {
    try {
      const peer = parsePeerRef(input.chat_ref);
      const entity = await this.client.getEntity(entityLookupFromPeer(peer));
      const participants = await this.client.getParticipants(entity, {
        filter: participantFilterFor(input),
        limit: input.limit,
        search: input.search
      });
      return { participants: participants.map((participant) => participantSummaryFromEntity(participant)) };
    } catch (error) {
      throw normalizeKnownError(error);
    }
  }

  private async getSummaryFromPeerRef(chatRef: string): Promise<ChatSummary> {
    const peer = parsePeerRef(chatRef);
    const entity = await this.client.getEntity(entityLookupFromPeer(peer));
    return chatSummaryFromEntity(entity);
  }

  private async listFolderChats(input: ListChatsInput & { folder_ref: string }): Promise<{ chats: ChatSummary[] }> {
    const entities = await this.getFolderPeerEntities(input.folder_ref, input.limit);
    return {
      chats: entities.map((entity) => chatSummaryFromEntity(entity)).filter((chat) => matchesType(chat, input.type))
    };
  }

  private async readRecentMessagesForEntity(
    entity: unknown,
    chatRef: string,
    input: Pick<GetRecentMessagesInput, "limit" | "from_date" | "to_date">
  ): Promise<MessageSummary[]> {
    const messages = await this.client.getMessages(entity, {
      limit: input.limit,
      offsetDate: toUnixSeconds(input.to_date),
      waitTime: 0
    });
    return sortNewerToOlder(filterMessagesByDate(normalizeMessages(messages, chatRef), input.from_date, input.to_date)).slice(0, input.limit);
  }

  private async searchMessagesForEntity(
    entity: unknown,
    chatRef: string,
    input: Pick<SearchMessagesInput, "query" | "limit" | "from_date" | "to_date">,
    filter?: Api.TypeMessagesFilter | undefined,
    page: { offsetId?: number | undefined } = {}
  ): Promise<MessageSummary[]> {
    const params: Record<string, unknown> = {
      limit: input.limit,
      search: input.query,
      offsetId: page.offsetId,
      offsetDate: input.to_date === undefined ? undefined : toUnixSeconds(input.to_date),
      waitTime: 0
    };
    if (filter !== undefined) {
      params.filter = filter;
    }
    const messages = await this.client.getMessages(entity, params);
    return sortNewerToOlder(filterMessagesByDate(normalizeMessages(messages, chatRef), input.from_date, input.to_date)).slice(0, input.limit);
  }

  private async searchFolderMessages(
    input: Pick<SearchMessagesInput, "query" | "limit" | "from_date" | "to_date" | "folder_chat_limit"> & { folder_ref: string },
    filter?: Api.TypeMessagesFilter | undefined
  ): Promise<{ messages: MessageSummary[] }> {
    const entities = await this.getFolderPeerEntities(input.folder_ref, input.folder_chat_limit ?? 5);
    try {
      const chunks: MessageSummary[][] = [];
      for (const entity of entities) {
        const chat = chatSummaryFromEntity(entity);
        chunks.push(await this.searchMessagesForEntity(entity, chat.chat_ref, input, filter));
      }

      return {
        messages: sortNewerToOlder(chunks.flat()).slice(0, input.limit)
      };
    } catch (error) {
      throw normalizeKnownError(error);
    }
  }

  private async getFolderPeerEntities(folderRef: string, limit?: number): Promise<unknown[]> {
    const folder = parseFolderRef(folderRef);
    const filter = await this.getFolderFilterById(folder.id);
    const explicitPeers = peersFromFolderFilter(filter);
    const explicitEntities = await Promise.all(explicitPeers.map((peer) => this.client.getEntity(peer)));
    const ruleEntities = await this.getFolderRuleEntities(filter, limit);
    return uniqueEntities([...explicitEntities, ...ruleEntities]).slice(0, limit);
  }

  private async getFolderFilterById(folderId: number): Promise<unknown> {
    const response = await this.client.invoke(new Api.messages.GetDialogFilters());
    const filters = rawFolderFilters(response);
    const filter = filters.find((candidate) => readNumber(asRecord(candidate).id) === folderId);
    if (filter === undefined) {
      throw new AppError("FOLDER_NOT_FOUND", `Folder not found: ${folderId}`, {
        publicMessage: "Folder not found"
      });
    }
    return filter;
  }

  private async getFolderRuleEntities(filter: unknown, limit = 50): Promise<unknown[]> {
    if (!hasFolderRules(filter)) {
      return [];
    }

    const dialogs = await this.client.getDialogs({ limit });
    const excluded = new Set(readArray(asRecord(filter).excludePeers ?? asRecord(filter).exclude_peers).map((peer) => folderPeerKey(peer)));
    return dialogs
      .filter((dialog) => matchesFolderRules(dialog, filter))
      .map((dialog) => asRecord(dialog).entity ?? dialog)
      .filter((entity) => !excluded.has(entityFolderPeerKey(entity)));
  }
}

function matchesType(chat: ChatSummary, type: ListChatsInput["type"]): boolean {
  return type === "any" || chat.type === type;
}

function looksLikePeerRef(value: string): boolean {
  try {
    parsePeerRef(value);
    return true;
  } catch {
    return false;
  }
}

function looksLikeFolderRef(value: string): boolean {
  try {
    parseFolderRef(value);
    return true;
  } catch {
    return false;
  }
}

function normalizeChatRefInput(ref: string): string {
  return ref.trim();
}
