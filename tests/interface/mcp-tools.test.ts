import { describe, expect, test, vi } from "vitest";
import { AppError } from "../../src/domain/errors.js";
import { createToolHandlers, type ToolHandlers } from "../../src/interface/mcp-tools.js";
import type { TelegramQueries } from "../../src/application/telegram-queries.js";

describe("createToolHandlers", () => {
  test("delegates every tool handler to its query port with schema-normalized input", async () => {
    for (const testCase of toolDelegationCases) {
      const queries = makeQueries();
      const expectedResult = { marker: testCase.tool };
      queries[testCase.query].mockResolvedValue(expectedResult);
      const handlers = createToolHandlers(queries as unknown as TelegramQueries);

      await expect(handlers[testCase.tool](testCase.input)).resolves.toBe(expectedResult);

      expect(queries[testCase.query]).toHaveBeenCalledOnce();
      expect(queries[testCase.query]).toHaveBeenCalledWith(testCase.expectedInput);
    }
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
    listFolderChatsPage: vi.fn(),
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
    getChatParticipants: vi.fn(),
    getProfilePhotoInfo: vi.fn(),
    downloadProfilePhoto: vi.fn()
  };
}

type MockTelegramQueries = {
  [K in keyof TelegramQueries]: ReturnType<typeof vi.fn>;
};

type ToolDelegationCase = {
  tool: keyof ToolHandlers;
  query: keyof MockTelegramQueries;
  input: unknown;
  expectedInput: unknown;
};

const toolDelegationCases: ToolDelegationCase[] = [
  {
    tool: "telegram_list_folders",
    query: "listFolders",
    input: {},
    expectedInput: {}
  },
  {
    tool: "telegram_resolve_folder",
    query: "resolveFolder",
    input: { ref: "Research Folder" },
    expectedInput: { ref: "Research Folder" }
  },
  {
    tool: "telegram_list_chats",
    query: "listChats",
    input: { limit: 5 },
    expectedInput: { limit: 5, type: "any" }
  },
  {
    tool: "telegram_list_folder_chats",
    query: "listChats",
    input: { folder_ref: "folder-ref" },
    expectedInput: { folder_ref: "folder-ref", limit: 50, type: "any" }
  },
  {
    tool: "telegram_list_folder_chats_page",
    query: "listFolderChatsPage",
    input: { folder_ref: "folder-ref", cursor: "next" },
    expectedInput: { folder_ref: "folder-ref", cursor: "next", limit: 50, type: "any" }
  },
  {
    tool: "telegram_search_chats",
    query: "searchChats",
    input: { query: "team" },
    expectedInput: { query: "team", limit: 20, type: "any" }
  },
  {
    tool: "telegram_resolve_chat",
    query: "resolveChat",
    input: { ref: "Team" },
    expectedInput: { ref: "Team" }
  },
  {
    tool: "telegram_get_chat",
    query: "getChat",
    input: { chat_ref: "chat-ref" },
    expectedInput: { chat_ref: "chat-ref" }
  },
  {
    tool: "telegram_search_messages",
    query: "searchMessages",
    input: { query: "event" },
    expectedInput: { query: "event", folder_chat_limit: 5, limit: 20 }
  },
  {
    tool: "telegram_get_recent_messages",
    query: "getRecentMessages",
    input: { chat_ref: "chat-ref", from_date: "2026-05-08", to_date: "2026-05-15" },
    expectedInput: {
      chat_ref: "chat-ref",
      from_date: "2026-05-08",
      to_date: "2026-05-15",
      folder_chat_limit: 5,
      limit: 20
    }
  },
  {
    tool: "telegram_search_messages_page",
    query: "searchMessagesPage",
    input: { query: "event" },
    expectedInput: { query: "event", folder_chat_limit: 5, limit: 20 }
  },
  {
    tool: "telegram_search_messages_batch",
    query: "searchMessagesBatch",
    input: { queries: ["event"] },
    expectedInput: { queries: ["event"], folder_chat_limit: 5, limit: 20 }
  },
  {
    tool: "telegram_search_media",
    query: "searchMedia",
    input: { media_type: "links" },
    expectedInput: { media_type: "links", query: "", folder_chat_limit: 5, limit: 20 }
  },
  {
    tool: "telegram_get_messages",
    query: "getMessages",
    input: { chat_ref: "chat-ref" },
    expectedInput: { chat_ref: "chat-ref", limit: 50 }
  },
  {
    tool: "telegram_get_message",
    query: "getMessage",
    input: { chat_ref: "chat-ref", message_id: 10 },
    expectedInput: { chat_ref: "chat-ref", message_id: 10 }
  },
  {
    tool: "telegram_get_message_context",
    query: "getMessageContext",
    input: { chat_ref: "chat-ref", message_id: 10 },
    expectedInput: { chat_ref: "chat-ref", message_id: 10, before: 10, after: 10 }
  },
  {
    tool: "telegram_get_thread",
    query: "getThread",
    input: { chat_ref: "chat-ref", message_id: 10 },
    expectedInput: { chat_ref: "chat-ref", message_id: 10, limit: 50 }
  },
  {
    tool: "telegram_get_discussion",
    query: "getDiscussion",
    input: { chat_ref: "chat-ref", message_id: 10 },
    expectedInput: { chat_ref: "chat-ref", message_id: 10 }
  },
  {
    tool: "telegram_get_search_counters",
    query: "getSearchCounters",
    input: { chat_ref: "chat-ref" },
    expectedInput: { chat_ref: "chat-ref", media_types: ["links", "photos", "videos", "documents"] }
  },
  {
    tool: "telegram_get_chat_participants",
    query: "getChatParticipants",
    input: { chat_ref: "chat-ref" },
    expectedInput: { chat_ref: "chat-ref", filter: "recent", limit: 50 }
  },
  {
    tool: "telegram_get_profile_photo_info",
    query: "getProfilePhotoInfo",
    input: { peer_ref: "peer-ref" },
    expectedInput: { peer_ref: "peer-ref" }
  },
  {
    tool: "telegram_download_profile_photo",
    query: "downloadProfilePhoto",
    input: { peer_ref: "peer-ref", output_file: "sources/photo.jpg" },
    expectedInput: { peer_ref: "peer-ref", output_file: "sources/photo.jpg", overwrite: false }
  }
];
