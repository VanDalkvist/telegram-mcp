import bigInt, { type BigInteger } from "big-integer";
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
    return value.toISOString();
  }
  if (typeof value === "number") {
    return new Date(value * 1000).toISOString();
  }
  if (typeof value === "string" && !Number.isNaN(Date.parse(value))) {
    return new Date(value).toISOString();
  }
  return new Date(0).toISOString();
}

export function readReplyToId(value: unknown): number | undefined {
  const record = asRecord(value);
  return readNumber(record.replyToMsgId ?? record.reply_to_msg_id);
}

export function toUnixSeconds(value: string): number {
  return Math.floor(new Date(value).getTime() / 1000);
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
