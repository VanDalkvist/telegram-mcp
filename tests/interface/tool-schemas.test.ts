import { describe, expect, test } from "vitest";
import { toolSchemas } from "../../src/interface/tool-schemas.js";

describe("toolSchemas", () => {
  test("applies defaults and clamps list chats limit", () => {
    expect(toolSchemas.telegram_list_chats.parse({})).toEqual({
      limit: 50,
      type: "any"
    });

    expect(() => toolSchemas.telegram_list_chats.parse({ limit: 101 })).toThrow();
  });

  test("accepts folder references for chat and message queries", () => {
    expect(toolSchemas.telegram_resolve_folder.parse({ ref: "Research Folder" })).toEqual({
      ref: "Research Folder"
    });

    expect(toolSchemas.telegram_list_chats.parse({ folder_ref: "folder-ref" })).toEqual({
      limit: 50,
      type: "any",
      folder_ref: "folder-ref"
    });

    expect(toolSchemas.telegram_search_messages.parse({ query: "needle", folder_ref: "folder-ref" })).toEqual({
      query: "needle",
      folder_ref: "folder-ref",
      folder_chat_limit: 5,
      limit: 20
    });
  });

  test("requires message search query and defaults read limits", () => {
    expect(toolSchemas.telegram_search_messages.parse({ query: "needle" })).toEqual({
      query: "needle",
      folder_chat_limit: 5,
      limit: 20
    });

    expect(toolSchemas.telegram_get_message_context.parse({ chat_ref: "ref", message_id: 10 })).toEqual({
      chat_ref: "ref",
      message_id: 10,
      before: 10,
      after: 10
    });
  });

  test("accepts P0 message search helpers with bounded folder fan-out", () => {
    expect(
      toolSchemas.telegram_get_recent_messages.parse({
        folder_ref: "folder-ref",
        from_date: "2026-05-08",
        to_date: "2026-05-15"
      })
    ).toEqual({
      folder_ref: "folder-ref",
      from_date: "2026-05-08",
      to_date: "2026-05-15",
      folder_chat_limit: 5,
      limit: 20
    });

    expect(
      toolSchemas.telegram_search_messages_page.parse({
        query: "needle",
        chat_ref: "chat-ref",
        cursor: "next"
      })
    ).toEqual({
      query: "needle",
      chat_ref: "chat-ref",
      cursor: "next",
      folder_chat_limit: 5,
      limit: 20
    });

    expect(
      toolSchemas.telegram_search_messages_batch.parse({
        queries: ["event", "webinar"],
        folder_ref: "folder-ref"
      })
    ).toEqual({
      queries: ["event", "webinar"],
      folder_ref: "folder-ref",
      folder_chat_limit: 5,
      limit: 20
    });

    expect(() =>
      toolSchemas.telegram_get_recent_messages.parse({
        chat_ref: "chat-ref",
        folder_ref: "folder-ref",
        from_date: "2026-05-08",
        to_date: "2026-05-15"
      })
    ).toThrow();
    expect(() => toolSchemas.telegram_search_messages_batch.parse({ queries: [] })).toThrow();
  });

  test("accepts P1 read-only helpers", () => {
    expect(toolSchemas.telegram_search_media.parse({ media_type: "links", folder_ref: "folder-ref" })).toEqual({
      media_type: "links",
      query: "",
      folder_ref: "folder-ref",
      folder_chat_limit: 5,
      limit: 20
    });

    expect(toolSchemas.telegram_get_thread.parse({ chat_ref: "chat-ref", message_id: 7 })).toEqual({
      chat_ref: "chat-ref",
      message_id: 7,
      limit: 50
    });

    expect(toolSchemas.telegram_get_search_counters.parse({ chat_ref: "chat-ref" })).toEqual({
      chat_ref: "chat-ref",
      media_types: ["links", "photos", "videos", "documents"]
    });

    expect(toolSchemas.telegram_get_chat_participants.parse({ chat_ref: "chat-ref", search: "Alice" })).toEqual({
      chat_ref: "chat-ref",
      search: "Alice",
      filter: "recent",
      limit: 50
    });
  });

  test("rejects invalid date ranges and non-positive ids", () => {
    expect(() => toolSchemas.telegram_search_messages.parse({ query: "x", from_date: "not-date" })).toThrow();
    expect(() => toolSchemas.telegram_search_messages.parse({ query: "x", from_date: "2026-02-30" })).toThrow();
    expect(() => toolSchemas.telegram_search_messages.parse({ query: "x", from_date: "2026-05-08T25:00:00Z" })).toThrow();
    expect(() => toolSchemas.telegram_search_messages.parse({ query: "x", from_date: "2026-05-08T10:00:00Z" })).toThrow();
    expect(() => toolSchemas.telegram_search_messages.parse({ query: "x", from_date: "2026-05-08T10:00:00+03:00" })).toThrow();
    const reversedRange = {
      from_date: "2026-05-15",
      to_date: "2026-05-08"
    };
    expect(() => toolSchemas.telegram_search_messages.parse({ query: "x", ...reversedRange })).toThrow();
    expect(() => toolSchemas.telegram_get_recent_messages.parse({ chat_ref: "ref", ...reversedRange })).toThrow();
    expect(() => toolSchemas.telegram_search_messages_page.parse({ query: "x", ...reversedRange })).toThrow();
    expect(() => toolSchemas.telegram_search_messages_batch.parse({ queries: ["x"], ...reversedRange })).toThrow();
    expect(() => toolSchemas.telegram_search_media.parse({ media_type: "links", ...reversedRange })).toThrow();
    expect(() => toolSchemas.telegram_get_message.parse({ chat_ref: "ref", message_id: 0 })).toThrow();
  });
});
