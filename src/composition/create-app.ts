import type { AppConfig } from "../config/config.js";
import { AppError, normalizeTelegramError } from "../domain/errors.js";
import { FileSessionStore, type SessionStore } from "../infra/file-session-store.js";
import { createGramJsClient, type AuthenticatedGramJsLikeClient } from "../infra/telegram-client.js";
import { TelegramClientAdapter } from "../infra/telegram-client-adapter.js";
import type { TelegramQueries } from "../application/telegram-queries.js";

export interface BuildTelegramQueriesDeps {
  sessionStore?: SessionStore;
  createClient?: (session: string, config: AppConfig) => AuthenticatedGramJsLikeClient;
}

export function createLazyTelegramQueries(
  config: AppConfig,
  deps: BuildTelegramQueriesDeps = {}
): TelegramQueries {
  let queriesPromise: Promise<TelegramQueries> | undefined;
  const getQueries = (): Promise<TelegramQueries> => {
    queriesPromise ??= buildTelegramQueries(config, deps);
    return queriesPromise;
  };

  return {
    listFolders: async (input) => (await getQueries()).listFolders(input),
    resolveFolder: async (input) => (await getQueries()).resolveFolder(input),
    listChats: async (input) => (await getQueries()).listChats(input),
    searchChats: async (input) => (await getQueries()).searchChats(input),
    resolveChat: async (input) => (await getQueries()).resolveChat(input),
    getChat: async (input) => (await getQueries()).getChat(input),
    searchMessages: async (input) => (await getQueries()).searchMessages(input),
    getRecentMessages: async (input) => (await getQueries()).getRecentMessages(input),
    searchMessagesPage: async (input) => (await getQueries()).searchMessagesPage(input),
    searchMessagesBatch: async (input) => (await getQueries()).searchMessagesBatch(input),
    searchMedia: async (input) => (await getQueries()).searchMedia(input),
    getMessages: async (input) => (await getQueries()).getMessages(input),
    getMessage: async (input) => (await getQueries()).getMessage(input),
    getMessageContext: async (input) => (await getQueries()).getMessageContext(input),
    getThread: async (input) => (await getQueries()).getThread(input),
    getDiscussion: async (input) => (await getQueries()).getDiscussion(input),
    getSearchCounters: async (input) => (await getQueries()).getSearchCounters(input),
    getChatParticipants: async (input) => (await getQueries()).getChatParticipants(input)
  };
}

export async function buildTelegramQueries(
  config: AppConfig,
  deps: BuildTelegramQueriesDeps = {}
): Promise<TelegramQueries> {
  const sessionStore = deps.sessionStore ?? new FileSessionStore(config.sessionPath);
  const session = await loadSession(sessionStore);
  const createClient = deps.createClient ?? createGramJsClient;
  const client = createClient(session, config);

  try {
    await client.connect();
    if (!(await client.checkAuthorization())) {
      throw new AppError("AUTH_REQUIRED", "Telegram session is not authorized", {
        publicMessage: "Telegram authorization is required"
      });
    }
  } catch (error) {
    throw normalizeKnownError(error);
  }

  return new TelegramClientAdapter(client);
}

async function loadSession(sessionStore: SessionStore): Promise<string> {
  try {
    return await sessionStore.load();
  } catch (error) {
    throw normalizeKnownError(error);
  }
}

function normalizeKnownError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }

  if (isRecord(error) && error.code === "AUTH_REQUIRED") {
    return new AppError("AUTH_REQUIRED", "Telegram session is missing or invalid", {
      publicMessage: "Telegram authorization is required",
      cause: error
    });
  }

  return normalizeTelegramError(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
