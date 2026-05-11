import { describe, expect, test, vi } from "vitest";
import { Api } from "telegram";
import bigInt from "big-integer";
import { AppError } from "../../src/domain/errors.js";
import { parseFolderRef } from "../../src/domain/folder-ref.js";
import { parsePeerRef } from "../../src/domain/peer-ref.js";
import { TelegramClientAdapter, type GramJsLikeClient } from "../../src/infra/telegram-client-adapter.js";

describe("TelegramClientAdapter", () => {
  test("lists dialogs as normalized chat summaries", async () => {
    const client = makeClient({
      dialogs: [
        {
          title: "Engineering",
          isChannel: true,
          isGroup: false,
          isUser: false,
          entity: { id: "100", accessHash: "200", username: "eng", title: "Engineering" }
        }
      ]
    });
    const adapter = new TelegramClientAdapter(client as unknown as GramJsLikeClient);

    const result = await adapter.listChats({ limit: 10, type: "any" });

    expect(result.chats[0]).toMatchObject({
      id: "100",
      title: "Engineering",
      username: "eng",
      type: "channel",
      is_public: true
    });
    expect(parsePeerRef(result.chats[0]!.chat_ref)).toMatchObject({ id: "100", type: "channel" });
    expect(client.getDialogs).toHaveBeenCalledWith({ limit: 10 });
  });

  test("lists Telegram dialog filters as folder summaries", async () => {
    const client = makeClient({
      dialogFilters: [
        new Api.DialogFilterDefault(),
        new Api.DialogFilter({
          id: 7,
          title: new Api.TextWithEntities({ text: "Research Folder", entities: [] }),
          pinnedPeers: [],
          includePeers: [],
          excludePeers: []
        })
      ]
    });
    const adapter = new TelegramClientAdapter(client as unknown as GramJsLikeClient);

    const result = await adapter.listFolders({});

    expect(result.folders).toHaveLength(1);
    expect(result.folders[0]).toMatchObject({
      id: 7,
      title: "Research Folder",
      kind: "dialog_filter",
      include_peers_count: 0,
      pinned_peers_count: 0,
      exclude_peers_count: 0
    });
    expect(parseFolderRef(result.folders[0]!.folder_ref)).toMatchObject({ id: 7, title: "Research Folder" });
    expect(client.invoke.mock.calls[0]![0]).toBeInstanceOf(Api.messages.GetDialogFilters);
  });

  test("resolves folder title explicitly and fails ambiguous matches", async () => {
    const client = makeClient({
      dialogFilters: [
        new Api.DialogFilter({
          id: 7,
          title: new Api.TextWithEntities({ text: "Research Folder", entities: [] }),
          pinnedPeers: [],
          includePeers: [],
          excludePeers: []
        }),
        new Api.DialogFilter({
          id: 8,
          title: new Api.TextWithEntities({ text: "Research Folder", entities: [] }),
          pinnedPeers: [],
          includePeers: [],
          excludePeers: []
        })
      ]
    });
    const adapter = new TelegramClientAdapter(client as unknown as GramJsLikeClient);

    await expect(adapter.resolveFolder({ ref: "Research Folder" })).rejects.toMatchObject({
      code: "FOLDER_AMBIGUOUS"
    });

    client.invoke.mockResolvedValueOnce({
      filters: [
        new Api.DialogFilter({
          id: 7,
          title: new Api.TextWithEntities({ text: "Research Folder", entities: [] }),
          pinnedPeers: [],
          includePeers: [],
          excludePeers: []
        })
      ]
    });
    await expect(adapter.resolveFolder({ ref: "Research Folder" })).resolves.toMatchObject({
      folder: { id: 7, title: "Research Folder" }
    });
  });

  test("searches chats locally over dialog titles and usernames with type filtering", async () => {
    const client = makeClient({
      dialogs: [
        {
          title: "Team Alpha",
          isChannel: false,
          isGroup: true,
          isUser: false,
          entity: { id: "1", title: "Team Alpha" }
        },
        {
          title: "Alice",
          isChannel: false,
          isGroup: false,
          isUser: true,
          entity: { id: "2", username: "alice", firstName: "Alice" }
        }
      ]
    });
    const adapter = new TelegramClientAdapter(client as unknown as GramJsLikeClient);

    await expect(adapter.searchChats({ query: "team", limit: 10, type: "group" })).resolves.toMatchObject({
      chats: [{ title: "Team Alpha", type: "group" }]
    });
  });

  test("lists and searches chats inside a resolved Telegram folder", async () => {
    const folderRef = folderRefFor({ id: 7, title: "Research Folder" });
    const folderPeer = new Api.InputPeerChannel({ channelId: bigInt("100"), accessHash: bigInt("200") });
    const client = makeClient({
      dialogFilters: [
        new Api.DialogFilter({
          id: 7,
          title: new Api.TextWithEntities({ text: "Research Folder", entities: [] }),
          pinnedPeers: [],
          includePeers: [folderPeer],
          excludePeers: []
        })
      ],
      entity: { id: "100", accessHash: "200", title: "Env Announcements" }
    });
    const adapter = new TelegramClientAdapter(client as unknown as GramJsLikeClient);

    await expect(adapter.listChats({ limit: 10, type: "any", folder_ref: folderRef })).resolves.toMatchObject({
      chats: [{ title: "Env Announcements" }]
    });
    expect(client.getDialogs).not.toHaveBeenCalled();
    expect(client.getEntity).toHaveBeenCalledWith(folderPeer);

    await expect(adapter.searchChats({ query: "ann", limit: 5, type: "channel", folder_ref: folderRef })).resolves.toMatchObject({
      chats: [{ title: "Env Announcements", type: "channel" }]
    });
  });

  test("expands rule-based Telegram folders from bounded recent dialogs", async () => {
    const folderRef = folderRefFor({ id: 7, title: "Research Folder" });
    const client = makeClient({
      dialogFilters: [
        {
          id: 7,
          title: "Research Folder",
          pinnedPeers: [],
          includePeers: [],
          excludePeers: [],
          groups: true
        }
      ],
      dialogs: [
        { title: "Env Group", isChannel: false, isGroup: true, isUser: false, entity: { id: "1", title: "Env Group", megagroup: true } },
        { title: "Env Channel", isChannel: true, isGroup: false, isUser: false, entity: { id: "2", title: "Env Channel" } }
      ]
    });
    const adapter = new TelegramClientAdapter(client as unknown as GramJsLikeClient);

    await expect(adapter.listChats({ limit: 5, type: "any", folder_ref: folderRef })).resolves.toMatchObject({
      chats: [{ title: "Env Group", type: "group" }]
    });
    expect(client.getDialogs).toHaveBeenCalledWith({ limit: 5 });
  });

  test("honors excluded peers when rule-based folder expansion sees megagroups as channels", async () => {
    const folderRef = folderRefFor({ id: 7, title: "Research Folder" });
    const excludedPeer = new Api.InputPeerChannel({ channelId: bigInt("1"), accessHash: bigInt("200") });
    const client = makeClient({
      dialogFilters: [
        {
          id: 7,
          title: "Research Folder",
          pinnedPeers: [],
          includePeers: [],
          excludePeers: [excludedPeer],
          groups: true
        }
      ],
      dialogs: [
        { title: "Excluded Group", isChannel: false, isGroup: true, isUser: false, entity: { id: "1", title: "Excluded Group", megagroup: true } },
        { title: "Included Group", isChannel: false, isGroup: true, isUser: false, entity: { id: "2", title: "Included Group", megagroup: true } }
      ]
    });
    const adapter = new TelegramClientAdapter(client as unknown as GramJsLikeClient);

    await expect(adapter.listChats({ limit: 5, type: "any", folder_ref: folderRef })).resolves.toMatchObject({
      chats: [{ title: "Included Group", type: "group" }]
    });
  });

  test("honors excluded peers for explicit folder includes and pins", async () => {
    const folderRef = folderRefFor({ id: 7, title: "Research Folder" });
    const includedPeer = new Api.InputPeerChannel({ channelId: bigInt("1"), accessHash: bigInt("100") });
    const pinnedPeer = new Api.InputPeerChannel({ channelId: bigInt("2"), accessHash: bigInt("200") });
    const visiblePeer = new Api.InputPeerChannel({ channelId: bigInt("3"), accessHash: bigInt("300") });
    const client = makeClient({
      dialogFilters: [
        {
          id: 7,
          title: "Research Folder",
          pinnedPeers: [pinnedPeer],
          includePeers: [includedPeer, visiblePeer],
          excludePeers: [includedPeer, pinnedPeer]
        }
      ]
    });
    client.getEntity.mockImplementation((peer: unknown) => {
      const channelId = (peer as { channelId?: { toString(): string } }).channelId?.toString();
      if (channelId === "1") {
        return Promise.resolve({ id: "1", accessHash: "100", title: "Excluded Include" });
      }
      if (channelId === "2") {
        return Promise.resolve({ id: "2", accessHash: "200", title: "Excluded Pin" });
      }
      return Promise.resolve({ id: "3", accessHash: "300", title: "Visible Include" });
    });
    const adapter = new TelegramClientAdapter(client as unknown as GramJsLikeClient);

    await expect(adapter.listChats({ limit: 10, type: "any", folder_ref: folderRef })).resolves.toMatchObject({
      chats: [{ title: "Visible Include" }]
    });
  });

  test("honors rule-based folder exclusion flags when dialog metadata exposes them", async () => {
    const folderRef = folderRefFor({ id: 7, title: "Research Folder" });
    const client = makeClient({
      dialogFilters: [
        {
          id: 7,
          title: "Research Folder",
          pinnedPeers: [],
          includePeers: [],
          excludePeers: [],
          groups: true,
          excludeMuted: true,
          excludeRead: true,
          excludeArchived: true
        }
      ],
      dialogs: [
        { title: "Muted Group", isGroup: true, entity: { id: "1", title: "Muted Group", megagroup: true }, isMuted: true, unreadCount: 3 },
        { title: "Read Group", isGroup: true, entity: { id: "2", title: "Read Group", megagroup: true }, unreadCount: 0 },
        { title: "Archived Group", isGroup: true, entity: { id: "3", title: "Archived Group", megagroup: true }, folderId: 1, unreadCount: 4 },
        { title: "Visible Group", isGroup: true, entity: { id: "4", title: "Visible Group", megagroup: true }, unreadCount: 2 }
      ]
    });
    const adapter = new TelegramClientAdapter(client as unknown as GramJsLikeClient);

    await expect(adapter.listChats({ limit: 10, type: "any", folder_ref: folderRef })).resolves.toMatchObject({
      chats: [{ title: "Visible Group" }]
    });
  });

  test("fails ambiguous title resolution instead of choosing first match", async () => {
    const client = makeClient({
      dialogs: [
        { title: "Team", isChannel: false, isGroup: true, isUser: false, entity: { id: "1", title: "Team" } },
        { title: "Team", isChannel: true, isGroup: false, isUser: false, entity: { id: "2", title: "Team" } }
      ]
    });
    const adapter = new TelegramClientAdapter(client as unknown as GramJsLikeClient);

    await expect(adapter.resolveChat({ ref: "Team" })).rejects.toMatchObject({ code: "CHAT_AMBIGUOUS" });
  });

  test("reads history older to newer and exposes pagination hints", async () => {
    const chatRef = chatRefFor({ id: "1", type: "group", title: "Team" });
    const client = makeClient({
      entity: { id: "1", title: "Team" },
      messages: [
        { id: 11, date: new Date("2026-05-02T10:00:00Z"), message: "newer" },
        { id: 10, date: new Date("2026-05-01T10:00:00Z"), message: "older" }
      ]
    });
    const adapter = new TelegramClientAdapter(client as unknown as GramJsLikeClient);

    const result = await adapter.getMessages({ chat_ref: chatRef, limit: 2 });

    expect(result.messages.map((message) => message.message_id)).toEqual([10, 11]);
    expect(result.page).toEqual({
      before_message_id: 10,
      after_message_id: 11,
      order: "older_to_newer"
    });
  });

  test("fails unsupported Telegram messages without valid dates", async () => {
    const chatRef = chatRefFor({ id: "1", type: "group", title: "Team" });
    const client = makeClient({
      entity: { id: "1", title: "Team" },
      messages: [{ id: 42, message: "missing date" }]
    });
    const adapter = new TelegramClientAdapter(client as unknown as GramJsLikeClient);

    await expect(adapter.getMessages({ chat_ref: chatRef, limit: 1 })).rejects.toMatchObject({
      code: "TELEGRAM_ERROR"
    });
  });

  test("fails unsupported Telegram messages with invalid Date objects or timestamps", async () => {
    const chatRef = chatRefFor({ id: "1", type: "group", title: "Team" });
    const client = makeClient({
      entity: { id: "1", title: "Team" },
      messages: [{ id: 42, date: new Date("bad"), message: "invalid date object" }]
    });
    const adapter = new TelegramClientAdapter(client as unknown as GramJsLikeClient);

    await expect(adapter.getMessages({ chat_ref: chatRef, limit: 1 })).rejects.toMatchObject({
      code: "TELEGRAM_ERROR"
    });

    client.getMessages.mockResolvedValueOnce([{ id: 43, date: Number.NaN, message: "invalid timestamp" }]);
    await expect(adapter.getMessages({ chat_ref: chatRef, limit: 1 })).rejects.toMatchObject({
      code: "TELEGRAM_ERROR"
    });

    client.getMessages.mockResolvedValueOnce([{ id: 44, date: "2026-02-30", message: "invalid string date" }]);
    await expect(adapter.getMessages({ chat_ref: chatRef, limit: 1 })).rejects.toMatchObject({
      code: "TELEGRAM_ERROR"
    });
  });

  test("filters chat-scoped message search by the full requested date window", async () => {
    const chatRef = chatRefFor({ id: "1", type: "group", title: "Team" });
    const entity = { id: "1", title: "Team" };
    const client = makeClient({
      entity,
      messages: [
        { id: 41, date: new Date("2026-05-07T10:00:00Z"), message: "too old" },
        { id: 42, date: new Date("2026-05-08T10:00:00Z"), message: "inside" },
        { id: 43, date: new Date("2026-05-15T23:59:59Z"), message: "inside final day" }
      ]
    });
    const adapter = new TelegramClientAdapter(client as unknown as GramJsLikeClient);

    const result = await adapter.searchMessages({
      query: "event",
      chat_ref: chatRef,
      limit: 10,
      from_date: "2026-05-08",
      to_date: "2026-05-15"
    });

    expect(result.messages.map((message) => message.message_id)).toEqual([43, 42]);
    expect(client.getMessages).toHaveBeenCalledWith(entity, {
      limit: 10,
      search: "event",
      offsetId: undefined,
      offsetDate: toUnixSeconds("2026-05-15", "end"),
      waitTime: 0
    });
  });

  test("uses access hash from peer_ref for private channel lookup", async () => {
    const chatRef = JSON.stringify({
      version: 1,
      id: "100",
      accessHash: "200",
      type: "channel",
      title: "Private Channel"
    });
    const client = makeClient({
      entity: { id: "100", accessHash: "200", title: "Private Channel" }
    });
    const adapter = new TelegramClientAdapter(client as unknown as GramJsLikeClient);

    await adapter.getChat({ chat_ref: chatRef });

    const lookup = client.getEntity.mock.calls[0]![0] as { channelId: { toString(): string }; accessHash: { toString(): string } };
    expect(lookup.channelId.toString()).toBe("100");
    expect(lookup.accessHash.toString()).toBe("200");
  });

  test("uses channel peer lookup for megagroup refs with access hash", async () => {
    const chatRef = JSON.stringify({
      version: 1,
      id: "100",
      accessHash: "200",
      type: "group",
      title: "Megagroup"
    });
    const client = makeClient({
      entity: { id: "100", accessHash: "200", title: "Megagroup", megagroup: true }
    });
    const adapter = new TelegramClientAdapter(client as unknown as GramJsLikeClient);

    await adapter.getChat({ chat_ref: chatRef });

    const lookup = client.getEntity.mock.calls[0]![0] as { channelId: { toString(): string }; accessHash: { toString(): string } };
    expect(lookup).toBeInstanceOf(Api.InputPeerChannel);
    expect(lookup.channelId.toString()).toBe("100");
    expect(lookup.accessHash.toString()).toBe("200");
  });

  test("gets one message and fails missing messages explicitly", async () => {
    const chatRef = chatRefFor({ id: "1", type: "group", title: "Team" });
    const client = makeClient({
      entity: { id: "1", title: "Team" },
      messages: [{ id: 42, date: new Date("2026-05-01T10:00:00Z"), message: "target" }]
    });
    const adapter = new TelegramClientAdapter(client as unknown as GramJsLikeClient);

    await expect(adapter.getMessage({ chat_ref: chatRef, message_id: 42 })).resolves.toMatchObject({
      message: { message_id: 42, text: "target" }
    });
    await expect(adapter.getMessage({ chat_ref: chatRef, message_id: 42 })).resolves.not.toHaveProperty("message.raw");

    client.getMessages.mockResolvedValueOnce([]);
    await expect(adapter.getMessage({ chat_ref: chatRef, message_id: 404 })).rejects.toBeInstanceOf(AppError);
  });

  test("searches messages inside explicit chats from a Telegram folder", async () => {
    const folderRef = folderRefFor({ id: 7, title: "Research Folder" });
    const folderPeer = new Api.InputPeerChannel({ channelId: bigInt("100"), accessHash: bigInt("200") });
    const entity = { id: "100", accessHash: "200", title: "Env Announcements" };
    const client = makeClient({
      dialogFilters: [
        new Api.DialogFilter({
          id: 7,
          title: new Api.TextWithEntities({ text: "Research Folder", entities: [] }),
          pinnedPeers: [],
          includePeers: [folderPeer],
          excludePeers: []
        })
      ],
      entity,
      messages: [{ id: 42, date: new Date("2026-05-08T10:00:00Z"), message: "event", peerId: { channelId: "100" } }]
    });
    const adapter = new TelegramClientAdapter(client as unknown as GramJsLikeClient);

    await adapter.searchMessages({
      query: "коучинг",
      folder_ref: folderRef,
      folder_chat_limit: 3,
      limit: 10,
      from_date: "2026-05-08",
      to_date: "2026-05-15"
    });

    expect(client.invoke.mock.calls[0]![0]).toBeInstanceOf(Api.messages.GetDialogFilters);
    expect(client.getEntity).toHaveBeenCalledWith(folderPeer);
    expect(client.getMessages).toHaveBeenCalledWith(entity, {
      limit: 10,
      search: "коучинг",
      offsetDate: toUnixSeconds("2026-05-15", "end"),
      waitTime: 0
    });
    await expect(
      adapter.searchMessages({
        query: "коучинг",
        folder_ref: folderRef,
        folder_chat_limit: 3,
        limit: 10,
        from_date: "2026-05-09",
        to_date: "2026-05-15"
      })
    ).resolves.toEqual({ messages: [] });
  });

  test("global search returns chat refs that keep access hashes for follow-up reads", async () => {
    const client = makeClient({});
    client.invoke.mockResolvedValueOnce({
      messages: [
        { id: 77, date: new Date("2026-05-10T10:00:00Z"), message: "hit", peerId: { channelId: "100" } }
      ],
      chats: [{ id: "100", accessHash: "200", title: "Private Channel" }],
      users: []
    });
    const adapter = new TelegramClientAdapter(client as unknown as GramJsLikeClient);

    const result = await adapter.searchMessages({ query: "hit", limit: 10 });

    expect(parsePeerRef(result.messages[0]!.chat_ref)).toMatchObject({
      id: "100",
      accessHash: "200",
      title: "Private Channel",
      type: "channel"
    });
  });

  test("global search fails when Telegram omits entities needed for follow-up refs", async () => {
    const client = makeClient({});
    client.invoke.mockResolvedValueOnce({
      messages: [
        { id: 78, date: new Date("2026-05-10T10:00:00Z"), message: "hit", peerId: { channelId: "100" } }
      ],
      chats: [],
      users: []
    });
    const adapter = new TelegramClientAdapter(client as unknown as GramJsLikeClient);

    await expect(adapter.searchMessages({ query: "hit", limit: 10 })).rejects.toMatchObject({
      code: "TELEGRAM_ERROR"
    });
  });

  test("filters global message search by the full requested date window", async () => {
    const client = makeClient({});
    client.invoke.mockResolvedValueOnce({
      messages: [
        { id: 75, date: new Date("2026-05-07T10:00:00Z"), message: "too old", peerId: { channelId: "100" } },
        { id: 76, date: new Date("2026-05-15T23:59:59Z"), message: "inside final day", peerId: { channelId: "100" } },
        { id: 77, date: new Date("2026-05-16T00:00:00Z"), message: "too new", peerId: { channelId: "100" } }
      ],
      chats: [{ id: "100", accessHash: "200", title: "Private Channel" }],
      users: []
    });
    const adapter = new TelegramClientAdapter(client as unknown as GramJsLikeClient);

    const result = await adapter.searchMessages({
      query: "hit",
      limit: 10,
      from_date: "2026-05-08",
      to_date: "2026-05-15"
    });

    expect(result.messages.map((message) => message.message_id)).toEqual([76]);
    const request = client.invoke.mock.calls[0]![0] as { minDate?: number; maxDate?: number };
    expect(request.minDate).toBe(toUnixSeconds("2026-05-08"));
    expect(request.maxDate).toBe(toUnixSeconds("2026-05-15", "end"));
  });

  test("reads recent messages by date window for a chat", async () => {
    const chatRef = chatRefFor({ id: "1", type: "group", title: "Team" });
    const entity = { id: "1", title: "Team" };
    const client = makeClient({
      entity,
      messages: [
        { id: 11, date: new Date("2026-05-10T10:00:00Z"), message: "inside" },
        { id: 10, date: new Date("2026-05-01T10:00:00Z"), message: "outside" }
      ]
    });
    const adapter = new TelegramClientAdapter(client as unknown as GramJsLikeClient);

    const result = await adapter.getRecentMessages({
      chat_ref: chatRef,
      limit: 20,
      from_date: "2026-05-08",
      to_date: "2026-05-15"
    });

    expect(result.messages.map((message) => message.message_id)).toEqual([11]);
    expect(result.page).toMatchObject({ order: "newer_to_older" });
    expect(client.getMessages).toHaveBeenCalledWith(entity, {
      limit: 20,
      offsetDate: toUnixSeconds("2026-05-15", "end"),
      waitTime: 0
    });
  });

  test("returns paginated chat search cursor and accepts batch search with dedupe", async () => {
    const chatRef = chatRefFor({ id: "1", type: "group", title: "Team" });
    const client = makeClient({
      entity: { id: "1", title: "Team" }
    });
    client.getMessages
      .mockResolvedValueOnce([{ id: 50, date: new Date("2026-05-10T10:00:00Z"), message: "page" }])
      .mockResolvedValueOnce([{ id: 42, date: new Date("2026-05-10T10:00:00Z"), message: "same" }])
      .mockResolvedValueOnce([{ id: 42, date: new Date("2026-05-10T10:00:00Z"), message: "same" }]);
    const adapter = new TelegramClientAdapter(client as unknown as GramJsLikeClient);

    const page = await adapter.searchMessagesPage({ query: "event", chat_ref: chatRef, limit: 1 });
    expect(page.messages.map((message) => message.message_id)).toEqual([50]);
    expect(page.page.next_cursor).toEqual(expect.any(String));

    const batch = await adapter.searchMessagesBatch({
      queries: ["event", "webinar"],
      chat_ref: chatRef,
      limit: 5
    });
    expect(batch.results).toHaveLength(2);
    expect(batch.messages.map((message) => message.message_id)).toEqual([42]);
  });

  test("searches media with Telegram message filters", async () => {
    const chatRef = chatRefFor({ id: "1", type: "group", title: "Team" });
    const entity = { id: "1", title: "Team" };
    const client = makeClient({
      entity,
      messages: [{ id: 9, date: new Date("2026-05-10T10:00:00Z"), message: "https://example.com" }]
    });
    const adapter = new TelegramClientAdapter(client as unknown as GramJsLikeClient);

    await expect(adapter.searchMedia({ media_type: "links", query: "", chat_ref: chatRef, limit: 10 })).resolves.toMatchObject({
      messages: [{ message_id: 9 }]
    });
    expect(client.getMessages).toHaveBeenCalledWith(entity, expect.objectContaining({
      filter: expect.any(Api.InputMessagesFilterUrl),
      limit: 10
    }));
  });

  test("reads replies, discussion, search counters, and participants", async () => {
    const chatRef = chatRefFor({ id: "100", type: "channel", title: "Channel" });
    const entity = { id: "100", accessHash: "200", title: "Channel" };
    const client = makeClient({ entity });
    client.invoke
      .mockResolvedValueOnce({
        messages: [{ id: 13, date: new Date("2026-05-10T10:00:00Z"), message: "reply" }],
        chats: [],
        users: []
      })
      .mockResolvedValueOnce({
        messages: [{ id: 14, date: new Date("2026-05-10T10:00:00Z"), message: "discussion" }],
        chats: [],
        users: []
      })
      .mockResolvedValueOnce([
        { filter: new Api.InputMessagesFilterUrl(), count: 3 }
      ]);
    client.getParticipants.mockResolvedValueOnce([
      { id: "7", username: "alice", firstName: "Alice", bot: false }
    ]);
    const adapter = new TelegramClientAdapter(client as unknown as GramJsLikeClient);

    await expect(adapter.getThread({ chat_ref: chatRef, message_id: 12, limit: 10 })).resolves.toMatchObject({
      messages: [{ message_id: 13 }]
    });
    expect(client.invoke.mock.calls[0]![0]).toBeInstanceOf(Api.messages.GetReplies);

    await expect(adapter.getDiscussion({ chat_ref: chatRef, message_id: 12 })).resolves.toMatchObject({
      messages: [{ message_id: 14 }]
    });
    expect(client.invoke.mock.calls[1]![0]).toBeInstanceOf(Api.messages.GetDiscussionMessage);

    await expect(adapter.getSearchCounters({ chat_ref: chatRef, media_types: ["links"] })).resolves.toEqual({
      counters: [{ media_type: "links", count: 3 }]
    });
    expect(client.invoke.mock.calls[2]![0]).toBeInstanceOf(Api.messages.GetSearchCounters);

    await expect(adapter.getChatParticipants({ chat_ref: chatRef, filter: "recent", limit: 10 })).resolves.toMatchObject({
      participants: [{ id: "7", title: "Alice", username: "alice" }]
    });
    expect(client.getParticipants).toHaveBeenCalledWith(entity, {
      filter: undefined,
      limit: 10,
      search: undefined
    });
  });

  test("builds context around a target message", async () => {
    const chatRef = chatRefFor({ id: "1", type: "group", title: "Team" });
    const client = makeClient({
      entity: { id: "1", title: "Team" },
      messages: [{ id: 42, date: new Date("2026-05-01T10:00:00Z"), message: "target" }]
    });
    client.getMessages
      .mockResolvedValueOnce([{ id: 42, date: new Date("2026-05-01T10:00:00Z"), message: "target" }])
      .mockResolvedValueOnce([{ id: 41, date: new Date("2026-05-01T09:59:00Z"), message: "before" }])
      .mockResolvedValueOnce([{ id: 43, date: new Date("2026-05-01T10:01:00Z"), message: "after" }]);
    const adapter = new TelegramClientAdapter(client as unknown as GramJsLikeClient);

    const result = await adapter.getMessageContext({ chat_ref: chatRef, message_id: 42, before: 1, after: 1 });

    expect(result.target.message_id).toBe(42);
    expect(result.before.map((message) => message.message_id)).toEqual([41]);
    expect(result.after.map((message) => message.message_id)).toEqual([43]);
  });
});

