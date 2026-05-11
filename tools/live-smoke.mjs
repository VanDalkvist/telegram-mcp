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

  const foldersResult = await runScenario("list_folders", async () => {
    const result = await tools.telegram_list_folders({});
    return { folders_count: result.folders.length };
  });

  if ((foldersResult?.folders_count ?? 0) > 0) {
    await runScenario(
      "list_folder_chats_first_folder",
      async () => {
        const folders = await tools.telegram_list_folders({});
        const result = await tools.telegram_list_folder_chats({ folder_ref: folders.folders[0].folder_ref, limit: 3 });
        return { chats_count: result.chats.length };
      },
      { optional: true }
    );
  }

  const chatsResult = await runScenario("list_chats", async () => {
    const result = await tools.telegram_list_chats({ limit: 5, type: "any" });
    return { chats_count: result.chats.length, has_first_chat: result.chats.length > 0 };
  });

  let firstChatRef;
  if (chatsResult?.has_first_chat === true) {
    const chats = await tools.telegram_list_chats({ limit: 1, type: "any" });
    firstChatRef = chats.chats[0].chat_ref;
  }

  if (firstChatRef !== undefined) {
    await runScenario("get_chat_first_chat", async () => {
      const result = await tools.telegram_get_chat({ chat_ref: firstChatRef });
      return { has_chat: Boolean(result.chat?.chat_ref) };
    });

    const recent = await runScenario("get_recent_messages_first_chat", async () => {
      const result = await tools.telegram_get_recent_messages({
        chat_ref: firstChatRef,
        limit: 3,
        from_date: "2000-01-01",
        to_date: yyyyMmDd(today)
      });
      return { messages_count: result.messages.length, page_order: result.page.order };
    });

    if ((recent?.messages_count ?? 0) > 0) {
      const recentFull = await tools.telegram_get_recent_messages({
        chat_ref: firstChatRef,
        limit: 1,
        from_date: "2000-01-01",
        to_date: yyyyMmDd(today)
      });
      await runScenario("get_message_context_recent_message", async () => {
        const message = recentFull.messages[0];
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
    }

    await runScenario(
      "search_messages_first_chat_common_query",
      async () => {
        const result = await tools.telegram_search_messages({
          chat_ref: firstChatRef,
          query: "a",
          limit: 3,
          from_date: "2000-01-01",
          to_date: yyyyMmDd(today)
        });
        return { messages_count: result.messages.length };
      },
      { optional: true }
    );
  }

  await runScenario(
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

  await runScenario(
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
} finally {
  await runtime.dispose();
}
