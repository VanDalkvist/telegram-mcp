import bigInt, { type BigInteger } from "big-integer";
import { strictIsoDateTimestampMs, type DateWindowBoundary } from "../domain/date-window.js";
import { AppError, normalizeTelegramError } from "../domain/errors.js";

export function normalizeKnownError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }

  return normalizeTelegramError(error);
}

export function stringifyId(value: unknown): string {
  const id = stringifyOptionalId(value);
  if (id === undefined) {
    throw new AppError("TELEGRAM_ERROR", "Telegram entity is missing id", {
      publicMessage: "Telegram returned an unsupported chat"
    });
  }

  return id;
}

export function stringifyOptionalId(value: unknown): string | undefined {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  if (typeof value === "number" || typeof value === "bigint") {
    return value.toString();
  }
  if (isRecord(value) && typeof value.toString === "function") {
    const output = value.toString();
    return output === "[object Object]" ? undefined : output;
  }
  return undefined;
}

export function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function readArrayLength(value: unknown): number | undefined {
  return Array.isArray(value) ? value.length : undefined;
}

export function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function readTextWithEntities(value: unknown): string | undefined {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  const record = asRecord(value);
  return readString(record.text);
}

export function normalizeDate(value: unknown): string {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throwInvalidDate();
    }
    return value.toISOString();
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throwInvalidDate();
    }
    const date = new Date(value * 1000);
    if (Number.isNaN(date.getTime())) {
      throwInvalidDate();
    }
    return date.toISOString();
  }
  if (typeof value === "string") {
    const timestampMs = strictIsoDateTimestampMs(value);
    if (timestampMs === undefined) {
      throwInvalidDate();
    }
    return new Date(timestampMs).toISOString();
  }
  throwInvalidDate();
}

export function readReplyToId(value: unknown): number | undefined {
  const record = asRecord(value);
  return readNumber(record.replyToMsgId ?? record.reply_to_msg_id);
}

export function toUnixSeconds(value: string, boundary: DateWindowBoundary = "start"): number {
  return Math.floor(toDateWindowTimestampMs(value, boundary) / 1000);
}

export function toDateWindowTimestampMs(value: string, boundary: DateWindowBoundary = "start"): number {
  const timestampMs = strictIsoDateTimestampMs(value, boundary);
  if (timestampMs === undefined) {
    throwInvalidDate();
  }
  return timestampMs;
}

export function toBigInteger(value: string): BigInteger {
  return bigInt(value);
}

export function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function throwInvalidDate(): never {
  throw new AppError("TELEGRAM_ERROR", "Telegram message is missing a valid date", {
    publicMessage: "Telegram returned an unsupported message"
  });
}
