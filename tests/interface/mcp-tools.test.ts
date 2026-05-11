import { describe, expect, test, vi } from "vitest";
import { AppError } from "../../src/domain/errors.js";
import { createToolHandlers } from "../../src/interface/mcp-tools.js";
import type { TelegramQueries } from "../../src/application/telegram-queries.js";

describe("createToolHandlers", () => {
  test("validates input and delegates list chats to the query port", async () => {
    const queries = makeQueries();
    queries.listChats.mockResolvedValue({ chats: [] });
    const handlers = createToolHandlers(queries as unknown as TelegramQueries);

    await expect(handlers.telegram_list_chats({ limit: 5 })).resolves.toEqual({ chats: [] });

    expect(queries.listChats).toHaveBeenCalledWith({ limit: 5, type: "any" });
  });

  test("delegates folder tools through the query port", async () => {
    const queries = makeQueries();
    queries.listFolders.mockResolvedValue({ folders: [] });
    queries.resolveFolder.mockResolvedValue({ folder: { folder_ref: "ref", id: 7, title: "Research Folder", kind: "dialog_filter" } });
    const handlers = createToolHandlers(queries as unknown as TelegramQueries);

    await expect(handlers.telegram_list_folders({})).resolves.toEqual({ folders: [] });
    await expect(handlers.telegram_resolve_folder({ ref: "Research Folder" })).resolves.toMatchObject({
      folder: { title: "Research Folder" }
    });

    expect(queries.listFolders).toHaveBeenCalledWith({});
    expect(queries.resolveFolder).toHaveBeenCalledWith({ ref: "Research Folder" });
  });

  test("delegates P0/P1 tools through the query port", async () => {
    const queries = makeQueries();
    queries.listChats.mockResolvedValue({ chats: [] });
    queries.getRecentMessages.mockResolvedValue({ messages: [], page: { order: "newer_to_older" } });
    queries.searchMessagesPage.mockResolvedValue({ messages: [], page: { order: "newer_to_older" } });
    queries.searchMessagesBatch.mockResolvedValue({ results: [], messages: [] });
    queries.searchMedia.mockResolvedValue({ messages: [] });
    queries.getThread.mockResolvedValue({ messages: [], page: { order: "older_to_newer" } });
    queries.getDiscussion.mockResolvedValue({ messages: [] });
    queries.getSearchCounters.mockResolvedValue({ counters: [] });
    queries.getChatParticipants.mockResolvedValue({ participants: [] });
    const handlers = createToolHandlers(queries as unknown as TelegramQueries);

    await expect(handlers.telegram_list_folder_chats({ folder_ref: "folder-ref" })).resolves.toEqual({ chats: [] });
    await expect(
      handlers.telegram_get_recent_messages({
        chat_ref: "chat-ref",
        from_date: "2026-05-08",
        to_date: "2026-05-15"
      })
    ).resolves.toMatchObject({ messages: [] });
    await expect(handlers.telegram_search_messages_page({ query: "event" })).resolves.toMatchObject({ messages: [] });
    await expect(handlers.telegram_search_messages_batch({ queries: ["event"] })).resolves.toMatchObject({ messages: [] });
    await expect(handlers.telegram_search_media({ media_type: "links" })).resolves.toMatchObject({ messages: [] });
    await expect(handlers.telegram_get_thread({ chat_ref: "chat-ref", message_id: 10 })).resolves.toMatchObject({ messages: [] });
    await expect(handlers.telegram_get_discussion({ chat_ref: "chat-ref", message_id: 10 })).resolves.toMatchObject({ messages: [] });
    await expect(handlers.telegram_get_search_counters({ chat_ref: "chat-ref" })).resolves.toMatchObject({ counters: [] });
    await expect(handlers.telegram_get_chat_participants({ chat_ref: "chat-ref" })).resolves.toMatchObject({ participants: [] });

    expect(queries.listChats).toHaveBeenCalledWith({ folder_ref: "folder-ref", limit: 50, type: "any" });
    expect(queries.getRecentMessages).toHaveBeenCalledWith({
      chat_ref: "chat-ref",
      from_date: "2026-05-08",
      to_date: "2026-05-15",
      folder_chat_limit: 5,
      limit: 20
    });
    expect(queries.searchMessagesPage).toHaveBeenCalledWith({
      query: "event",
      folder_chat_limit: 5,
      limit: 20
    });
    expect(queries.getChatParticipants).toHaveBeenCalledWith({
      chat_ref: "chat-ref",
      filter: "recent",
      limit: 50
    });
  });

  test("wraps invalid input as CONFIG_INVALID public contract error", async () => {
    const handlers = createToolHandlers(makeQueries() as unknown as TelegramQueries);

    await expect(handlers.telegram_get_message({ chat_ref: "ref", message_id: 0 })).rejects.toMatchObject({
      code: "CONFIG_INVALID"
    });
  });

  test("does not swallow typed application errors", async () => {
    const queries = makeQueries();
    queries.resolveChat.mockRejectedValue(new AppError("CHAT_AMBIGUOUS", "Multiple chats match"));
    const handlers = createToolHandlers(queries as unknown as TelegramQueries);

    await expect(handlers.telegram_resolve_chat({ ref: "Team" })).rejects.toMatchObject({
      code: "CHAT_AMBIGUOUS"
    });
  });
});

function makeQueries(): MockTelegramQueries {
  return {
    listFolders: vi.fn(),
    resolveFolder: vi.fn(),
    listChats: vi.fn(),
    searchChats: vi.fn(),
    resolveChat: vi.fn(),
    getChat: vi.fn(),
    searchMessages: vi.fn(),
    getMessages: vi.fn(),
    getMessage: vi.fn(),
    getMessageContext: vi.fn(),
    getRecentMessages: vi.fn(),
    searchMessagesPage: vi.fn(),
    searchMessagesBatch: vi.fn(),
    searchMedia: vi.fn(),
    getThread: vi.fn(),
    getDiscussion: vi.fn(),
    getSearchCounters: vi.fn(),
    getChatParticipants: vi.fn()
  };
}

type MockTelegramQueries = {
  [K in keyof TelegramQueries]: ReturnType<typeof vi.fn>;
};
