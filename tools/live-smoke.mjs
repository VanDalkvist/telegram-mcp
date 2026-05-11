import { loadConfigFromDotenv } from "../dist/config/config.js";
import { buildTelegramRuntime } from "../dist/composition/create-app.js";
import { createToolHandlers } from "../dist/interface/mcp-tools.js";

const today = new Date();

function yyyyMmDd(date) {
  return date.toISOString().slice(0, 10);
}

function daysAgo(days) {
  const date = new Date(today);
  date.setUTCDate(date.getUTCDate() - days);
  return yyyyMmDd(date);
}

function errorCode(error) {
  return error?.code ?? error?.structuredContent?.error?.code ?? error?.name ?? "UNKNOWN";
}

async function runScenario(name, fn, options = {}) {
  try {
    const result = await fn();
    console.log(JSON.stringify({ scenario: name, ok: true, ...result }));
    return result;
  } catch (error) {
    const payload = { scenario: name, ok: false, code: errorCode(error) };
    if (options.optional === true) {
      payload.optional = true;
      console.log(JSON.stringify(payload));
      return undefined;
    }
    console.log(JSON.stringify(payload));
    throw error;
  }
}

const runtime = await buildTelegramRuntime(loadConfigFromDotenv());

try {
  const tools = createToolHandlers(runtime.queries);
  const coverage = new Map();

  async function runTool(toolName, scenario, fn, options = {}) {
    if (coverage.get(toolName) !== "ok") {
      coverage.set(toolName, "attempted");
    }
    const result = await runScenario(scenario, fn, options);
    if (result !== undefined) {
      coverage.set(toolName, "ok");
    } else if (options.optional === true && coverage.get(toolName) !== "ok") {
      coverage.set(toolName, "optional_failed");
    }
    return result;
  }

  const foldersResult = await runTool("telegram_list_folders", "list_folders", async () => {
    const result = await tools.telegram_list_folders({});
    return { folders_count: result.folders.length };
  });

  let firstFolderRef;
  if ((foldersResult?.folders_count ?? 0) > 0) {
    const folders = await tools.telegram_list_folders({});
    firstFolderRef = folders.folders[0].folder_ref;

    await runTool(
      "telegram_resolve_folder",
      "resolve_folder_first_folder",
      async () => {
        const result = await tools.telegram_resolve_folder({ ref: firstFolderRef });
        return { has_folder: Boolean(result.folder?.folder_ref) };
      },
      { optional: true }
    );

    await runTool(
      "telegram_list_folder_chats",
      "list_folder_chats_first_folder",
      async () => {
        const result = await tools.telegram_list_folder_chats({ folder_ref: firstFolderRef, limit: 3 });
        return { chats_count: result.chats.length };
      },
      { optional: true }
    );
  }

  const chatsResult = await runTool("telegram_list_chats", "list_chats", async () => {
    const result = await tools.telegram_list_chats({ limit: 5, type: "any" });
    return { chats_count: result.chats.length, has_first_chat: result.chats.length > 0 };
  });

  await runTool(
    "telegram_search_chats",
    "search_chats_common_query",
    async () => {
      const result = await tools.telegram_search_chats({ query: "a", limit: 3, type: "any" });
      return { chats_count: result.chats.length };
    },
    { optional: true }
  );

  let firstChatRef;
  if (chatsResult?.has_first_chat === true) {
    const chats = await tools.telegram_list_chats({ limit: 1, type: "any" });
    firstChatRef = chats.chats[0].chat_ref;
  }

  if (firstChatRef !== undefined) {
    await runTool("telegram_resolve_chat", "resolve_chat_first_chat", async () => {
      const result = await tools.telegram_resolve_chat({ ref: firstChatRef });
      return { has_chat: Boolean(result.chat?.chat_ref) };
    });

    await runTool("telegram_get_chat", "get_chat_first_chat", async () => {
      const result = await tools.telegram_get_chat({ chat_ref: firstChatRef });
      return { has_chat: Boolean(result.chat?.chat_ref) };
    });

    const messagesWindow = { from_date: "2000-01-01", to_date: yyyyMmDd(today) };

    const recent = await runTool("telegram_get_recent_messages", "get_recent_messages_first_chat", async () => {
      const result = await tools.telegram_get_recent_messages({
        chat_ref: firstChatRef,
        limit: 3,
        ...messagesWindow
      });
      return { messages_count: result.messages.length, page_order: result.page.order };
    });

    await runTool("telegram_get_messages", "get_messages_first_chat", async () => {
      const result = await tools.telegram_get_messages({ chat_ref: firstChatRef, limit: 3 });
      return { messages_count: result.messages.length, page_order: result.page.order };
    });

    if ((recent?.messages_count ?? 0) > 0) {
      const recentFull = await tools.telegram_get_recent_messages({
        chat_ref: firstChatRef,
        limit: 1,
        ...messagesWindow
      });
      const message = recentFull.messages[0];

      await runTool("telegram_get_message", "get_message_recent_message", async () => {
        const result = await tools.telegram_get_message({
          chat_ref: message.chat_ref,
          message_id: message.message_id
        });
        return { has_message: Boolean(result.message) };
      });

      await runTool("telegram_get_message_context", "get_message_context_recent_message", async () => {
        const result = await tools.telegram_get_message_context({
          chat_ref: message.chat_ref,
          message_id: message.message_id,
          before: 1,
          after: 1
        });
        return {
          has_target: Boolean(result.target),
          before_count: result.before.length,
          after_count: result.after.length
        };
      });

      await runTool(
        "telegram_get_thread",
        "get_thread_recent_message",
        async () => {
          const result = await tools.telegram_get_thread({
            chat_ref: message.chat_ref,
            message_id: message.message_id,
            limit: 3
          });
          return { messages_count: result.messages.length, page_order: result.page.order };
        },
        { optional: true }
      );

      await runTool(
        "telegram_get_discussion",
        "get_discussion_recent_message",
        async () => {
          const result = await tools.telegram_get_discussion({
            chat_ref: message.chat_ref,
            message_id: message.message_id
          });
          return { messages_count: result.messages.length };
        },
        { optional: true }
      );
    }

    await runTool(
      "telegram_search_messages",
      "search_messages_first_chat_common_query",
      async () => {
        const result = await tools.telegram_search_messages({
          chat_ref: firstChatRef,
          query: "a",
          limit: 3,
          ...messagesWindow
        });
        return { messages_count: result.messages.length };
      },
      { optional: true }
    );

    await runTool(
      "telegram_search_messages_page",
      "search_messages_page_first_chat_common_query",
      async () => {
        const result = await tools.telegram_search_messages_page({
          chat_ref: firstChatRef,
          query: "a",
          limit: 3,
          ...messagesWindow
        });
        return {
          messages_count: result.messages.length,
          page_order: result.page.order,
          has_next_cursor: Boolean(result.page.next_cursor)
        };
      },
      { optional: true }
    );

    await runTool(
      "telegram_search_messages_batch",
      "search_messages_batch_first_chat_common_query",
      async () => {
        const result = await tools.telegram_search_messages_batch({
          chat_ref: firstChatRef,
          queries: ["a"],
          limit: 3,
          ...messagesWindow
        });
        return { result_sets_count: result.results.length, messages_count: result.messages.length };
      },
      { optional: true }
    );

    await runTool(
      "telegram_get_search_counters",
      "get_search_counters_first_chat",
      async () => {
        const result = await tools.telegram_get_search_counters({
          chat_ref: firstChatRef,
          media_types: ["links", "photos", "videos", "documents"]
        });
        return { counters_count: result.counters.length };
      },
      { optional: true }
    );

    await runTool(
      "telegram_get_chat_participants",
      "get_chat_participants_first_chat",
      async () => {
        const groups = await tools.telegram_list_chats({ limit: 10, type: "group" });
        const fallbackChats = await tools.telegram_list_chats({ limit: 10, type: "any" });
        const candidateRefs = [...groups.chats, ...fallbackChats.chats].map((chat) => chat.chat_ref);
        let lastError;

        for (const [index, chatRef] of candidateRefs.entries()) {
          try {
            const result = await tools.telegram_get_chat_participants({
              chat_ref: chatRef,
              filter: "recent",
              limit: 3
            });
            return { participants_count: result.participants.length, attempts_count: index + 1 };
          } catch (error) {
            lastError = error;
          }
        }

        throw lastError ?? new Error("No chat candidates for participants smoke");
      },
      { optional: true }
    );
  }

  await runTool(
    "telegram_search_messages",
    "global_search_common_query",
    async () => {
      const result = await tools.telegram_search_messages({
        query: "a",
        limit: 3,
        from_date: daysAgo(3650),
        to_date: yyyyMmDd(today)
      });
      return { messages_count: result.messages.length };
    },
    { optional: true }
  );

  await runTool(
    "telegram_search_media",
    "global_search_media_links",
    async () => {
      const result = await tools.telegram_search_media({
        media_type: "links",
        limit: 3,
        from_date: daysAgo(3650),
        to_date: yyyyMmDd(today)
      });
      return { messages_count: result.messages.length };
    },
    { optional: true }
  );

  const expectedTools = [
    "telegram_list_folders",
    "telegram_resolve_folder",
    "telegram_list_chats",
    "telegram_list_folder_chats",
    "telegram_search_chats",
    "telegram_resolve_chat",
    "telegram_get_chat",
    "telegram_search_messages",
    "telegram_get_recent_messages",
    "telegram_search_messages_page",
    "telegram_search_messages_batch",
    "telegram_search_media",
    "telegram_get_messages",
    "telegram_get_message",
    "telegram_get_message_context",
    "telegram_get_thread",
    "telegram_get_discussion",
    "telegram_get_search_counters",
    "telegram_get_chat_participants"
  ];
  const missedTools = expectedTools.filter((toolName) => !coverage.has(toolName));
  console.log(
    JSON.stringify({
      scenario: "tool_coverage_summary",
      ok: missedTools.length === 0,
      tools_total: expectedTools.length,
      tools_attempted: expectedTools.length - missedTools.length,
      tools_ok: [...coverage.values()].filter((status) => status === "ok").length,
      tools_optional_failed: [...coverage.values()].filter((status) => status === "optional_failed").length,
      tools_missed: missedTools.length
    })
  );
  if (missedTools.length > 0) {
    process.exitCode = 1;
  }
} finally {
  await runtime.dispose();
}