function makeClient(data: {
  dialogs?: unknown[];
  dialogFilters?: unknown[];
  entity?: unknown;
  messages?: unknown[];
}): MockGramJsLikeClient {
  return {
    getDialogs: vi.fn().mockResolvedValue(data.dialogs ?? []),
    getEntity: vi.fn().mockResolvedValue(data.entity ?? data.dialogs?.[0]),
    getMessages: vi.fn().mockResolvedValue(data.messages ?? []),
    getParticipants: vi.fn().mockResolvedValue([]),
    invoke: vi.fn().mockResolvedValue({
      filters: data.dialogFilters ?? [],
      messages: data.messages ?? [],
      chats: [],
      users: []
    })
  };
}

function chatRefFor(input: { id: string; type: "channel" | "group" | "user"; title: string }): string {
  return JSON.stringify({ version: 1, id: input.id, type: input.type, title: input.title });
}

function folderRefFor(input: { id: number; title: string }): string {
  return JSON.stringify({ version: 1, id: input.id, title: input.title });
}

function toUnixSeconds(value: string, boundary: "start" | "end" = "start"): number {
  const date = new Date(value);
  if (boundary === "end" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return Math.floor((date.getTime() + 24 * 60 * 60 * 1000 - 1) / 1000);
  }
  return Math.floor(date.getTime() / 1000);
}

type MockGramJsLikeClient = {
  [K in keyof GramJsLikeClient]: ReturnType<typeof vi.fn>;
};
