import { z } from "zod";
import { isStrictIsoDateOnlyString, strictIsoDateTimestampMs } from "../domain/date-window.js";

const typeSchema = z.enum(["any", "channel", "group", "user"]).default("any");
const mediaTypeSchema = z.enum([
  "links",
  "photos",
  "videos",
  "photo_video",
  "documents",
  "gifs",
  "voice",
  "music",
  "round_voice",
  "round_video",
  "mentions",
  "geo",
  "contacts",
  "pinned"
]);
const participantFilterSchema = z.enum(["recent", "admins", "bots"]).default("recent");
const positiveInt = z.number().int().positive();
const chatRef = z.string().trim().min(1);
const folderRef = z.string().trim().min(1);
const isoDateString = z.string().refine(isStrictIsoDateOnlyString, {
  message: "Expected date in YYYY-MM-DD format"
});
const folderChatLimit = z.number().int().positive().max(50).default(5);
const messageSearchLimit = z.number().int().positive().max(50).default(20);
const optionalScopeRefinement = {
  message: "chat_ref and folder_ref cannot be used together",
  path: ["folder_ref"]
};
const dateRangeRefinement = {
  message: "from_date must be earlier than or equal to to_date",
  path: ["from_date"]
};

function hasValidDateRange(value: { from_date?: string | undefined; to_date?: string | undefined }): boolean {
  if (value.from_date === undefined || value.to_date === undefined) {
    return true;
  }
  const fromTime = strictIsoDateTimestampMs(value.from_date, "start");
  const toTime = strictIsoDateTimestampMs(value.to_date, "end");
  return fromTime !== undefined && toTime !== undefined && fromTime <= toTime;
}

export const toolSchemas = {
  telegram_list_folders: z.object({}),
  telegram_resolve_folder: z.object({
    ref: z.string().trim().min(1)
  }),
  telegram_list_chats: z.object({
    limit: z.number().int().positive().max(100).default(50),
    type: typeSchema,
    folder_ref: folderRef.optional()
  }),
  telegram_list_folder_chats: z.object({
    folder_ref: folderRef,
    limit: z.number().int().positive().max(100).default(50),
    type: typeSchema
  }),
  telegram_search_chats: z.object({
    query: z.string().trim().min(1),
    type: typeSchema,
    limit: z.number().int().positive().max(50).default(20),
    folder_ref: folderRef.optional()
  }),
  telegram_resolve_chat: z.object({
    ref: z.string().trim().min(1)
  }),
  telegram_get_chat: z.object({
    chat_ref: chatRef
  }),
  telegram_search_messages: z.object({
    query: z.string().trim().min(1),
    chat_ref: chatRef.optional(),
    folder_ref: folderRef.optional(),
    folder_chat_limit: folderChatLimit,
    limit: messageSearchLimit,
    from_date: isoDateString.optional(),
    to_date: isoDateString.optional()
  })
    .refine((value) => value.chat_ref === undefined || value.folder_ref === undefined, optionalScopeRefinement)
    .refine(hasValidDateRange, dateRangeRefinement),
  telegram_get_recent_messages: z.object({
    chat_ref: chatRef.optional(),
    folder_ref: folderRef.optional(),
    folder_chat_limit: folderChatLimit,
    limit: messageSearchLimit,
    from_date: isoDateString,
    to_date: isoDateString
  })
    .refine((value) => (value.chat_ref === undefined) !== (value.folder_ref === undefined), {
      message: "Exactly one of chat_ref or folder_ref is required",
      path: ["chat_ref"]
    })
    .refine(hasValidDateRange, dateRangeRefinement),
  telegram_search_messages_page: z.object({
    query: z.string().trim().min(1),
    chat_ref: chatRef.optional(),
    folder_ref: folderRef.optional(),
    folder_chat_limit: folderChatLimit,
    limit: messageSearchLimit,
    from_date: isoDateString.optional(),
    to_date: isoDateString.optional(),
    cursor: z.string().trim().min(1).optional()
  })
    .refine((value) => value.chat_ref === undefined || value.folder_ref === undefined, optionalScopeRefinement)
    .refine(hasValidDateRange, dateRangeRefinement),
  telegram_search_messages_batch: z.object({
    queries: z.array(z.string().trim().min(1)).min(1).max(10),
    chat_ref: chatRef.optional(),
    folder_ref: folderRef.optional(),
    folder_chat_limit: folderChatLimit,
    limit: messageSearchLimit,
    from_date: isoDateString.optional(),
    to_date: isoDateString.optional()
  })
    .refine((value) => value.chat_ref === undefined || value.folder_ref === undefined, optionalScopeRefinement)
    .refine(hasValidDateRange, dateRangeRefinement),
  telegram_search_media: z.object({
    media_type: mediaTypeSchema,
    query: z.string().trim().default(""),
    chat_ref: chatRef.optional(),
    folder_ref: folderRef.optional(),
    folder_chat_limit: folderChatLimit,
    limit: messageSearchLimit,
    from_date: isoDateString.optional(),
    to_date: isoDateString.optional()
  })
    .refine((value) => value.chat_ref === undefined || value.folder_ref === undefined, optionalScopeRefinement)
    .refine(hasValidDateRange, dateRangeRefinement),
  telegram_get_messages: z.object({
    chat_ref: chatRef,
    limit: z.number().int().positive().max(100).default(50),
    before_message_id: positiveInt.optional(),
    after_message_id: positiveInt.optional()
  }),
  telegram_get_message: z.object({
    chat_ref: chatRef,
    message_id: positiveInt
  }),
  telegram_get_message_context: z.object({
    chat_ref: chatRef,
    message_id: positiveInt,
    before: z.number().int().min(0).max(50).default(10),
    after: z.number().int().min(0).max(50).default(10)
  }),
  telegram_get_thread: z.object({
    chat_ref: chatRef,
    message_id: positiveInt,
    limit: z.number().int().positive().max(100).default(50),
    before_message_id: positiveInt.optional()
  }),
  telegram_get_discussion: z.object({
    chat_ref: chatRef,
    message_id: positiveInt
  }),
  telegram_get_search_counters: z.object({
    chat_ref: chatRef,
    media_types: z.array(mediaTypeSchema).min(1).max(14).default(["links", "photos", "videos", "documents"])
  }),
  telegram_get_chat_participants: z.object({
    chat_ref: chatRef,
    filter: participantFilterSchema,
    limit: z.number().int().positive().max(100).default(50),
    search: z.string().trim().min(1).optional()
  })
} as const;

export type ToolName = keyof typeof toolSchemas;
export type ToolInput<TName extends ToolName> = z.infer<(typeof toolSchemas)[TName]>;
