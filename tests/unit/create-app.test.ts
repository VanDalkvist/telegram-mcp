import { describe, expect, test, vi } from "vitest";
import { buildTelegramRuntime } from "../../src/composition/create-app.js";
import { AppError } from "../../src/domain/errors.js";
import type { AppConfig } from "../../src/config/config.js";
import type { AppLogger } from "../../src/application/logger.js";
import type { SessionStore } from "../../src/infra/file-session-store.js";
import type { GramJsLikeClient } from "../../src/infra/telegram-client-adapter.js";
import { createMcpServer, sanitizePublicErrorForLog, summarizeToolArgsForLog } from "../../src/interface/mcp-server.js";

describe("buildTelegramRuntime", () => {
  test("fails AUTH_REQUIRED before constructing Telegram client when session is missing", async () => {
    const store: SessionStore = {
      load: vi.fn().mockRejectedValue(Object.assign(new Error("missing"), { code: "AUTH_REQUIRED" })),
      save: vi.fn()
    };
    const createClient = vi.fn();

    await expect(buildTelegramRuntime(makeConfig(), { sessionStore: store, createClient })).rejects.toMatchObject({
      code: "AUTH_REQUIRED"
    });
    expect(createClient).not.toHaveBeenCalled();
  });

  test("loads session, checks authorization, and returns query adapter", async () => {
    const client = makeClient({ authorized: true });
    const store: SessionStore = {
      load: vi.fn().mockResolvedValue("session"),
      save: vi.fn()
    };

    const runtime = await buildTelegramRuntime(makeConfig(), {
      sessionStore: store,
      createClient: vi.fn().mockReturnValue(client)
    });

    await expect(runtime.queries.listChats({ limit: 1, type: "any" })).resolves.toEqual({ chats: [] });
    expect(client.connect).toHaveBeenCalled();
    expect(client.checkAuthorization).toHaveBeenCalled();
  });

  test("rejects unauthorized sessions as AUTH_REQUIRED", async () => {
    const client = makeClient({ authorized: false });

    await expect(
      buildTelegramRuntime(makeConfig(), {
        sessionStore: { load: vi.fn().mockResolvedValue("session"), save: vi.fn() },
        createClient: vi.fn().mockReturnValue(client)
      })
    ).rejects.toMatchObject({ code: "AUTH_REQUIRED" });
  });

  test("disconnects initialized client when authorization check fails", async () => {
    const client = makeClient({ authorized: false });
    const disconnect = vi.fn().mockResolvedValue(undefined);
    Object.assign(client, { disconnect });

    await expect(
      buildTelegramRuntime(makeConfig(), {
        sessionStore: { load: vi.fn().mockResolvedValue("session"), save: vi.fn() },
        createClient: vi.fn().mockReturnValue(client)
      })
    ).rejects.toMatchObject({ code: "AUTH_REQUIRED" });

    expect(disconnect).toHaveBeenCalledOnce();
  });
});

describe("createMcpServer", () => {
  test("registers all read-only Telegram tools", () => {
    const server = createMcpServer({
      listFolders: vi.fn(),
      resolveFolder: vi.fn(),
      listChats: vi.fn(),
      searchChats: vi.fn(),
      resolveChat: vi.fn(),
      getChat: vi.fn(),
      searchMessages: vi.fn(),
      getRecentMessages: vi.fn(),
      searchMessagesPage: vi.fn(),
      searchMessagesBatch: vi.fn(),
      searchMedia: vi.fn(),
      getMessages: vi.fn(),
      getMessage: vi.fn(),
      getMessageContext: vi.fn(),
      getThread: vi.fn(),
      getDiscussion: vi.fn(),
      getSearchCounters: vi.fn(),
      getChatParticipants: vi.fn()
    });

    expect(server).toBeDefined();
  });
});

describe("summarizeToolArgsForLog", () => {
  test("redacts search text and chat references while keeping operational filters", () => {
    expect(
      summarizeToolArgsForLog("telegram_search_messages", {
        query: "private coaching query",
        chat_ref: "secret-chat-ref",
        limit: 10,
        from_date: "2026-05-08",
        to_date: "2026-05-15"
      })
    ).toEqual({
      limit: 10,
      from_date: "2026-05-08",
      to_date: "2026-05-15",
      query_length: 22,
      chat_ref_sha256: expect.any(String),
      scope: "chat"
    });
  });

  test("redacts folder references in logs", () => {
    expect(
      summarizeToolArgsForLog("telegram_search_messages", {
        query: "event",
        folder_ref: "folder-secret",
        limit: 10
      })
    ).toEqual({
      limit: 10,
      query_length: 5,
      folder_ref_sha256: expect.any(String),
      scope: "folder"
    });
  });

  test("redacts batch search and cursor details in logs", () => {
    expect(
      summarizeToolArgsForLog("telegram_search_messages_batch", {
        queries: ["event", "webinar"],
        folder_ref: "folder-secret",
        folder_chat_limit: 3
      })
    ).toEqual({
      folder_chat_limit: 3,
      queries_count: 2,
      queries_total_length: 12,
      folder_ref_sha256: expect.any(String),
      scope: "folder"
    });

    expect(
      summarizeToolArgsForLog("telegram_search_messages_page", {
        query: "event",
        cursor: "secret-cursor"
      })
    ).toEqual({
      query_length: 5,
      cursor_sha256: expect.any(String),
      scope: "global"
    });
  });
});

describe("sanitizePublicErrorForLog", () => {
  test("redacts public error details while keeping aggregate diagnostics", () => {
    expect(
      sanitizePublicErrorForLog({
        code: "CHAT_AMBIGUOUS",
        message: "Chat reference is ambiguous",
        details: {
          candidates: [
            { chat_ref: "secret-ref", title: "Private Team", username: "private_team", type: "group" }
          ]
        }
      })
    ).toEqual({
      code: "CHAT_AMBIGUOUS",
      message: "Chat reference is ambiguous",
      details: {
        candidates_count: 1
      }
    });
  });

  test("logs sanitized error details while returning actionable MCP errors", async () => {
    const warn = vi.fn().mockResolvedValue(undefined);
    const server = createMcpServer(
      {
        listFolders: vi.fn(),
        resolveFolder: vi.fn(),
        listChats: vi.fn(),
        searchChats: vi.fn(),
        resolveChat: vi.fn().mockRejectedValue(
          new AppError("CHAT_AMBIGUOUS", "Multiple chats match", {
            publicMessage: "Chat reference is ambiguous",
            details: {
              candidates: [
                { chat_ref: "secret-ref", title: "Private Team", username: "private_team", type: "group" }
              ]
            }
          })
        ),
        getChat: vi.fn(),
        searchMessages: vi.fn(),
        getRecentMessages: vi.fn(),
        searchMessagesPage: vi.fn(),
        searchMessagesBatch: vi.fn(),
        searchMedia: vi.fn(),
        getMessages: vi.fn(),
        getMessage: vi.fn(),
        getMessageContext: vi.fn(),
        getThread: vi.fn(),
        getDiscussion: vi.fn(),
        getSearchCounters: vi.fn(),
        getChatParticipants: vi.fn()
      },
      { logger: makeLogger({ warn }) }
    );

    const result = await callRegisteredTool(server, "telegram_resolve_chat", { ref: "Private Team" });

    expect(warn).toHaveBeenCalledWith(
      "tool_call_failed",
      expect.objectContaining({
        error_code: "CHAT_AMBIGUOUS",
        error_details: { candidates_count: 1 }
      })
    );
    expect(warn.mock.calls[0]![1]).not.toMatchObject({
      error_details: {
        candidates: expect.any(Array)
      }
    });
    expect(result.structuredContent).toMatchObject({
      error: {
        details: {
          candidates: [{ chat_ref: "secret-ref", title: "Private Team", username: "private_team" }]
        }
      }
    });
  });
});

function makeConfig(): AppConfig {
  return {
    telegramApiId: 123,
    telegramApiHash: "hash",
    sessionPath: "/tmp/session",
    logPath: "/tmp/telegram-mcp/server.jsonl"
  };
}

function makeClient(options: { authorized: boolean }): GramJsLikeClient & {
  connect: ReturnType<typeof vi.fn>;
  checkAuthorization: ReturnType<typeof vi.fn>;
} {
  return {
    connect: vi.fn().mockResolvedValue(undefined),
    checkAuthorization: vi.fn().mockResolvedValue(options.authorized),
    getDialogs: vi.fn().mockResolvedValue([]),
    getEntity: vi.fn(),
    getMessages: vi.fn(),
    getParticipants: vi.fn(),
    invoke: vi.fn()
  };
}

function makeLogger(overrides: Partial<AppLogger> = {}): AppLogger {
  return {
    info: vi.fn().mockResolvedValue(undefined),
    debug: vi.fn().mockResolvedValue(undefined),
    warn: vi.fn().mockResolvedValue(undefined),
    error: vi.fn().mockResolvedValue(undefined),
    ...overrides
  };
}

async function callRegisteredTool(server: unknown, name: string, args: unknown): Promise<{ structuredContent?: unknown }> {
  const registeredTools = (server as { _registeredTools: Record<string, { handler: (args: unknown) => Promise<unknown> }> })._registeredTools;
  return (await registeredTools[name]!.handler(args)) as { structuredContent?: unknown };
}
